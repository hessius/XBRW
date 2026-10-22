import {subscribe} from "@/library/roasterSync";
import {
    MAX_ROASTER_CHOICES, saveRoasterChoice, searchRoasterRecipes, subscribedCatalogues
} from "@/library/roasterSearch";
import {brewable, FEED_URL, feedBody, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

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
});

describe("saveRoasterChoice", () => {
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
