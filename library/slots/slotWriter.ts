import uuid from "react-native-uuid";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    prepareSet, readSnapshot, type SlotIndex, type SlotJournal
} from "@/library/slots/slotModel";
import {SLOT_RECOVERY_PROBE_ID} from "@/library/slots/teaSlotCandidate";

export type SlotIdentity = {readonly deviceId: string; readonly serial: string | null};
export type SlotAcquireOptions = {
    restart?: boolean;
    /** Fresh hardware probes require a reported normal state, never an unknown one. */
    requireKnownNormal?: boolean;
    /** Deliberate immutable replay for hardware qualification; code-only ACKs remain ambiguous. */
    finishUncertain?: boolean;
};
export interface SlotPort {
    available: boolean;
    acquire(identity: SlotIdentity, options?: SlotAcquireOptions): Promise<SlotLease>;
}
export interface SlotLease {
    readonly restartFromBeginning?: boolean;
    validateFrames?(frames: readonly (readonly number[])[]): void;
    /** Production checks again at the synchronous durable mutation boundary. */
    assertCurrent?(): void;
    /** Resolves on an unambiguous machine receipt, never native write completion. */
    sendAndConfirm(frame: Uint8Array, index: SlotIndex): Promise<void>;
    /** Subscribe before A; require a fresh SLOTS_SAVED from this attempt. */
    confirmSaved(): Promise<void>;
    /** Command receipt alone never clears the durable journal. */
    sendRecoveryCommand?(): Promise<void | {stateBefore: number | null; stateAfter: number | null}>;
    isKnownNormal?(): boolean;
    /** Requires a normal-state observation after recovery dispatch, not just its receipt. */
    confirmRecovered?(): Promise<void>;
    /** False retains the machine owner's recovery reservation. */
    release(safeToRelease: boolean): void;
}

export class SlotCommandRefused extends Error {
    constructor() {
        super("The machine refused the Easy Mode write. Fill the tank if needed, then retry.");
        this.name = "SlotCommandRefused";
    }
}

export const SLOT_INTEGRATION_BLOCK =
    "Writing is unavailable until the shared machine transport and operation exclusion are integrated.";

export const unavailableSlotPort: SlotPort = {
    available: false,
    acquire: async () => { throw new Error(SLOT_INTEGRATION_BLOCK); }
};

type WriterOptions = SlotAcquireOptions & {id?: () => string; now?: () => number};

function checkPort(identity: SlotIdentity, port: SlotPort): void {
    if (identity.deviceId.trim() === "") throw new Error("Choose a machine before writing slots.");
    if (!port.available) throw new Error(SLOT_INTEGRATION_BLOCK);
}

function matchingSerial(journal: SlotJournal, identity: SlotIdentity): void {
    if (journal.serial !== null && journal.serial !== identity.serial) {
        throw new Error("This write belongs to a different machine. Its serial must match.");
    }
}

async function transmit(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort,
    prepared: SlotJournal | (() => SlotJournal), isNew: boolean, now: () => number,
    restart = false, finishUncertain = false,
    begin?: (journal: SlotJournal) => void, requireKnownNormal = false, partialLab = false
): Promise<void> {
    const target = Object.freeze({...identity});
    const lease = await port.acquire(target, {
        restart, ...(finishUncertain ? {finishUncertain: true} : {}),
        ...(requireKnownNormal ? {requireKnownNormal: true} : {})
    });
    let journal = typeof prepared === "function" ? undefined : prepared;
    let begun = !isNew;
    let completed = false;
    try {
        lease.assertCurrent?.();
        journal = typeof prepared === "function" ? prepared() : prepared;
        lease.validateFrames?.(journal.frames);
        if (isNew) {
            if (begin !== undefined) begin(journal);
            else store.begin(target.deviceId, journal);
            begun = true;
        } else if (lease.restartFromBeginning) {
            store.restart(target.deviceId, journal.id);
            journal = {...journal, acknowledged: 0, inFlight: null, error: null};
        } else if (restart || (!finishUncertain && (journal.inFlight !== null || journal.acknowledged === 3))) {
            throw new Error("Confirm the machine is back to normal before retrying all three slots.");
        }
        if (partialLab && (!isNew || journal.acknowledged !== 0
            || store.read(target.deviceId).experiment?.candidateId !== SLOT_RECOVERY_PROBE_ID)) {
            throw new Error("A single-slot write is allowed only for the fixed recovery lab.");
        }
        for (const index of [0, 1, 2] as const) {
            if (index < journal.acknowledged) continue;
            lease.assertCurrent?.();
            if (finishUncertain && journal.inFlight === index) {
                // Recommit the exact dispatch boundary under the lease without erasing uncertainty.
                store.fail(target.deviceId, journal.id, "Retrying the unconfirmed slot.");
            } else {
                store.dispatching(target.deviceId, journal.id, index);
            }
            try {
                await lease.sendAndConfirm(Uint8Array.from(journal.frames[index]), index);
            } catch (error) {
                if (error instanceof SlotCommandRefused) store.reject(target.deviceId, journal.id, index);
                throw error;
            }
            lease.assertCurrent?.();
            store.acknowledge(target.deviceId, journal.id, index);
            if (partialLab) {
                store.recoveryEvidence(target.deviceId, journal.id, "partial");
                return;
            }
        }
        await lease.confirmSaved();
        lease.assertCurrent?.();
        store.complete(target.deviceId, journal.id, now());
        completed = true;
    } catch (error) {
        if (begun && journal !== undefined) {
            const message = error instanceof Error ? error.message : String(error);
            try {
                store.fail(target.deviceId, journal.id, message);
            } catch (storageError) {
                throw new Error(`Could not persist the incomplete Easy Mode write: ${
                    storageError instanceof Error ? storageError.message : String(storageError)
                }. Original failure: ${message}`);
            }
        }
        throw error;
    } finally {
        lease.release(!begun || completed);
    }
}

