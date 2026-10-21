import {
    afterListViewed, afterOpened, afterSync, alertCounts, alertSummary, backInStockMessage,
    bagWatchKey, coffeeBadge, coffeeKey, firstSight, parseAlerts, readAlerts, recordListViewed,
    recordOpened, setWatch, totalAlertSummary, withWatch, type FeedAlerts
} from "@/library/roasterAlerts";
import {parseRoasterFeed, type RoasterFeed} from "@/library/roasterFeed";
import {resetSyncLockForTests, subscribe, syncSubscription, unsubscribe} from "@/library/roasterSync";
import {NOT_IN_BACKUP} from "@/library/Settings";
import {FEED_URL, feed, feedBody, feedJson, memorySettings, type CoffeeSpec} from "@/test-utils/roasterFeed";

jest.mock("@/library/XBloomRecipe", () => ({
    __esModule: true,
    XBloomRecipe: class {
        constructor() { throw new Error("a sync must not ask xBloom for anything"); }
    }
}));

const ids = (list: readonly string[]) => [...list].sort();

/** A feed whose coffee `b` sells two bags, the 320 g one sold out unless said. */
function bagFeed(coffeeOnSale: boolean, bigBagOnSale: boolean): RoasterFeed {
    const parsed = JSON.parse(feedJson([{id: "a"}, {id: "b", available: coffeeOnSale}]));
    parsed.coffees[1].variants = [
        {id: 11, grams: 320, price: 53, currency: "AUD", available: bigBagOnSale},
        {grams: 160, price: 28, currency: "AUD", available: true}
    ];
    return parseRoasterFeed(JSON.stringify(parsed))!;
}

describe("NEW coffees", () => {
    it("treats the first look at a feed as seen, so nothing is NEW", () => {
        const first = afterSync(undefined, feed([{id: "a"}, {id: "b"}]));
        expect(ids(first.alerts.seen)).toEqual(["a", "b"]);
        expect(first.alerts.fresh).toEqual([]);
        expect(alertCounts(first.alerts)).toEqual({fresh: 0, back: 0});
    });

    it("flags coffees nobody has seen, once, and only those", () => {
        const start = firstSight(feed([{id: "a"}]));
        const once = afterSync(start, feed([{id: "a"}, {id: "b"}, {id: "c"}])).alerts;
        expect(once.fresh).toEqual(["b", "c"]);
        // A second sync does not flag them again or lose them.
        const twice = afterSync(once, feed([{id: "a"}, {id: "b"}, {id: "c"}])).alerts;
        expect(twice.fresh).toEqual(["b", "c"]);
        expect(coffeeBadge(twice, feed([{id: "b"}]).coffees[0])).toBe("new");
        expect(coffeeBadge(twice, feed([{id: "a"}]).coffees[0])).toBeUndefined();
    });

    it("drops a NEW coffee the roaster took off the list", () => {
        const start = firstSight(feed([{id: "a"}]));
        const added = afterSync(start, feed([{id: "a"}, {id: "b"}])).alerts;
        expect(afterSync(added, feed([{id: "a"}])).alerts.fresh).toEqual([]);
    });

    it("keeps the tag for the visit that shows it, and clears it on the next", () => {
        const coffees = feed([{id: "a"}, {id: "b"}]);
        const flagged = afterSync(firstSight(feed([{id: "a"}])), coffees).alerts;
        expect(alertCounts(flagged).fresh).toBe(1);

        const firstVisit = afterListViewed(flagged, coffees.coffees);
        expect(firstVisit.fresh).toEqual(["b"]);
        // Shown once: the tag stays, the dot no longer counts it.
        expect(alertCounts(firstVisit).fresh).toBe(0);

        const secondVisit = afterListViewed(firstVisit, coffees.coffees);
        expect(secondVisit.fresh).toEqual([]);
        expect(secondVisit.seen).toContain("b");
    });

    it("clears the tag when the coffee is opened", () => {
        const coffees = feed([{id: "a"}, {id: "b"}]);
        const flagged = afterSync(firstSight(feed([{id: "a"}])), coffees).alerts;
        const opened = afterOpened(flagged, coffees.coffees[1]);
        expect(opened.fresh).toEqual([]);
        expect(opened.seen).toContain("b");
        // And a later sync does not bring it back.
        expect(afterSync(opened, coffees).alerts.fresh).toEqual([]);
    });

    it("remembers a coffee with no id by its name, not its place", () => {
        const parsed = JSON.parse(feedJson([{id: "x"}]));
        delete parsed.coffees[0].id;
        const named = parseRoasterFeed(JSON.stringify(parsed))!;
        expect(coffeeKey(named.coffees[0])).toBe("name:Coffee x");
    });
});

