import {chooseRecipe} from "@/library/roasterCatalogue";
import {parseRoasterFeed} from "@/library/roasterFeed";
import {
    buildCollectiveFeed, coffeeKey, fetchOfficialRows, MAX_COFFEES, UPSTREAM_TIMEOUT_MS,
    type CollectiveRow, type FetchLike
} from "../_lib/collective";
import {CACHE_CONTROL, respond} from "../feeds/xbloom";

const FEED = "https://service.example/api/feeds/xbloom";

function row(overrides: Partial<CollectiveRow> = {}): CollectiveRow {
    return {
        communityRecipeId: 645142, recipeName: "Ethiopia Banko Chelbesa",
        imageUrl: "https://images.example/pod.jpg", official: 1, model: "Original",
        cupType: "xPod", type: "Single Origin", origin: ["Ethiopia"], varietal: [],
        process: ["Natural anaerobic"], flavor: ["Apricot, Vanilla, Dried mango"],
        roast: 2, dose: 15, shareRecipeLink: "https://share-h5.xbloom.com/?id=original%3D%3D",
        ...overrides
    };
}

const studio = row({
    communityRecipeId: 645141, model: "Studio",
    shareRecipeLink: "https://share-h5.xbloom.com/?id=studio%3D%3D"
});

function catalogue(pages: CollectiveRow[][], totalPage = pages.length) {
    const bodies: {pageIndex: number; machineList: string[]}[] = [];
    const fn = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async (_url, init) => {
        if (init.signal.aborted) throw Object.assign(new Error("aborted"), {name: "AbortError"});
        const body = JSON.parse(init.body ?? "{}") as {pageIndex: number; machineList: string[]};
        bodies.push(body);
        const model = body.machineList[0] === "J15" ? "Studio" : "Original";
        return {ok: true, status: 200, json: async () => ({
            code: 200, data: {list: (pages[body.pageIndex - 1] ?? []).filter(r => r.model === model), totalPage}
        })};
    });
    return {fn, bodies};
}

