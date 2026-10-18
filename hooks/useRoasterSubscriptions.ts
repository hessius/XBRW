/**
 * Managing roaster subscriptions: the list, and what can be done to each.
 *
 * Shared by the subscriptions screen and the shelf menu, so REFRESH NOW says
 * the same thing wherever it is pressed. The records live in the
 * `roasterSubscriptions` setting and the syncing in `library/roasterSync.ts`;
 * this binds the two to React state.
 */
import {useState} from "react";

import {notify} from "@/components/XbrwToast";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {parseFeedOptOut, serialiseFeedOptOut} from "@/library/roasterFeed";
import type {ShelfDeps} from "@/library/roasterShelf";
import {parseSubscriptions, type RoasterSubscription} from "@/library/roasterSubscription";
import {
    setPaused, syncSubscription, unsubscribe, type SyncResult
} from "@/library/roasterSync";
import type {RoasterFeed} from "@/library/roasterFeed";
import type {Settings} from "@/library/Settings";

function coffees(n: number): string {
    return n === 1 ? "1 coffee" : `${n} coffees`;
}

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
    const {outcome, plan} = result;
    const landed = outcome.added + outcome.adopted;
    const parts: string[] = [];
    if (landed > 0) parts.push(`Added ${coffees(landed)}.`);
    if (plan.soldOut.length > 0) parts.push(`${plan.soldOut.length} sold out.`);
    if (outcome.failed.length > 0) parts.push(`Could not add ${coffees(outcome.failed.length)}.`);
    if (parts.length === 0) return {tone: "success", message: `${result.subscription.shelf} is up to date.`};
    return {tone: outcome.failed.length > 0 ? "error" : "success", message: parts.join(" ")};
}

type Options = {
    settings?: Settings;
    /** Injected by tests. */
    deps?: ShelfDeps;
    fetchFeed?: (url: string, signal?: AbortSignal) => Promise<RoasterFeed>;
    now?: () => number;
    /** The library changed: whoever is showing it re-reads it. */
    onChanged?: () => void;
};

export function useRoasterSubscriptions({settings, deps, fetchFeed, now, onChanged}: Options = {}) {
    const store = settings ?? sharedSettings();
    const [stored] = useSetting("roasterSubscriptions", store);
    const [storedOptOut, setOptOut] = useSetting("roasterFeedOptOut", store);
    /** The feed being refreshed, so its row can say so and refuse a second press. */
    const [refreshing, setRefreshing] = useState<string | null>(null);

    const subscriptions: RoasterSubscription[] = parseSubscriptions(stored);
    const optOuts: string[] = parseFeedOptOut(storedOptOut);

    async function refresh(sub: RoasterSubscription): Promise<SyncResult> {
        setRefreshing(sub.feed);
        const result = await syncSubscription(sub.feed, {settings: store, shelf: deps, fetchFeed, now},
                                              {force: true, ignorePause: true});
        setRefreshing(null);
        if (result.ok) onChanged?.();
        notify(refreshMessage(result, sub.roaster));
        return result;
    }

    return {
        subscriptions,
        optOuts,
        refreshing,
        refresh,
        pause:  (sub: RoasterSubscription) => setPaused(store, sub.feed, true),
        resume: (sub: RoasterSubscription) => setPaused(store, sub.feed, false),
        unsubscribe: (sub: RoasterSubscription) => {
            unsubscribe(store, sub.feed);
            notify({tone: "success", message: `Stopped updating ${sub.shelf}.`});
        },
        /** Undo a "don't ask again". */
        askAgain: (key: string) =>
            setOptOut(serialiseFeedOptOut(optOuts.filter((stored) => stored !== key)))
    };
}
