/**
 * xBloom's own new releases, as a roaster feed.
 *
 * xBloom publishes a recipe on the community catalogue (collective.xbloom.com)
 * for every coffee it releases, under the "xBloom Official" author. Nobody
 * publishes those as a feed, so this reads the newest official rows and writes
 * the `docs/roaster-feed.md` format a subscriber already understands: NEW tags,
 * a catalogue to browse, and recipes fetched from xBloom only when opened.
 *
 * The catalogue has no auth, no RSA and no `skey`; a bare JSON POST is enough
 * (see `library/hub/hubApi.ts`, which browses the same backend from the phone).
 * This file stays free of the app's `@/` imports because Vercel deploys `api/`
 * on its own, with no install and no path aliases.
 */

const BASE = "https://collective-api.xbloom.com";

export const FEED_ROASTER = "xBloom Collective";
export const FEED_SITE = "https://collective.xbloom.com";

/** Rows per catalogue page. Official releases arrive two to four rows a coffee. */
const PAGE_SIZE = 50;
/** Pages read at most, newest first. Four pages reach back a few months. */
const MAX_PAGES = 4;
/** Coffees in the feed. A "new releases" list, not the whole back catalogue. */
export const MAX_COFFEES = 60;
/** The app's caps (`library/roasterFeed.ts`), so nothing is dropped over there. */
const MAX_NAME = 120;
const MAX_SIZE_LABEL = 20;
const MAX_RECIPES = 10;
const MAX_FLAVOURS = 12;
const MAX_FLAVOUR = 32;

/** The catalogue's own roast vocabulary (`/communityRecipe/recipe/criteria`). */
const ROAST_LEVELS: Record<number, string> = {
    1: "Light Roast",
    2: "Medium-Light Roast",
    3: "Medium Roast",
    4: "Medium-Dark Roast",
    5: "Dark Roast"
};

/** The fields of a list row this feed reads. Everything else is ignored. */
export type CollectiveRow = {
    communityRecipeId: number;
    recipeName: string | null;
    imageUrl: string | null;
    official: number;
    model: string | null;
    cupType: string | null;
    type: string | null;
    origin: (string | null)[] | null;
    varietal: (string | null)[] | null;
    process: (string | null)[] | null;
    flavor: (string | null)[] | null;
    roast: number | null;
    dose: number | null;
    shareRecipeLink: string | null;
};

type FeedRecipe = {size: string; share: string};

type FeedCoffee = {
    id: string;
    name: string;
    url: string;
    available: true;
    image?: string;
    recipes: FeedRecipe[];
    roast?: {level: string};
    bean: Record<string, unknown>;
};

export type CollectiveFeed = {
    version: 1;
    roaster: {name: string; url: string; feed: string};
    coffees: FeedCoffee[];
};

export type FetchLike = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body: string;
}) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

/**
 * The newest official coffee rows, newest first.
 *
 * `recipeType: 1` keeps tea out, `recipeUserType: 1` keeps to xBloom's own
 * rows, and `sort: 1, sortType: 2` is upload date descending — the same body
 * the catalogue's own "Official, newest" view sends. Stops early once enough
 * distinct coffees have been seen, so a normal refresh is one or two calls.
 */
export async function fetchOfficialRows(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<CollectiveRow[]> {
    const rows: CollectiveRow[] = [];
    const names = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchImpl(`${BASE}/communityRecipe/index/page`, {
            method:  "POST",
            headers: {"content-type": "application/json", accept: "application/json", LanguageType: "0"},
            body:    JSON.stringify({
                pageIndex: page, pageSize: PAGE_SIZE,
                recipeType: 1, recipeUserType: 1, sort: 1, sortType: 2
            })
        });
        if (!res.ok) {
            throw new Error(`catalogue returned ${res.status}`);
        }
        const envelope = await res.json() as {code?: number; data?: {list?: CollectiveRow[]; totalPage?: number}};
        if (envelope.code !== 200 || !Array.isArray(envelope.data?.list)) {
            throw new Error(`catalogue answered code ${envelope.code}`);
        }
        for (const row of envelope.data.list) {
            rows.push(row);
            const key = coffeeKey(row.recipeName);
            if (key) names.add(key);
        }
        if (names.size >= MAX_COFFEES || page >= (envelope.data.totalPage ?? 0)) break;
    }
    return rows;
}

/**
 * The feed for those rows.
 *
 * Rows for the same coffee (one per machine model, sometimes an Omni dripper
 * version too) become one coffee with a recipe per row, labelled by dose and
 * model so the size picker reads "15G ORIGINAL" / "15G STUDIO". Rows that are
 * not official, have no name or no xBloom share link are skipped.
 */
