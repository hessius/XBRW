import {XBloomRecipe} from "@/library/XBloomRecipe";
import {decorateImport} from "@/library/importDecoration";
import {buildCard} from "./cardFixtures";
import {fullImportURL, importDetail} from "@/test-utils/importPageFixtures";
import {
    InvalidImportDataError, normaliseXBloomRecipe, recordOf, xbloomTitle
} from "@/library/xbloomRecipeData";

async function appRecipe(detail: unknown = importDetail()) {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(detail)));
    try {
        const importer = new XBloomRecipe({kind: "share", id: "fixture+id="}, "studio");
        await importer.fetchRecipeDetail();
        const recipe = importer.getRecipe();
        expect(recipe).not.toBeNull();
        if (recipe === null) throw new Error("Fixture must import");
        return recipe;
    } finally {
        fetchSpy.mockRestore();
    }
}

it("characterizes the app's complete import before extraction", async () => {
    const recipe = await appRecipe();
    expect(recipe).toMatchObject({
        dosage: 15, ratio: 16, grindSize: 54, grindRPM: 90, grinder: true,
        cupType: 2, defaultCups: 0, bypassEnabled: true, bypassVolume: 30, bypassTemp: 93,
        imageURL: "https://images.example.test/pod.jpg", xbloomName: "Morning coffee",
        xid: "XB0001", source: "import", shareId: "fixture+id="
    });
    expect(recipe.pours.map(p => p.pourPattern)).toEqual([0, 2, 1]);
    expect(recipe.pours.map(p => p.flowRate)).toEqual([30, 35, 30]);
    expect(recipe.pours.map(p => p.agitation)).toEqual([0, 1, 2]);
    expect(recipe).toMatchObject(normaliseXBloomRecipe(importDetail()));
});

it.each([
    ["coffee", {}, 2, 54, 16, [40, 120, 80]],
    ["tea", {cupType: 4}, 3, 50, 14, [40, 90, 80]],
    ["disabled grinder", {isSetGrinderSize: 2}, 2, 81, 16, [40, 120, 80]]
] as const)("keeps %s offline backup equal to the independent card oracle", async (
    _name, changes, cupType, grindSize, ratio, volumes
) => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, changes);
    const recipe = await appRecipe(detail);
    expect(recipe.offline_backup).toEqual(buildCard({
        hash: new Array(32).fill(0), xid: "XB0001", cupType, teaCups: 3,
        dosage: 15, grindRPM: 90, grindSize, ratio,
        pours: [
            {volume: volumes[0], temperature: 93, pattern: 0, agitation: 0, pauseSeconds: 30, flowRate: 30},
            {volume: volumes[1], temperature: 93, pattern: 2, agitation: 1, pauseSeconds: 15, flowRate: 35},
            {volume: volumes[2], temperature: 92, pattern: 1, agitation: 2, pauseSeconds: 0, flowRate: 30}
        ]
    }).slice(32));
});

const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["XPOD", {cupType: 1}, {cupType: 0}],
    ["Omni", {cupType: 2}, {cupType: 2}],
    ["other", {cupType: 3}, {cupType: 1}],
    ["missing cup", {cupType: undefined}, {cupType: 0}],
    ["unknown cup", {cupType: 999}, {cupType: 0}],
    ["tea", {cupType: 4}, {cupType: 3, defaultCups: 3, ratio: 14, bypassEnabled: false,
        pours: [{volume: 40}, {volume: 90}, {volume: 80}]}],
    ["Original grind is not converted", {adaptedModel: 2}, {grindSize: 54}],
    ["disabled grinder", {isSetGrinderSize: 2}, {grinder: false, grindSize: 54}],
    ["grinder sentinel", {grinderSize: 81}, {grinder: false, grindSize: 81}],
    ["missing grinder flag", {isSetGrinderSize: undefined}, {grinder: false}],
    ["missing grinder size", {grinderSize: undefined}, {grinder: false, grindSize: 81}],
    ["missing RPM", {rpm: undefined}, {grindRPM: 120}],
    ["low RPM", {rpm: 59}, {grindRPM: 120}],
    ["high RPM", {rpm: 121}, {grindRPM: 120}],
    ["minimum RPM", {rpm: 60}, {grindRPM: 60}],
    ["disabled bypass keeps amount", {isEnableBypassWater: 2}, {bypassEnabled: false, bypassVolume: 30, bypassTemp: 93}],
    ["zero bypass", {bypassVolume: 0}, {bypassEnabled: false, bypassVolume: 0, bypassTemp: 85}],
    ["excessive bypass", {bypassVolume: 501}, {bypassEnabled: false, bypassVolume: 0, bypassTemp: 85}],
    ["missing bypass temperature", {bypassTemp: undefined}, {bypassEnabled: true, bypassVolume: 30, bypassTemp: 85}],
    ["low bypass temperature", {bypassTemp: 38}, {bypassEnabled: true, bypassVolume: 30, bypassTemp: 85}],
    ["fractional bypass temperature", {bypassTemp: 92.5}, {bypassTemp: 93}],
    ["minimum bypass", {bypassVolume: 1, bypassTemp: 39}, {bypassEnabled: true, bypassVolume: 1, bypassTemp: 39}],
    ["maximum bypass", {bypassVolume: 500, bypassTemp: 99}, {bypassEnabled: true, bypassVolume: 500, bypassTemp: 99}],
    ["nonnumeric bypass", {bypassVolume: "30"}, {bypassEnabled: false, bypassVolume: 0, bypassTemp: 85}],
    ["no pod", {podsVo: undefined}, {xid: "", xbloomName: "Morning coffee"}],
    ["zero stages", {pourCount: 0}, {pours: [], ratio: 0}],
    ["ratio follows volumes, not grandWater", {grandWater: 99}, {ratio: 16}],
    ["no rescaling or BLE grind restriction", {grinderSize: 20, dose: 14}, {grindSize: 20, ratio: 17,
        pours: [{volume: 40}, {volume: 120}, {volume: 80}]}]
];

