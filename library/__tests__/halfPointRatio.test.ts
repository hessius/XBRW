import {validateSharePayload} from "@/api/_lib/payload";
import {brewProblems, cardWriteProblems} from "@/library/cardLimits";
import {fingerprint} from "@/library/cloud/fingerprint";
import {halfPointRatioFor, repairHalfPointBlob, repairHalfPointImport} from "@/library/halfPointRepair";
import {contentPrint, planReimport, takeLatest} from "@/library/importRefresh";
import {encodeCoffeeBlob} from "@/library/machine/protocol";
import {applyQuickEdit, quickEditProblems} from "@/library/quickEdit";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {buildSharePayload} from "@/library/shareLink";
import {snapshotRecipe} from "@/library/slots/slotModel";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import {normaliseXBloomRecipe} from "@/library/xbloomRecipeData";

/**
 * Half-point ratios from xBloom, through the door they really arrive by.
 *
 * `Recipe.ratio.test.ts` proves a `Recipe` holding 1:15.5 is valid, and builds
 * that recipe by hand. The importer rounded the ratio before any such recipe
 * could exist, so those tests stayed green while the shared recipe they name
 * still imported at 1:15 and was refused. These start from the payload.
 *
 * The figures are xBloom's live answers for real share links, read on
 * 2026-11-08: Uganda `2Lz2R0d1t5O7bKqXl2NpEw==`, Hydrangea
 * `Wr8X9ShLh53zxRv/IOdvAw==`, and Colombia from the Central Coast Coffee feed.
 */
type Shape = {dose: number; grandWater: unknown; volumes: number[]; cupType?: number};

const UGANDA: Shape = {dose: 18, grandWater: 14.5, volumes: [70, 104, 87]};
const COLOMBIA: Shape = {dose: 18, grandWater: 15.5, volumes: [62, 106, 111]};
const HYDRANGEA: Shape = {dose: 15, grandWater: 15.5, volumes: [60, 60, 60, 52]};

function payload({dose, grandWater, volumes, cupType = 2}: Shape) {
    return {
        theName: "Half point", dose, grandWater, cupType, grinderSize: 65, isSetGrinderSize: 1, rpm: 60,
        pourCount: volumes.length,
        pourList: volumes.map(volume => ({
            volume, temperature: 92, flowRate: 3.5, pattern: 3, pausing: 20,
            isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
        })),
        podsVo: {id: "XB0001"}
    };
}

function imported(shape: Shape): Recipe {
    const recipe = XBloomRecipe.fromAccountRow(payload(shape)).getRecipe();
    if (recipe === null) throw new Error("The fixture must import");
    recipe.shareId = "share-1";
    return recipe;
}

/** A copy as the old importer saved it: rounded ratio, snapshot taken at that ratio. */
function savedByOldImporter(shape: Shape, rounded: number): Recipe {
    const recipe = imported(shape);
    recipe.ratio = rounded;
    recipe.offline_backup = recipe.getData();
    return new Recipe(undefined, JSON.stringify(recipe));
}

const volumesOf = (recipe: Recipe) => recipe.pours.map(pour => pour.volume);

