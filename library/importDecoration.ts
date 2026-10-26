import type {RecipeSource} from "./recipeIdentity";
import {accentGroupFor} from "./accent";
import {fermentationFrom, processFrom, roastFrom} from "./brew/beanTags";
import {podImageUrl, type PodCoffee} from "./podCoffee";
import {roasterAccent} from "./roasterColour";

export type ImportCandidate = {
    source: RecipeSource;
    recipeUrl?: string;
    name: string;
    tags: string[];
    accentIndex?: number;
    coffee?: PodCoffee;
    imageURL?: string;
    isTea(): boolean;
    setTags(tags: unknown): void;
};

/**
 * What an import link adds to the recipe it points at (issue #159).
 *
 * Kept out of the import hook because none of it is about React: it is a
 * statement about a recipe, and a statement about a recipe belongs in
 * `library/` where it can be tested without a renderer.
 */
export type ImportDecoration = {
    coffee?: PodCoffee;
    source?: RecipeSource;
    /** `recipe.url`: the producer's own page for this recipe. */
    recipeUrl?: string;
    /**
     * `recipe.name`: the producer's name for this recipe. Written to `name`,
     * never to `xbloomName`, which stays what xBloom published.
     */
    recipeName?: string;
    tags?: readonly string[];
    colour?: string;
    /** A validated catalogue URL, followed only after this import succeeds. */
    feed?: string;
};

/**
 * Tags worth deriving from a coffee.
 *
 * Only the three closed vocabularies, and the tag is always the app's own
 * spelling of the term rather than the sender's. Case, separators and the
 * order of a compound level are all folded away first, so a coffee sent as
 * "dark medium" groups with one sent as `Medium-Dark` instead of quietly
 * sitting in a shelf of one. What the tag cannot do is guess: a value naming
 * no member is left untagged, which is the rule `roastFrom` enforces.
 *
 * The bean record itself keeps the sender's wording. That copy is on its way
 * to Beanconqueror and is what the roaster wrote; only the tag, which exists
 * to group, is normalised.
 *
 * Roaster, origin, farm and the rest are deliberately not tagged, per #159. A
 * tag is for grouping recipes, and a tag list that mirrors the bean record is
 * a second copy of data that already has a home, with a per-recipe cap it
 * would spend on values no two recipes share.
 */
function tagsFrom(coffee: Partial<PodCoffee>): string[] {
    const tags: string[] = [];
    const roast = roastFrom(coffee.roast);
    if (roast !== undefined) tags.push(roast);
    const process = processFrom(coffee.processing);
    if (process !== undefined) tags.push(process);
    const fermentation = fermentationFrom(coffee.fermentation);
    if (fermentation !== undefined) tags.push(fermentation);
    return tags;
}

/**
 * Apply an import link's decoration to the recipe it fetched.
 *
 * Mutates, in keeping with the way a `Recipe` is handled everywhere else in
 * this app, and returns the same object so a caller can read as an expression.
 *
 * The caller must apply this to the *candidate*, before de-duplication. When
 * the link points at a recipe already in the library, the stored recipe wins:
 * a link should not quietly rewrite a recipe the user may have edited. The
 * stored recipe is not frozen, though. `fillImportBlanks` below gives it what
 * the link carries in the places it has nothing, and only there.
 */
