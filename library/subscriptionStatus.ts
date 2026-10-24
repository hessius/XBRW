import {updatedAgo} from "@/library/roasterCatalogue";
import type {RoasterFeed} from "@/library/roasterFeed";
import type {RoasterSubscription, SyncError} from "@/library/roasterSubscription";

/**
 * The words the subscriptions list and a roaster's subscription screen use to
 * say what a subscription holds and how fresh it is. Pure, so both screens
 * read the same sentence and it can be tested without drawing either.
 */

const ERROR_TEXT: Record<SyncError, string> = {
    network:    "no connection to the roaster",
    unreadable: "the roaster's list could not be read"
};

/** The one line that says how fresh a subscription is. */
export function statusLine(sub: RoasterSubscription, now: number): string {
    if (sub.paused) return "Updates paused.";
    if (sub.lastError !== undefined) return `Couldn't update: ${ERROR_TEXT[sub.lastError]}.`;
    if (sub.lastSync === 0) return "Not updated yet.";
    return `${updatedAgo(sub.lastSync, now)}.`;
}

/** "30 coffees · 4 sold out", from the cached catalogue. */
export function countLine(feed: RoasterFeed | null): string {
    if (feed === null) return "Not loaded yet";
    const total = feed.coffees.length;
    const soldOut = feed.coffees.filter((coffee) => !coffee.available).length;
    const coffees = total === 1 ? "1 coffee" : `${total} coffees`;
    return soldOut > 0 ? `${coffees} · ${soldOut} sold out` : coffees;
}

/**
 * The detail under a roaster on the subscriptions list:
 * "12 coffees · Updated 2 h ago".
 *
 * Shorter than the subscription screen's two lines, because a row has one.
 * Without a cached feed there is no count to give, so the row says the
 * coffees are on their way, or that the last attempt to fetch them failed.
 */
export function rowLine(sub: RoasterSubscription, feed: RoasterFeed | null, now: number): string {
    if (feed === null) {
        if (sub.paused) return "Updates paused";
        return sub.lastError === undefined ? "Loading coffees" : "Couldn't update";
    }
    const total = feed.coffees.length;
    const coffees = total === 1 ? "1 coffee" : `${total} coffees`;
    if (sub.paused) return `${coffees} · Paused`;
    if (sub.lastError !== undefined) return `${coffees} · Couldn't update`;
    if (sub.lastSync === 0) return `${coffees} · Not updated yet`;
    return `${coffees} · ${updatedAgo(sub.lastSync, now)}`;
}

/** A feed key without its scheme, which is noise on a phone-width row. */
export function shownKey(key: string): string {
    return key.replace(/^https:\/\//, "");
}
