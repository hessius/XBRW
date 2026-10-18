import {assignAccent} from "@/library/accent";
import {fitName} from "@/library/fitName";
import {parseHidden, serialiseHidden} from "@/library/hiddenShelves";
import {decorateImport} from "@/library/importDecoration";
import {parseImportInput} from "@/library/importInput";
import {planReimport, readPrints, rememberPrint, takeLatest} from "@/library/importRefresh";
import {tagFilterId} from "@/library/libraryFilters";
import type Recipe from "@/library/Recipe";
import {chooseRecipe} from "@/library/roasterCatalogue";
import type {FeedCoffee} from "@/library/roasterFeed";
import type {Settings} from "@/library/Settings";
import {withRoastAdvice} from "@/library/restPeak";

/**
 * Putting a roaster catalogue coffee into the library.
 *
 * Every action fetches the recipe from xBloom at the moment the user asks,
 * through the same share lookup and decoration an import link uses, so what
 * lands is the roaster's latest. Nothing here runs on a timer or during a
 * sync: apps do not poll xBloom for catalogue recipes.
 */

export type LibraryDeps = {
    /** Look a share link up. Null when xBloom has no recipe there. */
    fetchRecipe: (share: string, signal?: AbortSignal) => Promise<Recipe | null>;
    /** The whole library. */
    stored: () => Recipe[];
    save: (recipe: Recipe) => void;
};

function shareIdOf(share: string): string | null {
    const source = parseImportInput(share);
    return source?.kind === "share" ? source.id : null;
}

/**
 * "{coffee} - {size}", the name a roaster's own import links use, fitted under
 * the name ceiling (`fitName`): a long name loses its trailing bracketed
 * asides, then whole words, and always keeps the size.
 */
export function recipeName(coffee: FeedCoffee, size: string): string {
    return fitName(coffee.name, ` - ${size}`);
}

export type FetchedCoffee = {recipe: Recipe; size: string};

/**
 * Fetch one of a coffee's recipes from xBloom and dress it as an import.
 *
 * Not saved. The caller decides whether this is a brew, an addition to the
 * library or a shelf, which is the whole point of a catalogue.
 */
export async function fetchCoffeeRecipe(
    coffee: FeedCoffee, size: string | undefined, deps: Pick<LibraryDeps, "fetchRecipe">,
    signal?: AbortSignal
): Promise<FetchedCoffee> {
    const chosen = chooseRecipe(coffee, size);
    const recipe = await deps.fetchRecipe(chosen.share, signal);
    if (recipe === null) throw new Error("xBloom has no recipe at that link.");
    // A recipe that cannot produce card bytes would slip past every later
    // check as identity-less, the same rule the import sheet keeps.
    recipe.fingerprint();
    if (recipe.shareId.trim() === "") recipe.shareId = shareIdOf(chosen.share) ?? "";
    // Through the import link's own decoration, so the coffee, its tags and
    // anything that path learns to do later (the picture, in #223) arrive the
    // same way here, the name included. The roaster's rest and peak days ride
    // on the coffee, so the bag sheet shows them instead of asking
    // (`startingFigures`). The feed keeps its flavours beside the coffee
    // block; the recipe keeps them on its coffee, where ABOUT reads them.
    const withFlavours = coffee.flavours.length > 0
        ? {...coffee.coffee, flavours: coffee.flavours}
        : coffee.coffee;
    decorateImport(recipe, {coffee: withRoastAdvice(withFlavours, coffee.roast ?? {}),
                            source: "import", tags: coffee.tags,
                            recipeName: recipeName(coffee, chosen.size)});
    return {recipe, size: chosen.size};
}

export type AddOutcome =
    | {kind: "added"; recipe: Recipe}
    | {kind: "already"; recipe: Recipe}
    | {kind: "updated"; recipe: Recipe}
    /** The user edited their copy and the roaster's moved on: ask before touching it. */
    | {kind: "ask"; held: Recipe; latest: Recipe};

