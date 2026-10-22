import {canonicalShelfId, parseHidden} from "@/library/hiddenShelves";
import {parseImportInput} from "@/library/importInput";
import {tagFilterId} from "@/library/libraryFilters";
import {asMachineModel} from "@/library/machine/machineModel";
import RecipeDatabase from "@/library/RecipeDatabase";
import {dropAlerts, recordSubscribed, recordSync} from "@/library/roasterAlerts";
import {dropCatalogue, writeCatalogue} from "@/library/roasterCatalogue";
import {
    fetchRoasterFeedBody, RoasterFeedError, type FeedCoffee, type RoasterFeed
} from "@/library/roasterFeed";
import type {LibraryDeps} from "@/library/roasterRecipes";
import {IMPORT_ROASTER_LIMIT} from "@/library/roasterImport";
import {
    isDue, parseSubscriptions, serialiseSubscriptions, subscriptionFor, withSubscription,
    withoutSubscription, type RoasterSubscription, type SyncError
} from "@/library/roasterSubscription";
import type {Settings} from "@/library/Settings";
import {XBloomRecipe} from "@/library/XBloomRecipe";

/**
 * Subscribing to a roaster feed and keeping its catalogue fresh, outside React.
 *
 * Outside React because three places start a sync: the library on open and on
 * returning to the foreground, an import link for a feed already subscribed
 * to, and REFRESH NOW. One module and one lock means two of them can never
 * sync the same feed at once.
 *
 * A sync reads the roaster's feed, refreshes the cached catalogue and notes
 * what is new or back in it (`library/roasterAlerts.ts`), and that is all.
 * It never asks xBloom for anything and never touches the library: recipes
 * are fetched when the user opens a coffee, imports, adds or brews it.
 *
 * Settings are read fresh before every write. A sync takes seconds, and the
 * user can pause or unsubscribe in the meantime.
 */

export type SyncDeps = {
    settings: Settings;
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
};

export type SyncResult =
    | {
        ok: true; feed: RoasterFeed; subscription: RoasterSubscription;
        /** Watched coffees this sync found back on sale, to be announced once. */
        back: FeedCoffee[];
    }
    | {ok: false; reason: "busy" | "notDue" | "missing" | "paused" | SyncError};

let running = false;

/** The live dependencies: the share endpoint and the recipe table. */
export function realLibraryDeps(settings: Settings): LibraryDeps {
    let store: RecipeDatabase | null = null;
    const open = () => (store ??= new RecipeDatabase());
    return {
        fetchRecipe: async (share, signal) => {
            const source = parseImportInput(share);
            if (source === null) return null;
            // Read per lookup, like the import sheet, so the grind that comes
            // back is the one for the machine the user has now.
            const importer = new XBloomRecipe(source, asMachineModel(settings.get("machineModel")));
            await importer.fetchRecipeDetail(signal);
            return importer.getRecipe();
        },
        stored: () => open().retrieveAllRecipes() ?? [],
        save:   (recipe) => open().updateRecipe(recipe.uuid, recipe)
    };
}

export function readSubscriptions(settings: Settings): RoasterSubscription[] {
    return parseSubscriptions(settings.get("roasterSubscriptions"));
}

function writeSubscription(settings: Settings, next: RoasterSubscription): void {
    settings.set("roasterSubscriptions",
        serialiseSubscriptions(withSubscription(readSubscriptions(settings), next)));
}

/** Change one stored subscription, if it is still there. */
export function updateSubscription(
    settings: Settings, feedUrl: string,
    change: (sub: RoasterSubscription) => RoasterSubscription
): RoasterSubscription | undefined {
    const current = subscriptionFor(readSubscriptions(settings), feedUrl);
    if (current === undefined) return undefined;
    const next = change(current);
    writeSubscription(settings, next);
    return next;
}

/**
 * Record a subscription and cache the feed it was offered from.
 *
 * Nothing is imported. The roaster's coffees are now in the catalogue, and
 * what goes into the library is the user's choice, one coffee at a time.
 */
export function subscribe(
    settings: Settings, feedUrl: string, feed: RoasterFeed, body: string, now: number
): RoasterSubscription {
    const existing = subscriptionFor(readSubscriptions(settings), feedUrl);
    const sub: RoasterSubscription = existing ?? {
        feed: feedUrl, roaster: feed.roaster.name, lastSync: now, lastAttempt: now, paused: false
    };
    if (feed.roaster.url !== undefined) sub.roasterUrl = feed.roaster.url;
    writeSubscription(settings, sub);
    writeCatalogue(settings, feedUrl, body, now);
    // Everything listed now counts as seen: a roaster's whole range is not
    // thirty new coffees.
    recordSubscribed(settings, feedUrl, feed);
    return sub;
}

/**
 * Sync one subscription.
 *
 * `force` ignores the twelve hour limit; `ignorePause` is only for an explicit
 * REFRESH NOW.
 */
