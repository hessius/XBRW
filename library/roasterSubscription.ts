import {MAX_URL, SHORT_TEXT} from "@/library/brewmindLink";
import {httpsUrl} from "@/library/podCoffee";
import {feedKey} from "@/library/roasterFeed";

/**
 * A roaster the user subscribed to.
 *
 * Stored in the `roasterSubscriptions` setting as a JSON array. A
 * subscription puts the roaster's coffees in the catalogue (the feed itself
 * is cached by `library/roasterCatalogue.ts`) and keeps them fresh. It owns
 * nothing in the library: a shelf is what the user owns, and nothing is put
 * on one unless they ask.
 */

/** How often a subscription is synced on its own, at most. */
export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Why a sync did not complete, in the few words the screen shows.
 *
 * A closed set, never the server's own text: a feed is somebody else's file,
 * and whatever it or its host says is not app copy.
 */
export type SyncError = "network" | "unreadable";

const SYNC_ERRORS: readonly SyncError[] = ["network", "unreadable"];

export type RoasterSubscription = {
    /** The feed URL, https. */
    feed: string;
    roaster: string;
    /** The roaster's own site, from the feed. https only. */
    roasterUrl?: string;
    /** Epoch ms of the last sync that read the feed. 0 before the first. */
    lastSync: number;
    /**
     * Epoch ms of the last attempt, successful or not. The rate limit runs on
     * this, so a feed that is down is not asked again on every app open.
     */
    lastAttempt: number;
    /** Updates are paused: nothing syncs until the user resumes. */
    paused: boolean;
    /** Why the last attempt failed, or absent when it worked. */
    lastError?: SyncError;
    /**
     * Epoch ms the roaster was pinned to the home screen, or absent when it
     * is not. A time rather than a flag so pins keep the order they were
     * made in, most recent last. Lives on the subscription so a backup carries
     * it and unsubscribing takes it away.
     */
    pinnedAt?: number;
};

function text(value: unknown, max: number): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" || trimmed.length > max ? undefined : trimmed;
}

function time(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function url(value: unknown): string | undefined {
    const raw = text(value, MAX_URL);
    return raw === undefined ? undefined : httpsUrl(raw);
}

function subscription(value: unknown): RoasterSubscription | null {
    if (value === null || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    const feed = url(entry.feed);
    const roaster = text(entry.roaster, SHORT_TEXT);
    if (feed === undefined || roaster === undefined) return null;

    const result: RoasterSubscription = {
        feed, roaster,
        lastSync:    time(entry.lastSync),
        lastAttempt: time(entry.lastAttempt),
        paused:      entry.paused === true
    };
    const roasterUrl = url(entry.roasterUrl);
    if (roasterUrl !== undefined) result.roasterUrl = roasterUrl;
    if (SYNC_ERRORS.includes(entry.lastError as SyncError)) {
        result.lastError = entry.lastError as SyncError;
    }
    const pinnedAt = time(entry.pinnedAt);
    if (pinnedAt > 0) result.pinnedAt = pinnedAt;
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
    return [...list.filter((sub) => feedKey(sub.feed) !== key), next];
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
 * Never while paused. A clock that has gone backwards (an attempt "in the
 * future") counts as due, so a phone whose date was once wrong does not stop
 * syncing until it catches up.
 */
export function isDue(sub: RoasterSubscription, now: number): boolean {
    if (sub.paused) return false;
    return sub.lastAttempt > now || now - sub.lastAttempt >= SYNC_INTERVAL_MS;
}