it.each(cases)("%s has independent expectations and app parity", async (_name, changes, expected) => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, changes);
    const data = normaliseXBloomRecipe(detail);
    expect(data).toMatchObject(expected);
    const recipe = await appRecipe(detail);
    expect(recipe).toMatchObject(expected);
    expect(recipe).toMatchObject(data);
});

it.each([[99.4, 99], [92.5, 93], [38, 39]])(
    "normalizes stage temperature %s to %s without changing volume", async (raw, expected) => {
        const detail = importDetail();
        detail.recipeVo.pourList[0].temperature = raw;
        const data = normaliseXBloomRecipe(detail);
        expect(data.pours[0]).toMatchObject({temperature: expected, volume: 40, pauseTime: 30, pourNumber: 1});
        expect(await appRecipe(detail)).toMatchObject(data);
    }
);

it.each([[1, 2, 2, 0, 0], [2, 1, 2, 2, 1], [3, 2, 1, 1, 2], [999, 1, 1, 1, 3]])(
    "maps pattern %s and vibration flags %s/%s independently", async (pattern, before, after, expectedPattern, agitation) => {
        const detail = importDetail();
        Object.assign(detail.recipeVo.pourList[0], {
            pattern, isEnableVibrationBefore: before, isEnableVibrationAfter: after
        });
        const data = normaliseXBloomRecipe(detail);
        expect(data.pours[0]).toMatchObject({pourPattern: expectedPattern, agitation});
        expect(await appRecipe(detail)).toMatchObject(data);
    }
);

it("preserves nameless pod artwork without inventing a coffee or recipe title", async () => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, {theName: ""});
    Object.assign(detail.recipeVo.podsVo, {theName: "", subtitle: "Only a subtitle"});
    const data = normaliseXBloomRecipe(detail);
    expect(data.xbloomName).toBe("");
    expect(data).not.toHaveProperty("coffee");
    expect(data.imageURL).toBe("https://images.example.test/pod.jpg");
    expect(await appRecipe(detail)).toMatchObject(data);
});

it.each([undefined, null])("imports an absent recipe title (%s) before producer decoration", async theName => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, {theName});
    const recipe = await appRecipe(detail);
    expect(recipe.xbloomName).toBe("");
    decorateImport(recipe, {recipeName: "Producer recipe"});
    expect(recipe.name).toBe("Producer recipe");
    expect(recipe.pours).toHaveLength(3);
});

it("omits absent coffee, artwork and attribution instead of inventing fallbacks", async () => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, {podsVo: null});
    const data = normaliseXBloomRecipe(detail);
    for (const key of ["coffee", "imageURL", "sharedBy", "sharedByAvatar"]) {
        expect(data).not.toHaveProperty(key);
    }
    expect(await appRecipe(detail)).toMatchObject(data);
});

