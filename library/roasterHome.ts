import {alertCounts, parseAlerts} from "@/library/roasterAlerts";
import {coffeeRef, readCatalogueFrom, updatedAgo} from "@/library/roasterCatalogue";
import {feedKey, type FeedCoffee, type RoasterFeed} from "@/library/roasterFeed";
import {EMPTY_COFFEE_QUERY, filterCoffees} from "@/library/roasterFilters";
import {parseSubscriptions, type RoasterSubscription} from "@/library/roasterSubscription";

/**
 * The roaster catalogue as the home screen sees it: the subscribed roasters'
 * cached coffees, for the home search, the roasters strip, the import sheet's
 * row and the empty library's button.
 *
 * Read from the cached feeds only, so nothing here costs a request, and
 * nothing here is drawn for somebody with no subscriptions. Pure and
 * React-free; `hooks/useHomeRoasters.ts` binds it to the settings.
 */

/** One subscription and its cached feed, when there is one. */
export type HomeCatalogue = {
    sub: RoasterSubscription;
    /** Null before the first sync, or when the cached body no longer reads. */
    feed: RoasterFeed | null;
    /** When the cached feed was read. 0 without one. */
    fetchedAt: number;
};

/** A coffee the home search found in a subscribed roaster's catalogue. */
export type RoasterMatch = {
    /** The subscription's feed URL: the route parameter the coffee screen reads. */
    feedUrl: string;
    roaster: string;
    coffee: FeedCoffee;
    /** The coffee's route reference, as the roaster's own list builds it. */
    ref: string;
};

/** One row of the roasters strip. */
export type StripRow = {
    feedUrl: string;
    roaster: string;
    /**
     * Whether a cached feed exists. Without one the roaster's list has
     * nothing to show, so the row opens the roaster's feed screen instead,
     * where REFRESH NOW is.
     */
    cached: boolean;
    /** Coffees in the cached feed, sold out included, as the ROASTERS list counts them. */
    count: number;
    /**
     * The line under the name: the count, or what is in the way of one.
     * See `stripDetail`.
     */
    detail: string;
    /** Updates are paused: the cached coffees still show, with a marker. */
    paused: boolean;
    /** NEW coffees not yet shown in the list, from the same rule as the dot. */
    fresh: number;
    /** Coffees back in stock that the person asked about. */
    back: number;
    /** Up to three coffee photos, on-sale coffees first. */
    photos: string[];
    /** Pinned to the home screen from the roaster's feed screen. */
    pinned: boolean;
};

/**
 * The one row that stands for every roaster once there are too many to list:
 * `Roasters · {count}`, with what is waiting across all of them.
 */
export type StripSummary = {count: number; fresh: number; back: number};

/** What the strip draws: roaster rows, then the summary row when there is one. */
export type HomeStrip = {rows: StripRow[]; summary: StripSummary | null};

/**
 * Up to this many subscriptions, every roaster has a row of its own. Past it,
 * the strip shows only the pinned ones and folds the rest into one row.
 */
export const STRIP_ALL_UP_TO = 3;

/** The most pinned roasters the strip shows above the summary row. */
export const STRIP_MAX_PINNED = 3;

/** Photos in a row's stack. */
export const STRIP_PHOTOS = 3;

/** One parse per change of either setting: the home screen redraws far more often. */
let memo: {subs: string; catalogue: string; result: HomeCatalogue[]} | null = null;

/**
 * Every subscription with its cached feed, in subscription order.
 *
 * Memoised on the two stored values, because the home screen redraws on every
 * scroll step and a roaster's feed is tens of kilobytes of JSON.
 */
export function homeCatalogues(subsStored: string, catalogueStored: string): HomeCatalogue[] {
    if (memo !== null && memo.subs === subsStored && memo.catalogue === catalogueStored) {
        return memo.result;
    }
    const result = parseSubscriptions(subsStored).map((sub) => {
        const cached = readCatalogueFrom(catalogueStored, sub.feed);
        return {sub, feed: cached?.feed ?? null, fetchedAt: cached?.fetchedAt ?? 0};
    });
    memo = {subs: subsStored, catalogue: catalogueStored, result};
    return result;
}

