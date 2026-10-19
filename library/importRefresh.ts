import {fingerprint} from "@/library/cloud/fingerprint";
import Recipe from "@/library/Recipe";
import type {Settings} from "@/library/Settings";

/**
 * Importing a recipe the library already has, after its author changed it.
 *
 * A library copy is the user's and never changes on its own. It only changes
 * when the user imports the same share link again (from a link or from a
 * roaster's catalogue) and the version xBloom now returns differs from the
 * copy. Then:
 *
 *  - an unedited copy takes the new brewing content quietly, because nobody
 *    could prefer an old version of a recipe they never touched;
 *  - an edited copy is not touched until the user picks "Use the roaster's
 *    latest" or "Keep mine".
 *
 * "Edited" is decided by fingerprint, the same helper the account import uses
 * (`library/cloud/fingerprint.ts`), taken over brewing content only: the name
 * is blanked first, so renaming a recipe does not count as editing it. The
 * print taken at import is kept in the `importFingerprints` setting by uuid.
 * A recipe with no print (imported before this existed) counts as edited, so
 * the user is asked rather than overruled.
 *
 * Either way the name the user set, the note, the tags, the star, the accent,
 * the coffee and every brew stay. Brews live in their own table and are
 * keyed by uuid, which is kept.
 */

/** Prints kept at most. Far more than any library; a guard on a backup file. */
const MAX_PRINTS = 10_000;

/** The brewing content's fingerprint, with the name left out. */
export function contentPrint(recipe: Recipe): string {
    const copy = new Recipe(undefined, JSON.stringify(recipe));
    copy.name = "";
    return fingerprint(copy);
}

/** Validated, because the setting travels in a backup file. */
export function parsePrints(stored: string): Record<string, string> {
    if (stored.trim() === "") return {};
    try {
        const parsed: unknown = JSON.parse(stored);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const result: Record<string, string> = {};
        for (const [uuid, print] of Object.entries(parsed as Record<string, unknown>).slice(0, MAX_PRINTS)) {
            if (typeof print === "string" && /^[0-9a-f]{16}$/.test(print) && uuid.length <= 100) {
                result[uuid] = print;
            }
        }
        return result;
    } catch {
        return {};
    }
}

export function readPrints(settings: Settings): Record<string, string> {
    return parsePrints(settings.get("importFingerprints"));
}

/**
 * Remember what a recipe looked like when it arrived.
 *
 * `known` is the library's uuids, when the caller has them: prints for
 * recipes no longer there are dropped on the way, so the setting does not
 * grow with every import that was never saved.
 */
export function rememberPrint(
    settings: Settings, recipe: Recipe, known?: readonly string[]
): void {
    let print: string;
    try {
        print = contentPrint(recipe);
    } catch {
        return;
    }
    const all = readPrints(settings);
    const keep = known === undefined ? null : new Set([...known, recipe.uuid]);
    const next: Record<string, string> = {};
    for (const [uuid, value] of Object.entries(all)) {
        if (keep === null || keep.has(uuid)) next[uuid] = value;
    }
    next[recipe.uuid] = print;
    settings.set("importFingerprints", JSON.stringify(next));
}

export type Reimport =
    /** Not in the library. */
    | {kind: "new"}
    /** In the library and identical: nothing to do. */
    | {kind: "same"; recipe: Recipe}
    /** In the library, untouched, and the author's version moved on. */
    | {kind: "replace"; held: Recipe}
    /** In the library, edited by the user, and the author's version moved on. */
    | {kind: "ask"; held: Recipe};

/** The library recipe imported from the same share link, if any. */
export function heldByShare(stored: readonly Recipe[], shareId: string): Recipe | undefined {
    const id = shareId.trim();
    if (id === "") return undefined;
    return stored.find((recipe) => recipe.shareId.trim() === id);
}

/**
 * What importing `candidate` should do to the library.
 *
 * Matched on share id, not on the brew fingerprint, because the whole point
 * is a recipe whose brew changed under the same link.
 */
export function planReimport(
    stored: readonly Recipe[], candidate: Recipe, prints: Readonly<Record<string, string>>
): Reimport {
    const held = heldByShare(stored, candidate.shareId);
    if (held === undefined) return {kind: "new"};
    let now: string;
    let latest: string;
    try {
        now = contentPrint(held);
        latest = contentPrint(candidate);
    } catch {
        return {kind: "ask", held};
    }
    if (now === latest) return {kind: "same", recipe: held};
    return prints[held.uuid] === now ? {kind: "replace", held} : {kind: "ask", held};
}

/**
 * The author's brewing content on the user's copy.
 *
 * Only brewing fields move: dose, ratio, grind, grinder, cup, bypass and the
 * stages. Everything the user owns stays on `held`, which is mutated and
 * returned, uuid and all, so brews and anything else keyed by it carry on.
 */
export function takeLatest(held: Recipe, latest: Recipe): Recipe {
    held.xid = latest.xid;
    held.dosage = latest.dosage;
    held.ratio = latest.ratio;
    held.grindSize = latest.grindSize;
    held.grindRPM = latest.grindRPM;
    held.grinder = latest.grinder;
    held.cupType = latest.cupType;
    held.defaultCups = latest.defaultCups;
    held.bypassEnabled = latest.bypassEnabled;
    held.bypassVolume = latest.bypassVolume;
    held.bypassTemp = latest.bypassTemp;
    held.pours = latest.pours;
    held.checksum = latest.checksum;
    return held;
}
