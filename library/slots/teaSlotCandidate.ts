import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {encodeTeaBlob} from "@/library/machine/protocol";
import type {SlotRecord, SlotSnapshot, Triple} from "@/library/slots/slotModel";

/**
 * Exact historical tea probes and source-backed labs, with no storage.
 *
 * Kept apart from `teaSlotProbe.ts` because `slotModel.readSnapshot` must be
 * able to recognise it, and the probe's orchestration imports the writer, which
 * imports `slotModel`. This module imports `slotModel` for types only.
 */
export const TEA_SLOT_PROBE_ID = "tea-slot-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_V2_ID = "tea-slot-0x04-one-steep-v1";
/** The one reference-derived A/B/C comparison, written after v2 is restored. Not official-byte-proven. */
export const TEA_SLOT_MATRIX_ID = "tea-slot-reference-abc-v1";
export const TEA_SLOT_STEEPS_ID = "tea-slot-apk-steeps-abc-v1";
export const SLOT_RECOVERY_PROBE_ID = "slot-apk-recovery-40526-v1";
export const SLOT_LAB_IDS = [TEA_SLOT_STEEPS_ID, SLOT_RECOVERY_PROBE_ID] as const;
export const TEA_SLOT_PROBE_UUID = "tea-slot-probe-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_NAME = "TEA SLOT PROBE";
export const TEA_EXPERIMENT_IDS = [
    TEA_SLOT_PROBE_ID, TEA_SLOT_PROBE_V2_ID, TEA_SLOT_MATRIX_ID, ...SLOT_LAB_IDS
] as const;

/**
 * The official public reference's one stage, audited from the share page:
 * 90 ml, 92 C, spiral (2), no agitation, 20 s steep (236, 0), 120 rpm, flow 3.5 (35).
 * Explicit constants on purpose: the ordinary tea encoder derives different suffix bytes.
 */
const REFERENCE_SEGMENT = [90, 92, 2, 0, 236, 0, 120, 35];
const MATRIX = [
    {id: `${TEA_SLOT_MATRIX_ID}:A`, uuid: "tea-slot-reference-abc-v1-a", name: "TEA REF A",
        slot: 0, flags: 0x02, grinder: false, blob: [8, ...REFERENCE_SEGMENT, 254, 150]},
    {id: `${TEA_SLOT_MATRIX_ID}:B`, uuid: "tea-slot-reference-abc-v1-b", name: "TEA REF B",
        slot: 1, flags: 0x04, grinder: false, blob: [8, ...REFERENCE_SEGMENT, 254, 150]},
    {id: `${TEA_SLOT_MATRIX_ID}:C`, uuid: "tea-slot-reference-abc-v1-c", name: "TEA REF C",
        slot: 2, flags: 0x04, grinder: true, blob: [8, ...REFERENCE_SEGMENT, 50, 150]}
] as const;

const STEEPS = ([0, 1, 2] as const).map(slot => ({
    id: `${TEA_SLOT_STEEPS_ID}:${["A", "B", "C"][slot]}`,
    uuid: `${TEA_SLOT_STEEPS_ID}-${slot}`,
    name: `TEA ${slot + 1} STEEP${slot === 0 ? "" : "S"}`,
    slot, flags: 0x0C + slot * 0x20, grinder: false,
    steeps: slot + 1,
    blob: [8 * (slot + 1), ...Array.from({length: slot + 1}, (_, index) =>
        [90, 92, 2, 0, 236, 0, index === 0 ? 120 : 0, 35]).flat(), 254, 150]
}));

const CANDIDATES = [
    {id: TEA_SLOT_PROBE_ID, uuid: TEA_SLOT_PROBE_UUID, flags: 0x02, slot: null},
    {id: TEA_SLOT_PROBE_V2_ID, uuid: "tea-slot-probe-0x04-one-steep-v1", flags: 0x04, slot: null},
    ...MATRIX, ...STEEPS
] as const;

export function checkTeaExperimentId(candidateId: unknown): string {
    if (!TEA_EXPERIMENT_IDS.some(id => id === candidateId)) {
        throw new Error("The tea slot probe candidate is not approved.");
    }
    return candidateId as string;
}

function candidate(candidateId: unknown) {
    const found = CANDIDATES.find(entry => entry.id === candidateId);
    if (found === undefined) throw new Error("The tea slot probe candidate is not approved.");
    return found;
}

export function teaProbeFlags(candidateId: string): number {
    return candidate(candidateId).flags;
}