export function decorateImport<T extends ImportCandidate>(recipe: T, decoration: ImportDecoration): T {
    const {coffee, source, recipeUrl, recipeName, tags, colour} = decoration;
    if (source !== undefined) recipe.source = source;
    if (recipeUrl !== undefined) recipe.recipeUrl = recipeUrl;
    // `name`, not `xbloomName`. `displayName()` already prefers `name`, so the
    // recipe reads as the producer called it, while xBloom's own title stays
    // cached underneath for USE THIS NAME to restore.
    if (recipeName !== undefined) recipe.name = recipeName;
    if (tags !== undefined && tags.length > 0) recipe.setTags([...recipe.tags, ...tags]);
    if (colour !== undefined && recipe.accentIndex === undefined) {
        const index = roasterAccent(colour, accentGroupFor(recipe));
        if (index !== null) recipe.accentIndex = index;
    }
    if (coffee === undefined) return recipe;

    recipe.coffee = coffee;

    // The coffee's picture becomes the recipe's, but only where the recipe has
    // none of its own. `XBloomRecipe` sets `imageURL` from the pod's coffee or
    // its artwork before this runs, so a pod recipe already has a picture and
    // keeps it: real pod artwork is a better likeness than a bag shot, and it
    // is what the recipe showed before links existed. A share-link import of
    // a recipe made without a pod has no artwork, so without this the link's
    // `bean.image` reached Beanconqueror and never the app's own screen. (A
    // share link to a pod-made recipe carries `podsVo`, and the pod wins.)
    //
    // Through `podImageUrl`, the rule every other picture on a recipe passes,
    // although the coffee has already been through it in `podCoffeeFromStored`.
    // That is the point: this is a second door into `imageURL`, and the rule
    // should be visible at the door rather than inferred from another file.
    if ((recipe.imageURL ?? "") === "") {
        const picture = podImageUrl(coffee.imageUrl);
        if (picture !== undefined) recipe.imageURL = picture;
    }

    // Through `setTags`, never by assignment, so the result is normalised and
    // capped. Existing tags are kept: the fetched recipe's own tags are not
    // this link's to discard.
    const derived = tagsFrom(coffee);
    if (derived.length > 0) recipe.setTags([...recipe.tags, ...derived]);
    return recipe;
}

/**
 * Fill the blanks on a stored recipe from an import link that points at it.
 *
 * Without this, a recipe first imported before a link could carry a picture
 * (or a coffee at all) never gets one: the link resolves to the stored copy,
 * `decorateImport` only ever touched the candidate, and the user re-imports
 * and still sees no photo.
 *
 * The rule is that a link may write into an empty place and nowhere else.
 * Everything here is something the stored recipe does not have, so nothing the
 * user wrote, chose or kept can be lost by it:
 *
 * - `imageURL`, when the recipe has no picture, from the link's coffee and
 *   through `podImageUrl` like every other way in.
 * - `coffee`, whole, when the recipe has none.
 * - each field of an existing coffee that is missing or blank. A field with a
 *   value is never replaced, even by a different one.
 * - `recipeUrl`, when the recipe has none.
 * - tags, only when the recipe has none at all and only from the coffee
 *   fields this call just filled. A recipe with tags has had them chosen or
 *   kept; one whose coffee gained nothing gains no tags either, so emptying
 *   the tag list stays an answer a re-import respects.
 *
 * Never the name: `recipeName` may be the producer's, but the stored name may
 * be one the user typed, and an empty name is not a blank here, it means
 * follow the pod. Never the source either: where a recipe first came from is
 * history, not a blank.
 *
 * Returns whether anything changed, so the caller saves only when it must.
 */
export function fillImportBlanks(recipe: ImportCandidate, decoration: ImportDecoration): boolean {
    const {coffee, recipeUrl} = decoration;
    let changed = false;

    if (recipeUrl !== undefined && (recipe.recipeUrl ?? "") === "") {
        recipe.recipeUrl = recipeUrl;
        changed = true;
    }
    if (coffee === undefined) return changed;

    const filled: Partial<PodCoffee> = {};
    if (recipe.coffee === undefined) {
        recipe.coffee = {...coffee};
        Object.assign(filled, coffee);
    } else {
        const held = recipe.coffee as Record<string, unknown>;
        for (const [key, value] of Object.entries(coffee)) {
            if (value === undefined || (typeof value === "string" && value.trim() === "")) continue;
            const current = held[key];
            if (current !== undefined && !(typeof current === "string" && current.trim() === "")) continue;
            held[key] = value;
            (filled as Record<string, unknown>)[key] = value;
        }
    }
    if (Object.keys(filled).length > 0) changed = true;

    if ((recipe.imageURL ?? "") === "") {
        const picture = podImageUrl(recipe.coffee.imageUrl);
        if (picture !== undefined) {
            recipe.imageURL = picture;
            changed = true;
        }
    }

    if (recipe.tags.length === 0) {
        const derived = tagsFrom(filled);
        if (derived.length > 0) {
            recipe.setTags(derived);
            changed = true;
        }
    }
    return changed;
}
