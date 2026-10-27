import {subscribe} from "@/library/roasterSync";
import {
    MAX_ROASTER_CHOICES, saveRoasterChoice, searchRoasterRecipes, subscribedCatalogues
} from "@/library/roasterSearch";
import {brewable as cardFixture, FEED_URL, feedBody, memoryLibrary as cardLibrary, memorySettings} from "@/test-utils/roasterFeed";
import Pour from "@/library/Pour";

// The shared card fixture exceeds the BLE stage limit and uses a card-only flow.
function brewable(id = "") {
    const recipe = cardFixture(id);
    recipe.pours = [
        new Pour(1, 144, 92, 30, 0, 0, 0),
        new Pour(2, 144, 92, 30, 0, 0, 0)
    ];
    return recipe;
}

function memoryLibrary(...args: Parameters<typeof cardLibrary>) {
    const library = cardLibrary(...args);
    const fetch = library.deps.fetchRecipe;
    library.deps.fetchRecipe = async (...request) => {
        const recipe = await fetch(...request);
        if (recipe !== null) recipe.pours = brewable().pours;
        return recipe;
    };
    return library;
}

function subscribedSettings(coffees: Parameters<typeof feedBody>[0], roaster?: string) {
    const settings = memorySettings();
    const {feed, body} = feedBody(coffees, roaster);
    subscribe(settings, FEED_URL, feed, body, 1000);
    return settings;
}

describe("subscribedCatalogues", () => {
    it("reads each subscription's cached feed", () => {
        const catalogues = subscribedCatalogues(subscribedSettings([{id: "a"}], "Hill Roasters"));
        expect(catalogues).toHaveLength(1);
        expect(catalogues[0]).toMatchObject({feedUrl: FEED_URL, roaster: "Hill Roasters"});
        expect(catalogues[0].feed.coffees.map((coffee) => coffee.name)).toEqual(["Coffee a"]);
    });

    it("is empty with no subscriptions", () => {
        expect(subscribedCatalogues(memorySettings())).toEqual([]);
    });
});

describe("searchRoasterRecipes", () => {
    const catalogues = () => subscribedCatalogues(subscribedSettings([
        {id: "kenya", name: "Kenya Nyeri"},
        {id: "peru", name: "Peru Lima", available: false, sizes: ["18g"]},
        {id: "brazil", name: "Brazil Cerrado", sizes: ["18g"]}
    ], "Hill Roasters"));

    it("finds nothing for an empty term", () => {
        expect(searchRoasterRecipes(catalogues(), "  ")).toEqual([]);
    });

    it("lists one row per coffee and size, named as the library would name it", () => {
        const found = searchRoasterRecipes(catalogues(), "kenya");
        expect(found.map((choice) => choice.name)).toEqual(["Kenya Nyeri - 18g", "Kenya Nyeri - 15g"]);
        expect(found[0]).toMatchObject({roaster: "Hill Roasters", size: "18g", feedUrl: FEED_URL});
        expect(new Set(found.map((choice) => choice.key)).size).toBe(2);
    });

    it("matches every coffee by the roaster's name, on sale first and sold out after", () => {
        const found = searchRoasterRecipes(catalogues(), "hill");
        expect(found.map((choice) => choice.name)).toEqual([
            "Kenya Nyeri - 18g", "Kenya Nyeri - 15g", "Brazil Cerrado - 18g", "Peru Lima - 18g"
        ]);
    });

    it("leaves out recipes the library already has from the same link", () => {
        const found = searchRoasterRecipes(catalogues(), "kenya", [brewable("kenya-18g")]);
        expect(found.map((choice) => choice.size)).toEqual(["15g"]);
    });

    it("stops at a readable number of rows", () => {
        const many = Array.from({length: 40}, (_, index) => ({id: `c${index}`, name: `Blend ${index}`}));
        const found = searchRoasterRecipes(subscribedCatalogues(subscribedSettings(many)), "blend");
        expect(found).toHaveLength(MAX_ROASTER_CHOICES);
    });

    it("lists only compatible machine variants, defaulting to Studio", () => {
        const cached = catalogues();
        const variants = cached[0].feed.coffees[0].recipes;
        variants[0].machineModel = "original";
        variants[1].machineModel = "studio";
        expect(searchRoasterRecipes(cached, "kenya").map(choice => choice.size)).toEqual(["15g"]);
        expect(searchRoasterRecipes(cached, "kenya", [], "original").map(choice => choice.size))
            .toEqual(["18g"]);
    });
});

