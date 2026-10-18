import {MAX_URL, SHORT_TEXT, coffeeFromFields} from "@/library/brewmindLink";
import {parseImportInput} from "@/library/importInput";
import {httpsUrl, type PodCoffee} from "@/library/podCoffee";

/**
 * A roaster's feed: every coffee it has published a recipe for, in one file.
 *
 * An import link may carry `feed=<https URL>` (see `brewmindLink.ts`). After
 * that link's own recipe has imported, the app offers to add the roaster's
 * other coffees as a shelf, and this module is the only place that reads the
 * file it points at. The format is documented for roasters in
 * `docs/roaster-feed.md`.
 *
 * Everything in a feed is untrusted. It is a file from the open internet,
 * served by whoever minted the link, so it is read the way a backup is: sizes
 * are capped before anything is parsed, every URL must be https, unknown
 * fields are ignored, and a version this build does not know is refused whole
 * rather than read as far as it happens to parse.
 *
 * Nothing here is React and nothing here touches the library.
 */

/** The only feed version this build can read. */
export const ROASTER_FEED_VERSION = 1;

/**
 * The most coffees read from one feed.
 *
 * A roaster with more than this is publishing a catalogue rather than a
 * shelf, and every coffee is a request to xBloom when it is added. The rest
 * are ignored rather than refusing the feed, so a large roaster still gets
 * the first part of its list.
 */
export const MAX_FEED_COFFEES = 200;

/** Recipes read per coffee. A coffee has one per dose, not dozens. */
export const MAX_FEED_RECIPES = 10;

/**
 * The largest feed body read, in characters.
 *
 * A real feed of thirty coffees is about 34 kB, so this is room for the full
 * 200 with long tasting notes and nothing like a size that could hurt a phone.
 */
export const MAX_FEED_CHARS = 1_000_000;

/** How long the feed request may take before it is abandoned. */
export const FEED_TIMEOUT_MS = 15_000;

/** A recipe size label such as `18g`. Short, because it is a label. */
const MAX_SIZE_LABEL = 20;
/** A coffee's id within its feed. Opaque, only ever compared. */
const MAX_COFFEE_ID = 200;

export type FeedRecipe = {
    /** The dose label as the roaster wrote it, e.g. `18g`. */
    size: string;
    /** An xBloom share link, already checked to be one `parseImportInput` reads. */
    share: string;
};

export type FeedCoffee = {
    id?: string;
    name: string;
    /** The roaster's own page for the coffee. */
    url?: string;
    /** False unless the feed said `true`. A missing flag is not a yes. */
    available: boolean;
    image?: string;
    /** Never empty: a coffee with no usable recipe is dropped from the feed. */
    recipes: FeedRecipe[];
    /** The coffee as the rest of the app stores it, name, link and picture included. */
    coffee: PodCoffee;
};

export type RoasterFeed = {
    version: typeof ROASTER_FEED_VERSION;
    roaster: {name: string; url?: string};
    coffees: FeedCoffee[];
};

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

/** Trimmed text within a cap, or undefined. Over-length is refused, not cut. */
function capped(value: unknown, max: number): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.length > max) return undefined;
    return trimmed;
}

function cappedUrl(value: unknown): string | undefined {
    const raw = capped(value, MAX_URL);
    return raw === undefined ? undefined : httpsUrl(raw);
}

function feedRecipe(value: unknown): FeedRecipe | null {
    const entry = record(value);
    if (entry === null) return null;
    const size = capped(entry.size, MAX_SIZE_LABEL);
    const share = cappedUrl(entry.share);
    if (size === undefined || share === undefined) return null;
    // The same parser every other door uses. A link it cannot read would
    // only fail later, one request at a time, so it is dropped here.
    if (parseImportInput(share)?.kind !== "share") return null;
    return {size, share};
}

function feedCoffee(value: unknown): FeedCoffee | null {
    const entry = record(value);
    if (entry === null) return null;
    const name = capped(entry.name, SHORT_TEXT);
    if (name === undefined) return null;

    const recipes = Array.isArray(entry.recipes)
        ? entry.recipes.slice(0, MAX_FEED_RECIPES)
            .map(feedRecipe)
            .filter((recipe): recipe is FeedRecipe => recipe !== null)
        : [];
    if (recipes.length === 0) return null;

    const url = cappedUrl(entry.url);
    const image = cappedUrl(entry.image);

    // The bean block goes through the link's own reader, so a feed and a
    // link cannot disagree about a field's name, its cap or its type. The
    // coffee's name, page and picture are added last so a `bean` block
    // cannot replace them.
    const fields: [string, unknown][] = Object.entries(record(entry.bean) ?? {});
    fields.push(["name", name]);
    if (url !== undefined) fields.push(["url", url]);
    if (image !== undefined) fields.push(["imageUrl", image]);
    const coffee = coffeeFromFields(fields);
    if (coffee === null) return null;

    const result: FeedCoffee = {
        name,
        available: entry.available === true,
        recipes,
        coffee
    };
    const id = capped(entry.id, MAX_COFFEE_ID);
    if (id !== undefined) result.id = id;
    if (url !== undefined) result.url = url;
    if (image !== undefined) result.image = image;
    return result;
}

