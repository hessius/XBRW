import {parseBrewMindLink} from "@/library/brewmindLink";
import {
    MAX_FEED_CHARS, MAX_FEED_COFFEES, RoasterFeedError, feedKey, fetchRoasterFeed,
    parseFeedOptOut, parseRoasterFeed, serialiseFeedOptOut, type FetchLike
} from "@/library/roasterFeed";
import {FEED_URL, feedCoffee, feedJson, share} from "@/test-utils/roasterFeed";

describe("the feed parameter on an import link", () => {
    const base = "xbrw://import?v=1&source=centralcoastcoffee&share=" +
        encodeURIComponent(share("abc"));

    it("is absent when the link carries none", () => {
        expect(parseBrewMindLink(base)?.feed).toBeUndefined();
    });

    it("is read when it is an https address", () => {
        const parsed = parseBrewMindLink(`${base}&feed=${encodeURIComponent(FEED_URL)}`);
        expect(parsed?.feed).toBe(FEED_URL);
        expect(parsed?.share).toBe(share("abc"));
    });

    it("is dropped, and the recipe still imports, when it is not https", () => {
        const parsed = parseBrewMindLink(`${base}&feed=${encodeURIComponent("http://roaster.example/feed")}`);
        expect(parsed).not.toBeNull();
        expect(parsed?.feed).toBeUndefined();
    });

    it("is dropped when it is longer than any URL the app keeps", () => {
        const long = `https://roaster.example/${"a".repeat(2100)}`;
        expect(parseBrewMindLink(`${base}&feed=${encodeURIComponent(long)}`)?.feed).toBeUndefined();
    });
});

describe("parseRoasterFeed", () => {
    it("reads a valid feed, coffee fields included", () => {
        const feed = parseRoasterFeed(feedJson([{id: "a"}, {id: "b", available: false}]));
        expect(feed?.roaster).toEqual({name: "Test Roaster", url: "https://roaster.example"});
        expect(feed?.coffees).toHaveLength(2);
        const [first, second] = feed!.coffees;
        expect(first.available).toBe(true);
        expect(second.available).toBe(false);
        expect(first.recipes).toEqual([
            {size: "18g", share: share("a-18g")},
            {size: "15g", share: share("a-15g")}
        ]);
        expect(first.coffee).toMatchObject({
            name: "Coffee a", roaster: "Test Roaster", country: "Peru",
            elevation: 1590, cupping_points: 88, decaffeinated: false,
            url: "https://roaster.example/products/a",
            imageUrl: "https://roaster.example/cdn/a.png"
        });
    });

    it("refuses a version it does not know", () => {
        const body = JSON.parse(feedJson([{id: "a"}]));
        expect(parseRoasterFeed(JSON.stringify({...body, version: 2}))).toBeNull();
        expect(parseRoasterFeed(JSON.stringify({...body, version: "1"}))).toBeNull();
    });

    it("refuses a body that is not JSON, or has no roaster or coffee list", () => {
        expect(parseRoasterFeed("<html>")).toBeNull();
        expect(parseRoasterFeed(JSON.stringify({version: 1, coffees: []}))).toBeNull();
        expect(parseRoasterFeed(JSON.stringify({version: 1, roaster: {name: "R"}}))).toBeNull();
    });

    it("refuses an oversized body before parsing it", () => {
        expect(parseRoasterFeed(" ".repeat(MAX_FEED_CHARS + 1))).toBeNull();
    });

    it("drops http links, and a coffee left with no recipe", () => {
        const body = JSON.parse(feedJson([{id: "a"}, {id: "b"}]));
        body.coffees[0].image = "http://roaster.example/a.png";
        body.coffees[0].url = "http://roaster.example/a";
        body.coffees[0].recipes[0].share = "http://share-h5.xbloom.com/?id=x";
        body.coffees[1].recipes = [{size: "18g", share: "https://share-h5.xbloom.com/"}];
        const feed = parseRoasterFeed(JSON.stringify(body));
        expect(feed?.coffees).toHaveLength(1);
        expect(feed?.coffees[0].image).toBeUndefined();
        expect(feed?.coffees[0].url).toBeUndefined();
        expect(feed?.coffees[0].recipes).toEqual([{size: "15g", share: share("a-15g")}]);
    });

    it("skips coffees missing a name or recipes, and treats a missing flag as unavailable", () => {
        const body = JSON.parse(feedJson([{id: "a"}, {id: "b"}, {id: "c"}]));
        delete body.coffees[0].name;
        delete body.coffees[1].recipes;
        delete body.coffees[2].available;
        const feed = parseRoasterFeed(JSON.stringify(body));
        expect(feed?.coffees.map((coffee) => coffee.id)).toEqual(["c"]);
        expect(feed?.coffees[0].available).toBe(false);
    });

    it("reads no more than the coffee cap", () => {
        const body = JSON.parse(feedJson([]));
        body.coffees = Array.from({length: MAX_FEED_COFFEES + 5}, (_, i) => feedCoffee({id: `c${i}`}));
        expect(parseRoasterFeed(JSON.stringify(body))?.coffees).toHaveLength(MAX_FEED_COFFEES);
    });

    it("ignores fields it does not know and keeps the coffee's own name over the bean block's", () => {
        const body = JSON.parse(feedJson([{id: "a"}]));
        body.extra = {anything: true};
        body.coffees[0].bean.name = "Not this";
        body.coffees[0].bean.__proto__ = "x";
        const feed = parseRoasterFeed(JSON.stringify(body));
        expect(feed?.coffees[0].coffee.name).toBe("Coffee a");
    });
});

