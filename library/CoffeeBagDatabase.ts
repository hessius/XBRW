import type {SQLiteDatabase} from "expo-sqlite";

import {appDatabase} from "@/library/appDatabase";
import {
    isBagId, isGramsLeft, reviveBag, type BagBalance, type BagTracker, type CoffeeBag
} from "@/library/coffeeBag";
import {
    INITIAL_BAG_PROGRESS, nextBagProgress, reviveBagRunProgress, reviveBagRunSnapshot,
    type BagAccountingStore, type BagRunProgress, type BagRunSnapshot
} from "@/library/bagRun";

export type BagSelection = {
    recipeUuid: string;
    bagId: string | null;
    selectedAt: number;
};

export interface BagFactsStore {
    get(id: string): CoffeeBag | null;
    all(): CoffeeBag[];
    create(bag: CoffeeBag): void;
    createAndSelect(bag: CoffeeBag, recipeUuid: string, at: number): void;
    edit(bag: CoffeeBag): void;
    linked(recipeUuid: string): CoffeeBag[];
    link(recipeUuid: string, bagId: string): void;
    unlink(recipeUuid: string, bagId: string): void;
    selection(recipeUuid: string): BagSelection | null;
    select(recipeUuid: string, bagId: string | null, at: number): void;
    finish(bagId: string, at: number): void;
    remove(bagId: string): void;
}

const listeners = new Set<() => void>();
let revision = 0;
type FailedRun = {snapshot: BagRunSnapshot; progress: BagRunProgress};
const failedByDatabase = new WeakMap<SQLiteDatabase, Map<string, FailedRun>>();

function failedRuns(db: SQLiteDatabase): Map<string, FailedRun> {
    let failed = failedByDatabase.get(db);
    if (failed === undefined) {
        failed = new Map();
        failedByDatabase.set(db, failed);
    }
    return failed;
}

export function subscribeBagChanges(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function bagRevision(): number { return revision; }

export function publishBagChanges(): void {
    revision++;
    for (const listener of listeners) listener();
}

export function bagTablesExist(db: SQLiteDatabase): boolean {
    return db.getFirstSync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coffee_bags_v2';"
    ) != null;
}