/**
 * Put a fetched catalogue recipe into the library.
 *
 * The same rules as importing a link again (`library/importRefresh.ts`): new
 * is saved, identical is left, an untouched older copy takes the latest
 * quietly, and an edited one is handed back for the user to decide.
 */
export function addToLibrary(
    fetched: FetchedCoffee, deps: Pick<LibraryDeps, "stored" | "save">, settings: Settings
): AddOutcome {
    const stored = deps.stored();
    const plan = planReimport(stored, fetched.recipe, readPrints(settings));
    switch (plan.kind) {
        case "same":
            if (adoptName(plan.recipe, fetched.recipe)) deps.save(plan.recipe);
            return {kind: "already", recipe: plan.recipe};
        case "replace": {
            const recipe = takeLatest(plan.held, fetched.recipe);
            adoptName(recipe, fetched.recipe);
            deps.save(recipe);
            rememberPrint(settings, recipe);
            return {kind: "updated", recipe};
        }
        case "ask":
            return {kind: "ask", held: plan.held, latest: fetched.recipe};
        default: {
            const recipe = fetched.recipe;
            assignAccent(recipe, stored);
            deps.save(recipe);
            rememberPrint(settings, recipe, stored.map((entry) => entry.uuid));
            return {kind: "added", recipe};
        }
    }
}

/**
 * Give a library copy the catalogue's name when it has none of its own.
 *
 * An empty name follows xBloom's, which for a roaster's recipe is whatever
 * the roaster's account typed ("col Java hydrohoney -18g"). A copy that
 * arrived before the catalogue named it, or through a link that did not, kept
 * that. Taking it from the catalogue is an action the user asked for, and a
 * name they typed is never replaced. A name equal to xBloom's own counts as
 * none: it is how such a copy reads, and nobody typed it.
 */
export function adoptName(held: Recipe, fetched: Recipe): boolean {
    const name = held.name.trim();
    // Still following xBloom: empty, or exactly xBloom's own name, which is
    // what a copy holds when an earlier build or a too-long link name left it
    // there. Either way it is not a name the user chose.
    const followsXBloom = name === "" || (held.xbloomName.trim() !== "" && name === held.xbloomName.trim());
    if (!followsXBloom || fetched.name.trim() === "" || fetched.name === held.name) return false;
    held.name = fetched.name;
    return true;
}

/** "Use the roaster's latest" on an edited copy. Their name, notes and brews stay. */
export function takeRoasterLatest(
    held: Recipe, latest: Recipe, deps: Pick<LibraryDeps, "save">, settings: Settings
): Recipe {
    const recipe = takeLatest(held, latest);
    adoptName(recipe, latest);
    deps.save(recipe);
    rememberPrint(settings, recipe);
    return recipe;
}

/**
 * Where the bag feature will attach what was bought: the bag size and its
 * roast date, against the recipe it was shelved with. Not built here; the
 * shelf action returns this so a bag store has one place to hook in. The
 * sizes and prices to offer come from `bagChoices` and `variantForGrams` in
 * `library/roasterBuy.ts`, which are feed-only and need no bag store.
 *
 * The roaster's rest and peak advice already arrives: `fetchCoffeeRecipe`
 * lays the feed's `roast` days onto `recipe.coffee`, and the bag sheet reads
 * them from there when the person adds a bag.
 */
export type BagAttachment = {
    recipeUuid: string;
    shelf: string;
    // TODO(bags): bagGrams and roastDate, to add the bag at shelving time.
};

/**
 * Put a library recipe on a shelf, marking the shelf as one the user made.
 *
 * Only the tag changes, and only because the user asked. The shelf goes
 * first in the tags so the per-recipe tag cap can never be what drops it.
 */
export function addToShelf(
    recipe: Recipe, shelf: string, deps: Pick<LibraryDeps, "save">, settings: Settings
): BagAttachment {
    recipe.setTags([shelf, ...recipe.tags]);
    deps.save(recipe);
    settings.set("myShelves",
        serialiseHidden([...parseHidden(settings.get("myShelves")), tagFilterId(shelf)]));
    return {recipeUuid: recipe.uuid, shelf};
}
