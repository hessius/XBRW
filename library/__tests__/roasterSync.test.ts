import {parseHidden} from "@/library/hiddenShelves";
import {RoasterFeedError, type RoasterFeed} from "@/library/roasterFeed";
import {
    SYNC_INTERVAL_MS, parseSubscriptions, serialiseSubscriptions, subscriptionCounts
} from "@/library/roasterSubscription";
import {
    readSubscriptions, renameSubscribedShelf, resetSyncLockForTests, setPaused, subscribe,
    subscriptionForShelf, syncDue, syncSubscription, unsubscribe
} from "@/library/roasterSync";
import {FEED_URL, brewable, feed, memoryLibrary, memorySettings, type CoffeeSpec} from "@/test-utils/roasterFeed";

const HOUR = 60 * 60 * 1000;

function harness(initial: CoffeeSpec[]) {
    const settings = memorySettings();
    const library = memoryLibrary();
    let current: RoasterFeed = feed(initial);
    let clock = 1_000_000_000_000;
    const fetchFeed = jest.fn(async () => current);
    const deps = {settings, shelf: library.deps, fetchFeed, now: () => clock};
    return {
        settings, library, deps, fetchFeed,
        setFeed: (next: CoffeeSpec[]) => {
            current = feed(next);
        },
        advance: (ms: number) => {
            clock += ms;
        },
        sub: () => readSubscriptions(settings)[0]
    };
}

async function subscribeAndSync(h: ReturnType<typeof harness>) {
    const first = feed([]); // only for the roaster's name and url
    subscribe(h.settings, FEED_URL, {...first}, "Test Roaster");
    return syncSubscription(FEED_URL, h.deps, {force: true});
}

beforeEach(() => resetSyncLockForTests());

describe("subscribing", () => {
    it("stores the subscription, imports the available coffees and marks the shelf", async () => {
        const h = harness([{id: "a"}, {id: "b"}, {id: "c", available: false}]);
        const result = await subscribeAndSync(h);

        expect(result.ok).toBe(true);
        expect(h.library.all().map((recipe) => recipe.shareId).sort()).toEqual(["a-18g", "b-18g"]);
        const sub = h.sub();
        expect(sub).toMatchObject({
            feed: FEED_URL, roaster: "Test Roaster", shelf: "Test Roaster",
            roasterUrl: "https://roaster.example", paused: false
        });
        expect(sub.lastSync).toBeGreaterThan(0);
        expect(sub.items.map((item) => item.shareId)).toEqual(["a-18g", "b-18g"]);
        expect(parseHidden(h.settings.get("myShelves"))).toEqual(["tag:test roaster"]);
        expect(subscriptionForShelf(readSubscriptions(h.settings), "test roaster")?.feed).toBe(FEED_URL);
    });
});

describe("keeping it updated", () => {
    it("syncs on its own at most every 12 hours", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        h.fetchFeed.mockClear();

        h.advance(SYNC_INTERVAL_MS - HOUR);
        expect(await syncDue(h.deps)).toEqual([]);
        expect(h.fetchFeed).not.toHaveBeenCalled();

        h.advance(HOUR);
        const results = await syncDue(h.deps);
        expect(results).toHaveLength(1);
        expect(h.fetchFeed).toHaveBeenCalledTimes(1);
    });

    it("adds a new coffee to the library and the shelf on a later sync", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        h.setFeed([{id: "a"}, {id: "new"}]);

        const result = await syncSubscription(FEED_URL, h.deps, {force: true});

        expect(result.ok && result.outcome.added).toBe(1);
        expect(h.library.find("new-18g")?.tags).toContain("Test Roaster");
        expect(h.library.fetched.filter((id) => id === "a-18g")).toHaveLength(1);
    });

    it("marks sold-out coffees, unmarks them when back, and never deletes a recipe", async () => {
        const h = harness([{id: "a"}, {id: "b"}]);
        await subscribeAndSync(h);

        h.setFeed([{id: "a"}, {id: "b", available: false}]);
        await syncSubscription(FEED_URL, h.deps, {force: true});
        expect(h.sub().soldOut).toEqual(["b-18g"]);
        expect(subscriptionCounts(h.sub())).toEqual({available: 1, soldOut: 1});

        h.setFeed([{id: "a"}]);
        await syncSubscription(FEED_URL, h.deps, {force: true});
        expect(h.sub().soldOut).toEqual(["b-18g"]);
        expect(h.library.all()).toHaveLength(2);

        h.setFeed([{id: "a"}, {id: "b"}]);
        await syncSubscription(FEED_URL, h.deps, {force: true});
        expect(h.sub().soldOut).toEqual([]);
        // Back in stock is the recipe it always was, not a second copy.
        expect(h.library.all()).toHaveLength(2);
    });

    it("does not bring back a coffee the user deleted", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        const library = memoryLibrary();
        const result = await syncSubscription(FEED_URL, {...h.deps, shelf: library.deps}, {force: true});
        expect(result.ok && result.outcome.added).toBe(0);
        expect(library.all()).toHaveLength(0);
    });

    it("leaves an edited recipe's content alone on every sync", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        const recipe = h.library.find("a-18g")!;
        recipe.dosage = 21;
        recipe.name = "Mine now";
        h.library.deps.save(recipe);

        await syncSubscription(FEED_URL, h.deps, {force: true});

        expect(h.library.find("a-18g")).toMatchObject({dosage: 21, name: "Mine now"});
    });

    it("records why a sync failed and still waits before asking again", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        h.fetchFeed.mockRejectedValueOnce(new RoasterFeedError("unreadable", "bad"));
        h.advance(SYNC_INTERVAL_MS);

        const result = await syncSubscription(FEED_URL, h.deps);

        expect(result).toEqual({ok: false, reason: "unreadable"});
        expect(h.sub().lastError).toBe("unreadable");
        expect(await syncDue(h.deps)).toEqual([]);
    });

    it("does nothing while paused, until refreshed by hand or resumed", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        setPaused(h.settings, FEED_URL, true);
        h.advance(SYNC_INTERVAL_MS * 2);

        expect(await syncDue(h.deps)).toEqual([]);
        expect(await syncSubscription(FEED_URL, h.deps, {force: true}))
            .toEqual({ok: false, reason: "paused"});
        expect((await syncSubscription(FEED_URL, h.deps, {force: true, ignorePause: true})).ok).toBe(true);

        setPaused(h.settings, FEED_URL, false);
        h.advance(SYNC_INTERVAL_MS);
        expect(await syncDue(h.deps)).toHaveLength(1);
    });
});

