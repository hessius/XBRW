import type {IncomingMessage, ServerResponse} from "node:http";

import {
    buildCollectiveFeed, fetchOfficialRows, fetchShopProducts, roasterMatcher, type FetchLike
} from "../_lib/collective";

/**
 * xBloom's new releases as a roaster feed: `GET /api/feeds/xbloom`.
 *
 * Point an import link's `feed` at this address and the app offers to
 * subscribe to "xBloom Collective" like any roaster (docs/roaster-feed.md).
 *
 * Vercel's CDN holds each answer for six hours and serves the old one while it
 * refreshes, so the catalogue is asked a handful of times a day however many
 * phones subscribe. Subscribers read a feed at most every 12 hours anyway.
 * Roaster names, where xBloom's shop makes them plain, come from xbloom.com's
 * public product list (see `roasterMatcher`). Recipes themselves are never
 * fetched here: the phone opens each share link from xBloom only when
 * somebody opens the coffee.
 *
 * Like `api/share.ts`, the logic is written against `Request`/`Response` and
 * the default export adapts it onto Node's `(req, res)`, which is what Vercel's
 * Node runtime calls. It logs nothing about who asked.
 */
export const CACHE_CONTROL = "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400";

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json; charset=utf-8", ...headers}
    });
}

export async function respond(request: Request, fetchImpl?: FetchLike): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return json({error: "method"}, 405, {allow: "GET, HEAD"});
    }
    const url = new URL(request.url);
    // The query string never changes the answer (the app ignores it too), so
    // the advertised address is the bare path.
    const feedUrl = `${url.origin}${url.pathname}`;
    try {
        // The shop only adds roaster names, so losing it costs nothing else.
        const [rows, products] = await Promise.all([
            fetchOfficialRows(fetchImpl),
            fetchShopProducts(fetchImpl).catch((error: unknown) => {
                console.warn("feeds/xbloom: shop unavailable", (error as Error)?.message);
                return [];
            })
        ]);
        const feed = buildCollectiveFeed(rows, feedUrl, roasterMatcher(products));
        if (feed.coffees.length === 0) {
            // An empty list would tell every subscriber their coffees were
            // all removed. Better to fail and let the cached copy stand.
            console.error("feeds/xbloom: catalogue returned no official coffees");
            return json({error: "upstream"}, 502, {"cache-control": "no-store"});
        }
        return json(feed, 200, {"cache-control": CACHE_CONTROL});
    } catch (error) {
        console.error("feeds/xbloom: upstream failed", (error as Error)?.message);
        return json({error: "upstream"}, 502, {"cache-control": "no-store"});
    }
}

export default async function handler(
    req: IncomingMessage, res: ServerResponse
): Promise<void> {
    const host = typeof req.headers.host === "string" ? req.headers.host : "xbrwplusplus.vercel.app";
    let response: Response;
    try {
        response = await respond(new Request(`https://${host}${req.url ?? "/api/feeds/xbloom"}`, {
            method: req.method ?? "GET"
        }));
    } catch (error) {
        console.error("feeds/xbloom: handler failed", (error as Error)?.name);
        response = json({error: "upstream"}, 502, {"cache-control": "no-store"});
    }
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
}