/**
 * Read a feed body, or null if it is not one this build can use.
 *
 * Parsed from text whatever the response said it was: a shop platform may
 * serve the file as `text/html`, and the content type is no more trustworthy
 * than the body.
 */
export function parseRoasterFeed(text: string): RoasterFeed | null {
    if (text.length > MAX_FEED_CHARS) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    const feed = record(parsed);
    if (feed === null) return null;
    if (feed.version !== ROASTER_FEED_VERSION) return null;

    const roaster = record(feed.roaster);
    const name = capped(roaster?.name, SHORT_TEXT);
    if (roaster === null || name === undefined) return null;
    if (!Array.isArray(feed.coffees)) return null;

    const coffees = feed.coffees
        .slice(0, MAX_FEED_COFFEES)
        .map(feedCoffee)
        .filter((coffee): coffee is FeedCoffee => coffee !== null);

    const result: RoasterFeed = {version: ROASTER_FEED_VERSION, roaster: {name}, coffees};
    const url = cappedUrl(roaster.url);
    if (url !== undefined) result.roaster.url = url;
    return result;
}

/**
 * What a "don't ask again" answer is remembered against.
 *
 * The feed's origin and path, without its query or fragment. A shop that
 * adds a cache-busting parameter is still the same feed, and somebody who
 * said no to it meant the roaster rather than one spelling of its address.
 */
export function feedKey(feedUrl: string): string | null {
    try {
        const url = new URL(feedUrl);
        return `${url.origin}${url.pathname}`;
    } catch {
        return null;
    }
}

/** The feed keys stored in the `roasterFeedOptOut` setting. */
export function parseFeedOptOut(stored: string): string[] {
    if (stored.trim() === "") return [];
    try {
        const parsed: unknown = JSON.parse(stored);
        return Array.isArray(parsed)
            ? parsed.filter((key): key is string => typeof key === "string")
            : [];
    } catch {
        return [];
    }
}

export function serialiseFeedOptOut(keys: readonly string[]): string {
    return JSON.stringify([...new Set(keys)]);
}

export type FetchLike = (
    input: string,
    init: {signal: AbortSignal; headers: Record<string, string>}
) => Promise<{
    ok: boolean;
    headers: {get(name: string): string | null};
    text(): Promise<string>;
}>;

/**
 * The real request, named in `constants/network.ts` as `roasterFeed`.
 *
 * Written as a call rather than passed by reference so the outbound inventory
 * test, which looks for `fetch(` call sites, can see it.
 */
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * Why a feed could not be used: it did not arrive, or it arrived and was not
 * a feed. The two are told apart because the subscriptions screen says which,
 * and "check your connection" is the wrong advice for a broken file.
 */
export class RoasterFeedError extends Error {
    constructor(public readonly kind: "network" | "unreadable", message: string) {
        super(message);
        this.name = "RoasterFeedError";
    }
}

/**
 * Fetch and read a feed.
 *
 * Throws a `RoasterFeedError` on anything that is not a usable feed: a
 * non-https address, a timeout, an HTTP error, an oversized body or a body
 * that does not parse.
 */
export async function fetchRoasterFeed(
    feedUrl: string,
    options: {signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number} = {}
): Promise<RoasterFeed> {
    const {signal, fetchImpl = defaultFetch, timeoutMs = FEED_TIMEOUT_MS} = options;
    const url = feedUrl.length <= MAX_URL ? httpsUrl(feedUrl) : undefined;
    if (url === undefined) {
        throw new RoasterFeedError("unreadable", "A roaster feed must be an https address.");
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort);
    const timer = setTimeout(abort, timeoutMs);

    let text: string;
    try {
        let response: Awaited<ReturnType<FetchLike>>;
        try {
            response = await fetchImpl(url, {
                signal: controller.signal,
                headers: {Accept: "application/json"}
            });
        } catch {
            throw new RoasterFeedError("network", "The roaster feed could not be reached.");
        }
        if (!response.ok) {
            throw new RoasterFeedError("network", "The roaster feed did not load.");
        }
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > MAX_FEED_CHARS) {
            throw new RoasterFeedError("unreadable", "The roaster feed is too large.");
        }
        try {
            text = await response.text();
        } catch {
            throw new RoasterFeedError("network", "The roaster feed stopped loading.");
        }
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
    }

    const feed = parseRoasterFeed(text);
    if (feed === null) {
        throw new RoasterFeedError("unreadable", "The roaster feed could not be read.");
    }
    return feed;
}
