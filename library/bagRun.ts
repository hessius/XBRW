import {
    BAG_BEAN_NAME_MAX, BAG_GRAMS, BAG_NAME_MAX, isBagId, isBagRecord,
    type BagBalance, type BagTracker
} from "@/library/coffeeBag";

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