export function ensureBagTables(db: SQLiteDatabase): void {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS coffee_bags_v2 (
            id TEXT PRIMARY KEY NOT NULL,
            bag TEXT NOT NULL,
            baselineGrams REAL NOT NULL,
            needsCheck INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS coffee_bag_links (
            recipeUuid TEXT NOT NULL,
            bagId TEXT NOT NULL,
            PRIMARY KEY (recipeUuid, bagId)
        );
        CREATE INDEX IF NOT EXISTS coffee_bag_links_bag
            ON coffee_bag_links (bagId, recipeUuid);
        CREATE TABLE IF NOT EXISTS coffee_bag_selections (
            recipeUuid TEXT PRIMARY KEY NOT NULL,
            bagId TEXT,
            selectedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS coffee_bag_runs (
            runId TEXT PRIMARY KEY NOT NULL,
            bagId TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            consumption TEXT NOT NULL DEFAULT 'pending'
                CHECK (consumption IN ('pending', 'used', 'unused', 'uncertain')),
            possible INTEGER NOT NULL DEFAULT 0,
            closed INTEGER NOT NULL DEFAULT 0,
            coveredByBaseline INTEGER NOT NULL DEFAULT 0,
            overlapsBaseline INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS coffee_bag_runs_bag
            ON coffee_bag_runs (bagId);
    `);
}

type BagRow = {id: string; bag: string};
type RunRow = {
    runId: string;
    bagId: string;
    snapshot: string;
    consumption: string;
    possible: number;
    closed: number;
    coveredByBaseline: number;
    overlapsBaseline: number;
};

function readRun(row: RunRow): {snapshot: BagRunSnapshot; progress: BagRunProgress} {
    let value: unknown;
    try { value = JSON.parse(row.snapshot); }
    catch (cause) { throw new Error("Could not read the saved bag attribution.", {cause}); }
    const snapshot = reviveBagRunSnapshot(value);
    const flags = [row.possible, row.closed, row.coveredByBaseline, row.overlapsBaseline];
    const progress = reviveBagRunProgress({
        consumption: row.consumption, possible: row.possible === 1, closed: row.closed === 1
    });
    if (snapshot === null || progress === null || snapshot.runId !== row.runId
        || snapshot.bagId !== row.bagId || snapshot.tracker !== "xbrw"
        || flags.some(flag => flag !== 0 && flag !== 1)) {
        throw new Error("Could not read the saved bag attribution.");
    }
    return {snapshot, progress};
}

function readBag(row: BagRow): CoffeeBag {
    let value: unknown;
    try { value = JSON.parse(row.bag); }
    catch (cause) { throw new Error("Could not read the saved bag.", {cause}); }
    const bag = reviveBag(value);
    if (bag === null || bag.id !== row.id) throw new Error("Could not read the saved bag.");
    return bag;
}

function checkedBag(bag: CoffeeBag): CoffeeBag {
    const value = reviveBag(bag);
    if (value === null) throw new Error("The bag details are invalid.");
    return value;
}

function isRunAdvance(previous: BagRunProgress, next: BagRunProgress): boolean {
    if (previous.consumption === next.consumption && previous.possible === next.possible
        && previous.closed === next.closed) return true;
    if (previous.closed && previous.consumption === "unused"
        && next.consumption === "pending" && !next.possible && !next.closed) return true;
    return !previous.closed
        && !(previous.consumption === "used" && next.consumption !== "used")
        && !(previous.consumption !== "pending" && next.consumption === "pending")
        && !(previous.possible && !next.possible && next.consumption !== "unused");
}

export default class CoffeeBagDatabase implements BagFactsStore, BagAccountingStore {
    private readonly db: SQLiteDatabase;
    private transactionDepth = 0;
    private afterCommit: (() => void)[] = [];

    constructor() {
        this.db = appDatabase();
        ensureBagTables(this.db);
    }

    public uses(db: SQLiteDatabase): boolean { return this.db === db; }

    private atomically(work: () => void): void {
        if (this.transactionDepth > 0) { work(); return; }
        const afterCommit: (() => void)[] = [];
        this.afterCommit = afterCommit;
        try {
            this.db.withTransactionSync(() => {
                this.transactionDepth++;
                try { work(); }
                finally { this.transactionDepth--; }
            });
        } catch (error) {
            this.afterCommit = [];
            throw error;
        }
        this.afterCommit = [];
        for (const complete of afterCommit) complete();
        publishBagChanges();
    }

    public get(id: string): CoffeeBag | null {
        const row = this.db.getFirstSync<BagRow>(
            "SELECT id, bag FROM coffee_bags_v2 WHERE id = ?;", [id]
        );
        return row === null ? null : readBag(row);
    }

    public all(): CoffeeBag[] {
        return this.db.getAllSync<BagRow>(
            "SELECT id, bag FROM coffee_bags_v2 ORDER BY id;"
        ).map(readBag);
    }

    public create(bag: CoffeeBag): void {
        const value = checkedBag(bag);
        this.atomically(() => {
            this.db.runSync(
                "INSERT INTO coffee_bags_v2 (id, bag, baselineGrams) VALUES (?, ?, ?);",
                [value.id, JSON.stringify(value), value.sizeGrams]
            );
        });
    }

    public createAndSelect(bag: CoffeeBag, recipeUuid: string, at: number): void {
        this.atomically(() => {
            this.create(bag);
            this.select(recipeUuid, bag.id, at);
        });
    }

    public edit(bag: CoffeeBag): void {
        const value = checkedBag(bag);
        this.atomically(() => {
            const result = this.db.runSync(
                "UPDATE coffee_bags_v2 SET bag = ? WHERE id = ?;",
                [JSON.stringify(value), value.id]
            );
            if (result.changes !== 1) throw new Error("That bag is no longer available.");
        });
    }

    public linked(recipeUuid: string): CoffeeBag[] {
        return this.db.getAllSync<BagRow>(`
            SELECT b.id, b.bag FROM coffee_bags_v2 b
            JOIN coffee_bag_links l ON l.bagId = b.id
            WHERE l.recipeUuid = ? ORDER BY b.id;`, [recipeUuid]
        ).map(readBag);
    }

    private requireRecipe(recipeUuid: string): void {
        if (!isBagId(recipeUuid) || this.db.getFirstSync(
            "SELECT uuid FROM recipes WHERE uuid = ?;", [recipeUuid]
        ) === null) throw new Error("Save this recipe before choosing a bag.");
    }

    private requireOpenBag(bagId: string): CoffeeBag {
        const bag = this.get(bagId);
        if (bag === null || bag.finishedAt !== undefined) {
            throw new Error("That bag is no longer available.");
        }
        return bag;
    }

    public link(recipeUuid: string, bagId: string): void {
        this.atomically(() => {
            this.requireRecipe(recipeUuid);
            this.requireOpenBag(bagId);
            this.db.runSync(
                "INSERT OR IGNORE INTO coffee_bag_links (recipeUuid, bagId) VALUES (?, ?);",
                [recipeUuid, bagId]
            );
        });
    }

    public unlink(recipeUuid: string, bagId: string): void {
        this.atomically(() => {
            this.db.runSync(
                "DELETE FROM coffee_bag_links WHERE recipeUuid = ? AND bagId = ?;",
                [recipeUuid, bagId]
            );
            this.db.runSync(
                "UPDATE coffee_bag_selections SET bagId = NULL WHERE recipeUuid = ? AND bagId = ?;",
                [recipeUuid, bagId]
            );
        });
    }

    public selection(recipeUuid: string): BagSelection | null {
        const row = this.db.getFirstSync<BagSelection>(`
            SELECT s.recipeUuid, s.bagId, s.selectedAt FROM coffee_bag_selections s
            JOIN recipes r ON r.uuid = s.recipeUuid WHERE s.recipeUuid = ?;`, [recipeUuid]
        );
        if (row === null) return null;
        if (!isBagId(row.recipeUuid) || (row.bagId !== null && !isBagId(row.bagId))
            || typeof row.selectedAt !== "number" || !Number.isFinite(row.selectedAt)
            || row.selectedAt < 0) throw new Error("Could not read the saved bag selection.");
        return row;
    }

    public select(recipeUuid: string, bagId: string | null, at: number): void {
        if (!Number.isFinite(at) || at < 0) throw new Error("The bag selection time is invalid.");
        this.atomically(() => {
            this.requireRecipe(recipeUuid);
            if (bagId !== null) this.link(recipeUuid, bagId);
            this.db.runSync(`
                INSERT INTO coffee_bag_selections (recipeUuid, bagId, selectedAt)
                VALUES (?, ?, ?)
                ON CONFLICT(recipeUuid) DO UPDATE
                SET bagId = excluded.bagId, selectedAt = excluded.selectedAt;`,
                [recipeUuid, bagId, at]
            );
        });
    }

    public finish(bagId: string, at: number): void {
        this.atomically(() => {
            const bag = this.requireOpenBag(bagId);
            this.edit({...bag, finishedAt: at});
            this.db.runSync(
                "UPDATE coffee_bag_selections SET bagId = NULL WHERE bagId = ?;", [bagId]
            );
        });
    }

    public remove(bagId: string): void {
        this.atomically(() => {
            this.db.runSync(
                "UPDATE coffee_bag_selections SET bagId = NULL WHERE bagId = ?;", [bagId]
            );
            this.db.runSync("DELETE FROM coffee_bag_links WHERE bagId = ?;", [bagId]);
            this.db.runSync("DELETE FROM coffee_bag_runs WHERE bagId = ?;", [bagId]);
            this.db.runSync("DELETE FROM coffee_bags_v2 WHERE id = ?;", [bagId]);
        });
    }

    public beginRun(proposed: BagRunSnapshot): BagRunProgress {
        const snapshot = reviveBagRunSnapshot(proposed);
        if (snapshot === null) throw new Error("The bag attribution is invalid.");
        if (this.get(snapshot.bagId) === null) throw new Error("That bag is no longer available.");
        if (snapshot.tracker === "beanconqueror") return {...INITIAL_BAG_PROGRESS};
        let progress = {...INITIAL_BAG_PROGRESS};
        this.atomically(() => {
            const existing = this.db.getFirstSync<RunRow>(
                "SELECT * FROM coffee_bag_runs WHERE runId = ?;", [snapshot.runId]
            );
            if (existing !== null) {
                const saved = readRun(existing);
                if (JSON.stringify(saved.snapshot) !== JSON.stringify(snapshot)) {
                    throw new Error("That brew already has a different bag attribution.");
                }
                progress = saved.progress;
                return;
            }
            this.db.runSync(
                "INSERT INTO coffee_bag_runs (runId, bagId, snapshot) VALUES (?, ?, ?);",
                [snapshot.runId, snapshot.bagId, JSON.stringify(snapshot)]
            );
        });
        return progress;
    }

    public updateRun(runId: string, proposed: BagRunProgress): void {
        const progress = reviveBagRunProgress(proposed);
        if (progress === null) throw new Error("The bag progress is invalid.");
        this.atomically(() => {
            const row = this.db.getFirstSync<RunRow>(
                "SELECT * FROM coffee_bag_runs WHERE runId = ?;", [runId]
            );
            if (row === null) throw new Error("The bag attribution is no longer available.");
            const previous = readRun(row).progress;
            const failed = failedRuns(this.db).get(runId);
            if (!isRunAdvance(previous, progress)
                || (failed !== undefined && !isRunAdvance(failed.progress, progress))) {
                throw new Error("The saved bag progress cannot be rewound.");
            }
            if (failed !== undefined) {
                this.afterCommit.push(() => {
                    if (failedRuns(this.db).get(runId) === failed) failedRuns(this.db).delete(runId);
                });
            }
            if (previous.consumption === progress.consumption
                && previous.possible === progress.possible
                && previous.closed === progress.closed) return;
            const rearming = previous.closed && previous.consumption === "unused"
                && progress.consumption === "pending" && !progress.possible && !progress.closed;
            this.db.runSync(`
                UPDATE coffee_bag_runs SET consumption = ?, possible = ?, closed = ?,
                    coveredByBaseline = CASE WHEN ? THEN 0 ELSE coveredByBaseline END,
                    overlapsBaseline = CASE WHEN ? THEN 0 ELSE overlapsBaseline END
                WHERE runId = ?;`,
                [progress.consumption, progress.possible, progress.closed, rearming, rearming, runId]
            );
        });
    }

    public balance(bagId: string, dose: number, tracker: BagTracker): BagBalance {
        if (this.get(bagId) === null) throw new Error("That bag is no longer available.");
        if (tracker === "beanconqueror") return {kind: "external"};
        if ([...failedRuns(this.db).values()].some(run => run.snapshot.bagId === bagId)) {
            return {kind: "needsCheck"};
        }
        const runs = this.db.getAllSync<RunRow>(
            "SELECT * FROM coffee_bag_runs WHERE bagId = ?;", [bagId]
        );
        for (const row of runs) readRun(row);
        const row = this.db.getFirstSync<{
            baselineGrams: number; needsCheck: number; usedGrams: number; unresolved: number
        }>(`
            SELECT b.baselineGrams, b.needsCheck,
                COALESCE(SUM(CASE WHEN r.coveredByBaseline = 0 AND r.consumption = 'used'
                    THEN json_extract(r.snapshot, '$.dose') ELSE 0 END), 0) AS usedGrams,
                COALESCE(MAX(CASE
                    WHEN (r.coveredByBaseline = 0 AND r.consumption = 'uncertain')
                        OR (r.overlapsBaseline = 1 AND r.consumption <> 'unused')
                    THEN 1 ELSE 0 END), 0) AS unresolved
            FROM coffee_bags_v2 b
            LEFT JOIN coffee_bag_runs r ON r.bagId = b.id
            WHERE b.id = ? GROUP BY b.id;`, [bagId]
        );
        if (row === null || !isGramsLeft(row.baselineGrams)
            || (row.needsCheck !== 0 && row.needsCheck !== 1)
            || (row.unresolved !== 0 && row.unresolved !== 1)
            || !Number.isFinite(row.usedGrams) || row.usedGrams < 0) {
            throw new Error("Could not read the saved quantity estimate.");
        }
        if (row.needsCheck || row.unresolved) return {kind: "needsCheck"};
        const remainingGrams = Math.max(0, row.baselineGrams - row.usedGrams);
        const validDose = Number.isFinite(dose) && dose > 0;
        return {
            kind: "estimate", remainingGrams, usedGrams: row.usedGrams,
            brewsLeft: validDose ? Math.floor(remainingGrams / dose) : null,
            low: validDose && remainingGrams < dose * 2, empty: remainingGrams === 0
        };
    }

    public correct(bagId: string, grams: number): void {
        if (!isGramsLeft(grams)) throw new Error("Enter remaining coffee from 0 to 5000 g.");
        if (this.get(bagId) === null) throw new Error("That bag is no longer available.");
        this.atomically(() => {
            for (const {snapshot, progress} of failedRuns(this.db).values()) {
                if (snapshot.bagId !== bagId) continue;
                this.beginRun(snapshot);
                this.updateRun(snapshot.runId, progress);
            }
            for (const row of this.db.getAllSync<RunRow>(
                "SELECT * FROM coffee_bag_runs WHERE bagId = ?;", [bagId]
            )) readRun(row);
            this.db.runSync(`
                UPDATE coffee_bag_runs SET
                    coveredByBaseline = CASE
                        WHEN consumption IN ('used', 'uncertain')
                            OR (consumption = 'pending' AND possible = 1)
                        THEN 1 ELSE coveredByBaseline END,
                    overlapsBaseline = CASE
                        WHEN closed = 0 AND possible = 1
                            AND consumption IN ('pending', 'uncertain') THEN 1 ELSE 0 END
                WHERE bagId = ?;`, [bagId]
            );
            this.db.runSync(
                "UPDATE coffee_bags_v2 SET baselineGrams = ?, needsCheck = 0 WHERE id = ?;",
                [grams, bagId]
            );
        });
    }

    public invalidateBagEstimate(snapshot: BagRunSnapshot, progress: BagRunProgress): void {
        const attribution = reviveBagRunSnapshot(snapshot);
        const observed = reviveBagRunProgress(progress);
        if (attribution === null || observed === null) {
            throw new Error("The unsaved bag progress is invalid.");
        }
        if (attribution.tracker !== "xbrw") return;
        failedRuns(this.db).set(attribution.runId, {snapshot: attribution, progress: observed});
        publishBagChanges();
        this.atomically(() => {
            this.db.runSync(
                "UPDATE coffee_bags_v2 SET needsCheck = 1 WHERE id = ?;", [attribution.bagId]
            );
        });
    }

    public markAllNeedsCheck(): void {
        this.atomically(() => {
            this.db.runSync(`
                UPDATE coffee_bags_v2 SET needsCheck = 1
                WHERE json_extract(bag, '$.finishedAt') IS NULL;`
            );
        });
    }

    public recoverPending(): void {
        const rows = this.db.getAllSync<RunRow>(
            "SELECT * FROM coffee_bag_runs WHERE closed = 0;"
        );
        if (rows.length === 0) return;
        this.atomically(() => {
            for (const row of rows) {
                const {progress} = readRun(row);
                this.updateRun(row.runId, nextBagProgress(progress, "recovered"));
            }
        });
    }
}

let shared: CoffeeBagDatabase | undefined;

export function sharedBagDatabase(): CoffeeBagDatabase {
    const db = appDatabase();
    if (shared === undefined || !shared.uses(db)) {
        const opened = new CoffeeBagDatabase();
        opened.recoverPending();
        shared = opened;
    }
    return shared;
}
