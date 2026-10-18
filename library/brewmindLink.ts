import {readLabels} from "@/library/coffeeLabels";
import {MAX_NAME} from "@/library/Recipe";
import {LEGACY_NAMES, PodCoffee, httpsUrl, podCoffeeFromStored} from "@/library/podCoffee";

/**
 * The deep link a coffee app hands XBRW++ (issue #159).
 *
 *     xbrw://import?v=1&source=brewmind&share=<xBloom share URL>&bean.name=...
 *
 * The grammar is a contract with a second codebase, so this file is the only
 * place that knows it, in the same way `library/importInput.ts` is the only
 * place that knows what an xBloom link looks like. A screen must not read a
 * query parameter off one of these itself.
 *
 * Nothing here is React and nothing here navigates. The caller decides what to
 * do with a link; this only says what one means.
 */

/** The only grammar version this build can read. */
export const BREWMIND_LINK_VERSION = "1";

/** The provenance a `source=brewmind` link is recorded under. */
export const BREWMIND_SOURCE = "brewmind";

/**
 * Length caps.
 *
 * These exist because the value arrived from outside. They are *not* in
 * `podCoffee.ts` on purpose: a pod's `note` is a producer narrative running to
 * several hundred words and has always been kept whole, so a cap on the type
 * would start dropping a field that works today. Length is a property of where
 * a value came from rather than of the field, so it is enforced here, where an
 * untrusted value first arrives.
 *
 * The second reason is less obvious. `library/brew/handoff/encode.ts` does not
 * degrade the bean block when a share URL runs long, it throws. An uncapped
 * hostile link could therefore make every brew of that recipe unexportable, so
 * these caps are also what keeps the handoff working. Capped, the whole block
 * is roughly 3 kB before gzip against a 131 kB budget.
 */
export const SHORT_TEXT = 120;
/**
 * A URL's cap, shared by the coffee's link, its image, `recipe.url`, and a
 * roaster `feed`.
 */
export const MAX_URL = 2000;
const CAPS: Readonly<Record<string, number>> = {
    name: SHORT_TEXT,
    roaster: SHORT_TEXT,
    roastingDate: SHORT_TEXT,
    roast: SHORT_TEXT,
    origin: SHORT_TEXT,
    country: SHORT_TEXT,
    region: SHORT_TEXT,
    farm: SHORT_TEXT,
    farmer: SHORT_TEXT,
    processing: SHORT_TEXT,
    fermentation: SHORT_TEXT,
    variety: SHORT_TEXT,
    beanMix: SHORT_TEXT,
    // Not a text field, but it arrives as text and is read by `elevated`.
    // A height nobody could write in 120 characters is not a height.
    elevation: SHORT_TEXT,
    aromatics: 500,
    note: 2000,
    url: MAX_URL,
    imageUrl: MAX_URL,
    // Whole days, 0 to 540, read by `roastDays`. Four digits is room for any
    // of them and nothing else.
    restDays: 4,
    peakDay: 4,
    bestUntilDay: 4
};

/**
 * The parameter names that differ from the field names.
 *
 * `bean.image` is #159's spelling and `imageUrl` is the key this app has
 * stored and sent since the handoff shipped, so renaming either would break a
 * half that already works.
 *
 * The rest are #159's first table, which claimed Beanconqueror's field names
 * and diverged on five of them. The table has been corrected, but a link is
 * minted by a second codebase on a release schedule this one does not control,
 * so the old spellings keep working rather than becoming a silently dropped
 * field. They are taken from `LEGACY_NAMES` rather than listed again here:
 * two hand-maintained copies of the same rename would eventually disagree
 * about one field, and the one that disagreed would fail quietly.
 *
 * Aliasing happens before the cap is looked up, so a legacy spelling is capped
 * exactly like the current one.
 */
const PARAM_ALIASES: Readonly<Record<string, string>> = {
    image: "imageUrl",
    // The roaster feed's spelling, so a roaster mints both with one set of names.
    rest_days: "restDays",
    peak_day: "peakDay",
    best_until_day: "bestUntilDay",
    ...LEGACY_NAMES
};

export type BrewMindLink = {
    /** The raw `share` value, still to go through `parseImportInput`. */
    share: string;
    /** The coffee block, absent if the link carried no usable one. */
    coffee?: PodCoffee;
    /** The producer, as stated. Recorded rather than gated. */
    source?: string;
    /**
     * `recipe.url`: the producer's own page for this recipe.
     *
     * Not the share link and not the coffee's `url`. The share link resolves
     * to xBloom's copy of the numbers; this is the page that says why the
     * numbers are what they are, which is the part a recipe loses on the way
     * through xBloom. https only, on the same reasoning as an image.
     */
    recipeUrl?: string;
    /**
     * `recipe.name`: what the producer calls this recipe.
     *
     * A roaster's xBloom recipe is usually named for the person who keyed it
     * into xBloom ("col chiroso -18g") rather than for the coffee, and the
     * share link can only carry that name. This lets the page that sent the
     * link name it properly. It lands on the recipe's own `name`, the one a
     * rename writes, so `xbloomName` keeps what xBloom said and USE THIS NAME
     * still has something to go back to.
     */
    recipeName?: string;
    /**
     * `feed`: where the roaster publishes every coffee it has a recipe for.
     *
     * Only an address. Nothing is fetched here, and nothing is fetched at all
     * until the recipe this link carries has imported: the feed is an offer
     * made after the fact, read by `library/roasterFeed.ts`. https only and
     * capped like every other URL, so an older build that ignores the
     * parameter and a newer one that refuses a bad value both import the
     * recipe exactly as before.
     */
    feed?: string;
    /**
     * `bean.flavours`: a short list of tasting notes, comma separated, for
     * the catalogue's chips. Kept out of the coffee block, which is the
     * Beanconqueror contract and has no such field.
     */
    flavours?: string[];
    /** `bean.tags`: labels the recipe is tagged with on import, comma separated. */
    tags?: string[];
};

