import {fingerprint} from "@/library/cloud/fingerprint";
import Recipe from "@/library/Recipe";
import {ratioForVolumes, stagesAddUpTo} from "@/library/recipeIdentity";

/**
 * Saved copies of xBloom recipes whose half-point ratio the importer rounded.
 *
 * The importer used to throw away xBloom's `grandWater` and store a whole
 * number, so 18 g pouring 261 ml (1:14.5) was saved as 1:15 and refused at the
 * machine for asking 270 ml. New imports keep the real ratio. This gives a copy
 * already in the library the same ratio, and never touches a stage volume.
 *
 * Everything below has to hold, so a recipe somebody changed is left alone:
 *
 *  - it is coffee, imported from xBloom, and not a duplicate, which is the
 *    user's own to change;
 *  - the machine refuses it today, so nothing that brews is ever altered;
 *  - its ratio is exactly what the importer's rounding produced, and the stages
 *    sit on a half point within the machine's own rule;
 *  - its dose, ratio and stage total still match `offline_backup`, the snapshot
 *    the importer took when the recipe arrived. That is what tells an untouched
 *    copy from one edited into this state. A rename or a grind change does not
 *    count, because neither bears on the ratio.
 *
 * A copy this declines, one with no snapshot for example, is still put right by
 * importing its link again, which goes through `planReimport`.
 */

/** Whether the recipe's dose, ratio and stage total are as they arrived. */
function unchangedSinceImport(recipe: Recipe): boolean {
    if (recipe.offline_backup.length === 0) return false;
    try {
        const arrived = new Recipe(recipe.offline_backup, undefined, false);
        return arrived.dosage === recipe.dosage
            && arrived.ratio === recipe.ratio
            && arrived.getPourTotalVolume() === recipe.getPourTotalVolume();
    } catch {
        return false;
    }
}

/** The half-point ratio this saved copy should have, or null to leave it alone. */
export function halfPointRatioFor(recipe: Recipe): number | null {
    if (recipe.isTea() || recipe.source !== "import") return null;
    const fromXBloom = recipe.shareId.trim() !== "" || recipe.xid.trim() !== ""
        || (typeof recipe.cloudId === "number" && recipe.cloudId > 0);
    if (!fromXBloom || !(recipe.dosage > 0) || recipe.isPourVolumeValid()) return null;

    const volumes = recipe.pours.map(pour => pour.volume);
    if (recipe.ratio !== ratioForVolumes(volumes, recipe.dosage)) return null;

    const total = recipe.getPourTotalVolume();
    const half = Math.round(total * 2 / recipe.dosage) / 2;
    if (Number.isInteger(half) || !stagesAddUpTo(total, recipe.dosage * half)) return null;
    return unchangedSinceImport(recipe) ? half : null;
}

/**
 * Apply the repair in place. True when the recipe changed.
 *
 * An account recipe's `cloudFingerprint` is what says it is untouched, and it
 * covers the ratio, so it moves with the ratio. Otherwise this repair would mark
 * the recipe as edited and the next account import would stop updating it.
 */
export function repairHalfPointImport(recipe: Recipe): boolean {
    const ratio = halfPointRatioFor(recipe);
    if (ratio === null) return false;
    const untouched = recipe.cloudFingerprint === fingerprint(recipe);
    recipe.ratio = ratio;
    if (untouched) recipe.cloudFingerprint = fingerprint(recipe);
    return true;
}

/**
 * The stored form of `repairHalfPointImport`, or null when the row is fine or
 * unreadable.
 *
 * The blob is patched rather than rewritten from the `Recipe`, so the repair
 * changes the two fields it means to and does not also bring forward whatever
 * the constructor would migrate on the way through.
 */
export function repairHalfPointBlob(json: string): {json: string; ratio: number} | null {
    try {
        const recipe = new Recipe(undefined, json);
        if (!repairHalfPointImport(recipe)) return null;
        const stored = JSON.parse(json);
        stored.ratio = recipe.ratio;
        if (stored.cloudFingerprint !== undefined) stored.cloudFingerprint = recipe.cloudFingerprint;
        return {json: JSON.stringify(stored), ratio: recipe.ratio};
    } catch {
        return null;
    }
}
