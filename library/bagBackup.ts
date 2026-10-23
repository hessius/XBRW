import {isBagId, isBagRecord, isGramsLeft, reviveBag, type CoffeeBag} from "@/library/coffeeBag";
import {
    reviveBagRunProgress, reviveBagRunSnapshot, type BagRunProgress, type BagRunSnapshot
} from "@/library/bagRun";
import type {BagSelection} from "@/library/CoffeeBagDatabase";

export type BagRunBackup = {
    snapshot: BagRunSnapshot;
    progress: BagRunProgress;
    coveredByBaseline: boolean;
    overlapsBaseline: boolean;
};

export type BagBundle = {
    bag: CoffeeBag;
    baselineGrams: number;
    needsCheck: boolean;
    linkedRecipeUuids: string[];
    runs: BagRunBackup[];
};

export type BagInventoryBackup = {
    version: 2;
    bags: BagBundle[];
    selections: BagSelection[];
};

export type BagBackupResult = {
    inventory: BagInventoryBackup | null;
    skippedBags: number;
    skippedBagRows: number;
    warnings: string[];
};

export function parseBagInventory(value: unknown): BagBackupResult {
    const result: BagBackupResult = {
        inventory: null, skippedBags: 0, skippedBagRows: 0, warnings: []
    };
    if (value === undefined) return result;
    if (!isBagRecord(value) || value.version !== 2 || !Array.isArray(value.bags)) {
        result.skippedBags = 1;
        result.warnings.push(isBagRecord(value) && value.version !== 2
            ? "This bag inventory version is not supported."
            : "The bag inventory could not be read.");
        return result;
    }
    const bags = new Map<string, BagBundle>();
    const runOwners = new Map<string, BagBundle>();
    for (const raw of value.bags) {
        const bag = isBagRecord(raw) ? reviveBag(raw.bag) : null;
        if (!isBagRecord(raw) || bag === null || !isGramsLeft(raw.baselineGrams)
            || typeof raw.needsCheck !== "boolean"
            || !Array.isArray(raw.linkedRecipeUuids) || !Array.isArray(raw.runs)) {
            result.skippedBags++;
            continue;
        }
        const duplicate = bags.get(bag.id);
        if (duplicate !== undefined) {
            duplicate.needsCheck = true;
            result.skippedBags++;
            continue;
        }
        const bundle: BagBundle = {
            bag, baselineGrams: raw.baselineGrams, needsCheck: raw.needsCheck,
            linkedRecipeUuids: [], runs: []
        };
        bags.set(bag.id, bundle);
        for (const uuid of raw.linkedRecipeUuids) {
            if (!isBagId(uuid) || bundle.linkedRecipeUuids.includes(uuid)) {
                result.skippedBagRows++;
            } else bundle.linkedRecipeUuids.push(uuid);
        }
        for (const row of raw.runs) {
            const snapshot = isBagRecord(row) ? reviveBagRunSnapshot(row.snapshot) : null;
            const progress = isBagRecord(row) ? reviveBagRunProgress(row.progress) : null;
            if (!isBagRecord(row) || snapshot === null || progress === null
                || snapshot.bagId !== bag.id || snapshot.tracker !== "xbrw"
                || typeof row.coveredByBaseline !== "boolean"
                || typeof row.overlapsBaseline !== "boolean") {
                bundle.needsCheck = true;
                result.skippedBagRows++;
                continue;
            }
            const owner = runOwners.get(snapshot.runId);
            if (owner !== undefined) {
                owner.needsCheck = bundle.needsCheck = true;
                result.skippedBagRows++;
                continue;
            }
            runOwners.set(snapshot.runId, bundle);
            bundle.runs.push({
                snapshot, progress, coveredByBaseline: row.coveredByBaseline,
                overlapsBaseline: row.overlapsBaseline
            });
        }
    }
    const selections: BagSelection[] = [];
    const selected = new Set<string>();
    if (!Array.isArray(value.selections)) result.skippedBagRows++;
    else for (const row of value.selections) {
        if (!isBagRecord(row) || !isBagId(row.recipeUuid)
            || (row.bagId !== null && !isBagId(row.bagId))
            || typeof row.selectedAt !== "number" || !Number.isFinite(row.selectedAt)
            || row.selectedAt < 0 || selected.has(row.recipeUuid)
            || (row.bagId !== null
                && !bags.get(row.bagId)?.linkedRecipeUuids.includes(row.recipeUuid))) {
            result.skippedBagRows++;
            continue;
        }
        selected.add(row.recipeUuid);
        selections.push({recipeUuid: row.recipeUuid, bagId: row.bagId, selectedAt: row.selectedAt});
    }
    if (result.skippedBags > 0) {
        result.warnings.push("Some bags could not be read and were skipped.");
    }
    if (result.skippedBagRows > 0) {
        result.warnings.push("Some bag links, choices or accounting could not be read. Check affected quantities.");
    }
    result.inventory = {version: 2, bags: [...bags.values()], selections};
    return result;
}
