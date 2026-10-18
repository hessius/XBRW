import {
    feedKey, parseRoasterFeed, type FeedCoffee, type FeedRecipe, type RoasterFeed
} from "@/library/roasterFeed";
import type {Settings} from "@/library/Settings";

/**
 * The cached catalogue: the last feed body each subscription read.
 *
 * Stored in the `roasterCatalogue` setting as `{[feedKey]: {body, fetchedAt}}`
 * and held out of backups, because it is a copy of somebody else's file that
 * the next sync fetches again. The body is kept as text and re-read through
 * `parseRoasterFeed` every time it is loaded, so a cached feed is validated
 * exactly as a fresh one is and a tampered cache is no more dangerous than a
 * tampered feed.
 *
 * Browsing the catalogue reads only this. Nothing here asks xBloom for
 * anything: a coffee's recipe is fetched when the user opens it.
 */

type Entry = {body: string; fetchedAt: number};

function readAll(settings: Settings): Record<string, Entry> {
    const stored = settings.get("roasterCatalogue");
    if (stored.trim() === "") return {};
    try {
        const parsed: unknown = JSON.parse(stored);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const result: Record<string, Entry> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            const entry = value as Partial<Entry> | null;
            if (entry !== null && typeof entry === "object"
                && typeof entry.body === "string" && typeof entry.fetchedAt === "number") {
                result[key] = {body: entry.body, fetchedAt: entry.fetchedAt};
            }
        }
        return result;
    } catch {
        return {};
    }
}

export type CachedCatalogue = {feed: RoasterFeed; fetchedAt: number};

/** The cached feed for a subscription, or null when there is none or it no longer reads. */
export function readCatalogue(settings: Settings, feedUrl: string): CachedCatalogue | null {
    const key = feedKey(feedUrl);
    if (key === null) return null;
    const entry = readAll(settings)[key];
    if (entry === undefined) return null;
    const feed = parseRoasterFeed(entry.body);
    return feed === null ? null : {feed, fetchedAt: entry.fetchedAt};
}

export function writeCatalogue(
    settings: Settings, feedUrl: string, body: string, fetchedAt: number
): void {
    const key = feedKey(feedUrl);
    if (key === null) return;
    settings.set("roasterCatalogue", JSON.stringify({...readAll(settings), [key]: {body, fetchedAt}}));
}

export function dropCatalogue(settings: Settings, feedUrl: string): void {
    const key = feedKey(feedUrl);
    if (key === null) return;
    const all = readAll(settings);
    delete all[key];
    settings.set("roasterCatalogue", JSON.stringify(all));
}

/**
 * How a screen names a coffee in a route: its feed id, or its place in the
 * feed when the roaster gave it no id.
 */
export function coffeeRef(feed: RoasterFeed, coffee: FeedCoffee): string {
    return coffee.id ?? `#${feed.coffees.indexOf(coffee)}`;
}

export function findCoffee(feed: RoasterFeed, ref: string): FeedCoffee | undefined {
    if (ref.startsWith("#")) {
        const index = Number(ref.slice(1));
        return Number.isInteger(index) ? feed.coffees[index] : undefined;
    }
    return feed.coffees.find((coffee) => coffee.id === ref);
}

function sizeKey(size: string): string {
    return size.replace(/\s+/g, "").toLowerCase();
}

/** The dose offered first, when a coffee has it. */
export const DEFAULT_SIZE = "18g";

/** The recipe for a size, or the 18g one, or the first. */
export function chooseRecipe(coffee: FeedCoffee, size?: string): FeedRecipe {
    const wanted = size === undefined ? DEFAULT_SIZE : sizeKey(size);
    return coffee.recipes.find((recipe) => sizeKey(recipe.size) === wanted)
        ?? coffee.recipes.find((recipe) => sizeKey(recipe.size) === DEFAULT_SIZE)
        ?? coffee.recipes[0];
}

/**
 * "Rest 14 days, peak day 35", from whatever the roaster stated.
 *
 * Null when it stated none of the three days. Each part is left out on its
 * own when missing, so a feed that only knows its peak day still says it.
 */
export function roastAdvice(coffee: FeedCoffee): string | null {
    const roast = coffee.roast;
    if (roast === undefined) return null;
    const parts: string[] = [];
    if (roast.restDays !== undefined) {
        parts.push(roast.restDays === 1 ? "Rest 1 day" : `Rest ${roast.restDays} days`);
    }
    if (roast.peakDay !== undefined) parts.push(`peak day ${roast.peakDay}`);
    if (roast.bestUntilDay !== undefined) parts.push(`best by day ${roast.bestUntilDay}`);
    if (parts.length === 0) return null;
    const line = parts.join(", ");
    return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "320 g · 160 g", largest first as roasters list them. */
export function bagLine(coffee: FeedCoffee): string | null {
    if (coffee.bagSizes.length === 0) return null;
    return coffee.bagSizes
        .map((grams) => grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`)
        .join(" · ");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Updated 2 h ago", in the short units the rest of the app uses. */
export function updatedAgo(at: number, now: number): string {
    const elapsed = Math.max(0, now - at);
    if (elapsed < MINUTE) return "Updated just now";
    if (elapsed < HOUR) return `Updated ${Math.floor(elapsed / MINUTE)} min ago`;
    if (elapsed < DAY) return `Updated ${Math.floor(elapsed / HOUR)} h ago`;
    return `Updated ${Math.floor(elapsed / DAY)} d ago`;
}
