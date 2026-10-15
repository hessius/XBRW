import BrewDatabase, {ensureBrewTables} from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

function database() {
    const raw = createTestDatabase();
    ensureBrewTables(raw as Parameters<typeof ensureBrewTables>[0]);
    const store = Object.create(BrewDatabase.prototype) as BrewDatabase;
    (store as unknown as {db: FakeSQLiteDatabase}).db = raw;
    return {raw, store};
}

const record: BrewRecord = {
    id: "brew-1",
    recipeUuid: "recipe-1",
    recipeName: "Trace fixture",
    accent: "#C86A3B",
    startedAt: 1_000_000,
    pouringAt: 1_045_000,
    drawdownAt: 0,
    endedAt: 1_240_000,
    outcome: "done",
    failure: null,
    pours: 2,
    waterTotal: 250,
    cupTotal: 244,
    heldSeconds: 14
};
const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 237, water: 16.44499969482422, cup: 3.140000104904175, pour: 1},
    {at: 1054, water: 40.1299991607666, cup: 16.44499969482422, pour: 2}
];
const frames = "0 TX 40518\n237 RX 40515\n1054 RX 40516";

describe("BrewDatabase trace storage", () => {
    it("stores sample streams compressed", () => {
        const {raw, store} = database();
        store.insert(record, samples, frames);
        expect(raw.getFirstSync(
            "SELECT stream FROM brew_samples WHERE brewId = ?;", [record.id]
        )).toEqual({stream: expect.stringMatching(/^z1:/)});
    });

    it("stores frame logs compressed", () => {
        const {raw, store} = database();
        store.insert(record, samples, frames);
        expect(raw.getFirstSync(
            "SELECT frames FROM brew_frames WHERE brewId = ?;", [record.id]
        )).toEqual({frames: expect.stringMatching(/^z1:/)});
    });

    it("round trips samples exactly and preserves frame text", () => {
        const {store} = database();
        store.insert(record, samples, frames);
        expect(store.samples(record.id)).toEqual(samples);
        expect(store.frames(record.id)).toBe(frames);
    });

    it("reads legacy raw JSON sample rows and raw frame text", () => {
        const {raw, store} = database();
        raw.runSync("INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);",
            [record.id, JSON.stringify(samples)]);
        raw.runSync("INSERT INTO brew_frames (brewId, frames) VALUES (?, ?);",
            [record.id, frames]);
        expect(store.samples(record.id)).toEqual(samples);
        expect(store.frames(record.id)).toBe(frames);
    });

    it.each(["z1:corrupt", "not JSON"])("returns no samples for corrupt storage %s", (stored) => {
        const {raw, store} = database();
        raw.runSync("INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);",
            [record.id, stored]);
        expect(store.samples(record.id)).toEqual([]);
    });

    it("returns empty text for a corrupt compressed frame log", () => {
        const {raw, store} = database();
        raw.runSync("INSERT INTO brew_frames (brewId, frames) VALUES (?, ?);",
            [record.id, "z1:corrupt"]);
        expect(store.frames(record.id)).toBe("");
    });

    it("returns no samples or frames when rows are absent", () => {
        const {store} = database();
        expect(store.samples("missing")).toEqual([]);
        expect(store.frames("missing")).toBe("");
    });

    it("does not store rows for empty samples or frames", () => {
        const {raw, store} = database();
        store.insert(record, []);
        expect(raw.getAllSync("SELECT * FROM brew_samples;")).toEqual([]);
        expect(raw.getAllSync("SELECT * FROM brew_frames;")).toEqual([]);
        expect(store.get(record.id)?.hasStream).toBe(false);
    });
});
