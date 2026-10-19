import uuid from "react-native-uuid";
import type {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    lastTeaProbeOutcome, prepareSet, TEA_PROBE_RESTORED_NOTICE,
    type SlotExperiment, type SlotIndex, type SlotJournal, type SlotObservation, type SlotRecord
} from "@/library/slots/slotModel";
import {
    nextTeaProbeCandidate, teaProbeCandidateSet, teaProbeOriginal, checkSlotLabAvailable,
    SLOT_RECOVERY_PROBE_ID
} from "@/library/slots/teaSlotCandidate";
import {
    writePreparedSlots, type SlotIdentity, type SlotPort
} from "@/library/slots/slotWriter";

export {
    TEA_SLOT_MATRIX_ID, TEA_SLOT_PROBE_ID, TEA_SLOT_PROBE_V2_ID, nextTeaProbeCandidate, teaProbeFlags
} from "@/library/slots/teaSlotCandidate";

export type TeaProbeOptions = {
    /** Only exact source-backed labs may be selected outside the historical sequence. */
    candidateId?: string;
    id?: () => string;
    now?: () => number;
    /** Model, firmware and the like, supplied by the caller for the evidence copy. */
    machine?: Record<string, string>;
};

export type TeaProbeStatus = "none" | "pending-candidate" | "candidate-written"
    | "candidate-unconfirmed" | "pending-restore" | "restored";

export function teaProbeStatus(record: SlotRecord): TeaProbeStatus {
    const experiment = record.experiment;
    if (experiment === undefined) return "none";
    if (experiment.pending !== null) {
        return experiment.pending.kind === "candidate" ? "pending-candidate" : "pending-restore";
    }
    const terminal = lastTeaProbeOutcome(experiment);
    if (experiment.phase === "restored" && terminal?.kind === "restored") return "restored";
    return terminal?.kind === "final" ? "candidate-written" : "candidate-unconfirmed";
}

function bound(identity: SlotIdentity): {deviceId: string; serial: string} {
    if (identity.deviceId.trim() === "") throw new Error("Choose a machine before writing slots.");
    if (identity.serial === null || identity.serial.trim() === "") {
        throw new Error("The tea slot probe needs the machine's reported serial.");
    }
    return {deviceId: identity.deviceId, serial: identity.serial};
}

function journalFor(
    id: string, serial: string, slots: SlotJournal["slots"]
): SlotJournal {
    return {id, serial, slots, frames: prepareSet(slots), acknowledged: 0, inFlight: null, error: null};
}

/** Preserves the original set, then writes the fixed probe through the normal writer. */
export async function writeTeaSlotProbe(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort, options: TeaProbeOptions = {}
): Promise<void> {
    const {deviceId, serial} = bound(identity);
    const id = options.id?.() ?? String(uuid.v4());
    const now = options.now ?? Date.now;
    const prepare = () => {
        const record = store.read(deviceId);
        if (record.journal !== null) throw new Error("Finish the incomplete write first.");
        const candidateId = options.candidateId === undefined ? nextTeaProbeCandidate(record)
            : checkSlotLabAvailable(record, options.candidateId);
        if (candidateId === null) {
            if (record.experiment?.phase === "restored") throw new Error(TEA_PROBE_RESTORED_NOTICE);
            throw new Error("A tea slot probe is already in progress. Restore the original set first.");
        }
        if (record.experiment !== undefined && record.experiment.serial !== serial) {
            throw new Error("The preserved set belongs to a different machine. Its serial must match.");
        }
        return journalFor(id, serial, teaProbeCandidateSet(teaProbeOriginal(record).slots, candidateId));
    };
    await writePreparedSlots(store, {deviceId, serial}, port, prepare,
        (next) => store.beginProbe(deviceId, next, id, options.machine ?? {}, now(), options.candidateId), now,
        {requireKnownNormal: true, partialLab: options.candidateId === SLOT_RECOVERY_PROBE_ID});
}

