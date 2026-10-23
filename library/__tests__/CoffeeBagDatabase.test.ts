import {createTestDatabase} from "@/test-utils/sqlite";
import {bagFixture, bagRecipe} from "@/test-utils/bags";
import CoffeeBagDatabase, {bagRevision, subscribeBagChanges} from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));

beforeEach(() => { mockDb = createTestDatabase(); });

function stores() {
    const recipes = new RecipeDatabase();
    recipes.insertRecipes([bagRecipe("a"), bagRecipe("b")]);
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    return {recipes, bags};
}

describe("physical bag relationships in SQLite", () => {
    it("supports two recipes and two simultaneously open bags", () => {
        const {bags} = stores();
        bags.create(bagFixture({id: "bag-b"}));
        bags.select("a", "bag-a", 1);
        bags.select("b", "bag-a", 2);
        bags.link("a", "bag-b");
        expect(bags.linked("a").map(bag => bag.id).sort()).toEqual(["bag-a", "bag-b"]);
        expect(bags.selection("b")?.bagId).toBe("bag-a");
        expect(bags.get("bag-a")?.finishedAt).toBeUndefined();
    });

    it("remembers explicit No bag after reopening", () => {
        const {bags} = stores();
        bags.select("a", "bag-a", 1);
        bags.select("a", null, 2);
        expect(new CoffeeBagDatabase().selection("a"))
            .toEqual({recipeUuid: "a", bagId: null, selectedAt: 2});
        expect(bags.linked("a")).toHaveLength(1);
    });

    it("deleting one recipe unlinks only it", () => {
        const {recipes, bags} = stores();
        bags.select("a", "bag-a", 1);
        bags.select("b", "bag-a", 2);
        recipes.deleteRecipe("b");
        expect(bags.get("bag-a")).not.toBeNull();
        expect(bags.selection("b")).toBeNull();
        expect(bags.linked("b")).toEqual([]);
        expect(bags.selection("a")?.bagId).toBe("bag-a");
    });

    it("replace retains choices for surviving UUIDs and prunes removed links", () => {
        const {recipes, bags} = stores();
        recipes.insertRecipe(bagRecipe("c"));
        bags.select("a", "bag-a", 1);
        bags.link("b", "bag-a");
        bags.select("b", null, 2);
        bags.select("c", "bag-a", 3);
        recipes.replaceAllRecipes([bagRecipe("a"), bagRecipe("b")]);
        expect(bags.selection("a")?.bagId).toBe("bag-a");
        expect(bags.selection("b")?.bagId).toBeNull();
        expect(bags.selection("c")).toBeNull();
        expect(bags.linked("c")).toEqual([]);
        expect(bags.all()).toHaveLength(1);
    });

    it("a failed replace rolls back links, choices and recipe rows", () => {
        const {recipes, bags} = stores();
        bags.select("a", "bag-a", 1);
        const changed = jest.fn();
        const unsubscribe = subscribeBagChanges(changed);
        try {
            expect(() => recipes.replaceAllRecipes([bagRecipe("x"), bagRecipe("x")])).toThrow();
            expect(bags.selection("a")?.bagId).toBe("bag-a");
            expect(bags.linked("a")).toHaveLength(1);
            expect(recipes.getRecipe("a")?.uuid).toBe("a");
            expect(recipes.getRecipe("x")).toBeNull();
            expect(changed).not.toHaveBeenCalled();
        } finally { unsubscribe(); }
    });

    it("delete all removes links and choices without deleting physical bags", () => {
        const {recipes, bags} = stores();
        bags.select("a", "bag-a", 1);
        recipes.deleteAllRecipes();
        expect(bags.selection("a")).toBeNull();
        expect(bags.linked("a")).toEqual([]);
        expect(bags.all()).toHaveLength(1);
    });

    it.each(["finish", "unlink", "remove"] as const)(
        "%s clears the selected bag without choosing its neighbour", action => {
            const {bags} = stores();
            bags.select("a", "bag-a", 1);
            bags.create(bagFixture({id: "bag-b"}));
            bags.link("a", "bag-b");
            if (action === "finish") bags.finish("bag-a", 2_000);
            if (action === "unlink") bags.unlink("a", "bag-a");
            if (action === "remove") bags.remove("bag-a");
            expect(bags.selection("a")?.bagId).toBeNull();
            expect(bags.get("bag-b")?.finishedAt).toBeUndefined();
            expect(() => bags.select("a", "missing", 3)).toThrow();
            expect(bags.selection("a")?.bagId).toBeNull();
        }
    );

    it("does not link a finished bag or an unsaved recipe", () => {
        const {bags} = stores();
        bags.finish("bag-a", 2_000);
        expect(() => bags.select("a", "bag-a", 3)).toThrow();
        expect(() => bags.select("unsaved", null, 3)).toThrow();
        expect(() => bags.link("unsaved", "bag-a")).toThrow();
    });

    it("creates and selects atomically and publishes only after commit", () => {
        const {bags} = stores();
        const changed = jest.fn();
        const unsubscribe = subscribeBagChanges(changed);
        try {
            const before = bagRevision();
            expect(() => bags.createAndSelect(bagFixture({id: "bag-b"}), "missing", 1))
                .toThrow();
            expect(bags.get("bag-b")).toBeNull();
            expect(changed).not.toHaveBeenCalled();
            bags.createAndSelect(bagFixture({id: "bag-b"}), "a", 2);
            expect(bags.selection("a")?.bagId).toBe("bag-b");
            expect(changed).toHaveBeenCalledTimes(1);
            expect(bagRevision()).toBe(before + 1);
        } finally { unsubscribe(); }
    });

    it("editing purchase facts does not reset a quantity baseline", () => {
        const {bags} = stores();
        bags.edit(bagFixture({name: "Renamed", sizeGrams: 320}));
        expect(bags.get("bag-a")?.name).toBe("Renamed");
        expect(mockDb.getFirstSync(
            "SELECT baselineGrams FROM coffee_bags_v2 WHERE id = ?", ["bag-a"]
        )).toEqual({baselineGrams: 250});
    });

    it("surfaces corrupt stored facts rather than silently dropping them", () => {
        const {bags} = stores();
        mockDb.runSync("UPDATE coffee_bags_v2 SET bag = ? WHERE id = ?", ["{", "bag-a"]);
        expect(() => bags.get("bag-a")).toThrow(/read/i);
        expect(() => bags.all()).toThrow(/read/i);
    });
});
