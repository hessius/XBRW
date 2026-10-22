import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";
import {resolveLibraryFilter, roasterFilterId} from "@/library/libraryFilters";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));
beforeEach(() => { mockBacking = createTestDatabase(); });

it.each([0, 1, 2, 3, 4, 8])("finds up to four of %s saved photos beyond ordinary mark members with canonical matching", count => {
    const db = new RecipeDatabase();
    const pictured: string[] = [];
    for (let n = 0; n < count + 4; n++) {
        const recipe = new Recipe();
        recipe.name = `Coffee ${String(n).padStart(2, "0")}`;
        recipe.coffee = {name: "Beans", roaster: n % 2 ? " CAFÉ " : "cafe\u0301"};
        if (n >= 4) {
            recipe.imageURL = "https://coffee.example/shared.jpg";
            pictured.push(recipe.uuid);
        }
        db.insertRecipe(recipe);
    }
    const outsider = new Recipe();
    outsider.coffee = {name: "Beans", roaster: "Café Coffee"};
    outsider.imageURL = "https://coffee.example/outsider.jpg";
    db.insertRecipe(outsider);
    const hydrateAll = jest.spyOn(db, "retrieveAllRecipes");
    const reads = jest.spyOn(mockBacking, "getAllSync");
    const id = roasterFilterId("cafe\u0301");
    const result = db.shelfPhotoMembers([id, "sharedBy:CAFÉ", "tag:CAFÉ"], resolveLibraryFilter);
    expect(result[id]?.map(r => r.uuid)).toEqual(pictured.slice(0, 4));
    expect(Object.keys(result)).toEqual([id]);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(reads.mock.calls[0][0]).toContain("roasterKey = ?");
    expect(reads.mock.calls[0][0]).toContain("LIMIT ?");
    expect(reads.mock.calls[0][1]).toEqual(["café", 7]); // Four photos plus the existing three-row unreadable allowance.
    expect(hydrateAll).not.toHaveBeenCalled();
});

it("keeps the existing bounded allowance and skips malformed or non-photo saved members", () => {
    const db = new RecipeDatabase();
    for (let n = 0; n < 4; n++) {
        const recipe = new Recipe();
        recipe.uuid = `valid-${n}`;
        recipe.name = `Valid ${n}`;
        recipe.coffee = {name: "Beans", roaster: "Acme"};
        recipe.imageURL = "https://coffee.example/shared.jpg";
        db.insertRecipe(recipe);
    }
    for (const [uuid, json] of [
        ["broken", "{"],
        ["numeric", '{"imageURL":42}'],
        ["unreadable", '{"name":5,"imageURL":"https://coffee.example/unreadable.jpg"}'],
        ["invalid-url", '{"imageURL":"https://?"}'],
        ["insecure", '{"imageURL":"http://coffee.example/photo.jpg"}'],
        ["portrait", '{"sharedByAvatar":"https://coffee.example/portrait.jpg"}']
    ]) {
        mockBacking.runSync(
            "INSERT INTO recipes (uuid, recipeJSON, roasterKey, sortName) VALUES (?, ?, 'acme', '0');",
            [uuid, json]
        );
    }
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reads = jest.spyOn(mockBacking, "getAllSync");
    expect(db.shelfPhotoMembers(["roaster:Acme"], resolveLibraryFilter)["roaster:Acme"]
        .map(r => r.uuid)).toEqual(["valid-0", "valid-1", "valid-2", "valid-3"]);
    expect(reads).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), ["acme", 7]);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
});
