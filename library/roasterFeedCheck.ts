import {buyLink} from "@/library/roasterBuy";
import {
    MAX_FEED_CHARS, MAX_FEED_COFFEES, ROASTER_FEED_VERSION, parseRoasterFeed
} from "@/library/roasterFeed";

/**
 * A plain report on a roaster feed, for the roaster who wrote it.
 *
 * `npm run check-feed -- <url or file>` prints this (see
 * `scripts/check-feed.mjs`). It reads the file through `parseRoasterFeed`, the
 * same parser the app uses, so "the app would read N coffees" here is what the
 * app would actually read. The rest says why anything was left out, in words
 * a roaster can act on rather than a stack trace.
 */

export type FeedReport = {ok: boolean; lines: string[]};

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function label(entry: Record<string, unknown> | null, index: number): string {
    const name = typeof entry?.name === "string" && entry.name.trim() !== "" ? entry.name.trim() : null;
    return `Coffee ${index + 1}` + (name === null ? "" : ` ("${name}")`);
}

export function checkRoasterFeed(text: string): FeedReport {
    const lines: string[] = [];
    if (text.length > MAX_FEED_CHARS) {
        return {ok: false, lines: [`Too big: ${text.length} characters. The limit is ${MAX_FEED_CHARS}.`]};
    }
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        const html = /^\s*</.test(text);
        return {ok: false, lines: [
            `Not JSON: ${why}`,
            ...(html ? ["The file starts with \"<\", so this looks like a web page. A Shopify store " +
                        "serves the theme's page here when the template is missing or the URL " +
                        "has no ?view=... on it."] : [])
        ]};
    }
    const top = record(raw);
    if (top === null) return {ok: false, lines: ["The file must be one JSON object: { \"version\": 1, ... }."]};
    if (top.version !== ROASTER_FEED_VERSION) {
        return {ok: false, lines: [`"version" must be the number ${ROASTER_FEED_VERSION}. Found: ${JSON.stringify(top.version)}.`]};
    }

    const feed = parseRoasterFeed(text);
    if (feed === null) {
        const roaster = record(top.roaster);
        if (roaster === null || typeof roaster.name !== "string" || roaster.name.trim() === "") {
            return {ok: false, lines: ["\"roaster.name\" is missing. It is required (up to 120 characters)."]};
        }
        if (!Array.isArray(top.coffees)) {
            return {ok: false, lines: ["\"coffees\" must be a list: \"coffees\": [ ... ]."]};
        }
        return {ok: false, lines: ["The app could not read this feed. Compare it with the examples in docs/roaster-guide.md."]};
    }

    const listed = Array.isArray(top.coffees) ? top.coffees : [];
    lines.push(`Roaster: ${feed.roaster.name}`);
    lines.push(`The app reads ${feed.coffees.length} of ${listed.length} coffees.`);
    if (listed.length > MAX_FEED_COFFEES) {
        lines.push(`Only the first ${MAX_FEED_COFFEES} coffees are read.`);
    }

    // Parse each original entry independently: names and ids need not be unique.
    listed.slice(0, MAX_FEED_COFFEES).forEach((value, index) => {
        const single = parseRoasterFeed(JSON.stringify({
            version: top.version, roaster: top.roaster, coffees: [value]
        }));
        if (single !== null && single.coffees.length > 0) return;
        const entry = record(value);
        const name = typeof entry?.name === "string" ? entry.name.trim() : "";
        if (name === "" || name.length > 120) {
            lines.push(`Skipped ${label(entry, index)}: it needs a "name" of up to 120 characters.`);
        } else {
            lines.push(`Skipped ${label(entry, index)}: no usable recipe. Each coffee needs ` +
                       `"recipes": [{"size": "18g", "share": "<an xBloom share link>"}].`);
        }
    });

    const noId = feed.coffees.filter((coffee) => coffee.id === undefined);
    if (noId.length > 0) {
        lines.push(`${noId.length} coffee(s) have no "id". They still work, but an id that never ` +
                   "changes is what lets the app tell a new coffee from a renamed one.");
    }
    const soldOut = feed.coffees.filter((coffee) => !coffee.available);
    if (soldOut.length > 0) {
        lines.push(`${soldOut.length} coffee(s) show as sold out. Only "available": true counts as on sale.`);
    }
    const noBuy = feed.coffees.filter((coffee) =>
        coffee.variants.length > 0
        && coffee.variants.every((variant) => buyLink(feed.roaster, variant) === undefined));
    if (noBuy.length > 0) {
        lines.push(`${noBuy.length} coffee(s) list bags with no buy link. Give each bag a "url", ` +
                   "or set roaster.add_to_cart with {variant_id} in it.");
    }
    const noImage = feed.coffees.filter((coffee) => coffee.image === undefined);
    if (noImage.length > 0) {
        lines.push(`${noImage.length} coffee(s) have no photo (an https "image").`);
    }
    lines.push("OK: the app can read this feed.");
    return {ok: true, lines};
}
