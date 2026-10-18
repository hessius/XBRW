import {parseHidden, serialiseHidden} from "@/library/hiddenShelves";
import {parseImportInput} from "@/library/importInput";
import {tagFilterId} from "@/library/libraryFilters";
import {asMachineModel} from "@/library/machine/machineModel";
import RecipeDatabase from "@/library/RecipeDatabase";
import {
    fetchRoasterFeed, RoasterFeedError, type RoasterFeed
} from "@/library/roasterFeed";
import {
    planRoasterSync, runRoasterSync, type ShelfDeps, type SyncOutcome, type SyncPlan
} from "@/library/roasterShelf";
import {
    isDue, parseSubscriptions, withoutSubscription, serialiseSubscriptions, subscriptionFor, withSubscription,
    type RoasterSubscription, type SubscriptionItem, type SyncError
} from "@/library/roasterSubscription";
import type {Settings} from "@/library/Settings";
import {tagKey} from "@/library/tagKey";
import {XBloomRecipe} from "@/library/XBloomRecipe";

/**
 * Subscribing to a roaster feed and syncing it, outside React.
 *
 * Outside React because three places start a sync: the library on open and
 * on returning to the foreground, an import link for a feed already
 * subscribed to, and the subscriptions screen's REFRESH NOW. One module and
 * one lock means two of them can never sync the same shelf at once.
 *
 * Settings are read fresh before every write. A sync takes seconds, and the
 * user can pause, unsubscribe or rename in the meantime; a write built from a
 * list read at the start would quietly undo that.
 */

export type SyncDeps = {
    settings: Settings;
    shelf?: ShelfDeps;
    fetchFeed?: (url: string, signal?: AbortSignal) => Promise<RoasterFeed>;
    now?: () => number;
};

export type SyncResult =
    | {ok: true; plan: SyncPlan; outcome: SyncOutcome; subscription: RoasterSubscription}
    | {ok: false; reason: "busy" | "notDue" | "missing" | "paused" | SyncError};

let running = false;

/** Whether any sync is in flight. For tests and for the screen's spinner. */
export function isSyncing(): boolean {
    return running;
}

/** The live shelf dependencies: the share endpoint and the recipe table. */
export function realShelfDeps(settings: Settings): ShelfDeps {
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

/** Mark a shelf as one the user made, the way NEW SHELF does. */
function markShelf(settings: Settings, shelf: string): void {
    settings.set("myShelves",
        serialiseHidden([...parseHidden(settings.get("myShelves")), tagFilterId(shelf)]));
}

function merged(items: readonly SubscriptionItem[], more: readonly SubscriptionItem[]) {
    const byShare = new Map(items.map((entry) => [entry.shareId, entry]));
    for (const entry of more) if (!byShare.has(entry.shareId)) byShare.set(entry.shareId, entry);
    return [...byShare.values()];
}

/** Record a new subscription. Its first sync is the caller's next step. */
export function subscribe(
    settings: Settings, feedUrl: string, feed: RoasterFeed, shelf: string
): RoasterSubscription {
    const existing = subscriptionFor(readSubscriptions(settings), feedUrl);
    const sub: RoasterSubscription = existing ?? {
        feed: feedUrl, roaster: feed.roaster.name, shelf,
        lastSync: 0, lastAttempt: 0, items: [], soldOut: [], paused: false
    };
    if (feed.roaster.url !== undefined) sub.roasterUrl = feed.roaster.url;
    writeSubscription(settings, sub);
    return sub;
}

/**
 * Sync one subscription.
 *
 * `feed` skips the fetch when the caller already has it, which is the case
 * for the first sync straight after the prompt. `force` ignores the twelve
 * hour limit; `ignorePause` is only for an explicit REFRESH NOW.
 */
export async function syncSubscription(
    feedUrl: string,
    deps: SyncDeps,
    options: {
        feed?: RoasterFeed;
        force?: boolean;
        ignorePause?: boolean;
        signal?: AbortSignal;
        onProgress?: (done: number, total: number) => void;
    } = {}
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
        let feed = options.feed;
        if (feed === undefined) {
            try {
                const load = deps.fetchFeed
                    ?? ((url: string, signal?: AbortSignal) => fetchRoasterFeed(url, {signal}));
                feed = await load(sub.feed, options.signal);
            } catch (error) {
                const reason: SyncError =
                    error instanceof RoasterFeedError ? error.kind : "network";
                updateSubscription(settings, sub.feed, (current) =>
                    ({...current, lastAttempt: now(), lastError: reason}));
                return {ok: false, reason};
            }
        }

        const shelfDeps = deps.shelf ?? realShelfDeps(settings);
        const plan = planRoasterSync(feed, shelfDeps.stored(), sub.items);
        // The shelf keeps the name it was given, even if it has since been
        // renamed here: the subscription follows the user's name, not the feed's.
        const planned = {...plan, shelf: sub.shelf};
        const outcome = await runRoasterSync(planned, shelfDeps, {
            signal: options.signal, onProgress: options.onProgress
        });

        if (outcome.added + outcome.adopted > 0) markShelf(settings, sub.shelf);
        const stamp = now();
        const saved = updateSubscription(settings, sub.feed, (current) => {
            const next: RoasterSubscription = {
                ...current,
                items:       merged(current.items, outcome.tracked),
                soldOut:     plan.soldOut,
                lastSync:    stamp,
                lastAttempt: stamp
            };
            delete next.lastError;
            if (feed.roaster.url !== undefined) next.roasterUrl = feed.roaster.url;
            return next;
        });
        // Unsubscribed while it ran: the recipes stay, the record stays gone.
        return {ok: true, plan: planned, outcome, subscription: saved ?? sub};
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

/** Stop following a feed. The shelf and its recipes stay as they are. */
export function unsubscribe(settings: Settings, feedUrl: string): void {
    settings.set("roasterSubscriptions",
        serialiseSubscriptions(withoutSubscription(readSubscriptions(settings), feedUrl)));
}

export function setPaused(settings: Settings, feedUrl: string, paused: boolean): void {
    updateSubscription(settings, feedUrl, (sub) => ({...sub, paused}));
}

/** The subscription that keeps a shelf, matched the way shelves match tags. */
export function subscriptionForShelf(
    list: readonly RoasterSubscription[], shelf: string
): RoasterSubscription | undefined {
    const key = tagKey(shelf);
    return list.find((sub) => tagKey(sub.shelf) === key);
}

/** A subscribed shelf was renamed: follow it. */
export function renameSubscribedShelf(settings: Settings, from: string, to: string): void {
    const sub = subscriptionForShelf(readSubscriptions(settings), from);
    if (sub !== undefined) writeSubscription(settings, {...sub, shelf: to});
}

/** Test hook: release the lock a test left held. */
export function resetSyncLockForTests(): void {
    running = false;
}
