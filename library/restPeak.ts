/**
 * How long a coffee rests after roasting, when it peaks, and how fresh a bag
 * is today.
 *
 * Pure and free of React. It builds on the bag's roast day, read only through
 * `roastedOnDate` / `daysSinceRoast` in `coffeeBag.ts`, so the calendar rules
 * (a bare day is local midnight, days are calendar days) live in one place.
 *
 * Roast advice is three whole numbers of days since roasting: `restDays` (when
 * it is ready to brew), `peakDay` and `bestUntilDay`. The names are the
 * roaster feed's `rest_days`, `peak_day` and `best_until_day` in this
 * codebase's spelling, and they are checked the way the feed checks them: each
 * one on its own, 0 to 540.
 *
 * Three places can say what they are, best first:
 *
 * 1. the bag, once saved, because the person saw the figures in the bag sheet
 *    and either kept or changed them;
 * 2. the coffee (`PodCoffee`), filled by a BrewMind link's `bean.rest_days`
 *    params or the roaster catalogue's `roast` block (`roastAdviceFromFeed`);
 * 3. a default by roast level, when nothing says.
 *
 * The bag sheet resolves 2 and 3 into figures and saves them on the bag, so a
 * bag's freshness depends on the bag alone and a later change to the coffee
 * cannot move a bag the person already set up.
 */
import {daysSinceRoast, roastedOnDate, type CoffeeBag} from "@/library/coffeeBag";
import {ROAST_DAYS, reviveRoastAdvice, type RoastAdvice} from "@/library/roastAdvice";

export {ROAST_DAYS, reviveRoastAdvice, roastDays, type RoastAdvice} from "@/library/roastAdvice";

/** All three figures, as a bag stores them once set up. */
export type RoastFigures = Required<RoastAdvice>;

/**
 * The roaster catalogue's `roast` block, `{level, rest_days, peak_day,
 * best_until_day}`, as advice. The hook the catalogue uses to fill a coffee.
 */
export function roastAdviceFromFeed(roast: unknown): RoastAdvice {
    if (roast === null || typeof roast !== "object" || Array.isArray(roast)) return {};
    const record = roast as Record<string, unknown>;
    return reviveRoastAdvice({
        restDays: record.rest_days,
        peakDay: record.peak_day,
        bestUntilDay: record.best_until_day
    });
}

/** The roast levels the bag sheet offers, lightest first. */
export type RoastLevelKey = "nordic" | "light" | "medium" | "dark" | "decaf";

/**
 * Defaults by roast level. Lighter roasts hold more gas and take longer to
 * open up; dark roasts are ready in days and fade sooner.
 */
export const ROAST_LEVEL_DEFAULTS: Readonly<Record<RoastLevelKey, RoastFigures>> = {
    nordic: {restDays: 14, peakDay: 35, bestUntilDay: 52},
    light:  {restDays: 11, peakDay: 28, bestUntilDay: 42},
    medium: {restDays: 7,  peakDay: 18, bestUntilDay: 27},
    dark:   {restDays: 4,  peakDay: 10, bestUntilDay: 15},
    decaf:  {restDays: 5,  peakDay: 14, bestUntilDay: 21}
};

export const ROAST_LEVELS: readonly {key: RoastLevelKey; label: string; spoken: string}[] = [
    {key: "nordic", label: "NORDIC", spoken: "Nordic ultra-light"},
    {key: "light",  label: "LIGHT",  spoken: "Light"},
    {key: "medium", label: "MEDIUM", spoken: "Medium"},
    {key: "dark",   label: "DARK",   spoken: "Dark"},
    {key: "decaf",  label: "DECAF",  spoken: "Decaf"}
];

/** Used when the coffee names no roast level. The middle of the range. */
export const FALLBACK_LEVEL: RoastLevelKey = "medium";

/**
 * The level a coffee's own words name, or undefined.
 *
 * Decaf first, because a decaf is rested as a decaf whatever its roast.
 * "Dark" before "medium" so a medium-dark roast rests like a dark one, and
 * "nordic" or "ultra" before "light".
 */
export function roastLevelKey(level?: string, decaffeinated?: boolean): RoastLevelKey | undefined {
    const words = (level ?? "").toLowerCase();
    if (decaffeinated === true || words.includes("decaf")) return "decaf";
    if (words.includes("nordic") || words.includes("ultra")) return "nordic";
    if (words.includes("dark")) return "dark";
    if (words.includes("medium")) return "medium";
    if (words.includes("light")) return "light";
    return undefined;
}

/** The coffee fields this module reads. `PodCoffee` satisfies it. */
export type AdvisedCoffee = RoastAdvice & {roast?: string; decaffeinated?: boolean};

/** Where a set of figures came from, so the sheet can say so. */
export type AdviceSource = "coffee" | "level";

/**
 * The figures to start a bag with: the coffee's own advice where it says,
 * the level's defaults for the rest.
 *
 * `source` is `coffee` only when the coffee states both a rest and a peak,
 * which is what the bag sheet needs to show the roaster's word instead of
 * asking.
 */