export async function writeSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort,
    options: WriterOptions = {}
): Promise<void> {
    checkPort(identity, port);
    const record = store.read(identity.deviceId);
    if (record.journal !== null) throw new Error("Finish the incomplete write before starting another.");
    const frames = prepareSet(record.drafts);
    const slots: SlotJournal["slots"] = [
        readSnapshot(record.drafts[0]), readSnapshot(record.drafts[1]), readSnapshot(record.drafts[2])
    ];
    const journal: SlotJournal = {
        id: options.id?.() ?? String(uuid.v4()),
        serial: identity.serial, slots, frames,
        acknowledged: 0, inFlight: null, error: null
    };
    await transmit(store, identity, port, journal, true, options.now ?? Date.now);
}

/** Prepares under the shared lease, then begins with the caller's atomic commit. */
export async function writePreparedSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort,
    journal: SlotJournal | (() => SlotJournal),
    begin: (journal: SlotJournal) => void, now: () => number = Date.now,
    options: Pick<SlotAcquireOptions, "requireKnownNormal"> & {partialLab?: boolean} = {}
): Promise<void> {
    checkPort(identity, port);
    await transmit(store, identity, port, journal, true, now, false, false, begin,
        options.requireKnownNormal, options.partialLab);
}

export async function recoverSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort,
    options: WriterOptions = {}
): Promise<void> {
    const journal = store.read(identity.deviceId).journal;
    if (journal === null) throw new Error("There is no incomplete Easy Mode write.");
    matchingSerial(journal, identity);
    if (!options.restart && !options.finishUncertain && journal.inFlight !== null) {
        throw new Error("A slot's receipt is unknown. Confirm the machine is back to normal before retrying.");
    }
    if (!options.restart && !options.finishUncertain && journal.acknowledged === 3) {
        throw new Error("Save completion is not confirmed. Confirm the machine is back to normal before retrying.");
    }
    checkPort(identity, port);
    await transmit(store, identity, port, journal, false, options.now ?? Date.now,
        options.restart, options.finishUncertain);
}

/** Caller must first ask the user to confirm the machine is no longer saving. */
export async function cancelSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort
): Promise<void> {
    checkPort(identity, port);
    const target = Object.freeze({...identity});
    const journal = store.read(target.deviceId).journal;
    if (journal === null) throw new Error("There is no incomplete Easy Mode write.");
    matchingSerial(journal, target);
    const lease = await port.acquire(target, {restart: true});
    let cancelled = false;
    try {
        lease.assertCurrent?.();
        if (!lease.restartFromBeginning) {
            throw new Error("Confirm the machine is back to normal before cancelling.");
        }

        store.cancel(target.deviceId, journal.id);
        cancelled = true;
    } finally {
        lease.release(cancelled);
    }
}

/** Stops incomplete saving without claiming the set was stored or rolled back. */
export async function dismissSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort
): Promise<void> {
    checkPort(identity, port);
    const target = Object.freeze({...identity});
    const journal = store.read(target.deviceId).journal;
    if (journal === null) throw new Error("There is no incomplete Easy Mode write.");
    matchingSerial(journal, target);
    const lease = await port.acquire(target, {finishUncertain: true});
    let dismissed = false;
    try {
        lease.assertCurrent?.();
        lease.validateFrames?.(journal.frames);
        if (lease.isKnownNormal === undefined) throw new Error("Slot recovery is unavailable on this transport.");
        if (!lease.isKnownNormal()) {
            if (lease.sendRecoveryCommand === undefined || lease.confirmRecovered === undefined) {
                throw new Error("Slot recovery is unavailable on this transport.");
            }
            await lease.sendRecoveryCommand();
            await lease.confirmRecovered();
        }
        lease.assertCurrent?.();
        if (!lease.isKnownNormal()) throw new Error("The machine has not returned to normal. Retry or wait for its saving screen to clear.");
        store.cancel(target.deviceId, journal.id);
        dismissed = true;
    } catch (error) {
        store.fail(target.deviceId, journal.id, error instanceof Error ? error.message : String(error));
        throw error;
    } finally {
        lease.release(dismissed);
    }
}
