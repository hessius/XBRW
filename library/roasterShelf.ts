import {assignAccent} from "@/library/accent";
import {decorateImport} from "@/library/importDecoration";
import {parseImportInput} from "@/library/importInput";
import type {PodCoffee} from "@/library/podCoffee";
import Recipe, {MAX_TAG_LENGTH} from "@/library/Recipe";
import type {RoasterFeed} from "@/library/roasterFeed";
import type {SubscriptionItem} from "@/library/roasterSubscription";

/**
 * Keeping a roaster shelf in step with the roaster's feed.
 *
 * Two halves, both plain TypeScript. `planRoasterSync` decides what a sync
 * would do, against the library and the subscription as they stand, so the
 * first prompt can say how many coffees it is about. `runRoasterSync` does
 * it, importing through the same share endpoint and the same decoration an
 * import link uses.
 *
 * A shelf is a tag the user owns (`library/shelves.ts`), so "put a coffee on
 * the shelf" is "put the roaster's name in its tags", and the caller marks the
 * shelf in `myShelves`. A sync never deletes a recipe and never changes one's
 * brewing content. The only edit it makes to a recipe already in the library
 * is adding the shelf tag, once, to a coffee the subscription has not seen
 * before.
 *
 * Recipe updates are deliberately not followed. Telling whether the roaster
 * changed a recipe on xBloom means fetching every share on every sync, thirty
 * requests where one would do, against an endpoint whose limits nobody
 * knows. That wants a per-recipe change marker in the feed first.
 */

/** The dose added by default, when a coffee offers it. */
export const DEFAULT_SIZE = "18g";

/**
 * How many share lookups run at once.
 *
 * Two, not one and not ten. The share endpoint is xBloom's and its limits are
 * unknown (the hub saves one at a time for that reason), but a shelf of
 * thirty one at a time is a long wait for something the user asked for in a
 * single tap. Two halves the wait and stays polite.
 */
export const SHELF_CONCURRENCY = 2;

export type ShelfItem = {
    coffeeName: string;
    coffeeId?: string;
    /** `{coffee name} - {size}`, the name the roaster's own links use. */
    recipeName: string;
    share: string;
    shareId: string;
    coffee: PodCoffee;
};

/** A feed coffee the library already holds, to be put on the shelf. */
export type AdoptItem = {
    uuid: string;
    shareId: string;
    coffeeId?: string;
};

export type SyncPlan = {
    roaster: string;
    /** The tag, and so the shelf's name. */
    shelf: string;
    /** Available coffees new to the subscription and missing from the library. */
    add: ShelfItem[];
    /** Available coffees new to the subscription that the library already holds. */
    adopt: AdoptItem[];
    /** Share ids of tracked coffees the feed no longer lists as available. */
    soldOut: string[];
};

function sizeKey(size: string): string {
    return size.replace(/\s+/g, "").toLowerCase();
}

function shareIdOf(share: string): string | null {
    const source = parseImportInput(share);
    return source?.kind === "share" ? source.id : null;
}

/**
 * The shelf's name: the roaster's, fitted to a tag.
 *
 * Cut rather than refused when it is too long, unlike a field from a link,
 * because this is a label the app is choosing, not a fact it is recording.
 */
export function shelfName(roaster: string): string {
    return roaster.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
}

/**
 * What a sync would do.
 *
 * Only coffees the feed marks available are added, one recipe each: the
 * 18 g one, or the first the coffee lists when it has no 18 g recipe.
 *
 * Identity is the share id, the one the account import
 * (`library/cloud/importPlan.ts`) matches on, and deliberately not the brew
 * fingerprint `duplicates.ts` uses: a roaster commonly gives several coffees
 * the very same recipe, and matching on the numbers would call the second
 * coffee a duplicate of the first. A coffee is tracked when its feed id or
 * any of its recipes' share ids is in the subscription, and held when any of
 * its share ids is on a recipe in the library.
 *
 * A tracked coffee is sold out when the feed no longer offers it as
 * available, whether it is marked unavailable or gone from the feed
 * altogether. Coming back in stock simply drops it from the list again.
 */
export function planRoasterSync(
    feed: RoasterFeed,
    stored: readonly Recipe[],
    tracked: readonly SubscriptionItem[] = []
): SyncPlan {
    const trackedShares = new Set(tracked.map((entry) => entry.shareId));
    const trackedIds = new Set(tracked.flatMap((entry) =>
        entry.coffeeId === undefined ? [] : [entry.coffeeId]));
    const held = new Map<string, string>();
    for (const recipe of stored) {
        const id = recipe.shareId.trim();
        if (id !== "" && !held.has(id)) held.set(id, recipe.uuid);
    }

    const availableShares = new Set<string>();
    const availableIds = new Set<string>();
    const seen = new Set<string>();
    const add: ShelfItem[] = [];
    const adopt: AdoptItem[] = [];

    for (const coffee of feed.coffees) {
        if (!coffee.available) continue;
        const shares = coffee.recipes
            .map((recipe) => shareIdOf(recipe.share))
            .filter((id): id is string => id !== null);
        for (const id of shares) availableShares.add(id);
        if (coffee.id !== undefined) availableIds.add(coffee.id);

        const isTracked = (coffee.id !== undefined && trackedIds.has(coffee.id))
            || shares.some((id) => trackedShares.has(id));
        // Two coffees in one feed pointing at the same recipe are one recipe.
        if (isTracked || shares.some((id) => seen.has(id))) continue;
        for (const id of shares) seen.add(id);

        const heldShare = shares.find((id) => held.has(id));
        if (heldShare !== undefined) {
            const entry: AdoptItem = {uuid: held.get(heldShare) ?? "", shareId: heldShare};
            if (coffee.id !== undefined) entry.coffeeId = coffee.id;
            adopt.push(entry);
            continue;
        }

        const chosen = coffee.recipes.find((recipe) => sizeKey(recipe.size) === DEFAULT_SIZE)
            ?? coffee.recipes[0];
        const shareId = shareIdOf(chosen.share);
        if (shareId === null) continue;
        const item: ShelfItem = {
            coffeeName: coffee.name,
            recipeName: `${coffee.name} - ${chosen.size}`,
            share:      chosen.share,
            shareId,
            coffee:     coffee.coffee
        };
        if (coffee.id !== undefined) item.coffeeId = coffee.id;
        add.push(item);
    }

    const soldOut = tracked
        .filter((entry) =>
            !(entry.coffeeId !== undefined && availableIds.has(entry.coffeeId))
            && !availableShares.has(entry.shareId))
        .map((entry) => entry.shareId);

    return {
        roaster: feed.roaster.name,
        shelf:   shelfName(feed.roaster.name),
        add, adopt, soldOut
    };
}