/** Frame flags for each slot given its snapshots' probe ids; anything unapproved throws. */
export function teaProbeSlotFlags(probes: readonly (string | undefined)[]): Triple<number> {
    if (probes.every(probe => probe === undefined)) return [0x02, 0x02, 0x02];
    const entries = probes.map(probe => probe === undefined ? undefined : candidate(probe));
    if (entries.some(entry => entry !== undefined && entry.slot !== null)) {
        if (![MATRIX, STEEPS].some(matrix => matrix.every((entry, i) => entry.id === entries[i]?.id))) {
            throw new Error("The tea slot reference matrix needs exactly its A, B and C candidates.");
        }
        return [entries[0]!.flags, entries[1]!.flags, entries[2]!.flags];
    }
    if (entries[1] !== undefined || entries[2] !== undefined) {
        throw new Error("The tea slot probe is allowed only in slot A.");
    }
    return [entries[0]!.flags, 0x02, 0x02];
}

export function slotLabAvailable(record: SlotRecord, candidateId: string): boolean {
    return SLOT_LAB_IDS.some(id => id === candidateId) && record.journal === null
        && (record.experiment === undefined || (record.experiment.phase === "restored"
            && record.experiment.pending === null && record.experiment.evidence.at(-1)?.kind === "restored"))
        && ![...(record.experimentHistory ?? []), ...(record.experiment ? [record.experiment] : [])]
            .some(trial => trial.candidateId === candidateId);
}

export function checkSlotLabAvailable(record: SlotRecord, candidateId: string): string {
    if (!slotLabAvailable(record, candidateId)) {
        throw new Error("This lab is unavailable. Resolve and restore the current trial first; completed labs cannot be repeated.");
    }
    return candidateId;
}

export function hasSlotObservations(candidateId: string): boolean {
    return candidateId === TEA_SLOT_MATRIX_ID || candidateId === TEA_SLOT_STEEPS_ID;
}

/**
 * The only approved progression: v1, then v2, then the reference matrix, each only
 * after the previous trial's restoration is confirmed. Source-backed labs are
 * explicitly selected separately; nothing follows the matrix implicitly.
 * A pending ordinary write also blocks a fresh probe.
 */
export function nextTeaProbeCandidate(record: SlotRecord): string | null {
    if (record.journal !== null) return null;
    const history = record.experimentHistory ?? [];
    const experiment = record.experiment;
    if (experiment === undefined) return history.length === 0 ? TEA_SLOT_PROBE_ID : null;
    if (experiment.phase !== "restored" || experiment.pending !== null
        || experiment.evidence.at(-1)?.kind !== "restored") return null;
    if (experiment.candidateId === TEA_SLOT_PROBE_ID && history.length === 0) return TEA_SLOT_PROBE_V2_ID;
    return experiment.candidateId === TEA_SLOT_PROBE_V2_ID && history.length === 1
        && history[0].candidateId === TEA_SLOT_PROBE_ID ? TEA_SLOT_MATRIX_ID : null;
}

function probeRecipe(sourceUuid: string): Recipe {
    const recipe = new Recipe();
    recipe.uuid = sourceUuid;
    recipe.name = TEA_SLOT_PROBE_NAME;
    recipe.key = sourceUuid;
    recipe.createdAt = 0;
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 12;
    recipe.grinder = false;
    recipe.bypassEnabled = false;
    recipe.pours = [new Pour(1, 60, 70, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 60)];
    return recipe;
}

/**
 * Metadata only: the cloud's dose 3 g and ratio 15 are recorded as sent, and the
 * blob is the explicit constant, so nothing here re-derives a ratio of 30.
 */
function referenceRecipe(entry: (typeof MATRIX)[number] | (typeof STEEPS)[number]): Recipe {
    const recipe = new Recipe();
    recipe.uuid = entry.uuid;
    recipe.name = entry.name;
    recipe.key = entry.uuid;
    recipe.createdAt = 0;
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 3;
    recipe.ratio = 15;
    recipe.grinder = entry.grinder;
    if (entry.grinder) recipe.grindSize = 50;
    recipe.bypassEnabled = false;
    recipe.pours = Array.from({length: "steeps" in entry ? entry.steeps : 1}, (_, index) =>
        new Pour(index + 1, 90, 92, 35, AGITATION.ALL_OFF, POUR_PATTERN.SPIRAL, 20));
    return recipe;
}

