import Recipe from "@/library/Recipe";
import {decorateImport, fillImportBlanks} from "@/library/importDecoration";

const recipe = () => new Recipe();

describe("decorateImport with a roaster colour", () => {
    it("sets the nearest palette accent only on a recipe without one", () => {
        expect(decorateImport(recipe(), {colour: "#1D5F96"}).accentIndex).toBe(0);
        const held = recipe();
        held.accentIndex = 5;
        expect(decorateImport(held, {colour: "#1D5F96"}).accentIndex).toBe(5);
    });

    it("leaves an unusable colour unset and never stores a raw colour", () => {
        expect(decorateImport(recipe(), {colour: "#333333"}).accentIndex).toBeUndefined();
        expect(decorateImport(recipe(), {colour: "navy"}).accentIndex).toBeUndefined();
        expect(JSON.stringify(decorateImport(recipe(), {colour: "#1D5F96"})))
            .not.toContain("1D5F96");
    });
});

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

    it("names the recipe as the producer does", () => {
        const fetched = recipe();
        fetched.xbloomName = "col chiroso -18g";

        const decorated = decorateImport(fetched, {
            recipeName: "Colombia | Las Flores | Chiroso Natural - 18g"
        });

        expect(decorated.name).toBe("Colombia | Las Flores | Chiroso Natural - 18g");
        expect(decorated.displayName()).toBe("Colombia | Las Flores | Chiroso Natural - 18g");
    });

    it("leaves xBloom's own name where it was", () => {
        // `xbloomName` is what USE THIS NAME restores, so overwriting it would
        // take away the way back to what xBloom called the recipe.
        const fetched = recipe();
        fetched.xbloomName = "col chiroso -18g";

        expect(decorateImport(fetched, {recipeName: "Chiroso Natural"}).xbloomName)
            .toBe("col chiroso -18g");
    });

    describe("the picture", () => {
        const BAG = "https://example.com/bag.png";

        it("comes from the link's coffee when the recipe has none", () => {
            // A share-link import of a recipe made without a pod: no artwork
            // of its own.
            const decorated = decorateImport(recipe(), {coffee: {name: "X", imageUrl: BAG}});

            expect(decorated.imageURL).toBe(BAG);
        });

        it("does not replace pod artwork the recipe already has", () => {
            const fetched = recipe();
            fetched.imageURL = "https://example.com/pod.png";

            expect(decorateImport(fetched, {coffee: {name: "X", imageUrl: BAG}}).imageURL)
                .toBe("https://example.com/pod.png");
        });

        it("fills an empty string the same as a missing one", () => {
            const fetched = recipe();
            fetched.imageURL = "";

            expect(decorateImport(fetched, {coffee: {name: "X", imageUrl: BAG}}).imageURL)
                .toBe(BAG);
        });

        it("ignores a picture that is not https", () => {
            // The coffee normally arrives already checked, but this is a
            // second door into `imageURL`, so it applies the rule itself.
            const decorated = decorateImport(recipe(), {
                coffee: {name: "X", imageUrl: "http://example.com/bag.png"}
            });

            expect(decorated.imageURL).toBeUndefined();
        });

        it("is left alone when the coffee has no picture", () => {
            expect(decorateImport(recipe(), {coffee: {name: "X"}}).imageURL).toBeUndefined();
        });
    });

    it("changes nothing when there is nothing to apply", () => {
        const plain = recipe();
        const before = plain.source;

        const decorated = decorateImport(plain, {});

        expect(decorated.coffee).toBeUndefined();
        expect(decorated.tags).toEqual([]);
        expect(decorated.source).toBe(before);
        expect(decorated.name).toBe("");
        expect(decorated.imageURL).toBeUndefined();
    });
});

describe("decorateImport with a roaster colour", () => {
    it("selects the nearest accent without storing the raw colour", () => {
        const decorated = decorateImport(recipe(), {colour: "#1D5F96"});
        expect(decorated.accentIndex).toBe(0);
        expect(JSON.stringify(decorated)).not.toContain("1D5F96");
    });

    it("never moves an existing accent", () => {
        const held = recipe();
        held.accentIndex = 5;
        expect(decorateImport(held, {colour: "#1D5F96"}).accentIndex).toBe(5);
    });

    it.each(["#333333", "navy"])("leaves the accent unset for %p", colour => {
        expect(decorateImport(recipe(), {colour}).accentIndex).toBeUndefined();
    });
});

