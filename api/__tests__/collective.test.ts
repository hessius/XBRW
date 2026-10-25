import {chooseRecipe} from "@/library/roasterCatalogue";
import {parseRoasterFeed} from "@/library/roasterFeed";

import {buildCollectiveFeed, coffeeKey, fetchOfficialRows, MAX_COFFEES, type CollectiveRow}
    from "../_lib/collective";
import {CACHE_CONTROL, respond} from "../feeds/xbloom";

const FEED = "https://xbrwplusplus.vercel.app/api/feeds/xbloom";

/** Two live rows for one release (recipes 645142 and 645141), trimmed to what the feed reads. */
function row(overrides: Partial<CollectiveRow> = {}): CollectiveRow {
    return {
        communityRecipeId: 645142,
        recipeName:        "Ethiopia Banko Chelbesa",
        imageUrl:          "https://tbdprodpic.s3.us-east-1.amazonaws.com/20260611/6a2a126738750.jpg",
        official:          1,
        model:             "Original",
        cupType:           "xPod",
        type:              "Single Origin",
        origin:            ["Ethiopia"],
        varietal:          [],
        process:           ["Natural anaerobic"],
        flavor:            ["Apricot, Vanilla, Dried mango, Earl grey tea"],
        roast:             2,
        dose:              15,
        shareRecipeLink:   "https://share-h5.xbloom.com/?id=BkrLxW6Lii20hA5rcbAOGg%3D%3D",
        ...overrides
    };
}

const studio = row({
    communityRecipeId: 645141,
    model:             "Studio",
    shareRecipeLink:   "https://share-h5.xbloom.com/?id=tItNWngw3Du4KdN8Zp6v0A%3D%3D"
});

describe("buildCollectiveFeed", () => {
    it("folds one release's machine rows into one coffee with a recipe each", () => {
        const feed = buildCollectiveFeed([row(), studio], FEED);
        expect(feed.roaster).toEqual({
            name: "xBloom Collective", url: "https://collective.xbloom.com", feed: FEED
        });
        expect(feed.coffees).toHaveLength(1);
        expect(feed.coffees[0]).toMatchObject({
            id:        "xbloom-ethiopia-banko-chelbesa",
            name:      "Ethiopia Banko Chelbesa",
            url:       "https://collective.xbloom.com/recipe/645142",
            available: true,
            roast:     {level: "Medium-Light Roast"},
            recipes:   [
                {size: "15g Original", share: row().shareRecipeLink},
                {size: "15g Studio", share: studio.shareRecipeLink}
            ],
            bean: {
                country:    "Ethiopia",
                processing: "Natural anaerobic",
                flavours:   ["Apricot", "Vanilla", "Dried mango", "Earl grey tea"],
                tags:       ["Single Origin", "xPod"]
            }
        });
        expect(feed.coffees[0].bean).not.toHaveProperty("variety");
    });

    it("parses with the app's own feed reader, keeping every coffee and recipe", () => {
        const omni = row({communityRecipeId: 645131, recipeName: "People Possession BPM", cupType: "Omni",
                          shareRecipeLink: "https://share-h5.xbloom.com/?id=omni"});
        const parsed = parseRoasterFeed(JSON.stringify(buildCollectiveFeed([row(), studio, omni], FEED)));
        expect(parsed?.roaster.name).toBe("xBloom Collective");
        expect(parsed?.coffees.map((c) => c.name)).toEqual(["Ethiopia Banko Chelbesa", "People Possession BPM"]);
        expect(parsed?.coffees[0].recipes.map((r) => r.size)).toEqual(["15g Original", "15g Studio"]);
        expect(parsed?.coffees[1].recipes[0].size).toBe("15g Original Omni");
        expect(parsed?.coffees[0].flavours).toEqual(["Apricot", "Vanilla", "Dried mango", "Earl grey tea"]);
        // No 18g recipe, so the picker opens on the first, which is the Original.
        expect(chooseRecipe(parsed!.coffees[0]).size).toBe("15g Original");
    });

    it("skips community rows, rows without a name and rows without an xBloom share link", () => {
        const feed = buildCollectiveFeed([
            row({official: 0}),
            row({recipeName: "  "}),
            row({shareRecipeLink: "https://example.com/?id=1"}),
            row({shareRecipeLink: "https://share-h5.xbloom.com/"}),
            row({shareRecipeLink: null})
        ], FEED);
        expect(feed.coffees).toEqual([]);
    });

    it("keeps one recipe per label when xBloom re-uploads a release", () => {
        const reupload = row({communityRecipeId: 700000, shareRecipeLink: "https://share-h5.xbloom.com/?id=newer"});
        const feed = buildCollectiveFeed([reupload, row(), studio], FEED);
        expect(feed.coffees[0].recipes.map((r) => r.share)).toEqual([reupload.shareRecipeLink, studio.shareRecipeLink]);
        expect(feed.coffees[0].url).toBe("https://collective.xbloom.com/recipe/700000");
    });

    it("splits tasting notes joined with bullets as well as commas", () => {
        const feed = buildCollectiveFeed([row({flavor: ["Blueberry Pie • Raspberry • Vanilla"]})], FEED);
        expect(feed.coffees[0].bean.flavours).toEqual(["Blueberry Pie", "Raspberry", "Vanilla"]);
    });

    it("drops placeholder facets and unknown roasts rather than inventing them", () => {
        const feed = buildCollectiveFeed([row({origin: ["N/A"], process: null, flavor: ["-"], roast: 9})], FEED);
        expect(feed.coffees[0].bean).toEqual({tags: ["Single Origin", "xPod"]});
        expect(feed.coffees[0]).not.toHaveProperty("roast");
    });

    it("stops at the coffee cap, newest first", () => {
        const rows = Array.from({length: MAX_COFFEES + 5}, (_, i) =>
            row({communityRecipeId: i, recipeName: `Coffee ${i}`, shareRecipeLink: `https://share-h5.xbloom.com/?id=${i}`}));
        const feed = buildCollectiveFeed(rows, FEED);
        expect(feed.coffees).toHaveLength(MAX_COFFEES);
        expect(feed.coffees[0].name).toBe("Coffee 0");
    });
});