describe("buildCollectiveFeed", () => {
    it("groups machine variants without claiming the catalogue is their roaster", () => {
        const feed = buildCollectiveFeed([row(), studio], FEED);
        expect(feed.roaster).toEqual({
            name: "xBloom Collective", url: "https://collective.xbloom.com", feed: FEED, kind: "catalogue"
        });
        expect(feed.coffees).toHaveLength(1);
        expect(feed.coffees[0]).toMatchObject({
            id: "xbloom-ethiopia-banko-chelbesa", available: true,
            url: "https://collective.xbloom.com/recipe/645142",
            roast: {level: "Medium-Light Roast"},
            recipes: [
                {size: "15g Original", share: row().shareRecipeLink, machine_model: "original"},
                {size: "15g Studio", share: studio.shareRecipeLink, machine_model: "studio"}
            ],
            bean: {country: "Ethiopia", processing: "Natural anaerobic",
                flavours: ["Apricot", "Vanilla", "Dried mango"], tags: ["Single Origin", "xPod"]}
        });
        expect(feed.coffees[0].bean).not.toHaveProperty("roaster");
        expect(feed.coffees[0].bean).not.toHaveProperty("variety");
    });

    it("round-trips through the client parser and selects only the requested machine", () => {
        const omni = row({communityRecipeId: 645131, cupType: "Omni",
            shareRecipeLink: "https://share-h5.xbloom.com/?id=omni"});
        const parsed = parseRoasterFeed(JSON.stringify(buildCollectiveFeed([row(), studio, omni], FEED)))!;
        expect(parsed.roaster.kind).toBe("catalogue");
        expect(parsed.coffees).toHaveLength(1);
        expect(parsed.coffees[0].recipes).toHaveLength(3);
        expect(chooseRecipe(parsed.coffees[0], undefined, "studio").share).toBe(studio.shareRecipeLink);
        expect(chooseRecipe(parsed.coffees[0], undefined, "original").share).toBe(row().shareRecipeLink);
        expect(chooseRecipe(parsed.coffees[0], "15g Original Omni", "original").size).toBe("15g Original Omni");
        expect(() => chooseRecipe(parsed.coffees[0])).toThrow("No recipe");
    });

    it("skips nonofficial, unnamed, unsupported and malformed rows and non-share URLs", () => {
        const feed = buildCollectiveFeed([
            row({official: 0}), row({recipeName: " "}), row({model: "Unknown"}),
            row({type: "Tea"}), row({communityRecipeId: -1}),
            row({shareRecipeLink: "https://example.com/?id=1"}),
            row({shareRecipeLink: "https://share-h5.xbloom.com/"}), row({shareRecipeLink: null})
        ], FEED);
        expect(feed.coffees).toEqual([]);
    });

    it("retains non-Latin-only releases with stable opaque ids", () => {
        const named = row({recipeName: "埃塞俄比亚 咖啡"});
        const first = buildCollectiveFeed([named], FEED);
        const again = buildCollectiveFeed([{...named, communityRecipeId: 700000}], FEED);
        const parsed = parseRoasterFeed(JSON.stringify(first))!;
        expect(parsed.coffees).toHaveLength(1);
        expect(parsed.coffees[0].id).toBe(again.coffees[0].id);
        expect(parsed.coffees[0].id).not.toBe("xbloom-");
    });

    it("keeps the newest recipe for a repeated model/dose label", () => {
        const newer = row({communityRecipeId: 700000, shareRecipeLink: "https://share-h5.xbloom.com/?id=new"});
        const feed = buildCollectiveFeed([newer, row(), studio], FEED);
        expect(feed.coffees[0].recipes.map(r => r.share)).toEqual([newer.shareRecipeLink, studio.shareRecipeLink]);
        expect(feed.coffees[0].url).toBe("https://collective.xbloom.com/recipe/700000");
    });

    it("uses hub separators and placeholders without splitting meaningful slashes or ampersands", () => {
        const feed = buildCollectiveFeed([row({
            origin: ["???", "N/A"], process: ["Washed・Natural"],
            flavor: ["Apricot · Vanilla • Mango、Peach; Plum, Herbs & Spices", "unknown", "..."],
            varietal: ["Geisha/Gesha"], roast: 9
        })], FEED);
        expect(feed.coffees[0].bean).toMatchObject({
            processing: "Washed, Natural", variety: "Geisha/Gesha",
            flavours: ["Apricot", "Vanilla", "Mango", "Peach", "Plum", "Herbs & Spices"]
        });
        expect(feed.coffees[0].bean).not.toHaveProperty("country");
        expect(feed.coffees[0]).not.toHaveProperty("roast");
    });

    it("caps coffees and recipes to the client limits", () => {
        const rows = Array.from({length: MAX_COFFEES + 5}, (_, i) =>
            row({communityRecipeId: i + 1, recipeName: `Coffee ${i}`}));
        expect(buildCollectiveFeed(rows, FEED).coffees).toHaveLength(MAX_COFFEES);
        expect(buildCollectiveFeed(Array.from({length: 20}, (_, i) =>
            row({dose: i + 1, shareRecipeLink: `https://share-h5.xbloom.com/?id=${i}`})), FEED)
            .coffees[0].recipes).toHaveLength(10);
    });

    it("normalizes serialized facet arrays through the same cleaner as ordinary values", () => {
        const feed = buildCollectiveFeed([row({
            origin: ['["Ethiopia", "N/A"]'],
            process: ['["Washed", "Natural · Anaerobic"]'],
            flavor: ['["Apricot", "Vanilla, Mango", null, 42]']
        })], FEED);
        expect(feed.coffees[0].bean).toMatchObject({
            country: "Ethiopia", processing: "Washed, Natural, Anaerobic",
            flavours: ["Apricot", "Vanilla", "Mango"]
        });
    });

    it("accepts a share id at the client's decoded length boundary", () => {
        const feed = buildCollectiveFeed([row({
            shareRecipeLink: `https://share-h5.xbloom.com/?id=${"a".repeat(256)}`
        })], FEED);
        expect(parseRoasterFeed(JSON.stringify(feed))?.coffees).toHaveLength(1);
    });
});

it("keeps coffee keys stable across case, accents and punctuation", () => {
    expect(coffeeKey("Café  Colombia | El Paraíso")).toBe("cafe-colombia-el-paraiso");
    expect(coffeeKey("CAFE COLOMBIA EL PARAISO")).toBe("cafe-colombia-el-paraiso");
    expect(coffeeKey("☕️")).toBeNull();
});

