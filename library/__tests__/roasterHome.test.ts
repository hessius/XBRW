import {buildBackup, parseBackup} from "@/library/backup";
import Recipe from "@/library/Recipe";
import {recordSync} from "@/library/roasterAlerts";
import {writeCatalogue} from "@/library/roasterCatalogue";
import {EMPTY_COFFEE_QUERY, filterCoffees} from "@/library/roasterFilters";
import {
    browsable, browseLabel, forgetHomeCataloguesForTests, homeCatalogues, homeStrip, pinDescription,
    searchRoasters, stripRows, stripSummaryLabel, STRIP_PHOTOS
} from "@/library/roasterHome";
import {parseSubscriptions} from "@/library/roasterSubscription";
import {
    readSubscriptions, setPaused, setPinned, subscribe, unsubscribe, updateSubscription
} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";
import {FEED_URL, feedBody, memorySettings, type CoffeeSpec} from "@/test-utils/roasterFeed";

const OTHER_URL = "https://other.example/feed.json";
const NOW = 1000 + 3 * 24 * 60 * 60 * 1000;

function subscribed(
    first: CoffeeSpec[], second?: CoffeeSpec[]
): Settings {
    const settings = memorySettings();
    const a = feedBody(first, "Test Roaster");
    subscribe(settings, FEED_URL, a.feed, a.body, 1000);
    if (second !== undefined) {
        const b = feedBody(second, "Other Roaster");
        subscribe(settings, OTHER_URL, b.feed, b.body, 1000);
    }
    return settings;
}

function catalogues(settings: Settings) {
    return homeCatalogues(settings.get("roasterSubscriptions"), settings.get("roasterCatalogue"));
}

beforeEach(forgetHomeCataloguesForTests);

describe("without a subscription", () => {
    it("has no catalogues, no strip rows and no search results", () => {
        const settings = memorySettings();
        const none = catalogues(settings);
        expect(none).toEqual([]);
        expect(stripRows(none, settings.get("roasterAlerts"), NOW)).toEqual([]);
        expect(searchRoasters(none, "peru")).toEqual([]);
    });
});

describe("searchRoasters", () => {
    it("finds nothing for an empty term", () => {
        expect(searchRoasters(catalogues(subscribed([{id: "a"}])), "  ")).toEqual([]);
    });

    it("lists each roaster's matches in subscription order, on sale first", () => {
        const settings = subscribed(
            [{id: "a", name: "Peru Sold", available: false}, {id: "b", name: "Peru Open"}],
            [{id: "c", name: "Peru Other"}]
        );
        const found = searchRoasters(catalogues(settings), "peru");
        expect(found.map((match) => [match.roaster, match.coffee.name, match.ref])).toEqual([
            ["Test Roaster", "Peru Open", "b"],
            ["Other Roaster", "Peru Other", "c"]
        ]);
        expect(found[0].feedUrl).toBe(FEED_URL);
        expect(found[1].feedUrl).toBe(OTHER_URL);
    });

    it.each(["peru", "washed", "Coffee b", "zzz", "LIGHT"])(
        "agrees with the roaster's own list for %p",
        (term) => {
            const specs = [{id: "a"}, {id: "b", available: false}, {id: "c"}];
            const settings = subscribed(specs);
            const [only] = catalogues(settings);
            const listed = filterCoffees(only.feed!.coffees, {...EMPTY_COFFEE_QUERY, term});
            expect(searchRoasters([only], term).map((match) => match.coffee))
                .toEqual(listed);
        }
    );

    it("skips a subscription whose catalogue is not cached", () => {
        const settings = subscribed([{id: "a"}]);
        settings.set("roasterCatalogue", "");
        forgetHomeCataloguesForTests();
        const list = catalogues(settings);
        expect(list).toHaveLength(1);
        expect(list[0].feed).toBeNull();
        expect(searchRoasters(list, "coffee")).toEqual([]);
    });
});

