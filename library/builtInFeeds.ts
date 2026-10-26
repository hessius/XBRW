import {feedKey} from "@/library/roasterFeed";
import {
    parseSubscriptions, serialiseSubscriptions, subscriptionFor, withSubscription
} from "@/library/roasterSubscription";
import {unsubscribe} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

/**
 * Feeds the app ships with, so they can be switched on without a link.
 *
 * Any roaster's feed still arrives the ordinary way, from its import link. A
 * built-in feed is one nobody would otherwise have a link for: today only
 * xBloom's own releases, which `api/feeds/xbloom.ts` reads from the Collective
 * because xBloom publishes no feed of its own.
 *
 * A built-in feed is an ordinary subscription once it is on: it syncs, pauses,
 * shows in Import and unsubscribes like any other. The only difference is
 * where it starts. Each one is switched on once, the first time the app runs
 * with it, and remembered in `builtInFeedsSeeded` so that switching it off
 * stays off, including after a restore.
 */
export type BuiltInFeed = {
    feed: string;
    roaster: string;
    /** One line for the toggle, in the app's words. */
    description: string;
};

/**
 * Overridable like the share endpoint (`constants/share.ts`), so a development
 * build can point at a preview deployment.
 */
export const XBLOOM_FEED_URL =
    process.env.EXPO_PUBLIC_XBLOOM_FEED_URL ?? "https://xbrwplusplus.vercel.app/api/feeds/xbloom";

export const BUILT_IN_FEEDS: readonly BuiltInFeed[] = [
    {
        feed:        XBLOOM_FEED_URL,
        roaster:     "xBloom Collective",
        description: "New coffees xBloom releases on its recipe catalogue."
    }
];

function seededKeys(settings: Settings): string[] {
    try {
        const parsed: unknown = JSON.parse(settings.get("builtInFeedsSeeded") || "[]");
        return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
    } catch {
        return [];
    }
}

function addSubscription(settings: Settings, feed: BuiltInFeed): void {
    const list = parseSubscriptions(settings.get("roasterSubscriptions"));
    if (subscriptionFor(list, feed.feed) !== undefined) return;
    // Never synced, so `isDue` picks it up on the next foreground sync, and
    // that first read counts every coffee as seen, as subscribing does.
    settings.set("roasterSubscriptions", serialiseSubscriptions(withSubscription(list, {
        feed: feed.feed, roaster: feed.roaster, lastSync: 0, lastAttempt: 0, paused: false
    })));
}

/**
 * Switch on every built-in feed this install has not met before.
 *
 * Returns whether anything was added, so the caller knows a sync is worth it.
 */
export function seedBuiltInFeeds(settings: Settings, feeds: readonly BuiltInFeed[] = BUILT_IN_FEEDS): boolean {
    const seeded = seededKeys(settings);
    const unseen = feeds.filter((feed) => {
        const key = feedKey(feed.feed);
        return key !== null && !seeded.includes(key);
    });
    if (unseen.length === 0) return false;
    for (const feed of unseen) addSubscription(settings, feed);
    settings.set("builtInFeedsSeeded", JSON.stringify([
        ...seeded, ...unseen.map((feed) => feedKey(feed.feed) as string)
    ]));
    return true;
}

/** Whether a built-in feed is currently subscribed. */
export function isBuiltInOn(settings: Settings, feed: BuiltInFeed): boolean {
    return subscriptionFor(parseSubscriptions(settings.get("roasterSubscriptions")), feed.feed) !== undefined;
}

/**
 * The toggle. Off is an ordinary unsubscribe: its coffees leave the
 * catalogue, saved recipes stay. On subscribes again; the caller syncs it.
 */
export function setBuiltInOn(settings: Settings, feed: BuiltInFeed, on: boolean): void {
    if (on) addSubscription(settings, feed);
    else unsubscribe(settings, feed.feed);
}