describe("fetchOfficialRows", () => {
    it("reads both machine partitions independently and orders the combined rows newest first", async () => {
        const {fn, bodies} = catalogue([[row(), studio]]);
        expect((await fetchOfficialRows(fn)).map(r => r.communityRecipeId)).toEqual([645142, 645141]);
        expect(bodies).toEqual([
            {pageIndex: 1, pageSize: 50, machineList: ["J20"], recipeType: 1, recipeUserType: 1, sort: 1, sortType: 2},
            {pageIndex: 1, pageSize: 50, machineList: ["J15"], recipeType: 1, recipeUserType: 1, sort: 1, sortType: 2}
        ]);
        expect(fn.mock.calls[0][0]).toBe("https://collective-api.xbloom.com/communityRecipe/index/page");
    });

    it("bounds each partition independently even if the server repeats its rows", async () => {
        const {fn} = catalogue(Array.from({length: 10}, () => [row(), studio]), 10);
        await fetchOfficialRows(fn);
        expect(fn).toHaveBeenCalledTimes(8);
    });

    it("does not count invalid or nonofficial names toward the coffee cap", async () => {
        const bad = Array.from({length: 70}, (_, i) => row({official: 0, recipeName: `Bad ${i}`}));
        const {fn} = catalogue([[...bad, studio], [row(), studio]]);
        expect((await fetchOfficialRows(fn)).some(r => r.model === "Original")).toBe(true);
    });

    it("rejects both HTTP failures and HTTP-200 envelope refusals", async () => {
        await expect(fetchOfficialRows(async () => ({ok: false, status: 503, json: async () => ({})})))
            .rejects.toThrow("503");
        await expect(fetchOfficialRows(async () => ({ok: true, status: 200, json: async () => ({code: 400})})))
            .rejects.toThrow("invalid page");
    });

    it("aborts both held requests at the shared upstream deadline", async () => {
        jest.useFakeTimers();
        try {
            const signals: AbortSignal[] = [];
            const held: FetchLike = (_url, {signal}) => new Promise((_resolve, reject) => {
                signals.push(signal);
                signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
            });
            const pending = expect(fetchOfficialRows(held)).rejects.toThrow("aborted");
            await jest.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS);
            await pending;
            expect(signals).toHaveLength(2);
            expect(signals.every(s => s.aborted)).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe("GET /api/feeds/xbloom", () => {
    beforeEach(() => { jest.spyOn(console, "error").mockImplementation(() => undefined); });
    afterEach(() => { jest.restoreAllMocks(); });

    it("serves a cacheable feed and strips request queries from the advertised address", async () => {
        const res = await respond(new Request(`${FEED}?view=test`), catalogue([[row(), studio]]).fn);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
        expect((await res.json()).roaster.feed).toBe(FEED);
    });

    it("returns an uncached 502 for empty, malformed or failed upstream data", async () => {
        for (const fn of [
            catalogue([[]]).fn,
            async () => ({ok: true, status: 200, json: async () => ({code: 200, data: {list: null}})}),
            async () => ({ok: false, status: 503, json: async () => ({})})
        ]) {
            const res = await respond(new Request(FEED), fn);
            expect(res.status).toBe(502);
            expect(res.headers.get("cache-control")).toBe("no-store");
            expect(await res.json()).toEqual({error: "upstream"});
        }
    });

    it("answers HEAD and refuses other methods without calling upstream", async () => {
        expect((await respond(new Request(FEED, {method: "HEAD"}), catalogue([[row()]]).fn)).status).toBe(200);
        const fn = jest.fn();
        const res = await respond(new Request(FEED, {method: "POST"}), fn);
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toBe("GET, HEAD");
        expect(fn).not.toHaveBeenCalled();
    });

    it.each([" ", "a".repeat(257)])("refuses client-unreadable decoded share ids instead of caching an empty catalogue: %s", async id => {
        const res = await respond(new Request(FEED), catalogue([[row({
            shareRecipeLink: `https://share-h5.xbloom.com/?id=${encodeURIComponent(id)}`
        })]]).fn);
        expect(res.status).toBe(502);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});