describe("coffeeKey", () => {
    it("is stable across case, accents and punctuation", () => {
        expect(coffeeKey("Café  Colombia | El Paraíso")).toBe("cafe-colombia-el-paraiso");
        expect(coffeeKey("CAFE COLOMBIA EL PARAISO")).toBe("cafe-colombia-el-paraiso");
        expect(coffeeKey("☕️")).toBeNull();
    });
});

function catalogue(pages: CollectiveRow[][], totalPage = pages.length) {
    const bodies: unknown[] = [];
    const fn = jest.fn(async (_url: string, init: {body: string}) => {
        const body = JSON.parse(init.body) as {pageIndex: number};
        bodies.push(body);
        return {ok: true, status: 200,
                json: async () => ({code: 200, data: {list: pages[body.pageIndex - 1] ?? [], totalPage}})};
    });
    return {fn, bodies};
}

describe("fetchOfficialRows", () => {
    it("asks for official coffee, newest first, and stops at the last page", async () => {
        const {fn, bodies} = catalogue([[row(), studio]]);
        const rows = await fetchOfficialRows(fn);
        expect(rows).toHaveLength(2);
        expect(bodies).toEqual([{pageIndex: 1, pageSize: 50, recipeType: 1, recipeUserType: 1, sort: 1, sortType: 2}]);
        expect(fn.mock.calls[0][0]).toBe("https://collective-api.xbloom.com/communityRecipe/index/page");
    });

    it("reads at most four pages", async () => {
        const {fn} = catalogue(Array.from({length: 10}, () => [row()]), 10);
        await fetchOfficialRows(fn);
        expect(fn).toHaveBeenCalledTimes(4);
    });

    it("throws on an envelope that is not a success", async () => {
        const fn = jest.fn(async () => ({ok: true, status: 200, json: async () => ({code: 500, msg: "Operation Failed"})}));
        await expect(fetchOfficialRows(fn)).rejects.toThrow("code 500");
    });
});

describe("GET /api/feeds/xbloom", () => {
    beforeEach(() => {
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("serves the feed with a long CDN cache and the bare path as its address", async () => {
        const {fn} = catalogue([[row(), studio]]);
        const res = await respond(new Request(`${FEED}?view=xbrw`), fn);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
        const body = await res.json() as {roaster: {feed: string}; coffees: unknown[]};
        expect(body.roaster.feed).toBe(FEED);
        expect(body.coffees).toHaveLength(1);
    });

    it("refuses to publish an empty list, so a cached copy stands", async () => {
        const {fn} = catalogue([[]]);
        const res = await respond(new Request(FEED), fn);
        expect(res.status).toBe(502);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("answers 502 without detail when the catalogue is down", async () => {
        const fn = jest.fn(async () => ({ok: false, status: 503, json: async () => ({})}));
        const res = await respond(new Request(FEED), fn);
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({error: "upstream"});
    });

    it("only answers GET and HEAD", async () => {
        const res = await respond(new Request(FEED, {method: "POST"}));
        expect(res.status).toBe(405);
    });
});
