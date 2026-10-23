export type RoastAdvice = {
    restDays?: number;
    peakDay?: number;
    bestUntilDay?: number;
};

export type AdviceSource = "coffee" | "estimate" | "user";

export const ROAST_DAYS = {min: 0, max: 540} as const;

export function roastDays(value: unknown): number | undefined {
    const n = typeof value === "string"
        ? (/^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : NaN)
        : value;
    return typeof n === "number" && Number.isInteger(n)
        && n >= ROAST_DAYS.min && n <= ROAST_DAYS.max ? n : undefined;
}

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

export function roastAdviceProblem(advice: RoastAdvice): string | null {
    const ordered = [advice.restDays, advice.peakDay, advice.bestUntilDay]
        .filter((value): value is number => value !== undefined);
    if (ordered.some(value => roastDays(value) === undefined)) {
        return "Enter whole days, 0 to 540.";
    }
    if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) {
        return "The estimated peak follows the rest, and the window ends after it.";
    }
    return null;
}
