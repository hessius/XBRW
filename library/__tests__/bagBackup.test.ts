import {parseBagInventory, type BagInventoryBackup} from "@/library/bagBackup";
import {buildBackup, parseBackup} from "@/library/backup";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";
import {bagFixture, bagRecipe, bagRunFixture} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";
import {forgetAppDatabase} from "@/library/appDatabase";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); });

function inventory(): BagInventoryBackup {
    return {
        version: 2,
        bags: [{
            bag: bagFixture(), baselineGrams: 250, needsCheck: false,
            linkedRecipeUuids: ["a", "b"],
            runs: [{
                snapshot: bagRunFixture(),
                progress: {consumption: "used", possible: true, closed: true},
                coveredByBaseline: false, overlapsBaseline: false
            }]
        }],
        selections: [{recipeUuid: "a", bagId: "bag-a", selectedAt: 1},
            {recipeUuid: "b", bagId: null, selectedAt: 2}]
    };
}

function stores() {
    const recipes = new RecipeDatabase();
    recipes.insertRecipes([bagRecipe("a"), bagRecipe("b")]);
    return new CoffeeBagDatabase();
}

describe("portable physical bag validation", () => {
    it("treats absence as normal but malformed or unsupported input as a reported problem", () => {
        expect(parseBagInventory(undefined)).toEqual({
            inventory: null, skippedBags: 0, skippedBagRows: 0, warnings: []
        });
        for (const value of [null, {}, {version: 3, bags: []}, {version: 2, bags: false}]) {
            const parsed = parseBagInventory(value);
            expect(parsed.inventory).toBeNull();
            expect(parsed.warnings.length).toBeGreaterThan(0);
        }
    });

    it("reconstructs valid facts, quantities, explicit No bag and portable coverage", () => {
        const original = inventory();
        const parsed = parseBagInventory(original);
        expect(parsed).toEqual({
            inventory: original, skippedBags: 0, skippedBagRows: 0, warnings: []
        });
        expect(parsed.inventory).not.toBe(original);
    });

    it.each([{baselineGrams: -1}, {baselineGrams: NaN}, {runs: undefined}])(
        "never guesses a trusted baseline for invalid bundle %j", changes => {
            const input = inventory();
            const parsed = parseBagInventory({
                ...input, bags: [{...input.bags[0], ...changes}]
            });
            expect(parsed.skippedBags).toBe(1);
            expect(parsed.inventory?.bags).toEqual([]);
            expect(parsed.warnings.length).toBeGreaterThan(0);
        }
    );

    it("retains a valid bag but marks its estimate uncertain when accounting is malformed", () => {
        const input = inventory();
        const parsed = parseBagInventory({
            ...input, bags: [{...input.bags[0], runs: [{snapshot: {}}]}]
        });
        expect(parsed.skippedBagRows).toBe(1);
        expect(parsed.inventory?.bags[0]).toMatchObject({needsCheck: true, runs: []});
    });

    it("rejects duplicate allocations and broken references rather than reassigning them", () => {
        const input = inventory();
        const row = input.bags[0].runs[0];
        const parsed = parseBagInventory({
            ...input,
            bags: [{...input.bags[0], runs: [row, row, {
                ...row, snapshot: {...row.snapshot, runId: "other", bagId: "wrong"}
            }]}],
            selections: [...input.selections, {recipeUuid: "c", bagId: "missing", selectedAt: 3}]
        });
        expect(parsed.skippedBagRows).toBe(3);
        expect(parsed.inventory?.bags[0]).toMatchObject({needsCheck: true, runs: [row]});
        expect(parsed.inventory?.selections).toEqual(input.selections);
    });

    it("carries independent bags with no recipes without changing the outer version", () => {
        const saved = buildBackup([], {}, "2.2.0", [], inventory());
        expect(JSON.parse(saved).version).toBe(1);
        const parsed = parseBackup(saved);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.payload.bagInventory).toEqual(inventory());
        expect(parsed.payload.skippedBags).toBe(0);
    });

    it("reports duplicate bag units and conflicting run IDs rather than silently combining them", () => {
        const original = inventory();
        const duplicate = parseBagInventory({...original, bags: [
            original.bags[0], {...original.bags[0], baselineGrams: 1}
        ]});
        expect(duplicate.skippedBags).toBe(1);
        expect(duplicate.inventory?.bags[0]).toMatchObject({baselineGrams: 250, needsCheck: true});
        const other = {
            ...original.bags[0], bag: bagFixture({id: "bag-b"}),
            runs: [{...original.bags[0].runs[0], snapshot: bagRunFixture({bagId: "bag-b"})}]
        };
        const conflict = parseBagInventory({...original, bags: [original.bags[0], other]});
        expect(conflict.skippedBagRows).toBe(1);
        expect(conflict.inventory?.bags.map(bag => bag.needsCheck)).toEqual([true, true]);
    });

    it("passes unsupported inventory diagnostics through an otherwise readable recipe backup", () => {
        const raw = JSON.parse(buildBackup([bagRecipe("a")], {}));
        raw.bagInventory = {version: 3, bags: []};
        const parsed = parseBackup(JSON.stringify(raw));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.payload.bagWarnings).toEqual(["This bag inventory version is not supported."]);
        expect(parsed.payload.skippedBags).toBe(1);
        expect(parsed.payload.bagInventory).toBeUndefined();
    });
});