describe("feed keys and the opt-out list", () => {
    it("keys a feed by origin and path, not query", () => {
        expect(feedKey(FEED_URL)).toBe("https://roaster.example/collections/coffee");
        expect(feedKey(`${FEED_URL}&v=2`)).toBe(feedKey(FEED_URL));
        expect(feedKey("not a url")).toBeNull();
    });

    it("round-trips the opt-out list and survives a bad value", () => {
        expect(parseFeedOptOut(serialiseFeedOptOut(["a", "a", "b"]))).toEqual(["a", "b"]);
        expect(parseFeedOptOut("")).toEqual([]);
        expect(parseFeedOptOut("{oops")).toEqual([]);
        expect(parseFeedOptOut("[1, \"a\"]")).toEqual(["a"]);
    });
});

describe("fetchRoasterFeed", () => {
    const respond = (body: string, init: {ok?: boolean; length?: string} = {}): FetchLike =>
        async () => ({
            ok:      init.ok ?? true,
            headers: {get: (name: string) => name === "content-length" ? init.length ?? null : null},
            text:    async () => body
        });

    it("reads a feed served as anything, html included", async () => {
        const feed = await fetchRoasterFeed(FEED_URL, {fetchImpl: respond(feedJson([{id: "a"}]))});
        expect(feed.coffees).toHaveLength(1);
    });

    it("accepts any type, so Shopify serves the feed template and not its own JSON", async () => {
        const fetchImpl = jest.fn(respond(feedJson([{id: "a"}])));
        await fetchRoasterFeed(FEED_URL, {fetchImpl});
        const accept = (fetchImpl.mock.calls[0] as unknown as [string, {headers: Record<string, string>}])[1]
            .headers.Accept;
        expect(accept).toContain("*/*");
    });

    it("refuses a non-https address without a request", async () => {
        const fetchImpl = jest.fn(respond("{}"));
        await expect(fetchRoasterFeed("http://roaster.example/feed", {fetchImpl}))
            .rejects.toMatchObject({kind: "unreadable"});
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("calls an unreachable feed a network failure", async () => {
        const fetchImpl: FetchLike = async () => {
            throw new Error("offline");
        };
        await expect(fetchRoasterFeed(FEED_URL, {fetchImpl})).rejects.toBeInstanceOf(RoasterFeedError);
        await expect(fetchRoasterFeed(FEED_URL, {fetchImpl})).rejects.toMatchObject({kind: "network"});
        await expect(fetchRoasterFeed(FEED_URL, {fetchImpl: respond("", {ok: false})}))
            .rejects.toMatchObject({kind: "network"});
    });

    it("refuses a body declared too large, and one that is not a feed", async () => {
        await expect(fetchRoasterFeed(FEED_URL, {
            fetchImpl: respond(feedJson([]), {length: String(MAX_FEED_CHARS + 1)})
        })).rejects.toMatchObject({kind: "unreadable"});
        await expect(fetchRoasterFeed(FEED_URL, {fetchImpl: respond("<html>")}))
            .rejects.toMatchObject({kind: "unreadable"});
    });

    it("gives up after its timeout", async () => {
        const fetchImpl: FetchLike = (_url, init) => new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
        await expect(fetchRoasterFeed(FEED_URL, {fetchImpl, timeoutMs: 10}))
            .rejects.toMatchObject({kind: "network"});
    });
});

describe("roast and bag sizes", () => {
    it("reads them when they are sound", () => {
        const coffee = parseRoasterFeed(feedJson([{id: "a"}]))!.coffees[0];
        expect(coffee.roast).toEqual({level: "Light", restDays: 11, peakDay: 28, bestUntilDay: 42});
        expect(coffee.bagSizes).toEqual([320, 160]);
    });

    it("drops each bad value on its own and keeps the rest", () => {
        const body = JSON.parse(feedJson([{id: "a"}, {id: "b"}]));
        body.coffees[0].roast = {level: "", rest_days: -1, peak_day: 2.5, best_until_day: "42"};
        body.coffees[0].bag_sizes_g = [320, "160", 0, 9999999, 320];
        body.coffees[1].roast = {level: "Medium", rest_days: 7};
        delete body.coffees[1].bag_sizes_g;
        const [first, second] = parseRoasterFeed(JSON.stringify(body))!.coffees;
        expect(first.roast).toBeUndefined();
        expect(first.bagSizes).toEqual([320]);
        expect(second.roast).toEqual({level: "Medium", restDays: 7});
        expect(second.bagSizes).toEqual([]);
    });
});

describe("a real feed", () => {
    it("reads every coffee Central Coast Coffee publishes", () => {
        const sample = require("./roasterFeedSample.json");
        const feed = parseRoasterFeed(JSON.stringify(sample))!;
        expect(feed.roaster.name).toBe("Central Coast Coffee");
        expect(feed.coffees).toHaveLength(sample.coffees.length);
        for (const coffee of feed.coffees) {
            expect(coffee.recipes.length).toBeGreaterThan(0);
            expect(coffee.roast?.level).toBeDefined();
            expect(coffee.bagSizes.length).toBeGreaterThan(0);
            expect(coffee.variants.length).toBeGreaterThan(0);
        }
        expect(feed.roaster.addToCart)
            .toBe("https://www.centralcoastcoffee.com.au/cart/add?id={variant_id}&quantity=1");
        expect(feed.coffees[0].variants[3]).toEqual({
            id: "42227047268388", grams: 160, price: 28, currency: "AUD", available: true
        });
    });
});
