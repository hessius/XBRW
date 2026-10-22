import {httpsUrl} from "@/library/podCoffee";
import {bagKey} from "@/library/roasterAlerts";
import {readCatalogue} from "@/library/roasterCatalogue";
import {
    VARIANT_PLACEHOLDER, type FeedCoffee, type FeedVariant, type RoasterFeed
} from "@/library/roasterFeed";
import {parseSubscriptions} from "@/library/roasterSubscription";
import type {Settings} from "@/library/Settings";

/**
 * Buying a bag of a catalogue coffee.
 *
 * Nothing here knows any one roaster or shop. A bag is bought through its own
 * `url` when the feed gives one, otherwise through the roaster's `add_to_cart`
 * template with the bag's id put in it, otherwise not from the app at all. The
 * link always opens in the browser, so payment never passes through here.
 */

/**
 * The link that buys this bag, or undefined when the feed gives none.
 *
 * The id is URL-encoded before it goes into the template: it is the shop's
 * text, and an id carrying `&` or `#` must not rewrite the rest of the link.
 */
export function buyLink(roaster: RoasterFeed["roaster"], variant: FeedVariant): string | undefined {
    if (variant.url !== undefined) return variant.url;
    if (roaster.addToCart === undefined || variant.id === undefined) return undefined;
    const link = roaster.addToCart.split(VARIANT_PLACEHOLDER).join(encodeURIComponent(variant.id));
    return httpsUrl(link);
}

/**
 * A price as a shopper reads it: `$28`, `$28.50`.
 *
 * The narrow symbol rather than `A$`, with placement and punctuation following
 * the phone's locale. A runtime without the currency (or without Intl) falls
 * back to `$28 AUD`, which still names it.
 */
export function formatPrice(price: number, currency?: string): string {
    const whole = Number.isInteger(price);
    if (currency !== undefined) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency,
                currencyDisplay: "narrowSymbol",
                minimumFractionDigits: whole ? 0 : 2,
                maximumFractionDigits: 2
            }).format(price);
        } catch {
            // Fall through to the plain form.
        }
    }
    const amount = whole ? String(price) : price.toFixed(2);
    return currency === undefined ? `$${amount}` : `$${amount} ${currency}`;
}

/** "160 g", "1 kg": the bag line's own words. */
export function bagGramsLabel(grams: number): string {
    return grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
}

/** One row of the BUY section. */
export type BuyOption = {
    key: string;
    /** "160 g · $28", or whichever half the feed gave. */
    label: string;
    grams?: number;
    price?: number;
    currency?: string;
    /** Absent when there is nothing to tap. */
    url?: string;
    /** Sold out when the bag or the whole coffee is. */
    available: boolean;
    /** How the bag is watched for coming back: its id or size. Absent with neither. */
    bag?: string;
};

/** The coffee's bags as the BUY section lists them, in the feed's order. */
export function buyOptions(roaster: RoasterFeed["roaster"], coffee: FeedCoffee): BuyOption[] {
    return coffee.variants.map((variant, index) => {
        const parts = [
            variant.grams === undefined ? undefined : bagGramsLabel(variant.grams),
            variant.price === undefined ? undefined : formatPrice(variant.price, variant.currency)
        ].filter((part): part is string => part !== undefined);
        const option: BuyOption = {
            key: variant.id ?? `${index}`,
            label: parts.length > 0 ? parts.join(" · ") : "Bag",
            available: coffee.available && variant.available
        };
        if (variant.grams !== undefined) option.grams = variant.grams;
        if (variant.price !== undefined) option.price = variant.price;
        if (variant.currency !== undefined) option.currency = variant.currency;
        const url = buyLink(roaster, variant);
        if (url !== undefined) option.url = url;
        const bag = bagKey(variant);
        if (bag !== undefined) option.bag = bag;
        return option;
    });
}

/**
 * The bag sizes to offer when shelving a coffee: the variants' sizes, then
 * the plain `bag_sizes_g` list, then nothing (the bag form's own presets).
 */
export function bagChoices(coffee: FeedCoffee): number[] {
    const fromVariants = coffee.variants
        .map((variant) => variant.grams)
        .filter((grams): grams is number => grams !== undefined);
    return [...new Set(fromVariants.length > 0 ? fromVariants : coffee.bagSizes)];
}

/** The variant sold in this size, preferring one on sale. */
export function variantForGrams(coffee: FeedCoffee, grams: number): FeedVariant | undefined {
    const matches = coffee.variants.filter((variant) => variant.grams === grams);
    return matches.find((variant) => variant.available) ?? matches[0];
}

/** An address in the form the URL parser writes it, for comparing two of them. */
function normalised(url: string | undefined): string | undefined {
    if (url === undefined || url === "") return undefined;
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
        return undefined;
    }
}

/**
 * The link that buys the same bag again, for a recipe whose coffee came from
 * a subscribed roaster's catalogue: the bag of `grams` if the coffee is still
 * listed and still sells that size, else undefined (the caller falls back to
 * the product page).
 *
 * The coffee is found by its page, which the catalogue stores on every recipe
 * it adds (`coffee.url`), so this works for any roaster that gives coffees a
 * page. Reads only the cached feeds; nothing is fetched.
 */
export function reorderLink(
    settings: Settings, coffeeUrl: string | undefined, grams: number | undefined
): string | undefined {
    const page = normalised(coffeeUrl);
    if (page === undefined || grams === undefined) return undefined;
    for (const sub of parseSubscriptions(settings.get("roasterSubscriptions"))) {
        const cached = readCatalogue(settings, sub.feed);
        if (cached === null) continue;
        const coffee = cached.feed.coffees.find((entry) => normalised(entry.url) === page);
        if (coffee === undefined) continue;
        const variant = variantForGrams(coffee, grams);
        return variant === undefined ? undefined : buyLink(cached.feed.roaster, variant);
    }
    return undefined;
}
