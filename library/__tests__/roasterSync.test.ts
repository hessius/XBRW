import {readCatalogue} from "@/library/roasterCatalogue";
import {RoasterFeedError} from "@/library/roasterFeed";
import {SYNC_INTERVAL_MS, parseSubscriptions, serialiseSubscriptions} from "@/library/roasterSubscription";
import {selectedImportRoasters} from "@/library/roasterImport";
import {
    readSubscriptions, resetSyncLockForTests, setPaused, setPinned, subscribe, syncDue, syncSubscription,
    unsubscribe, updateSubscription
} from "@/library/roasterSync";
import {
    FEED_URL, brewable, feedBody, memoryLibrary, memorySettings, type CoffeeSpec
} from "@/test-utils/roasterFeed";

const mockConstructed = jest.fn();
jest.mock("@/library/XBloomRecipe", () => ({
    __esModule: true,
    XBloomRecipe: class {
        constructor(...args: unknown[]) { mockConstructed(...args); }
        fetchRecipeDetail() { return Promise.resolve(); }
        getRecipe() { return null; }
    }
}));
jest.mock("@/library/RecipeDatabase", () => ({
    __esModule: true,
    default: class {
        constructor() { throw new Error("a sync must not open the recipe table"); }
    }
}));

const HOUR = 60 * 60 * 1000;

function harness(initial: CoffeeSpec[]) {
    const settings = memorySettings();
    let current = feedBody(initial);
    let clock = 1_000_000_000_000;
    const fetchBody = jest.fn(async () => current);
    const deps = {settings, fetchBody, now: () => clock};
    return {
        settings, deps, fetchBody,
        setFeed: (next: CoffeeSpec[]) => {
            current = feedBody(next);
        },
        advance: (ms: number) => {
            clock += ms;
        },
        now: () => clock,
        sub: () => readSubscriptions(settings)[0],
        catalogue: () => readCatalogue(settings, FEED_URL)
    };
}

function subscribed(coffees: CoffeeSpec[]) {
    const h = harness(coffees);
    const {feed, body} = feedBody(coffees);
    subscribe(h.settings, FEED_URL, feed, body, h.now());
    return h;
}

beforeEach(() => {
    resetSyncLockForTests();
    mockConstructed.mockClear();
});

describe("subscribing", () => {
    it("records the roaster and caches its catalogue, and imports nothing", () => {
        const library = memoryLibrary();
        const h = subscribed([{id: "a"}, {id: "b", available: false}]);

        expect(h.sub()).toMatchObject({
            feed: FEED_URL, roaster: "Test Roaster", roasterUrl: "https://roaster.example", paused: false
        });
        expect(h.catalogue()?.feed.coffees.map((coffee) => coffee.id)).toEqual(["a", "b"]);
        expect(library.all()).toEqual([]);
        expect(h.settings.get("myShelves")).toBe("");
    });
});

