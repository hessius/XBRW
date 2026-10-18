import {parseHidden} from "@/library/hiddenShelves";
import {readPrints} from "@/library/importRefresh";
import {
    addToLibrary, addToShelf, fetchCoffeeRecipe, takeRoasterLatest
} from "@/library/roasterRecipes";
import {feed, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

const coffees = feed([{id: "a"}, {id: "b", sizes: ["15g", "20g"]}]).coffees;

describe("fetchCoffeeRecipe", () => {
    it("fetches the 18g recipe by default, decorated and named like an import link", async () => {
        const library = memoryLibrary();
        const {recipe, size} = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
        expect(size).toBe("18g");
        expect(library.fetched).toEqual(["a-18g"]);
        expect(recipe.name).toBe("Coffee a - 18g");
        expect(recipe.coffee?.name).toBe("Coffee a");
        expect(recipe.source).toBe("import");
    });

    it("carries the roaster's rest and peak days on the coffee for the bag sheet", async () => {
        const library = memoryLibrary();
        const {recipe} = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
        expect(recipe.coffee).toEqual(expect.objectContaining({
            restDays: 11, peakDay: 28, bestUntilDay: 42
        }));
        // The level stays the feed's to show; it is not written into the coffee.
        expect(recipe.coffee?.roast).toBeUndefined();
    });

    it("fetches the size asked for, and falls back to the first", async () => {
        const library = memoryLibrary();
        expect((await fetchCoffeeRecipe(coffees[0], "15g", library.deps)).size).toBe("15g");
        expect((await fetchCoffeeRecipe(coffees[1], undefined, library.deps)).size).toBe("15g");
    });
});

describe("addToLibrary", () => {
    it("saves a new recipe and remembers what it looked like", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        const outcome = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                     library.deps, settings);
        expect(outcome.kind).toBe("added");
        expect(library.all()).toHaveLength(1);
        expect(Object.keys(readPrints(settings))).toEqual([library.all()[0].uuid]);
    });

    it("leaves an identical copy alone", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);
        expect(again.kind).toBe("already");
        expect(library.all()).toHaveLength(1);
    });

    it("updates an untouched copy quietly when the roaster changed the recipe", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        library.serve("a-18g", 62);

        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);

        expect(again.kind).toBe("updated");
        expect(library.all()).toHaveLength(1);
        expect(library.find("a-18g")?.grindSize).toBe(62);
    });

    it("asks before touching an edited copy, and either answer keeps the user's name", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        const mine = library.find("a-18g")!;
        mine.dosage = 20;
        mine.name = "Mine";
        mine.description = "notes";
        library.deps.save(mine);
        library.serve("a-18g", 62);

        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);
        expect(again.kind).toBe("ask");
        expect(library.find("a-18g")).toMatchObject({dosage: 20, grindSize: 50});

        if (again.kind !== "ask") return;
        takeRoasterLatest(again.held, again.latest, library.deps, settings);
        expect(library.find("a-18g")).toMatchObject({grindSize: 62, name: "Mine", description: "notes"});
    });
});

describe("addToShelf", () => {
    it("puts the recipe on the shelf and marks the shelf as the user's", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        const added = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);
        if (added.kind !== "added") throw new Error("expected a new recipe");

        const bag = addToShelf(added.recipe, "Pantry", library.deps, settings);

        expect(library.find("a-18g")?.tags[0]).toBe("Pantry");
        expect(parseHidden(settings.get("myShelves"))).toEqual(["tag:pantry"]);
        expect(bag).toEqual({recipeUuid: added.recipe.uuid, shelf: "Pantry"});
    });
});
