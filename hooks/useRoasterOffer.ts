/**
 * The roaster subscription offer, and keeping subscribed catalogues fresh.
 *
 * After an import link that names a feed, the app asks once whether to
 * subscribe: the roaster's coffees go into the catalogue, to browse and
 * brew from. Nothing is imported by subscribing.
 *
 * The order of events is the design. The link's own recipe imports first and
 * opens in the editor exactly as it always has; the feed is fetched in the
 * background meanwhile; and the question waits until the library is on screen
 * again, because a sheet raised behind the editor is a sheet nobody sees.
 *
 * Nothing is fetched for a link without a feed, and nothing is asked about a
 * feed the user opted out of. A link for a feed already subscribed to asks
 * nothing either: it syncs.
 *
 * The syncing itself lives in `library/roasterSync.ts`, shared with the
 * subscriptions screen, so this hook is the library screen's half only.
 */
import {useEffect, useRef, useState} from "react";

import {notify} from "@/components/XbrwToast";
import {sharedSettings} from "@/hooks/useSetting";
import {
    feedKey, fetchRoasterFeedBody, parseFeedOptOut, serialiseFeedOptOut,
    type RoasterFeed
} from "@/library/roasterFeed";
import {subscriptionFor} from "@/library/roasterSubscription";
import {readSubscriptions, subscribe, syncDue, syncSubscription} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

export type RoasterOfferState =
    | {phase: "idle"}
    | {phase: "offer"; roaster: string; count: number};

type Loaded = {feed: RoasterFeed; body: string; url: string};

type Options = {
    /** Whether the library is the screen in front. */
    canAsk: () => boolean;
    settings?: Settings;
    /** Injected by tests. */
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
};

export type RoasterOffer = {
    state: RoasterOfferState;
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
    /** Sync every subscription that is due. Called on open and foreground. */
    syncDue: () => void;
};

function coffees(n: number): string {
    return n === 1 ? "1 coffee" : `${n} coffees`;
}

export function useRoasterOffer({
    canAsk, settings, fetchBody, now
}: Options): RoasterOffer {
    const store = settings ?? sharedSettings();
    const clock = now ?? Date.now;
    const [state, setShown] = useState<RoasterOfferState>({phase: "idle"});
    // The phase as of the last change, readable from a fetch that resolves
    // after the render that started it.
    const phase = useRef<RoasterOfferState["phase"]>("idle");
    function setState(next: RoasterOfferState) {
        phase.current = next.phase;
        setShown(next);
    }

    /** The feed of the link whose import is running. */
    const armed = useRef<string | null>(null);
    /** A feed that has loaded and is waiting for the library to be in front. */
    const waiting = useRef<Loaded | null>(null);
    /** The feed the open question is about. */
    const asked = useRef<Loaded | null>(null);
    const loading = useRef<AbortController | null>(null);

    const latest = useRef({canAsk});
    useEffect(() => {
        latest.current = {canAsk};
    });

    useEffect(() => () => loading.current?.abort(), []);

    const syncDeps = () => ({settings: store, fetchBody, now});

    function optedOut(url: string): boolean {
        const key = feedKey(url);
        return key === null || parseFeedOptOut(store.get("roasterFeedOptOut")).includes(key);
    }

    function subscribed(url: string): boolean {
        return subscriptionFor(readSubscriptions(store), url) !== undefined;
    }

    function arm(feedUrl: string) {
        armed.current = feedUrl;
    }

    function disarm() {
        armed.current = null;
    }

    function imported() {
        const url = armed.current;
        armed.current = null;
        if (url === null) return;

        // Already subscribed: no question, just a quiet refresh of the
        // catalogue, which reads the feed and nothing else.
        if (subscribed(url)) {
            void syncSubscription(url, syncDeps(), {force: true});
            return;
        }
        if (optedOut(url)) return;

        loading.current?.abort();
        const controller = new AbortController();
        loading.current = controller;
        const load = fetchBody
            ?? ((feedUrl: string, signal?: AbortSignal) => fetchRoasterFeedBody(feedUrl, {signal}));
        load(url, controller.signal)
            .then((loaded) => {
                if (controller.signal.aborted) return;
                waiting.current = {...loaded, url};
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
        if (pending.feed.coffees.length === 0) return;
        asked.current = pending;
        setState({phase: "offer", roaster: pending.feed.roaster.name,
                  count: pending.feed.coffees.length});
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
        const source = asked.current;
        if (state.phase !== "offer" || source === null) return;
        rememberAnswer(dontAskAgain);
        asked.current = null;
        subscribe(store, source.url, source.feed, source.body, clock());
        setState({phase: "idle"});
        notify({tone:    "success",
                message: `Subscribed. ${coffees(source.feed.coffees.length)} from ` +
                         `${source.feed.roaster.name} are in the catalogue.`});
    }

    function runDue() {
        void syncDue(syncDeps());
    }

    return {state, arm, disarm, imported, ask, accept, decline, syncDue: runDue};
}
