import type {FeedCoffee} from "@/library/roasterFeed";

/**
 * Search and filters for one roaster's coffees.
 *
 * Pure and React-free, like `library/hub/hubQuery.ts`, which it follows: every
 * question is answered locally over the cached feed, and a filter is offered
 * only when the feed gives it something to choose between.
 *
 * Built from the feed's own fields and nothing else. A roaster's list is short
 * (Central Coast Coffee publishes 30), so these are plain scans.
 */

/** The facets a sheet can choose several values from. */
export type CoffeeFacet = "roasts" | "countries" | "processes";

export type CoffeeQuery = {
    /** Lower case, trimmed. Empty means no search. */
    term: string;
    roasts: string[];
    countries: string[];
    processes: string[];
    /** Only decaf coffees. */
    decaf: boolean;
    /**
     * Only coffees on sale. On by default: the list is for choosing a coffee
     * to buy, and a sold-out one is still one tap away by turning it off.
     */
    inStock: boolean;
};

export const EMPTY_COFFEE_QUERY: CoffeeQuery = {
    term: "", roasts: [], countries: [], processes: [], decaf: false, inStock: true
};

export type CoffeeOption = {value: string; count: number};

/** Which filters this feed has anything to offer for. */
export type CoffeeFilters = {
    roasts: boolean;
    countries: boolean;
    processes: boolean;
    decaf: boolean;
    inStock: boolean;
};

export const FACETS: readonly CoffeeFacet[] = ["roasts", "countries", "processes"];

/** Case and spacing folded, so "Light" and "light " are one value. */
function folded(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function said(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? undefined : trimmed;
}

/** A coffee's value for a facet, as the roaster wrote it. */
export function facetValue(coffee: FeedCoffee, facet: CoffeeFacet): string | undefined {
    if (facet === "roasts") return said(coffee.roast?.level);
    if (facet === "countries") return said(coffee.coffee.country);
    return said(coffee.coffee.processing);
}

/**
 * The values a facet can take, counted, commonest first and then by name.
 *
 * The first spelling seen is the one shown, so a feed that writes "Washed"
 * and "washed" offers one value rather than two.
 */
export function facetOptions(coffees: readonly FeedCoffee[], facet: CoffeeFacet): CoffeeOption[] {
    const seen = new Map<string, CoffeeOption>();
    for (const coffee of coffees) {
        const value = facetValue(coffee, facet);
        if (value === undefined) continue;
        const key = folded(value);
        const option = seen.get(key);
        if (option === undefined) seen.set(key, {value, count: 1});
        else option.count += 1;
    }
    return [...seen.values()].sort(
        (a, b) => b.count - a.count || a.value.localeCompare(b.value)
    );
}

/**
 * Which filters to draw: only those with two or more values in the feed.
 *
 * A filter with one value can only show everything or nothing. Decaf is a
 * value only when the feed states it, so a feed with no decaf coffee offers
 * no decaf filter; in stock is offered only when something is sold out.
 */
export function availableFilters(coffees: readonly FeedCoffee[]): CoffeeFilters {
    const decaf = coffees.filter((coffee) => coffee.coffee.decaffeinated === true).length;
    const onSale = coffees.filter((coffee) => coffee.available).length;
    return {
        roasts:    facetOptions(coffees, "roasts").length >= 2,
        countries: facetOptions(coffees, "countries").length >= 2,
        processes: facetOptions(coffees, "processes").length >= 2,
        decaf:     decaf > 0 && decaf < coffees.length,
        inStock:   onSale > 0 && onSale < coffees.length
    };
}

/** Everything a search looks through, as one folded string. */
function haystack(coffee: FeedCoffee): string {
    const bean = coffee.coffee;
    return [
        coffee.name, bean.country, bean.origin, bean.farm, bean.farmer,
        bean.variety, bean.processing, bean.aromatics, ...coffee.flavours, ...coffee.tags
    ].filter((part): part is string => typeof part === "string").map(folded).join("\n");
}

function inFacet(coffee: FeedCoffee, facet: CoffeeFacet, chosen: readonly string[]): boolean {
    if (chosen.length === 0) return true;
    const value = facetValue(coffee, facet);
    if (value === undefined) return false;
    const key = folded(value);
    return chosen.some((wanted) => folded(wanted) === key);
}

/**
 * Whether a coffee answers the query.
 *
 * Values within a facet are alternatives and facets narrow each other, as in
 * the community catalogue. A filter the feed does not offer is not applied,
 * so a stored query can never empty a list through a control that is not on
 * screen: an all-sold-out roaster still lists its coffees.
 */
export function matchesCoffee(
    coffee: FeedCoffee, query: CoffeeQuery, offered: CoffeeFilters
): boolean {
    if (offered.inStock && query.inStock && !coffee.available) return false;
    if (offered.decaf && query.decaf && coffee.coffee.decaffeinated !== true) return false;
    for (const facet of FACETS) {
        if (offered[facet] && !inFacet(coffee, facet, query[facet])) return false;
    }
    const term = folded(query.term);
    return term === "" || haystack(coffee).includes(term);
}

/** The coffees that answer the query, on sale first and sold out after. */
export function filterCoffees(coffees: readonly FeedCoffee[], query: CoffeeQuery): FeedCoffee[] {
    const offered = availableFilters(coffees);
    const found = coffees.filter((coffee) => matchesCoffee(coffee, query, offered));
    return [
        ...found.filter((coffee) => coffee.available),
        ...found.filter((coffee) => !coffee.available)
    ];
}

/**
 * Whether anything narrows the list. In stock is the default, so it counts
 * only when it is off; turning it off widens the list rather than narrowing.
 */
export function isFiltered(query: CoffeeQuery, offered: CoffeeFilters): boolean {
    return folded(query.term) !== ""
        || FACETS.some((facet) => offered[facet] && query[facet].length > 0)
        || (offered.decaf && query.decaf);
}

/**
 * The header's superscript: the whole count, or "12 of 30" while a search or
 * filter has narrowed it. Hiding sold-out coffees by default is not a
 * narrowing anyone asked for, so it alone reads as the plain count of what is
 * shown.
 */
export function countLabel(shown: number, total: number, filtered: boolean): string {
    const noun = (n: number) => (n === 1 ? "coffee" : "coffees");
    return filtered && shown !== total
        ? `${shown} of ${total} ${noun(total)}`
        : `${shown} ${noun(shown)}`;
}

/**
 * The query each roaster was last left with, for this session.
 *
 * Held in memory rather than in settings: it is a browsing position, and a
 * filter that outlived a restart would greet someone with a shorter list and
 * no memory of why.
 */
const remembered = new Map<string, CoffeeQuery>();

export function rememberedQuery(feedUrl: string): CoffeeQuery {
    return remembered.get(feedUrl) ?? EMPTY_COFFEE_QUERY;
}

export function rememberQuery(feedUrl: string, query: CoffeeQuery): void {
    remembered.set(feedUrl, query);
}

/** For tests: forget every roaster's query. */
export function forgetQueriesForTests(): void {
    remembered.clear();
}
