import {parseHidden} from "@/library/hiddenShelves";
import {readPrints} from "@/library/importRefresh";
import Recipe from "@/library/Recipe";
import {buildBackup, parseBackup} from "@/library/backup";
import {
    addToLibrary, addToShelf, fetchCoffeeRecipe, takeRoasterLatest
} from "@/library/roasterRecipes";
import {FIT_NAME_MAX} from "@/library/fitName";
import {feed, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

const coffees = feed([{id: "a"}, {id: "b", sizes: ["15g", "20g"]}]).coffees;

describe("fetchCoffeeRecipe", () => {
    it("preserves validated camel-case feed advice beside flavours", async () => {
        const coffee = {...coffees[0], roast: {
            restDays: 11, peakDay: 28, bestUntilDay: 42
        }, flavours: ["Peach"]};
        const {recipe} = await fetchCoffeeRecipe(coffee, undefined, memoryLibrary().deps);
        expect(recipe.coffee).toMatchObject({
            restDays: 11, peakDay: 28, bestUntilDay: 42, flavours: ["Peach"]
        });
    });
    it("keeps contextual roaster metadata in backup JSON without a subscription", async () => {
        const library = memoryLibrary();
        const coffee = {...coffees[0], coffee: {...coffees[0].coffee, roaster: ""}};
        const {recipe} = await fetchCoffeeRecipe(coffee, undefined, library.deps, undefined, "Feed roaster");
        recipe.dosage = 15;
        recipe.ratio = 15;
        recipe.pours[0].volume = 225;
        const parsed = parseBackup(buildBackup([recipe], {}));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.payload.recipes[0].coffee?.roaster).toBe("Feed roaster");
    });

    it.each([
        ["Coffee roaster", "Imported roaster", "Coffee roaster"],
        ["", "Imported roaster", "Imported roaster"],
        ["", "", "Feed roaster"],
        ["   ", "   ", "Feed roaster"]
    ])("uses explicit coffee, imported, then feed roaster (%s, %s)", async (bean, imported, expected) => {
        const library = memoryLibrary();
        const coffee = {...coffees[0], coffee: {...coffees[0].coffee, roaster: bean}};
        const deps = {
            fetchRecipe: async (share: string) => {
                const recipe = await library.deps.fetchRecipe(share);
                if (recipe) recipe.coffee = {name: "Imported coffee", roaster: imported};
                return recipe;
            }
        };
        const {recipe} = await fetchCoffeeRecipe(coffee, undefined, deps, undefined, "Feed roaster");
        expect(recipe.coffee?.roaster).toBe(expected);
        expect(new Recipe(undefined, JSON.stringify(recipe)).coffee?.roaster).toBe(expected);
    });

    it("does not decorate a recipe fetched after its feed context is cancelled", async () => {
        const library = memoryLibrary();
        const controller = new AbortController();
        const coffee = {...coffees[0], coffee: {...coffees[0].coffee, roaster: ""}};
        const fetched = library.deps.fetchRecipe("https://example.com/?id=a-18g");
        const deps = {fetchRecipe: async () => { controller.abort(); return fetched; }};
        await expect(fetchCoffeeRecipe(coffee, undefined, deps, controller.signal, "Cancelled"))
            .rejects.toThrow();
        expect((await fetched)?.coffee).toBeUndefined();
    });
    it("fetches the 18g recipe by default, decorated and named like an import link", async () => {
        const library = memoryLibrary();
        const {recipe, size} = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
        expect(size).toBe("18g");
        expect(library.fetched).toEqual(["a-18g"]);
        expect(recipe.name).toBe("Coffee a - 18g");
        expect(recipe.coffee?.name).toBe("Coffee a");
        expect(recipe.source).toBe("import");
    });

    it("fits a long coffee name under the ceiling and keeps the size", async () => {
        const name = "Colombia | El Diviso | Nestor Lasso | Aji Bourbon Natural " +
                     "(Tropical Fruit Forward Lush) (Competition Coffee)";
        const [long] = feed([{id: "x", name}]).coffees;
        const {recipe} = await fetchCoffeeRecipe(long, undefined, memoryLibrary().deps);
        expect(recipe.name).toBe("Colombia | El Diviso | Nestor Lasso | Aji Bourbon Natural " +
                                 "(Tropical Fruit Forward Lush) - 18g");
        expect(recipe.name.length).toBeLessThanOrEqual(FIT_NAME_MAX);
    });

    it("fetches the size asked for, and falls back to the first", async () => {
        const library = memoryLibrary();
        expect((await fetchCoffeeRecipe(coffees[0], "15g", library.deps)).size).toBe("15g");
        expect((await fetchCoffeeRecipe(coffees[1], undefined, library.deps)).size).toBe("15g");
    });
});