describe("saveRoasterChoice", () => {
    it("does not persist if cancelled between lookup completion and saving", async () => {
        const settings = subscribedSettings([{id: "kenya"}]);
        const library = memoryLibrary();
        const controller = new AbortController();
        let finish: (recipe: ReturnType<typeof brewable>) => void = () => { throw new Error("Lookup not started"); };
        library.deps.fetchRecipe = () => new Promise(resolve => { finish = resolve; });
        const [choice] = searchRoasterRecipes(subscribedCatalogues(settings), "kenya");
        const pending = saveRoasterChoice(choice, library.deps, settings, controller.signal);
        finish(brewable("kenya-18g"));
        queueMicrotask(() => controller.abort());
        await expect(pending).rejects.toMatchObject({name: "AbortError"});
        expect(library.all()).toEqual([]);
    });

    it("rejects an unsupported recipe before creating a library row", async () => {
        const settings = subscribedSettings([{id: "kenya"}]);
        const library = memoryLibrary();
        const invalid = brewable("kenya-18g");
        invalid.bypassEnabled = true;
        library.deps.fetchRecipe = async () => invalid;
        const [choice] = searchRoasterRecipes(subscribedCatalogues(settings), "kenya");
        await expect(saveRoasterChoice(choice, library.deps, settings)).rejects.toThrow(/bypass/i);
        expect(library.all()).toEqual([]);
    });

    it("rejects an incompatible retained edited copy without updating it", async () => {
        const settings = subscribedSettings([{id: "kenya"}]);
        const held = brewable("kenya-18g");
        held.grindSize = 55;
        held.bypassEnabled = true;
        const library = memoryLibrary([held]);
        const [choice] = searchRoasterRecipes(subscribedCatalogues(settings), "kenya");
        await expect(saveRoasterChoice(choice, library.deps, settings)).rejects.toThrow(/bypass/i);
        expect(library.all()).toHaveLength(1);
        expect(library.all()[0].grindSize).toBe(55);
    });

    it("fetches the picked size and saves it to the library", async () => {
        const settings = subscribedSettings([{id: "kenya", name: "Kenya Nyeri"}]);
        const library = memoryLibrary();
        const [choice] = searchRoasterRecipes(subscribedCatalogues(settings), "kenya")
            .filter((entry) => entry.size === "15g");
        const recipe = await saveRoasterChoice(choice, library.deps, settings);
        expect(library.fetched).toEqual(["kenya-15g"]);
        expect(recipe.name).toBe("Kenya Nyeri - 15g");
        expect(library.all().map((entry) => entry.uuid)).toEqual([recipe.uuid]);
    });

    it("returns the library's copy when the same recipe is already there", async () => {
        const settings = subscribedSettings([{id: "kenya", name: "Kenya Nyeri"}]);
        const held = brewable("kenya-18g");
        const library = memoryLibrary([held]);
        const choice = {
            ...searchRoasterRecipes(subscribedCatalogues(settings), "kenya")
                .find((entry) => entry.size === "15g")!,
            size: "18g"
        };
        const recipe = await saveRoasterChoice(choice, library.deps, settings);
        expect(recipe.uuid).toBe(held.uuid);
        expect(library.all()).toHaveLength(1);
    });

    it("passes a failed fetch on to the caller", async () => {
        const settings = subscribedSettings([{id: "kenya", name: "Kenya Nyeri"}]);
        const library = memoryLibrary([], new Set(["kenya-18g"]));
        const [choice] = searchRoasterRecipes(subscribedCatalogues(settings), "kenya");
        await expect(saveRoasterChoice(choice, library.deps, settings)).rejects.toThrow();
        expect(library.all()).toEqual([]);
    });
});