describe("fillImportBlanks", () => {
    const BAG = "https://example.com/bag.png";

    it("gives a recipe with no picture the link's coffee photo", () => {
        // The case that made this exist: a recipe imported before links
        // carried `bean.image`, re-imported from a link that does.
        const held = recipe();

        expect(fillImportBlanks(held, {coffee: {name: "X", imageUrl: BAG}})).toBe(true);
        expect(held.imageURL).toBe(BAG);
        expect(held.coffee).toEqual({name: "X", imageUrl: BAG});
    });

    it("keeps a picture the recipe already has", () => {
        const held = recipe();
        held.imageURL = "https://example.com/pod.png";
        held.coffee = {name: "X", imageUrl: "https://example.com/pod.png"};

        expect(fillImportBlanks(held, {coffee: {name: "X", imageUrl: BAG}})).toBe(false);
        expect(held.imageURL).toBe("https://example.com/pod.png");
    });

    it("fills only the coffee fields that are missing or blank", () => {
        const held = recipe();
        held.coffee = {name: "My name for it", roaster: "", processing: "Natural"};

        expect(fillImportBlanks(held, {
            coffee: {
                name: "Their name",
                roaster: "Some Roastery",
                processing: "Washed",
                country: "Colombia"
            }
        })).toBe(true);

        expect(held.coffee).toEqual({
            name: "My name for it",
            roaster: "Some Roastery",
            processing: "Natural",
            country: "Colombia"
        });
    });

    it("never touches the recipe's name or where it came from", () => {
        const held = recipe();
        held.name = "Mine";
        const source = held.source;

        fillImportBlanks(held, {recipeName: "Theirs", source: "brewmind", coffee: {name: "X"}});

        expect(held.name).toBe("Mine");
        expect(held.source).toBe(source);
    });

    it("leaves an empty name empty, because empty means follow the pod", () => {
        const held = recipe();

        expect(fillImportBlanks(held, {recipeName: "Theirs"})).toBe(false);
        expect(held.name).toBe("");
    });

    it("fills the recipe page only when there is none", () => {
        const blank = recipe();
        expect(fillImportBlanks(blank, {recipeUrl: "https://example.com/r"})).toBe(true);
        expect(blank.recipeUrl).toBe("https://example.com/r");

        const held = recipe();
        held.recipeUrl = "https://example.com/mine";
        expect(fillImportBlanks(held, {recipeUrl: "https://example.com/r"})).toBe(false);
        expect(held.recipeUrl).toBe("https://example.com/mine");
    });

    it("tags an untagged recipe from what it just filled", () => {
        const held = recipe();

        fillImportBlanks(held, {coffee: {name: "X", roast: "Medium", processing: "Washed"}});

        expect(held.tags).toEqual(["Medium", "Washed"]);
    });

    it("adds no tags to a recipe that has some", () => {
        const held = recipe();
        held.setTags(["Morning"]);

        fillImportBlanks(held, {coffee: {name: "X", roast: "Medium"}});

        expect(held.tags).toEqual(["Morning"]);
    });

    it("does not re-tag from coffee fields the recipe already had", () => {
        // An untagged recipe whose coffee already says Washed had that tag
        // taken off, or never wanted it. A re-import is no reason to put it
        // back.
        const held = recipe();
        held.coffee = {name: "X", processing: "Washed"};

        expect(fillImportBlanks(held, {coffee: {name: "X", processing: "Washed"}})).toBe(false);
        expect(held.tags).toEqual([]);
    });

    it("reports no change when there is nothing to fill", () => {
        const held = recipe();
        held.imageURL = "https://example.com/pod.png";
        held.recipeUrl = "https://example.com/r";
        held.coffee = {name: "X", roaster: "R"};

        expect(fillImportBlanks(held, {
            coffee: {name: "Y", roaster: "Other", imageUrl: BAG},
            recipeUrl: "https://example.com/other"
        })).toBe(true);
        // The coffee's picture was a blank on the coffee, so that one fills.
        expect(held.coffee.imageUrl).toBe(BAG);
        expect(held.coffee.roaster).toBe("R");
        expect(held.imageURL).toBe("https://example.com/pod.png");

        expect(fillImportBlanks(held, {
            coffee: {name: "Y", roaster: "Other", imageUrl: BAG},
            recipeUrl: "https://example.com/other"
        })).toBe(false);
        expect(fillImportBlanks(held, {})).toBe(false);
    });

    it("ignores a picture that is not https", () => {
        const held = recipe();

        fillImportBlanks(held, {coffee: {name: "X", imageUrl: "http://example.com/bag.png"}});

        expect(held.imageURL).toBeUndefined();
    });
});