describe("stripRows", () => {
    it("counts coffees and takes up to three photos, on sale first", () => {
        const settings = subscribed([
            {id: "a", available: false}, {id: "b"}, {id: "c"}, {id: "d"}
        ]);
        const [row] = stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW);
        expect(row).toMatchObject({feedUrl: FEED_URL, roaster: "Test Roaster", count: 4,
                                   cached: true, detail: "4 coffees", paused: false,
                                   fresh: 0, back: 0});
        expect(row.photos).toHaveLength(STRIP_PHOTOS);
        expect(row.photos[0]).toContain("/b.png");
    });

    it("carries the NEW count and puts that roaster first", () => {
        const settings = subscribed([{id: "a"}], [{id: "x"}]);
        // A sync of the second roaster brings two coffees nobody has seen.
        const next = feedBody([{id: "x"}, {id: "y"}, {id: "z"}], "Other Roaster");
        writeCatalogue(settings, OTHER_URL, next.body, 2000);
        recordSync(settings, OTHER_URL, next.feed);

        const rows = stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW);
        expect(rows.map((row) => [row.roaster, row.count, row.fresh])).toEqual([
            ["Other Roaster", 3, 2],
            ["Test Roaster", 1, 0]
        ]);
    });

    it("re-reads when either setting changes, and not otherwise", () => {
        const settings = subscribed([{id: "a"}]);
        const first = catalogues(settings);
        expect(catalogues(settings)).toBe(first);
        const next = feedBody([{id: "a"}, {id: "b"}], "Test Roaster");
        writeCatalogue(settings, FEED_URL, next.body, 2000);
        expect(catalogues(settings)).not.toBe(first);
        expect(catalogues(settings)[0].feed?.coffees).toHaveLength(2);
    });
});

describe("browseLabel", () => {
    it("names one roaster and groups several", () => {
        const one = catalogues(subscribed([{id: "a"}])).map((entry) => entry.sub);
        expect(browseLabel(one)).toBe("Browse Test Roaster");
        forgetHomeCataloguesForTests();
        const two = catalogues(subscribed([{id: "a"}], [{id: "b"}])).map((entry) => entry.sub);
        expect(browseLabel(two)).toBe("Browse your roasters");
    });
});

