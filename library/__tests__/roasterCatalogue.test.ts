import {
    bagLine, beanFacts, chooseRecipe, coffeeRef, detailTitle, findCoffee, formatElevation,
    formatScore, LONG_TITLE_SIZE, noteChips, notesLine, readCatalogue, tasteOf, roastAdvice, scrollEndPadding, updatedAgo,
    writeCatalogue, dropCatalogue
} from "@/library/roasterCatalogue";
import {FEED_URL, feed, feedJson, memorySettings} from "@/test-utils/roasterFeed";

const HOUR = 60 * 60 * 1000;

describe("the cached catalogue", () => {
    it("round-trips a feed body and forgets it on request", () => {
        const settings = memorySettings();
        writeCatalogue(settings, FEED_URL, feedJson([{id: "a"}]), 5);
        expect(readCatalogue(settings, `${FEED_URL}&cache=1`)?.fetchedAt).toBe(5);
        dropCatalogue(settings, FEED_URL);
        expect(readCatalogue(settings, FEED_URL)).toBeNull();
    });

    it("names a coffee by id, or by place when the roaster gave none", () => {
        const body = JSON.parse(feedJson([{id: "a"}, {id: "b"}]));
        delete body.coffees[1].id;
        const settings = memorySettings();
        writeCatalogue(settings, FEED_URL, JSON.stringify(body), 1);
        const read = readCatalogue(settings, FEED_URL)!.feed;
        expect(read.coffees.map((coffee) => coffeeRef(read, coffee))).toEqual(["id:a", "index:1"]);
        expect(findCoffee(read, "index:1")?.name).toBe("Coffee b");
        expect(findCoffee(read, "id:a")?.name).toBe("Coffee a");
        expect(findCoffee(read, "a")?.name).toBe("Coffee a");
        expect(findCoffee(read, "nope")).toBeUndefined();
    });

    it("round-trips opaque ids without confusing them with positional references", () => {
        const ids = ["#1", "#ethiopia", "1", "id:a", "index:1", "café", "a"];
        const catalogue = feed(ids.map(id => ({id})));
        catalogue.coffees.push({...catalogue.coffees[0], id: undefined, name: "No id"});
        for (const coffee of catalogue.coffees) {
            expect(findCoffee(catalogue, coffeeRef(catalogue, coffee))).toBe(coffee);
        }
        expect(new Set(catalogue.coffees.map(coffee => coffeeRef(catalogue, coffee))).size)
            .toBe(catalogue.coffees.length);
    });

    it.each(["index:-1", "index:1.5", "index: 1", "index:1e0", "index:", "index:999"])(
        "refuses invalid positional references: %s", ref => {
            expect(findCoffee(feed([{id: "a"}, {id: "b"}]), ref)).toBeUndefined();
        }
    );

    it("does not resolve positional references to coffees with explicit identities", () => {
        expect(findCoffee(feed([{id: "a"}]), "index:0")).toBeUndefined();
    });
});

describe("what a coffee says", () => {
    const [coffee] = feed([{id: "a"}]).coffees;

    it("chooses 18g first, the size asked for, or the first", () => {
        expect(chooseRecipe(coffee).size).toBe("18g");
        expect(chooseRecipe(coffee, "15 G").size).toBe("15g");
        expect(chooseRecipe(feed([{id: "b", sizes: ["20g"]}]).coffees[0]).size).toBe("20g");
    });

    it("puts the roast advice in one line", () => {
        expect(roastAdvice(coffee)).toBe("Rest 11 days, peak day 28, best by day 42");
        expect(roastAdvice({...coffee, roast: {peakDay: 35}})).toBe("Peak day 35");
        expect(roastAdvice({...coffee, roast: {level: "Light"}})).toBeNull();
    });

    it("lists bag sizes in grams and kilos", () => {
        expect(bagLine({...coffee, bagSizes: [1000, 320]})).toBe("1 kg · 320 g");
        expect(bagLine({...coffee, bagSizes: []})).toBeNull();
    });

    it("says how fresh it is", () => {
        expect(updatedAgo(0, 30_000)).toBe("Updated just now");
        expect(updatedAgo(0, 2 * HOUR)).toBe("Updated 2 h ago");
    });
});