/**
 * Read an import deep link, or null if it is not one we can act on.
 *
 * `v` must be exactly `1`. An unknown version is refused outright rather than
 * read as far as it parses, which is the entire reason #159 puts a version in
 * the grammar: a link minted against a later grammar may mean something
 * different by the same parameter name, and half-reading it would import a
 * recipe with quietly wrong coffee rather than failing honestly.
 *
 * `source` is recorded, not gated. Only `brewmind` maps to a provenance today,
 * but anything else still imports and simply reads as an ordinary import.
 * The link is useful to anyone who can mint one, and refusing an unknown
 * producer would buy nothing.
 */
export function parseBrewMindLink(link: string): BrewMindLink | null {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return null;
    }

    // A custom scheme puts "import" in the host and an https one puts it in
    // the path, so look in both rather than assuming a door. Which links can
    // actually reach the app is settled by the registered schemes, not here.
    const segments = [url.host, ...url.pathname.split("/")]
        .map(part => part.trim().toLowerCase())
        .filter(part => part !== "");
    if (!segments.includes("import")) return null;

    const params = url.searchParams;
    if (params.get("v") !== BREWMIND_LINK_VERSION) return null;

    const share = params.get("share")?.trim();
    if (!share) return null;

    const result: BrewMindLink = {share};
    const source = params.get("source")?.trim();
    if (source) result.source = source;

    const coffee = coffeeFrom(params);
    if (coffee !== null) result.coffee = coffee;

    const recipeUrl = params.get("recipe.url")?.trim();
    if (recipeUrl !== undefined && recipeUrl.length <= MAX_URL) {
        const checked = httpsUrl(recipeUrl);
        if (checked !== undefined) result.recipeUrl = checked;
    }

    // Capped at the rename sheet's ceiling rather than at `SHORT_TEXT`. This
    // is a recipe name, not a bean field, and a link that could set a name the
    // sheet would refuse to hold would leave the user unable to edit what they
    // were given. Over-length drops it, as everywhere else in this file: a
    // name cut mid-word is a confident wrong name, and the recipe still has
    // xBloom's own to fall back on.
    //
    // Runs of whitespace fold to one space first, and the cap is measured
    // after. A name is a one-line title in the header and on the card, and a
    // line break, a tab or a U+2028 sent in the link would split it there. JS
    // `\s` already covers the Unicode separators, so one rule is enough. This
    // is folding, not truncating: no character the sender meant to be read is
    // lost.
    const recipeName = params.get("recipe.name")?.replace(/\s+/g, " ").trim();
    if (recipeName !== undefined && recipeName !== "" && recipeName.length <= MAX_NAME) {
        result.recipeName = recipeName;
    }

    const flavours = readLabels(params.get("bean.flavours") ?? "");
    if (flavours.length > 0) result.flavours = flavours;
    const tags = readLabels(params.get("bean.tags") ?? "");
    if (tags.length > 0) result.tags = tags;

    const feed = params.get("feed")?.trim();
    if (feed !== undefined && feed.length <= MAX_URL) {
        const checked = httpsUrl(feed);
        if (checked !== undefined) result.feed = checked;
    }
    return result;
}

/**
 * Collect the `bean.*` parameters into a record and validate it.
 *
 * The validation is deliberately *not* reimplemented here. The record is handed
 * to `podCoffeeFromStored`, the same reader a restored backup goes through, so
 * the URL door and the storage door cannot drift apart: the https rule on a
 * link's image is the https rule on a stored one because it is the same line of
 * code. This function's only job is the part that is genuinely about URLs,
 * which is length.
 */
function coffeeFrom(params: URLSearchParams): PodCoffee | null {
    const fields: [string, string][] = [];
    for (const [key, value] of params.entries()) {
        if (key.startsWith("bean.")) fields.push([key.slice("bean.".length), value]);
    }
    if (fields.length === 0) return null;
    return coffeeFromFields(fields);
}

/**
 * Turn named coffee fields from outside the app into a validated coffee.
 *
 * Shared by the link's `bean.*` parameters and a roaster feed's `bean` block
 * (`library/roasterFeed.ts`), so the two doors apply the same aliases and the
 * same caps. A URL only ever carries strings; a feed is JSON and may send a
 * number or a boolean, which is passed through for `podCoffeeFromStored` to
 * judge exactly as it judges a stored one. Anything else is dropped.
 */
export function coffeeFromFields(fields: Iterable<[string, unknown]>): PodCoffee | null {
    const record: Record<string, unknown> = {};

    for (const [param, value] of fields) {
        const field = PARAM_ALIASES[param] ?? param;
        if (typeof value === "number" || typeof value === "boolean") {
            record[field] = value;
            continue;
        }
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed === "") continue;

        // Over-length drops the field and keeps the rest, rather than
        // truncating. A farm name cut at 120 characters is a different farm,
        // and a confident wrong answer is worse than a missing one.
        const cap = CAPS[field];
        if (cap !== undefined && trimmed.length > cap) continue;

        record[field] = trimmed;
    }

    return podCoffeeFromStored(record);
}