describe("back in stock", () => {
    const soldOut = feed([{id: "a", available: false}, {id: "b"}]);
    const onSale = feed([{id: "a"}, {id: "b"}]);

    it("moves a watched coffee to back when a sync finds it on sale, once", () => {
        const watching = withWatch(firstSight(soldOut), "a", true);
        expect(afterSync(watching, soldOut).back).toEqual([]);

        const came = afterSync(watching, onSale);
        expect(came.back.map((coffee) => coffee.id)).toEqual(["a"]);
        expect(came.alerts.watch).toEqual([]);
        expect(came.alerts.back).toEqual(["a"]);
        expect(coffeeBadge(came.alerts, onSale.coffees[0])).toBe("back");

        // No longer watched, so the next sync announces nothing.
        expect(afterSync(came.alerts, onSale).back).toEqual([]);
    });

    it("keeps watching a coffee the roaster took off the list while it was sold out", () => {
        const watching = withWatch(firstSight(soldOut), "a", true);
        const gone = afterSync(watching, feed([{id: "b"}])).alerts;
        expect(gone.watch).toEqual(["a"]);
        expect(afterSync(gone, onSale).back.map((coffee) => coffee.id)).toEqual(["a"]);
    });

    it("is cleared by opening the coffee or turning the switch off", () => {
        const came = afterSync(withWatch(firstSight(soldOut), "a", true), onSale).alerts;
        expect(afterOpened(came, onSale.coffees[0]).back).toEqual([]);
        expect(withWatch(came, "a", false).back).toEqual([]);
    });

    it("watches one bag of a coffee that is on sale", () => {
        const before = bagFeed(true, false);
        const coffee = before.coffees[1];
        const key = bagWatchKey(coffee, "11");
        const watching = withWatch(firstSight(before), key, true);
        expect(afterSync(watching, before).back).toEqual([]);

        const after = afterSync(watching, bagFeed(true, true));
        expect(after.back.map((entry) => entry.id)).toEqual(["b"]);
        expect(coffeeBadge(after.alerts, coffee)).toBe("back");
        // The bag is only back when the coffee is on sale too.
        expect(afterSync(watching, bagFeed(false, true)).back).toEqual([]);
    });

    it("says it once, in the roaster's words", () => {
        expect(backInStockMessage("Test Roaster", [])).toBeNull();
        expect(backInStockMessage("Test Roaster", [onSale.coffees[0]]))
            .toBe("Coffee a is back at Test Roaster.");
        expect(backInStockMessage("Test Roaster", onSale.coffees))
            .toBe("2 coffees you asked about are back at Test Roaster.");
    });
});

describe("the dot", () => {
    it("counts unshown NEW coffees and coffees that came back, each once", () => {
        const alerts: FeedAlerts = {
            seen: ["a"], fresh: ["b", "c", "d"], shown: ["c"], watch: [],
            back: ["d", bagWatchKey(feed([{id: "e"}]).coffees[0], "11"), "e"]
        };
        expect(alertCounts(alerts)).toEqual({fresh: 1, back: 2});
        expect(alertSummary(alerts)).toEqual({count: 3, spoken: "1 new, 2 back in stock"});
        expect(alertSummary(undefined)).toEqual({count: 0});
    });

    it("adds up over every subscription", () => {
        const stored = JSON.stringify({
            "https://one.example/feed": {seen: [], fresh: ["a"], shown: [], watch: [], back: []},
            "https://two.example/feed": {seen: [], fresh: ["b"], shown: [], watch: [], back: ["c"]}
        });
        expect(totalAlertSummary(stored, ["https://one.example/feed", "https://two.example/feed?x=1"]))
            .toEqual({count: 3, spoken: "2 new, 1 back in stock"});
        expect(totalAlertSummary(stored, [])).toEqual({count: 0});
    });
});

