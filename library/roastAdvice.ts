/**
 * Roast advice: the three day counts a roaster gives for a coffee, and the
 * one validator every door uses (a stored recipe, a restored bag, a BrewMind
 * link, the roaster catalogue).
 *
 * Its own module so `coffeeBag.ts`, `podCoffee.ts` and `restPeak.ts` can all
 * read it without importing each other. What the figures mean, and the
 * freshness built on them, is `restPeak.ts`.
 */

/** Roast advice. Every field optional: a source may say only some of it. */
export type RoastAdvice = {
    /** Days after roasting before it is ready to brew. */
    restDays?: number;
    /** The day after roasting it is at its best. */
    peakDay?: number;
    /** The last day after roasting it is at its best. */
    bestUntilDay?: number;
};

/** The roaster feed's range, so a figure the feed accepts is one the app keeps. */
export const ROAST_DAYS = {min: 0, max: 540} as const;

/**
 * A whole number of days in range, or undefined.
 *
 * A string of digits is accepted because a link only ever carries strings.
 * Anything else (a fraction, a sign, a unit) is refused rather than guessed.
 */
export function roastDays(value: unknown): number | undefined {
    const n = typeof value === "string"
        ? (/^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : NaN)
        : value;
    if (typeof n !== "number" || !Number.isInteger(n)) return undefined;
    return n >= ROAST_DAYS.min && n <= ROAST_DAYS.max ? n : undefined;
}

/** The advice fields of any record, each checked on its own. Extra keys are dropped. */
export function reviveRoastAdvice(record: Record<string, unknown>): RoastAdvice {
    const restDays = roastDays(record.restDays);
    const peakDay = roastDays(record.peakDay);
    const bestUntilDay = roastDays(record.bestUntilDay);
    return {
        ...(restDays !== undefined ? {restDays} : {}),
        ...(peakDay !== undefined ? {peakDay} : {}),
        ...(bestUntilDay !== undefined ? {bestUntilDay} : {})
    };
}
