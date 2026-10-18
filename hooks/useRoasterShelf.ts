/**
 * The roaster subscription offer, and keeping subscribed shelves fresh.
 *
 * After an import link that names a feed, the app asks once whether to
 * subscribe to that roaster: a shelf of its coffees that stays up to date.
 * The order of events is the design. The link's own recipe imports first and
 * opens in the editor exactly as it always has; the feed is fetched in the
 * background meanwhile; and the question waits until the library is on screen
 * again, because a sheet raised behind the editor is a sheet nobody sees. The
 * count is worked out at that moment, against the library as it then stands.
 *
 * Nothing is fetched for a link without a feed, nothing is asked when the
 * feed has nothing new, and nothing is asked about a feed the user opted out
 * of. A link for a feed already subscribed to asks nothing either: it syncs.
 *
 * The syncing itself lives in `library/roasterSync.ts`, shared with the
 * subscriptions screen, so this hook is the library screen's half only.
 */
import {useEffect, useRef, useState} from "react";

import {notify} from "@/components/XbrwToast";
import {sharedSettings} from "@/hooks/useSetting";
import type Recipe from "@/library/Recipe";
import {
    feedKey, fetchRoasterFeed, parseFeedOptOut, serialiseFeedOptOut,
    type RoasterFeed
} from "@/library/roasterFeed";
import {planRoasterSync, type ShelfDeps, type SyncOutcome, type SyncPlan} from "@/library/roasterShelf";
import {subscriptionFor} from "@/library/roasterSubscription";
import {
    readSubscriptions, subscribe, syncDue, syncSubscription, type SyncResult
} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

export type RoasterShelfState =
    | {phase: "idle"}
    | {phase: "offer"; plan: SyncPlan; count: number}
    | {phase: "adding"; plan: SyncPlan; done: number; total: number};

type Options = {
    /** The whole library, read when the question is about to be asked. */
    stored: () => Recipe[];
    /** Whether the library is the screen in front. */
    canAsk: () => boolean;
    /** The library changed under the screen: re-read it. */
    onChanged: () => void;
    settings?: Settings;
    /** Injected by tests. */
    fetchFeed?: (url: string, signal?: AbortSignal) => Promise<RoasterFeed>;
    deps?: ShelfDeps;
    now?: () => number;
};

export type RoasterShelf = {
    state: RoasterShelfState;
    /** An import link named this feed. Nothing happens until it imports. */
    arm: (feedUrl: string) => void;
    /** The armed link's import failed, so there is nothing to follow it up. */
    disarm: () => void;
    /** An import just succeeded: follow up the armed feed, if there is one. */
    imported: () => void;
    /** The library is in front: ask the question, if one is waiting. */
    ask: () => void;
    accept: (dontAskAgain: boolean) => void;
    decline: (dontAskAgain: boolean) => void;
    /** Stop adding. What has already been added stays. */
    cancel: () => void;
    /** Sync every subscription that is due. Called on open and foreground. */
    syncDue: () => void;
};

function coffees(n: number): string {
    return n === 1 ? "1 coffee" : `${n} coffees`;
}

/** How many failed coffees are named before the rest are counted. */
const FAILURE_NAME_LIMIT = 3;

