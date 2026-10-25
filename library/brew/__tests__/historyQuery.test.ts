import type {BrewRecord} from "@/library/brew/BrewRecord";
import BrewDatabase from "@/library/BrewDatabase";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {
    asHistorySort, asHistorySortDirection, HISTORY_SORTS,
    isHistorySort, isHistorySortDirection, queryBrewHistory,
    type HistoryQuery, type HistorySort
} from "@/library/brew/historyQuery";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

const query: HistoryQuery = {
    sort: "date", direction: "desc", hideUnsuccessful: false, ratedOnly: false
};

function brew(id: string, fields: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id, recipeUuid: "recipe", recipeName: id, accent: "", startedAt: 1, endedAt: 2,
        outcome: "done", failure: null, pours: 1, waterTotal: 100,
        cupTotal: 100, heldSeconds: 0, ...fields
    };
}

const ids = (rows: readonly BrewRecord[], overrides: Partial<HistoryQuery> = {}) =>
    queryBrewHistory(rows, {...query, ...overrides}).map((row) => row.id);

describe("history vocabulary", () => {
    it("guards every supported axis and direction, defaulting stale preferences", () => {
        expect(HISTORY_SORTS).toEqual(["date", "rating", "dose", "ratio", "grind"]);
        for (const sort of HISTORY_SORTS) {
            expect(isHistorySort(sort)).toBe(true);
            expect(asHistorySort(sort)).toBe(sort);
        }
        for (const bad of ["name", "", null, 3, {}, undefined]) {
            expect(isHistorySort(bad)).toBe(false);
            expect(asHistorySort(bad)).toBe("date");
            expect(isHistorySortDirection(bad)).toBe(false);
            expect(asHistorySortDirection(bad)).toBe("desc");
        }
        expect(isHistorySortDirection("asc")).toBe(true);
        expect(isHistorySortDirection("desc")).toBe(true);
    });
});

