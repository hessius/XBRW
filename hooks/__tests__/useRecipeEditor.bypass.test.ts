import {act, renderHook} from "@testing-library/react-native";

import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

jest.mock("@/library/RecipeDatabase");
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));

async function editorFor(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         () => {}
    }));
}

/** 45 ml and 60 C on purpose: neither is a default, so a passing assertion
 *  proves a real binding rather than a constant that happens to agree. */
function recipeWithBypass(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume  = 45;
    recipe.bypassTemp    = 60;
    return recipe;
}

/** Three stages ending at 88 C, so a seeded bypass has a last stage to copy. */
function recipeEndingAt(temperature: number): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.ratio  = 16;
    recipe.addPour(0, false);
    recipe.addPour(0);
    recipe.addPour(0);
    recipe.autoFixPourVolumes();
    recipe.pours.forEach((pour, index) => {
        // A descending ramp, so copying the *last* stage is distinguishable
        // from copying the first or from averaging them.
        pour.temperature = temperature + (recipe.pours.length - 1 - index) * 4;
    });
    return recipe;
}

describe("useRecipeEditor bypass", () => {
    function proportionalRecipe(volume = 30) {
        const recipe = recipeEndingAt(88);
        recipe.bypassEnabled = true;
        recipe.bypassVolume = volume;
        recipe.bypassTemp = 88;
        return recipe;
    }

    it("keeps a stable source through successive dose edits and saving", async () => {
        const {result} = await editorFor(proportionalRecipe());
        const stages = result.current.recipe?.pours.map(pour => pour.volume);
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "19"); });
        expect(result.current.recipe?.bypassVolume).toBe(32);
        await act(async () => { result.current.persistRecipe(); });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
        expect(result.current.recipe?.bypassVolume).toBe(33);
        expect(result.current.recipe?.bypassTemp).toBe(88);
        expect(result.current.recipe?.pours.map(pour => pour.volume)).toEqual(stages);
        expect(result.current.balance.balanced).toBe(false);
        expect(result.current.bypassDoseNotice).toBeNull();
    });

    it("recovers the original amount after clipping without serializing its anchor", async () => {
        const {result} = await editorFor(proportionalRecipe(500));
        const keys = Object.keys(result.current.recipe!);
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
        expect(result.current.recipe?.bypassVolume).toBe(500);
        expect(result.current.bypassDoseNotice).toBe("Bypass limited to 500 ml.");
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "15"); });
        expect(result.current.recipe?.bypassVolume).toBe(417);
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "18"); });
        expect(result.current.recipe?.bypassVolume).toBe(500);
        expect(result.current.bypassDoseNotice).toBeNull();
        expect(Object.keys(result.current.recipe!)).toEqual(keys);
    });

    it("rebases explicit water edits but not temperature edits", async () => {
        const {result} = await editorFor(proportionalRecipe());
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "19"); });
        await act(async () => { result.current.editBypass("temperature", 75); });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
        expect(result.current.recipe?.bypassVolume).toBe(33);
        await act(async () => { result.current.editBypass("volume", 40); });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "18"); });
        expect(result.current.recipe?.bypassVolume).toBe(36);
        expect(result.current.recipe?.bypassTemp).toBe(75);
    });

    it("starts a fresh source after a bypass toggle", async () => {
        const {result} = await editorFor(proportionalRecipe());
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
        await act(async () => { result.current.setBypassEnabled(false); });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "15"); });
        expect(result.current.recipe?.bypassVolume).toBe(33);
        await act(async () => { result.current.setBypassEnabled(true); });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "18"); });
        expect(result.current.recipe?.bypassVolume).toBe(40);
    });

    it("does not rescale bypass for ratio-only edits or tea", async () => {
        const {result} = await editorFor(proportionalRecipe());
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.RATIO, "18"); });
        expect(result.current.recipe?.bypassVolume).toBe(30);
        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.CUP, String(CUP_TYPE.TEA));
        });
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "7"); });
        expect(result.current.recipe?.bypassVolume).toBe(30);
    });

    it("retains invalid starting water and clears its correction after an explicit edit", async () => {
        const {result} = await editorFor(proportionalRecipe(501));
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
        expect(result.current.recipe?.bypassVolume).toBe(501);
        expect(result.current.bypassDoseNotice)
            .toBe("Check the starting dose and bypass amount before resizing.");
        await act(async () => { result.current.editBypass("volume", 40); });
        expect(result.current.bypassDoseNotice).toBeNull();
        await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "18"); });
        expect(result.current.recipe?.bypassVolume).toBe(36);
    });

    it("discards the previous notice and anchor when revert replaces the recipe", async () => {
        const recipe = proportionalRecipe(500);
        recipe.shareId = "fixture";
        const replacement = proportionalRecipe(24);
        replacement.dosage = 15;
        const fetch = jest.spyOn(XBloomRecipe.prototype, "fetchRecipeDetail").mockResolvedValue(undefined);
        const get = jest.spyOn(XBloomRecipe.prototype, "getRecipe").mockReturnValue(replacement);
        try {
            const {result} = await editorFor(recipe);
            await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
            expect(result.current.bypassDoseNotice).toBe("Bypass limited to 500 ml.");
            await act(async () => {
                await result.current.revertSources.find(source => source.id === "share")!.action();
            });
            expect(result.current.bypassDoseNotice).toBeNull();
            await act(async () => { await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20"); });
            expect(result.current.recipe?.bypassVolume).toBe(32);
        } finally {
            fetch.mockRestore();
            get.mockRestore();
        }
    });

    it("seeds a bypass at the temperature the brew finished on", async () => {
        // Bypass water is poured into the cup at the end, so the temperature
        // that makes sense to start from is the one the brew just ended at --
        // not a constant that has nothing to do with this recipe. A ramp is
        // used so this cannot pass by copying the first stage or by averaging.
        const {result} = await editorFor(recipeEndingAt(88));

        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassVolume).toBe(30);
        expect(result.current.recipe?.bypassTemp).toBe(88);
    });

    it("seeds volume and temperature when bypass is switched on from off", async () => {
        // No stages at all, so there is no last temperature to copy and the
        // constant is the only answer left.
        const {result} = await editorFor(new Recipe());

        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassEnabled).toBe(true);
        expect(result.current.recipe?.bypassVolume).toBe(30);
        expect(result.current.recipe?.bypassTemp).toBe(85);
    });

    it("keeps the existing values when bypass is switched on again", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.setBypassEnabled(false); });
        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("leaves the volume and temperature alone when switching off", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.setBypassEnabled(false); });

        expect(result.current.recipe?.bypassEnabled).toBe(false);
        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("edits each field and publishes the change", async () => {
        const {result} = await editorFor(recipeWithBypass());
        const before = result.current.key;

        await act(async () => { result.current.editBypass("volume", 120); });
        await act(async () => { result.current.editBypass("temperature", 70); });

        expect(result.current.recipe?.bypassVolume).toBe(120);
        expect(result.current.recipe?.bypassTemp).toBe(70);
        expect(result.current.key).toBeGreaterThan(before);
    });

    it("clamps the volume to the bypass range", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.editBypass("volume", 9000); });

        expect(result.current.recipe?.bypassVolume).toBe(500);
    });

    it("clamps the temperature to the bypass range", async () => {
        // `Machine.brew` clamps again before it builds the frame, but a value
        // stored out of range is wrong long before it is sent: it is drawn in
        // the bypass box, carried in a share link, and read back on load.
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.editBypass("temperature", -5); });
        expect(result.current.recipe?.bypassTemp).toBe(39);

        await act(async () => { result.current.editBypass("temperature", 500); });
        expect(result.current.recipe?.bypassTemp).toBe(99);
    });

    it("seeds the default when the last stage has no temperature set", async () => {
        // `Pour.temperature` is -1 until someone sets it, and the last stage
        // exists, so `?.` succeeds and a nullish guard never fires. An unset
        // stage has no temperature to copy, which is the case the constant is
        // there for.
        const recipe = recipeEndingAt(88);
        recipe.pours.forEach((pour) => { pour.temperature = -1; });
        const {result} = await editorFor(recipe);

        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassTemp).toBe(85);
    });

    it("never lets bypass water enter the pour-sum invariant", async () => {
        // The machine refuses a recipe whose stages do not add up to
        // dose x ratio. Bypass is dispensed outside that sum, so turning it on
        // must not change the balance, the target, or the write gate.
        const {result} = await editorFor(new Recipe());
        const target = result.current.balance.target;
        const poured = result.current.balance.poured;
        const balanced = result.current.balance.balanced;
        const problemsBefore = result.current.writeProblems;

        await act(async () => { result.current.setBypassEnabled(true); });
        await act(async () => { result.current.editBypass("volume", 250); });

        expect(result.current.balance.target).toBe(target);
        expect(result.current.balance.poured).toBe(poured);
        expect(result.current.balance.balanced).toBe(balanced);
        expect(result.current.writeProblems).toEqual(problemsBefore);
    });
});
