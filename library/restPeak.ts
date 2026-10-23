import {daysSinceRoast, roastedOnDate, type CoffeeBag} from "@/library/coffeeBag";
import {
    ROAST_DAYS, reviveRoastAdvice, roastAdviceProblem, type RoastAdvice, type AdviceSource
} from "@/library/roastAdvice";

export {ROAST_DAYS, reviveRoastAdvice, roastDays, type RoastAdvice, type AdviceSource} from "@/library/roastAdvice";
export type RoastFigures = Required<RoastAdvice>;
export type RoastLevelKey = "nordic" | "light" | "medium" | "dark" | "decaf";
export const ROAST_LEVEL_DEFAULTS: Readonly<Record<RoastLevelKey, RoastFigures>> = {
    nordic: {restDays: 14, peakDay: 35, bestUntilDay: 52},
    light: {restDays: 11, peakDay: 28, bestUntilDay: 42},
    medium: {restDays: 7, peakDay: 18, bestUntilDay: 27},
    dark: {restDays: 4, peakDay: 10, bestUntilDay: 15},
    decaf: {restDays: 5, peakDay: 14, bestUntilDay: 21}
};
export const ROAST_LEVELS: readonly {key: RoastLevelKey; label: string; spoken: string}[] = [
    {key: "nordic", label: "NORDIC", spoken: "Nordic ultra-light"},
    {key: "light", label: "LIGHT", spoken: "Light"},
    {key: "medium", label: "MEDIUM", spoken: "Medium"},
    {key: "dark", label: "DARK", spoken: "Dark"},
    {key: "decaf", label: "DECAF", spoken: "Decaf"}
];
export const FALLBACK_LEVEL: RoastLevelKey = "medium";
export type AdvisedCoffee = RoastAdvice & {roast?: string; decaffeinated?: boolean};

export function roastLevelKey(level?: string, decaffeinated?: boolean): RoastLevelKey | undefined {
    const words = (level ?? "").toLowerCase();
    if (decaffeinated || words.includes("decaf")) return "decaf";
    if (words.includes("nordic") || words.includes("ultra")) return "nordic";
    if (words.includes("dark")) return "dark";
    if (words.includes("medium")) return "medium";
    if (words.includes("light")) return "light";
    return undefined;
}

export function startingFigures(coffee: AdvisedCoffee | undefined): {
    figures: RoastFigures; level?: RoastLevelKey; source: AdviceSource;
} {
    const level = roastLevelKey(coffee?.roast, coffee?.decaffeinated);
    const base = ROAST_LEVEL_DEFAULTS[level ?? FALLBACK_LEVEL];
    const restDays = coffee?.restDays ?? base.restDays;
    const peakDay = coffee?.peakDay ?? base.peakDay;
    const bestUntilDay = coffee?.bestUntilDay
        ?? figuresFrom(restDays, peakDay, level ?? FALLBACK_LEVEL).bestUntilDay;
    const source = coffee?.restDays !== undefined && coffee.peakDay !== undefined
        && coffee.bestUntilDay !== undefined ? "coffee" : "estimate";
    return {figures: {restDays, peakDay, bestUntilDay}, ...(level ? {level} : {}), source};
}

export function figuresFrom(
    restDays: number, peakDay: number, level: RoastLevelKey | RoastFigures
): RoastFigures {
    const base = typeof level === "string" ? ROAST_LEVEL_DEFAULTS[level] : level;
    return {restDays, peakDay, bestUntilDay: Math.max(ROAST_DAYS.min,
        Math.min(ROAST_DAYS.max, peakDay + base.bestUntilDay - base.peakDay))};
}

export function figuresProblem(restDays: number | undefined, peakDay: number | undefined): string | null {
    if (restDays === undefined || peakDay === undefined) return "Enter whole days, 0 to 540.";
    if (peakDay < restDays) return "The peak day is on or after the rest ends.";
    return roastAdviceProblem({restDays, peakDay});
}

export function roastAdviceFromFeed(value: unknown): RoastAdvice {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    const row = value as Record<string, unknown>;
    return reviveRoastAdvice({
        restDays: row.rest_days, peakDay: row.peak_day, bestUntilDay: row.best_until_day
    });
}

export type Freshness = "resting" | "ready" | "peak" | "past";
export const PEAK_WINDOW_DAYS = 3;
export type FreshnessReading = {
    state: Freshness; days: number; readyOn: Date; peakDay: number; peakOn: Date;
};
type RoastedBag = Pick<CoffeeBag, "roastedOn"> & RoastAdvice;

export function freshnessProblem(bag: RoastedBag, now: number): string | null {
    if (bag.roastedOn !== undefined && roastedOnDate(bag) === null) return "Check the roast date.";
    const days = daysSinceRoast(bag, now);
    if (days !== null && days < 0) return "The roast date is in the future. Check the bag.";
    return roastAdviceProblem(bag);
}

export function freshnessOf(bag: RoastedBag, now = Date.now()): FreshnessReading | null {
    const roasted = roastedOnDate(bag);
    const days = daysSinceRoast(bag, now);
    if (roasted === null || days === null || !Number.isFinite(days)
        || freshnessProblem(bag, now) !== null) return null;
    const {restDays, peakDay, bestUntilDay} = bag;
    if (restDays === undefined || peakDay === undefined) return null;
    const add = (n: number) => new Date(roasted.getFullYear(), roasted.getMonth(), roasted.getDate() + n);
    const state: Freshness = bestUntilDay !== undefined && days > bestUntilDay ? "past"
        : days < restDays ? "resting"
            : Math.abs(days - peakDay) <= PEAK_WINDOW_DAYS ? "peak" : "ready";
    return {state, days, readyOn: add(restDays), peakDay, peakOn: add(peakDay)};
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDay(day: Date): string { return `${day.getDate()} ${MONTHS[day.getMonth()]}`; }

export function freshnessLine(reading: FreshnessReading): string {
    switch (reading.state) {
        case "resting": return `Resting, estimated ready from ${shortDay(reading.readyOn)}.`;
        case "ready": return reading.days < reading.peakDay
            ? `Estimated peak around ${shortDay(reading.peakOn)}.` : "Within the estimated window.";
        case "peak": return "Within the estimated peak window.";
        case "past": return "Outside the estimated window.";
    }
}

export function freshnessBadge(state: Freshness): string {
    return {resting: "REST", ready: "READY", peak: "PEAK", past: "PAST"}[state];
}

export function spokenFreshness(state: Freshness): string {
    return {resting: "coffee resting", ready: "estimated ready window",
        peak: "estimated peak window", past: "outside the estimated window"}[state];
}

export function withRoastAdvice<T extends object>(coffee: T, advice: RoastAdvice): T & RoastAdvice {
    return {...coffee, ...reviveRoastAdvice(advice)};
}