describe("bean facts, in ABOUT's words", () => {
    it("labels and writes the fields as the XPOD block does", () => {
        const [base] = feed([{id: "a"}]).coffees;
        const coffee = {...base, coffee: {
            ...base.coffee, region: "Huila, Acevedo", farm: "Las Flores", farmer: "Jhoan Vergara",
            variety: "Java", processing: "Hydrohoney", elevation: 1750, cupping_points: 90
        }};
        expect(beanFacts(coffee)).toEqual([
            {label: "COUNTRY", value: "Peru"},
            {label: "REGION", value: "Huila, Acevedo"},
            {label: "FARM", value: "Las Flores"},
            {label: "FARMER", value: "Jhoan Vergara"},
            {label: "ELEVATION", value: "1,750 m"},
            {label: "PROCESS", value: "Hydrohoney"},
            {label: "VARIETAL", value: "Java"},
            {label: "SCORE", value: "90 points"}
        ]);
    });

    it("falls back to the one-line origin only without a country, and drops blanks", () => {
        const [base] = feed([{id: "a"}]).coffees;
        const coffee = {...base, coffee: {name: "x", origin: "Peru, Cajamarca", farm: "  "}};
        expect(beanFacts(coffee)).toEqual([{label: "ORIGIN", value: "Peru, Cajamarca"}]);
    });

    it("groups thousands and keeps a quarter point", () => {
        expect(formatElevation(950)).toBe("950 m");
        expect(formatElevation(12345)).toBe("12,345 m");
        expect(formatScore(86.25)).toBe("86.25 points");
        expect(formatScore(88.0)).toBe("88 points");
    });
});

describe("catalogue layout", () => {
    it("lets a coffee's name take three lines, a step smaller once it is long", () => {
        expect(detailTitle("Short name")).toEqual({lines: 3});
        expect(detailTitle("Colombia | Las Flores | Jhoan Vergara | Java Hydrohoney"))
            .toEqual({lines: 3, size: LONG_TITLE_SIZE});
    });

    it("ends a scroll view clear of the bottom bar, never short of its own minimum", () => {
        // Android three-button navigation: an opaque 48 pt bar.
        expect(scrollEndPadding(24, 48)).toBe(72);
        // Gesture navigation's small inset keeps the screen's own end.
        expect(scrollEndPadding(48, 16)).toBe(48);
        expect(scrollEndPadding(8, 0)).toBe(24);
    });
});

describe("a coffee's taste", () => {
    function coffeeWith(flavours: string[], aromatics?: string, tags: string[] = []) {
        const [base] = feed([{id: "a"}]).coffees;
        return {...base, flavours, tags, coffee: {...base.coffee, aromatics}};
    }

    it("uses the roaster's flavours for chips when it lists them", () => {
        expect(tasteOf(coffeeWith(["Dark Chocolate", "Blueberry"], "Cacao, blueberry", ["Berry"])))
            .toEqual({chips: ["Dark Chocolate", "Blueberry"], tags: ["Berry"]});
    });

    it("still shows prose notes beside the flavours, and falls back to the notes rule", () => {
        const prose = "Clean and well-structured, with a buttery mouthfeel.";
        expect(tasteOf(coffeeWith(["Apple"], prose)).prose).toBe(prose);
        expect(tasteOf(coffeeWith([], "Caramel | brown sugar")).chips).toEqual(["Caramel", "brown sugar"]);
        expect(tasteOf(coffeeWith([], prose))).toEqual({chips: [], prose, tags: []});
    });
});

describe("tasting notes", () => {
    // Four shapes from Central Coast Coffee's live feed.
    const PROSE = "Clean and well-structured, with a buttery mouthfeel. " +
        "Stewed apple, fresh cream and sweet almond.";
    const BRACKETED = "Cherry, Passionfruit, Turkish Delight, Mango (Java Duo Cherry Velvet)";
    const PIPED = "Caramel | brown sugar | lemongrass";
    const HARVEST = "Raspberry Mandarin Floral (2024 Harvest)";

    it("draws a short list as chips, split on commas or pipes", () => {
        expect(noteChips(PIPED)).toEqual(["Caramel", "brown sugar", "lemongrass"]);
        expect(noteChips("Floral, Apricot, Lime")).toEqual(["Floral", "Apricot", "Lime"]);
    });

    it("keeps prose, brackets and single phrases as a sentence", () => {
        expect(noteChips(PROSE)).toBeNull();
        expect(noteChips(BRACKETED)).toBeNull();
        expect(noteChips(HARVEST)).toBeNull();
        expect(noteChips("Lime")).toBeNull();
        expect(noteChips(undefined)).toBeNull();
    });

    it("refuses chips that are too many or too long", () => {
        expect(noteChips("a, b, c, d, e, f, g, h, i")).toBeNull();
        expect(noteChips("Cacao, a very long tasting note indeed")).toBeNull();
    });

    it("gives a list row one line in either case", () => {
        expect(notesLine(PIPED)).toBe("Caramel, brown sugar, lemongrass");
        expect(notesLine(HARVEST)).toBe(HARVEST);
        expect(notesLine("  ")).toBeUndefined();
    });
});
