import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

/** See RecipeDatabase.migration.test: the name must be `mock`-prefixed. */
let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
/* eslint-enable import/first */

/** A library row as the old importer wrote it: 18 g, 261 ml, rounded to 1:15. */
function roundedImport(uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.uuid = uuid;
    recipe.source = "import";
    recipe.shareId = "2Lz2R0d1t5O7bKqXl2NpEw==";
    recipe.dosage = 18;
    recipe.ratio = 15;
    recipe.grindSize = 65;
    recipe.pours = [
        new Pour(1, 70, 92, 35, 0, 0, 20),
        new Pour(2, 104, 92, 35, 0, 0, 20),
        new Pour(3, 87, 92, 35, 0, 0, 0)
    ];
    recipe.offline_backup = recipe.getData();
    return recipe;
}

function stored(uuid: string): {ratio: number; volumes: number[]; column: number} {
    const row = mockBacking.getFirstSync(
        "SELECT recipeJSON, ratio FROM recipes WHERE uuid = ?;", [uuid]
    ) as {recipeJSON: string; ratio: number};
    const blob = JSON.parse(row.recipeJSON);
    return {ratio: blob.ratio, column: row.ratio, volumes: new Recipe(undefined, row.recipeJSON).pours.map(pour => pour.volume)};
}

function forgetRepair(): void {
    mockBacking.runSync("DELETE FROM schema_meta WHERE key = 'halfPointRepair';");
}

describe("opening a library with rounded half-point imports", () => {
    beforeEach(() => {
        mockBacking = createTestDatabase();
    });

    it("gives the copy its ratio back, in the blob and the index, with its stages intact", () => {
        const db = new RecipeDatabase();
        forgetRepair();
        db.insertRecipe(roundedImport("uganda"));

        const reopened = new RecipeDatabase();

        expect(stored("uganda")).toEqual({ratio: 14.5, column: 14.5, volumes: [70, 104, 87]});
        expect(reopened.getRecipe("uganda")?.isPourVolumeValid()).toBe(true);
    });

    it("does it once, so a ratio saved on purpose afterwards is not revisited", () => {
        const db = new RecipeDatabase();
        const recipe = roundedImport("uganda");
        db.insertRecipe(recipe);

        new RecipeDatabase();

        expect(stored("uganda").ratio).toBe(15);
    });

    it("leaves a hand-made recipe in the same state alone", () => {
        const db = new RecipeDatabase();
        forgetRepair();
        const mine = roundedImport("mine");
        mine.source = "manual";
        db.insertRecipe(mine);

        new RecipeDatabase();

        expect(stored("mine").ratio).toBe(15);
    });

    it("skips an unreadable row and repairs the rest", () => {
        const db = new RecipeDatabase();
        forgetRepair();
        db.insertRecipe(roundedImport("uganda"));
        mockBacking.runSync("INSERT INTO recipes (uuid, recipeJSON) VALUES ('bad', '{not json');");

        new RecipeDatabase();

        expect(stored("uganda").ratio).toBe(14.5);
    });
});
