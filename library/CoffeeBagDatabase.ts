import type {SQLiteDatabase} from "expo-sqlite";

import {appDatabase} from "@/library/appDatabase";
import {isBagId, reviveBag, type CoffeeBag} from "@/library/coffeeBag";

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

export default class CoffeeBagDatabase implements BagFactsStore {
    private readonly db: SQLiteDatabase;
    private transactionDepth = 0;

    constructor() {
        this.db = appDatabase();
        ensureBagTables(this.db);
    }

    public uses(db: SQLiteDatabase): boolean { return this.db === db; }

    private atomically(work: () => void): void {
        if (this.transactionDepth > 0) { work(); return; }
        this.db.withTransactionSync(() => {
            this.transactionDepth++;
            try { work(); }
            finally { this.transactionDepth--; }
        });
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
}