it("preserves response attribution and applies the HTTPS artwork rule", async () => {
    const detail = {
        ...importDetail(), shareMemberName: "Shared by a person",
        shareMemberHead: "https://images.example.test/avatar.jpg"
    };
    const data = normaliseXBloomRecipe(detail);
    expect(data).toMatchObject({
        sharedBy: "Shared by a person", sharedByAvatar: "https://images.example.test/avatar.jpg",
        coffee: {name: "Pod coffee", imageUrl: "https://images.example.test/pod.jpg"}
    });
    expect(await appRecipe(detail)).toMatchObject(data);
    Object.assign(detail, {shareMemberHead: "http://images.example.test/avatar.jpg"});
    Object.assign(detail.recipeVo.podsVo, {imagePath: "http://images.example.test/pod.jpg"});
    const unsafe = normaliseXBloomRecipe(detail);
    expect(unsafe).not.toHaveProperty("imageURL");
    expect(unsafe).not.toHaveProperty("sharedByAvatar");
    expect(unsafe.coffee).not.toHaveProperty("imageUrl");
    expect(await appRecipe(detail)).toMatchObject(unsafe);
});

it("retains the account-row empty title quirk and share identity", () => {
    const detail = importDetail();
    expect(normaliseXBloomRecipe(detail).xbloomName).toBe("Morning coffee");
    const data = normaliseXBloomRecipe(detail, "");
    expect(data.xbloomName).toBe("");
    const recipe = XBloomRecipe.fromAccountRow(detail.recipeVo).getRecipe();
    expect(recipe).not.toBeNull();
    expect(recipe).toMatchObject({...data, shareId: "fixture+id="});
    expect(recipe?.offline_backup.length).toBeGreaterThan(0);
    expect(normaliseXBloomRecipe(detail, "Explicit title").xbloomName).toBe("Explicit title");
});

it("keeps the complete synthetic producer URL losslessly encoded", () => {
    const url = fullImportURL();
    expect(url.origin + url.pathname).toBe("https://preview.example.test/import");
    expect(Array.from(url.searchParams.keys())).toHaveLength(33);
    expect(url.searchParams.get("recipe.name")).toBe("Producer's morning recipe");
    expect(url.searchParams.get("recipe.url")).toBe("https://producer.example.test/recipe?one=1&two=2");
    expect(url.searchParams.get("share")).toBe("https://share-h5.xbloom.com/?id=fixture%2Bid%3D");
    expect(url.searchParams.get("bean.note")).toBe("A complete description.\nA second paragraph.");
    expect(url.searchParams.get("future")).toBe("Keep + / = % & Unicode é");
    expect(url.searchParams.get("bean.rest_days")).toBe("0");
    expect(url.searchParams.get("bean.decaffeinated")).toBe("0");
});

it.each([
    ["Coffee", "Subtitle", "Coffee | Subtitle"],
    ["Coffee", "明谦", "Coffee"],
    ["Coffee", "明 only", "Coffee | 明 only"],
    ["Coffee", "谦 only", "Coffee | 谦 only"],
    ["", "Subtitle", ""],
    ["Coffee", "", "Coffee"]
])("formats title %s / %s", (name, subtitle, expected) => {
    expect(xbloomTitle(name, subtitle)).toBe(expected);
});

it.each([null, [], "bad", 1, undefined])("rejects a non-record %p with a fixed error", value => {
    expect(() => recordOf(value)).toThrow(InvalidImportDataError);
    expect(() => recordOf(value)).toThrow("Invalid recipe data");
    expect(() => normaliseXBloomRecipe(value)).toThrow(InvalidImportDataError);
});

it("returns the original guarded record", () => {
    const row = {dose: 15};
    expect(recordOf(row)).toBe(row);
});

it.each([
    {recipeVo: null}, {recipeVo: []},
    ...[
        {dose: "15"}, {dose: NaN}, {dose: Infinity}, {grinderSize: "54"}, {cupType: "2"},
        {pourCount: -1}, {pourCount: 1.5}, {pourCount: 4}, {pourCount: "3"},
        {pourList: {}}, {pourList: [null]}, {podsVo: []}
    ].map(changes => ({...importDetail(), recipeVo: {...importDetail().recipeVo, ...changes}})),
    ...["volume", "temperature", "flowRate", "pausing"].flatMap(key =>
        ["<b>bad</b>", NaN, Infinity, undefined].map(value => {
            const detail = importDetail();
            Object.assign(detail.recipeVo.pourList[0], {[key]: value});
            return detail;
        }))
])("rejects malformed structural/numeric data %# with a constant error", detail => {
    expect(() => normaliseXBloomRecipe(detail)).toThrow(InvalidImportDataError);
    expect(() => normaliseXBloomRecipe(detail)).toThrow("Invalid recipe data");
});
