import {
    coffeeDetails,
    formatCuppingPoints,
    formatElevation,
    formatRoastingDate
} from "@/library/coffeeDetails";
import type {PodCoffee} from "@/library/podCoffee";

const FULL: PodCoffee = {
    name:           "La Esperanza Gesha",
    roaster:        "Central Coast Coffee",
    roastingDate:   "2026-09-03",
    roast:          "Light",
    origin:         "Colombia, Huila",
    country:        "Colombia",
    region:         "Huila",
    farm:           "Finca La Esperanza",
    farmer:         "Rigoberto Herrera",
    elevation:      1730,
    processing:     "Washed",
    fermentation:   "Anaerobic",
    variety:        "Gesha",
    beanMix:        "Single origin",
    aromatics:      "Jasmine, bergamot, peach",
    note:           "Grown on a steep slope.",
    cupping_points: 88.5,
    decaffeinated:  true,
    url:            "https://example.com/coffee",
    imageUrl:       "https://example.com/coffee.png"
};

const nothingShown = {shownNames: [] as string[]};

function fields(coffee: PodCoffee, options = nothingShown): string[] {
    return coffeeDetails(coffee, options)?.groups.flat().map((row) => row.field) ?? [];
}

describe("formatElevation", () => {
    it("groups thousands and names the unit", () => {
        expect(formatElevation(1730)).toBe("1,730 m");
        expect(formatElevation(950)).toBe("950 m");
        expect(formatElevation(10000)).toBe("10,000 m");
    });
});

describe("formatCuppingPoints", () => {
    it("keeps a quarter point and drops float noise", () => {
        expect(formatCuppingPoints(86)).toBe("86");
        expect(formatCuppingPoints(86.5)).toBe("86.5");
        expect(formatCuppingPoints(86.25)).toBe("86.25");
        expect(formatCuppingPoints(86.1 + 0.2)).toBe("86.3");
    });
});

describe("formatRoastingDate", () => {
    it("keeps the date the roaster wrote, without moving it to this time zone", () => {
        expect(formatRoastingDate("2026-09-03")).toBe("2026-09-03");
        // Late on the 3rd in New York is the 4th in UTC and later still in
        // Sydney. The bag says the 3rd.
        expect(formatRoastingDate("2026-09-03T23:30:00-05:00")).toBe("2026-09-03");
    });
});

describe("coffeeDetails", () => {
    it("is null without a coffee", () => {
        expect(coffeeDetails(undefined, nothingShown)).toBeNull();
    });

    it("lists every field of a full block, grouped and in reading order", () => {
        const details = coffeeDetails(FULL, nothingShown);

        expect(details?.groups.map((group) => group.map((row) => row.field))).toEqual([
            ["roaster"],
            ["origin", "country", "region", "farm", "farmer", "elevation"],
            ["processing", "fermentation", "variety", "beanMix"],
            ["roast", "roastingDate", "decaffeinated"],
            ["aromatics", "cupping_points"]
        ]);
        expect(details?.name).toBe("La Esperanza Gesha");
        expect(details?.note).toBe("Grown on a steep slope.");
        expect(details?.url).toBe("https://example.com/coffee");
    });

    it("writes the formatted values", () => {
        const values = Object.fromEntries(
            coffeeDetails(FULL, nothingShown)!.groups.flat().map((row) => [row.field, row.value])
        );

        expect(values.elevation).toBe("1,730 m");
        expect(values.cupping_points).toBe("88.5 points");
        expect(values.roastingDate).toBe("2026-09-03");
        expect(values.decaffeinated).toBe("Decaf");
    });

    it("leaves out empty and blank fields, and groups left with nothing", () => {
        expect(fields({name: "X", roaster: "  ", region: "Huila", variety: ""}))
            .toEqual(["region"]);
        expect(coffeeDetails({name: "X", region: "Huila"}, nothingShown)?.groups)
            .toHaveLength(1);
    });

    it("says decaf only when the roaster said so", () => {
        // false is a stated "caffeinated", undefined is silence. Neither is
        // worth a row: caffeinated is what everyone assumes already.
        expect(fields({name: "X", decaffeinated: false, roaster: "R"})).toEqual(["roaster"]);
        expect(fields({name: "X", decaffeinated: true})).toEqual(["decaffeinated"]);
    });

    it("drops the pod's origin line when it only repeats the country", () => {
        expect(fields({name: "X", origin: "colombia", country: "Colombia"})).toEqual(["country"]);
        expect(fields({name: "X", origin: "Ethiopia"})).toEqual(["origin"]);
    });

    it("repeats the name only when the screen does not already show it", () => {
        const coffee = {name: "La Esperanza Gesha", roaster: "R"};

        expect(coffeeDetails(coffee, {shownNames: ["la esperanza  gesha"]})?.name)
            .toBeUndefined();
        expect(coffeeDetails(coffee, {shownNames: ["", "Morning V60"]})?.name)
            .toBe("La Esperanza Gesha");
    });

    it("is null when the coffee says nothing beyond a name already shown", () => {
        expect(coffeeDetails({name: "Pod Name"}, {shownNames: ["Pod Name"]})).toBeNull();
        // The picture alone is not a reason to draw: XPOD owns pictures.
        expect(coffeeDetails({name: "Pod Name", imageUrl: "https://x/a.png"},
                             {shownNames: ["Pod Name"]})).toBeNull();
    });

    it("drops the coffee link when it is the recipe page FROM already links to", () => {
        const coffee = {name: "X", url: "https://example.com/page"};

        expect(coffeeDetails(coffee, {shownNames: ["X"], recipeUrl: "https://example.com/page"}))
            .toBeNull();
        expect(coffeeDetails(coffee, {shownNames: ["X"], recipeUrl: "https://example.com/other"})?.url)
            .toBe("https://example.com/page");
    });

    it("gives every row a spoken label in words, not a spelled-out caption", () => {
        for (const row of coffeeDetails(FULL, nothingShown)!.groups.flat()) {
            expect(row.spokenLabel).not.toBe(row.label);
            expect(row.spokenLabel).toMatch(/^[A-Z][a-z ]+$/);
        }
    });
});
