import {formatBrewClock} from "@/library/brew/brewFormat";
import type {BeverageKind, BrewRecord} from "@/library/brew/BrewRecord";
import type {GrindFigure} from "@/library/brew/dialAfterBrew";

/**
 * Tea's drain cycles are not yet established on hardware. Keep the recorded
 * observations, but do not present a coffee final-bed interval as a tea figure.
 */
export function brewFigureDetails<T extends {
    grind?: GrindFigure | null;
    drawdown?: number | null;
    drawdownRate?: number | null;
    delay?: number | null;
    reserveDrawdown?: boolean;
}>(beverageKind: BeverageKind | undefined, details: T) {
    return beverageKind === "tea"
        ? {...details, grind: null, drawdown: null, drawdownRate: null,
            delay: null, reserveDrawdown: false}
        : details;
}

export type BrewFigureAdjustments = {
    temperature?: {offset: number; temperatures: number[]};
};

export function brewFigureAdjustments(record: BrewRecord): BrewFigureAdjustments | undefined {
    const offset = record.adjustedTempOffset;
    const temperatures = record.plan?.map((stage) => stage.temperature) ?? [];
    return offset !== undefined && temperatures.length > 0
        ? {temperature: {offset, temperatures}} : undefined;
}

/**
 * How long it took and what landed in the cup, as one line.
 *
 * The figures a recipe cannot claim. A recipe name does not identify a brew
 * when the same recipe was made three times this week, so anywhere the app has
 * to say which cup it means, it says this and puts the name second.
 *
 * Timed from the first drop where one was recorded, falling back to the start
 * for a row written before `pouringAt` existed. That fallback is a display
 * convenience and nothing aggregates on it, which is why `TIMED_SQL` refuses
 * the same rows this function still draws.
 */
export function brewFigures(brew: {
    startedAt: number;
    pouringAt?: number | null;
    endedAt: number;
    cupTotal: number;
}): string {
    const from = brew.pouringAt !== undefined && brew.pouringAt !== null
        && brew.pouringAt > 0
        ? brew.pouringAt
        : brew.startedAt;
    return `${formatBrewClock((brew.endedAt - from) / 1000)} · ${Math.round(brew.cupTotal)} G`;
}
