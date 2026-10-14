import {grinderRan, type BrewRecord} from "./BrewRecord";
import {countsAsBrewed, isRated} from "./brewPopulation";

export const HISTORY_SORTS = ["date", "rating", "dose", "ratio", "grind"] as const;
export type HistorySort = typeof HISTORY_SORTS[number];
export type HistorySortDirection = "asc" | "desc";
export type HistoryQuery = {
    sort: HistorySort;
    direction: HistorySortDirection;
    hideUnsuccessful: boolean;
    ratedOnly: boolean;
    recipeUuid?: string;
};

export function isHistorySort(value: unknown): value is HistorySort {
    return HISTORY_SORTS.some((sort) => sort === value);
}

export function isHistorySortDirection(value: unknown): value is HistorySortDirection {
    return value === "asc" || value === "desc";
}

export function asHistorySort(value: unknown): HistorySort {
    return isHistorySort(value) ? value : "date";
}

export function asHistorySortDirection(value: unknown): HistorySortDirection {
    return isHistorySortDirection(value) ? value : "desc";
}

function finite(value: number | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sortValue(record: BrewRecord, sort: HistorySort): number | undefined {
    if (sort === "date") return finite(record.startedAt);
    const value = sort === "grind"
        ? (grinderRan(record) ? record.grindSize : undefined)
        : sort === "rating"
            ? (isRated(record) ? record.rating : undefined)
            : record[sort];
    const observed = finite(value);
    return observed !== undefined && observed > 0 ? observed : undefined;
}

/** Missing observations stay last in either direction. */
function compareValues(
    one: number | undefined, two: number | undefined, direction: HistorySortDirection
): number {
    if (one === undefined) return two === undefined ? 0 : 1;
    if (two === undefined) return -1;
    return direction === "asc" ? one - two : two - one;
}

/** Query brew-time snapshots only; neither current recipes nor retained streams participate. */
export function queryBrewHistory<T extends BrewRecord>(
    records: readonly T[], query: HistoryQuery
): T[] {
    const {sort, direction, hideUnsuccessful, ratedOnly, recipeUuid} = query;
    return records.filter((record) =>
        (recipeUuid === undefined || record.recipeUuid === recipeUuid)
        && (!hideUnsuccessful || countsAsBrewed(record))
        && (!ratedOnly || (isRated(record) && finite(record.rating) !== undefined))
    ).sort((one, two) =>
        compareValues(sortValue(one, sort), sortValue(two, sort), direction)
        || compareValues(finite(one.startedAt), finite(two.startedAt), "desc")
        || (one.id < two.id ? -1 : one.id > two.id ? 1 : 0)
    );
}
