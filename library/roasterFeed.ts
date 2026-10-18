import {MAX_URL, SHORT_TEXT, coffeeFromFields} from "@/library/brewmindLink";
import {parseImportInput} from "@/library/importInput";
import {httpsUrl, type PodCoffee} from "@/library/podCoffee";

/**
 * A roaster's feed: every coffee it has published a recipe for, in one file.
 *
 * An import link may carry `feed=<https URL>` (see `brewmindLink.ts`). After
 * that link's own recipe has imported, the app offers to subscribe to the
 * roaster, which adds its coffees to a catalogue the user can browse. This
 * module is the only place that reads the file. The format is documented for
 * roasters in `docs/roaster-feed.md`.
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
 * A roaster with more than this is publishing a wholesale list rather than a
 * range, and the catalogue is drawn on a phone. The rest are ignored rather
 * than refusing the feed, so a large roaster still gets the first part of
 * its list.
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

/**
 * How the roaster says to treat the roast, in days since the roast date.
 *
 * Every field is optional and checked on its own, so one bad number costs
 * that number and not the block.
 */
export type FeedRoast = {
    /** The roaster's own name for the level, e.g. "Nordic Ultra-light". */
    level?: string;
    /** Days to rest before it is ready. */
    restDays?: number;
    /** The day it is at its best. */
    peakDay?: number;
    /** The last day the roaster recommends it. */
    bestUntilDay?: number;
};

/** Days a roast field may name. A year and a half is past any coffee's life. */
const MAX_ROAST_DAY = 540;
/** Bag sizes listed per coffee. */
const MAX_BAG_SIZES = 10;
/** The largest bag, in grams. Five kilos covers a wholesale bag. */
const MAX_BAG_GRAMS = 5000;

/** Variants read per coffee: one per bag size, so a handful. */
export const MAX_FEED_VARIANTS = 10;
/** A variant id is opaque, only ever substituted into a link. */
const MAX_VARIANT_ID = 100;
/** The highest price read. A typo or a wholesale sack, not a bag. */
const MAX_PRICE = 100_000;
/** What an add-to-cart template must contain for a variant to be put in it. */
export const VARIANT_PLACEHOLDER = "{variant_id}";

/**
 * One bag a coffee is sold in.
 *
 * Every field is optional, because roasters sell through every kind of shop.
 * A Shopify store sends an `id` and the roaster's `add_to_cart` template turns
 * it into a cart link; a shop with no such template sends the bag's own `url`.
 * A variant with neither still shows its size and price, with nothing to tap.
 */
export type FeedVariant = {
    /** The shop's id for this bag, substituted into `add_to_cart`. */
    id?: string;
    grams?: number;
    price?: number;
    /** ISO 4217, upper case, e.g. `AUD`. */
    currency?: string;
    /** False unless the feed said `true`, like a coffee's own flag. */
    available: boolean;
    /** A page or cart link for exactly this bag. https. Wins over the template. */
    url?: string;
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
    /** Absent when the feed sent none, or nothing in it was usable. */
    roast?: FeedRoast;
    /** Bag sizes on sale, in grams, as the roaster listed them. */
    bagSizes: number[];
    /** The bags on sale, with prices and buy links. Empty when the feed sent none. */
    variants: FeedVariant[];
};

export type RoasterFeed = {
    version: typeof ROASTER_FEED_VERSION;
    roaster: {
        name: string;
        url?: string;
        /**
         * A cart link with `{variant_id}` in it, e.g. a Shopify store's
         * `https://shop.example/cart/add?id={variant_id}&quantity=1`.
         */
        addToCart?: string;
    };
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

/** A whole number of days within range, or undefined. Zero is a real day here. */
function day(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value)
        && value >= 0 && value <= MAX_ROAST_DAY ? value : undefined;
}