describe("addToLibrary", () => {
    it.each(["My roaster", "", "   "])("fills only a blank saved roaster (%s)", async roaster => {
        const settings = memorySettings();
        const library = memoryLibrary();
        const first = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
        first.recipe.coffee = {name: "My coffee", roaster};
        addToLibrary(first, library.deps, settings);
        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                  library.deps, settings);
        expect(again.kind).toBe("already");
        expect(again.kind !== "ask" && again.recipe.coffee?.roaster)
            .toBe(roaster.trim() ? roaster : "Test Roaster");
    });
    it.each(["same", "replace", "latest", "shelf"] as const)(
        "does not mutate a held copy or fingerprints when the %s save throws", async kind => {
            const settings = memorySettings();
            const library = memoryLibrary();
            addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                         library.deps, settings);
            const held = library.all()[0];
            held.name = "";
            held.coffee = undefined;
            if (kind === "replace" || kind === "latest") library.serve("a-18g", 62);
            const fetched = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
            const before = JSON.stringify(held);
            const prints = settings.get("importFingerprints");
            const deps = {
                ...library.deps, stored: () => [held],
                save: () => { throw new Error("disk full"); }
            };
            expect(() => {
                if (kind === "latest") takeRoasterLatest(held, fetched.recipe, deps, settings);
                else if (kind === "shelf") addToShelf(held, "Pantry", deps, settings);
                else addToLibrary(fetched, deps, settings);
            }).toThrow("disk full");
            expect(JSON.stringify(held)).toBe(before);
            expect(settings.get("importFingerprints")).toBe(prints);
            expect(settings.get("myShelves")).toBe("");
        }
    );

    it("does not remember a new recipe when its save fails", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        const fetched = await fetchCoffeeRecipe(coffees[0], undefined, library.deps);
        expect(() => addToLibrary(fetched, {
            ...library.deps, save: () => { throw new Error("disk full"); }
        }, settings)).toThrow("disk full");
        expect(readPrints(settings)).toEqual({});
        expect(library.all()).toEqual([]);
    });

    it("saves a new recipe and remembers what it looked like", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        const outcome = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                     library.deps, settings);
        expect(outcome.kind).toBe("added");
        expect(library.all()).toHaveLength(1);
        expect(Object.keys(readPrints(settings))).toEqual([library.all()[0].uuid]);
    });

    it("names a copy that still reads as xBloom's own name when it is added again", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        const held = library.all()[0];
        held.xbloomName = "col Java hydrohoney -18g";
        held.name = "col Java hydrohoney -18g";
        library.deps.save(held);

        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);
        expect(again.kind).toBe("already");
        expect(library.find("a-18g")?.name).toBe("Coffee a - 18g");
    });

    it("never renames a copy the user named", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        const held = library.all()[0];
        held.xbloomName = "col Java hydrohoney -18g";
        held.name = "My Java";
        library.deps.save(held);
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        expect(library.find("a-18g")?.name).toBe("My Java");
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

    it("keeps local edits when adding the author's unchanged recipe again", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps), library.deps, settings);
        const mine = library.all()[0];
        const originalPrints = readPrints(settings);
        mine.grindSize = 55;
        library.deps.save(mine);

        const again = addToLibrary(await fetchCoffeeRecipe(coffees[0], undefined, library.deps),
                                   library.deps, settings);
        expect(again.kind).toBe("already");
        expect(library.find("a-18g")?.grindSize).toBe(55);
        expect(readPrints(settings)).toEqual(originalPrints);
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

describe("a roaster colour from the catalogue", () => {
    // Sky is the coffee accent nearest a mid blue; see `roasterColour.test.ts`.
    const SKY = 0;
    const [blue] = feed([{id: "a", colour: "#1D5F96"}]).coffees;

    it("gives a newly added recipe the accent nearest the roaster's colour", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(blue, undefined, library.deps), library.deps, settings);
        expect(library.find("a-18g")?.accentIndex).toBe(SKY);
    });

    it("keeps the accent a held copy already has when the roaster's recipe changes", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(blue, undefined, library.deps), library.deps, settings);
        const held = library.find("a-18g")!;
        held.accentIndex = 3;
        library.deps.save(held);
        library.serve("a-18g", 62);

        const again = addToLibrary(await fetchCoffeeRecipe(blue, undefined, library.deps),
                                   library.deps, settings);

        expect(again.kind).toBe("updated");
        expect(library.find("a-18g")).toMatchObject({grindSize: 62, accentIndex: 3});
    });

    it("keeps the held accent when the user takes the roaster's latest over an edit", async () => {
        const settings = memorySettings();
        const library = memoryLibrary();
        addToLibrary(await fetchCoffeeRecipe(blue, undefined, library.deps), library.deps, settings);
        const mine = library.find("a-18g")!;
        mine.accentIndex = 5;
        mine.dosage = 20;
        library.deps.save(mine);
        library.serve("a-18g", 62);

        const again = addToLibrary(await fetchCoffeeRecipe(blue, undefined, library.deps),
                                   library.deps, settings);
        expect(again.kind).toBe("ask");
        if (again.kind !== "ask") return;
        takeRoasterLatest(again.held, again.latest, library.deps, settings);
        expect(library.find("a-18g")).toMatchObject({grindSize: 62, accentIndex: 5});
    });
});
