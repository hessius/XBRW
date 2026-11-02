import {fullImportURL, importDetail} from "../../test-utils/importPageFixtures";
import {MAX_URL, SHORT_TEXT, parseBrewMindLink} from "../../library/brewmindLink";
import {parseImportInput} from "../../library/importInput";
import {decorateImport} from "../../library/importDecoration";
import Recipe from "../../library/Recipe";
import {InvalidImportDataError, normaliseXBloomRecipe} from "../../library/xbloomRecipeData";
import type {MachineModel} from "../../library/machine/machineModel";
import {buildImportView, canonicalShareURL, sourcePageURL} from "../_lib/importView";

function viewFor(detail: unknown = importDetail(), url = fullImportURL(), model?: MachineModel) {
    const link = parseBrewMindLink(url.toString());
    expect(link).not.toBeNull();
    const source = parseImportInput(link!.share);
    expect(source).not.toBeNull();
    return buildImportView(detail, link!, source!, url.search, model);
}

describe("buildImportView", () => {
    it("keeps complete coffee, distinct photos and the lossless app handoff", () => {
        const url = fullImportURL();
        const link = parseBrewMindLink(url.toString());
        expect(link).not.toBeNull();
        const source = parseImportInput(link!.share);
        expect(source).not.toBeNull();

        const view = buildImportView(importDetail(), link!, source!, url.search);

        expect(view.recipe.name).toBe("Producer's morning recipe");
        expect(view.recipe.coffee?.roaster).toBe("Example Roastery");
        expect(view.recipe.imageURL).toBe("https://images.example.test/pod.jpg");
        expect(view.recipe.coffee?.imageUrl).toBe("https://images.example.test/bag.jpg");
        expect(new URL(view.openAppURL).search).toBe(url.search);
        expect(new URL(view.openAppURL).searchParams.get("future")).toBe("Keep + / = % & Unicode é");
        expect(view.model).toBe("studio");
    });

    it("retains every valid bean field and parsed root metadata", () => {
        const url = fullImportURL();
        const view = viewFor(importDetail(), url);

        expect(view.link).toEqual(parseBrewMindLink(url.toString()));
        expect(view.recipe.coffee).toEqual({
            name: "Bag coffee", roaster: "Example Roastery",
            imageUrl: "https://images.example.test/bag.jpg", url: "https://producer.example.test/coffee",
            origin: "East Africa", country: "Ethiopia", region: "Guji", farm: "Example Farm",
            farmer: "Example Farmer", elevation: 1798, processing: "Natural", fermentation: "Anaerobic",
            variety: "Heirloom", beanMix: "Single Origin", roast: "Light", roastingDate: "2026-10-01",
            aromatics: "Stone fruit and jasmine", flavours: ["Apricot", "Jasmine"],
            note: "A complete description.\nA second paragraph.", cupping_points: 86.5,
            decaffeinated: false, restDays: 0, peakDay: 14, bestUntilDay: 35
        });
        expect(view.recipe.recipeUrl).toBe("https://producer.example.test/recipe?one=1&two=2");
        expect(view.recipe.xbloomName).toBe("Morning coffee");
        expect(view.recipe.tags).toEqual(["Morning", "Filter", "Light", "Natural", "Anaerobic"]);
        expect(view.recipe.source).toBe("brewmind");
        expect(view.recipe.accentIndex).toEqual(expect.any(Number));
        expect(view.link.feed).toBe("https://producer.example.test/feed.json");
        expect(view.link.colour).toBe("#338855");
        expect(view.link.flavours).toEqual(["Apricot", "Jasmine"]);
    });

    it("hands the original query to the app byte for byte, with duplicate and unknown parameters", () => {
        const url = fullImportURL();
        url.search += "&duplicate=first&duplicate=second&space=%20%09%0A&literal=a+b%2Bc%2Fd%3De%25%26"
            + "&nested=https%3A%2F%2Fexample.test%2F%3Fid%3Da%252Bb%252F%253D&unicode=%C3%A9";
        const view = viewFor(importDetail(), url);

        expect(view.openAppURL).toBe(`xbrw://import${url.search}`);
        expect(new URL(view.openAppURL).search).toBe(url.search);
        expect(new URL(view.openAppURL).searchParams.getAll("duplicate")).toEqual(["first", "second"]);
        expect(new URL(view.openAppURL).searchParams.get("space")).toBe(" \t\n");
        expect(new URL(view.openAppURL).searchParams.get("nested")).toBe("https://example.test/?id=a%2Bb%2F%3D");
        expect(parseBrewMindLink(view.openAppURL)).toEqual(view.link);
        expect(new URL(view.openAppURL).searchParams.has("model")).toBe(false);
    });

    it("uses the actual parser's canonical metadata for legacy aliases", () => {
        const canonical = fullImportURL();
        const aliases = fullImportURL();
        for (const [legacy, current] of [
            ["image", "imageUrl"], ["roastDate", "roastingDate"], ["roastLevel", "roast"],
            ["process", "processing"], ["cuppingScore", "cupping_points"], ["decaf", "decaffeinated"],
            ["rest_days", "restDays"], ["peak_day", "peakDay"], ["best_until_day", "bestUntilDay"],
            ["color", "colour"]
        ]) {
            const value = canonical.searchParams.get(`bean.${current}`)
                ?? canonical.searchParams.get(`bean.${legacy}`);
            expect(value).not.toBeNull();
            canonical.searchParams.delete(`bean.${legacy}`);
            canonical.searchParams.set(`bean.${current}`, value!);
            aliases.searchParams.delete(`bean.${current}`);
            aliases.searchParams.set(`bean.${legacy}`, value!);
        }
        const canonicalView = viewFor(importDetail(), canonical);
        const aliasView = viewFor(importDetail(), aliases);
        expect(aliasView.link).toEqual(canonicalView.link);
        expect(aliasView.link).toEqual(parseBrewMindLink(aliases.toString()));
        expect(aliasView.recipe.coffee).toEqual(canonicalView.recipe.coffee);
        expect(aliasView.recipe.tags).toEqual(canonicalView.recipe.tags);
        expect(aliasView.recipe.accentIndex).toBe(canonicalView.recipe.accentIndex);
        expect(new URL(aliasView.openAppURL).search).toBe(aliases.search);
    });

    it("leaves optional invalid fields and caps to the parser", () => {
        const url = fullImportURL();
        url.searchParams.set("bean.roaster", "r".repeat(SHORT_TEXT + 1));
        url.searchParams.set("bean.image", "http://images.example.test/bag.jpg");
        url.searchParams.set("bean.roastingDate", "2026-02-31");
        url.searchParams.set("recipe.url", "javascript:alert(1)");
        url.searchParams.set("feed", `https://producer.example.test/${"x".repeat(MAX_URL)}`);
        const view = viewFor(importDetail(), url);
        expect(view.link).toEqual(parseBrewMindLink(url.toString()));
        expect(view.recipe.coffee).toEqual(view.link.coffee);
        expect(view.recipe.coffee?.roaster).toBeUndefined();
        expect(view.recipe.coffee?.imageUrl).toBeUndefined();
        expect(view.recipe.coffee?.roastingDate).toBeUndefined();
        expect(view.recipe.recipeUrl).toBeUndefined();
        expect(view.link.feed).toBeUndefined();
        expect(new URL(view.openAppURL).search).toBe(url.search);
    });

    it.each(["", "   "])("requires bean.name before retaining supplied coffee: %j", (name) => {
        const url = fullImportURL();
        url.searchParams.set("bean.name", name);
        const view = viewFor(importDetail(), url);
        expect(view.link.coffee).toBeUndefined();
        expect(view.recipe.coffee?.name).toBe("Pod coffee");
        expect(view.recipe.coffee?.roaster).toBeUndefined();
    });

    it.each(["2", "", "01"])("lets the actual parser refuse version %j", (version) => {
        const url = fullImportURL();
        url.searchParams.set("v", version);
        expect(parseBrewMindLink(url.toString())).toBeNull();
    });

    it.each(["brewmind", "BrewMind", "a different producer"])("retains stated source %j", (source) => {
        const url = fullImportURL();
        url.searchParams.set("source", source);
        const view = viewFor(importDetail(), url);
        expect(view.link.source).toBe(source);
        expect(view.recipe.source).toBe(source === "brewmind" ? "brewmind" : "import");
    });

    it.each(["upstream coffee", "pod artwork", "link image"])(
        "matches fresh app decoration precedence with %s",
        (artwork) => {
            const detail = importDetail();
            const pods = {
                ...detail.recipeVo.podsVo,
                roaster: "Upstream Roastery", country: "Upstream country", farm: "Upstream Farm",
                imagePath: artwork === "link image" ? "" : "https://images.example.test/pod.jpg",
                theName: artwork === "pod artwork" ? "" : "Pod coffee"
            };
            const input = {...detail, shareMemberName: "Upstream author",
                shareMemberHead: "https://images.example.test/author.jpg",
                recipeVo: {...detail.recipeVo, podsVo: pods}};
            const view = viewFor(input);
            const appRecipe = Object.assign(new Recipe(), normaliseXBloomRecipe(input));
            decorateImport(appRecipe, {
                coffee: view.link.coffee, recipeUrl: view.link.recipeUrl, recipeName: view.link.recipeName,
                tags: view.link.tags, colour: view.link.colour, feed: view.link.feed, source: "brewmind"
            });
            for (const key of [
                "coffee", "name", "xbloomName", "recipeUrl", "imageURL", "sharedBy",
                "sharedByAvatar", "tags", "source", "accentIndex"
            ] as const) expect(view.recipe[key]).toEqual(appRecipe[key]);
            expect(view.recipe.coffee).toEqual(view.link.coffee);
            expect(view.recipe.coffee?.farm).toBe("Example Farm");
            expect(view.recipe.sharedBy).toBe("Upstream author");
            expect(view.recipe.sharedByAvatar).toBe("https://images.example.test/author.jpg");
            expect(view.recipe.imageURL).toBe(artwork === "link image"
                ? "https://images.example.test/bag.jpg" : "https://images.example.test/pod.jpg");
        }
    );

    it("replaces upstream coffee wholesale rather than merging into the supplied bean", () => {
        const detail = importDetail();
        const input = {...detail, recipeVo: {...detail.recipeVo, podsVo: {
            ...detail.recipeVo.podsVo, roaster: "Upstream Roastery", country: "Upstream country",
            introduce: "Upstream narrative"
        }}};
        const url = new URL("https://preview.example.test/import");
        url.searchParams.set("v", "1");
        url.searchParams.set("share", fullImportURL().searchParams.get("share")!);
        url.searchParams.set("bean.name", "Only a bean name");
        const view = viewFor(input, url);
        const appRecipe = Object.assign(new Recipe(), normaliseXBloomRecipe(input));
        decorateImport(appRecipe, {coffee: view.link.coffee, source: "import"});
        expect(view.recipe.coffee).toEqual({name: "Only a bean name"});
        expect(view.recipe.coffee).toEqual(appRecipe.coffee);
        expect(view.recipe.imageURL).toBe("https://images.example.test/pod.jpg");
        expect(view.recipe.name).toBe("");
        expect(view.recipe.xbloomName).toBe("Morning coffee");
        expect(view.recipe.source).toBe("import");
    });

    it("keeps shared mapper defaults for absent optional numbers", () => {
        const detail = importDetail();
        const input = {...detail, recipeVo: {...detail.recipeVo,
            grinderSize: undefined, cupType: undefined, rpm: undefined,
            pourList: detail.recipeVo.pourList.map(pour => ({...pour,
                pattern: undefined, isEnableVibrationBefore: undefined, isEnableVibrationAfter: undefined
            }))}};
        const view = viewFor(input);
        expect(view.recipe.grindSize).toBe(normaliseXBloomRecipe(input).grindSize);
        expect(view.recipe.cupType).toBe(normaliseXBloomRecipe(input).cupType);
        expect(view.recipe.grindRPM).toBe(120);
        expect(view.recipe.pours).toEqual(normaliseXBloomRecipe(input).pours);
    });

    it.each<[unknown, MachineModel | undefined, MachineModel]>([
        [undefined, undefined, "studio"], [undefined, "original", "original"],
        [2, undefined, "original"], [2, "studio", "original"], [1, "original", "studio"]
    ])("selects row model %j over requested %j as %s without converting grind", (adaptedModel, requested, expected) => {
        const detail = importDetail();
        const input = {...detail, recipeVo: {...detail.recipeVo, adaptedModel, grinderSize: 26}};
        const url = fullImportURL();
        url.searchParams.set("share", "XB0001");
        const view = viewFor(input, url, requested);
        expect(view.model).toBe(expected);
        expect(view.recipe.grindSize).toBe(26);
        expect(view.openAppURL).toBe(`xbrw://import${url.search}`);
        expect(new URL(view.openAppURL).searchParams.has("model")).toBe(false);
    });

    it.each([null, 0, 3, "2", true, {}, NaN, Infinity])("rejects explicit invalid model %j", (adaptedModel) => {
        const detail = importDetail();
        expect(() => viewFor({...detail, recipeVo: {...detail.recipeVo, adaptedModel}}))
            .toThrow(InvalidImportDataError);
    });

    it.each(["dose", "grinderSize", "cupType", "pourCount", "rpm"])(
        "rejects wrong-type or nonfinite row scalar %s",
        (key) => {
            for (const value of ["15", null, true, {}, [], NaN, Infinity, -Infinity]) {
                const detail = importDetail();
                expect(() => viewFor({...detail, recipeVo: {...detail.recipeVo, [key]: value}}))
                    .toThrow(InvalidImportDataError);
            }
        }
    );

    it.each(["volume", "temperature", "flowRate", "pausing", "pattern",
        "isEnableVibrationBefore", "isEnableVibrationAfter"])(
        "rejects wrong-type or nonfinite stage scalar %s",
        (key) => {
            for (const value of ["3", null, true, {}, [], NaN, Infinity, -Infinity]) {
                const detail = importDetail();
                const pourList = [{...detail.recipeVo.pourList[0], [key]: value}, ...detail.recipeVo.pourList.slice(1)];
                expect(() => viewFor({...detail, recipeVo: {...detail.recipeVo, pourList}}))
                    .toThrow(InvalidImportDataError);
            }
        }
    );

    it.each([0, -1, Number.MIN_VALUE])("rejects nonpositive dose or overflowing ratio at dose %s", (dose) => {
        const detail = importDetail();
        expect(() => viewFor({...detail, recipeVo: {...detail.recipeVo, dose}})).toThrow(InvalidImportDataError);
    });

    it.each(["flowRate", "volume"])("rejects overflow from finite stage %s inputs", (key) => {
        const detail = importDetail();
        const pourList = detail.recipeVo.pourList.map(pour => ({...pour, [key]: Number.MAX_VALUE}));
        expect(() => viewFor({...detail, recipeVo: {...detail.recipeVo, pourList}})).toThrow(InvalidImportDataError);
    });

    it.each([null, [], {}, {recipeVo: null}, {recipeVo: []},
        {recipeVo: {...importDetail().recipeVo, pourCount: 4}},
        {recipeVo: {...importDetail().recipeVo, pourCount: 1.5}},
        {recipeVo: {...importDetail().recipeVo, pourList: [null, null, null]}}
    ])("classifies malformed detail as InvalidImportDataError: %#", (detail) => {
        expect(() => viewFor(detail)).toThrow(InvalidImportDataError);
    });

    it("retains shared mapper semantics without adding card or brew limits", () => {
        const detail = importDetail();
        const input = {...detail, recipeVo: {...detail.recipeVo, dose: 150, grinderSize: 26,
            pourList: detail.recipeVo.pourList.map(pour => ({...pour, temperature: 105, volume: 400}))}};
        const view = viewFor(input);
        expect(view.recipe.dosage).toBe(150);
        expect(view.recipe.grindSize).toBe(26);
        expect(view.recipe.pours).toEqual(normaliseXBloomRecipe(input).pours);
        expect(view.recipe.bypassTemp).toBe(93);
        expect(view.recipe.pours.map(pour => pour.pourPattern)).toEqual([0, 2, 1]);
        expect(view.recipe.pours.map(pour => pour.agitation)).toEqual([0, 1, 2]);
    });
});

