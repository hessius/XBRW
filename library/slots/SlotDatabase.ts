import {appDatabase} from "@/library/appDatabase";
import {
    emptySlotRecord, lastTeaProbeOutcome, objectValue, prepareSet, readSnapshot, sameBytes,
    TEA_PROBE_RESTORED_NOTICE,
    type EvidenceKind, type SlotEvidence, type SlotExperiment, type SlotIndex, type SlotJournal,
    type SlotObservation, type SlotRecord, type SlotSnapshot, type Triple
} from "@/library/slots/slotModel";
import {
    checkTeaExperimentId, isTeaProbeSnapshot, nextTeaProbeCandidate, sameSnapshotSet,
    teaProbeCandidateSet, teaProbeOriginal, TEA_SLOT_MATRIX_ID, TEA_SLOT_PROBE_ID, TEA_SLOT_PROBE_V2_ID,
    checkSlotLabAvailable, hasSlotObservations, SLOT_LAB_IDS, SLOT_RECOVERY_PROBE_ID
} from "@/library/slots/teaSlotCandidate";

type SlotSQL = {
    execSync: (sql: string) => void;
    runSync: (sql: string, params: string[]) => unknown;
    getFirstSync: (sql: string, params: string[]) => unknown;
    withTransactionSync: (task: () => void) => void;
};

function triple<T>(value: unknown, read: (item: unknown) => T): Triple<T> {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error("Easy Mode storage must contain exactly three slots.");
    }
    return [read(value[0]), read(value[1]), read(value[2])];
}

function samePreservedSet(left: Triple<SlotSnapshot | null>, right: Triple<SlotSnapshot | null>): boolean {
    return sameSnapshotSet(left, right) && left.every((slot, index) =>
        (slot?.scaleEnabled === true) === (right[index]?.scaleEnabled === true));
}