export function buildCollectiveFeed(rows: readonly CollectiveRow[], feedUrl: string): CollectiveFeed {
    const coffees = new Map<string, FeedCoffee>();
    for (const row of rows) {
        if (row.official !== 1) continue;
        const name = clean(row.recipeName)?.slice(0, MAX_NAME);
        const key = coffeeKey(name);
        const share = shareLink(row.shareRecipeLink);
        if (!name || !key || !share) continue;

        let coffee = coffees.get(key);
        if (!coffee) {
            if (coffees.size >= MAX_COFFEES) continue;
            coffee = newCoffee(row, name, key);
            coffees.set(key, coffee);
        }
        const size = sizeLabel(row);
        if (coffee.recipes.length < MAX_RECIPES &&
            !coffee.recipes.some((recipe) => recipe.size === size || recipe.share === share)) {
            coffee.recipes.push({size, share});
        }
    }
    return {
        version: 1,
        roaster: {name: FEED_ROASTER, url: FEED_SITE, feed: feedUrl},
        coffees: [...coffees.values()]
    };
}

function newCoffee(row: CollectiveRow, name: string, key: string): FeedCoffee {
    const flavours = facet(row.flavor).map((f) => f.slice(0, MAX_FLAVOUR)).slice(0, MAX_FLAVOURS);
    const bean: Record<string, unknown> = {};
    const country = facet(row.origin).join(", ");
    const processing = facet(row.process).join(", ");
    const variety = facet(row.varietal).join(", ");
    if (country) bean.country = country;
    if (processing) bean.processing = processing;
    if (variety) bean.variety = variety;
    if (flavours.length > 0) {
        bean.flavours = flavours;
        bean.aromatics = flavours.join(", ");
    }
    const tags = [clean(row.type), clean(row.cupType)].filter((t): t is string => !!t);
    if (tags.length > 0) bean.tags = tags;

    const coffee: FeedCoffee = {
        id:        `xbloom-${key}`,
        name,
        url:       `${FEED_SITE}/recipe/${row.communityRecipeId}`,
        // Every release is listed while xBloom lists it. Pods are sold on
        // xbloom.com, not here, so there is no bag to be out of stock.
        available: true,
        recipes:   [],
        bean
    };
    const image = https(row.imageUrl);
    if (image) coffee.image = image;
    const level = row.roast === null ? undefined : ROAST_LEVELS[row.roast];
    if (level) coffee.roast = {level};
    return coffee;
}

/** "15g Original", "15g Studio", "16g Studio Omni". Within the app's 20 characters. */
function sizeLabel(row: CollectiveRow): string {
    const dose = typeof row.dose === "number" && row.dose > 0 ? `${row.dose}g` : "";
    const cup = clean(row.cupType);
    const parts = [dose, clean(row.model), cup && cup.toLowerCase() !== "xpod" ? cup : null];
    const label = parts.filter(Boolean).join(" ").slice(0, MAX_SIZE_LABEL).trim();
    return label || `#${row.communityRecipeId}`.slice(0, MAX_SIZE_LABEL);
}

/** A stable slug for a coffee's name, so NEW and re-listing match it later. */
export function coffeeKey(name: string | null | undefined): string | null {
    const slug = (clean(name) ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 180);
    return slug || null;
}

/**
 * A facet array as values. Official rows often pack a whole comma-joined list
 * into element zero ("Apricot, Vanilla, Dried mango", or "Peach • Jasmine"), so
 * split on those joiners, never on spaces ("Costa Rica" is one country) or
 * slashes ("N/A").
 */
function facet(values: readonly (string | null)[] | null | undefined): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
        for (const piece of (clean(raw) ?? "").split(/\s*[,;|•·、]\s*/)) {
            const value = piece.trim();
            if (!value || /^(n\/?a|none|-+|\?+)$/i.test(value) || seen.has(value.toLowerCase())) continue;
            seen.add(value.toLowerCase());
            out.push(value);
        }
    }
    return out;
}

function clean(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.replace(/\s+/g, " ").trim();
    return text || null;
}

function https(value: unknown): string | undefined {
    const text = clean(value);
    if (!text || text.length > 2000) return undefined;
    try {
        return new URL(text).protocol === "https:" ? text : undefined;
    } catch {
        return undefined;
    }
}

/** Only an xBloom share page with an `id`, which is all the app imports. */
function shareLink(value: unknown): string | undefined {
    const url = https(value);
    if (!url) return undefined;
    const parsed = new URL(url);
    return /(^|\.)xbloom(coffee)?\.(com|cn)$/.test(parsed.hostname) && parsed.searchParams.get("id")
        ? url
        : undefined;
}
