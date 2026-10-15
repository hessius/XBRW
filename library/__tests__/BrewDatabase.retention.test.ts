import BrewDatabase, {ensureBrewTables} from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {encodeSamples, encodeText} from "@/library/brew/traceCodec";
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

const sampleBytes = encodeSamples(samples).length;
const frameBytes = encodeText(frames).length;
const traceBytes = sampleBytes + frameBytes;

function storedBytes(raw: FakeSQLiteDatabase): number {
    return (raw.getFirstSync(`
        SELECT (SELECT COALESCE(SUM(length(stream)), 0) FROM brew_samples)
             + (SELECT COALESCE(SUM(length(frames)), 0) FROM brew_frames) AS bytes;
    `) as {bytes: number}).bytes;
}

function seedTrace(store: BrewDatabase, id: string, extra: Partial<BrewRecord> = {}) {
    store.insert({...record, id, ...extra}, samples, frames);
}

describe("BrewDatabase budgeted trace sweep", () => {
    it.each([false, true])("indexes recipe recency on an existing database: %p", (existing) => {
        const {raw, store} = database();
        if (existing) {
            seedTrace(store, "existing");
            raw.execSync("DROP INDEX idx_brews_recipe_started;");
            ensureBrewTables(raw as Parameters<typeof ensureBrewTables>[0]);
            expect(store.get("existing")?.hasStream).toBe(true);
        }

        expect(raw.getFirstSync(`
            SELECT sql FROM sqlite_master
            WHERE type = 'index' AND name = 'idx_brews_recipe_started' AND tbl_name = 'brews';
        `)).toEqual({sql: "CREATE INDEX idx_brews_recipe_started ON brews(recipeUuid, startedAt)"});
    });

    it("uses the recency index to evict among 5,000 summaries within one second", () => {
        const {raw, store} = database();
        for (let i = 0; i < 5000; i += 1) {
            const brew = {...record, id: `brew-${i}`, startedAt: i + 1};
            store.insert(brew, i < 300 ? samples : [], i < 300 ? frames : undefined);
        }
        const queries = jest.spyOn(raw, "getAllSync");
        const start = performance.now();

        store.sweepBytes(traceBytes * 299);

        expect(performance.now() - start).toBeLessThan(1000);
        expect(storedBytes(raw)).toBe(traceBytes * 299);
        expect(store.get("brew-0")?.hasStream).toBe(false);
        expect(raw.getFirstSync("SELECT COUNT(*) AS count FROM brews;"))
            .toEqual({count: 5000});
        const sweepQuery = queries.mock.calls.find(([sql]) => sql.includes("AS tier"))?.[0];
        expect(sweepQuery).toBeDefined();
        expect(raw.getAllSync(`EXPLAIN QUERY PLAN ${sweepQuery}`)).toEqual(expect.arrayContaining([
            expect.objectContaining({
                detail: expect.stringMatching(/SEARCH n USING COVERING INDEX idx_brews_recipe_started .*recipeUuid=\? AND startedAt>\?/)
            })
        ]));
    });

    it("keeps everything under budget and at the exact byte boundary", () => {
        const {raw, store} = database();
        seedTrace(store, "one");
        seedTrace(store, "two");
        store.sweepBytes(traceBytes * 2 + 1);
        store.sweepBytes(traceBytes * 2);
        expect(storedBytes(raw)).toBe(traceBytes * 2);
        expect(store.all().every((brew) => brew.hasStream)).toBe(true);
    });

    it("counts frames as well as samples and stops as soon as the total fits", () => {
        const {raw, store} = database();
        seedTrace(store, "old", {startedAt: 1});
        seedTrace(store, "middle", {startedAt: 2});
        seedTrace(store, "new", {startedAt: 3});
        store.sweepBytes(traceBytes * 3 - 1);
        expect(storedBytes(raw)).toBe(traceBytes * 2);
        expect(store.get("old")?.hasStream).toBe(false);
        expect(store.samples("old")).toEqual([]);
        expect(store.frames("old")).toBe("");
        expect(raw.getAllSync("SELECT brewId FROM brew_samples ORDER BY brewId;")).toEqual([
            {brewId: "middle"}, {brewId: "new"}
        ]);
        expect(raw.getAllSync("SELECT brewId FROM brew_frames ORDER BY brewId;")).toEqual([
            {brewId: "middle"}, {brewId: "new"}
        ]);
        expect(store.samples("middle")).toEqual(samples);
        expect(store.samples("new")).toEqual(samples);
        expect(store.all()).toHaveLength(3);
    });

    it("drops tier 3, then tier 2, then rated or noted traces, oldest first in each", () => {
        const {raw, store} = database();
        seedTrace(store, "rated", {startedAt: 1, rating: 5});
        seedTrace(store, "noted", {startedAt: 2, note: "Worth repeating"});
        seedTrace(store, "old-pinned", {startedAt: 3, pinned: true, note: "   "});
        seedTrace(store, "old", {startedAt: 4});
        seedTrace(store, "recent", {startedAt: 5});
        seedTrace(store, "newest", {startedAt: 6});
        const before = store.all();
        const order = ["old-pinned", "old", "recent", "newest", "rated", "noted"];
        order.forEach((id, index) => {
            const remaining = order.length - index - 1;
            store.sweepBytes(remaining === 0 ? 1 : traceBytes * remaining);
            expect(store.get(id)?.hasStream).toBe(false);
            expect(store.all().filter((brew) => brew.hasStream).map((brew) => brew.id).sort())
                .toEqual(order.slice(index + 1).sort());
            expect(storedBytes(raw)).toBe(traceBytes * remaining);
        });
        expect(store.all()).toEqual(before.map((brew) => ({...brew, hasStream: false})));
    });

    it("protects a single-brew recipe ahead of the old traces of a 20-brew recipe", () => {
        const {store} = database();
        // Identical names must not collapse distinct recipe UUIDs into one tier.
        seedTrace(store, "single", {recipeUuid: "single", startedAt: 1});
        for (let i = 1; i <= 20; i += 1) {
            seedTrace(store, `many-${i}`, {recipeUuid: "many", startedAt: i + 1});
        }
        store.sweepBytes(traceBytes * 3);
        expect(store.all().filter((brew) => brew.hasStream).map((brew) => brew.id))
            .toEqual(["many-20", "many-19", "single"]);
        expect(store.all()).toHaveLength(21);
    });

    it("ranks recipe recency by summaries even when the newer traces are gone", () => {
        const {store} = database();
        seedTrace(store, "single", {recipeUuid: "single", startedAt: 1});
        seedTrace(store, "old", {recipeUuid: "many", startedAt: 2});
        store.insert({...record, id: "summary-1", recipeUuid: "many", startedAt: 3}, []);
        store.insert({...record, id: "summary-2", recipeUuid: "many", startedAt: 4}, []);
        store.sweepBytes(traceBytes);
        expect(store.get("single")?.hasStream).toBe(true);
        expect(store.get("old")?.hasStream).toBe(false);
        expect(store.all()).toHaveLength(4);
    });

    it("converts MB to bytes for the public sweep", () => {
        const {store} = database();
        seedTrace(store, "old", {startedAt: 1});
        seedTrace(store, "new", {startedAt: 2});
        store.sweep(traceBytes / (1024 * 1024));
        expect(store.get("old")?.hasStream).toBe(false);
        expect(store.get("new")?.hasStream).toBe(true);
    });

    it("treats zero as Unlimited, including in the byte helper", () => {
        const {raw, store} = database();
        seedTrace(store, "one");
        store.sweep(0);
        store.sweepBytes(0);
        expect(store.get("one")?.hasStream).toBe(true);
        expect(storedBytes(raw)).toBe(traceBytes);
    });

    it.each([Number.NaN, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        "does not delete traces for an invalid budget %p", (budget) => {
            const {raw, store} = database();
            seedTrace(store, "one");
            store.sweep(budget);
            store.sweepBytes(budget);
            expect(store.get("one")?.hasStream).toBe(true);
            expect(storedBytes(raw)).toBe(traceBytes);
        }
    );

    it("compresses legacy samples and frames before measuring the budget", () => {
        const {raw, store} = database();
        const legacySamples = Array.from({length: 1000}, (_, i) => ({
            at: i * 237, water: i * 0.123456789, cup: i * 0.0987654321, pour: 1
        }));
        const legacyFrames = Array.from({length: 256}, (_, i) => `${i} RX 40515`).join("\n");
        seedTrace(store, "legacy");
        raw.runSync("UPDATE brew_samples SET stream = ? WHERE brewId = ?;",
            [JSON.stringify(legacySamples), "legacy"]);
        raw.runSync("UPDATE brew_frames SET frames = ? WHERE brewId = ?;",
            [legacyFrames, "legacy"]);
        const budget = encodeSamples(legacySamples).length + encodeText(legacyFrames).length;
        expect(storedBytes(raw)).toBeGreaterThan(budget);
        store.sweepBytes(budget);
        expect(storedBytes(raw)).toBe(budget);
        expect(store.get("legacy")?.hasStream).toBe(true);
        expect(store.samples("legacy")).toEqual(legacySamples);
        expect(store.frames("legacy")).toBe(legacyFrames);
        expect(raw.getFirstSync("SELECT stream FROM brew_samples WHERE brewId = 'legacy';"))
            .toEqual({stream: expect.stringMatching(/^z1:/)});
        expect(raw.getFirstSync("SELECT frames FROM brew_frames WHERE brewId = 'legacy';"))
            .toEqual({frames: expect.stringMatching(/^z1:/)});
    });

    it("compresses more than two batches of each legacy table even with Unlimited", () => {
        const {raw, store} = database();
        seedTrace(store, "compressed");
        for (let i = 0; i < 101; i += 1) {
            const id = `legacy-${i}`;
            seedTrace(store, id);
            raw.runSync("UPDATE brew_samples SET stream = ? WHERE brewId = ?;",
                [JSON.stringify(samples), id]);
            raw.runSync("UPDATE brew_frames SET frames = ? WHERE brewId = ?;", [frames, id]);
        }
        const transactions = jest.spyOn(raw, "withTransactionSync");
        store.sweep(0);
        expect(transactions.mock.calls.length).toBeGreaterThanOrEqual(6);
        expect(raw.getAllSync("SELECT brewId FROM brew_samples WHERE stream NOT LIKE 'z1:%';"))
            .toEqual([]);
        expect(raw.getAllSync("SELECT brewId FROM brew_frames WHERE frames NOT LIKE 'z1:%';"))
            .toEqual([]);
        expect(store.samples("legacy-100")).toEqual(samples);
        expect(store.frames("legacy-100")).toBe(frames);
        expect(store.samples("compressed")).toEqual(samples);
        expect(store.all().filter((brew) => brew.hasStream)).toHaveLength(102);
        const writes = jest.spyOn(raw, "runSync");
        store.sweep(0);
        expect(writes).not.toHaveBeenCalled();
    });

    describe.each([0, 1])("corrupt legacy samples with budget %p MiB", (budgetMB) => {
        it.each([
            "[null]",
            "not JSON",
            '[{"at":0,"water":0,"cup":0}]',
            '[{"at":0,"water":"0","cup":0,"pour":1}]',
            '[{"at":1e999,"water":0,"cup":0,"pour":1}]'
        ])("leaves unreadable samples untouched: %s", (stream) => {
            const {raw, store} = database();
            seedTrace(store, "corrupt", {rating: 5});
            raw.runSync("UPDATE brew_samples SET stream = ? WHERE brewId = 'corrupt';", [stream]);
            // Cross two pages with skipped rows before the valid legacy row.
            for (let i = 0; i < 101; i += 1) {
                raw.runSync("INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);",
                    [`bad-${i}`, stream]);
            }
            seedTrace(store, "valid", {startedAt: 2});
            raw.runSync("UPDATE brew_samples SET stream = ? WHERE brewId = 'valid';",
                [JSON.stringify(samples)]);
            if (budgetMB > 0) {
                seedTrace(store, "victim", {startedAt: 1});
                raw.runSync("UPDATE brew_frames SET frames = ? WHERE brewId = 'victim';",
                    [encodeText("large frame log") + "x".repeat(1024 * 1024)]);
                expect(storedBytes(raw)).toBeGreaterThan(budgetMB * 1024 * 1024);
            }

            expect(() => store.sweep(budgetMB)).not.toThrow();

            expect(raw.getFirstSync("SELECT stream FROM brew_samples WHERE brewId = 'corrupt';"))
                .toEqual({stream});
            expect(raw.getFirstSync("SELECT stream FROM brew_samples WHERE brewId = 'valid';"))
                .toEqual({stream: encodeSamples(samples)});
            if (budgetMB > 0) {
                expect(store.get("victim")?.hasStream).toBe(false);
                expect(storedBytes(raw)).toBeLessThanOrEqual(budgetMB * 1024 * 1024);
            }
        });
    });

    it("continues past a failed legacy frame conversion without retrying it forever", () => {
        const {raw, store} = database();
        for (const id of ["bad", "good"]) {
            seedTrace(store, id);
            raw.runSync("UPDATE brew_frames SET frames = ? WHERE brewId = ?;", [frames, id]);
        }
        raw.execSync(`
            CREATE TRIGGER refuse_frame_conversion BEFORE UPDATE ON brew_frames
            WHEN OLD.brewId = 'bad' BEGIN SELECT RAISE(ABORT, 'unconvertible frame'); END;
        `);
        expect(() => store.sweep(0)).not.toThrow();
        expect(raw.getFirstSync("SELECT frames FROM brew_frames WHERE brewId = 'bad';"))
            .toEqual({frames});
        expect(raw.getFirstSync("SELECT frames FROM brew_frames WHERE brewId = 'good';"))
            .toEqual({frames: encodeText(frames)});
    });

    it.each([traceBytes, 1])("includes frame-only logs in eviction order at budget %p", (budget) => {
        const {raw, store} = database();
        store.insert({...record, id: "frame-only", startedAt: 1}, [], frames);
        seedTrace(store, "sample-trace", {startedAt: 2});
        expect(store.get("frame-only")?.hasStream).toBe(false);

        store.sweepBytes(budget);

        expect(raw.getAllSync("SELECT brewId FROM brew_frames WHERE brewId = 'frame-only';"))
            .toEqual([]);
        expect(store.get("frame-only")?.hasStream).toBe(false);
        expect(store.get("sample-trace")?.hasStream).toBe(budget === traceBytes);
        expect(storedBytes(raw)).toBe(budget === traceBytes ? traceBytes : 0);
        expect(store.all()).toHaveLength(2);
    });

    it("measures the total once and preserves tier victims for unequal trace sizes", () => {
        const {raw, store} = database();
        seedTrace(store, "rated", {recipeUuid: "rated", rating: 4, startedAt: 1});
        seedTrace(store, "old", {startedAt: 2});
        seedTrace(store, "recent", {startedAt: 3});
        seedTrace(store, "newest", {startedAt: 4});
        raw.runSync("UPDATE brew_frames SET frames = ? WHERE brewId = 'recent';",
            [encodeText("é☕".repeat(200))]);
        const budget = traceBytes * 2;
        const totals = jest.spyOn(raw, "getFirstSync");
        const candidates = jest.spyOn(raw, "getAllSync");

        store.sweepBytes(budget);

        expect(totals.mock.calls.filter(([sql]) => sql.includes("SUM(length("))).toHaveLength(1);
        expect(candidates.mock.calls.filter(([sql]) => sql.includes("AS tier"))).toHaveLength(1);
        expect(store.all().filter((brew) => brew.hasStream).map((brew) => brew.id).sort())
            .toEqual(["newest", "rated"]);
        expect(storedBytes(raw)).toBe(budget);
    });

    it("sweeps 1,500 compressed 1,000-sample traces to half within two seconds", () => {
        const {raw, store} = database();
        const stream = encodeSamples(Array.from({length: 1000}, (_, i) => ({
            at: i * 237, water: i * 0.123456789, cup: i * 0.0987654321, pour: 1
        })));
        for (let i = 0; i < 1500; i += 1) {
            const id = `trace-${i}`;
            store.insert({...record, id, startedAt: i + 1}, []);
            raw.runSync("INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);", [id, stream]);
            raw.runSync("UPDATE brews SET hasStream = 1 WHERE id = ?;", [id]);
        }
        const before = storedBytes(raw);
        const start = performance.now();

        store.sweepBytes(before / 2);

        expect(performance.now() - start).toBeLessThan(2000);
        expect(storedBytes(raw)).toBe(before / 2);
        expect(store.all().filter((brew) => brew.hasStream).map((brew) => brew.startedAt))
            .toEqual(Array.from({length: 750}, (_, i) => 1500 - i));
    });

    it("handles an empty history", () => {
        const {raw, store} = database();
        store.sweepBytes(1);
        expect(storedBytes(raw)).toBe(0);
        expect(store.all()).toEqual([]);
    });
});
