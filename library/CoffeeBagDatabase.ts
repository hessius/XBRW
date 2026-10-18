import type {SQLiteDatabase} from "expo-sqlite";

import {appDatabase} from "@/library/appDatabase";
import {ensureBrewTables} from "@/library/BrewDatabase";
import {COUNTED_SQL} from "@/library/brew/brewPopulation";
import {reviveBag, type CoffeeBag} from "@/library/coffeeBag";
import {handoffBeanName} from "@/library/brew/handoff/bagBean";

/** A bag and the grams counted brews have taken from it since its anchor. */
export type StoredBagReading = {bag: CoffeeBag; usedGrams: number};

/**
 * Create the bag table if it is not there.
 *
 * Its own table rather than a field on `Recipe`, for two reasons. A bag is
 * something a person owns, not part of what a recipe is: duplicating a recipe
 * must not duplicate the bag, and sharing one must not send it. And a bag is
 * saved the moment it is added, while the editor holds unsaved recipe edits
 * behind a SAVE button; on the recipe blob the two would have to be merged.
 *
 * `countedFrom` and `finishedAt` are columns because SQL reads them; the rest
 * of the bag is a JSON blob, the same trade `recipes` makes, so adding a field
 * needs no migration. `finishedAt` is `NOT NULL DEFAULT 0` with 0 meaning open,
 * the convention `brews` uses for its optional numbers.
 */
