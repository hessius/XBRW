import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {encodeTeaBlob} from "@/library/machine/protocol";
import type {SlotRecord, SlotSnapshot, Triple} from "@/library/slots/slotModel";

/**
 * The one tea candidate: pure constants and validation, with no storage.
 *
 * Kept apart from `teaSlotProbe.ts` because `slotModel.readSnapshot` must be
 * able to recognise it, and the probe's orchestration imports the writer, which
 * imports `slotModel`. This module imports `slotModel` for types only.
 */
export const TEA_SLOT_PROBE_ID = "tea-slot-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_UUID = "tea-slot-probe-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_NAME = "TEA SLOT PROBE";

function probeRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.uuid = TEA_SLOT_PROBE_UUID;
    recipe.name = TEA_SLOT_PROBE_NAME;
    recipe.key = TEA_SLOT_PROBE_UUID;
    recipe.createdAt = 0;
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 12;
    recipe.grinder = false;
    recipe.bypassEnabled = false;
    recipe.pours = [new Pour(1, 60, 70, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 60)];
    return recipe;
}

/** The only snapshot allowed to carry the `probe` discriminant. */
export function teaProbeSnapshot(): SlotSnapshot {
    const recipe = probeRecipe();
    return {
        sourceUuid: TEA_SLOT_PROBE_UUID,
        name: TEA_SLOT_PROBE_NAME,
        recipeJSON: JSON.stringify(recipe),
        blob: Array.from(encodeTeaBlob(recipe)),
        probe: TEA_SLOT_PROBE_ID
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
 * Throws unless `value` is exactly the fixed probe: identity, name, whole
 * recipe and the bytes recomputed from that recipe. Never accepts another tea.
 */
export function checkTeaProbeSnapshot(value: {
    sourceUuid: unknown; name: unknown; recipeJSON: unknown; blob: readonly number[]; probe: unknown;
}): SlotSnapshot {
    const exact = teaProbeSnapshot();
    if (value.probe !== TEA_SLOT_PROBE_ID || value.sourceUuid !== exact.sourceUuid
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

export function teaProbeCandidateSet(original: Triple<SlotSnapshot>): Triple<SlotSnapshot> {
    return [teaProbeSnapshot(), original[1], original[2]];
}
