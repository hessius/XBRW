import type {FeedCoffee} from "@/library/roasterFeed";
import {
    availableFilters, countLabel, EMPTY_COFFEE_QUERY, facetOptions, filterCoffees, isFiltered,
    rememberedQuery, rememberQuery, forgetQueriesForTests, type CoffeeQuery
} from "@/library/roasterFilters";
import {feed} from "@/test-utils/roasterFeed";

/** A coffee from the test feed with its bean and roast replaced. */
function coffee(id: string, {available = true, roast, ...bean}: {
    available?: boolean;
    roast?: string;
    country?: string;
    processing?: string;
    farm?: string;
    farmer?: string;
    variety?: string;
    aromatics?: string;
    decaffeinated?: boolean;
}): FeedCoffee {
    const [base] = feed([{id, available}]).coffees;
    return {
        ...base,
        roast: roast === undefined ? undefined : {level: roast},
        coffee: {name: base.name, ...bean}
    };
}

const SHELF: FeedCoffee[] = [
    coffee("las-flores", {roast: "Light", country: "Colombia", processing: "Hydrohoney",
                          farm: "Las Flores", farmer: "Jhoan Vergara", variety: "Java",
                          aromatics: "Cherry, Passionfruit"}),
    coffee("el-palto", {roast: "Nordic Ultra-Light", country: "Peru", processing: "Washed",
                        variety: "Gesha", aromatics: "Cacao, fresh blueberry"}),
    coffee("pillimue", {roast: "Decaf", country: "Colombia", processing: "washed",
                        decaffeinated: true, aromatics: "Stewed apple"}),
    coffee("castellon", {available: false, roast: "light", country: "Colombia",
                         processing: "Washed", decaffeinated: false})
];

function query(patch: Partial<CoffeeQuery>): CoffeeQuery {
    return {...EMPTY_COFFEE_QUERY, ...patch};
}

const ids = (coffees: FeedCoffee[]) => coffees.map((found) => found.id);

describe("roaster filters", () => {
    it("builds each facet's options from the feed, counted and case-folded", () => {
        expect(facetOptions(SHELF, "roasts")).toEqual([
            {value: "Light", count: 2},
            {value: "Decaf", count: 1},
            {value: "Nordic Ultra-Light", count: 1}
        ]);
        expect(facetOptions(SHELF, "processes")).toEqual([
            {value: "Washed", count: 3},
            {value: "Hydrohoney", count: 1}
        ]);
    });

    it("offers only filters with two or more values", () => {
        expect(availableFilters(SHELF)).toEqual({
            roasts: true, countries: true, processes: true, decaf: true, inStock: true
        });
        const oneCountry = SHELF.filter((found) => found.coffee.country === "Colombia")
            .filter((found) => found.available);
        expect(availableFilters(oneCountry)).toMatchObject({countries: false, inStock: false});
        // No coffee states decaf, so there is nothing to choose.
        expect(availableFilters(SHELF.slice(0, 2)).decaf).toBe(false);
    });

    it("hides sold-out coffees by default and brings them back at the end", () => {
        expect(ids(filterCoffees(SHELF, EMPTY_COFFEE_QUERY)))
            .toEqual(["las-flores", "el-palto", "pillimue"]);
        expect(ids(filterCoffees(SHELF, query({inStock: false}))))
            .toEqual(["las-flores", "el-palto", "pillimue", "castellon"]);
    });

    it("never empties an all-sold-out list through a filter it does not offer", () => {
        const soldOut = SHELF.map((found) => ({...found, available: false}));
        expect(filterCoffees(soldOut, EMPTY_COFFEE_QUERY)).toHaveLength(4);
    });

    it("ORs values within a facet and ANDs the facets", () => {
        expect(ids(filterCoffees(SHELF, query({roasts: ["light", "Decaf"]}))))
            .toEqual(["las-flores", "pillimue"]);
        expect(ids(filterCoffees(SHELF, query({countries: ["Colombia"], processes: ["Washed"]}))))
            .toEqual(["pillimue"]);
        expect(ids(filterCoffees(SHELF, query({decaf: true})))).toEqual(["pillimue"]);
    });

    it("searches the name, country, farm, producer, variety, process and notes", () => {
        const found = (term: string) => ids(filterCoffees(SHELF, query({term, inStock: false})));
        expect(found("coffee las-flores")).toEqual(["las-flores"]);
        expect(found("peru")).toEqual(["el-palto"]);
        expect(found("las flores")).toEqual(["las-flores"]);
        expect(found("VERGARA")).toEqual(["las-flores"]);
        expect(found("gesha")).toEqual(["el-palto"]);
        expect(found("hydrohoney")).toEqual(["las-flores"]);
        expect(found("blueberry")).toEqual(["el-palto"]);
        expect(found("nothing like this")).toEqual([]);
    });

    it("counts as filtered only when something narrows the list", () => {
        const offered = availableFilters(SHELF);
        expect(isFiltered(EMPTY_COFFEE_QUERY, offered)).toBe(false);
        expect(isFiltered(query({inStock: false}), offered)).toBe(false);
        expect(isFiltered(query({term: "peru"}), offered)).toBe(true);
        expect(isFiltered(query({countries: ["Peru"]}), offered)).toBe(true);
    });

    it("writes the header count as shown of total while filtered", () => {
        expect(countLabel(30, 30, false)).toBe("30 coffees");
        expect(countLabel(27, 30, false)).toBe("27 coffees");
        expect(countLabel(12, 30, true)).toBe("12 of 30 coffees");
        expect(countLabel(30, 30, true)).toBe("30 coffees");
        expect(countLabel(1, 1, false)).toBe("1 coffee");
        expect(countLabel(0, 30, true)).toBe("0 of 30 coffees");
    });

    it("remembers a roaster's query for the session", () => {
        forgetQueriesForTests();
        expect(rememberedQuery("https://a.example/feed")).toEqual(EMPTY_COFFEE_QUERY);
        rememberQuery("https://a.example/feed", query({countries: ["Peru"]}));
        expect(rememberedQuery("https://a.example/feed").countries).toEqual(["Peru"]);
        expect(rememberedQuery("https://b.example/feed")).toEqual(EMPTY_COFFEE_QUERY);
    });
});
