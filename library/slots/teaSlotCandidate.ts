import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {encodeTeaBlob} from "@/library/machine/protocol";
import type {SlotRecord, SlotSnapshot, Triple} from "@/library/slots/slotModel";

/**
 * The two approved tea candidates: pure constants and validation, with no storage.
 *
 * Kept apart from `teaSlotProbe.ts` because `slotModel.readSnapshot` must be
 * able to recognise it, and the probe's orchestration imports the writer, which
 * imports `slotModel`. This module imports `slotModel` for types only.
 */
export const TEA_SLOT_PROBE_ID = "tea-slot-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_V2_ID = "tea-slot-0x04-one-steep-v1";
export const TEA_SLOT_PROBE_UUID = "tea-slot-probe-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_NAME = "TEA SLOT PROBE";

const CANDIDATES = [
    {id: TEA_SLOT_PROBE_ID, uuid: TEA_SLOT_PROBE_UUID, flags: 0x02},
    {id: TEA_SLOT_PROBE_V2_ID, uuid: "tea-slot-probe-0x04-one-steep-v1", flags: 0x04}
] as const;

function candidate(candidateId: unknown) {
    const found = CANDIDATES.find(entry => entry.id === candidateId);
    if (found === undefined) throw new Error("The tea slot probe candidate is not approved.");
    return found;
}

export function teaProbeFlags(candidateId: string): 0x02 | 0x04 {
    return candidate(candidateId).flags;
}

/** The only approved progression; a pending ordinary write also blocks a fresh probe. */
export function nextTeaProbeCandidate(record: SlotRecord): string | null {
    if (record.journal !== null) return null;
    const history = record.experimentHistory ?? [];
    const experiment = record.experiment;
    if (experiment === undefined) return history.length === 0 ? TEA_SLOT_PROBE_ID : null;
    return experiment.candidateId === TEA_SLOT_PROBE_ID && history.length === 0
        && experiment.phase === "restored" && experiment.pending === null
        && experiment.evidence.at(-1)?.kind === "restored"
        ? TEA_SLOT_PROBE_V2_ID : null;
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

/** Defaults to v1 so persisted fixtures and callers retain their exact identity. */
export function teaProbeSnapshot(candidateId: string = TEA_SLOT_PROBE_ID): SlotSnapshot {
    const approved = candidate(candidateId);
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
    return [teaProbeSnapshot(candidateId), original[1], original[2]];
}