export type SyncOutcome = {
    /** Recipes imported and written to the library. */
    added: number;
    /** Recipes already in the library that were put on the shelf. */
    adopted: number;
    /** The coffees that did not land, by name, so the report can say which. */
    failed: string[];
    /** True when the user stopped it before every coffee was tried. */
    cancelled: boolean;
    /** Coffees now dealt with, to remember in the subscription. */
    tracked: SubscriptionItem[];
};

export type ShelfDeps = {
    /** Look a share link up. Null when xBloom has no recipe there. */
    fetchRecipe: (share: string, signal: AbortSignal) => Promise<Recipe | null>;
    /** The whole library, read at the moment a recipe is written. */
    stored: () => Recipe[];
    save: (recipe: Recipe) => void;
};

function trackedItem(shareId: string, coffeeId?: string): SubscriptionItem {
    return coffeeId === undefined ? {shareId} : {shareId, coffeeId};
}

/**
 * Carry out a plan, a few lookups at a time, reporting as each one settles.
 *
 * Coffees the library already holds are shelved first, since that needs no
 * network. A failed import is recorded by name and the rest carry on: one
 * coffee whose recipe xBloom has since removed should not cost the user the
 * other twenty-nine. A failed coffee is not tracked, so the next sync tries
 * it again. Cancelling stops new lookups and abandons the ones in flight;
 * recipes already written stay written, and on the shelf.
 */
export async function runRoasterSync(
    plan: SyncPlan,
    deps: ShelfDeps,
    options: {
        signal?: AbortSignal;
        concurrency?: number;
        onProgress?: (done: number, total: number) => void;
    } = {}
): Promise<SyncOutcome> {
    const {signal, concurrency = SHELF_CONCURRENCY, onProgress} = options;
    const controller = new AbortController();
    const stop = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", stop);

    const outcome: SyncOutcome = {added: 0, adopted: 0, failed: [], cancelled: false, tracked: []};

    // The shelf first in the tags, so the per-recipe tag cap can never be
    // what drops it. Only the tags change: nothing a brew reads is touched.
    const shelve = (recipe: Recipe) => recipe.setTags([plan.shelf, ...recipe.tags]);

    for (const entry of plan.adopt) {
        const recipe = deps.stored().find((candidate) => candidate.uuid === entry.uuid);
        if (recipe === undefined) continue;
        try {
            shelve(recipe);
            deps.save(recipe);
            outcome.adopted += 1;
            outcome.tracked.push(trackedItem(entry.shareId, entry.coffeeId));
        } catch {
            // Left untracked, so the next sync offers it the shelf again.
        }
    }

    const total = plan.add.length;
    let next = 0;
    let done = 0;

    async function addOne(item: ShelfItem): Promise<void> {
        const candidate = await deps.fetchRecipe(item.share, controller.signal);
        if (controller.signal.aborted) return;
        if (candidate === null) throw new Error("xBloom has no recipe at that link.");
        // A recipe that cannot produce card bytes would slip past every
        // later check as identity-less, the same rule the import sheet keeps.
        candidate.fingerprint();

        const stored = deps.stored();
        const shareId = candidate.shareId.trim() || item.shareId;
        const already = stored.find((recipe) => recipe.shareId.trim() === shareId);
        if (already !== undefined) {
            // Arrived some other way while this ran: shelve it like any
            // other held coffee rather than importing a twin.
            shelve(already);
            deps.save(already);
            outcome.adopted += 1;
            outcome.tracked.push(trackedItem(item.shareId, item.coffeeId));
            return;
        }
        candidate.shareId = shareId;

        // Through the import link's own decoration, so the coffee, its tags
        // and anything that path learns to do later (the picture, in #223)
        // arrive the same way here.
        decorateImport(candidate, {coffee: item.coffee, source: "import"});
        candidate.name = item.recipeName;
        shelve(candidate);
        assignAccent(candidate, stored);
        deps.save(candidate);
        outcome.added += 1;
        outcome.tracked.push(trackedItem(item.shareId, item.coffeeId));
    }

    async function worker(): Promise<void> {
        while (!controller.signal.aborted && next < total) {
            const item = plan.add[next++];
            try {
                await addOne(item);
            } catch {
                if (!controller.signal.aborted) outcome.failed.push(item.coffeeName);
            }
            if (controller.signal.aborted) return;
            done += 1;
            onProgress?.(done, total);
        }
    }

    try {
        const workers = Math.max(1, Math.min(concurrency, total));
        if (total > 0) await Promise.all(Array.from({length: workers}, worker));
    } finally {
        signal?.removeEventListener("abort", stop);
    }

    outcome.cancelled = controller.signal.aborted && done < total;
    return outcome;
}
