import {httpsUrl} from "@/library/podCoffee";
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
 * where it starts. Nothing subscribes automatically: absence from the ordinary
 * subscription list means off, including after an upgrade or restore.
 */
export type BuiltInFeed = {
    feed: string;
    roaster: string;
    /** One line for the toggle, in the app's words. */
    description: string;
};

/**
 * Set only after approving a working deployment. Without configuration the
 * built-in entry is hidden; there is no fallback to an unavailable service.
 */
export const XBLOOM_FEED_URL = httpsUrl(process.env.EXPO_PUBLIC_XBLOOM_FEED_URL);

export const BUILT_IN_FEEDS: readonly BuiltInFeed[] = XBLOOM_FEED_URL ? [
    {
        feed:        XBLOOM_FEED_URL,
        roaster:     "xBloom Collective",
        description: "New coffees xBloom releases on its recipe catalogue."
    }
] : [];

function addSubscription(settings: Settings, feed: BuiltInFeed): void {
    const list = parseSubscriptions(settings.get("roasterSubscriptions"));
    if (subscriptionFor(list, feed.feed) !== undefined) return;
    // Never synced, so `isDue` picks it up on the next foreground sync, and
    // that first read counts every coffee as seen, as subscribing does.
    settings.set("roasterSubscriptions", serialiseSubscriptions(withSubscription(list, {
        feed: feed.feed, roaster: feed.roaster, lastSync: 0, lastAttempt: 0, paused: false
    })));
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
