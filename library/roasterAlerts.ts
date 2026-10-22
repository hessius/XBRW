import {feedKey, type FeedCoffee, type FeedVariant, type RoasterFeed} from "@/library/roasterFeed";
import type {Settings} from "@/library/Settings";

/**
 * What is new in a roaster's catalogue, and what has come back.
 *
 * Two in-app signals, worked out on the phone from the feeds it already
 * syncs: no server, no push, no extra request. A sync is the only moment
 * anything changes, and syncs only happen in the foreground (on open, on
 * return, and on REFRESH NOW), so every signal here is something the person
 * sees while they are using the app.
 *
 * - **NEW.** Each subscription remembers which coffees the person has seen,
 *   in the coffee list or opened. A sync that brings a coffee they have not
 *   seen flags it NEW. The flag is cleared when they open the coffee, or the
 *   second time they look at the list, so a new coffee is called out for one
 *   visit and not forever. The first sync after subscribing marks the whole
 *   list as seen: a roaster's thirty coffees are not thirty new things.
 * - **Back in stock.** On a sold-out coffee (or a sold-out bag of one that is
 *   on sale) the person can ask to be told when it is back. A later sync that
 *   finds it on sale moves it from watched to back: the list tags it, the
 *   ROASTERS entry and the roaster's row carry a dot, and the sync announces
 *   it once. Opening the coffee clears it.
 *
 * Stored in the `roasterAlerts` setting as `{[feedKey]: FeedAlerts}`. Held out
 * of backups: it is bookkeeping about cached feeds that a restored phone
 * starts again from its first sync.
 *
 * Nothing here is React and nothing here fetches.
 */

export type FeedAlerts = {
    /** Coffee keys the person has seen, in the list or opened. */
    seen: string[];
    /** Coffee keys a sync flagged NEW and nobody has opened since. */
    fresh: string[];
    /**
     * The NEW coffees already shown in one visit to the list. They keep
     * their tag until the next visit, but no longer count towards the dot.
     */
    shown: string[];
    /** What the person asked to hear about: coffee keys and bag keys. */
    watch: string[];
    /** Watched keys that came back, not yet opened. */
    back: string[];
};

/** Most keys kept in any one list, so a long-lived feed cannot grow it forever. */
export const MAX_ALERT_KEYS = 500;

/** Joins a coffee key and a bag key into one watch key. */
const BAG_SEPARATOR = "\u001f";

/**
 * How a coffee is remembered across syncs: its feed id, or its name when the
 * roaster gave it none. Not its place in the list, which moves whenever the
 * roaster adds or removes a coffee.
 */
export function coffeeKey(coffee: FeedCoffee): string {
    return coffee.id ?? `name:${coffee.name}`;
}

/**
 * How one bag of a coffee is remembered: its shop id, or its size. Undefined
 * when it has neither, and then it cannot be watched on its own.
 */
export function bagKey(variant: FeedVariant): string | undefined {
    if (variant.id !== undefined) return variant.id;
    return variant.grams === undefined ? undefined : `${variant.grams}g`;
}

/** The watch key for one bag of a coffee. */
export function bagWatchKey(coffee: FeedCoffee, bag: string): string {
    return `${coffeeKey(coffee)}${BAG_SEPARATOR}${bag}`;
}

function splitWatch(key: string): {coffee: string; bag?: string} {
    const at = key.indexOf(BAG_SEPARATOR);
    return at < 0 ? {coffee: key} : {coffee: key.slice(0, at), bag: key.slice(at + 1)};
}

function strings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const result = value.filter((entry): entry is string =>
        typeof entry === "string" && entry !== "" && entry.length <= 400);
    return [...new Set(result)].slice(-MAX_ALERT_KEYS);
}

function capped(list: readonly string[]): string[] {
    return [...new Set(list)].slice(-MAX_ALERT_KEYS);
}

export function emptyAlerts(): FeedAlerts {
    return {seen: [], fresh: [], shown: [], watch: [], back: []};
}

/** Every subscription's alerts, validated: a stored value is never trusted. */
export function parseAlerts(stored: string): Record<string, FeedAlerts> {
    if (stored.trim() === "") return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(stored);
    } catch {
        return {};
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, FeedAlerts> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
        const entry = value as Record<string, unknown>;
        result[key] = {
            seen:  strings(entry.seen),
            fresh: strings(entry.fresh),
            shown: strings(entry.shown),
            watch: strings(entry.watch),
            back:  strings(entry.back)
        };
    }
    return result;
}

