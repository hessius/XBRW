import {parseImportInput} from "@/library/importInput";
import {coffeeRef, readCatalogue, recipesForMachine} from "@/library/roasterCatalogue";
import type {FeedCoffee, RoasterFeed} from "@/library/roasterFeed";
import {EMPTY_COFFEE_QUERY, filterCoffees} from "@/library/roasterFilters";
import {addToLibrary, fetchCoffeeRecipe, recipeName, type LibraryDeps} from "@/library/roasterRecipes";
import {parseSubscriptions} from "@/library/roasterSubscription";
import type Recipe from "@/library/Recipe";
import type {Settings} from "@/library/Settings";
import type {MachineModel} from "@/library/machine/machineModel";
import {slotRecipeProblem} from "@/library/slots/slotSource";

export class SlotRecipeError extends Error {}

/**
 * Searching the subscribed roasters' cached catalogues for a recipe to use.
 *
 * The Easy Mode picker searches the library first; these are the roasters'
 * coffees under it, as FROM YOUR ROASTERS. Only the cached feeds are read, so
 * opening the picker or typing in it costs no request. A recipe is fetched
 * from xBloom only when one is picked.
 */

/** A subscribed roaster's cached feed. */
export type SubscribedCatalogue = {feedUrl: string; roaster: string; feed: RoasterFeed};

/** One of a coffee's recipes, by size, that the search found. */
export type RoasterRecipeChoice = {
    /** Stable across renders: the feed, the coffee and the size. */
    key: string;
    feedUrl: string;
    roaster: string;
    coffee: FeedCoffee;
    size: string;
    /** What the recipe will be called in the library, "{coffee} - {size}". */
    name: string;
};

/** The most rows the section shows, so a short term cannot list a whole catalogue. */
export const MAX_ROASTER_CHOICES = 30;

/** Every subscription with a readable cached feed, in subscription order. */
export function subscribedCatalogues(settings: Settings): SubscribedCatalogue[] {
    return parseSubscriptions(settings.get("roasterSubscriptions")).flatMap((sub) => {
        const cached = readCatalogue(settings, sub.feed);
        return cached === null ? [] : [{feedUrl: sub.feed, roaster: cached.feed.roaster.name, feed: cached.feed}];
    });
}

function shareIdOf(share: string): string | null {
    const source = parseImportInput(share);
    return source?.kind === "share" ? source.id : null;
}

/**
 * The roasters' recipes that answer `term`, one row per coffee and size.
 *
 * A coffee matches the same way it does in the roaster's own list
 * (`filterCoffees`), and every coffee matches when the term names the
 * roaster. On sale first, sold out after: a slot is for a coffee the person
 * may already have. A recipe the library already holds (the same share link)
 * is left out, because the library's own results show it. Nothing for an
 * empty term.
 */
export function searchRoasterRecipes(
    catalogues: readonly SubscribedCatalogue[], term: string, library: readonly Recipe[] = [],
    machineModel: MachineModel = "studio"
): RoasterRecipeChoice[] {
    const wanted = term.trim().toLocaleLowerCase();
    if (wanted === "") return [];
    const held = new Set(library.map((recipe) => recipe.shareId.trim()).filter((id) => id !== ""));
    const choices: RoasterRecipeChoice[] = [];
    for (const {feedUrl, roaster, feed} of catalogues) {
        const query = {...EMPTY_COFFEE_QUERY, inStock: false};
        const coffees = roaster.toLocaleLowerCase().includes(wanted)
            ? filterCoffees(feed.coffees, query)
            : filterCoffees(feed.coffees, {...query, term: wanted});
        for (const coffee of coffees) {
            for (const recipe of recipesForMachine(coffee, machineModel)) {
                const id = shareIdOf(recipe.share);
                if (id !== null && held.has(id)) continue;
                choices.push({
                    key: `${feedUrl}|${coffeeRef(feed, coffee)}|${recipe.size}`,
                    feedUrl, roaster, coffee, size: recipe.size,
                    name: recipeName(coffee, recipe.size)
                });
            }
        }
    }
    const onSale = choices.filter((choice) => choice.coffee.available);
    const soldOut = choices.filter((choice) => !choice.coffee.available);
    return [...onSale, ...soldOut].slice(0, MAX_ROASTER_CHOICES);
}

/**
 * Fetch a picked roaster recipe and keep it in the library, for a slot.
 *
 * The same path as ADD TO SHELF on the coffee's own screen, without the
 * shelf: the latest recipe from xBloom, saved new, or matched to the copy the
 * library already has (an untouched older copy takes the latest). A copy the
 * person has edited is used as it is rather than asking here; the coffee's
 * own screen is where they choose the roaster's latest. Either way the slot
 * snapshots a recipe the library holds, so its link holds.
 */
export async function saveRoasterChoice(
    choice: RoasterRecipeChoice, deps: LibraryDeps, settings: Settings, signal?: AbortSignal
): Promise<Recipe> {
    const fetched = await fetchCoffeeRecipe(
        choice.coffee, choice.size, deps, signal, choice.roaster, "studio"
    );
    const problem = slotRecipeProblem(fetched.recipe);
    if (problem !== null) throw new SlotRecipeError(problem);
    const outcome = addToLibrary(fetched, deps, settings);
    const recipe = outcome.kind === "ask" ? outcome.held : outcome.recipe;
    const retainedProblem = slotRecipeProblem(recipe);
    if (retainedProblem !== null) throw new SlotRecipeError(retainedProblem);
    return recipe;
}