export function ensureBagTable(db: SQLiteDatabase): void {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS coffee_bags (
            id TEXT PRIMARY KEY NOT NULL,
            recipeUuid TEXT NOT NULL,
            countedFrom INTEGER NOT NULL,
            finishedAt INTEGER NOT NULL DEFAULT 0,
            bag TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS coffee_bags_recipe ON coffee_bags (recipeUuid, finishedAt);
    `);
}

/**
 * The grams each open bag's counted brews have used, one grouped scan.
 *
 * Exported as a function over a handle so `RecipeDatabase` can serve it to the
 * library hook on the same revision counter as brew evidence without opening a
 * second store. Brews are matched by recipe and by `startedAt >= countedFrom`;
 * a brew with no dose (a hand-logged one, or a row older than the column)
 * contributes its stored 0.
 *
 * Both tables must already exist: the two callers' constructors ensure them,
 * and this runs on every library render, so it does not repeat the DDL.
 */
export function readOpenBags(db: SQLiteDatabase): Record<string, StoredBagReading> {
    const rows = db.getAllSync<{bag: string; used: number | null}>(`
        SELECT b.bag AS bag,
               COALESCE(SUM(CASE WHEN br.startedAt >= b.countedFrom AND ${COUNTED_SQL}
                                 THEN br.dose ELSE 0 END), 0) AS used
        FROM coffee_bags b
        LEFT JOIN brews br ON br.recipeUuid = b.recipeUuid
        WHERE b.finishedAt = 0
        GROUP BY b.id;`);
    const out: Record<string, StoredBagReading> = {};
    for (const row of rows) {
        const bag = parse(row.bag);
        if (bag === null) continue;
        // One open bag per recipe is the rule `save` keeps; should a restore
        // or an old row ever leave two, the newer one is the one drawn.
        const held = out[bag.recipeUuid];
        if (held !== undefined && held.bag.addedAt > bag.addedAt) continue;
        out[bag.recipeUuid] = {bag, usedGrams: row.used ?? 0};
    }
    return out;
}

function parse(text: string): CoffeeBag | null {
    try {
        return reviveBag(JSON.parse(text));
    } catch {
        return null;
    }
}

/**
 * Bags of coffee, one open bag per recipe at most.
 *
 * Shares the app database through `appDatabase()`; see that module for why a
 * second `openDatabaseSync` is not harmless.
 */
export default class CoffeeBagDatabase {
    private db: SQLiteDatabase;

    constructor() {
        this.db = appDatabase();
        ensureBrewTables(this.db);
        ensureBagTable(this.db);
    }

    /** Whether this store is on the given handle. */
    public uses(db: SQLiteDatabase): boolean {
        return this.db === db;
    }

    /** The recipe's open bag and what its brews have used, or null. */
    public openFor(recipeUuid: string): StoredBagReading | null {
        const rows = this.db.getAllSync<{bag: string}>(
            `SELECT bag FROM coffee_bags WHERE recipeUuid = ? AND finishedAt = 0
             ORDER BY countedFrom DESC;`, [recipeUuid]
        );
        for (const row of rows) {
            const bag = parse(row.bag);
            if (bag !== null) return {bag, usedGrams: this.usedSince(recipeUuid, bag.countedFrom)};
        }
        return null;
    }

    /** Every open bag, keyed by recipe uuid. */
    public openBags(): Record<string, StoredBagReading> {
        return readOpenBags(this.db);
    }

    /** Every bag, open and finished, for backup. Unreadable rows are left out. */
    public all(): CoffeeBag[] {
        return this.db.getAllSync<{bag: string}>("SELECT bag FROM coffee_bags ORDER BY countedFrom;")
            .map((row) => parse(row.bag))
            .filter((bag): bag is CoffeeBag => bag !== null);
    }

    /** Grams of counted brews of the recipe started at or after `since`. */
    public usedSince(recipeUuid: string, since: number): number {
        const row = this.db.getFirstSync<{used: number | null}>(
            `SELECT COALESCE(SUM(dose), 0) AS used FROM brews
             WHERE recipeUuid = ? AND startedAt >= ? AND ${COUNTED_SQL};`,
            [recipeUuid, since]
        );
        return row?.used ?? 0;
    }

    /**
     * Write a bag. An open bag replaces any other open bag of its recipe, so
     * "I bought a bag" on a recipe that still had one finishes the old one.
     */
    public save(bag: CoffeeBag, now: number = Date.now()): void {
        this.db.withTransactionSync(() => {
            if (bag.finishedAt === undefined) {
                for (const other of this.openRows(bag.recipeUuid)) {
                    if (other.id !== bag.id) this.write({...other, finishedAt: now});
                }
            }
            this.write(bag);
        });
    }

    /** Mark the bag finished. It stays in the table, and in backups. */
    public finish(id: string, now: number = Date.now()): void {
        const bag = this.get(id);
        if (bag === null || bag.finishedAt !== undefined) return;
        this.write({...bag, finishedAt: now});
    }

    /** Remove a bag outright, for one added by mistake. */
    public remove(id: string): void {
        this.db.runSync("DELETE FROM coffee_bags WHERE id = ?;", [id]);
    }

    /** Remove every bag of a recipe, when the recipe itself is deleted. */
    public removeForRecipe(recipeUuid: string): void {
        this.db.runSync("DELETE FROM coffee_bags WHERE recipeUuid = ?;", [recipeUuid]);
    }

    /**
     * Add bags from a backup, never overwriting, and say how many landed.
     *
     * Matched on id, like brews: a bag already here may carry a correction made
     * after the backup. A restored *open* bag is also skipped when its recipe
     * already has an open bag here, because the bag on this phone is the one
     * the person is using now and two open bags would contradict each other.
     * Bags for recipes not in the library are kept out by the caller passing
     * `knownRecipes`, since a bag for nothing is clutter nobody can reach.
     */
    public restore(bags: readonly CoffeeBag[], knownRecipes: ReadonlySet<string>): number {
        const known = new Set(this.db.getAllSync<{id: string}>("SELECT id FROM coffee_bags;")
            .map((row) => row.id));
        const openRecipes = new Set(Object.keys(this.openBags()));
        const toAdd: CoffeeBag[] = [];
        for (const bag of bags) {
            if (known.has(bag.id) || !knownRecipes.has(bag.recipeUuid)) continue;
            if (bag.finishedAt === undefined) {
                if (openRecipes.has(bag.recipeUuid)) continue;
                openRecipes.add(bag.recipeUuid);
            }
            known.add(bag.id);
            toAdd.push(bag);
        }
        if (toAdd.length === 0) return 0;
        this.db.withTransactionSync(() => toAdd.forEach((bag) => this.write(bag)));
        return toAdd.length;
    }

    public get(id: string): CoffeeBag | null {
        const row = this.db.getFirstSync<{bag: string}>(
            "SELECT bag FROM coffee_bags WHERE id = ?;", [id]
        );
        return row === null || row === undefined ? null : parse(row.bag);
    }

    private openRows(recipeUuid: string): CoffeeBag[] {
        return this.db.getAllSync<{bag: string}>(
            "SELECT bag FROM coffee_bags WHERE recipeUuid = ? AND finishedAt = 0;", [recipeUuid]
        ).map((row) => parse(row.bag)).filter((bag): bag is CoffeeBag => bag !== null);
    }

    private write(bag: CoffeeBag): void {
        this.db.runSync(
            `INSERT INTO coffee_bags (id, recipeUuid, countedFrom, finishedAt, bag)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET recipeUuid = excluded.recipeUuid,
                 countedFrom = excluded.countedFrom, finishedAt = excluded.finishedAt,
                 bag = excluded.bag;`,
            [bag.id, bag.recipeUuid, bag.countedFrom, bag.finishedAt ?? 0, JSON.stringify(bag)]
        );
    }
}

let shared: CoffeeBagDatabase | undefined;

/**
 * The one store, opened on first use rather than at import.
 *
 * Rebuilt when `appDatabase()` hands back a different handle, which happens
 * only in tests (`forgetAppDatabase` between each one); on a phone the handle
 * lives as long as the process, so this is one comparison.
 */
export function sharedBagDatabase(): CoffeeBagDatabase {
    if (shared === undefined || !shared.uses(appDatabase())) shared = new CoffeeBagDatabase();
    return shared;
}

/**
 * The bean name a recipe's open bag was sent to Beanconqueror under, if any.
 *
 * Read by the brew and record screens when they ask what the coffee was, so a
 * brew handed over lands on the bean the bag became. Undefined, never a throw:
 * a bag table that cannot be read costs the suggestion and nothing else.
 */
export function openBagBeanName(recipeUuid: string): string | undefined {
    try {
        return handoffBeanName(sharedBagDatabase().openFor(recipeUuid)?.bag);
    } catch {
        return undefined;
    }
}
