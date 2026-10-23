import type {SQLiteDatabase} from "expo-sqlite";
import {
    isBagRecord, isBagId, isGramsLeft, reviveBag, dayOf, type CoffeeBag
} from "@/library/coffeeBag";
import type {BagBackupResult, BagBundle, BagInventoryBackup} from "@/library/bagBackup";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import Recipe from "@/library/Recipe";

type LegacyBag = {bag: CoffeeBag; recipeUuid: string; countedFrom: number; gramsAtCount: number};
type LegacyRow = {id: string; recipeUuid: string; countedFrom: number; finishedAt: number; bag: string};

export function legacyBagTableExists(db: SQLiteDatabase): boolean {
    return db.getFirstSync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coffee_bags';"
    ) !== null;
}

function instant(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function legacyBag(value: unknown, recipeName?: string): LegacyBag | null {
    if (!isBagRecord(value) || !isBagId(value.recipeUuid)
        || !instant(value.countedFrom) || !isGramsLeft(value.gramsAtCount)) return null;
    const name = typeof value.name === "string" && value.name.trim()
        ? value.name : typeof value.beanName === "string" && value.beanName.trim()
            ? value.beanName : recipeName || "Coffee bag";
    const bag = reviveBag({
        ...value, name,
        boughtOn: value.boughtOn ?? (instant(value.addedAt) ? dayOf(value.addedAt) : undefined)
    });
    return bag === null ? null : {
        bag, recipeUuid: value.recipeUuid, countedFrom: value.countedFrom,
        gramsAtCount: value.gramsAtCount
    };
}

function bundleFor(legacy: LegacyBag, used: number, reliable: boolean): BagBundle {
    const finished = legacy.bag.finishedAt !== undefined;
    return {
        bag: legacy.bag,
        baselineGrams: finished ? legacy.gramsAtCount
            : Math.max(0, Math.round(legacy.gramsAtCount - used)),
        needsCheck: finished || !reliable,
        linkedRecipeUuids: [legacy.recipeUuid], runs: []
    };
}

function selectionsFor(bags: BagBundle[]): BagInventoryBackup["selections"] {
    const choices = new Map<string, BagBundle>();
    for (const bundle of bags) {
        if (bundle.bag.finishedAt !== undefined) continue;
        for (const uuid of bundle.linkedRecipeUuids) {
            const previous = choices.get(uuid)?.bag;
            if (previous === undefined || bundle.bag.addedAt > previous.addedAt
                || (bundle.bag.addedAt === previous.addedAt && bundle.bag.id < previous.id)) {
                choices.set(uuid, bundle);
            }
        }
    }
    return [...choices].map(([recipeUuid, {bag}]) => ({
        recipeUuid, bagId: bag.id, selectedAt: bag.addedAt
    }));
}

export function parseLegacyBagInventory(
    value: unknown, recipes: readonly Recipe[], brews: readonly BrewRecord[], reliable: boolean
): BagBackupResult {
    const result: BagBackupResult = {inventory: null, skippedBags: 0, skippedBagRows: 0, warnings: []};
    if (value === undefined) return result;
    const names = new Map(recipes.map(recipe => [recipe.uuid, recipe.displayName()]));
    const bags = new Map<string, BagBundle>();
    if (!Array.isArray(value)) result.skippedBags++;
    else for (const raw of value) {
        const uuid = isBagRecord(raw) && typeof raw.recipeUuid === "string" ? raw.recipeUuid : "";
        const legacy = legacyBag(raw, names.get(uuid));
        if (legacy === null || bags.has(legacy.bag.id)) { result.skippedBags++; continue; }
        const counted = brews.filter(brew => brew.recipeUuid === legacy.recipeUuid
            && brew.startedAt >= legacy.countedFrom
            && (brew.outcome === "done" || brew.outcome === "endedOnMachine"));
        const known = reliable && counted.every(brew => brew.dose !== undefined || brew.watched === false);
        const used = counted.reduce((total, brew) => total + (brew.dose ?? 0), 0);
        bags.set(legacy.bag.id, bundleFor(legacy, used, known));
    }
    if (result.skippedBags) result.warnings.push("Some old bag data could not be read. Keep the original backup.");
    if ([...bags.values()].some(bag => bag.needsCheck)) {
        result.warnings.push("Check remaining coffee in the imported old bags.");
    }
    result.inventory = {version: 2, bags: [...bags.values()], selections: selectionsFor([...bags.values()])};
    return result;
}

/** The caller installs v2 tables first. Legacy rows remain untouched. */
export function migrateLegacyBags(db: SQLiteDatabase): {migrated: number; unreadable: number} {
    if (!legacyBagTableExists(db)) return {migrated: 0, unreadable: 0};
    db.execSync("CREATE TABLE IF NOT EXISTS coffee_bag_migrations (legacyId TEXT PRIMARY KEY NOT NULL);");
    const recipesExist = db.getFirstSync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipes';"
    ) !== null;
    const recipes = recipesExist ? db.getAllSync<{uuid: string; recipeJSON: string}>(
        "SELECT uuid, recipeJSON FROM recipes;"
    ).map(row => new Recipe(undefined, row.recipeJSON)) : [];
    const names = new Map(recipes.map(recipe => [recipe.uuid, recipe.displayName()]));
    const hasDose = db.getAllSync<{name: string}>("PRAGMA table_info(brews);")
        .some(column => column.name === "dose");
    let migrated = 0;
    let unreadable = 0;
    const imported: BagBundle[] = [];
    db.withTransactionSync(() => {
        for (const row of db.getAllSync<LegacyRow>("SELECT * FROM coffee_bags ORDER BY id;")) {
            if (db.getFirstSync(
                "SELECT legacyId FROM coffee_bag_migrations WHERE legacyId = ?;", [row.id]
            ) !== null) continue;
            if (db.getFirstSync("SELECT id FROM coffee_bags_v2 WHERE id = ?;", [row.id]) !== null) {
                db.runSync("INSERT INTO coffee_bag_migrations (legacyId) VALUES (?);", [row.id]);
                continue;
            }
            let value: unknown;
            try { value = JSON.parse(row.bag); }
            catch { unreadable++; continue; }
            const legacy = legacyBag(value, names.get(row.recipeUuid));
            if (legacy === null || legacy.bag.id !== row.id || legacy.recipeUuid !== row.recipeUuid
                || legacy.countedFrom !== row.countedFrom
                || (legacy.bag.finishedAt ?? 0) !== row.finishedAt) { unreadable++; continue; }
            const used = hasDose ? db.getFirstSync<{used: number}>(`
                SELECT COALESCE(SUM(dose), 0) AS used FROM brews
                WHERE recipeUuid = ? AND startedAt >= ?
                  AND outcome IN ('done', 'endedOnMachine');`,
                [legacy.recipeUuid, legacy.countedFrom]
            )?.used : undefined;
            const validUsed = used !== undefined && Number.isFinite(used) && used >= 0;
            const bundle = bundleFor(legacy, validUsed ? used : 0, validUsed);
            db.runSync(
                "INSERT INTO coffee_bags_v2 (id, bag, baselineGrams, needsCheck) VALUES (?, ?, ?, ?);",
                [bundle.bag.id, JSON.stringify(bundle.bag), bundle.baselineGrams, bundle.needsCheck]
            );
            if (names.has(legacy.recipeUuid)) {
                db.runSync("INSERT INTO coffee_bag_links (recipeUuid, bagId) VALUES (?, ?);",
                    [legacy.recipeUuid, bundle.bag.id]);
                imported.push(bundle);
            }
            migrated++;
            db.runSync("INSERT INTO coffee_bag_migrations (legacyId) VALUES (?);", [row.id]);
        }
        for (const choice of selectionsFor(imported)) {
            db.runSync(
                "INSERT OR IGNORE INTO coffee_bag_selections (recipeUuid, bagId, selectedAt) VALUES (?, ?, ?);",
                [choice.recipeUuid, choice.bagId, choice.selectedAt]
            );
        }
    });
    return {migrated, unreadable};
}