describe("every subscription state", () => {
    it("says Loading coffees before the first feed is cached, and searches nothing for it", () => {
        const settings = subscribed([{id: "a", name: "Peru"}]);
        settings.set("roasterCatalogue", "");
        const list = catalogues(settings);
        const [row] = stripRows(list, settings.get("roasterAlerts"), NOW);
        expect(row).toMatchObject({cached: false, count: 0, detail: "Loading coffees", photos: []});
        expect(searchRoasters(list, "peru")).toEqual([]);
        expect(browsable(list)).toEqual([]);
    });

    it("says Couldn't update when the first sync failed", () => {
        const settings = subscribed([{id: "a"}]);
        settings.set("roasterCatalogue", "");
        updateSubscription(settings, FEED_URL, (sub) => ({...sub, lastError: "network"}));
        const [row] = stripRows(catalogues(settings), "", NOW);
        expect(row.detail).toBe("Couldn't update");
    });

    it("keeps the cached coffees and adds their age when the feed is failing", () => {
        const settings = subscribed([{id: "a", name: "El Palto"}, {id: "b"}]);
        updateSubscription(settings, FEED_URL, (sub) => ({...sub, lastError: "unreadable"}));
        const list = catalogues(settings);
        const [row] = stripRows(list, "", NOW);
        expect(row.detail).toBe("2 coffees · Updated 3 d ago");
        expect(searchRoasters(list, "palto").map((match) => match.coffee.name)).toEqual(["El Palto"]);
    });

    it("marks a paused roaster and still searches its cache", () => {
        const settings = subscribed([{id: "a", name: "Peru"}]);
        setPaused(settings, FEED_URL, true);
        const list = catalogues(settings);
        const [row] = stripRows(list, "", NOW);
        expect(row).toMatchObject({paused: true, detail: "1 coffee", cached: true});
        expect(searchRoasters(list, "peru")).toHaveLength(1);
    });

    it("says nothing is on sale when everything is sold out, and leaves it out of search", () => {
        const settings = subscribed([{id: "a", name: "Peru", available: false},
                                     {id: "b", name: "Peru Two", available: false}]);
        const list = catalogues(settings);
        const [row] = stripRows(list, "", NOW);
        expect(row.detail).toBe("No coffees on sale right now");
        expect(searchRoasters(list, "peru")).toEqual([]);
        // Still a roaster with coffees to look at.
        expect(browsable(list)).toHaveLength(1);
    });

    it("says nothing is on sale for a feed that lists no coffees, and offers no browse", () => {
        const settings = subscribed([]);
        const list = catalogues(settings);
        expect(stripRows(list, "", NOW)[0].detail).toBe("No coffees on sale right now");
        expect(browsable(list)).toEqual([]);
    });

    it("drops a roaster and its NEW count the moment it is unsubscribed", () => {
        const settings = subscribed([{id: "a"}], [{id: "x"}]);
        const next = feedBody([{id: "x"}, {id: "y"}], "Other Roaster");
        writeCatalogue(settings, OTHER_URL, next.body, 2000);
        recordSync(settings, OTHER_URL, next.feed);
        expect(stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW)[0].fresh).toBe(1);

        unsubscribe(settings, OTHER_URL);
        const list = catalogues(settings);
        expect(stripRows(list, settings.get("roasterAlerts"), NOW).map((row) => row.roaster))
            .toEqual(["Test Roaster"]);
        expect(searchRoasters(list, "coffee y")).toEqual([]);

        // Subscribing again starts from a first look, not the old NEW.
        subscribe(settings, OTHER_URL, next.feed, next.body, 3000);
        const again = stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW);
        expect(again.find((row) => row.roaster === "Other Roaster")?.fresh).toBe(0);
    });

    it("orders by what is waiting, then by name", () => {
        const settings = memorySettings();
        const roasters: [string, string][] = [
            ["https://c.example/f", "Cielo"], ["https://a.example/f", "alto"],
            ["https://b.example/f", "Bombora"]
        ];
        for (const [url, name] of roasters) {
            const body = feedBody([{id: "a"}], name);
            subscribe(settings, url, body.feed, body.body, 1000);
        }
        expect(stripRows(catalogues(settings), "", NOW).map((row) => row.roaster))
            .toEqual(["alto", "Bombora", "Cielo"]);
        const next = feedBody([{id: "a"}, {id: "b"}], "Cielo");
        writeCatalogue(settings, "https://c.example/f", next.body, 2000);
        recordSync(settings, "https://c.example/f", next.feed);
        expect(stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW)
            .map((row) => row.roaster)).toEqual(["Cielo", "alto", "Bombora"]);
    });
});

