import {useRef, useState, useSyncExternalStore} from "react";
import {appDatabase} from "@/library/appDatabase";
import Recipe from "@/library/Recipe";
import {pushPrepared} from "@/hooks/steadyRouter";
import {notify} from "@/components/XbrwToast";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    emptySlotRecord, readSlotRecipe, snapshotRecipe, type SlotIndex, type SlotObservation, type SlotRecord
} from "@/library/slots/slotModel";
import {
    cancelSlots, dismissSlots, recoverSlots, writeSlots, unavailableSlotPort, type SlotIdentity, type SlotPort
} from "@/library/slots/slotWriter";
import {
    restoreTeaSlotOriginal, writeTeaSlotProbe, sendSlotRecoveryProbe, clearSlotRecoveryProbe, type TeaProbeOptions
} from "@/library/slots/teaSlotProbe";
import {SLOT_RECOVERY_PROBE_ID} from "@/library/slots/teaSlotCandidate";

const databases = new WeakMap<object, SlotDatabase>();
const unpaired = emptySlotRecord();

export type SlotOperation = "write" | "recover" | "cancel" | "dismiss" | "probe" | "restore"
    | "lab-partial" | "lab-recovery" | "lab-clear";
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
    if (record.journal !== null || record.experiment?.phase === "active") return {pathname: "/easyMode"};
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

    async function run(
        operation: SlotOperation, restart = false, probeOptions: TeaProbeOptions = {}
    ): Promise<void> {
        if (active.current) return;
        active.current = true;
        const target = Object.freeze({...identity});
        const attempting: SlotAttempt = {
            ...target, operation, status: operation === "cancel" || operation === "dismiss" ? "cancelling" : "writing"
        };
        setReading(attempting);
        setFailure(null);
        try {
            const store = supplied ?? sharedSlotDatabase();
            if (operation === "cancel") await cancelSlots(store, target, port);
            else if (operation === "dismiss") await dismissSlots(store, target, port);
            else if (operation === "lab-clear") await clearSlotRecoveryProbe(store, target, port);
            else if (operation === "lab-recovery") await sendSlotRecoveryProbe(store, target, port);
            else if (operation === "lab-partial") await writeTeaSlotProbe(store, target, port, probeOptions);
            else if (operation === "probe") await writeTeaSlotProbe(store, target, port, probeOptions);
            else if (operation === "restore") await restoreTeaSlotOriginal(store, target, port, probeOptions);
            else if (operation === "recover") {
                await recoverSlots(store, target, port, {restart, finishUncertain: !restart});
            } else await writeSlots(store, target, port);
            setReading({...attempting, status: operation === "cancel" || operation === "dismiss" ? "cancelled" : "success"});
        } catch (failure) {
            setFailure({...target, message: failure instanceof Error ? failure.message : String(failure)});
            setReading({...attempting, status: "error"});
        }
        active.current = false;
    }

    function observeTeaProbe(trialId: string, observation: SlotObservation, slot?: SlotIndex): boolean {
        if (active.current) {
            report("Wait for the current slot operation to finish.");
            return false;
        }
        try {
            const store = supplied ?? sharedSlotDatabase();
            const experiment = store.read(identity.deviceId).experiment;
            if (experiment === undefined || experiment.trialId !== trialId
                || (identity.serial !== null && identity.serial !== experiment.serial)) {
                throw new Error("This observation belongs to a different machine or trial.");
            }
            if (slot === undefined) store.observe(identity.deviceId, observation);
            else store.observeSlot(identity.deviceId, slot, observation);
            setFailure(null);
            return true;
        } catch (failure) {
            report(failure);
            return false;
        }
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
        running, available: port.available, assign, observeTeaProbe,
        write: () => run("write"), recover: (restart = false) => run("recover", restart),
        cancel: () => run("cancel"),
        dismissWrite: () => run("dismiss"),
        writeTeaProbe: (options: TeaProbeOptions = {}) => run("probe", false, options),
        writeSlotLab: (candidateId: string, options: TeaProbeOptions = {}) =>
            run(candidateId === SLOT_RECOVERY_PROBE_ID ? "lab-partial" : "probe",
                false, {...options, candidateId}),
        sendRecoveryProbe: () => run("lab-recovery"),
        clearRecoveryProbe: () => run("lab-clear"),
        restoreTeaOriginal: (options: TeaProbeOptions = {}) => run("restore", false, options)
    };
}