/**
 * The home search over every subscribed catalogue.
 *
 * The roaster's own list answers the question: the same `filterCoffees` with
 * only the search term set, so the words find the same coffees in both. The
 * home search then keeps only coffees on sale, which is the roaster list's
 * default too; the one difference is a roaster with everything sold out,
 * whose list still shows its coffees but whose search results are left out,
 * because a search from home is for something to brew or buy now. A roaster
 * with no cached feed yet adds nothing. Nothing for an empty term.
 */
export function searchRoasters(catalogues: readonly HomeCatalogue[], term: string): RoasterMatch[] {
    if (term.trim() === "") return [];
    const matches: RoasterMatch[] = [];
    for (const {sub, feed} of catalogues) {
        if (feed === null) continue;
        const found = filterCoffees(feed.coffees, {...EMPTY_COFFEE_QUERY, term});
        for (const coffee of found.filter((entry) => entry.available)) {
            matches.push({
                feedUrl: sub.feed,
                roaster: feed.roaster.name,
                coffee,
                ref:     coffeeRef(feed, coffee)
            });
        }
    }
    return matches;
}

function photosOf(feed: RoasterFeed | null): string[] {
    if (feed === null) return [];
    const ordered = [
        ...feed.coffees.filter((coffee) => coffee.available),
        ...feed.coffees.filter((coffee) => !coffee.available)
    ];
    return ordered
        .map((coffee) => coffee.image)
        .filter((image): image is string => image !== undefined)
        .slice(0, STRIP_PHOTOS);
}

/**
 * The line under a roaster's name on the strip.
 *
 * - No cached feed: "Loading coffees" while the first sync is to come, or
 *   "Couldn't update" when the last attempt failed. Never the server's words.
 * - A feed with nothing on sale (sold out, or no coffees at all): "No coffees
 *   on sale right now", so the row does not promise a count it cannot sell.
 * - Otherwise the count, as the ROASTERS list gives it.
 *
 * When the last sync failed but a cache exists, the cached coffees are what
 * the row shows, and its age is added ("Updated 3 d ago") so the person can
 * tell the list may be stale. Nothing louder than that: the subscriptions
 * screen is where the error is spelled out.
 */
export function stripDetail(entry: HomeCatalogue, now: number): string {
    const {sub, feed, fetchedAt} = entry;
    if (feed === null) return sub.lastError === undefined ? "Loading coffees" : "Couldn't update";
    const onSale = feed.coffees.some((coffee) => coffee.available);
    const base = onSale ? coffeeCount(feed.coffees.length) : "No coffees on sale right now";
    return sub.lastError === undefined ? base : `${base} · ${updatedAgo(fetchedAt, now)}`;
}

function byName(a: StripRow, b: StripRow): number {
    return a.roaster.localeCompare(b.roaster, undefined, {sensitivity: "base"});
}

/** Pinned first, in the order they were pinned (most recent last); 0 is not pinned. */
function byPin(a: number, b: number): number {
    if (a > 0 && b > 0) return a - b;
    return (b > 0 ? 1 : 0) - (a > 0 ? 1 : 0);
}

/**
 * The strip's rows: every subscription, paused and not yet loaded ones
 * included, so the strip always says what the person subscribed to.
 *
 * Pinned roasters first, in the order they were pinned. Then by what is
 * waiting (NEW plus back in stock), then by name. Alphabetical rather than
 * most recently updated: every sync would reshuffle a by-update order every
 * twelve hours, and the rows on show are the ones a thumb learns to find.
 * `homeStrip` decides which of these are drawn.
 */
export function stripRows(
    catalogues: readonly HomeCatalogue[], alertsStored: string, now: number
): StripRow[] {
    const alerts = parseAlerts(alertsStored);
    const rows = catalogues.map((entry) => {
        const {sub, feed} = entry;
        const key = feedKey(sub.feed);
        const counts = alertCounts(key === null ? undefined : alerts[key]);
        const row: StripRow = {
            feedUrl: sub.feed,
            roaster: feed?.roaster.name ?? sub.roaster,
            cached:  feed !== null,
            count:   feed?.coffees.length ?? 0,
            detail:  stripDetail(entry, now),
            paused:  sub.paused,
            fresh:   counts.fresh,
            back:    counts.back,
            photos:  photosOf(feed),
            pinned:  sub.pinnedAt !== undefined
        };
        return {row, pinnedAt: sub.pinnedAt ?? 0};
    });
    return rows
        .sort((a, b) => byPin(a.pinnedAt, b.pinnedAt)
            || (b.row.fresh + b.row.back) - (a.row.fresh + a.row.back) || byName(a.row, b.row))
        .map((entry) => entry.row);
}

