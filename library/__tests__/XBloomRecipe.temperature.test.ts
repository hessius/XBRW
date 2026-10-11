/**
 * Temperature import tests for XBloomRecipe.
 *
 * The official app's "BP" preset has reached us as a non-round value above
 * our 99 C ceiling (211 F = 99.4 C, see issue #199), rather than the clean
 * round number the app's own range implies. These pin that an imported
 * temperature outside the card's band is clamped and rounded at the door,
 * the same way an oversized tea pour volume already is.
 */
import {XBloomRecipe} from "@/library/XBloomRecipe";
import Recipe from "@/library/Recipe";
import {brewProblems, cardWriteProblems} from "@/library/cardLimits";

/** Minimal valid recipeVo, cup type 1 (XPOD, not tea), one pour. */
function makeRecipeVo(temperature: number) {
    return {
        grandWater:          15,
        grinderSize:         45,
        isSetGrinderSize:    1,
        dose:                15,
        pourCount:           1,
        rpm:                 80,
        cupType:             1,
        isEnableBypassWater: 2,
        bypassVolume:        0,
        bypassTemp:          60,
        pourList:            [{
            flowRate:               1,
            isEnableVibrationAfter:  2,
            isEnableVibrationBefore: 2,
            pattern:                1,
            pausing:                0,
            volume:                 225,
            temperature
        }]
    };
}

/** Build an XBloomRecipe whose fetch has already been simulated. */
function buildRecipe(recipeVo: Record<string, unknown>) {
    const xb = new XBloomRecipe({kind: "share", id: "test123"}, "studio");
    (xb as any).xbRecipeJSON = {recipeVo};
    return xb.getRecipe();
}

it("clamps a BP-ish temperature above the card's ceiling down to 99 C", () => {
    const recipe = buildRecipe(makeRecipeVo(99.4));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(99);
});

it("clamps a temperature below the card's floor up to 39 C", () => {
    const recipe = buildRecipe(makeRecipeVo(20));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(39);
});

it("rounds a fractional temperature that is already in range", () => {
    const recipe = buildRecipe(makeRecipeVo(92.5));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(93);
});

it("leaves a whole in-range temperature untouched", () => {
    const recipe = buildRecipe(makeRecipeVo(93));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(93);
});

const row = {
    theName: "La Cabra - La Mina Honey",
    dose: 15,
    grandWater: 16,
    isSetGrinderSize: 2,
    grinderSize: 70,
    rpm: 120,
    cupType: 3,
    pourCount: 4,
    isEnableBypassWater: 1,
    bypassVolume: 30,
    bypassTemp: 92.77,
    pourList: [
        {volume: 55, temperature: 95, flowRate: 3, pattern: 2, pausing: 16},
        {volume: 70, temperature: 95, flowRate: 3.5, pattern: 2, pausing: 10},
        {volume: 70, temperature: 93.88, flowRate: 3.5, pattern: 2, pausing: 10},
        {volume: 45, temperature: 92.77, flowRate: 3.2, pattern: 1, pausing: 5},
    ],
};

function importedRecipe(): Recipe {
    const recipe = XBloomRecipe.fromAccountRow(row).getRecipe();
    if (!recipe) throw new Error("The reported recipe did not import");
    return recipe;
}

it("rounds imported Fahrenheit-derived temperatures to whole Celsius", () => {
    const recipe = importedRecipe();
    expect(recipe.pours.map(pour => pour.temperature)).toEqual([95, 95, 94, 93]);
    expect(recipe.bypassTemp).toBe(93);
    for (const unit of ["C", "F"] as const) {
        expect(brewProblems(recipe, unit)).toEqual([]);
        expect(cardWriteProblems(recipe, unit)).toEqual([]);
    }
});

it.each(["objects", "strings"])("repairs temperatures in saved %s pours", shape => {
    const saved = JSON.parse(JSON.stringify(importedRecipe()));
    saved.pours = saved.pours.map((stored: string, index: number) => {
        const pour = JSON.parse(stored);
        const legacy = {...pour, temperature: row.pourList[index].temperature};
        return shape === "strings" ? JSON.stringify(legacy) : legacy;
    });
    saved.bypassTemp = 92.77;
    saved.backup = [1, 2, 3];
    saved.offline_backup = [4, 5, 6];
    saved.uid = [7, 8];
    const recipe = new Recipe(undefined, JSON.stringify(saved));
    expect(recipe.pours.map(pour => pour.temperature)).toEqual([95, 95, 94, 93]);
    expect(recipe.bypassTemp).toBe(93);
    expect(brewProblems(recipe, "F")).toEqual([]);
    expect(recipe.backup).toEqual(saved.backup);
    expect(recipe.offline_backup).toEqual(saved.offline_backup);
    expect(recipe.uid).toEqual(saved.uid);
    const reloaded = new Recipe(undefined, JSON.stringify(recipe));
    expect(reloaded.pours.map(pour => pour.temperature)).toEqual([95, 95, 94, 93]);
});

it("does not round an out-of-range saved stage into an acceptable temperature", () => {
    const recipe = importedRecipe();
    recipe.pours[0].temperature = 99.4;
    const reloaded = new Recipe(undefined, JSON.stringify(recipe));
    expect(reloaded.pours[0].temperature).toBe(99.4);
    expect(brewProblems(reloaded).length).toBeGreaterThan(0);
});