export function readAlerts(settings: Settings, feedUrl: string): FeedAlerts | undefined {
    const key = feedKey(feedUrl);
    return key === null ? undefined : parseAlerts(settings.get("roasterAlerts"))[key];
}

function change(
    settings: Settings, feedUrl: string,
    update: (current: FeedAlerts | undefined) => FeedAlerts | undefined
): void {
    const key = feedKey(feedUrl);
    if (key === null) return;
    const all = parseAlerts(settings.get("roasterAlerts"));
    const next = update(all[key]);
    if (next === undefined) delete all[key];
    else all[key] = next;
    settings.set("roasterAlerts", JSON.stringify(all));
}

/**
 * The first look at a feed: everything in it counts as seen, so subscribing
 * to a roaster does not flag its whole list NEW. What the person was already
 * watching (from an earlier subscription to the same feed) is kept.
 */
export function firstSight(feed: RoasterFeed, kept?: FeedAlerts): FeedAlerts {
    return {
        ...emptyAlerts(),
        seen:  capped(feed.coffees.map(coffeeKey)),
        watch: kept?.watch ?? []
    };
}

/** Whether a watched key is now on sale in this feed. */
function isBack(feed: RoasterFeed, key: string): FeedCoffee | undefined {
    const {coffee: wanted, bag} = splitWatch(key);
    const coffee = feed.coffees.find((entry) => coffeeKey(entry) === wanted);
    if (coffee === undefined || !coffee.available) return undefined;
    if (bag === undefined) return coffee;
    const variant = coffee.variants.find((entry) => bagKey(entry) === bag);
    return variant !== undefined && variant.available ? coffee : undefined;
}

/**
 * A sync's effect on one subscription's alerts, and the coffees it brought
 * back, in feed order and once each.
 *
 * With no alerts yet (a subscription from before this existed, or a restored
 * phone) this is a first look, so nothing is flagged. Otherwise a coffee
 * that is neither seen nor already NEW becomes NEW. A watched key whose
 * coffee (or bag) is on sale moves to `back`, which is what makes the
 * announcement happen once: it is no longer watched.
 *
 * `fresh`, `shown` and `back` keep only coffees still in the feed. `seen`
 * and `watch` keep the others too: roasters take a sold-out coffee off their
 * list and put it back when it returns, and that return is exactly the one a
 * watcher asked about.
 */
export function afterSync(
    current: FeedAlerts | undefined, feed: RoasterFeed
): {alerts: FeedAlerts; back: FeedCoffee[]} {
    if (current === undefined) return {alerts: firstSight(feed), back: []};

    const listed = new Set(feed.coffees.map(coffeeKey));
    const seen = new Set(current.seen);
    const fresh = current.fresh.filter((key) => listed.has(key));
    const known = new Set([...seen, ...fresh]);
    for (const key of listed) {
        if (!known.has(key)) fresh.push(key);
    }

    const watch: string[] = [];
    const back = current.back.filter((key) => listed.has(splitWatch(key).coffee));
    const returned = new Set<FeedCoffee>();
    for (const key of current.watch) {
        const coffee = isBack(feed, key);
        if (coffee === undefined) {
            watch.push(key);
            continue;
        }
        back.push(key);
        returned.add(coffee);
    }

    return {
        alerts: {
            seen:  capped(current.seen),
            fresh: capped(fresh),
            shown: current.shown.filter((key) => fresh.includes(key)),
            watch: capped(watch),
            back:  capped(back)
        },
        back: feed.coffees.filter((coffee) => returned.has(coffee))
    };
}

/** Record a sync and return what it brought back. */
export function recordSync(settings: Settings, feedUrl: string, feed: RoasterFeed): FeedCoffee[] {
    let back: FeedCoffee[] = [];
    change(settings, feedUrl, (current) => {
        const result = afterSync(current, feed);
        back = result.back;
        return result.alerts;
    });
    return back;
}

/** Record that the person subscribed, which is a first look at the feed. */
export function recordSubscribed(settings: Settings, feedUrl: string, feed: RoasterFeed): void {
    change(settings, feedUrl, (current) => firstSight(feed, current));
}

export function dropAlerts(settings: Settings, feedUrl: string): void {
    change(settings, feedUrl, () => undefined);
}

/**
 * One visit to the coffee list.
 *
 * NEW coffees shown on the last visit lose their tag now; the ones flagged
 * since are shown with it, and stop counting towards the dot. Every coffee
 * in the list counts as seen.
 */
