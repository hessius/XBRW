import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {resolveLibraryFilter} from "@/library/libraryFilters";
import {appDatabase} from "@/library/appDatabase";
// The `mock` prefix is what lets a jest.mock factory close over this binding:
// the factory is hoisted above the imports, so Jest rejects any out-of-scope
// reference that is not named as a mock. Same reason as mockBacking in
// RecipeDatabase.index.test.ts.
import {createTestDatabase as mockCreateTestDatabase} from "@/test-utils/sqlite";

jest.mock("expo-sqlite", () => ({
    // A real SQLite database per call, so each `new RecipeDatabase()` in a
    // test is isolated.
    openDatabaseSync: () => mockCreateTestDatabase()
}));
function freshDatabase(): RecipeDatabase {
    return new RecipeDatabase();
}

function recipeNamed(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

describe("RecipeDatabase", () => {
    describe("deleteAllRecipes", () => {
        it("empties the library", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("A"));
            db.insertRecipe(recipeNamed("B"));

            db.deleteAllRecipes();

            expect(db.retrieveAllRecipes()).toBeNull();
        });

        it("is harmless on an empty library", () => {
            const db = freshDatabase();
            expect(() => db.deleteAllRecipes()).not.toThrow();
            expect(db.retrieveAllRecipes()).toBeNull();
        });
    });

    describe("replaceAllRecipes", () => {
        it("swaps the library for the given recipes", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("old"));

            const fresh = [recipeNamed("A"), recipeNamed("B")];
            db.replaceAllRecipes(fresh);

            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name).sort())
                .toEqual(["A", "B"]);
        });

        it("leaves the original library untouched when an insert throws", () => {
            // The heart of the critical fix: a replace must be all-or-nothing.
            // Two recipes sharing a uuid make the second insert throw
            // "Recipe already exists"; if the delete and the first insert were
            // not rolled back with it, the library would be emptied and half
            // filled — the exact data loss the backup feature exists to prevent.
            const db = freshDatabase();
            const survivor = recipeNamed("survivor");
            db.insertRecipe(survivor);

            const clash = recipeNamed("clash");
            const twin = recipeNamed("twin");
            twin.uuid = clash.uuid;

            expect(() => db.replaceAllRecipes([clash, twin])).toThrow();
            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name))
                .toEqual(["survivor"]);
        });
    });

    describe("insertRecipes", () => {
        it("adds every recipe in the batch", () => {
            const db = freshDatabase();
            db.insertRecipes([recipeNamed("A"), recipeNamed("B")]);

            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name).sort())
                .toEqual(["A", "B"]);
        });

        it("adds none of the batch when one insert throws", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("existing"));

            const one = recipeNamed("one");
            const two = recipeNamed("two");
            two.uuid = one.uuid;

            expect(() => db.insertRecipes([one, two])).toThrow();
            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name))
                .toEqual(["existing"]);
        });
    });
});

describe("duplicating a recipe", () => {
    /** An imported recipe: no name of its own, xBloom's name on the side. */
    function imported(): Recipe {
        const recipe = new Recipe();
        recipe.xbloomName = "Kenya Sakami";
        recipe.xid = "NLC001";
        recipe.source = "import";
        return recipe;
    }

    it("gives the copy a name that tells it apart from the original", () => {
        // The bug behind a library that filled up with what looked like the
        // same recipe six times. An imported recipe has an empty `name` --
        // xBloom's name lives in `xbloomName`, and `displayName()` falls
        // through to it. The copy was named from `name`, so it was named from
        // an empty string, stayed empty, and fell through to exactly the same
        // `xbloomName` as the original. Two rows, same title, nothing to tell
        // them apart -- so the user pressed duplicate again, and again.
        const database = new RecipeDatabase();
        const original = imported();
        database.insertRecipe(original);

        database.duplicateRecipe(original);

        const names = (database.retrieveAllRecipes() ?? []).map((r) => r.displayName());
        expect(names).toContain("Kenya Sakami");
        expect(names).toContain("Kenya Sakami (Copy)");
    });

    it("does not let a duplicate claim the original's account recipe", () => {
        // The import matches a local recipe to an account recipe by `cloudId`.
        // A duplicate that kept the id would leave two rows both claiming to
        // be the same xBloom recipe, and the next sync would have two
        // candidates for one account row and no basis to choose.
        const database = new RecipeDatabase();
        const original = imported();
        original.cloudId = 4242;
        original.cloudFingerprint = "abc123";
        database.insertRecipe(original);

        database.duplicateRecipe(original);

        const copy = (database.retrieveAllRecipes() ?? []).find(
            (r) => r.uuid !== original.uuid
        );
        expect(copy).toBeDefined();
        expect(copy!.cloudId).toBeUndefined();
        expect(copy!.cloudFingerprint).toBeUndefined();
        // The original is untouched -- it is still the one that came down.
        const kept = database.getRecipe(original.uuid);
        expect(kept?.cloudId).toBe(4242);
        expect(kept?.cloudFingerprint).toBe("abc123");
    });

    it("numbers further copies instead of repeating one name", () => {
        const database = new RecipeDatabase();
        const original = imported();
        database.insertRecipe(original);

        database.duplicateRecipe(original);
        database.duplicateRecipe(original);
        database.duplicateRecipe(original);

        const names = (database.retrieveAllRecipes() ?? []).map((r) => r.displayName());
        expect(new Set(names).size).toBe(names.length);
    });

    it("leaves a nameless recipe to its placeholder rather than inventing one", () => {
        // A card read with no name and no XID is shown as "Read 3 Sep", drawn
        // muted because it is a generated label and not a name anyone chose.
        // Copying it must not bake that label into the name field as though
        // the user had typed it.
        const database = new RecipeDatabase();
        const nameless = new Recipe();
        nameless.source = "read";
        database.insertRecipe(nameless);

        database.duplicateRecipe(nameless);

        const copy = (database.retrieveAllRecipes() ?? []).find((r) => r.source === "duplicate");
        expect(copy?.name).toBe("");
        expect(copy?.hasName()).toBe(false);
    });
});