describe("pinning and the home strip", () => {
    /** `count` roasters named R1, R2..., each with one coffee. */
    function roasters(count: number): Settings {
        const settings = memorySettings();
        for (let n = 1; n <= count; n++) {
            const {feed, body} = feedBody([{id: `c${n}`}], `R${n}`);
            subscribe(settings, `https://r${n}.example/feed.json`, feed, body, 1000);
        }
        return settings;
    }
    const url = (n: number) => `https://r${n}.example/feed.json`;
    const strip = (settings: Settings) =>
        homeStrip(stripRows(catalogues(settings), settings.get("roasterAlerts"), NOW));
    const names = (settings: Settings) => strip(settings).rows.map((row) => row.roaster);

    it("lists one roaster, and three, with no summary row", () => {
        expect(strip(roasters(1))).toMatchObject({summary: null});
        expect(names(roasters(1))).toEqual(["R1"]);
        expect(names(roasters(3))).toEqual(["R1", "R2", "R3"]);
        expect(strip(roasters(3)).summary).toBeNull();
    });

    it("puts pinned roasters first with three or fewer, in the order they were pinned", () => {
        const settings = roasters(3);
        setPinned(settings, url(3), true, 2000);
        setPinned(settings, url(2), true, 3000);
        forgetHomeCataloguesForTests();
        expect(names(settings)).toEqual(["R3", "R2", "R1"]);
        expect(strip(settings).rows.map((row) => row.pinned)).toEqual([true, true, false]);
    });

    it("folds four or more into the summary row alone when none is pinned", () => {
        const result = strip(roasters(4));
        expect(result.rows).toEqual([]);
        expect(result.summary).toEqual({count: 4, fresh: 0, back: 0});
        expect(stripSummaryLabel({count: 4, fresh: 2, back: 1}))
            .toBe("All roasters, 4, 2 new, 1 back in stock");
    });

    it("shows only the pinned with four or more, three at most, then the summary", () => {
        const settings = roasters(5);
        setPinned(settings, url(5), true, 2000);
        setPinned(settings, url(1), true, 3000);
        setPinned(settings, url(4), true, 4000);
        setPinned(settings, url(2), true, 5000);
        const result = strip(settings);
        expect(result.rows.map((row) => row.roaster)).toEqual(["R5", "R1", "R4"]);
        expect(result.summary).toEqual({count: 5, fresh: 0, back: 0});
    });

    it("counts every roaster's NEW coffees on the summary row", () => {
        const settings = roasters(4);
        const next = feedBody([{id: "c2"}, {id: "new"}], "R2");
        writeCatalogue(settings, url(2), next.body, NOW);
        recordSync(settings, url(2), next.feed);
        expect(strip(settings).summary).toEqual({count: 4, fresh: 1, back: 0});
    });

    it("goes back to the usual order when a pin is taken away, and keeps the first pin time", () => {
        const settings = roasters(3);
        setPinned(settings, url(3), true, 2000);
        setPinned(settings, url(3), true, 9000);
        expect(readSubscriptions(settings).find((sub) => sub.feed === url(3))?.pinnedAt).toBe(2000);
        forgetHomeCataloguesForTests();
        expect(names(settings)).toEqual(["R3", "R1", "R2"]);

        setPinned(settings, url(3), false, 3000);
        forgetHomeCataloguesForTests();
        expect(names(settings)).toEqual(["R1", "R2", "R3"]);
        expect(readSubscriptions(settings).every((sub) => sub.pinnedAt === undefined)).toBe(true);
    });

    it("keeps a pin through a sync and loses it on unsubscribing", () => {
        const settings = roasters(1);
        setPinned(settings, url(1), true, 2000);
        updateSubscription(settings, url(1), (sub) => ({...sub, lastSync: 5000}));
        expect(readSubscriptions(settings)[0].pinnedAt).toBe(2000);

        unsubscribe(settings, url(1));
        const {feed, body} = feedBody([{id: "c1"}], "R1");
        subscribe(settings, url(1), feed, body, 6000);
        expect(readSubscriptions(settings)[0].pinnedAt).toBeUndefined();
    });

    it("drops a pin time that is not a positive number", () => {
        const stored = JSON.stringify([
            {feed: url(1), roaster: "R1", lastSync: 1, lastAttempt: 1, paused: false, pinnedAt: "soon"},
            {feed: url(2), roaster: "R2", lastSync: 1, lastAttempt: 1, paused: false, pinnedAt: -5},
            {feed: url(3), roaster: "R3", lastSync: 1, lastAttempt: 1, paused: false, pinnedAt: 7}
        ]);
        expect(parseSubscriptions(stored).map((sub) => sub.pinnedAt)).toEqual([undefined, undefined, 7]);
    });

    it("carries pins and the home screen switch through a backup", () => {
        const settings = roasters(4);
        setPinned(settings, url(2), true, 2000);
        const recipe = new Recipe();
        recipe.name = "A";
        recipe.uuid = "u1";

        const parsed = parseBackup(buildBackup([recipe], {
            roasterSubscriptions: settings.get("roasterSubscriptions"),
            showRoastersOnHome:   false
        }));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.payload.settings.showRoastersOnHome).toBe(false);

        const restored = memorySettings();
        restored.set("roasterSubscriptions", parsed.payload.settings.roasterSubscriptions as string);
        expect(readSubscriptions(restored).find((sub) => sub.feed === url(2))?.pinnedAt).toBe(2000);
    });

    it("says what pinning does for few roasters, many, and with the strip off", () => {
        expect(pinDescription(2, true)).toBe("With 3 roasters or fewer, all of them show. Pinned ones come first.");
        expect(pinDescription(4, true)).toBe("With more than 3 roasters, only pinned ones show, up to 3.");
        expect(pinDescription(4, false))
            .toBe("Roasters are hidden from the home screen. Turn them on in Roaster feeds.");
    });
});