export function afterListViewed(current: FeedAlerts, coffees: readonly FeedCoffee[]): FeedAlerts {
    const shownBefore = new Set(current.shown);
    const fresh = current.fresh.filter((key) => !shownBefore.has(key));
    return {
        ...current,
        seen:  capped([...current.seen, ...coffees.map(coffeeKey)]),
        fresh,
        shown: [...fresh]
    };
}

export function recordListViewed(
    settings: Settings, feedUrl: string, coffees: readonly FeedCoffee[]
): void {
    change(settings, feedUrl, (current) =>
        current === undefined ? undefined : afterListViewed(current, coffees));
}

/** Opening a coffee: it is seen, and neither NEW nor back any more. */
export function afterOpened(current: FeedAlerts, coffee: FeedCoffee): FeedAlerts {
    const key = coffeeKey(coffee);
    return {
        ...current,
        seen:  capped([...current.seen, key]),
        fresh: current.fresh.filter((entry) => entry !== key),
        shown: current.shown.filter((entry) => entry !== key),
        back:  current.back.filter((entry) => splitWatch(entry).coffee !== key)
    };
}

export function recordOpened(settings: Settings, feedUrl: string, coffee: FeedCoffee): void {
    change(settings, feedUrl, (current) =>
        current === undefined ? undefined : afterOpened(current, coffee));
}

/**
 * Turn a watch on or off. Off also clears a "back" flag the key raised, so
 * the toggle is the other way to say "I have seen it".
 */
export function withWatch(current: FeedAlerts, key: string, on: boolean): FeedAlerts {
    return on
        ? {...current, watch: capped([...current.watch, key])}
        : {...current,
           watch: current.watch.filter((entry) => entry !== key),
           back:  current.back.filter((entry) => entry !== key)};
}

export function setWatch(settings: Settings, feedUrl: string, key: string, on: boolean): void {
    change(settings, feedUrl, (current) => withWatch(current ?? emptyAlerts(), key, on));
}

/** What a coffee's row and screen say about it. */
export type CoffeeBadge = "back" | "new" | undefined;

/** Back in stock wins over NEW: it is the one the person asked for. */
export function coffeeBadge(alerts: FeedAlerts | undefined, coffee: FeedCoffee): CoffeeBadge {
    if (alerts === undefined) return undefined;
    const key = coffeeKey(coffee);
    if (alerts.back.some((entry) => splitWatch(entry).coffee === key)) return "back";
    return alerts.fresh.includes(key) ? "new" : undefined;
}

/**
 * What the dot on a roaster counts: NEW coffees not yet shown in the list,
 * and coffees that came back, each coffee once.
 */
export function alertCounts(alerts: FeedAlerts | undefined): {fresh: number; back: number} {
    if (alerts === undefined) return {fresh: 0, back: 0};
    const shown = new Set(alerts.shown);
    const back = new Set(alerts.back.map((entry) => splitWatch(entry).coffee));
    const fresh = alerts.fresh.filter((key) => !shown.has(key) && !back.has(key));
    return {fresh: fresh.length, back: back.size};
}

export type AlertSummary = {count: number; spoken?: string};

/** The dot's number, and how a screen reader says it. */
export function alertSummary(alerts: FeedAlerts | undefined): AlertSummary {
    return summarise(alertCounts(alerts));
}

/** The same, added up over every subscription: the dot on ROASTERS. */
export function totalAlertSummary(stored: string, feedUrls: readonly string[]): AlertSummary {
    const all = parseAlerts(stored);
    let fresh = 0;
    let back = 0;
    for (const url of feedUrls) {
        const key = feedKey(url);
        const counts = alertCounts(key === null ? undefined : all[key]);
        fresh += counts.fresh;
        back += counts.back;
    }
    return summarise({fresh, back});
}

function summarise({fresh, back}: {fresh: number; back: number}): AlertSummary {
    const parts = [
        fresh > 0 ? `${fresh} new` : undefined,
        back > 0 ? `${back} back in stock` : undefined
    ].filter((part): part is string => part !== undefined);
    return parts.length === 0 ? {count: 0} : {count: fresh + back, spoken: parts.join(", ")};
}

/** The one toast a sync makes for what it brought back, or null. */
export function backInStockMessage(roaster: string, back: readonly FeedCoffee[]): string | null {
    if (back.length === 0) return null;
    if (back.length === 1) return `${back[0].name} is back at ${roaster}.`;
    return `${back.length} coffees you asked about are back at ${roaster}.`;
}