describe("normaliseXBloomRecipe keeps xBloom's ratio", () => {
    it.each([
        ["18 g at 1:14.5 pouring 261 ml", UGANDA, 14.5],
        ["18 g at 1:15.5 pouring 279 ml", COLOMBIA, 15.5],
        ["15 g at 1:15.5 pouring 232 of 232.5 ml", HYDRANGEA, 15.5]
    ])("%s", (_label, shape, ratio) => {
        expect(normaliseXBloomRecipe({recipeVo: payload(shape)}).ratio).toBe(ratio);
        expect(imported(shape).ratio).toBe(ratio);
        expect(imported(shape).isPourVolumeValid()).toBe(true);
    });

    it.each([
        ["a half-point grandWater the stages do not match", {...UGANDA, grandWater: 15.5}, 15],
        ["a grandWater a whole millilitre out", {...HYDRANGEA, volumes: [60, 60, 60, 54], grandWater: 15.5}, 16],
        ["a volume in grandWater's place", {...UGANDA, grandWater: 261}, 15],
        ["a missing grandWater", {...UGANDA, grandWater: undefined}, 15],
        ["a grandWater that is a string", {...UGANDA, grandWater: "14.5"}, 15],
        ["a zero grandWater", {...UGANDA, grandWater: 0}, 15],
        ["an infinite grandWater", {...UGANDA, grandWater: Infinity}, 15]
    ])("falls back to the volumes for %s", (_label, shape, ratio) => {
        expect(normaliseXBloomRecipe({recipeVo: payload(shape)}).ratio).toBe(ratio);
    });

    it("is unchanged for a whole-number recipe", () => {
        const shape = {dose: 18, grandWater: 16, volumes: [100, 100, 88]};
        expect(normaliseXBloomRecipe({recipeVo: payload(shape)}).ratio).toBe(16);
    });

    it("still derives tea's ratio from its clamped volumes", () => {
        const tea = {dose: 5, grandWater: 15.5, volumes: [120, 90], cupType: 4};
        const data = normaliseXBloomRecipe({recipeVo: payload(tea)});
        expect(data.pours.map(pour => pour.volume)).toEqual([90, 90]);
        expect(data.ratio).toBe(36);
        expect(imported(tea).ratio).toBe(36);
    });
});

describe("what a half-point import can do", () => {
    it.each([["Uganda", UGANDA], ["Colombia", COLOMBIA], ["Hydrangea", HYDRANGEA]])(
        "%s brews", (_name, shape) => {
            expect(brewProblems(imported(shape))).toEqual([]);
        }
    );

    it("is refused for a card, with the reason", () => {
        expect(cardWriteProblems(imported(UGANDA)))
            .toContain("The ratio is 1:14.5. It has to be a whole number.");
        expect(cardWriteProblems(imported(COLOMBIA)))
            .toContain("The ratio is 1:15.5. It has to be a whole number.");
    });

    it("reaches the machine as a whole byte, not as the fractional ratio", () => {
        const blob = encodeCoffeeBlob(imported(UGANDA));
        expect(blob[blob.length - 1]).toBe(145);
        expect(Array.from(blob).every(Number.isInteger)).toBe(true);
    });

    it("can go in an Easy Mode slot, and its bytes are whole", () => {
        const snapshot = snapshotRecipe(imported(COLOMBIA));
        expect(snapshot.blob[snapshot.blob.length - 1]).toBe(155);
        expect(snapshot.blob.every(Number.isInteger)).toBe(true);
    });

    it("survives a share link and coming back from it", () => {
        const original = imported(UGANDA);
        const shared = buildSharePayload(original, "studio");
        expect(shared.grandWater).toBe(14.5);
        expect(validateSharePayload(shared)).toBeNull();

        const back = normaliseXBloomRecipe({recipeVo: {
            ...shared, pourList: JSON.parse(shared.pourDataJSONStr)
        }});
        expect(back.ratio).toBe(14.5);
        expect(back.pours.map(pour => pour.volume)).toEqual([70, 104, 87]);
    });

    it("stays 1:14.5 through the JSON a save writes", () => {
        const copy = new Recipe(undefined, JSON.stringify(imported(UGANDA)));
        expect(copy.ratio).toBe(14.5);
        expect(brewProblems(copy)).toEqual([]);
    });

    it.each([[15, 218], [18, 261], [20, 290]])(
        "a quick edit to %i g keeps the ratio and rescales to %i ml", (dose, total) => {
            const recipe = imported(UGANDA);
            const edited = applyQuickEdit(recipe, {dose});
            expect(edited.ratio).toBe(14.5);
            expect(edited.getPourTotalVolume()).toBe(total);
            expect(quickEditProblems(recipe, {dose})).toEqual([]);
        }
    );
});