export async function syncSubscription(
    feedUrl: string,
    deps: SyncDeps,
    options: {force?: boolean; ignorePause?: boolean; signal?: AbortSignal} = {}
): Promise<SyncResult> {
    const {settings} = deps;
    const now = deps.now ?? Date.now;
    const sub = subscriptionFor(readSubscriptions(settings), feedUrl);
    if (sub === undefined) return {ok: false, reason: "missing"};
    if (sub.paused && !options.ignorePause) return {ok: false, reason: "paused"};
    if (!options.force && !isDue(sub, now())) return {ok: false, reason: "notDue"};
    if (running) return {ok: false, reason: "busy"};
    running = true;

    // `finally` because a throw anywhere would otherwise latch the lock and
    // refuse every sync for the rest of the session.
    try {
        let fetched: {feed: RoasterFeed; body: string};
        try {
            const load = deps.fetchBody
                ?? ((url: string, signal?: AbortSignal) => fetchRoasterFeedBody(url, {signal}));
            fetched = await load(sub.feed, options.signal);
        } catch (error) {
            const reason: SyncError = error instanceof RoasterFeedError ? error.kind : "network";
            updateSubscription(settings, sub.feed, (current) =>
                ({...current, lastAttempt: now(), lastError: reason}));
            return {ok: false, reason};
        }

        const stamp = now();
        // Unsubscribed while the request was out: the cache stays gone too.
        if (subscriptionFor(readSubscriptions(settings), sub.feed) === undefined) {
            return {ok: false, reason: "missing"};
        }
        writeCatalogue(settings, sub.feed, fetched.body, stamp);
        const back = recordSync(settings, sub.feed, fetched.feed);

        const saved = updateSubscription(settings, sub.feed, (current) => {
            const next: RoasterSubscription = {
                ...current, roaster: fetched.feed.roaster.name, lastSync: stamp, lastAttempt: stamp
            };
            delete next.lastError;
            if (fetched.feed.roaster.url !== undefined) next.roasterUrl = fetched.feed.roaster.url;
            return next;
        });
        return {ok: true, feed: fetched.feed, subscription: saved ?? sub, back};
    } finally {
        running = false;
    }
}

/** Sync every subscription that is due, one after another. */
export async function syncDue(deps: SyncDeps): Promise<SyncResult[]> {
    const now = deps.now ?? Date.now;
    const results: SyncResult[] = [];
    for (const sub of readSubscriptions(deps.settings)) {
        if (!isDue(sub, now())) continue;
        results.push(await syncSubscription(sub.feed, deps));
    }
    return results;
}

/**
 * Stop following a feed. Its coffees leave the catalogue; recipes the user
 * added to the library stay, and simply stop receiving updates.
 */
export function unsubscribe(settings: Settings, feedUrl: string): void {
    settings.set("roasterSubscriptions",
        serialiseSubscriptions(withoutSubscription(readSubscriptions(settings), feedUrl)));
    dropCatalogue(settings, feedUrl);
    dropAlerts(settings, feedUrl);
}

export function setPaused(settings: Settings, feedUrl: string, paused: boolean): void {
    updateSubscription(settings, feedUrl, (sub) => ({...sub, paused}));
}

/** Explicit Import choice. Refusal never writes or replaces an existing choice. */
export function setPinned(settings: Settings, feedUrl: string, pinned: boolean, now: number): boolean {
    const subscriptions = readSubscriptions(settings);
    const current = subscriptionFor(subscriptions, feedUrl);
    if (current === undefined) return false;
    if (pinned && current.pinnedAt !== undefined) return true;
    const choices = subscriptions.filter((sub) => sub.pinnedAt !== undefined);
    if (pinned && choices.length >= IMPORT_ROASTER_LIMIT) return false;
    updateSubscription(settings, feedUrl, (sub) => {
        const next = {...sub};
        if (pinned) {
            const latest = Math.max(0, ...choices.map((choice) => choice.pinnedAt!));
            next.pinnedAt = Math.max(Number.isFinite(now) ? now : 1, latest + 1);
        } else delete next.pinnedAt;
        return next;
    });
    return true;
}

/** Test hook: release the lock a test left held. */
export function resetSyncLockForTests(): void {
    running = false;
}

/**
 * The user's own shelves, in their order, spelled as the tags are.
 *
 * `myShelves` holds folded ids, so the spelling comes from the tags on the
 * recipes; a marked shelf with no recipe left on it is not offered.
 */
export function realUserShelves(settings: Settings): string[] {
    const order = parseHidden(settings.get("myShelves"));
    const tags = new RecipeDatabase().countRecipesByTag();
    const byId = new Map(tags.map(({tag}) => [canonicalShelfId(tagFilterId(tag)), tag]));
    return order.map((id) => byId.get(id)).filter((tag): tag is string => tag !== undefined);
}