describe("ending and renaming", () => {
    it("unsubscribing stops syncing and keeps the shelf and recipes", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);

        unsubscribe(h.settings, FEED_URL);

        expect(readSubscriptions(h.settings)).toEqual([]);
        expect(h.library.find("a-18g")?.tags).toContain("Test Roaster");
        expect(parseHidden(h.settings.get("myShelves"))).toEqual(["tag:test roaster"]);
        expect(await syncSubscription(FEED_URL, h.deps, {force: true}))
            .toEqual({ok: false, reason: "missing"});
    });

    it("follows a renamed shelf", async () => {
        const h = harness([{id: "a"}]);
        await subscribeAndSync(h);
        renameSubscribedShelf(h.settings, "Test Roaster", "Morning beans");
        h.setFeed([{id: "a"}, {id: "b"}]);

        await syncSubscription(FEED_URL, h.deps, {force: true});

        expect(h.sub().shelf).toBe("Morning beans");
        expect(h.library.find("b-18g")?.tags).toContain("Morning beans");
    });
});

describe("stored subscriptions", () => {
    it("drops records a hostile backup could carry", () => {
        const stored = JSON.stringify([
            {feed: "http://roaster.example/feed", roaster: "R", shelf: "R"},
            {feed: FEED_URL, roaster: "", shelf: "R"},
            {feed: FEED_URL, roaster: "R", shelf: "R", lastSync: "soon", items: [{shareId: 4}, {shareId: "ok"}],
             lastError: "server said: buy now", roasterUrl: "javascript:alert(1)"},
            {feed: FEED_URL, roaster: "Duplicate", shelf: "R"}
        ]);
        const parsed = parseSubscriptions(stored);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({lastSync: 0, items: [{shareId: "ok"}], paused: false});
        expect(parsed[0].lastError).toBeUndefined();
        expect(parsed[0].roasterUrl).toBeUndefined();
        expect(parseSubscriptions(serialiseSubscriptions(parsed))).toEqual(parsed);
        expect(parseSubscriptions("{")).toEqual([]);
    });

    it("refuses a second sync while one is running", async () => {
        const h = harness([{id: "a"}]);
        subscribe(h.settings, FEED_URL, feed([]), "Test Roaster");
        let release!: () => void;
        h.fetchFeed.mockImplementationOnce(() => new Promise((resolve) => {
            release = () => resolve(feed([{id: "a"}]));
        }));
        const first = syncSubscription(FEED_URL, h.deps, {force: true});
        expect(await syncSubscription(FEED_URL, h.deps, {force: true}))
            .toEqual({ok: false, reason: "busy"});
        release();
        expect((await first).ok).toBe(true);
    });

    it("a library recipe never disappears because of a sync", async () => {
        const h = harness([{id: "a"}]);
        const mine = brewable("");
        mine.name = "Hand made";
        h.library.deps.save(mine);
        await subscribeAndSync(h);
        h.setFeed([]);
        await syncSubscription(FEED_URL, h.deps, {force: true});
        expect(h.library.all().map((recipe) => recipe.name).sort()).toEqual(["Coffee a - 18g", "Hand made"]);
    });
});