describe("original xBloom destination", () => {
    it("encodes opaque ids exactly once", () => {
        const id = "id+/%=& café";
        const url = new URL(canonicalShareURL(id));
        expect(url.origin).toBe("https://share-h5.xbloom.com");
        expect(url.pathname).toBe("/");
        expect(url.searchParams.get("id")).toBe(id);
        expect(parseImportInput(url.toString())).toEqual({kind: "share", id});
    });

    it.each(["/", "/r", "/anything/else"])("retains genuine HTTPS share path %s", (path) => {
        const supplied = `https://share-h5.xbloom.com${path}?id=opaque%2B%2F%3D&other=kept#fragment`;
        const source = parseImportInput(supplied);
        expect(source).not.toBeNull();
        expect(sourcePageURL(source!, supplied)).toBe(supplied);
        const url = fullImportURL();
        url.searchParams.set("share", supplied);
        expect(viewFor(importDetail(), url).xbloomURL).toBe(supplied);
    });

    it.each([
        "https://unknown.example.test/r?id=opaque%2B%2F%3D",
        "http://share-h5.xbloom.com/r?id=opaque%2B%2F%3D",
        "https://user:password@share-h5.xbloom.com/r?id=opaque%2B%2F%3D",
        "https://share-h5.xbloom.com:8443/r?id=opaque%2B%2F%3D",
        "https://share-h5.xbloom.com.evil.test/r?id=opaque%2B%2F%3D"
    ])("canonicalises rather than labels an untrusted source as xBloom: %s", (supplied) => {
        const source = parseImportInput(supplied);
        expect(source).toEqual({kind: "share", id: "opaque+/="});
        expect(sourcePageURL(source!, supplied)).toBe(canonicalShareURL("opaque+/="));
    });

    it("uses only the parsed upstream share id for a pod destination", () => {
        const url = fullImportURL();
        url.searchParams.set("share", "XB0001");
        const detail = importDetail();
        detail.recipeVo.shareRecipeLink = "http://unrelated.example.test/product?id=opaque%2B%2F%3D";
        expect(viewFor(detail, url).xbloomURL).toBe(canonicalShareURL("opaque+/="));
    });

    it.each([undefined, null, 42, {}, "", "XB0001", "not a URL",
        "https://xbloom.com/products/coffee", "https://share-h5.xbloom.com/?id=%20"
    ])("does not guess a pod share destination from %j", (podShare) => {
        expect(sourcePageURL({kind: "xid", xid: "XB0001"}, "XB0001", podShare)).toBeUndefined();
        const detail = importDetail();
        const url = fullImportURL();
        url.searchParams.set("share", "XB0001");
        expect(viewFor({...detail, recipeVo: {...detail.recipeVo, shareRecipeLink: podShare}}, url).xbloomURL)
            .toBeUndefined();
    });
});