export function startingFigures(coffee: AdvisedCoffee | undefined): {
    figures: RoastFigures; level: RoastLevelKey; source: AdviceSource;
} {
    const level = roastLevelKey(coffee?.roast, coffee?.decaffeinated) ?? FALLBACK_LEVEL;
    const base = ROAST_LEVEL_DEFAULTS[level];
    const restDays = coffee?.restDays ?? base.restDays;
    const peakDay = coffee?.peakDay ?? base.peakDay;
    const bestUntilDay = coffee?.bestUntilDay ?? peakDay + (base.bestUntilDay - base.peakDay);
    const source: AdviceSource = coffee?.restDays !== undefined && coffee.peakDay !== undefined
        ? "coffee" : "level";
    return {figures: {restDays, peakDay, bestUntilDay}, level, source};
}

/**
 * Figures from a rest and a peak a person typed.
 *
 * Best-until follows the peak by the level's own gap, so moving the peak
 * moves the end of the window with it rather than leaving it behind.
 */
export function figuresFrom(restDays: number, peakDay: number, level: RoastLevelKey): RoastFigures {
    const base = ROAST_LEVEL_DEFAULTS[level];
    const bestUntilDay = Math.min(ROAST_DAYS.max, peakDay + (base.bestUntilDay - base.peakDay));
    return {restDays, peakDay, bestUntilDay};
}

/** Whether a rest and peak a person typed make sense together. */
export function figuresProblem(restDays: number | undefined, peakDay: number | undefined): string | null {
    if (restDays === undefined || peakDay === undefined) return "Enter whole days, 0 to 540.";
    if (peakDay < restDays) return "The peak day is on or after the rest ends.";
    return null;
}

export type Freshness = "resting" | "ready" | "peak" | "past";

/** Days either side of the peak day that still count as at its peak. */
export const PEAK_WINDOW_DAYS = 3;

export type FreshnessReading = {
    state: Freshness;
    /** Whole calendar days since roasting. Negative for a roast day still ahead. */
    days: number;
    /** Local midnight of the day it is ready, the roast day plus the rest. */
    readyOn: Date;
    /** The peak day, in days since roasting. */
    peakDay: number;
    /** Local midnight of the peak day. */
    peakOn: Date;
};

type RoastedBag = Pick<CoffeeBag, "roastedOn"> & RoastAdvice;

/**
 * How fresh a bag is on the day of `now`, or null when it cannot be said:
 * no roast day, or no rest and peak to measure it against.
 *
 * Checked in this order, so the edges are plain: past best wins once the
 * best-until day is behind; before the rest ends it is resting (a roast day in
 * the future, which a typo makes, rests too); within `PEAK_WINDOW_DAYS` of the
 * peak day it is at its peak; otherwise it is ready.
 */
export function freshnessOf(bag: RoastedBag, now: number = Date.now()): FreshnessReading | null {
    const roasted = roastedOnDate(bag);
    const days = daysSinceRoast(bag, now);
    if (roasted === null || days === null) return null;
    const {restDays, peakDay, bestUntilDay} = bag;
    if (restDays === undefined || peakDay === undefined) return null;
    const readyOn = addDays(roasted, restDays);
    const peakOn = addDays(roasted, peakDay);
    let state: Freshness;
    if (bestUntilDay !== undefined && days > bestUntilDay) state = "past";
    else if (days < restDays) state = "resting";
    else if (Math.abs(days - peakDay) <= PEAK_WINDOW_DAYS) state = "peak";
    else state = "ready";
    return {state, days, readyOn, peakDay, peakOn};
}

/** Local calendar arithmetic: a daylight-saving change cannot shift the day. */
function addDays(day: Date, days: number): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `23 Oct`. Fixed words, so the line does not change with the phone's locale. */
export function shortDay(day: Date): string {
    return `${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

/** The BAG section's line. */
export function freshnessLine(reading: FreshnessReading): string {
    switch (reading.state) {
        case "resting": return `Resting, ready from ${shortDay(reading.readyOn)}.`;
        // Before the peak window, say when it starts; after it, just ready.
        case "ready": return reading.days < reading.peakDay
            ? `Ready to brew, peak around ${shortDay(reading.peakOn)}.`
            : "Ready to brew.";
        case "peak": return "At its peak.";
        case "past": return "Past its best, still fine to brew.";
    }
}

/** The card and tile badge. Doto. */
export function freshnessBadge(state: Freshness): string {
    switch (state) {
        case "resting": return "REST";
        case "ready": return "READY";
        case "peak": return "PEAK";
        case "past": return "PAST";
    }
}

/** The badge, said aloud as part of the card's label. */
export function spokenFreshness(state: Freshness): string {
    switch (state) {
        case "resting": return "coffee resting";
        case "ready": return "coffee ready to brew";
        case "peak": return "coffee at its peak";
        case "past": return "coffee past its best";
    }
}

/**
 * A coffee with roast advice laid over it, for a source that states some:
 * the roaster catalogue's `roast` block through `roastAdviceFromFeed`.
 * Only what the advice says is changed.
 */
export function withRoastAdvice<T extends object>(coffee: T, advice: RoastAdvice): T & RoastAdvice {
    return {...coffee, ...reviveRoastAdvice(advice)};
}