export async function sendSlotRecoveryProbe(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort
): Promise<void> {
    const target = bound(identity);
    const record = store.read(target.deviceId);
    const journal = record.journal;
    if (record.experiment?.candidateId !== SLOT_RECOVERY_PROBE_ID
        || record.experiment.serial !== target.serial || record.experiment.pending?.kind !== "candidate"
        || journal === null || journal.serial !== target.serial
        || journal.acknowledged !== 1 || journal.inFlight !== null) {
        throw new Error("Command 40526 requires the recovery lab's confirmed A receipt, with no pending slot write.");
    }
    const lease = await port.acquire(target);
    try {
        lease.assertCurrent?.();
        lease.validateFrames?.(journal.frames);
        if (lease.sendRecoveryCommand === undefined) throw new Error("Recovery testing is unavailable on this transport.");
        store.recoveryEvidence(target.deviceId, journal.id, "recovery-dispatch", "Command 40526, Type 1, no payload.");
        try {
            const states = await lease.sendRecoveryCommand();
            lease.assertCurrent?.();
            store.recoveryEvidence(target.deviceId, journal.id, "recovery-receipt",
                `Command receipt only. Check the machine manually; no rollback or restored contents are implied.${
                    states === undefined ? "" : ` Observed states: ${JSON.stringify(states)}.`}`);
        } catch (error) {
            store.recoveryEvidence(target.deviceId, journal.id, "recovery-error",
                error instanceof Error ? error.message : String(error));
            throw error;
        }
    } finally {
        lease.release(false);
    }
}

/** User confirms physical operability; the lease must independently see a known normal state. */
export async function clearSlotRecoveryProbe(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort
): Promise<void> {
    const target = bound(identity);
    const record = store.read(target.deviceId);
    const journal = record.journal;
    if (record.experiment?.candidateId !== SLOT_RECOVERY_PROBE_ID
        || record.experiment.serial !== target.serial || record.experiment.pending?.kind !== "candidate"
        || journal === null || journal.serial !== target.serial
        || journal.acknowledged !== 1 || journal.inFlight !== null
        || record.experiment.evidence.at(-1)?.kind !== "recovery-receipt") {
        throw new Error("Confirm a recovery command receipt before clearing this lab write.");
    }
    const lease = await port.acquire(target, {restart: true, requireKnownNormal: true});
    let cleared = false;
    try {
        lease.assertCurrent?.();
        if (!lease.restartFromBeginning) throw new Error("The machine must be back to normal before clearing this write.");
        store.cancel(target.deviceId, journal.id);
        cleared = true;
    } finally {
        lease.release(cleared);
    }
}

/** Writes the preserved original A/B/C back through the same writer; refused while anything is pending. */
export async function restoreTeaSlotOriginal(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort, options: TeaProbeOptions = {}
): Promise<void> {
    const {deviceId, serial} = bound(identity);
    const record = store.read(deviceId);
    const experiment = record.experiment;
    if (record.journal !== null) throw new Error("Finish the incomplete write before restoring.");
    if (experiment === undefined || experiment.phase !== "active") {
        throw new Error("There is no tea slot probe set to restore.");
    }
    if (experiment.serial !== serial) {
        throw new Error("The preserved set belongs to a different machine. Its serial must match.");
    }
    const now = options.now ?? Date.now;
    const journal = journalFor(options.id?.() ?? String(uuid.v4()), serial, experiment.original.slots);
    await writePreparedSlots(store, {deviceId, serial}, port, journal,
        (next) => store.beginRestore(deviceId, next, now()), now);
}

export function recordTeaProbeObservation(
    store: SlotDatabase, deviceId: string, observation: SlotObservation
): void {
    store.observe(deviceId, observation);
}

export function recordTeaSlotObservation(
    store: SlotDatabase, deviceId: string, index: SlotIndex, observation: SlotObservation
): void {
    store.observeSlot(deviceId, index, observation);
}

function evidenceCopy(experiment: SlotExperiment) {
    return {
        candidateId: experiment.candidateId,
        trialId: experiment.trialId,
        deviceId: experiment.deviceId,
        serial: experiment.serial,
        machine: experiment.machine,
        phase: experiment.phase,
        original: {source: experiment.original.source, writtenAt: experiment.original.writtenAt},
        observation: experiment.observation,
        ...(experiment.slotObservations === undefined ? {} : {slotObservations: experiment.slotObservations}),
        evidence: experiment.evidence
    };
}

/** Plain text for copying locally; full current and archived trials stay in the database. */
export function formatTeaProbeEvidence(
    experiment: SlotExperiment, history: readonly SlotExperiment[] = []
): string {
    return JSON.stringify({
        ...evidenceCopy(experiment),
        ...(history.length > 0 ? {archivedTrials: history.map(evidenceCopy)} : {})
    }, null, 2);
}
