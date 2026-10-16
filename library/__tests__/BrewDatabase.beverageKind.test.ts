import {openDatabaseSync} from "expo-sqlite";
import BrewDatabase, {ensureBrewTables} from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import {queryBrewHistory} from "@/library/brew/historyQuery";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

beforeEach(() => {
    mockBacking = createTestDatabase();
});

function record(extra: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1", recipeUuid: "r1", recipeName: "Morning", accent: "#ff8800",
        startedAt: 1000, pouringAt: 1100, endedAt: 2100, outcome: "done",
        failure: null, pours: 2, waterTotal: 180, cupTotal: 170, heldSeconds: 0,
        ...extra
    };
}

function expectSchema(): void {
    expect(mockBacking.getAllSync("PRAGMA table_info(brews);")).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                name: "beverageKind", type: "TEXT", notnull: 1, dflt_value: "''"
            }),
            expect.objectContaining({
                name: "teaCycles", type: "TEXT", notnull: 1, dflt_value: "''"
            })
        ])
    );
}

describe("persistent beverage kind", () => {
    it("creates the defaulted column idempotently in real SQLite", () => {
        const db = openDatabaseSync(":memory:");
        ensureBrewTables(db);
        expectSchema();
        ensureBrewTables(db);
        expectSchema();
    });

    it("upgrades a pre-column table without changing an existing row's shape", () => {
        mockBacking.execSync(`
            CREATE TABLE brews (
                id TEXT PRIMARY KEY NOT NULL, recipeUuid TEXT NOT NULL,
                recipeName TEXT NOT NULL, accent TEXT NOT NULL,
                startedAt INTEGER NOT NULL, endedAt INTEGER NOT NULL,
                outcome TEXT NOT NULL, failure TEXT, pours INTEGER NOT NULL,
                waterTotal REAL NOT NULL, cupTotal REAL NOT NULL,
                heldSeconds INTEGER NOT NULL, hasStream INTEGER NOT NULL
            );
            INSERT INTO brews VALUES (
                'old', 'r1', 'Morning', '#ff8800', 1000, 2100,
                'done', NULL, 2, 180, 170, 0, 0
            );`);
        const db = openDatabaseSync(":memory:");
        ensureBrewTables(db);
        ensureBrewTables(db);
        expectSchema();
        expect(mockBacking.getFirstSync("SELECT beverageKind FROM brews WHERE id = 'old';"))
            .toEqual({beverageKind: ""});
        const database = new BrewDatabase();
        const before = database.get("old");
        expect(before).not.toHaveProperty("beverageKind");
        expect(before).not.toHaveProperty("teaCycles");
        database.insert(record({beverageKind: "tea"}), []);
        expect(database.get("b1")).toHaveProperty("beverageKind", "tea");
        expect(database.get("old")).toEqual(before);
    });

    it("retains compact tea observations after the sample stream is swept", () => {
        const database = new BrewDatabase();
        const teaCycles = [{
            index: 0, fillStartedAt: -500, fillEndedAt: 20_000,
            steepStartedAt: 20_500, steepEndedAt: 65_000, endingEndedAt: 90_000,
            fillMl: 90, releaseWaterMl: 40
        }];
        database.insert(
            record({beverageKind: "tea", teaCycles}),
            [{at: 0, water: 0, cup: 0, pour: 1}]
        );
        expect(database.get("b1")).toMatchObject({teaCycles, hasStream: true});
        database.sweep(0);
        expect(database.get("b1")).toMatchObject({teaCycles, hasStream: false});
    });

    it("keeps legacy rows without tea-cycle observations", () => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        expect(database.get("b1")).not.toHaveProperty("teaCycles");
        expect(mockBacking.getFirstSync("SELECT teaCycles FROM brews WHERE id = 'b1';"))
            .toEqual({teaCycles: ""});
    });

    it.each(["tea", "coffee"] as const)("preserves %s through inserts and history queries", (beverageKind) => {
        const database = new BrewDatabase();
        database.insert(record({beverageKind}), [{at: 0, water: 90, cup: 80, pour: 1}]);
        expect(mockBacking.getFirstSync("SELECT beverageKind FROM brews WHERE id = 'b1';"))
            .toEqual({beverageKind});
        expect(database.get("b1")).toHaveProperty("beverageKind", beverageKind);
        expect(database.all()[0]).toHaveProperty("beverageKind", beverageKind);
        expect(database.brewsFor("r1")[0]).toHaveProperty("beverageKind", beverageKind);
        expect(queryBrewHistory(database.all(), {
            sort: "date", direction: "desc", hideUnsuccessful: true, ratedOnly: false,
            recipeUuid: "r1"
        })[0]).toHaveProperty("beverageKind", beverageKind);
        expect(database.lastMeasuredBrew()).toHaveProperty("beverageKind", beverageKind);
    });

    it("keeps legacy inserted and restored rows without a beverage key", () => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        database.restore([record({id: "restored"})]);
        for (const brew of database.all()) {
            expect(brew).not.toHaveProperty("beverageKind");
            expect(JSON.parse(JSON.stringify(brew))).not.toHaveProperty("beverageKind");
        }
        expect(mockBacking.getFirstSync("SELECT beverageKind FROM brews WHERE id = 'b1';"))
            .toEqual({beverageKind: ""});
    });

    it.each(["tea", "coffee"] as const)("restores %s without overwriting existing identity or verdict", (beverageKind) => {
        const database = new BrewDatabase();
        expect(database.restore([record({beverageKind})])).toBe(1);
        expect(database.get("b1")).toMatchObject({beverageKind, hasStream: false});
        database.judge("b1", {rating: 5, note: "Keep"});
        expect(database.restore([record({beverageKind: beverageKind === "tea" ? "coffee" : "tea"})]))
            .toBe(0);
        expect(database.get("b1")).toMatchObject({beverageKind, rating: 5, note: "Keep"});
    });

    it.each(["", "Tea", "water", "coffee "])("omits an unrecognized stored kind (%p)", (value) => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        mockBacking.runSync("UPDATE brews SET beverageKind = ? WHERE id = ?;", [value, "b1"]);
        expect(database.get("b1")).not.toHaveProperty("beverageKind");
    });
});
