import {useRef, useState, useSyncExternalStore} from "react";
import {appDatabase} from "@/library/appDatabase";
import Recipe from "@/library/Recipe";
import {pushPrepared} from "@/hooks/steadyRouter";
import {notify} from "@/components/XbrwToast";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    emptySlotRecord, readSlotRecipe, snapshotRecipe, type SlotIndex, type SlotRecord
} from "@/library/slots/slotModel";
import {
    cancelSlots, recoverSlots, writeSlots, unavailableSlotPort, type SlotIdentity, type SlotPort
} from "@/library/slots/slotWriter";

const databases = new WeakMap<object, SlotDatabase>();
const unpaired = emptySlotRecord();

export type SlotOperation = "write" | "recover" | "cancel";
export type SlotAttempt = SlotIdentity & {
    operation: SlotOperation;
    status: "writing" | "saving" | "cancelling" | "success" | "cancelled" | "error";
};

export function sharedSlotDatabase(): SlotDatabase {
    const sql = appDatabase();
    let store = databases.get(sql);
    if (store === undefined) {
        store = new SlotDatabase(sql);
        databases.set(sql, store);
    }
    return store;
}

export function useSlotRecord(deviceId: string, supplied?: SlotDatabase): SlotRecord {
    return useSyncExternalStore(
        (listener) => deviceId === "" ? () => {} : (supplied ?? sharedSlotDatabase()).subscribe(listener),
        () => deviceId === "" ? unpaired : (supplied ?? sharedSlotDatabase()).read(deviceId)
    );
}

export function prepareEasyModeEntry(
    store: SlotDatabase, deviceId: string, recipe: Recipe
): {pathname: "/easyMode"; params?: {recipeJSON: string}} {
    const record = store.read(deviceId);
    if (record.journal !== null) return {pathname: "/easyMode"};
    const snapshot = snapshotRecipe(recipe);
    const empty = record.drafts.findIndex((slot) => slot === null);
    if (deviceId !== "" && record.journal === null && (empty === 0 || empty === 1 || empty === 2)) {
        store.assign(deviceId, empty, snapshot);
        return {pathname: "/easyMode"};
    }
    return {pathname: "/easyMode", params: {recipeJSON: snapshot.recipeJSON}};
}

export function openEasyModeRecipe(recipe: Recipe, deviceId: string): void {
    try {
        pushPrepared(JSON.stringify(["easyMode", deviceId, recipe.uuid]),
            () => prepareEasyModeEntry(sharedSlotDatabase(), deviceId, recipe));
    } catch (error) {
        notify({tone: "error", message: error instanceof Error ? error.message : String(error)});
    }
}

export function incomingEasyModeRecipe(value: string | string[] | undefined): {
    recipe?: Recipe; error: string | null;
} {
    if (value === undefined) return {error: null};
    try {
        if (typeof value !== "string") throw new Error("Supply one recipe.");
        const recipe = readSlotRecipe(value);
        return {recipe, error: null};
    } catch (error) {
        return {error: `Incoming recipe could not be opened: ${
            error instanceof Error ? error.message : String(error)
        }`};
    }
}

export function useEasyModeSlots(
    identity: SlotIdentity, port: SlotPort = unavailableSlotPort, supplied?: SlotDatabase
) {
    const record = useSlotRecord(identity.deviceId, supplied);
    const [failure, setFailure] = useState<(SlotIdentity & {message: string}) | null>(null);
    const [reading, setReading] = useState<SlotAttempt | null>(null);
    const active = useRef(false);

    function report(failure: unknown): void {
        setFailure({
            deviceId: identity.deviceId,
            serial: identity.serial,
            message: failure instanceof Error ? failure.message : String(failure)
        });
    }

    function assign(index: SlotIndex, recipe: Recipe): boolean {
        if (active.current) {
            report("Wait for the current slot operation to finish.");
            return false;
        }
        try {
            (supplied ?? sharedSlotDatabase()).assign(identity.deviceId, index, snapshotRecipe(recipe));
            setFailure(null);
            setReading(null);
            return true;
        } catch (failure) {
            report(failure);
            return false;
        }
    }

    async function run(operation: SlotOperation, restart = false): Promise<void> {
        if (active.current) return;
        active.current = true;
        const target = Object.freeze({...identity});
        const attempting: SlotAttempt = {
            ...target, operation, status: operation === "cancel" ? "cancelling" : "writing"
        };
        setReading(attempting);
        setFailure(null);
        try {
            const store = supplied ?? sharedSlotDatabase();
            if (operation === "cancel") await cancelSlots(store, target, port);
            else if (operation === "recover") {
                await recoverSlots(store, target, port, {restart, finishUncertain: !restart});
            } else await writeSlots(store, target, port);
            setReading({...attempting, status: operation === "cancel" ? "cancelled" : "success"});
        } catch (failure) {
            setFailure({...target, message: failure instanceof Error ? failure.message : String(failure)});
            setReading({...attempting, status: "error"});
        }
        active.current = false;
    }

    const belongs = (value: SlotIdentity | null) => value !== null
        && value.deviceId === identity.deviceId && value.serial === identity.serial;
    const current = belongs(reading) ? reading : null;
    const running = current !== null
        && ["writing", "saving", "cancelling"].includes(current.status);
    const attempt = current?.status === "writing" && record.journal?.acknowledged === 3
        ? {...current, status: "saving" as const} : current;

    return {
        record, error: belongs(failure) ? failure!.message : null,
        operation: attempt?.operation ?? null, attempt,
        /** Event-only reset; never hide a running attempt or its lock. */
        resetAttempt: () => { if (!active.current) { setReading(null); setFailure(null); } },
        running, available: port.available, assign,
        write: () => run("write"), recover: (restart = false) => run("recover", restart),
        cancel: () => run("cancel")
    };
}
