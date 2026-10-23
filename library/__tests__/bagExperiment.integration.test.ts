import {forgetAppDatabase} from "@/library/appDatabase";
import {buildBackup, parseBackup} from "@/library/backup";
import {captureBagRun, nextBagProgress, type BagRunEvent} from "@/library/bagRun";
import BrewDatabase from "@/library/BrewDatabase";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {Settings, SqliteSettingsStorage} from "@/library/Settings";
import {BAG_NOW, bagBrewFixture, bagFixture, bagRecipe} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); });

it("preserves one physical bag across two doses, refusal, cancellation, correction, deletion and repeat restore", () => {
    const a = bagRecipe("a");
    const b = bagRecipe("b");
    b.dosage = 24;
    for (const recipe of [a, b]) {
        recipe.grindSize = 60;
        recipe.pours = [new Pour(1, recipe.dosage * recipe.ratio, 93, 40, 0, 0, 0)];
    }
    const recipes = [a, b];
    const recipeStore = new RecipeDatabase();
    recipeStore.insertRecipes(recipes);
    const originalJson = recipes.map(recipe => JSON.stringify(recipe));
    const originalBytes = recipes.map(recipe => recipe.getData(new Array(32).fill(0)));
    const untracked = {...bagBrewFixture(), hasStream: false};
    const originalEnvelope = buildEnvelope(untracked, []);
    const settings = new Settings(new SqliteSettingsStorage());
    settings.set("bagExperimentEnabled", true);
    const bags = new CoffeeBagDatabase();
    const history = new BrewDatabase();
    bags.create(bagFixture());
    bags.select("a", "bag-a", 1);
    bags.select("b", "bag-a", 2);

    function accept(recipe: Recipe, runId: string, events: BagRunEvent[]) {
        const captured = captureBagRun(recipe, {kind: "saved"}, {
            enabled: settings.get("bagExperimentEnabled"), tracker: "xbrw",
            acceptedAt: BAG_NOW, runId, store: () => bags
        });
        if (captured.kind !== "tracked") throw new Error("The fixture bag was not captured.");
        let progress = bags.beginRun(captured.snapshot);
        for (const event of events) {
            progress = nextBagProgress(progress, event);
            bags.updateRun(runId, progress);
        }
        return captured.snapshot;
    }

    accept(a, "refusal", ["refused"]);
    expect(bags.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 250});
    const first = accept(a, "first", ["sending", "grinding", "pouring", "ended"]);
    const adjusted = new Recipe(undefined, JSON.stringify(b));
    adjusted.dosage = 30;
    adjusted.autoFixPourVolumes();
    const second = accept(adjusted, "second", ["sending", "pouring", "ended"]);
    history.insert(bagBrewFixture({id: "first", bag: first}), []);
    history.insert(bagBrewFixture({
        id: "second", recipeUuid: "b", outcome: "cancelled", waterTotal: 50, bag: second
    }), []);
    expect(history.get("second")?.bag?.dose).toBe(30);
    expect(bags.balance("bag-a", 18, "xbrw"))
        .toMatchObject({remainingGrams: 202, usedGrams: 48});
    bags.correct("bag-a", 100);
    history.remove("first");
    expect(bags.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 100});
    bags.select("b", null, 3);
    settings.set("bagExperimentEnabled", false);
    expect(buildEnvelope(untracked, [])).toEqual(originalEnvelope);
    expect(recipes.map(recipe => JSON.stringify(recipe))).toEqual(originalJson);
    expect(recipes.map(recipe => recipe.getData(new Array(32).fill(0)))).toEqual(originalBytes);
    const parsed = parseBackup(buildBackup(recipes, {}, "2.2.0", history.all(), bags.exportInventory()));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.payload.settings).not.toHaveProperty("bagExperimentEnabled");
    const inventory = parsed.payload.bagInventory;
    if (inventory === undefined) throw new Error("The fixture inventory was not backed up.");

    mockDb = createTestDatabase();
    forgetAppDatabase();
    new RecipeDatabase().insertRecipes(parsed.payload.recipes);
    const targetSettings = new Settings(new SqliteSettingsStorage());
    const restoredBags = new CoffeeBagDatabase();
    const restoredHistory = new BrewDatabase();
    expect(restoredBags.restoreInventory(inventory)).toEqual({added: 1, skippedRows: 0});
    expect(restoredHistory.restore(parsed.payload.brews)).toBe(1);
    expect(restoredBags.restoreInventory(inventory)).toEqual({added: 0, skippedRows: 0});
    expect(restoredHistory.restore(parsed.payload.brews)).toBe(0);
    expect(restoredBags.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 100});
    expect(restoredBags.selection("a")?.bagId).toBe("bag-a");
    expect(restoredBags.selection("b")?.bagId).toBeNull();
    expect(restoredBags.linked("a").map(bag => bag.id)).toEqual(["bag-a"]);
    expect(restoredBags.linked("b").map(bag => bag.id)).toEqual(["bag-a"]);
    expect(restoredHistory.get("second")).toMatchObject({outcome: "cancelled", bag: second});
    expect(targetSettings.get("bagExperimentEnabled")).toBe(false);
});