describe("queryBrewHistory", () => {
    const axes: [HistorySort, Partial<BrewRecord>, Partial<BrewRecord>][] = [
        ["date", {startedAt: 10}, {startedAt: 20}],
        ["rating", {rating: 2}, {rating: 5}],
        ["dose", {dose: 12}, {dose: 20}],
        ["ratio", {ratio: 12}, {ratio: 18}],
        ["grind", {grindSize: 40, grinderUsed: true}, {grindSize: 80, grinderUsed: true}]
    ];
    it.each(axes)("orders %s both ways from stored values without changing input", (sort, low, high) => {
        const rows = Object.freeze([
            Object.freeze(brew("high", high)), Object.freeze(brew("low", low))
        ]);
        expect(ids(rows, {sort, direction: "asc"})).toEqual(["low", "high"]);
        expect(ids(rows, {sort, direction: "desc"})).toEqual(["high", "low"]);
        expect(rows.map((row) => row.id)).toEqual(["high", "low"]);
        expect(queryBrewHistory(rows, {...query, sort})[0]).toBe(rows[0]);
    });

    it.each(["rating", "dose", "ratio", "grind"] as const)(
        "holds missing, zero and nonfinite %s values last in either direction", (sort) => {
            const key = {rating: "rating", dose: "dose", ratio: "ratio", grind: "grindSize"}[sort];
            const rows = [
                brew("old", {startedAt: 9}),
                brew("zero", {[key]: 0, startedAt: 8, grinderUsed: true}),
                brew("nan", {[key]: NaN, startedAt: 7, grinderUsed: true}),
                brew("inf", {[key]: Infinity, startedAt: 6, grinderUsed: true}),
                brew("negative", {[key]: -1, startedAt: 5, grinderUsed: true}),
                brew("low", {[key]: sort === "grind" ? 40 : 2, grinderUsed: true}),
                brew("high", {[key]: sort === "grind" ? 60 : 4, grinderUsed: true})
            ];
            expect(ids(rows, {sort, direction: "asc"}))
                .toEqual(["low", "high", "old", "zero", "nan", "inf", "negative"]);
            expect(ids(rows, {sort, direction: "desc"}))
                .toEqual(["high", "low", "old", "zero", "nan", "inf", "negative"]);
        }
    );

    it("requires explicit grinder use and the valid grind band, not a stale dial", () => {
        const rows = [
            brew("off", {grindSize: 81, grinderUsed: true, startedAt: 9}),
            brew("disabled", {grindSize: 50, grinderUsed: false, startedAt: 8}),
            brew("unknown", {grindSize: 50, startedAt: 7}),
            brew("fine", {grindSize: 39, grinderUsed: true, startedAt: 6}),
            brew("tooCoarse", {grindSize: 82, grinderUsed: true, startedAt: 5}),
            brew("ground", {grindSize: 60, grinderUsed: true})
        ];
        expect(ids(rows, {sort: "grind", direction: "asc"}))
            .toEqual(["fine", "ground", "off", "disabled", "unknown", "tooCoarse"]);
        expect(ids(rows, {sort: "grind", direction: "desc"}))
            .toEqual(["ground", "fine", "off", "disabled", "unknown", "tooCoarse"]);
    });

    it("uses newest then id as the tie break on every axis in both directions", () => {
        const rows = [
            brew("b", {startedAt: 20, rating: 4, dose: 15, ratio: 16, grindSize: 50, grinderUsed: true}),
            brew("a", {startedAt: 20, rating: 4, dose: 15, ratio: 16, grindSize: 50, grinderUsed: true}),
            brew("old", {startedAt: 10, rating: 4, dose: 15, ratio: 16, grindSize: 50, grinderUsed: true})
        ];
        for (const sort of HISTORY_SORTS) {
            expect(ids(rows, {sort, direction: "desc"})).toEqual(["a", "b", "old"]);
            expect(ids(rows, {sort, direction: "asc"}))
                .toEqual(sort === "date" ? ["old", "a", "b"] : ["a", "b", "old"]);
        }
    });

    it("keeps malformed dates last and resolves their ties by identity", () => {
        const rows = [brew("b", {startedAt: NaN}), brew("a", {startedAt: Infinity}), brew("valid")];
        expect(ids(rows)).toEqual(["valid", "a", "b"]);
        expect(ids(rows, {direction: "asc"})).toEqual(["valid", "a", "b"]);
    });

    it.each(["date", "rating", "dose", "ratio", "grind"] as const)(
        "never coerces malformed %s values into observations", (sort) => {
            const key = {
                date: "startedAt", rating: "rating", dose: "dose", ratio: "ratio", grind: "grindSize"
            }[sort];
            for (const value of [null, "50", false, {}]) {
                const invalid: BrewRecord = JSON.parse(JSON.stringify({
                    ...brew("invalid", {startedAt: 5, grinderUsed: true}), [key]: value
                }));
                const valid = brew("valid", {
                    rating: 2, dose: 12, ratio: 16, grindSize: 60, grinderUsed: true
                });
                for (const direction of ["asc", "desc"] as const) {
                    expect(ids([invalid, valid], {sort, direction})).toEqual(["valid", "invalid"]);
                }
            }
        }
    );

    it("queries real stored snapshots after traces expire, leaving older missing values absent", () => {
        mockBacking = createTestDatabase();
        const database = new BrewDatabase();
        const snapshot = brew("saved", {
            dose: 15, ratio: 16, grindSize: 50, grinderUsed: true, rating: 4
        });
        database.insert(snapshot, [{at: 0, water: 100, cup: 95, pour: 1}]);
        database.insert(brew("old", {startedAt: 5}), []);
        database.insert(brew("off", {startedAt: 4, grindSize: 60, grinderUsed: false}), []);
        database.sweepBytes(1);
        const rows = database.all();
        const saved = rows.find((row) => row.id === "saved");
        const old = rows.find((row) => row.id === "old");
        expect(saved).toMatchObject({
            dose: 15, ratio: 16, grindSize: 50, grinderUsed: true, hasStream: false
        });
        expect(old).not.toHaveProperty("dose");
        expect(old).not.toHaveProperty("ratio");
        expect(old).not.toHaveProperty("grindSize");
        expect(old).not.toHaveProperty("grinderUsed");
        for (const sort of ["rating", "dose", "ratio", "grind"] as const) {
            for (const direction of ["asc", "desc"] as const) {
                expect(ids(rows, {sort, direction})).toEqual(["saved", "old", "off"]);
            }
        }
    });

    it("composes independent cup and rated-cup predicates with recipe scope", () => {
        const rows = [
            brew("done", {rating: 4}),
            brew("machine", {outcome: "endedOnMachine"}),
            brew("hand", {watched: false, rating: 3}),
            brew("failed", {outcome: "failed", rating: 5}),
            brew("cancelled", {outcome: "cancelled"}),
            brew("lost", {outcome: "lostContact"}),
            brew("invalidRating", {rating: Infinity}),
            brew("other", {recipeUuid: "other", rating: 5})
        ];
        expect(ids(rows)).toHaveLength(8);
        expect(ids(rows, {hideUnsuccessful: true}))
            .toEqual(["done", "hand", "invalidRating", "machine", "other"]);
        expect(ids(rows, {ratedOnly: true})).toEqual(["done", "hand", "other"]);
        expect(ids(rows, {hideUnsuccessful: true, ratedOnly: true, recipeUuid: "recipe"}))
            .toEqual(["done", "hand"]);
        expect(ids(rows, {recipeUuid: "other"})).toEqual(["other"]);
        expect(ids(rows, {recipeUuid: "missing"})).toEqual([]);
        expect(ids(rows, {sort: "rating"}))
            .toEqual(["other", "done", "hand", "cancelled", "failed", "invalidRating", "lost", "machine"]);
    });
});