function readJournal(value: unknown): SlotJournal | null {
    if (value === null) return null;
    if (!objectValue(value) || typeof value.id !== "string" || value.id === ""
        || (value.serial !== null && typeof value.serial !== "string")
        || typeof value.acknowledged !== "number" || !Number.isInteger(value.acknowledged)
        || value.acknowledged < 0 || value.acknowledged > 3
        || (value.inFlight !== null
            && (value.inFlight !== value.acknowledged || value.acknowledged === 3))
        || (value.error !== null && typeof value.error !== "string")) {
        throw new Error("The Easy Mode recovery journal is invalid.");
    }
    const slots = triple(value.slots, readSnapshot);
    const frames = prepareSet(slots);
    const saved = triple(value.frames, (bytes) => {
        if (!Array.isArray(bytes) || !bytes.every((byte: unknown) =>
            typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            throw new Error("The Easy Mode recovery frame is invalid.");
        }
        return bytes;
    });
    if (!frames.every((frame, index) => sameBytes(frame, saved[index]))) {
        throw new Error("The Easy Mode recovery frames disagree with their snapshots.");
    }
    const inFlight = value.inFlight;
    if (inFlight !== null && inFlight !== 0 && inFlight !== 1 && inFlight !== 2) {
        throw new Error("The Easy Mode receipt boundary is invalid.");
    }
    return {
        id: value.id, serial: value.serial, slots, frames,
        acknowledged: value.acknowledged, inFlight, error: value.error
    };
}

const EVIDENCE_KINDS: readonly string[] = [
    "prepared", "dispatch", "receipt", "refused", "error", "restart", "final",
    "cancelled", "restore-prepared", "restored", "partial",
    "recovery-dispatch", "recovery-receipt", "recovery-error"
];

function readEvidence(value: unknown): SlotEvidence {
    if (!objectValue(value) || typeof value.at !== "number" || !Number.isFinite(value.at)
        || !EVIDENCE_KINDS.includes(value.kind as string) || typeof value.journalId !== "string"
        || (value.slot !== null && value.slot !== 0 && value.slot !== 1 && value.slot !== 2)
        || (value.detail !== null && typeof value.detail !== "string")) {
        throw new Error("The tea slot probe evidence is invalid.");
    }
    const frames = value.frames === null ? null : triple(value.frames, (bytes) => {
        if (!Array.isArray(bytes) || !bytes.every((byte: unknown) =>
            typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            throw new Error("The tea slot probe evidence frame is invalid.");
        }
        return bytes;
    });
    return {
        at: value.at, kind: value.kind as EvidenceKind, journalId: value.journalId,
        slot: value.slot, detail: value.detail, frames
    };
}

function readObservation(value: unknown): SlotObservation | null {
    if (value === null) return null;
    if (!objectValue(value) || typeof value.at !== "number" || !Number.isFinite(value.at)
        || typeof value.display !== "string" || typeof value.note !== "string"
        || (value.heldSeconds !== null && (typeof value.heldSeconds !== "number"
            || !Number.isFinite(value.heldSeconds) || value.heldSeconds < 0))
        || (value.drainedAsTea !== null && typeof value.drainedAsTea !== "boolean")) {
        throw new Error("The tea slot probe observation is invalid.");
    }
    return {
        at: value.at, display: value.display, heldSeconds: value.heldSeconds,
        drainedAsTea: value.drainedAsTea, note: value.note
    };
}

function readExperiment(value: unknown, deviceId: string, journal: SlotJournal | null): SlotExperiment {
    if (!objectValue(value) || typeof value.candidateId !== "string"
        || typeof value.trialId !== "string" || value.trialId === ""
        || value.deviceId !== deviceId || typeof value.serial !== "string" || value.serial.trim() === ""
        || !objectValue(value.machine)
        || !Object.values(value.machine).every((item) => typeof item === "string")
        || (value.phase !== "active" && value.phase !== "restored")
        || !Array.isArray(value.evidence) || !objectValue(value.original)
        || (value.original.source !== "written" && value.original.source !== "draft")
        || (value.original.writtenAt !== null && (typeof value.original.writtenAt !== "number"
            || !Number.isFinite(value.original.writtenAt)))
        || (value.original.source === "written") !== (value.original.writtenAt !== null)) {
        throw new Error("The tea slot probe record is invalid.");
    }
    checkTeaExperimentId(value.candidateId);
    const slots = triple(value.original.slots, readSnapshot);
    const originalDrafts = triple(value.originalDrafts, (slot) => slot === null ? null : readSnapshot(slot));
    const candidate = triple(value.candidate, readSnapshot);
    const evidence = value.evidence.map(readEvidence);
    if (slots.some(isTeaProbeSnapshot) || originalDrafts.some(isTeaProbeSnapshot)
        || !samePreservedSet(candidate, teaProbeCandidateSet(slots, value.candidateId))) {
        throw new Error("The tea slot probe sets are inconsistent.");
    }
    if (evidence[0]?.kind !== "prepared" || evidence[0].journalId !== value.trialId) {
        throw new Error("The tea slot probe trial identity disagrees with its preparation.");
    }
    for (const entry of evidence) {
        const expected = entry.kind === "prepared" ? candidate
            : entry.kind === "restore-prepared" ? slots : null;
        if (expected === null ? entry.frames !== null
            : entry.frames === null || !prepareSet(expected).every((frame, i) =>
                sameBytes(frame, entry.frames![i]))) {
            throw new Error("The tea slot probe evidence frames disagree with their snapshots.");
        }
    }
    let pending: SlotExperiment["pending"] = null;
    if (value.pending !== null) {
        if (!objectValue(value.pending) || typeof value.pending.journalId !== "string"
            || (value.pending.kind !== "candidate" && value.pending.kind !== "restore")) {
            throw new Error("The tea slot probe pending write is invalid.");
        }
        pending = {journalId: value.pending.journalId, kind: value.pending.kind};
    }
    if (value.phase === "restored") {
        const restored = lastTeaProbeOutcome({evidence});
        if (pending !== null || journal?.slots.some(isTeaProbeSnapshot)
            || restored?.kind !== "restored" || !evidence.some(entry =>
                entry.kind === "restore-prepared" && entry.journalId === restored.journalId)) {
            throw new Error("A restored tea slot probe requires confirmed restoration and no pending probe write.");
        }
    } else {
        // A pending marker and the journal are one fact; neither may exist alone.
        if ((pending === null) !== (journal === null)
            || (pending !== null && pending.journalId !== journal?.id)) {
            throw new Error("The tea slot probe pending write does not match the recovery journal.");
        }
        if (journal !== null) {
            const expected = pending?.kind === "candidate" ? candidate : slots;
            if (journal.serial !== value.serial || !samePreservedSet(journal.slots, expected)) {
                throw new Error("The tea slot probe journal is not the preserved set.");
            }
        }
    }
    let slotObservations: SlotExperiment["slotObservations"];
    if ((value.slotObservations !== undefined) !== hasSlotObservations(value.candidateId)) {
        throw new Error("Only the reference matrix keeps per-slot tea observations.");
    }
    if (value.slotObservations !== undefined) slotObservations = triple(value.slotObservations, readObservation);
    return {
        candidateId: value.candidateId, trialId: value.trialId, deviceId, serial: value.serial,
        machine: {...(value.machine as Record<string, string>)},
        original: {source: value.original.source, writtenAt: value.original.writtenAt, slots},
        originalDrafts, candidate, phase: value.phase, pending,
        observation: readObservation(value.observation),
        ...(slotObservations === undefined ? {} : {slotObservations}),
        evidence
    };
}

function readRecord(json: string, deviceId: string): SlotRecord {
    try {
        const value: unknown = JSON.parse(json);
        if (!objectValue(value) || value.version !== 1) {
            throw new Error("Unsupported Easy Mode record.");
        }
        const drafts = triple(value.drafts, (slot) => slot === null ? null : readSnapshot(slot));
        let written: SlotRecord["written"] = null;
        if (value.written !== null) {
            if (!objectValue(value.written) || typeof value.written.at !== "number"
                || !Number.isFinite(value.written.at) || value.written.at < 0) {
                throw new Error("Invalid last-written time.");
            }
            written = {at: value.written.at, slots: triple(value.written.slots, readSnapshot)};
        }
        if (drafts.some(isTeaProbeSnapshot)) throw new Error("Drafts cannot hold the tea slot probe.");
        const journal = readJournal(value.journal);
        const record: SlotRecord = {version: 1, drafts, written, journal};
        if (value.experiment !== undefined) {
            record.experiment = readExperiment(value.experiment, deviceId, journal);
        } else if (journal?.slots.some(isTeaProbeSnapshot) || written?.slots.some(isTeaProbeSnapshot)) {
            throw new Error("The tea slot probe has no experiment record.");
        }
        if (value.experimentHistory !== undefined) {
            if (!Array.isArray(value.experimentHistory) || value.experimentHistory.length > 4) {
                throw new Error("The tea slot probe history is invalid.");
            }
            record.experimentHistory = value.experimentHistory.map(item => {
                const historical = readExperiment(item, deviceId, null);
                if (historical.phase !== "restored" || historical.pending !== null) {
                    throw new Error("Only a confirmed restored tea slot probe may be archived.");
                }
                return historical;
            });
        }
        const history = record.experimentHistory ?? [];
        const current = record.experiment;
        if (written?.slots.some(isTeaProbeSnapshot)
            && (current?.phase !== "active" || !samePreservedSet(written.slots, current.candidate))) {
            throw new Error("The last-written tea slot probe does not match the active trial.");
        }
        if (current !== undefined && SLOT_LAB_IDS.some(id => id === current.candidateId)) {
            const trials = [...history, current];
            if (trials.some(item => item.serial !== current.serial)
                || new Set(trials.map(item => item.trialId)).size !== trials.length
                || new Set(trials.map(item => item.candidateId)).size !== trials.length) {
                throw new Error("The slot lab history has duplicate identities or a different machine serial.");
            }
            const legacy = trials.filter(item => !SLOT_LAB_IDS.some(id => id === item.candidateId));
            if (!legacy.every((item, index) =>
                item.candidateId === [TEA_SLOT_PROBE_ID, TEA_SLOT_PROBE_V2_ID, TEA_SLOT_MATRIX_ID][index])) {
                throw new Error("The historical tea probes are out of order.");
            }
        } else if (current?.candidateId === TEA_SLOT_PROBE_V2_ID) {
            if (history.length !== 1 || history[0].candidateId !== TEA_SLOT_PROBE_ID
                || history[0].serial !== current.serial || history[0].trialId === current.trialId) {
                throw new Error("The tea slot probe history is not the approved v1 to v2 sequence.");
            }
        } else if (current?.candidateId === TEA_SLOT_MATRIX_ID) {
            if (history.length !== 2 || history[0].candidateId !== TEA_SLOT_PROBE_ID
                || history[1].candidateId !== TEA_SLOT_PROBE_V2_ID
                || history.some(item => item.serial !== current.serial)
                || new Set([...history, current].map(item => item.trialId)).size !== 3) {
                throw new Error("The tea slot probe history is not the approved v1, v2, matrix sequence.");
            }
        } else if (history.length !== 0) {
            throw new Error("The tea slot probe history requires the approved second candidate.");
        }
        return record;
    } catch (error) {
        throw new Error(`Easy Mode storage could not be read: ${error instanceof Error
            ? error.message : String(error)}`);
    }
}

function freeze(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
}

export class SlotDatabase {
    private readonly records = new Map<string, SlotRecord>();
    private readonly listeners = new Set<() => void>();

    constructor(
        private readonly sql: SlotSQL = appDatabase(),
        private readonly now: () => number = Date.now
    ) {
        sql.execSync(`CREATE TABLE IF NOT EXISTS easy_mode_slots (
            deviceId TEXT PRIMARY KEY NOT NULL, recordJSON TEXT NOT NULL
        )`);
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private load(deviceId: string): SlotRecord {
        const row = this.sql.getFirstSync(
            "SELECT recordJSON FROM easy_mode_slots WHERE deviceId = ?", [deviceId]
        );
        if (row === null) return emptySlotRecord();
        if (!objectValue(row) || typeof row.recordJSON !== "string") {
            throw new Error("Easy Mode storage returned an invalid row.");
        }
        return readRecord(row.recordJSON, deviceId);
    }

    read(deviceId: string): SlotRecord {
        let record = this.records.get(deviceId);
        if (record === undefined) {
            record = this.load(deviceId);
            freeze(record);
            this.records.set(deviceId, record);
        }
        return record;
    }

    private change(deviceId: string, edit: (record: SlotRecord) => void): void {
        if (deviceId.trim() === "") throw new Error("Choose a machine before assigning slots.");
        let committed: SlotRecord | undefined;
        this.sql.withTransactionSync(() => {
            const record = this.load(deviceId);
            edit(record);
            const json = JSON.stringify(record);
            committed = readRecord(json, deviceId);
            this.sql.runSync(
                "INSERT OR REPLACE INTO easy_mode_slots (deviceId, recordJSON) VALUES (?, ?)",
                [deviceId, json]
            );
        });
        if (committed === undefined) throw new Error("Easy Mode storage did not commit.");
        freeze(committed);
        this.records.set(deviceId, committed);
        this.listeners.forEach((listener) => listener());
    }

    private evidence(
        record: SlotRecord, journalId: string, kind: EvidenceKind, at: number,
        slot: SlotIndex | null = null, detail: string | null = null, frames: Triple<number[]> | null = null
    ): void {
        if (record.experiment?.pending?.journalId !== journalId) return;
        record.experiment.evidence.push({at, kind, journalId, slot, detail, frames});
    }

    private activeExperiment(record: SlotRecord): boolean {
        return record.experiment !== undefined && record.experiment.phase === "active";
    }

    assign(deviceId: string, index: SlotIndex, snapshot: SlotSnapshot | null): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            if (this.activeExperiment(record)) {
                throw new Error("Restore the original set before changing slots.");
            }
            const checked = snapshot === null ? null : readSnapshot(snapshot);
            if (isTeaProbeSnapshot(checked)) throw new Error("The tea slot probe is not a draft.");
            if (checked !== null) {
                const scaleEnabled = record.drafts[index]?.scaleEnabled;
                delete checked.scaleEnabled;
                if (scaleEnabled !== undefined) checked.scaleEnabled = scaleEnabled;
            }
            record.drafts[index] = checked;
        });
    }

    setScaleEnabled(deviceId: string, index: SlotIndex, enabled: boolean): void {
        this.change(deviceId, record => {
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            if (this.activeExperiment(record)) {
                throw new Error("Restore the original set before changing slots.");
            }
            const snapshot = record.drafts[index];
            if (snapshot === null) throw new Error("Choose a recipe before changing its scale setting.");
            if (typeof enabled !== "boolean") throw new Error("The Easy Mode scale setting is invalid.");
            snapshot.scaleEnabled = enabled;
        });
    }

    begin(deviceId: string, journal: SlotJournal): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("An incomplete write already exists.");
            if (this.activeExperiment(record)) {
                throw new Error("Restore the original set before writing slots.");
            }
            if (journal.acknowledged !== 0 || journal.inFlight !== null) {
                throw new Error("A new write must begin before any receipt.");
            }
            const checked = readJournal(journal);
            if (checked === null || checked.slots.some(isTeaProbeSnapshot)) {
                throw new Error("Only a tea slot probe trial may write the probe.");
            }
            record.journal = checked;
        });
    }

    /**
     * Captures the originals, records the trial and begins the candidate journal
     * in one transaction, so neither can exist without the other.
     */
    beginProbe(
        deviceId: string, journal: SlotJournal, trialId: string, machine: Record<string, string>, at: number,
        selectedLab?: string
    ): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            const candidateId = selectedLab === undefined ? nextTeaProbeCandidate(record)
                : checkSlotLabAvailable(record, selectedLab);
            if (candidateId === null) {
                if (record.experiment?.phase === "restored") throw new Error(TEA_PROBE_RESTORED_NOTICE);
                throw new Error("A tea slot probe is already in progress. Restore the original set first.");
            }
            if (journal.serial === null || journal.serial.trim() === "") {
                throw new Error("The tea slot probe needs the machine's serial.");
            }
            if (record.experiment !== undefined && record.experiment.serial !== journal.serial) {
                throw new Error("The preserved set belongs to a different machine. Its serial must match.");
            }
            if (trialId === "" || trialId !== journal.id
                || [...(record.experimentHistory ?? []), ...(record.experiment ? [record.experiment] : [])]
                    .some(trial => trial.trialId === trialId)) {
                throw new Error("The tea slot probe needs a distinct trial matching its journal.");
            }
            if (journal.acknowledged !== 0 || journal.inFlight !== null) {
                throw new Error("A new write must begin before any receipt.");
            }
            const original = teaProbeOriginal(record);
            const candidate = teaProbeCandidateSet(original.slots, candidateId);
            if (!samePreservedSet(journal.slots, candidate)) {
                throw new Error("The tea slot probe is not built on the preserved original set.");
            }
            const checked = readJournal(journal);
            if (checked === null) throw new Error("The tea slot probe journal is missing.");
            if (record.experiment !== undefined) {
                record.experimentHistory = [...(record.experimentHistory ?? []), record.experiment];
            }
            record.journal = checked;
            record.experiment = {
                candidateId, trialId, deviceId, serial: journal.serial,
                machine: {...machine}, original, originalDrafts: record.drafts, candidate,
                phase: "active", pending: {journalId: journal.id, kind: "candidate"},
                observation: null,
                ...(hasSlotObservations(candidateId) ? {slotObservations: [null, null, null]} : {}),
                evidence: []
            };
            this.evidence(record, journal.id, "prepared", at, null, null, checked.frames);
        });
    }

    recoveryEvidence(
        deviceId: string, id: string,
        kind: "partial" | "recovery-dispatch" | "recovery-receipt" | "recovery-error",
        detail: string | null = null
    ): void {
        this.change(deviceId, record => {
            const journal = record.journal;
            if (record.experiment?.candidateId !== SLOT_RECOVERY_PROBE_ID
                || record.experiment.pending?.kind !== "candidate" || journal?.id !== id
                || journal.acknowledged !== 1 || journal.inFlight !== null) {
                throw new Error("Recovery testing requires the confirmed single-slot lab write.");
            }
            this.evidence(record, id, kind, this.now(), null, detail);
        });
    }

    /** Begins writing the preserved original set back; refused while anything is pending. */
    beginRestore(deviceId: string, journal: SlotJournal, at: number): void {
        this.change(deviceId, (record) => {
            const experiment = record.experiment;
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            if (experiment === undefined || experiment.phase !== "active" || experiment.pending !== null) {
                throw new Error("There is no tea slot probe set to restore.");
            }
            if (journal.serial !== experiment.serial) {
                throw new Error("The preserved set belongs to a different machine. Its serial must match.");
            }
            if (journal.acknowledged !== 0 || journal.inFlight !== null) {
                throw new Error("A new write must begin before any receipt.");
            }
            if (!samePreservedSet(journal.slots, experiment.original.slots)) {
                throw new Error("The restore is not the preserved original set.");
            }
            const checked = readJournal(journal);
            if (checked === null) throw new Error("The tea slot probe journal is missing.");
            record.journal = checked;
            experiment.pending = {journalId: journal.id, kind: "restore"};
            this.evidence(record, journal.id, "restore-prepared", at, null, null, checked.frames);
        });
    }

    observe(deviceId: string, observation: SlotObservation): void {
        this.change(deviceId, (record) => {
            if (record.experiment === undefined) throw new Error("There is no tea slot probe to observe.");
            if (record.experiment.slotObservations !== undefined) {
                throw new Error("Report each matrix slot separately.");
            }
            record.experiment.observation = readObservation(observation);
        });
    }

    /** One slot's report on the reference matrix; the other slots' reports are untouched. */
    observeSlot(deviceId: string, index: SlotIndex, observation: SlotObservation): void {
        this.change(deviceId, (record) => {
            const slots = record.experiment?.slotObservations;
            if (record.experiment === undefined || slots === undefined) {
                throw new Error("There is no reference matrix trial to observe.");
            }
            slots[index] = readObservation(observation);
        });
    }

    private updateJournal(
        deviceId: string, id: string, kind: EvidenceKind, edit: (journal: SlotJournal) => void,
        slot: SlotIndex | null = null, detail: string | null = null
    ) {
        this.change(deviceId, (record) => {
            if (record.journal === null || record.journal.id !== id) {
                throw new Error("The Easy Mode write attempt no longer matches.");
            }
            edit(record.journal);
            this.evidence(record, id, kind, this.now(), slot, detail);
        });
    }

    dispatching(deviceId: string, id: string, index: SlotIndex): void {
        this.updateJournal(deviceId, id, "dispatch", (journal) => {
            if (journal.acknowledged !== index || journal.inFlight !== null) {
                throw new Error("The next slot receipt is uncertain.");
            }
            journal.inFlight = index;
            journal.error = null;
        }, index);
    }

    acknowledge(deviceId: string, id: string, index: SlotIndex): void {
        this.updateJournal(deviceId, id, "receipt", (journal) => {
            if (journal.inFlight !== index || journal.acknowledged !== index) {
                throw new Error("The slot receipt does not match this attempt.");
            }
            journal.acknowledged = index + 1;
            journal.inFlight = null;
        }, index);
    }

    fail(deviceId: string, id: string, error: string): void {
        this.updateJournal(deviceId, id, "error", (journal) => { journal.error = error; }, null, error);
    }

    reject(deviceId: string, id: string, index: SlotIndex): void {
        this.updateJournal(deviceId, id, "refused", (journal) => {
            if (journal.inFlight !== index || journal.acknowledged !== index) {
                throw new Error("The refused slot does not match this attempt.");
            }
            journal.inFlight = null;
        }, index);
    }

    restart(deviceId: string, id: string): void {
        this.updateJournal(deviceId, id, "restart", (journal) => {
            journal.acknowledged = 0;
            journal.inFlight = null;
            journal.error = null;
        });
    }

    cancel(deviceId: string, id: string): void {
        this.change(deviceId, (record) => {
            const journal = record.journal;
            if (journal === null || journal.id !== id) {
                throw new Error("The Easy Mode write attempt no longer matches.");
            }
            const experiment = record.experiment;
            const progressed = journal.acknowledged > 0 || journal.inFlight !== null;
            this.evidence(record, id, "cancelled", this.now(), null,
                progressed ? "Cancelled after the machine may have changed." : "Cancelled before any receipt.");
            if (experiment?.pending?.journalId === id) {
                // The experiment's drafts were never touched; the journal's set must not replace them.
                record.drafts = experiment.originalDrafts;
                experiment.pending = null;
            } else {
                record.drafts = journal.slots;
            }
            if (progressed) record.written = null;
            record.journal = null;
        });
    }

    complete(deviceId: string, id: string, at: number): void {
        this.change(deviceId, (record) => {
            const journal = record.journal;
            if (journal === null || journal.id !== id) {
                throw new Error("The Easy Mode write attempt no longer matches.");
            }
            if (journal.acknowledged !== 3 || journal.inFlight !== null) {
                throw new Error("All three slot receipts are required.");
            }
            const experiment = record.experiment;
            const kind = experiment?.pending?.journalId === id ? experiment.pending.kind : null;
            this.evidence(record, id, kind === "restore" ? "restored" : "final", at);
            record.written = {at, slots: journal.slots};
            record.journal = null;
            if (experiment !== undefined && kind !== null) {
                experiment.pending = null;
                if (kind === "restore") {
                    // Only a confirmed restoration gives the phone's drafts back, in this same commit.
                    record.drafts = experiment.originalDrafts;
                    experiment.phase = "restored";
                }
            }
        });
    }
}