describe("RecipeDatabase.shelfMembers", () => {
    function teaRecipe(name: string): Recipe {
        const recipe = recipeNamed(name);
        recipe.cupType = CUP_TYPE.TEA;
        return recipe;
    }

    it("reads nothing for a shelf id it cannot resolve", () => {
        // Unlike a count, which shouts: a missing mark only costs a tile its
        // picture, whereas a count that answered zero would misreport the
        // library.
        const db = freshDatabase();
        db.insertRecipe(recipeNamed("A"));

        expect(db.shelfMembers(["nonsense"], () => null)).toEqual({});
    });

    it("reads only the recipes on that shelf", () => {
        const db = freshDatabase();
        db.insertRecipe(teaRecipe("Sencha"));
        db.insertRecipe(recipeNamed("Ethiopia"));

        const members = db.shelfMembers(["tea"], resolveLibraryFilter);

        expect(members["tea"].map((r) => r.name)).toEqual(["Sencha"]);
    });

    it("stops at the member cap, however large the shelf", () => {
        const db = freshDatabase();
        ["A", "B", "C", "D", "E"].forEach((name) => db.insertRecipe(teaRecipe(name)));

        const members = db.shelfMembers(["tea"], resolveLibraryFilter, 3);

        expect(members["tea"]).toHaveLength(3);
    });

    it("takes them in the shelf's own order, not insertion order", () => {
        const db = freshDatabase();
        ["Zambia", "Ethiopia", "Kenya"].forEach((n) => db.insertRecipe(teaRecipe(n)));

        const members = db.shelfMembers(["tea"], resolveLibraryFilter, 2);

        expect(members["tea"].map((r) => r.name)).toEqual(["Ethiopia", "Kenya"]);
    });

    it("answers an empty shelf with an empty list, not an absence", () => {
        // The mark's own fallback reads the list; a shelf that is drawn but
        // empty is a real state, since a filter can be applied while it holds
        // nothing.
        const db = freshDatabase();
        db.insertRecipe(recipeNamed("Ethiopia"));

        expect(db.shelfMembers(["tea"], resolveLibraryFilter)["tea"]).toEqual([]);
    });

    it("answers several shelves in one call", () => {
        const db = freshDatabase();
        db.insertRecipe(teaRecipe("Sencha"));
        db.insertRecipe(recipeNamed("Ethiopia"));

        const members = db.shelfMembers(["tea", "singlePour"], resolveLibraryFilter);

        expect(Object.keys(members).sort()).toEqual(["singlePour", "tea"]);
    });
});

