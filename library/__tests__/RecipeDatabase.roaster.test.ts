import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe, {type RecipeSource} from "@/library/Recipe";
import {resolveLibraryFilter, roasterFilterId} from "@/library/libraryFilters";
import {buildBackup, parseBackup} from "@/library/backup";
import type {LibraryQuery} from "@/library/libraryQuery";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));
beforeEach(() => { mockBacking = createTestDatabase(); });

const query = (id: string): LibraryQuery => ({
    filters: [id], search: "", sort: "name", direction: "asc", favouritesFirst: false
});
function coffee(roaster?: string, source: RecipeSource = "manual"): Recipe {
    const recipe = new Recipe();
    recipe.name = `Coffee ${source}`;
    recipe.source = source;
    recipe.coffee = {name: "Beans", roaster};
    return recipe;
}

describe("saved roaster SQL membership", () => {
    it("agrees on counts, opened query and art for every saved source, not personal attribution", () => {
        const db = new RecipeDatabase();
        const recipes = (["manual", "duplicate", "import", "read", "brewmind"] as const)
            .map((source, n) => coffee(n % 2 ? "cafe\u0301" : " CAFÉ ", source));
        db.insertRecipes(recipes);
        db.insertRecipe(coffee("Acme"));
        db.insertRecipe(coffee("Acme Coffee"));
        for (const roaster of [undefined, "", "   "]) {
            const missing = coffee(roaster);
            missing.sharedBy = "CAFÉ";
            db.insertRecipe(missing);
        }
        const absent = new Recipe();
        absent.sharedBy = "CAFÉ";
        db.insertRecipe(absent);

        expect(db.countRecipesByRoaster()).toEqual([
            {roaster: "CAFÉ", count: 5}, {roaster: "Acme", count: 1}, {roaster: "Acme Coffee", count: 1}
        ]);
        const id = roasterFilterId("cafe\u0301");
        const uuids = recipes.map(r => r.uuid).sort();
        expect(db.countRecipesByFilter([id], resolveLibraryFilter)).toEqual({[id]: 5});
        expect(db.queryRecipes(query(id), resolveLibraryFilter).map(r => r.uuid).sort()).toEqual(uuids);
        expect(db.shelfMembers([id], resolveLibraryFilter, 10)[id].map(r => r.uuid).sort()).toEqual(uuids);
    });

    it("binds hostile names without expanding the opened shelf or its members", () => {
        const db = new RecipeDatabase();
        const hostile = coffee("x' OR 1=1 --");
        db.insertRecipes([hostile, coffee("Other")]);
        const id = roasterFilterId(hostile.coffee!.roaster!);
        expect(db.countRecipesByFilter([id], resolveLibraryFilter)).toEqual({[id]: 1});
        expect(db.queryRecipes(query(id), resolveLibraryFilter).map(r => r.uuid)).toEqual([hostile.uuid]);
        expect(db.shelfMembers([id], resolveLibraryFilter)[id].map(r => r.uuid)).toEqual([hostile.uuid]);
        expect(db.countRecipes()).toBe(2);
    });

    it("backfills an old blob-only database without rewriting recipe JSON or raw card bytes", () => {
        mockBacking.execSync("CREATE TABLE recipes (uuid TEXT PRIMARY KEY, recipeJSON TEXT);");
        const recipe = coffee("ÖLAND");
        recipe.backup = [1, 2, 255];
        recipe.offline_backup = [3, 4];
        recipe.uid = [5, 6];
        const json = JSON.stringify(recipe);
        mockBacking.runSync("INSERT INTO recipes VALUES (?, ?);", [recipe.uuid, json]);
        const missing = new Recipe();
        mockBacking.runSync("INSERT INTO recipes VALUES (?, ?);", [missing.uuid, JSON.stringify(missing)]);
        const db = new RecipeDatabase();
        expect(db.countRecipesByRoaster()).toEqual([{roaster: "ÖLAND", count: 1}]);
        expect(db.queryRecipes(query("roaster:öland"), resolveLibraryFilter)).toHaveLength(1);
        expect(mockBacking.getFirstSync("SELECT recipeJSON FROM recipes WHERE uuid = ?;", [recipe.uuid]))
            .toEqual({recipeJSON: json});
        expect(db.getRecipe(recipe.uuid)).toMatchObject({
            backup: recipe.backup, offline_backup: recipe.offline_backup, uid: recipe.uid
        });
    });

    it("rebuilds stale indexed projections from saved JSON when the index revision changes", () => {
        const first = new RecipeDatabase();
        const recipe = coffee(" CAFÉ ");
        first.insertRecipe(recipe);
        const before = mockBacking.getFirstSync("SELECT recipeJSON FROM recipes WHERE uuid = ?;", [recipe.uuid]);
        mockBacking.execSync(`
            UPDATE recipes SET roaster = NULL, roasterKey = NULL;
            UPDATE schema_meta SET value = '5e0a07fc' WHERE key = 'indexHash';
        `);
        const reopened = new RecipeDatabase();
        expect(reopened.countRecipesByRoaster()).toEqual([{roaster: "CAFÉ", count: 1}]);
        expect(reopened.queryRecipes(query("roaster:cafe\u0301"), resolveLibraryFilter)
            .map(r => r.uuid)).toEqual([recipe.uuid]);
        expect(mockBacking.getFirstSync("SELECT recipeJSON FROM recipes WHERE uuid = ?;", [recipe.uuid]))
            .toEqual(before);
    });

    it("refreshes indexed membership on edits and removal", () => {
        const db = new RecipeDatabase();
        const recipe = coffee("Acme");
        db.insertRecipe(recipe);
        recipe.coffee!.roaster = "Other";
        db.updateRecipe(recipe.uuid, recipe);
        expect(db.countRecipesByRoaster()).toEqual([{roaster: "Other", count: 1}]);
        recipe.coffee = undefined;
        db.updateRecipe(recipe.uuid, recipe);
        expect(db.countRecipesByRoaster()).toEqual([]);
    });

    it("preserves roaster membership through copy and backup restore without subscription state", () => {
        const db = new RecipeDatabase();
        const recipe = coffee("Acme");
        recipe.backup = [1, 2, 255];
        recipe.offline_backup = [3, 4];
        recipe.uid = [5, 6];
        db.insertRecipe(recipe);
        db.cloneRecipe(recipe.uuid);
        expect(db.countRecipesByRoaster()).toEqual([{roaster: "Acme", count: 2}]);
        const parsed = parseBackup(buildBackup(db.retrieveAllRecipes()!, {}));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        db.replaceAllRecipes(parsed.payload.recipes);
        const id = roasterFilterId("Acme");
        expect(db.countRecipesByRoaster()).toEqual([{roaster: "Acme", count: 2}]);
        expect(db.queryRecipes(query(id), resolveLibraryFilter)).toHaveLength(2);
        expect(db.getRecipe(recipe.uuid)).toMatchObject({
            coffee: recipe.coffee, backup: recipe.backup, offline_backup: recipe.offline_backup, uid: recipe.uid
        });
    });
});