describe("the stored alerts", () => {
    it("are validated on the way in", () => {
        expect(parseAlerts("")).toEqual({});
        expect(parseAlerts("{")).toEqual({});
        expect(parseAlerts("[]")).toEqual({});
        expect(parseAlerts(JSON.stringify({k: {seen: ["a", 3, "", "a"], fresh: "b"}, j: 1})))
            .toEqual({k: {seen: ["a"], fresh: [], shown: [], watch: [], back: []}});
    });

    it("stay out of backups", () => {
        expect(NOT_IN_BACKUP).toContain("roasterAlerts");
    });
});

describe("alongside syncing", () => {
    function harness(initial: CoffeeSpec[]) {
        resetSyncLockForTests();
        const settings = memorySettings();
        let current = feedBody(initial);
        const deps = {settings, fetchBody: jest.fn(async () => current), now: () => 1_000_000};
        const {feed: first, body} = feedBody(initial);
        subscribe(settings, FEED_URL, first, body, 1);
        return {
            settings, deps,
            setFeed: (next: CoffeeSpec[]) => {
                current = feedBody(next);
            },
            sync: () => syncSubscription(FEED_URL, deps, {force: true}),
            alerts: () => readAlerts(settings, FEED_URL)
        };
    }

    it("subscribing marks the whole list seen, and a sync flags only what is new", async () => {
        const h = harness([{id: "a"}, {id: "b"}]);
        expect(h.alerts()?.fresh).toEqual([]);
        expect(ids(h.alerts()?.seen ?? [])).toEqual(["a", "b"]);

        h.setFeed([{id: "a"}, {id: "b"}, {id: "c"}]);
        const result = await h.sync();
        expect(result.ok && result.back).toEqual([]);
        expect(h.alerts()?.fresh).toEqual(["c"]);
    });

    it("treats the first sync of a subscription with no alerts as a first look", async () => {
        const h = harness([{id: "a"}]);
        h.settings.set("roasterAlerts", "");
        h.setFeed([{id: "a"}, {id: "b"}]);
        await h.sync();
        expect(h.alerts()?.fresh).toEqual([]);
        expect(ids(h.alerts()?.seen ?? [])).toEqual(["a", "b"]);
    });

    it("reports a watched coffee back on the sync that finds it, and not again", async () => {
        const h = harness([{id: "a", available: false}]);
        setWatch(h.settings, FEED_URL, "a", true);

        h.setFeed([{id: "a"}]);
        const first = await h.sync();
        expect(first.ok && first.back.map((coffee) => coffee.id)).toEqual(["a"]);
        const second = await h.sync();
        expect(second.ok && second.back).toEqual([]);
        expect(h.alerts()?.back).toEqual(["a"]);
    });

    it("records visits and opens through the store", async () => {
        const h = harness([{id: "a"}]);
        h.setFeed([{id: "a"}, {id: "b"}]);
        const result = await h.sync();
        if (!result.ok) throw new Error("sync failed");
        recordListViewed(h.settings, FEED_URL, result.feed.coffees);
        expect(h.alerts()?.shown).toEqual(["b"]);
        recordOpened(h.settings, FEED_URL, result.feed.coffees[1]);
        expect(h.alerts()?.fresh).toEqual([]);
    });

    it("forgets a roaster's alerts on unsubscribing", () => {
        const h = harness([{id: "a"}]);
        unsubscribe(h.settings, FEED_URL);
        expect(h.alerts()).toBeUndefined();
    });
});
