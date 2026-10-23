import {
    BAG_BEAN_NAME_MAX, BAG_GRAMS, BAG_NAME_MAX, isBagId, isBagRecord,
    type BagBalance, type BagTracker
} from "@/library/coffeeBag";
import type {BagFactsStore} from "@/library/CoffeeBagDatabase";
import type {BrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";

export type BagRunSnapshot = Readonly<{
    runId: string;
    bagId: string;
    bagName: string;
    recipeUuid: string;
    dose: number;
    tracker: BagTracker;
    acceptedAt: number;
    beanName?: string;
}>;

export type BagRunProgress = {
    consumption: "pending" | "used" | "unused" | "uncertain";
    possible: boolean;
    closed: boolean;
};

export type BagRunEvent =
    "sending" | "grinding" | "pouring" | "refused" |
    "ended" | "recovered" | "retryBeforeSend";

export const INITIAL_BAG_PROGRESS: BagRunProgress = {
    consumption: "pending", possible: false, closed: false
};

export interface BagAccountingStore {
    beginRun(snapshot: BagRunSnapshot): BagRunProgress;
    updateRun(runId: string, progress: BagRunProgress): void;
    balance(bagId: string, dose: number, tracker: BagTracker): BagBalance;
    correct(bagId: string, grams: number): void;
    markAllNeedsCheck(): void;
    recoverPending(): void;
}

export function nextBagProgress(
    current: BagRunProgress, event: BagRunEvent
): BagRunProgress {
    if (event === "retryBeforeSend") {
        return current.closed && current.consumption === "unused"
            ? {...INITIAL_BAG_PROGRESS} : current;
    }
    if (current.closed) return current;
    if (event === "refused") {
        return current.consumption === "used" ? {...current, closed: true}
            : {consumption: "unused", possible: false, closed: true};
    }
    if (event === "pouring") {
        return {consumption: "used", possible: true, closed: false};
    }
    if (event === "sending" || event === "grinding") {
        return {
            ...current, possible: true,
            consumption: current.consumption === "used" ? "used" : "uncertain"
        };
    }
    if (event === "recovered") {
        return current.consumption === "used" ? {...current, closed: true}
            : {consumption: "uncertain", possible: true, closed: true};
    }
    return {
        ...current, closed: true,
        consumption: current.consumption === "used" ? "used"
            : current.possible ? "uncertain" : "unused"
    };
}

export function reviveBagRunSnapshot(value: unknown): BagRunSnapshot | null {
    if (!isBagRecord(value)) return null;
    const {runId, bagId, recipeUuid, bagName, dose, tracker, acceptedAt, beanName} = value;
    if (!isBagId(runId) || !isBagId(bagId) || !isBagId(recipeUuid)
        || typeof bagName !== "string" || !bagName.trim()
        || bagName.length > BAG_NAME_MAX
        || typeof dose !== "number" || !Number.isFinite(dose)
        || dose <= 0 || dose > BAG_GRAMS.max
        || (tracker !== "xbrw" && tracker !== "beanconqueror")
        || typeof acceptedAt !== "number" || !Number.isFinite(acceptedAt)
        || acceptedAt < 0) return null;
    if (beanName !== undefined && (
        typeof beanName !== "string" || !beanName.trim()
        || beanName.length > BAG_BEAN_NAME_MAX
    )) return null;
    return {
        runId, bagId, recipeUuid, bagName, dose, tracker, acceptedAt,
        ...(typeof beanName === "string" ? {beanName} : {})
    };
}

export function reviveBagRunProgress(value: unknown): BagRunProgress | null {
    if (!isBagRecord(value)) return null;
    const {consumption, possible, closed} = value;
    if ((consumption !== "pending" && consumption !== "used"
        && consumption !== "unused" && consumption !== "uncertain")
        || typeof possible !== "boolean" || typeof closed !== "boolean") return null;
    if ((consumption === "used" || consumption === "uncertain") && !possible) return null;
    if (consumption === "pending" && closed) return null;
    if (consumption === "unused" && (possible || !closed)) return null;
    return {consumption, possible, closed};
}

export type BagRunRequest =
    | {kind: "saved"}
    | {kind: "explicit"; bagId: string | null}
    | {kind: "invalid"; reason: string};

export function parseBagRunRequest(raw: string | undefined): BagRunRequest {
    if (raw === undefined) return {kind: "saved"};
    if (raw.length > 650) return {kind: "invalid", reason: "Invalid bag selection."};
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { return {kind: "invalid", reason: "Invalid bag selection."}; }
    if (value === null || isBagId(value)) return {kind: "explicit", bagId: value};
    return {kind: "invalid", reason: "Invalid bag selection."};
}

export function bagRunParam(bagId: string | null): string { return JSON.stringify(bagId); }

export type BagCapture =
    | {kind: "untracked"}
    | {kind: "tracked"; snapshot: BagRunSnapshot}
    | {kind: "unavailable"; message: string};

export function bagEligible(recipe: Recipe): boolean {
    return !recipe.isTea() && Number.isFinite(recipe.dosage)
        && recipe.dosage > 0 && recipe.pours.length > 0;
}

export function captureBagRun(
    recipe: Recipe, request: BagRunRequest,
    options: {
        enabled: boolean;
        tracker: BagTracker;
        acceptedAt: number;
        runId: string;
        store: () => Pick<BagFactsStore, "get" | "linked" | "selection">
            & Partial<Pick<BagFactsStore, "select">>;
    }
): BagCapture {
    if (!options.enabled || !bagEligible(recipe)) return {kind: "untracked"};
    if (request.kind === "invalid") return {kind: "unavailable", message: request.reason};
    if (request.kind === "explicit" && request.bagId === null) return {kind: "untracked"};
    try {
        const store = options.store();
        const bagId = request.kind === "explicit"
            ? request.bagId : store.selection(recipe.uuid)?.bagId;
        if (bagId == null) return {kind: "untracked"};
        const bag = store.get(bagId);
        if (bag === null || bag.finishedAt !== undefined
            || !store.linked(recipe.uuid).some(linked => linked.id === bagId)) {
            if (request.kind === "saved") store.select?.(recipe.uuid, null, options.acceptedAt);
            return {kind: "unavailable",
                message: "That bag is no longer available for this recipe. This brew is untracked."};
        }
        const snapshot = reviveBagRunSnapshot({
            runId: options.runId, bagId, bagName: bag.name, recipeUuid: recipe.uuid,
            dose: recipe.dosage, tracker: options.tracker, acceptedAt: options.acceptedAt,
            beanName: bag.beanName
        });
        return snapshot === null
            ? {kind: "unavailable", message: "Could not track this brew. Check remaining coffee afterwards."}
            : {kind: "tracked", snapshot};
    } catch (error) {
        console.warn("Could not capture the bag selection", error);
        return {kind: "unavailable",
            message: "Could not read the bag selection. This brew is untracked."};
    }
}

export function bagEventForPhase(phase: BrewPhase): BagRunEvent | null {
    if (phase.name === "paused") return bagEventForPhase(phase.was);
    switch (phase.name) {
        case "sending": return "sending";
        case "grinding": return "grinding";
        case "pouring": return "pouring";
        case "failed": return phase.reason === "blocked" ? "refused" : "ended";
        case "done":
        case "cancelled":
        case "lostContact": return "ended";
        default: return null;
    }
}
