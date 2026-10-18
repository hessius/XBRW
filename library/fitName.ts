/**
 * Fitting a long recipe name under the name ceiling without making it wrong.
 *
 * Roasters name coffees in full ("Colombia | El Diviso | Nestor Lasso | Aji
 * Bourbon Natural (Tropical Fruit Forward Lush) (Competition Coffee)"), and
 * with a dose suffix such a name runs past the 100 characters a recipe name
 * may have. Dropping it left the recipe on xBloom's own name, which for a
 * roaster's account is whatever was typed there ("col Java hydrohoney -18g").
 *
 * So shorten it the way a person would, never cutting a word in half: drop
 * the bracketed asides at the end first, one at a time, and only then cut at
 * the last whole word, with an ellipsis to say it was cut. The suffix (the
 * dose, " - 18g") is always kept, because it is what tells two recipes for
 * one coffee apart.
 *
 * Nothing here knows any roaster. It is used by the catalogue and by an
 * import link's `recipe.name`.
 */

/**
 * The default ceiling, in characters. The same value as `MAX_NAME` in
 * `library/Recipe.ts` (the rename sheet's limit); a test holds the two equal.
 * Restated rather than imported so this module stands on its own.
 */
export const FIT_NAME_MAX = 100;

const ELLIPSIS = "…";

/** One trailing "(...)" group and the space before it. */
const TRAILING_GROUP = /\s*\([^()]*\)\s*$/;

/** Separators left dangling at the end once words are cut: " |", " -", ",". */
const DANGLING = /[\s|,;:\-–—/·]+$/u;

function fold(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * `name` + `suffix`, shortened to at most `max` characters.
 *
 * 1. If it fits, it is returned as it is (whitespace folded).
 * 2. Otherwise trailing "(...)" groups are removed from the end of the name,
 *    one at a time, until it fits.
 * 3. Otherwise the name is cut after the last whole word that fits, any
 *    separator left at the end is dropped, and "…" goes before the suffix.
 *
 * A name that is one unbroken word longer than the room left is the one case
 * cut inside a word, since there is no word boundary to cut at.
 */
export function fitName(name: string, suffix = "", max = FIT_NAME_MAX): string {
    let base = fold(name);
    const full = `${base}${suffix}`;
    if (full.length <= max) return full;
    if (suffix.length >= max) return full.slice(0, max);

    while (TRAILING_GROUP.test(base)) {
        const shorter = fold(base.replace(TRAILING_GROUP, ""));
        if (shorter === "") break;
        base = shorter;
        if (`${base}${suffix}`.length <= max) return `${base}${suffix}`;
    }

    const room = max - suffix.length - ELLIPSIS.length;
    if (room <= 0) return suffix.slice(0, max);
    // A space at index `room` means the first `room` characters end on a whole word.
    const cutAt = base.lastIndexOf(" ", room);
    const kept = cutAt > 0 ? base.slice(0, cutAt).replace(DANGLING, "") : "";
    const head = kept === "" ? base.slice(0, room) : kept;
    return `${head}${ELLIPSIS}${suffix}`;
}

/**
 * Fit a name that may already end in a dose suffix such as " - 18g", keeping
 * that suffix whole. An import link's `recipe.name` arrives this way.
 */
export function fitSizedName(name: string, max = FIT_NAME_MAX): string {
    const folded = fold(name);
    const sized = /^(.*\S)( - \d+(?:[.,]\d+)?\s?g)$/i.exec(folded);
    return sized === null ? fitName(folded, "", max) : fitName(sized[1], sized[2], max);
}
