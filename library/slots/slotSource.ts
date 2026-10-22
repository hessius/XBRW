import {contentPrint, heldByShare} from "@/library/importRefresh";
import Recipe from "@/library/Recipe";
import {snapshotRecipe, snapshotStatus, type SlotSnapshot} from "@/library/slots/slotModel";

/**
 * Keeping an Easy Mode slot linked to the library recipe it came from.
 *
 * A slot remembers its recipe by uuid (`SlotSnapshot.sourceUuid`). A recipe
 * opened from a roaster's catalogue, a roaster search or an import link is not
 * in the library yet, and each fetch mints a fresh uuid. Assigned as it was,
 * the slot pointed at a recipe the library never kept and read REMOVED FROM
 * LIBRARY the next time Easy Mode opened.
 */

/**
 * The recipe a slot should snapshot: one the library holds.
 *
 * A recipe already in the library goes in as it is. One that is not is matched
 * to the library's copy of the same share link when that copy brews exactly
 * the same, the same test `planReimport` uses for "nothing changed"; otherwise
 * it is saved, the same as pressing SAVE. A recipe that cannot go in a slot is
 * handed back untouched and unsaved, so the caller's usual error explains why.
 */
export function libraryRecipeForSlot(
    recipe: Recipe, stored: readonly Recipe[], save: (recipe: Recipe) => void
): {recipe: Recipe; saved: boolean} {
    if (stored.some((entry) => entry.uuid === recipe.uuid)) return {recipe, saved: false};
    try {
        snapshotRecipe(recipe);
    } catch {
        return {recipe, saved: false};
    }
    const held = heldByShare(stored, recipe.shareId);
    if (held !== undefined && samePrint(held, recipe)) return {recipe: held, saved: false};
    save(recipe);
    return {recipe, saved: true};
}

function samePrint(left: Recipe, right: Recipe): boolean {
    try {
        return contentPrint(left) === contentPrint(right);
    } catch {
        return false;
    }
}

/**
 * The library recipe a slot came from, or undefined when it is gone.
 *
 * By uuid first. Slots assigned before `libraryRecipeForSlot` existed may hold
 * the uuid of a catalogue or link recipe that was saved later under another
 * uuid, so they fall back to the library copy of the same share link
 * (preferring one that still brews the same), then to a recipe with no link
 * of its own, the same name and exactly the same brew.
 */
export function slotSourceRecipe(
    snapshot: SlotSnapshot, recipes: readonly Recipe[]
): Recipe | undefined {
    const direct = recipes.find((recipe) => recipe.uuid === snapshot.sourceUuid);
    if (direct !== undefined) return direct;
    let shareId: string;
    try {
        shareId = new Recipe(undefined, snapshot.recipeJSON).shareId.trim();
    } catch {
        return undefined;
    }
    const unchanged = (recipe: Recipe) => snapshotStatus(snapshot, recipe) === "unchanged";
    if (shareId !== "") {
        const shared = recipes.filter((recipe) => recipe.shareId.trim() === shareId);
        if (shared.length > 0) return shared.find(unchanged) ?? shared[0];
    }
    // A recipe from another link is another coffee, however alike it brews.
    return recipes.find((recipe) => recipe.shareId.trim() === ""
        && recipe.displayName() === snapshot.name && unchanged(recipe));
}
