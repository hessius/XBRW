import {
    feedKey, parseRoasterFeed, type FeedCoffee, type FeedRecipe, type RoasterFeed
} from "@/library/roasterFeed";
import {coffeeDetails, formatCuppingPoints, formatElevation} from "@/library/coffeeDetails";
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
    return readEntries(settings.get("roasterCatalogue"));
}

function readEntries(stored: string): Record<string, Entry> {
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
    return readCatalogueFrom(settings.get("roasterCatalogue"), feedUrl);
}

/**
 * The same, from the setting's stored value: for a screen that already holds
 * it through `useSetting` and redraws when it changes.
 */
export function readCatalogueFrom(stored: string, feedUrl: string): CachedCatalogue | null {
    const key = feedKey(feedUrl);
    if (key === null) return null;
    const entry = readEntries(stored)[key];
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

/** Separate namespaces keep opaque feed ids from being read as positions. */
export function coffeeRef(feed: RoasterFeed, coffee: FeedCoffee): string {
    return coffee.id === undefined
        ? `index:${feed.coffees.indexOf(coffee)}`
        : `id:${coffee.id}`;
}

export function findCoffee(feed: RoasterFeed, ref: string): FeedCoffee | undefined {
    if (ref.startsWith("id:")) {
        return feed.coffees.find((coffee) => coffee.id === ref.slice(3));
    }
    if (ref.startsWith("index:")) {
        const position = ref.slice(6);
        if (!/^(0|[1-9]\d*)$/.test(position)) return undefined;
        const index = Number(position);
        if (!Number.isSafeInteger(index)) return undefined;
        const coffee = feed.coffees[index];
        return coffee?.id === undefined ? coffee : undefined;
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

/** One label and value under a coffee, as ABOUT's XPOD block draws them. */
export type BeanFact = {label: string; value: string};

/** ABOUT's formatters, re-exported so this module's callers and tests keep their names. */
export {formatElevation};
export function formatScore(points: number): string {
    return `${formatCuppingPoints(points)} points`;
}

/** Fields the coffee screen draws elsewhere: the roaster is the screen's own, flavours are chips. */
const DRAWN_ELSEWHERE = new Set(["roaster", "aromatics", "roast"]);

/**
 * The bean facts a bag would print, read from ABOUT's own rows.
 *
 * `coffeeDetails` is what the XPOD block on ABOUT draws, so the same coffee
 * cannot be called one thing here and another there once it is added: FARMER
 * rather than producer, VARIETAL, `1,750 m`, `90 points`. The roaster, the
 * flavours and the roast level are left out because this screen draws them
 * itself.
 */
export function beanFacts(coffee: FeedCoffee): BeanFact[] {
    const details = coffeeDetails(coffee.coffee, {podName: coffee.name});
    if (details === null) return [];
    return details.groups.flat()
        .filter((row) => !DRAWN_ELSEWHERE.has(row.field))
        .map((row) => ({label: row.label, value: row.value}));
}

/** A name longer than this is drawn a step smaller in the detail header. */
export const LONG_TITLE = 32;
/** The step down, between the 28 of a screen title and the 18 of a collapsed one. */
export const LONG_TITLE_SIZE = 22;
/** Lines the detail header may take before the name is cut short. */
export const DETAIL_TITLE_LINES = 3;

/**
 * How the coffee detail header draws a coffee's name.
 *
 * A roaster's names run long ("Colombia | Las Flores | Jhoan Vergara | Java
 * Hydrohoney"), and one line of it at full size said only "Colombia | Las
 * Flores | ." on a cover screen. Three lines, and a step smaller once it is
 * long enough to need them.
 */
export function detailTitle(name: string): {lines: number; size?: number} {
    return name.length > LONG_TITLE
        ? {lines: DETAIL_TITLE_LINES, size: LONG_TITLE_SIZE}
        : {lines: DETAIL_TITLE_LINES};
}

/**
 * Bottom padding for the end of a catalogue screen's scroll view, in points.
 *
 * The last row scrolls to `clearance` points above whatever the system draws
 * at the bottom (Android's three-button bar is an opaque 48 points), and
 * never to less than the `minimum` the screen was laid out with.
 */
export function scrollEndPadding(minimum: number, bottomInset: number, clearance = 24): number {
    return Math.max(minimum, bottomInset + clearance);
}

/** Most chips a coffee's notes are drawn as; more reads as a paragraph. */
export const MAX_NOTE_CHIPS = 8;
/** Longest single chip, in characters. */
export const MAX_NOTE_CHIP = 20;

/**
 * A roaster's tasting notes as chips, or null to draw them as a sentence.
 *
 * Roasters write notes two ways. A short list ("Cherry, Passionfruit" or
 * "Caramel | brown sugar | lemongrass") reads well as chips. Prose ("Clean
 * and well-structured, with a buttery mouthfeel.") does not: split on its
 * commas and upper-cased in Doto it becomes a row of half-sentences. So chips
 * only for 2 to 8 short parts with no full stop and no brackets; anything
 * else, including a bracketed aside such as "(2024 Harvest)", stays prose.
 */
export function noteChips(notes: string | undefined): string[] | null {
    if (notes === undefined) return null;
    if (/[.()[\]{}]/.test(notes)) return null;
    const parts = notes.split(/,|\s\|\s/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > MAX_NOTE_CHIPS) return null;
    if (parts.some((part) => part.length > MAX_NOTE_CHIP)) return null;
    return parts;
}

/**
 * What the coffee screen draws for a coffee's taste: chips, the roaster's
 * prose, and the quieter tags.
 *
 * The feed's `flavours` are the chips when it sends them, because they were
 * written to be chips. The tasting notes are then shown only when they are
 * prose, so a list that repeats the flavours is not drawn twice. Without
 * `flavours` the notes rule (`noteChips`) decides.
 */
export function tasteOf(coffee: FeedCoffee): {chips: string[]; prose?: string; tags: string[]} {
    const notes = coffee.coffee.aromatics?.trim() || undefined;
    const listed = noteChips(notes);
    if (coffee.flavours.length > 0) {
        return listed === null && notes !== undefined
            ? {chips: coffee.flavours, prose: notes, tags: coffee.tags}
            : {chips: coffee.flavours, tags: coffee.tags};
    }
    if (listed !== null) return {chips: listed, tags: coffee.tags};
    return notes === undefined ? {chips: [], tags: coffee.tags} : {chips: [], prose: notes, tags: coffee.tags};
}

/**
 * The notes as one line for a list row: a chip list joined with commas, so a
 * roaster's "a | b | c" reads like everyone else's, and prose as written.
 */
export function notesLine(notes: string | undefined): string | undefined {
    const chips = noteChips(notes);
    if (chips !== null) return chips.join(", ");
    const prose = notes?.trim() ?? "";
    return prose === "" ? undefined : prose;
}