describe("RecipeDatabase actual-member covers", () => {
    it("uses UUID ties and a bound real-SQL read without seeking a fifth photo", () => {
        const db = freshDatabase();
        for (const uuid of ["e", "d", "c", "b", "a"]) {
            const recipe = pictured("Same", 1, uuid === "e" ? "https://example.com/fifth.jpg" : undefined);
            recipe.uuid = uuid;
            db.insertRecipe(recipe);
        }
        const query = jest.spyOn(appDatabase(), "getAllSync");
        const members = db.shelfMembers(["tea"], resolveLibraryFilter, 4).tea;
        expect(members.map(recipe => recipe.uuid)).toEqual(["a", "b", "c", "d"]);
        expect(members.every(recipe => !recipe.imageURL)).toBe(true);
        expect(query).toHaveBeenCalledWith(
            expect.stringMatching(/ORDER BY sortName ASC, uuid ASC LIMIT \?/), [4 + 3]
        );
        query.mockRestore();
    });

    it("keeps the guarded unreadable allowance within the SQL bound", () => {
        const db = freshDatabase();
        ["A", "B", "C", "D", "E"].forEach(name => db.insertRecipe(pictured(name, 1)));
        appDatabase().runSync("INSERT INTO recipes (uuid, recipeJSON) VALUES (?, ?);",
            ["broken", '{"name":5}']);
        const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
        const query = jest.spyOn(appDatabase(), "getAllSync");
        expect(db.shelfMembers(["all"], () => ({where: "1=1"}), 4).all.map(recipe => recipe.name))
            .toEqual(["A", "B", "C", "D"]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), [7]);
        expect(warning).toHaveBeenCalled();
        query.mockRestore();
        warning.mockRestore();
    });

    function pictured(name: string, at: number, url?: string): Recipe {
        const recipe = recipeNamed(name);
        recipe.cupType = CUP_TYPE.TEA;
        recipe.createdAt = at;
        if (url !== undefined) recipe.imageURL = url;
        return recipe;
    }

    it("reads actual members alphabetically including unpictured recipes", () => {
        const db = freshDatabase();
        db.insertRecipe(pictured("Old", 1, "https://example.com/old.jpg"));
        db.insertRecipe(pictured("Bare", 5));
        db.insertRecipe(pictured("New", 9, "https://example.com/new.jpg"));
        db.insertRecipe(recipeNamed("Not tea"));

        expect(db.shelfMembers(["tea"], resolveLibraryFilter, 4).tea.map(r => r.name))
            .toEqual(["Bare", "New", "Old"]);
    });

    it("stops at four instead of hunting for newer pictures", () => {
        const db = freshDatabase();
        [1, 2, 3, 4, 5, 6].forEach((n) =>
            db.insertRecipe(pictured(`T${n}`, n, `https://example.com/${n}.jpg`)));

        const members = db.shelfMembers(["tea", "singlePour"], resolveLibraryFilter, 4);
        expect(members.tea.map(r => r.name)).toEqual(["T1", "T2", "T3", "T4"]);
        expect(members.singlePour).toEqual([]);
    });
});

