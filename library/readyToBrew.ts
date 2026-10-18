/**
 * Which open bag the home screen's "Ready to brew" card offers, and its words.
 *
 * Pure and free of React. It reads the bag tracker (`coffeeBag.ts`) and the
 * freshness rules (`restPeak.ts`) and decides nothing either of them already
 * decides: a bag's grams, its low verdict and its freshness all come from
 * those modules, so the card and the BAG section cannot disagree.
 *
 * The order, best first:
 *
 * 1. at its peak;
 * 2. ready;
 * 3. any other open bag that can still be brewed (past its best, or no roast
 *    day to judge by);
 * 4. a bag with not enough left for another brew (this app's count only);
 * 5. resting.
 *
 * Within a rank, the recipe brewed most recently comes first, because that is
 * the coffee somebody is drinking now; then the bag added most recently.
 * Resting comes last and is offered only when nothing else is open, quietly,
 * because the honest answer then is "not yet".
 */
import {
    readBag,
    remainingLine,
    reorderUrl,
    type BagReading,
    type BagTracker
} from "@/library/coffeeBag";
import type {StoredBagReading} from "@/library/CoffeeBagDatabase";
import type {RecipeEvidence} from "@/library/libraryQuery";
import type {PodCoffee} from "@/library/podCoffee";
import {freshnessOf, shortDay, type FreshnessReading} from "@/library/restPeak";

/** The parts of a `Recipe` the card reads. `Recipe` satisfies it. */
export type ReadyRecipe = {
    uuid: string;
    dosage: number;
    coffee?: PodCoffee;
    recipeUrl?: string;
    imageURL?: string;
    displayName: () => string;
};

/** Ranks, best first. Exported for tests and for the card's emphasis. */
export const READY_RANK = {
    peak:    0,
    ready:   1,
    other:   2,
    empty:   3,
    resting: 4
} as const;

export type ReadyEntry<R extends ReadyRecipe> = {
    recipe: R;
    stored: StoredBagReading;
    /** How fresh the bag is today, or null without a roast day and figures. */
    freshness: FreshnessReading | null;
    /** What is left, in `xbrw` mode only. */
    reading: BagReading | null;
    lastBrewedAt: number;
    rank: number;
};

export type ReadyLow<R extends ReadyRecipe> = {
    recipe: R;
    /** `Vinka`, the name the line says. */
    name: string;
    /** Where to buy it again, or undefined to draw no Reorder. */
    reorderUrl?: string;
};

export type ReadyToBrew<R extends ReadyRecipe> = {
    /** Every open bag with a recipe, best first. Never empty. */
    entries: ReadyEntry<R>[];
    /**
     * The good candidates, at their peak or ready, best first. The card can
     * step through these; "+2 more ready" counts the rest of them.
     */
    good: ReadyEntry<R>[];
    /** In `xbrw` mode, the open bag under two doses the card warns about. */
    low: ReadyLow<R> | null;
};

/**
 * The name a coffee goes by on the card: the pod's coffee where there is one,
 * otherwise the recipe's own name.
 */
export function readyName(recipe: Pick<ReadyRecipe, "coffee" | "displayName">): string {
    const coffee = recipe.coffee?.name.trim();
    return coffee !== undefined && coffee !== "" ? coffee : recipe.displayName();
}

function rankOf(freshness: FreshnessReading | null, reading: BagReading | null): number {
    if (freshness?.state === "resting") return READY_RANK.resting;
    if (reading?.empty === true) return READY_RANK.empty;
    if (freshness?.state === "peak") return READY_RANK.peak;
    if (freshness?.state === "ready") return READY_RANK.ready;
    return READY_RANK.other;
}

/**
 * The card's answer, or null when there is no open bag to talk about.
 *
 * @param recipes the recipes the bags belong to, keyed by uuid. A bag whose
 *   recipe is missing is left out: there is nothing to open or brew.
 * @param tracker grams and the low line are this app's only in `xbrw` mode,
 *   for the reason `resolveBagTracker` gives.
 */
export function readyToBrew<R extends ReadyRecipe>(
    recipes: Readonly<Record<string, R>>,
    bags: Readonly<Record<string, StoredBagReading>>,
    evidence: Readonly<Record<string, RecipeEvidence>>,
    tracker: BagTracker,
    now: number
): ReadyToBrew<R> | null {
    const entries: ReadyEntry<R>[] = [];
    for (const [uuid, stored] of Object.entries(bags)) {
        const recipe = recipes[uuid];
        if (recipe === undefined) continue;
        const freshness = freshnessOf(stored.bag, now);
        const reading = tracker === "xbrw"
            ? readBag(stored.bag, stored.usedGrams, recipe.dosage) : null;
        entries.push({
            recipe,
            stored,
            freshness,
            reading,
            lastBrewedAt: evidence[uuid]?.lastBrewedAt ?? 0,
            rank: rankOf(freshness, reading)
        });
    }
    if (entries.length === 0) return null;
    entries.sort((a, b) => a.rank - b.rank
        || b.lastBrewedAt - a.lastBrewedAt
        || b.stored.bag.addedAt - a.stored.bag.addedAt);

    const good = entries.filter((entry) => entry.rank <= READY_RANK.ready);
    return {entries, good, low: lowOf(entries)};
}

/**
 * The bag to warn about: the first choice's own bag when it is low, so the
 * card never names two coffees when one will do, otherwise the one with the
 * fewest grams left.
 */
function lowOf<R extends ReadyRecipe>(entries: readonly ReadyEntry<R>[]): ReadyLow<R> | null {
    const low = entries.filter((entry) => entry.reading?.low === true);
    if (low.length === 0) return null;
    const first = low.includes(entries[0]) ? entries[0]
        : [...low].sort((a, b) =>
            (a.reading?.remainingGrams ?? 0) - (b.reading?.remainingGrams ?? 0))[0];
    const url = reorderUrl(first.recipe);
    return {
        recipe: first.recipe,
        name: readyName(first.recipe),
        ...(url !== undefined ? {reorderUrl: url} : {})
    };
}

/** Whether the card's BREW is the loud one. Resting and empty bags are quiet. */
export function brewEmphasised(entry: Pick<ReadyEntry<ReadyRecipe>, "rank">): boolean {
    return entry.rank <= READY_RANK.other;
}

/**
 * The card's freshness line. Shorter than the BAG section's, with no full
 * stop, because it sits under a name on a card rather than in a paragraph.
 */
export function readyFreshnessLine(reading: FreshnessReading | null): string | null {
    if (reading === null) return null;
    switch (reading.state) {
        case "resting": return `Resting, ready from ${shortDay(reading.readyOn)}`;
        case "ready": return reading.days < reading.peakDay
            ? `Ready, peak around ${shortDay(reading.peakOn)}`
            : "Ready";
        case "peak": return "At its peak";
        case "past": return "Past its best";
    }
}

/** `212 g left, about 11 brews`, or null outside `xbrw` mode. */
export function readyBagLine(reading: BagReading | null): string | null {
    return reading === null ? null : remainingLine(reading);
}

/** `Vinka is running low`. */
export function runningLowLine(name: string): string {
    return `${name} is running low`;
}

/** `+2 more ready`, or null with nothing more to show. */
export function moreReadyLine(count: number): string | null {
    return count > 0 ? `+${count} more ready` : null;
}

/**
 * Whether the card was put away today. `dismissedOn` is the setting, a local
 * `YYYY-MM-DD`, and `today` is `dayOf(now)`.
 */
export function dismissedToday(dismissedOn: string, today: string): boolean {
    return dismissedOn !== "" && dismissedOn === today;
}