describe("a saved copy the old importer rounded", () => {
    it.each([
        ["Uganda", UGANDA, 15, 14.5],
        ["Colombia", COLOMBIA, 16, 15.5],
        ["Hydrangea", HYDRANGEA, 15, 15.5]
    ])("%s is given its ratio back, and no stage moves", (_name, shape, rounded, ratio) => {
        const saved = savedByOldImporter(shape, rounded);
        const before = volumesOf(saved);
        expect(brewProblems(saved).length).toBeGreaterThan(0);

        expect(repairHalfPointImport(saved)).toBe(true);

        expect(saved.ratio).toBe(ratio);
        expect(volumesOf(saved)).toEqual(before);
        expect(brewProblems(saved)).toEqual([]);
    });

    it("keeps an account copy reading as untouched", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        saved.cloudId = 7;
        saved.cloudFingerprint = fingerprint(saved);
        repairHalfPointImport(saved);
        expect(saved.cloudFingerprint).toBe(fingerprint(saved));
    });

    it("leaves a user's edit marking an account copy as edited", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        saved.cloudFingerprint = "edited-since";
        repairHalfPointImport(saved);
        expect(saved.cloudFingerprint).toBe("edited-since");
    });

    it("patches only the ratio in the stored blob", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        const json = JSON.stringify(saved);
        const repaired = repairHalfPointBlob(json);
        expect(repaired?.ratio).toBe(14.5);
        expect(JSON.parse(repaired?.json ?? "{}")).toEqual({...JSON.parse(json), ratio: 14.5});
    });

    it("reads an unreadable blob as nothing to do", () => {
        expect(repairHalfPointBlob("{not json")).toBeNull();
    });

    /** The snapshot of a recipe that arrived differently from how it reads now. */
    function arrivedAs(recipe: Recipe, change: (arrived: Recipe) => void): void {
        const arrived = new Recipe(undefined, JSON.stringify(recipe));
        change(arrived);
        recipe.offline_backup = arrived.getData();
    }

    const declined: [string, (recipe: Recipe) => void][] = [
        ["made here", recipe => { recipe.source = "manual"; }],
        ["duplicated by the user", recipe => { recipe.source = "duplicate"; }],
        ["read from a card", recipe => { recipe.source = "read"; }],
        ["naming no xBloom recipe", recipe => { recipe.shareId = ""; recipe.xid = ""; }],
        ["with no import snapshot", recipe => { recipe.offline_backup = []; }],
        ["with stages changed since import", recipe => arrivedAs(recipe, arrived => { arrived.pours[2].volume = 96; })],
        ["with a ratio changed since import", recipe => arrivedAs(recipe, arrived => { arrived.ratio = 16; })],
        ["with a dose changed since import", recipe => arrivedAs(recipe, arrived => { arrived.dosage = 20; })],
        ["whose ratio is not what rounding gave", recipe => { recipe.ratio = 16; }]
    ];

    it.each(declined)("is left alone when %s", (_label, change) => {
        const saved = savedByOldImporter(UGANDA, 15);
        change(saved);
        const before = JSON.stringify(saved);
        expect(repairHalfPointImport(saved)).toBe(false);
        expect(JSON.stringify(saved)).toBe(before);
    });

    it("is left alone when it is tea", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        saved.cupType = CUP_TYPE.TEA;
        expect(halfPointRatioFor(saved)).toBeNull();
    });

    it("is left alone when it already brews", () => {
        const whole = savedByOldImporter({dose: 18, grandWater: 16, volumes: [100, 100, 88]}, 16);
        expect(halfPointRatioFor(whole)).toBeNull();
    });

    it("is left alone when the stages are not on a half point", () => {
        const off = savedByOldImporter({dose: 18, grandWater: 15, volumes: [70, 104, 90]}, 15);
        expect(halfPointRatioFor(off)).toBeNull();
    });

    it("needs no second repair", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        repairHalfPointImport(saved);
        expect(repairHalfPointImport(saved)).toBe(false);
    });
});

describe("importing the link again", () => {
    it("quietly corrects an untouched copy that missed the repair", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        saved.offline_backup = [];
        const latest = imported(UGANDA);
        const plan = planReimport([saved], latest, {[saved.uuid]: contentPrint(saved)});
        expect(plan.kind).toBe("replace");
        expect(takeLatest(saved, latest).ratio).toBe(14.5);
    });

    it("has nothing to do for a repaired copy", () => {
        const saved = savedByOldImporter(UGANDA, 15);
        const print = contentPrint(saved);
        repairHalfPointImport(saved);
        const plan = planReimport([saved], imported(UGANDA), {[saved.uuid]: print});
        expect(plan.kind).toBe("same");
    });
});