/** Defaults to v1 so persisted fixtures and callers retain their exact identity. */
export function teaProbeSnapshot(candidateId: string = TEA_SLOT_PROBE_ID): SlotSnapshot {
    const approved = candidate(candidateId);
    if (approved.slot !== null) {
        const recipe = referenceRecipe(approved);
        return {
            sourceUuid: approved.uuid, name: approved.name, recipeJSON: JSON.stringify(recipe),
            blob: [...approved.blob], probe: approved.id
        };
    }
    const recipe = probeRecipe(approved.uuid);
    return {
        sourceUuid: approved.uuid,
        name: TEA_SLOT_PROBE_NAME,
        recipeJSON: JSON.stringify(recipe),
        blob: Array.from(encodeTeaBlob(recipe)),
        probe: approved.id
    };
}

export function isTeaProbeSnapshot(snapshot: SlotSnapshot | null | undefined): boolean {
    return snapshot?.probe !== undefined;
}

function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
        return false;
    }
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
        && keys.every((key) => deepEqual(
            (left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

/**
 * Throws unless `value` is exactly its registered probe: identity, name, whole
 * recipe and the bytes recomputed from that recipe. Never accepts another tea.
 */
export function checkTeaProbeSnapshot(value: {
    sourceUuid: unknown; name: unknown; recipeJSON: unknown; blob: readonly number[]; probe: unknown;
}): SlotSnapshot {
    const exact = teaProbeSnapshot(candidate(value.probe).id);
    if (value.sourceUuid !== exact.sourceUuid
        || value.name !== exact.name || typeof value.recipeJSON !== "string") {
        throw new Error("The tea slot probe snapshot is not the fixed candidate.");
    }
    let recipe: unknown;
    try {
        recipe = JSON.parse(value.recipeJSON);
    } catch {
        throw new Error("The tea slot probe recipe is invalid.");
    }
    if (!deepEqual(recipe, JSON.parse(exact.recipeJSON))) {
        throw new Error("The tea slot probe recipe is not the fixed candidate.");
    }
    if (value.blob.length !== exact.blob.length || !value.blob.every((byte, i) => byte === exact.blob[i])) {
        throw new Error("The tea slot probe bytes are not the fixed candidate.");
    }
    return exact;
}

function sameSnapshot(left: SlotSnapshot | null, right: SlotSnapshot | null): boolean {
    return left !== null && right !== null && left.sourceUuid === right.sourceUuid
        && left.name === right.name && left.recipeJSON === right.recipeJSON
        && left.probe === right.probe
        && left.blob.length === right.blob.length && left.blob.every((b, i) => b === right.blob[i]);
}

export function sameSnapshotSet(
    left: Triple<SlotSnapshot | null>, right: Triple<SlotSnapshot | null>
): boolean {
    return [0, 1, 2].every((i) => sameSnapshot(left[i], right[i]));
}

/**
 * The complete set to preserve: the last-written A/B/C, else a complete draft
 * set. Never contains the probe, so a repeated attempt cannot capture it.
 */
export function teaProbeOriginal(record: SlotRecord): {
    source: "written" | "draft"; writtenAt: number | null; slots: Triple<SlotSnapshot>;
} {
    const slots = record.written?.slots ?? record.drafts;
    if (slots.some((slot) => slot === null)) {
        throw new Error("The tea slot probe needs a complete A/B/C set to preserve first.");
    }
    if (slots.some(isTeaProbeSnapshot)) {
        throw new Error("The tea slot probe cannot preserve itself as the original set.");
    }
    return {
        source: record.written !== null ? "written" : "draft",
        writtenAt: record.written?.at ?? null,
        slots: slots as Triple<SlotSnapshot>
    };
}

export function teaProbeCandidateSet(
    original: Triple<SlotSnapshot>, candidateId: string = TEA_SLOT_PROBE_ID
): Triple<SlotSnapshot> {
    if (candidateId === TEA_SLOT_MATRIX_ID) {
        return MATRIX.map(entry => teaProbeSnapshot(entry.id)) as Triple<SlotSnapshot>;
    }
    if (candidateId === TEA_SLOT_STEEPS_ID) {
        return STEEPS.map(entry => teaProbeSnapshot(entry.id)) as Triple<SlotSnapshot>;
    }
    if (candidateId === SLOT_RECOVERY_PROBE_ID) return original;
    return [teaProbeSnapshot(candidateId), original[1], original[2]];
}
