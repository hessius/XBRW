import uuid from "react-native-uuid";
import type {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    lastTeaProbeOutcome, prepareSet, TEA_PROBE_RESTORED_NOTICE,
    type SlotExperiment, type SlotJournal, type SlotObservation, type SlotRecord
} from "@/library/slots/slotModel";
import {teaProbeCandidateSet, teaProbeOriginal} from "@/library/slots/teaSlotCandidate";
import {
    writePreparedSlots, type SlotIdentity, type SlotPort
} from "@/library/slots/slotWriter";

export {TEA_SLOT_PROBE_ID} from "@/library/slots/teaSlotCandidate";

export type TeaProbeOptions = {
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
        if (record.experiment?.phase === "restored") throw new Error(TEA_PROBE_RESTORED_NOTICE);
        if (record.experiment !== undefined) {
            throw new Error("A tea slot probe is already in progress. Restore the original set first.");
        }
        return journalFor(id, serial, teaProbeCandidateSet(teaProbeOriginal(record).slots));
    };
    await writePreparedSlots(store, {deviceId, serial}, port, prepare,
        (next) => store.beginProbe(deviceId, next, id, options.machine ?? {}, now()), now,
        {requireKnownNormal: true});
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

/** Plain text for copying locally; the evidence itself stays in the database. */
export function formatTeaProbeEvidence(experiment: SlotExperiment): string {
    return JSON.stringify({
        candidateId: experiment.candidateId,
        trialId: experiment.trialId,
        deviceId: experiment.deviceId,
        serial: experiment.serial,
        machine: experiment.machine,
        phase: experiment.phase,
        original: {source: experiment.original.source, writtenAt: experiment.original.writtenAt},
        observation: experiment.observation,
        evidence: experiment.evidence
    }, null, 2);
}
