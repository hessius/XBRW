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
import {backInStockMessage} from "@/library/roasterAlerts";
import {parseFeedOptOut, serialiseFeedOptOut, type RoasterFeed} from "@/library/roasterFeed";
import {parseSubscriptions, type RoasterSubscription} from "@/library/roasterSubscription";
import {
    setPaused, setPinned, syncSubscription, unsubscribe, type SyncResult
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

/**
 * What REFRESH ALL reports: one toast for the whole run, not one per roaster.
 *
 * A single roaster reads exactly as its own REFRESH NOW would. Otherwise the
 * failures are named, since "2 of 3 updated" does not say which one to check.
 */
export function refreshAllMessage(results: {roaster: string; result: SyncResult}[]): {
    tone: "success" | "error" | "info"; message: string;
} | null {
    if (results.length === 0) return null;
    if (results.length === 1) return refreshMessage(results[0].result, results[0].roaster);
    const failed = results.filter(({result}) => !result.ok).map(({roaster}) => roaster);
    if (failed.length === 0) return {tone: "success", message: `${results.length} roasters updated.`};
    if (failed.length === results.length) {
        return {tone: "error", message: "Couldn't update your roasters. Check your connection."};
    }
    return {tone: "error", message: `Couldn't update ${failed.join(", ")}.`};
}

/**
 * The one toast for watched coffees a sync found back on sale.
 *
 * Once per coffee, because the sync stops watching what it announces. Every
 * sync is a foreground one, so this is the whole of "telling" somebody: there
 * are no push notifications.
 */
export function announceBack(result: SyncResult): void {
    if (!result.ok) return;
    const message = backInStockMessage(result.feed.roaster.name, result.back);
    if (message !== null) notify({tone: "success", message});
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
        announceBack(result);
        return result;
    }

    /**
     * Every subscription that is not paused, one after another, as REFRESH
     * NOW would sync each: past the twelve hour limit, through the same lock.
     * Paused ones stay as they are, which is what pausing promised.
     */
    async function refreshAll(): Promise<void> {
        const due = parseSubscriptions(store.get("roasterSubscriptions"))
            .filter((sub) => !sub.paused);
        const results: {roaster: string; result: SyncResult}[] = [];
        for (const sub of due) {
            setRefreshing(sub.feed);
            const result = await syncSubscription(sub.feed, {settings: store, fetchBody, now},
                                                  {force: true});
            // Unsubscribed or paused while the run was under way: nothing to say.
            if (!result.ok && (result.reason === "missing" || result.reason === "paused")) continue;
            results.push({roaster: sub.roaster, result});
            announceBack(result);
        }
        setRefreshing(null);
        const message = refreshAllMessage(results);
        if (message !== null) notify(message);
    }

    return {
        subscriptions,
        optOuts,
        refreshing,
        /** Changes whenever the cached catalogue does. */
        catalogueVersion: catalogue,
        refresh,
        refreshAll,
        pause:  (sub: RoasterSubscription) => setPaused(store, sub.feed, true),
        resume: (sub: RoasterSubscription) => setPaused(store, sub.feed, false),
        /** Pin to the home screen, or unpin. */
        pin: (sub: RoasterSubscription, pinned: boolean) =>
            setPinned(store, sub.feed, pinned, (now ?? Date.now)()),
        unsubscribe: (sub: RoasterSubscription) => {
            unsubscribe(store, sub.feed);
            notify({tone: "success", message: `Unsubscribed from ${sub.roaster}.`});
        },
        /** Undo a "don't ask again". */
        askAgain: (key: string) =>
            setOptOut(serialiseFeedOptOut(optOuts.filter((kept) => kept !== key)))
    };
}
