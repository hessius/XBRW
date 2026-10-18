/**
 * Managing roaster subscriptions: the list, and what can be done to each.
 *
 * Shared by the subscriptions screen and the roaster catalogue, so REFRESH
 * NOW says the same thing wherever it is pressed. The records live in the
 * `roasterSubscriptions` setting and the syncing in `library/roasterSync.ts`;
 * this binds the two to React state.
 */
import {useState} from "react";

import {notify} from "@/components/XbrwToast";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {parseFeedOptOut, serialiseFeedOptOut, type RoasterFeed} from "@/library/roasterFeed";
import {parseSubscriptions, type RoasterSubscription} from "@/library/roasterSubscription";
import {
    setPaused, syncSubscription, unsubscribe, type SyncResult
} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

/** What a sync the user asked for reports, success or not. */
export function refreshMessage(result: SyncResult, roaster: string): {
    tone: "success" | "error" | "info"; message: string;
} {
    if (!result.ok) {
        switch (result.reason) {
            case "network":
                return {tone: "error", message: `Couldn't reach ${roaster}. Check your connection.`};
            case "unreadable":
                return {tone: "error", message: `${roaster}'s list of coffees couldn't be read.`};
            case "busy":
                return {tone: "info", message: "Already updating. Try again in a moment."};
            default:
                return {tone: "info", message: "That subscription has ended."};
        }
    }
    const count = result.feed.coffees.length;
    return {tone: "success",
            message: count === 1 ? `${roaster}: 1 coffee.` : `${roaster}: ${count} coffees.`};
}

type Options = {
    settings?: Settings;
    /** Injected by tests. */
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
};

export function useRoasterSubscriptions({settings, fetchBody, now}: Options = {}) {
    const store = settings ?? sharedSettings();
    const [stored] = useSetting("roasterSubscriptions", store);
    // Subscribed so a refresh redraws the catalogue it rewrote.
    const [catalogue] = useSetting("roasterCatalogue", store);
    const [storedOptOut, setOptOut] = useSetting("roasterFeedOptOut", store);
    /** The feed being refreshed, so its row can say so and refuse a second press. */
    const [refreshing, setRefreshing] = useState<string | null>(null);

    const subscriptions: RoasterSubscription[] = parseSubscriptions(stored);
    const optOuts: string[] = parseFeedOptOut(storedOptOut);

    async function refresh(sub: RoasterSubscription): Promise<SyncResult> {
        setRefreshing(sub.feed);
        const result = await syncSubscription(sub.feed, {settings: store, fetchBody, now},
                                              {force: true, ignorePause: true});
        setRefreshing(null);
        notify(refreshMessage(result, sub.roaster));
        return result;
    }

    return {
        subscriptions,
        optOuts,
        refreshing,
        /** Changes whenever the cached catalogue does. */
        catalogueVersion: catalogue,
        refresh,
        pause:  (sub: RoasterSubscription) => setPaused(store, sub.feed, true),
        resume: (sub: RoasterSubscription) => setPaused(store, sub.feed, false),
        unsubscribe: (sub: RoasterSubscription) => {
            unsubscribe(store, sub.feed);
            notify({tone: "success", message: `Unsubscribed from ${sub.roaster}.`});
        },
        /** Undo a "don't ask again". */
        askAgain: (key: string) =>
            setOptOut(serialiseFeedOptOut(optOuts.filter((kept) => kept !== key)))
    };
}
