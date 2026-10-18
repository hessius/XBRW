import {MAX_URL, SHORT_TEXT} from "@/library/brewmindLink";
import {httpsUrl} from "@/library/podCoffee";
import {MAX_TAG_LENGTH} from "@/library/Recipe";
import {feedKey} from "@/library/roasterFeed";

/**
 * A roaster shelf the user subscribed to.
 *
 * Stored in the `roasterSubscriptions` setting as a JSON array. The shelf
 * itself is still an ordinary tag shelf (`library/shelves.ts`); this record is
 * only what keeps it in step with the roaster's feed: where the feed is, which
 * coffees the subscription has already dealt with, and which of those are
 * sold out now.
 *
 * `items` is the memory that makes syncing safe. A coffee the subscription has
 * handled once is never handled again: if the user deletes its recipe or takes
 * it off the shelf, the next sync leaves that alone rather than putting it
 * back. Only coffees new to the subscription are imported or shelved.
 */

/** How often a subscription is synced on its own, at most. */
export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Coffees remembered per subscription. Far more than any roaster sells. */
const MAX_ITEMS = 2000;
/** Matches the share id cap in `importInput.ts`. */
const MAX_SHARE_ID = 256;
const MAX_COFFEE_ID = 200;

export type SubscriptionItem = {
    /** The share id of the recipe this coffee was imported or shelved as. */
    shareId: string;
    /** The feed's own id for the coffee, when it gave one. */
    coffeeId?: string;
};

export type RoasterSubscription = {
    /** The feed URL, https. */
    feed: string;
    roaster: string;
    /** The tag, and so the shelf's name. */
    shelf: string;
    /** Epoch ms of the last sync that read the feed. 0 before the first. */
    lastSync: number;
    /**
     * Epoch ms of the last attempt, successful or not. The rate limit runs on
     * this, so a feed that is down is not asked again on every app open.
     */
    lastAttempt: number;
    items: SubscriptionItem[];
    /** Share ids of tracked coffees the feed no longer lists as available. */
    soldOut: string[];
    /** The roaster's own site, from the feed. https only. */
    roasterUrl?: string;
    /** Updates are paused: nothing syncs until the user resumes. */
    paused: boolean;
    /** Why the last attempt failed, or absent when it worked. */
    lastError?: SyncError;
};

/**
 * Why a sync did not complete, in the few words the screen shows.
 *
 * A closed set, never the server's own text: a feed is somebody else's file,
 * and whatever it or its host says is not app copy.
 */
export type SyncError = "network" | "unreadable";

const SYNC_ERRORS: readonly SyncError[] = ["network", "unreadable"];

function text(value: unknown, max: number): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" || trimmed.length > max ? undefined : trimmed;
}

function time(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function item(value: unknown): SubscriptionItem | null {
    if (value === null || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    const shareId = text(entry.shareId, MAX_SHARE_ID);
    if (shareId === undefined) return null;
    const result: SubscriptionItem = {shareId};
    const coffeeId = text(entry.coffeeId, MAX_COFFEE_ID);
    if (coffeeId !== undefined) result.coffeeId = coffeeId;
    return result;
}

function subscription(value: unknown): RoasterSubscription | null {
    if (value === null || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    const raw = text(entry.feed, MAX_URL);
    const feed = raw === undefined ? undefined : httpsUrl(raw);
    const roaster = text(entry.roaster, SHORT_TEXT);
    const shelf = text(entry.shelf, MAX_TAG_LENGTH);
    if (feed === undefined || roaster === undefined || shelf === undefined) return null;

    const items = Array.isArray(entry.items)
        ? entry.items.slice(0, MAX_ITEMS).map(item)
            .filter((kept): kept is SubscriptionItem => kept !== null)
        : [];
    const soldOut = Array.isArray(entry.soldOut)
        ? entry.soldOut.slice(0, MAX_ITEMS)
            .map((id) => text(id, MAX_SHARE_ID))
            .filter((id): id is string => id !== undefined)
        : [];
    const result: RoasterSubscription = {
        feed, roaster, shelf,
        lastSync:    time(entry.lastSync),
        lastAttempt: time(entry.lastAttempt),
        items,
        soldOut,
        paused:      entry.paused === true
    };
    const rawUrl = text(entry.roasterUrl, MAX_URL);
    const roasterUrl = rawUrl === undefined ? undefined : httpsUrl(rawUrl);
    if (roasterUrl !== undefined) result.roasterUrl = roasterUrl;
    if (SYNC_ERRORS.includes(entry.lastError as SyncError)) {
        result.lastError = entry.lastError as SyncError;
    }
    return result;
}

/**
 * The subscriptions in a stored value.
 *
 * Validated, because the setting travels in a backup file and a backup is
 * untrusted. Anything unreadable is dropped, and two records for one feed
 * collapse to the first.
 */
export function parseSubscriptions(stored: string): RoasterSubscription[] {
    if (stored.trim() === "") return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(stored);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: RoasterSubscription[] = [];
    for (const entry of parsed) {
        const read = subscription(entry);
        const key = read === null ? null : feedKey(read.feed);
        if (read === null || key === null || seen.has(key)) continue;
        seen.add(key);
        result.push(read);
    }
    return result;
}

export function serialiseSubscriptions(list: readonly RoasterSubscription[]): string {
    return JSON.stringify(list);
}

/** The subscription to a feed, matched by origin and path. */
export function subscriptionFor(
    list: readonly RoasterSubscription[], feedUrl: string
): RoasterSubscription | undefined {
    const key = feedKey(feedUrl);
    return key === null ? undefined : list.find((sub) => feedKey(sub.feed) === key);
}

/** Replace (or add) one subscription, keyed by feed. */
export function withSubscription(
    list: readonly RoasterSubscription[], next: RoasterSubscription
): RoasterSubscription[] {
    const key = feedKey(next.feed);
    const kept = list.filter((sub) => feedKey(sub.feed) !== key);
    return [...kept, next];
}

export function withoutSubscription(
    list: readonly RoasterSubscription[], feedUrl: string
): RoasterSubscription[] {
    const key = feedKey(feedUrl);
    return list.filter((sub) => feedKey(sub.feed) !== key);
}

/**
 * Whether a subscription should sync now on its own.
 *
 * Never while paused. A clock that has gone backwards (an attempt "in the future") counts as due,
 * so a phone whose date was once wrong does not stop syncing until it catches
 * up.
 */
export function isDue(sub: RoasterSubscription, now: number): boolean {
    if (sub.paused) return false;
    return sub.lastAttempt > now || now - sub.lastAttempt >= SYNC_INTERVAL_MS;
}

/** How many tracked coffees are on sale, and how many are sold out. */
export function subscriptionCounts(sub: RoasterSubscription): {available: number; soldOut: number} {
    const soldOut = new Set(sub.soldOut);
    const tracked = new Set(sub.items.map((entry) => entry.shareId));
    let out = 0;
    for (const id of tracked) if (soldOut.has(id)) out += 1;
    return {available: tracked.size - out, soldOut: out};
}