function failedNames(failed: readonly string[]): string {
    const shown = failed.slice(0, FAILURE_NAME_LIMIT);
    const rest = failed.length - shown.length;
    return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

/** What the first sync, the one the user asked for, reports. */
export function subscribedMessage(outcome: SyncOutcome, shelf: string): string {
    const landed = outcome.added + outcome.adopted;
    if (outcome.cancelled) {
        return landed > 0
            ? `Stopped. ${coffees(landed)} on ${shelf}. The rest follow on the next update.`
            : "Stopped. The rest follow on the next update.";
    }
    const lead = `Subscribed. ${coffees(landed)} on ${shelf}.`;
    return outcome.failed.length > 0
        ? `${lead} Could not add: ${failedNames(outcome.failed)}.`
        : lead;
}

export function useRoasterShelf({
    stored, canAsk, onChanged, settings, fetchFeed, deps, now
}: Options): RoasterShelf {
    const store = settings ?? sharedSettings();
    const [state, setShown] = useState<RoasterShelfState>({phase: "idle"});
    // The phase as of the last change, readable from a fetch that resolves
    // after the render that started it.
    const phase = useRef<RoasterShelfState["phase"]>("idle");
    function setState(next: RoasterShelfState) {
        phase.current = next.phase;
        setShown(next);
    }

    /** The feed of the link whose import is running. */
    const armed = useRef<string | null>(null);
    /** A feed that has loaded and is waiting for the library to be in front. */
    const waiting = useRef<{feed: RoasterFeed; url: string} | null>(null);
    /** The feed the open question is about. */
    const asked = useRef<{feed: RoasterFeed; url: string} | null>(null);
    const loading = useRef<AbortController | null>(null);
    const adding = useRef<AbortController | null>(null);

    // The latest callbacks, so a fetch that lands after a re-render does not
    // act on a stale library reader or a stale screen.
    const latest = useRef({stored, canAsk, onChanged});
    useEffect(() => {
        latest.current = {stored, canAsk, onChanged};
    });

    useEffect(() => () => {
        loading.current?.abort();
        adding.current?.abort();
    }, []);

    const syncDeps = () => ({settings: store, shelf: deps, fetchFeed, now});

    function optedOut(url: string): boolean {
        const key = feedKey(url);
        return key === null || parseFeedOptOut(store.get("roasterFeedOptOut")).includes(key);
    }

    function subscribed(url: string): boolean {
        return subscriptionFor(readSubscriptions(store), url) !== undefined;
    }

    /** A sync nobody asked to watch says something only when it added a coffee. */
    function reportQuiet(result: SyncResult) {
        if (!result.ok) return;
        const landed = result.outcome.added + result.outcome.adopted;
        latest.current.onChanged();
        if (landed === 0) return;
        notify({tone: "success",
                message: `Added ${coffees(landed)} to ${result.subscription.shelf}.`});
    }

    function arm(feedUrl: string) {
        // An opted-out feed is not even fetched, unless it is subscribed to:
        // a subscription is the later, more deliberate answer.
        armed.current = subscribed(feedUrl) || !optedOut(feedUrl) ? feedUrl : null;
    }

    function disarm() {
        armed.current = null;
    }

    function imported() {
        const url = armed.current;
        armed.current = null;
        if (url === null) return;

        if (subscribed(url)) {
            void syncSubscription(url, syncDeps(), {force: true}).then(reportQuiet);
            return;
        }

        loading.current?.abort();
        const controller = new AbortController();
        loading.current = controller;
        const load = fetchFeed
            ?? ((feedUrl: string, signal?: AbortSignal) => fetchRoasterFeed(feedUrl, {signal}));
        load(url, controller.signal)
            .then((feed) => {
                if (controller.signal.aborted) return;
                waiting.current = {feed, url};
                if (latest.current.canAsk()) ask();
            })
            .catch(() => {
                // A feed that does not load is an offer that is not made. The
                // recipe the user asked for has already imported, and telling
                // them about a file they never asked for would be noise.
            });
    }

    function ask() {
        const pending = waiting.current;
        if (pending === null || phase.current !== "idle") return;
        waiting.current = null;
        if (optedOut(pending.url) || subscribed(pending.url)) return;

        const plan = planRoasterSync(pending.feed, latest.current.stored());
        if (plan.add.length === 0 || plan.shelf === "") return;
        asked.current = pending;
        setState({phase: "offer", plan, count: plan.add.length + plan.adopt.length});
    }

    function rememberAnswer(dontAskAgain: boolean) {
        const key = asked.current === null ? null : feedKey(asked.current.url);
        if (!dontAskAgain || key === null) return;
        store.set("roasterFeedOptOut", serialiseFeedOptOut(
            [...parseFeedOptOut(store.get("roasterFeedOptOut")), key]
        ));
    }

    function decline(dontAskAgain: boolean) {
        if (state.phase !== "offer") return;
        rememberAnswer(dontAskAgain);
        asked.current = null;
        setState({phase: "idle"});
    }

    function accept(dontAskAgain: boolean) {
        if (state.phase !== "offer" || asked.current === null) return;
        rememberAnswer(dontAskAgain);
        void add(state.plan, asked.current);
    }

    async function add(plan: SyncPlan, source: {feed: RoasterFeed; url: string}) {
        const controller = new AbortController();
        adding.current = controller;
        const total = plan.add.length;
        setState({phase: "adding", plan, done: 0, total});

        subscribe(store, source.url, source.feed, plan.shelf);
        const result = await syncSubscription(source.url, syncDeps(), {
            feed:        source.feed,
            force:       true,
            ignorePause: true,
            signal:      controller.signal,
            onProgress:  (done) => setState({phase: "adding", plan, done, total})
        });
        adding.current = null;
        asked.current = null;
        setState({phase: "idle"});

        if (!result.ok) {
            // Subscribed, but another sync held the lock. It catches up on
            // the next one, so say so rather than calling it a failure.
            notify({tone:    "info",
                    message: `Subscribed to ${plan.roaster}. Its coffees arrive on the next update.`});
            return;
        }
        latest.current.onChanged();
        notify({
            tone:    result.outcome.failed.length > 0 ? "error" : "success",
            message: subscribedMessage(result.outcome, result.subscription.shelf)
        });
    }

    function cancel() {
        adding.current?.abort();
    }

    function runDue() {
        void syncDue(syncDeps()).then((results) => results.forEach(reportQuiet));
    }

    return {state, arm, disarm, imported, ask, accept, decline, cancel, syncDue: runDue};
}