describe("non-overwriting real SQLite inventory restore", () => {
    it("exports and restores a shared bag, with idempotent local quantities and preferences", () => {
        const first = stores();
        first.create(bagFixture());
        first.select("a", "bag-a", 1);
        first.select("b", null, 2);
        first.beginRun(bagRunFixture());
        first.updateRun("run-a", {consumption: "used", possible: true, closed: true});
        const exported = first.exportInventory();
        mockDb = createTestDatabase();
        forgetAppDatabase();
        const second = stores();
        expect(second.restoreInventory(exported)).toEqual({added: 1, skippedRows: 0});
        expect(second.balance("bag-a", 18, "xbrw"))
            .toMatchObject({kind: "estimate", remainingGrams: 232});
        expect(second.selection("b")?.bagId).toBeNull();
        second.correct("bag-a", 80);
        second.select("a", null, 5);
        expect(second.restoreInventory(exported)).toEqual({added: 0, skippedRows: 0});
        expect(second.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 80});
        expect(second.selection("a")).toMatchObject({bagId: null, selectedAt: 5});
    });

    it("retains No bag on the target and restores only links whose recipes exist", () => {
        const target = stores();
        target.select("a", null, 10);
        const recipes = new RecipeDatabase();
        recipes.deleteRecipe("b");
        const result = target.restoreInventory(inventory());
        expect(result).toEqual({added: 1, skippedRows: 2});
        expect(target.selection("a")).toMatchObject({bagId: null, selectedAt: 10});
        expect(target.linked("a").map(bag => bag.id)).toEqual(["bag-a"]);
        expect(target.selection("b")).toBeNull();
    });

    it("preserves corrected coverage and unresolved overlap on another device", () => {
        const input = inventory();
        input.bags[0].baselineGrams = 100;
        input.bags[0].runs[0].coveredByBaseline = true;
        const target = stores();
        target.restoreInventory(input);
        expect(target.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 100});
        input.bags[0].bag.id = "bag-b";
        input.bags[0].runs[0].snapshot = bagRunFixture({runId: "run-b", bagId: "bag-b"});
        input.bags[0].runs[0].overlapsBaseline = true;
        input.selections = [];
        target.restoreInventory(input);
        expect(target.balance("bag-b", 18, "xbrw")).toEqual({kind: "needsCheck"});
    });

    it("does not import an unclosed unknown attempt as confidently unused coffee", () => {
        const input = inventory();
        input.bags[0].runs[0].progress = {
            consumption: "pending", possible: false, closed: false
        };
        const target = stores();
        target.restoreInventory(input);
        expect(target.balance("bag-a", 18, "xbrw")).toEqual({kind: "needsCheck"});
        target.correct("bag-a", 100);
        target.recoverPending();
        expect(target.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 100});
    });

    it("does not reassign a global run ID already belonging to another local bag", () => {
        const target = stores();
        target.create(bagFixture({id: "local"}));
        target.beginRun(bagRunFixture({bagId: "local"}));
        expect(target.restoreInventory(inventory())).toEqual({added: 1, skippedRows: 1});
        expect(target.balance("bag-a", 18, "xbrw")).toEqual({kind: "needsCheck"});
        expect(mockDb.getFirstSync("SELECT bagId FROM coffee_bag_runs WHERE runId = 'run-a';"))
            .toEqual({bagId: "local"});
    });

    it("rolls back a new bag and its links when its accounting cannot be restored", () => {
        const target = stores();
        target.select("a", null, 10);
        mockDb.execSync(`CREATE TRIGGER reject_imported_runs BEFORE INSERT ON coffee_bag_runs
            BEGIN SELECT RAISE(FAIL, 'disk full'); END;`);
        expect(() => target.restoreInventory(inventory())).toThrow("disk full");
        expect(target.get("bag-a")).toBeNull();
        expect(target.linked("a")).toEqual([]);
        expect(target.selection("a")).toEqual({recipeUuid: "a", bagId: null, selectedAt: 10});
    });

    it("fails export explicitly on corrupt accounting instead of quietly omitting inventory", () => {
        const target = stores();
        target.create(bagFixture());
        target.beginRun(bagRunFixture());
        mockDb.runSync("UPDATE coffee_bag_runs SET snapshot = '{}';");
        expect(() => target.exportInventory()).toThrow(/read/i);
    });

    it("does not let a deleted bag's late failed callback block every future backup", () => {
        const target = stores();
        target.create(bagFixture());
        target.beginRun(bagRunFixture());
        const used = {consumption: "used" as const, possible: true, closed: false};
        target.invalidateBagEstimate(bagRunFixture(), used);
        target.remove("bag-a");
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        target.invalidateBagEstimate(bagRunFixture(), {...used, closed: true});
        expect(target.exportInventory().bags).toEqual([]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
