import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";
import BrewDatabase from "@/library/BrewDatabase";
import {migrateLegacyBags} from "@/library/bagMigration";
import {buildBackup, parseBackup} from "@/library/backup";
import {bagRecipe, bagBrewFixture, BAG_NOW} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";
import type {appDatabase} from "@/library/appDatabase";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));

function legacy(id = "old-a", changes: Record<string, unknown> = {}) {
    return {id, recipeUuid: "a", sizeGrams: 250, boughtOn: "2026-10-01",
        addedAt: 10, countedFrom: 100, gramsAtCount: 120, beanName: "Same name", ...changes};
}

beforeEach(() => {
    mockDb = createTestDatabase();
    const recipes = new RecipeDatabase();
    recipes.insertRecipes([bagRecipe("a")]);
    mockDb.execSync(`CREATE TABLE coffee_bags (
        id TEXT PRIMARY KEY NOT NULL, recipeUuid TEXT NOT NULL,
        countedFrom INTEGER NOT NULL, finishedAt INTEGER NOT NULL DEFAULT 0, bag TEXT NOT NULL
    );`);
});

function seed(value: ReturnType<typeof legacy>) {
    mockDb.runSync("INSERT INTO coffee_bags VALUES (?, ?, ?, ?, ?);",
        [value.id, value.recipeUuid, value.countedFrom,
            "finishedAt" in value ? value.finishedAt : 0, JSON.stringify(value)]);
}

it("preserves the old displayed estimate, not the new consumption definition", () => {
    const history = new BrewDatabase();
    for (const [index, outcome] of (["done", "endedOnMachine", "cancelled", "failed"] as const).entries()) {
        history.insert(bagBrewFixture({id: `b${index}`, outcome,
            startedAt: 100, dose: 18}), []);
    }
    history.insert(bagBrewFixture({id: "before", startedAt: 99, dose: 18}), []);
    seed(legacy());
    const bags = new CoffeeBagDatabase();
    expect(bags.balance("old-a", 18, "xbrw")).toMatchObject({remainingGrams: 84});
    expect(bags.selection("a")?.bagId).toBe("old-a");
    expect(bags.exportInventory().bags[0].runs).toEqual([]);
    expect(history.get("b0")).not.toHaveProperty("bag");
    expect(mockDb.getFirstSync("SELECT bag FROM coffee_bags;")).toEqual({bag: JSON.stringify(legacy())});
    expect(migrateLegacyBags(mockDb as ReturnType<typeof appDatabase>)).toMatchObject({migrated: 0, unreadable: 0});
    expect(new CoffeeBagDatabase().balance("old-a", 18, "xbrw"))
        .toMatchObject({remainingGrams: 84});
});

it("keeps equal names and orphan bags separate, selecting the newest open linked bag", () => {
    seed(legacy("old-b", {addedAt: 20}));
    seed(legacy("old-a", {addedAt: 20}));
    seed(legacy("orphan", {recipeUuid: "missing"}));
    const bags = new CoffeeBagDatabase();
    expect(bags.all()).toHaveLength(3);
    expect(bags.linked("a")).toHaveLength(2);
    expect(bags.selection("a")?.bagId).toBe("old-a");
    expect(bags.get("old-b")).not.toHaveProperty("finishedAt");
    expect(bags.get("orphan")).not.toBeNull();
});

it("keeps finished baselines uncertain and reports unreadable legacy rows without removing them", () => {
    seed(legacy("finished", {finishedAt: 1000}));
    seed(legacy("bad", {gramsAtCount: -1}));
    const bags = new CoffeeBagDatabase();
    expect(bags.balance("finished", 18, "xbrw")).toEqual({kind: "needsCheck"});
    expect(migrateLegacyBags(mockDb as ReturnType<typeof appDatabase>).unreadable).toBe(1);
    expect(mockDb.getFirstSync("SELECT COUNT(*) AS n FROM coffee_bags;")).toEqual({n: 2});
    expect(() => bags.exportInventory()).toThrow(/old bag data/);
});

it("does not replace a local explicit No bag during migration", () => {
    const bags = new CoffeeBagDatabase();
    bags.select("a", null, 50);
    seed(legacy());
    migrateLegacyBags(mockDb as ReturnType<typeof appDatabase>);
    expect(bags.selection("a")).toEqual({recipeUuid: "a", bagId: null, selectedAt: 50});
});

it("does not resurrect a deliberately removed migrated bag from recovery evidence", () => {
    seed(legacy());
    const bags = new CoffeeBagDatabase();
    bags.remove("old-a");
    expect(migrateLegacyBags(mockDb as ReturnType<typeof appDatabase>).migrated).toBe(0);
    expect(bags.get("old-a")).toBeNull();
});

it("adapts legacy backups using only supplied history and keeps local units on restore", () => {
    const raw = JSON.parse(buildBackup([bagRecipe("a")], {}, "2.2.0", [
        bagBrewFixture({startedAt: BAG_NOW, dose: 18})
    ]));
    raw.bags = [legacy()];
    const parsed = parseBackup(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.payload.bagInventory?.bags[0]).toMatchObject({baselineGrams: 102, needsCheck: false});
    const bags = new CoffeeBagDatabase();
    new BrewDatabase().insert(bagBrewFixture({id: "local", startedAt: BAG_NOW, dose: 20}), []);
    if (!parsed.payload.bagInventory) throw new Error("Missing legacy inventory");
    bags.restoreInventory(parsed.payload.bagInventory);
    expect(bags.balance("old-a", 18, "xbrw")).toMatchObject({remainingGrams: 102});
    bags.correct("old-a", 50);
    bags.restoreInventory(parsed.payload.bagInventory);
    expect(bags.balance("old-a", 18, "xbrw")).toMatchObject({remainingGrams: 50});
    delete raw.brews;
    const missing = parseBackup(JSON.stringify(raw));
    expect(missing.ok && missing.payload.bagInventory?.bags[0].needsCheck).toBe(true);
    raw.bagInventory = {version: 2, bags: [], selections: []};
    const modern = parseBackup(JSON.stringify(raw));
    expect(modern.ok && modern.payload.bagInventory?.bags).toEqual([]);
});
