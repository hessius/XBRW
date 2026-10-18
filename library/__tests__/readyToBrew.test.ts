import {newBag, type CoffeeBag} from "@/library/coffeeBag";
import type {StoredBagReading} from "@/library/CoffeeBagDatabase";
import type {RecipeEvidence} from "@/library/libraryQuery";
import {
    brewEmphasised,
    dismissedToday,
    moreReadyLine,
    readyBagLine,
    readyFreshnessLine,
    readyName,
    readyToBrew,
    runningLowLine,
    READY_RANK,
    type ReadyRecipe
} from "@/library/readyToBrew";

/** 18 Oct 2026, 9 am local. */
const NOW = new Date(2026, 9, 18, 9).getTime();
const DAY = 86_400_000;

/** A local `YYYY-MM-DD` some days before NOW. */
function daysAgo(days: number): string {
    const d = new Date(2026, 9, 18 - days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function recipe(uuid: string, over: Partial<ReadyRecipe> = {}): ReadyRecipe {
    return {uuid, dosage: 18, displayName: () => `Recipe ${uuid}`, ...over};
}

/** Medium figures: rest 7, peak 18, best until 27. */
function bag(uuid: string, roastedDaysAgo: number | null, over: Partial<CoffeeBag> = {}): CoffeeBag {
    return {
        ...newBag(uuid, {
            sizeGrams: 250,
            ...(roastedDaysAgo === null ? {} : {
                roastedOn: daysAgo(roastedDaysAgo), restDays: 7, peakDay: 18, bestUntilDay: 27
            })
        }, NOW - 30 * DAY),
        id: `bag-${uuid}`,
        ...over
    };
}

function setUp(entries: {recipe: ReadyRecipe; bag: CoffeeBag; used?: number; lastBrewedAt?: number}[]) {
    const recipes: Record<string, ReadyRecipe> = {};
    const bags: Record<string, StoredBagReading> = {};
    const evidence: Record<string, RecipeEvidence> = {};
    for (const entry of entries) {
        recipes[entry.recipe.uuid] = entry.recipe;
        bags[entry.recipe.uuid] = {bag: entry.bag, usedGrams: entry.used ?? 0};
        if (entry.lastBrewedAt !== undefined) {
            evidence[entry.recipe.uuid] = {avgRating: 0, brews: 1, lastBrewedAt: entry.lastBrewedAt};
        }
    }
    return {recipes, bags, evidence};
}

function order(result: ReturnType<typeof readyToBrew> | null): string[] {
    return result?.entries.map((entry) => entry.recipe.uuid) ?? [];
}

describe("readyToBrew selection", () => {
    it("is null without an open bag", () => {
        expect(readyToBrew({a: recipe("a")}, {}, {}, "xbrw", NOW)).toBeNull();
    });

    it("leaves out a bag whose recipe is not there", () => {
        const {bags} = setUp([{recipe: recipe("a"), bag: bag("a", 18)}]);
        expect(readyToBrew({}, bags, {}, "xbrw", NOW)).toBeNull();
    });

    it("prefers at its peak, then ready, then the most recently brewed", () => {
        const {recipes, bags, evidence} = setUp([
            // Brewed most recently, but nothing to say about freshness.
            {recipe: recipe("plain"), bag: bag("plain", null), lastBrewedAt: NOW - DAY},
            // Ready (day 10, before the peak window).
            {recipe: recipe("ready"), bag: bag("ready", 10), lastBrewedAt: NOW - 5 * DAY},
            // At its peak (day 18).
            {recipe: recipe("peak"), bag: bag("peak", 18), lastBrewedAt: NOW - 9 * DAY},
            // Past its best (day 40), brewed yesterday-but-one.
            {recipe: recipe("past"), bag: bag("past", 40), lastBrewedAt: NOW - 2 * DAY}
        ]);
        const result = readyToBrew(recipes, bags, evidence, "xbrw", NOW);
        expect(order(result)).toEqual(["peak", "ready", "plain", "past"]);
        expect(result?.good.map((entry) => entry.recipe.uuid)).toEqual(["peak", "ready"]);
    });

    it("breaks a tie on the most recent brew, then the newest bag", () => {
        const {recipes, bags, evidence} = setUp([
            {recipe: recipe("old"), bag: bag("old", 18), lastBrewedAt: NOW - 4 * DAY},
            {recipe: recipe("new"), bag: bag("new", 18), lastBrewedAt: NOW - DAY},
            {recipe: recipe("never"), bag: bag("never", 18, {addedAt: NOW - DAY})}
        ]);
        expect(order(readyToBrew(recipes, bags, evidence, "xbrw", NOW)))
            .toEqual(["new", "old", "never"]);
    });

    it("skips resting while anything else is open", () => {
        const {recipes, bags} = setUp([
            {recipe: recipe("resting"), bag: bag("resting", 2)},
            {recipe: recipe("plain"), bag: bag("plain", null)}
        ]);
        const result = readyToBrew(recipes, bags, {}, "xbrw", NOW);
        expect(order(result)).toEqual(["plain", "resting"]);
    });

    it("offers a resting bag quietly when it is all there is", () => {
        const {recipes, bags} = setUp([{recipe: recipe("resting"), bag: bag("resting", 2)}]);
        const result = readyToBrew(recipes, bags, {}, "xbrw", NOW);
        const first = result!.entries[0];
        expect(first.rank).toBe(READY_RANK.resting);
        expect(result!.good).toEqual([]);
        expect(brewEmphasised(first)).toBe(false);
        // Roasted 16 Oct, rest 7 days.
        expect(readyFreshnessLine(first.freshness)).toBe("Resting, ready from 23 Oct");
    });

    it("puts a bag with not enough for another brew after one that can be brewed", () => {
        const {recipes, bags} = setUp([
            {recipe: recipe("empty"), bag: bag("empty", 18), used: 240},
            {recipe: recipe("plain"), bag: bag("plain", null)}
        ]);
        const result = readyToBrew(recipes, bags, {}, "xbrw", NOW);
        expect(order(result)).toEqual(["plain", "empty"]);
        expect(brewEmphasised(result!.entries[1])).toBe(false);
    });

    it("ignores grams in Beanconqueror mode", () => {
        const {recipes, bags} = setUp([
            {recipe: recipe("empty"), bag: bag("empty", 18), used: 240},
            {recipe: recipe("plain"), bag: bag("plain", null)}
        ]);
        const result = readyToBrew(recipes, bags, {}, "beanconqueror", NOW);
        expect(order(result)).toEqual(["empty", "plain"]);
        expect(result!.entries[0].reading).toBeNull();
        expect(readyBagLine(result!.entries[0].reading)).toBeNull();
        expect(result!.low).toBeNull();
    });
});

describe("running low", () => {
    const vinka = recipe("vinka", {
        coffee: {name: "Vinka", url: "https://roaster.example/vinka"},
        displayName: () => "Vinka V60"
    });

    it("names the open bag under two doses, with its reorder link", () => {
        const {recipes, bags} = setUp([
            {recipe: recipe("peak"), bag: bag("peak", 18)},
            // 250 - 220 = 30 g, under two 18 g doses.
            {recipe: vinka, bag: bag("vinka", null), used: 220}
        ]);
        const result = readyToBrew(recipes, bags, {}, "xbrw", NOW);
        expect(result?.low).toEqual({
            recipe: vinka, name: "Vinka", reorderUrl: "https://roaster.example/vinka"
        });
        expect(runningLowLine(result!.low!.name)).toBe("Vinka is running low");
    });

    it("has no reorder link when nothing says where to buy it", () => {
        const plain = recipe("plain");
        const {recipes, bags} = setUp([{recipe: plain, bag: bag("plain", null), used: 220}]);
        const low = readyToBrew(recipes, bags, {}, "xbrw", NOW)?.low;
        expect(low?.name).toBe("Recipe plain");
        expect(low).not.toHaveProperty("reorderUrl");
    });

    it("prefers the card's own coffee, then the bag with the least left", () => {
        // The card shows the peak bag, which is not low; of the two low bags
        // b has 30 g left and a 35 g.
        const {recipes, bags} = setUp([
            {recipe: recipe("peak"), bag: bag("peak", 18)},
            {recipe: recipe("a"), bag: bag("a", null), used: 215},
            {recipe: recipe("b"), bag: bag("b", null), used: 220}
        ]);
        expect(readyToBrew(recipes, bags, {}, "xbrw", NOW)?.low?.recipe.uuid).toBe("b");

        const withPeak = setUp([
            {recipe: recipe("peak"), bag: bag("peak", 18), used: 220},
            {recipe: recipe("b"), bag: bag("b", null), used: 240}
        ]);
        expect(readyToBrew(withPeak.recipes, withPeak.bags, {}, "xbrw", NOW)?.low?.recipe.uuid)
            .toBe("peak");
    });

    it("is null when no bag is low", () => {
        const {recipes, bags} = setUp([{recipe: recipe("a"), bag: bag("a", 18)}]);
        expect(readyToBrew(recipes, bags, {}, "xbrw", NOW)?.low).toBeNull();
    });
});

describe("words", () => {
    it("says the freshness briefly", () => {
        const {recipes, bags} = setUp([
            {recipe: recipe("peak"), bag: bag("peak", 18)},
            {recipe: recipe("ready"), bag: bag("ready", 10)},
            {recipe: recipe("late"), bag: bag("late", 24)},
            {recipe: recipe("past"), bag: bag("past", 40)},
            {recipe: recipe("plain"), bag: bag("plain", null)}
        ]);
        const result = readyToBrew(recipes, bags, {}, "xbrw", NOW)!;
        const line = (uuid: string) => readyFreshnessLine(
            result.entries.find((entry) => entry.recipe.uuid === uuid)!.freshness);
        expect(line("peak")).toBe("At its peak");
        // Roasted 8 Oct, peak on day 18.
        expect(line("ready")).toBe("Ready, peak around 26 Oct");
        expect(line("late")).toBe("Ready");
        expect(line("past")).toBe("Past its best");
        expect(line("plain")).toBeNull();
    });

    it("says what is left in this app's mode", () => {
        const {recipes, bags} = setUp([{recipe: recipe("a"), bag: bag("a", 18), used: 38}]);
        const entry = readyToBrew(recipes, bags, {}, "xbrw", NOW)!.entries[0];
        expect(readyBagLine(entry.reading)).toBe("212 g left, about 11 brews");
    });

    it("names the coffee, falling back to the recipe", () => {
        expect(readyName(recipe("a", {coffee: {name: "Vinka"}}))).toBe("Vinka");
        expect(readyName(recipe("a", {coffee: {name: "  "}}))).toBe("Recipe a");
        expect(readyName(recipe("a"))).toBe("Recipe a");
    });

    it("counts the rest of the good candidates", () => {
        expect(moreReadyLine(2)).toBe("+2 more ready");
        expect(moreReadyLine(0)).toBeNull();
    });
});

describe("dismissedToday", () => {
    it("holds for the day it was closed on and no other", () => {
        expect(dismissedToday("2026-10-18", "2026-10-18")).toBe(true);
        expect(dismissedToday("2026-10-17", "2026-10-18")).toBe(false);
        expect(dismissedToday("", "2026-10-18")).toBe(false);
    });
});