function roast(value: unknown): FeedRoast | undefined {
    const entry = record(value);
    if (entry === null) return undefined;
    const result: FeedRoast = {};
    const level = capped(entry.level, SHORT_TEXT);
    if (level !== undefined) result.level = level;
    const restDays = day(entry.rest_days);
    if (restDays !== undefined) result.restDays = restDays;
    const peakDay = day(entry.peak_day);
    if (peakDay !== undefined) result.peakDay = peakDay;
    const bestUntilDay = day(entry.best_until_day);
    if (bestUntilDay !== undefined) result.bestUntilDay = bestUntilDay;
    return Object.keys(result).length > 0 ? result : undefined;
}

function bagSizes(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const sizes = value
        .slice(0, MAX_BAG_SIZES)
        .filter((grams): grams is number => typeof grams === "number"
            && Number.isInteger(grams) && grams > 0 && grams <= MAX_BAG_GRAMS);
    return [...new Set(sizes)];
}

/** An id the shop wrote as a number or as text. */
function variantId(value: unknown): string | undefined {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
    }
    return capped(value, MAX_VARIANT_ID);
}

function feedVariant(value: unknown): FeedVariant | null {
    const entry = record(value);
    if (entry === null) return null;
    const result: FeedVariant = {available: entry.available === true};
    const id = variantId(entry.id);
    if (id !== undefined) result.id = id;
    const grams = entry.grams;
    if (typeof grams === "number" && Number.isInteger(grams) && grams > 0 && grams <= MAX_BAG_GRAMS) {
        result.grams = grams;
    }
    const price = typeof entry.price === "string" ? Number(entry.price) : entry.price;
    if (typeof price === "number" && Number.isFinite(price) && price >= 0 && price <= MAX_PRICE) {
        result.price = Math.round(price * 100) / 100;
    }
    if (typeof entry.currency === "string" && /^[A-Za-z]{3}$/.test(entry.currency.trim())) {
        result.currency = entry.currency.trim().toUpperCase();
    }
    const url = cappedUrl(entry.url);
    if (url !== undefined) result.url = url;
    // A bag with nothing to say about itself is not a bag.
    return result.id === undefined && result.grams === undefined
        && result.price === undefined && result.url === undefined ? null : result;
}

function variants(value: unknown): FeedVariant[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_FEED_VARIANTS)
        .map(feedVariant)
        .filter((variant): variant is FeedVariant => variant !== null);
}

/** An https cart template that has somewhere to put the variant, or undefined. */
function cartTemplate(value: unknown): string | undefined {
    const raw = capped(value, MAX_URL);
    if (raw === undefined || !raw.includes(VARIANT_PLACEHOLDER)) return undefined;
    return httpsUrl(raw.split(VARIANT_PLACEHOLDER).join("0")) === undefined ? undefined : raw;
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
        coffee,
        bagSizes: bagSizes(entry.bag_sizes_g),
        variants: variants(entry.variants)
    };
    const read = roast(entry.roast);
    if (read !== undefined) result.roast = read;
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
    const addToCart = cartTemplate(roaster.add_to_cart);
    if (addToCart !== undefined) result.roaster.addToCart = addToCart;
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
    return (await fetchRoasterFeedBody(feedUrl, options)).feed;
}

/**
 * The same, with the body it was read from, which is what the catalogue
 * cache keeps: the text is re-read through `parseRoasterFeed` whenever it is
 * loaded, so a cached feed is validated exactly as a fresh one is.
 */
export async function fetchRoasterFeedBody(
    feedUrl: string,
    options: {signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number} = {}
): Promise<{feed: RoasterFeed; body: string}> {
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
            // Never `application/json` alone. A Shopify store negotiates on
            // Accept: asked for JSON only, it answers a collection URL with
            // its own built-in collection object instead of the theme's feed
            // template, and the feed silently fails to parse. Allowing any
            // type gets the template, which is what the roaster published.
            response = await fetchImpl(url, {
                signal: controller.signal,
                headers: {Accept: "application/json, text/plain, */*"}
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
    return {feed, body: text};
}
