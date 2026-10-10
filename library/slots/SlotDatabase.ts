import {appDatabase} from "@/library/appDatabase";
import {
    emptySlotRecord, objectValue, prepareSet, readSnapshot, sameBytes,
    type EvidenceKind, type SlotEvidence, type SlotExperiment, type SlotIndex, type SlotJournal,
    type SlotObservation, type SlotRecord, type SlotSnapshot, type Triple
} from "@/library/slots/slotModel";
import {
    isTeaProbeSnapshot, sameSnapshotSet, teaProbeCandidateSet, teaProbeOriginal, TEA_SLOT_PROBE_ID
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
    "cancelled", "restore-prepared", "restored"
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
    if (!objectValue(value) || value.candidateId !== TEA_SLOT_PROBE_ID
        || typeof value.trialId !== "string" || value.trialId === ""
        || value.deviceId !== deviceId || typeof value.serial !== "string" || value.serial === ""
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
    const slots = triple(value.original.slots, readSnapshot);
    const originalDrafts = triple(value.originalDrafts, (slot) => slot === null ? null : readSnapshot(slot));
    const candidate = triple(value.candidate, readSnapshot);
    if (slots.some(isTeaProbeSnapshot) || originalDrafts.some(isTeaProbeSnapshot)
        || !sameSnapshotSet(candidate, teaProbeCandidateSet(slots))) {
        throw new Error("The tea slot probe sets are inconsistent.");
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
        if (pending !== null || journal?.slots.some(isTeaProbeSnapshot)) {
            throw new Error("A restored tea slot probe cannot have a pending probe write.");
        }
    } else {
        // A pending marker and the journal are one fact; neither may exist alone.
        if ((pending === null) !== (journal === null)
            || (pending !== null && pending.journalId !== journal?.id)) {
            throw new Error("The tea slot probe pending write does not match the recovery journal.");
        }
        if (journal !== null) {
            const expected = pending?.kind === "candidate" ? candidate : slots;
            if (journal.serial !== value.serial || !sameSnapshotSet(journal.slots, expected)) {
                throw new Error("The tea slot probe journal is not the preserved set.");
            }
        }
    }
    return {
        candidateId: TEA_SLOT_PROBE_ID, trialId: value.trialId, deviceId, serial: value.serial,
        machine: {...(value.machine as Record<string, string>)},
        original: {source: value.original.source, writtenAt: value.original.writtenAt, slots},
        originalDrafts, candidate, phase: value.phase, pending,
        observation: readObservation(value.observation),
        evidence: value.evidence.map(readEvidence)
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
            record.drafts[index] = checked;
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
        deviceId: string, journal: SlotJournal, trialId: string, machine: Record<string, string>, at: number
    ): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            if (this.activeExperiment(record)) {
                throw new Error("A tea slot probe is already in progress. Restore the original set first.");
            }
            if (journal.serial === null || journal.serial === "") {
                throw new Error("The tea slot probe needs the machine's serial.");
            }
            if (journal.acknowledged !== 0 || journal.inFlight !== null) {
                throw new Error("A new write must begin before any receipt.");
            }
            const original = teaProbeOriginal(record);
            const candidate = teaProbeCandidateSet(original.slots);
            if (!sameSnapshotSet(journal.slots, candidate)) {
                throw new Error("The tea slot probe is not built on the preserved original set.");
            }
            const checked = readJournal(journal);
            if (checked === null) throw new Error("The tea slot probe journal is missing.");
            record.journal = checked;
            record.experiment = {
                candidateId: TEA_SLOT_PROBE_ID, trialId, deviceId, serial: journal.serial,
                machine: {...machine}, original, originalDrafts: record.drafts, candidate,
                phase: "active", pending: {journalId: journal.id, kind: "candidate"},
                observation: null, evidence: []
            };
            this.evidence(record, journal.id, "prepared", at, null, null, checked.frames);
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
            if (!sameSnapshotSet(journal.slots, experiment.original.slots)) {
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
            record.experiment.observation = readObservation(observation);
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