describe("syncing", () => {
    it("does not reorder equal legacy Import choices when a feed syncs", async () => {
        const h = subscribed([{id: "a"}]);
        const {feed, body} = feedBody([{id: "b"}], "Second");
        const other = "https://second.example/feed";
        subscribe(h.settings, other, feed, body, h.now());
        updateSubscription(h.settings, FEED_URL, (s) => ({...s, pinnedAt: 1}));
        updateSubscription(h.settings, other, (s) => ({...s, pinnedAt: 1}));
        const before = selectedImportRoasters(readSubscriptions(h.settings));
        await syncSubscription(FEED_URL, h.deps, {force: true});
        expect(selectedImportRoasters(readSubscriptions(h.settings))).toEqual(before);
    });

    it("preserves a choice and pause changed while a sync request was in flight", async () => {
        const h = subscribed([{id: "a"}]);
        let finish!: (value: ReturnType<typeof feedBody>) => void;
        const fetchBody = () => new Promise<ReturnType<typeof feedBody>>((resolve) => {finish = resolve;});
        const syncing = syncSubscription(FEED_URL, {...h.deps, fetchBody}, {force: true});
        setPinned(h.settings, FEED_URL, true, 123);
        setPaused(h.settings, FEED_URL, true);
        finish(feedBody([{id: "a"}, {id: "b"}]));
        await syncing;
        expect(h.sub()).toMatchObject({pinnedAt: 123, paused: true});
        expect(selectedImportRoasters(readSubscriptions(h.settings))).toHaveLength(1);
    });

    it("refreshes the cached catalogue: new, sold out and removed coffees", async () => {
        const h = subscribed([{id: "a"}, {id: "b"}]);
        h.setFeed([{id: "a", available: false}, {id: "c"}]);

        const result = await syncSubscription(FEED_URL, h.deps, {force: true});

        expect(result.ok).toBe(true);
        const coffees = h.catalogue()!.feed.coffees;
        expect(coffees.map((coffee) => [coffee.id, coffee.available])).toEqual([["a", false], ["c", true]]);
    });

    it("never asks xBloom anything and never touches the library", async () => {
        const library = memoryLibrary([brewable("a-18g")]);
        const h = subscribed([{id: "a"}]);
        library.serve("a-18g", 60);

        await syncSubscription(FEED_URL, h.deps, {force: true});
        h.advance(SYNC_INTERVAL_MS);
        await syncDue(h.deps);

        expect(mockConstructed).not.toHaveBeenCalled();
        expect(library.fetched).toEqual([]);
        expect(library.find("a-18g")?.grindSize).toBe(50);
    });

    it("syncs on its own at most every 12 hours", async () => {
        const h = subscribed([{id: "a"}]);

        h.advance(SYNC_INTERVAL_MS - HOUR);
        expect(await syncDue(h.deps)).toEqual([]);
        expect(h.fetchBody).not.toHaveBeenCalled();

        h.advance(HOUR);
        expect(await syncDue(h.deps)).toHaveLength(1);
        expect(h.fetchBody).toHaveBeenCalledTimes(1);
    });

    it("records why a sync failed, keeps the old catalogue, and still waits before asking again", async () => {
        const h = subscribed([{id: "a"}]);
        h.fetchBody.mockRejectedValueOnce(new RoasterFeedError("unreadable", "bad"));
        h.advance(SYNC_INTERVAL_MS);

        expect(await syncSubscription(FEED_URL, h.deps)).toEqual({ok: false, reason: "unreadable"});
        expect(h.sub().lastError).toBe("unreadable");
        expect(h.catalogue()?.feed.coffees).toHaveLength(1);
        expect(await syncDue(h.deps)).toEqual([]);
    });

    it("does nothing while paused, until refreshed by hand or resumed", async () => {
        const h = subscribed([{id: "a"}]);
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

    it("refuses a second sync while one is running", async () => {
        const h = subscribed([{id: "a"}]);
        let release!: () => void;
        h.fetchBody.mockImplementationOnce(() => new Promise((resolve) => {
            release = () => resolve(feedBody([{id: "a"}]));
        }));
        const first = syncSubscription(FEED_URL, h.deps, {force: true});
        expect(await syncSubscription(FEED_URL, h.deps, {force: true}))
            .toEqual({ok: false, reason: "busy"});
        release();
        expect((await first).ok).toBe(true);
    });
});

describe("unsubscribing", () => {
    it("removes the subscription and its catalogue, and leaves the library alone", async () => {
        const library = memoryLibrary([brewable("a-18g")]);
        const h = subscribed([{id: "a"}]);

        unsubscribe(h.settings, FEED_URL);

        expect(readSubscriptions(h.settings)).toEqual([]);
        expect(h.catalogue()).toBeNull();
        expect(library.all()).toHaveLength(1);
        expect(await syncSubscription(FEED_URL, h.deps, {force: true}))
            .toEqual({ok: false, reason: "missing"});
    });
});

describe("stored subscriptions", () => {
    it("drops records a hostile backup could carry", () => {
        const stored = JSON.stringify([
            {feed: "http://roaster.example/feed", roaster: "R"},
            {feed: FEED_URL, roaster: ""},
            {feed: FEED_URL, roaster: "R", lastSync: "soon", lastError: "server said: buy now",
             roasterUrl: "javascript:alert(1)"},
            {feed: FEED_URL, roaster: "Duplicate"}
        ]);
        const parsed = parseSubscriptions(stored);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({roaster: "R", lastSync: 0, paused: false});
        expect(parsed[0].lastError).toBeUndefined();
        expect(parsed[0].roasterUrl).toBeUndefined();
        expect(parseSubscriptions(serialiseSubscriptions(parsed))).toEqual(parsed);
        expect(parseSubscriptions("{")).toEqual([]);
    });

    it("re-validates a cached catalogue every time it is read", () => {
        const h = subscribed([{id: "a"}]);
        h.settings.set("roasterCatalogue", JSON.stringify({
            "https://roaster.example/collections/coffee": {body: "{\"version\":2}", fetchedAt: 1}
        }));
        expect(h.catalogue()).toBeNull();
    });
});
