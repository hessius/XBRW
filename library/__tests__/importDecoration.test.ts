import Recipe from "@/library/Recipe";
import {decorateImport} from "@/library/importDecoration";

const recipe = () => new Recipe();

describe("decorateImport", () => {
    it("records the provenance", () => {
        expect(decorateImport(recipe(), {source: "brewmind"}).source).toBe("brewmind");
    });

    it("attaches the coffee whole", () => {
        const coffee = {name: "Finca La Esperanza", roaster: "Some Roastery"};

        expect(decorateImport(recipe(), {coffee}).coffee).toEqual(coffee);
    });

    it("derives a tag only from the closed vocabularies", () => {
        const decorated = decorateImport(recipe(), {
            coffee: {
                name: "X",
                roast: "Medium",
                processing: "Washed",
                fermentation: "Anaerobic",
                roaster: "Some Roastery",
                country: "Colombia"
            }
        });

        // Roaster and country are absent on purpose: per #159 the tag list
        // must not become a second copy of the bean record.
        expect(decorated.tags).toEqual(["Medium", "Washed", "Anaerobic"]);
    });

    it("tags the hyphenated roast levels BrewMind sends", () => {
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roast: "Medium-Dark"}
        });

        expect(decorated.tags).toEqual(["Medium-Dark"]);
    });

    it("tags the app's spelling however the sender wrote the term", () => {
        // The bean record keeps what the roaster wrote. Only the tag, which
        // exists to group, is normalised -- otherwise this coffee would sit
        // in a shelf of one beside every properly spelled Medium-Dark.
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roast: "dark\u2013medium", processing: "WASHED"}
        });

        expect(decorated.tags).toEqual(["Medium-Dark", "Washed"]);
        expect(decorated.coffee?.roast).toBe("dark\u2013medium");
    });

    it("leaves a value outside the vocabulary untagged", () => {
        // Folding case and separators is not the same as guessing. A value
        // that names no member is still left unset, because an invented roast
        // level is worse than none.
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roast: "Extra Light", processing: "wet process"}
        });

        expect(decorated.tags).toEqual([]);
    });

    it("keeps the tags the recipe already had", () => {
        const existing = recipe();
        existing.setTags(["Morning"]);

        expect(decorateImport(existing, {coffee: {name: "X", processing: "Natural"}}).tags)
            .toEqual(["Morning", "Natural"]);
    });

    it("does not tag a recipe twice for the same coffee", () => {
        const coffee = {name: "X", processing: "Natural"};
        const once = decorateImport(recipe(), {coffee});

        expect(decorateImport(once, {coffee}).tags).toEqual(["Natural"]);
    });

    it("changes nothing when there is nothing to apply", () => {
        const plain = recipe();
        const before = plain.source;

        const decorated = decorateImport(plain, {});

        expect(decorated.coffee).toBeUndefined();
        expect(decorated.tags).toEqual([]);
        expect(decorated.source).toBe(before);
    });
});

describe("decorateImport with a roaster colour", () => {
    it("sets the accent nearest the roaster's colour on a recipe without one", () => {
        // Sky, the coffee accent nearest a mid blue.
        expect(decorateImport(recipe(), {colour: "#1D5F96"}).accentIndex).toBe(0);
    });

    it("never moves an accent the recipe already holds", () => {
        const held = recipe();
        held.accentIndex = 5;

        expect(decorateImport(held, {colour: "#1D5F96"}).accentIndex).toBe(5);
    });

    it("leaves the accent unset when the colour has no fair answer", () => {
        expect(decorateImport(recipe(), {colour: "#333333"}).accentIndex).toBeUndefined();
        expect(decorateImport(recipe(), {colour: "navy"}).accentIndex).toBeUndefined();
    });

    it("never stores the colour itself", () => {
        const decorated = decorateImport(recipe(), {
            colour: "#1D5F96",
            coffee: {name: "Finca La Esperanza"}
        });

        expect(JSON.stringify(decorated)).not.toContain("1D5F96");
    });
});