/**
 * What the home strip draws, following hessius's suggestion: list a few
 * roasters, fold many into a sub menu, and let favourites stay on top.
 *
 * - Up to `STRIP_ALL_UP_TO` subscriptions: every roaster has its own row,
 *   pinned ones first. No summary row, since nothing is hidden.
 * - More than that: only the pinned roasters (the first `STRIP_MAX_PINNED`
 *   in pin order), then one `Roasters · {n}` row that opens the full list,
 *   carrying the NEW and back-in-stock counts of every roaster. With none
 *   pinned, that one row is the whole strip.
 *
 * `rows` must be `stripRows`'s answer, so pinned rows are already first.
 */
export function homeStrip(rows: readonly StripRow[]): HomeStrip {
    if (rows.length === 0) return {rows: [], summary: null};
    if (rows.length <= STRIP_ALL_UP_TO) return {rows: [...rows], summary: null};
    return {
        rows:    rows.filter((row) => row.pinned).slice(0, STRIP_MAX_PINNED),
        summary: {
            count: rows.length,
            fresh: rows.reduce((total, row) => total + row.fresh, 0),
            back:  rows.reduce((total, row) => total + row.back, 0)
        }
    };
}

/** What the summary row says to a screen reader. */
export function stripSummaryLabel(summary: StripSummary): string {
    return [
        `All roasters, ${summary.count}`,
        summary.fresh > 0 ? `${summary.fresh} new` : undefined,
        summary.back > 0 ? `${summary.back} back in stock` : undefined
    ].filter((part) => part !== undefined).join(", ");
}

/**
 * The line under the "Pin to the home screen" switch on a roaster's feed
 * screen, which depends on how many roasters there are and whether the
 * home screen shows them at all.
 */
export function pinDescription(subscriptions: number, shownOnHome: boolean): string {
    if (!shownOnHome) return "Roasters are hidden from the home screen. Turn them on in Roaster feeds.";
    if (subscriptions <= STRIP_ALL_UP_TO) {
        return `With ${STRIP_ALL_UP_TO} roasters or fewer, all of them show. Pinned ones come first.`;
    }
    return `With more than ${STRIP_ALL_UP_TO} roasters, only pinned ones show, up to ${STRIP_MAX_PINNED}.`;
}

/**
 * The subscriptions an empty library's button can take somebody to: those
 * with at least one coffee in their cached feed. A roaster still loading, or
 * one whose feed lists nothing, would open onto an empty screen.
 */
export function browsable(catalogues: readonly HomeCatalogue[]): RoasterSubscription[] {
    return catalogues
        .filter((entry) => entry.feed !== null && entry.feed.coffees.length > 0)
        .map((entry) => entry.sub);
}

/** "12 coffees", for a strip row. */
export function coffeeCount(count: number): string {
    return count === 1 ? "1 coffee" : `${count} coffees`;
}

/** What a strip row says to a screen reader. */
export function stripRowLabel(row: StripRow): string {
    return [
        row.roaster,
        row.detail.replace(/ · /g, ", "),
        row.pinned ? "pinned" : undefined,
        row.paused ? "updates paused" : undefined,
        row.fresh > 0 ? `${row.fresh} new` : undefined,
        row.back > 0 ? `${row.back} back in stock` : undefined
    ].filter((part) => part !== undefined).join(", ");
}

/** The empty library's button: one roaster by name, several together. */
export function browseLabel(subs: readonly RoasterSubscription[]): string {
    return subs.length === 1 ? `Browse ${subs[0].roaster}` : "Browse your roasters";
}

/** For tests: forget the memo between cases. */
export function forgetHomeCataloguesForTests(): void {
    memo = null;
}