describe("RecipeDatabase stock photo covers (real SQLite)", () => {
    function add(db: RecipeDatabase, uuid: string, imageURL?: string, favourite = true): Recipe {
        const recipe = recipeNamed("Same");
        Object.assign(recipe, {uuid, imageURL, favourite});
        db.insertRecipe(recipe);
        return recipe;
    }

    it("seeks four distinct photographed actual members beyond unpictured and repeated members", () => {
        const db = freshDatabase();
        add(db, "000-blank");
        add(db, "001-portrait").sharedByAvatar = "https://example.com/portrait.jpg";
        for (let n = 0; n < 25; n++) add(db, `repeat-${n}`, "https://example.com/1.jpg");
        for (const n of [5, 4, 3, 2]) add(db, `photo-${n}`, `https://example.com/${n}.jpg`);
        add(db, "000-outside", "https://example.com/outside.jpg", false);
        const query = jest.spyOn(appDatabase(), "getAllSync");
        const first = db.shelfPhotoMembers(["favourites"], resolveLibraryFilter).favourites;
        expect(first.map(recipe => recipe.uuid)).toEqual(["photo-2", "photo-3", "photo-4", "photo-5"]);
        expect(new Set(first.map(recipe => recipe.imageURL)).size).toBe(4);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), [7]);
        expect(db.shelfPhotoMembers(["favourites"], resolveLibraryFilter).favourites.map(r => r.uuid))
            .toEqual(first.map(r => r.uuid));
        expect(db.shelfMembers(["favourites"], resolveLibraryFilter, 4).favourites.map(r => r.uuid))
            .toContain("000-blank");
        query.mockRestore();
    });

    it("does not count duplicate, blank, missing, portrait-only, non-HTTPS or malformed stored pictures", () => {
        const db = freshDatabase();
        add(db, "a", "https://example.com/1.jpg");
        add(db, "b", " https://example.com/1.jpg ");
        add(db, "c", " ");
        add(db, "d", "http://example.com/insecure.jpg");
        const portrait = add(db, "e");
        portrait.sharedByAvatar = "https://example.com/portrait.jpg";
        db.updateRecipe(portrait.uuid, portrait);
        add(db, "f", "https://example.com/2.jpg");
        add(db, "g", "https://example.com/3.jpg");
        appDatabase().runSync("INSERT INTO recipes (uuid, recipeJSON, favourite) VALUES (?, ?, 1);",
            ["invalid-json", "{"]);
        appDatabase().runSync("INSERT INTO recipes (uuid, recipeJSON, favourite) VALUES (?, ?, 1);",
            ["numeric-photo", '{"imageURL":42}']);
        const selected = db.shelfPhotoMembers(["favourites"], resolveLibraryFilter).favourites;
        expect(selected.map(r => r.uuid)).toEqual(["a", "f", "g"]);
    });

    it("does not query other auto shelves, authors or tags", () => {
        const db = freshDatabase();
        const query = jest.spyOn(appDatabase(), "getAllSync");
        expect(db.shelfPhotoMembers(["tea", "allRecipes", "sharedBy:Person", "tag:Coffee"], resolveLibraryFilter))
            .toEqual({});
        expect(query).not.toHaveBeenCalled();
        query.mockRestore();
    });

    it("guards unreadable/invalid candidates within the existing bounded allowance", () => {
        const db = freshDatabase();
        for (let n = 0; n < 4; n++) add(db, `valid-${n}`, `https://example.com/${n}.jpg`);
        appDatabase().runSync(
            "INSERT INTO recipes (uuid, recipeJSON, favourite, sortName) VALUES (?, ?, 1, '0');",
            ["unreadable", '{"name":5,"imageURL":"https://example.com/broken.jpg"}']
        );
        add(db, "invalid-url", "https://?");
        const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
        const query = jest.spyOn(appDatabase(), "getAllSync");
        const members = db.shelfPhotoMembers(["favourites"], resolveLibraryFilter).favourites;
        expect(members.map(recipe => recipe.uuid)).toEqual(["valid-0", "valid-1", "valid-2", "valid-3"]);
        expect(warning).toHaveBeenCalled();
        expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), [7]);
        query.mockRestore();
        warning.mockRestore();
    });

    it.each(["xbloom", "pods", "recentlyAdded", "mostBrewed"])(
        "respects the actual %s clause and its bound parameters", id => {
            const db = freshDatabase();
            const inside = add(db, "member", "https://example.com/member.jpg");
            const outside = add(db, "outsider", "https://example.com/outside.jpg");
            inside.xid = "PODCODE";
            inside.cupType = CUP_TYPE.XPOD;
            inside.createdAt = Date.now();
            outside.createdAt = 1;
            outside.cupType = CUP_TYPE.OMNI;
            db.updateRecipe(inside.uuid, inside);
            db.updateRecipe(outside.uuid, outside);
            for (let n = 0; n < 3; n++) {
                appDatabase().runSync(`INSERT INTO brews
                    (id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                     outcome, pours, waterTotal, cupTotal, heldSeconds, hasStream)
                    VALUES (?, ?, 'member', 'amber', 1, 1, 2, 'done', 1, 100, 90, 0, 0);`,
                [`brew-${n}`, inside.uuid]);
            }
            const clause = resolveLibraryFilter(id)!;
            const query = jest.spyOn(appDatabase(), "getAllSync");
            expect(db.shelfPhotoMembers([id], () => clause)[id].map(r => r.uuid)).toEqual(["member"]);
            const params = clause.params ?? [];
            expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), [...params, 7]);
            query.mockRestore();
        }
    );
});

describe("RecipeDatabase.countRecipesByAuthor", () => {
    function from(name: string, author: string | undefined): Recipe {
        const recipe = recipeNamed(name);
        recipe.sharedBy = author;
        return recipe;
    }

    it("counts nothing in a library nobody shared into", () => {
        const db = freshDatabase();
        db.insertRecipe(from("A", undefined));

        expect(db.countRecipesByAuthor()).toEqual([]);
    });

    it("counts one shelf per person, largest first", () => {
        const db = freshDatabase();
        db.insertRecipe(from("A", "BrewMind"));
        db.insertRecipe(from("B", "BrewMind"));
        db.insertRecipe(from("C", "Kaffe"));

        expect(db.countRecipesByAuthor()).toEqual([
            {author: "BrewMind", count: 2},
            {author: "Kaffe", count: 1}
        ]);
    });

    it("reads two spellings of one name as one person", () => {
        // The reason the folded column exists: COLLATE NOCASE would make these
        // two shelves holding different halves of one person's recipes.
        const db = freshDatabase();
        db.insertRecipe(from("A", "CAFÉ"));
        db.insertRecipe(from("B", "café"));

        const counted = db.countRecipesByAuthor();

        expect(counted).toHaveLength(1);
        expect(counted[0].count).toBe(2);
    });

    it("leaves recipes that came from nobody out of every shelf", () => {
        const db = freshDatabase();
        db.insertRecipe(from("A", "BrewMind"));
        db.insertRecipe(from("B", ""));
        db.insertRecipe(from("C", undefined));

        expect(db.countRecipesByAuthor()).toEqual([{author: "BrewMind", count: 1}]);
    });
});
