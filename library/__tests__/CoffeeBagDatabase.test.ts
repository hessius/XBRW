import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import {unobservedBrew} from "@/library/brew/BrewRecord";
import CoffeeBagDatabase, {
    openBagBeanName,
    sharedBagDatabase
} from "@/library/CoffeeBagDatabase";
import {newBag, readBag, withGramsLeft, type CoffeeBag} from "@/library/coffeeBag";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const T0 = 1_760_000_000_000;

function brew(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: `b-${Math.random()}`, recipeUuid: "r1", recipeName: "Guji", accent: "#ff8800",
        startedAt: T0 + 1000, pouringAt: T0 + 1100, endedAt: T0 + 2000, outcome: "done",
        failure: null, pours: 3, waterTotal: 288, cupTotal: 260, heldSeconds: 0, dose: 18,
        ...over
    } as BrewRecord;
}

function bagAt(over: Partial<CoffeeBag> = {}): CoffeeBag {
    return {...newBag("r1", {sizeGrams: 250}, T0), id: "bag-1", ...over};
}

describe("brews draw a bag down", () => {
    it("subtracts the dose of each completed brew after the bag was added", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        brews.insert(brew({id: "done"}), []);
        brews.insert(brew({id: "short", outcome: "endedOnMachine", dose: 20}), []);

        const stored = bags.openFor("r1");
        expect(stored?.usedGrams).toBe(38);
        expect(readBag(stored!.bag, stored!.usedGrams, 18).remainingGrams).toBe(212);
    });

    it("does not count cancelled, failed or lost brews", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        brews.insert(brew({id: "c", outcome: "cancelled"}), []);
        brews.insert(brew({id: "f", outcome: "failed"}), []);
        brews.insert(brew({id: "l", outcome: "lostContact"}), []);
        expect(bags.openFor("r1")?.usedGrams).toBe(0);
    });

    it("does not count brews from before the bag, or of another recipe", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        brews.insert(brew({id: "old", startedAt: T0 - 5000}), []);
        brews.insert(brew({id: "other", recipeUuid: "r2"}), []);
        expect(bags.openFor("r1")?.usedGrams).toBe(0);
    });

    it("costs nothing for a brew logged by hand, which carries no dose", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        brews.insert(unobservedBrew({
            recipeUuid: "r1", recipeName: "Guji", accent: "#ff8800", rating: 4, at: T0 + 10
        }), []);
        expect(bags.openFor("r1")?.usedGrams).toBe(0);
    });

    it("counts from a manual correction onward", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        brews.insert(brew({id: "before", startedAt: T0 + 1000}), []);
        bags.save(withGramsLeft(bagAt(), 100, T0 + 5000));
        brews.insert(brew({id: "after", startedAt: T0 + 6000}), []);

        const stored = bags.openFor("r1")!;
        expect(stored.usedGrams).toBe(18);
        expect(readBag(stored.bag, stored.usedGrams, 18).remainingGrams).toBe(82);
    });

    it("serves every open bag in one read for the library", () => {
        const bags = new CoffeeBagDatabase();
        const brews = new BrewDatabase();
        bags.save(bagAt());
        bags.save({...newBag("r2", {sizeGrams: 160}, T0), id: "bag-2"});
        brews.insert(brew({id: "a"}), []);
        brews.insert(brew({id: "b", recipeUuid: "r2", dose: 15}), []);
        brews.insert(brew({id: "c", recipeUuid: "r2", dose: 15, outcome: "cancelled"}), []);

        const open = new RecipeDatabase().coffeeBags();
        expect(open.r1.usedGrams).toBe(18);
        expect(open.r2.usedGrams).toBe(15);
    });
});

describe("one open bag per recipe", () => {
    it("finishes the old bag when a new one is bought", () => {
        const bags = new CoffeeBagDatabase();
        bags.save(bagAt());
        bags.save({...newBag("r1", {sizeGrams: 500}, T0 + 10), id: "bag-2"}, T0 + 10);

        expect(bags.openFor("r1")?.bag.id).toBe("bag-2");
        expect(bags.get("bag-1")?.finishedAt).toBe(T0 + 10);
        expect(bags.all()).toHaveLength(2);
    });

    it("keeps a finished bag in the table but stops reading it as open", () => {
        const bags = new CoffeeBagDatabase();
        bags.save(bagAt());
        bags.finish("bag-1", T0 + 99);
        expect(bags.openFor("r1")).toBeNull();
        expect(bags.all()[0].finishedAt).toBe(T0 + 99);
    });

    it("removes a bag outright, and with its recipe", () => {
        const bags = new CoffeeBagDatabase();
        bags.save(bagAt());
        bags.remove("bag-1");
        expect(bags.all()).toHaveLength(0);

        const recipes = new RecipeDatabase();
        const recipe = new Recipe();
        recipes.insertRecipe(recipe);
        bags.save({...newBag(recipe.uuid, {sizeGrams: 250}, T0), id: "bag-3"});
        recipes.deleteRecipe(recipe.uuid);
        expect(bags.all()).toHaveLength(0);
    });
});

describe("restoring bags", () => {
    it("adds missing bags and never overwrites one already here", () => {
        const bags = new CoffeeBagDatabase();
        bags.save(bagAt({gramsAtCount: 90}));
        const added = bags.restore([
            bagAt({gramsAtCount: 250}),
            {...newBag("r2", {sizeGrams: 160}, T0), id: "bag-2"}
        ], new Set(["r1", "r2"]));

        expect(added).toBe(1);
        expect(bags.get("bag-1")?.gramsAtCount).toBe(90);
    });

    it("skips a bag for a recipe not in the library", () => {
        const bags = new CoffeeBagDatabase();
        expect(bags.restore([bagAt()], new Set(["r9"]))).toBe(0);
    });

    it("keeps the open bag on this phone over a restored open one", () => {
        const bags = new CoffeeBagDatabase();
        bags.save(bagAt());
        const added = bags.restore([
            {...newBag("r1", {sizeGrams: 1000}, T0 - 10), id: "old-open"},
            {...newBag("r1", {sizeGrams: 160}, T0 - 20), id: "old-done", finishedAt: T0 - 15}
        ], new Set(["r1"]));
        expect(added).toBe(1);
        expect(bags.openFor("r1")?.bag.id).toBe("bag-1");
    });
});

describe("the name a bag was sent under", () => {
    it("is offered for the recipe while the bag is open", () => {
        sharedBagDatabase().save(bagAt({beanName: "Ethiopia Guji"}));
        expect(openBagBeanName("r1")).toBe("Ethiopia Guji");
        sharedBagDatabase().finish("bag-1");
        expect(openBagBeanName("r1")).toBeUndefined();
    });
});
