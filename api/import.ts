import {randomBytes} from "node:crypto";
import type {IncomingMessage, ServerResponse} from "node:http";

import {parseBrewMindLink} from "../library/brewmindLink";
import {parseImportInput} from "../library/importInput";
import {InvalidImportDataError} from "../library/xbloomRecipeData";
import {ImportLookupError, lookupImport} from "./_lib/importLookup";
import {renderImportError, renderImportPage} from "./_lib/importPage";
import {buildImportView, sourcePageURL} from "./_lib/importView";

export const IMPORT_TARGET_BYTES = 64 * 1024;

const privateHeaders = {
    "cache-control": "private, no-store",
    "cdn-cache-control": "no-store",
    "vercel-cdn-cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
};

function responseHTML(html: string, status: number, method: string, nonce: string): Response {
    return new Response(method === "HEAD" ? null : html, {
        status,
        headers: {
            ...privateHeaders,
            "content-type": "text/html; charset=utf-8",
            "content-length": String(Buffer.byteLength(html)),
            "content-security-policy": [
                "default-src 'none'", "script-src 'none'", `style-src 'nonce-${nonce}'`,
                "img-src https:", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
            ].join("; ")
        }
    });
}

function unsupportedMethod(method: string, userAgent: string, nonce: string): Response {
    const response = responseHTML(
        renderImportError("This page supports GET and HEAD.", {nonce, userAgent}), 405, method, nonce
    );
    response.headers.set("allow", "GET, HEAD");
    return response;
}

export async function respond(request: Request): Promise<Response> {
    const nonce = randomBytes(18).toString("base64");
    const base = {nonce, userAgent: request.headers.get("user-agent") ?? ""};
    if (request.method !== "GET" && request.method !== "HEAD") {
        return unsupportedMethod(request.method, base.userAgent, nonce);
    }
    const url = new URL(request.url);
    if (Buffer.byteLength(url.pathname + url.search) > IMPORT_TARGET_BYTES) {
        return responseHTML(renderImportError("This import link is too long.", base), 414, request.method, nonce);
    }
    const link = parseBrewMindLink(url.toString());
    const source = link ? parseImportInput(link.share) : null;
    if (!link || !source) {
        return responseHTML(renderImportError("This import link is not supported.", base), 400, request.method, nonce);
    }
    const fallback = {
        ...base, openAppURL: `xbrw://import${url.search}`, xbloomURL: sourcePageURL(source, link.share)
    };
    try {
        const detail = await lookupImport(source);
        const view = buildImportView(detail, link, source, url.search);
        const html = renderImportPage(view, {
            ...base, pageURL: new URL(`/import${url.search}`, url.origin).toString()
        });
        return responseHTML(html, 200, request.method, nonce);
    } catch (error) {
        if (!(error instanceof ImportLookupError) && !(error instanceof InvalidImportDataError)) throw error;
        const status = error instanceof ImportLookupError ? error.status : 502;
        console.warn("import: lookup failed", error instanceof ImportLookupError ? error.kind : "shape");
        const message = status === 504 ? "xBloom took too long to respond."
            : status === 503 ? "xBloom is busy. Please try again shortly."
                : "The recipe could not be loaded from xBloom.";
        return responseHTML(renderImportError(message, fallback), status, request.method, nonce);
    }
}

function importOrigin(): string {
    const raw = process.env.PUBLIC_IMPORT_ORIGIN ?? (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}` : "https://xbrwplusplus.vercel.app");
    const configurationError = new Error("Invalid public import origin configuration");
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw configurationError;
    }
    if (url.protocol !== "https:" || url.username || url.password
        || url.pathname !== "/" || url.search || url.hash) throw configurationError;
    return url.origin;
}

function plainError(message: string, status: number, method: string): Response {
    return new Response(method === "HEAD" ? null : message, {
        status,
        headers: {
            ...privateHeaders, "content-type": "text/plain; charset=utf-8",
            "content-length": String(Buffer.byteLength(message))
        }
    });
}

// Vercel invokes the classic Node signature; returning a Web Response alone leaves the socket open.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const target = req.url ?? "/import";
    try {
        let response: Response;
        if (!target.startsWith("/") || target.startsWith("//")) {
            response = plainError("Invalid request target", 400, method);
        } else if (method !== "GET" && method !== "HEAD") {
            // TRACE is forbidden by the Web Request constructor, so reject it before conversion.
            response = unsupportedMethod(method, req.headers["user-agent"] ?? "", randomBytes(18).toString("base64"));
        } else {
            response = await respond(new Request(`${importOrigin()}${target}`, {
                method, headers: {"user-agent": req.headers["user-agent"] ?? ""}
            }));
        }
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error("import: adapter failed", error instanceof Error ? error.name : "UnknownError");
        const response = plainError("Recipe page unavailable", 500, method);
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(Buffer.from(await response.arrayBuffer()));
    }
}
