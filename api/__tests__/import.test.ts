import {createServer, request as httpRequest, type Server} from "node:http";
import {readFileSync} from "node:fs";

import {fullImportURL, importDetail} from "../../test-utils/importPageFixtures";
import * as importView from "../_lib/importView";
import * as importPage from "../_lib/importPage";
import {IMPORT_DEADLINE_MS} from "../_lib/importLookup";
import handler, {IMPORT_TARGET_BYTES, respond} from "../import";

type Result = {status: number; headers: Headers; body: string};

async function readResponse(response: Response): Promise<Result> {
    return {status: response.status, headers: response.headers, body: await response.text()};
}

async function withServer(run: (server: Server) => Promise<void>): Promise<void> {
    const server = createServer(handler);
    try {
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        await run(server);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

function get(
    server: Server, path = "/import?v=1&share=XB0001", method = "GET",
    headers: Record<string, string> = {}
): Promise<Result> {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    return new Promise((resolve, reject) => {
        const request = httpRequest({
            hostname: "127.0.0.1", port: address.port, path, method, agent: false, headers
        }, response => {
            const chunks: Buffer[] = [];
            response.on("data", chunk => chunks.push(Buffer.from(chunk)));
            response.on("error", reject);
            response.on("end", () => {
                const observed = new Headers();
                for (const [name, value] of Object.entries(response.headers)) {
                    if (value !== undefined) observed.set(name, Array.isArray(value) ? value.join(", ") : value);
                }
                resolve({
                    status: response.statusCode!, headers: observed, body: Buffer.concat(chunks).toString("utf8")
                });
            });
        });
        request.setTimeout(12_000, () => request.destroy(new Error("Import socket did not complete")));
        request.on("error", reject);
        request.end();
    });
}

function privateHeaders(headers: Headers, type = "text/html; charset=utf-8") {
    expect(headers.get("content-type")).toBe(type);
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("cdn-cache-control")).toBe("no-store");
    expect(headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
}

function htmlSecurity(result: Result) {
    privateHeaders(result.headers);
    const nonce = /<style nonce="([A-Za-z0-9+/]{24})">/.exec(result.body)?.[1];
    expect(nonce).toBeDefined();
    expect(result.headers.get("content-security-policy")).toBe([
        "default-src 'none'", "script-src 'none'", `style-src 'nonce-${nonce}'`,
        "img-src https:", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
    ].join("; "));
    expect(result.headers.get("content-length")).toBe(String(Buffer.byteLength(result.body)));
    expect(result.body).not.toMatch(/<script\b/i);
}

function noRecipeClaims(result: Result) {
    expect(result.body).not.toContain('property="og:');
    expect(result.body).not.toContain('class="metrics"');
    expect(result.body).not.toContain('aria-label="Stage 1"');
}

function originalQueryAction(result: Result, search: string) {
    expect(result.body).toContain(`href="${importPage.escapeHTML(`xbrw://import${search}`)}"`);
}

describe("import endpoint", () => {
    const environment = {
        PUBLIC_IMPORT_ORIGIN: process.env.PUBLIC_IMPORT_ORIGIN,
        VERCEL_URL: process.env.VERCEL_URL
    };

    beforeEach(() => {
        delete process.env.PUBLIC_IMPORT_ORIGIN;
        delete process.env.VERCEL_URL;
        jest.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(importDetail())));
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(environment)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it("rejects an unsupported version without fetching or offering an app action", async () => {
        const response = await respond(new Request("https://preview.example.test/import?v=2&share=XB0001"));

        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("cdn-cache-control")).toBe("no-store");
        expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
        expect(await response.text()).not.toContain('href="xbrw:');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("completes a real GET socket with full metadata and the untouched query at the public OG path", async () => {
        const url = fullImportURL();
        await withServer(async server => {
            const result = await get(server, `/api/import${url.search}`, "GET", {
                host: "attacker.example.test", "x-forwarded-host": "forwarded.example.test",
                "x-forwarded-proto": "http", "user-agent": "iPhone"
            });
            expect(result.status).toBe(200);
            htmlSecurity(result);
            for (const text of [
                "Producer&#39;s morning recipe", "Example Roastery", "Bag coffee", "A complete description.",
                "A second paragraph.", "Stage 1", "240 ml", "15 g", "Get XBRW++"
            ]) expect(result.body).toContain(text);
            expect(result.body).toContain('src="https://images.example.test/bag.jpg"');
            expect(result.body).toContain('src="https://images.example.test/pod.jpg"');
            originalQueryAction(result, url.search);
            expect(result.body).toContain(
                `property="og:url" content="${importPage.escapeHTML(`https://xbrwplusplus.vercel.app/import${url.search}`)}"`
            );
            expect(result.body).not.toMatch(/attacker\.example|forwarded\.example|xbrw\.app/);
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith("https://client-api.xbloom.com/RecipeDetail.html",
                expect.objectContaining({
                    method: "POST", body: JSON.stringify({
                        interfaceVersion: 19700101, skey: "testskey", tableIdOfRSA: "fixture+id="
                    })
                }));
            expect(console.warn).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    it("completes HEAD with the same status, length and security headers as GET but no body", async () => {
        await withServer(async server => {
            const page = await get(server);
            const head = await get(server, undefined, "HEAD");
            expect(head.status).toBe(page.status);
            expect(head.body).toBe("");
            privateHeaders(head.headers);
            for (const name of [
                "content-length", "content-type", "cache-control", "cdn-cache-control",
                "vercel-cdn-cache-control", "referrer-policy", "x-content-type-options"
            ]) expect(head.headers.get(name)).toBe(page.headers.get(name));
            const policy = head.headers.get("content-security-policy")!;
            expect(policy.replace(/nonce-[A-Za-z0-9+/]+/, "nonce-X"))
                .toBe(page.headers.get("content-security-policy")!.replace(/nonce-[A-Za-z0-9+/]+/, "nonce-X"));
            expect(policy).not.toBe(page.headers.get("content-security-policy"));
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string))
                .toMatchObject({xid: "XB0001", adaptedModel: 1});
        });
    });

    it.each(["POST", "TRACE"])("completes real %s as 405 before constructing a Web Request", async method => {
        await withServer(async server => {
            const result = await get(server, undefined, method);
            expect(result.status).toBe(405);
            expect(result.headers.get("allow")).toBe("GET, HEAD");
            expect(result.body).toContain("This page supports GET and HEAD.");
            htmlSecurity(result);
            noRecipeClaims(result);
            expect(result.body).not.toContain('href="xbrw:');
            expect(global.fetch).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    it("also rejects unsupported methods through respond without lookup", async () => {
        const result = await readResponse(await respond(new Request(fullImportURL(), {method: "POST"})));
        expect(result.status).toBe(405);
        expect(result.headers.get("allow")).toBe("GET, HEAD");
        htmlSecurity(result);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it.each([
        "/import", "/import?share=XB0001", "/import?v=1", "/import?v=2&share=XB0001",
        "/import?v=1&share=not-a-pod", "/import?v=1&share=https%3A%2F%2Fx.example%2F%3Fid%3D%2520"
    ])("rejects missing or invalid input without fetching: %s", async target => {
        await withServer(async server => {
            const result = await get(server, target);
            expect(result.status).toBe(400);
            expect(result.body).toContain("This import link is not supported.");
            expect(result.body).not.toContain('href="xbrw:');
            htmlSecurity(result);
            noRecipeClaims(result);
            const head = await get(server, target, "HEAD");
            expect(head.status).toBe(400);
            expect(head.body).toBe("");
            expect(head.headers.get("content-length")).toBe(result.headers.get("content-length"));
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    it("accepts exactly 65536 target bytes and refuses 65537 before lookup, including unknown padding", async () => {
        expect(IMPORT_TARGET_BYTES).toBe(64 * 1024);
        const prefix = "/import?v=1&share=XB0001&padding=";
        const target = prefix + "x".repeat(IMPORT_TARGET_BYTES - Buffer.byteLength(prefix));
        expect(Buffer.byteLength(target)).toBe(65536);
        const allowed = await readResponse(await respond(new Request(`https://preview.example.test${target}`)));
        expect(allowed.status).toBe(200);
        htmlSecurity(allowed);
        originalQueryAction(allowed, target.slice("/import".length));
        jest.mocked(global.fetch).mockClear();
        const refused = await readResponse(await respond(new Request(`https://preview.example.test${target}x`)));
        expect(refused.status).toBe(414);
        expect(refused.body).toContain("This import link is too long.");
        expect(refused.body).not.toContain('href="xbrw:');
        htmlSecurity(refused);
        noRecipeClaims(refused);
        const head = await respond(new Request(`https://preview.example.test${target}x`, {method: "HEAD"}));
        expect(head.status).toBe(414);
        expect(await head.text()).toBe("");
        expect(head.headers.get("content-length")).toBe(refused.headers.get("content-length"));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it.each([
        [429, 503, "xBloom is busy. Please try again shortly."],
        [404, 502, "The recipe could not be loaded from xBloom."],
        [500, 502, "The recipe could not be loaded from xBloom."]
    ])("renders upstream HTTP %s as %s, never a guessed removal", async (upstream, status, message) => {
        jest.mocked(global.fetch).mockImplementation(async () =>
            new Response("private upstream text", {status: upstream}));
        const url = fullImportURL();
        await withServer(async server => {
            const result = await get(server, `/import${url.search}`);
            expect(result.status).toBe(status);
            expect(result.body).toContain(message);
            expect(result.body).not.toContain("private upstream text");
            htmlSecurity(result);
            noRecipeClaims(result);
            originalQueryAction(result, url.search);
            expect(result.body).toContain('href="https://share-h5.xbloom.com/?id=fixture%2Bid%3D"');
            expect(console.warn).toHaveBeenCalledWith("import: lookup failed", "http");
            expect(console.warn).toHaveBeenCalledTimes(1);
            expect(console.error).not.toHaveBeenCalled();
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });

    it.each([
        ["envelope", {result: "failure", msg: "private upstream text"}],
        ["body", null],
        ["shape", {result: "success", recipeVo: {dose: "private upstream text"}}],
        ["shape", {...importDetail(), recipeVo: {...importDetail().recipeVo, adaptedModel: "private upstream text"}}]
    ])("renders invalid %s data explicitly without fake figures or raw logging", async (kind, detail) => {
        jest.mocked(global.fetch).mockImplementation(async () => new Response(JSON.stringify(detail)));
        const url = fullImportURL();
        await withServer(async server => {
            const result = await get(server, `/import${url.search}`);
            expect(result.status).toBe(502);
            expect(result.body).toContain("The recipe could not be loaded from xBloom.");
            expect(result.body).not.toMatch(/private upstream text|A complete description/);
            htmlSecurity(result);
            noRecipeClaims(result);
            originalQueryAction(result, url.search);
            expect(console.warn).toHaveBeenCalledWith("import: lookup failed", kind);
            expect(console.warn).toHaveBeenCalledTimes(1);
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    it("renders malformed JSON as 502 and keeps HEAD errors bodyless", async () => {
        jest.mocked(global.fetch).mockImplementation(async () => new Response('{"private upstream text":'));
        await withServer(async server => {
            const result = await get(server);
            expect(result.status).toBe(502);
            htmlSecurity(result);
            noRecipeClaims(result);
            const head = await get(server, undefined, "HEAD");
            expect(head.status).toBe(502);
            expect(head.body).toBe("");
            privateHeaders(head.headers);
            expect(head.headers.get("content-length")).toBe(result.headers.get("content-length"));
            expect(console.warn).toHaveBeenNthCalledWith(1, "import: lookup failed", "body");
            expect(console.warn).toHaveBeenNthCalledWith(2, "import: lookup failed", "body");
        });
    });

    it("classifies the real lookup deadline as uncached 504 while preserving the original app action", async () => {
        jest.useFakeTimers({doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]});
        jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init!.signal!.addEventListener("abort", () => reject(new Error("private timeout text")), {once: true});
        }));
        const url = fullImportURL();
        const pending = respond(new Request(url));
        await jest.advanceTimersByTimeAsync(IMPORT_DEADLINE_MS);
        const result = await readResponse(await pending);
        expect(result.status).toBe(504);
        expect(result.body).toContain("xBloom took too long to respond.");
        htmlSecurity(result);
        noRecipeClaims(result);
        originalQueryAction(result, url.search);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith("import: lookup failed", "timeout");
        expect(jest.getTimerCount()).toBe(0);
    });

    it("does not decode an opaque share id again or fetch any supplied photo/feed/producer host", async () => {
        const url = fullImportURL();
        url.searchParams.set("share", "https://untrusted.example.test/recipe?id=opaque%252B%252F%253D");
        await withServer(async server => {
            const result = await get(server, `/import${url.search}`);
            expect(result.status).toBe(200);
            originalQueryAction(result, url.search);
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith("https://client-api.xbloom.com/RecipeDetail.html",
                expect.objectContaining({body: JSON.stringify({
                    interfaceVersion: 19700101, skey: "testskey", tableIdOfRSA: "opaque%2B%2F%3D"
                })}));
            expect(result.body).toContain('href="https://share-h5.xbloom.com/?id=opaque%252B%252F%253D"');
        });
    });

    it("keeps independent private bodies for the same id with different names, roasters and photos", async () => {
        const first = fullImportURL(), second = fullImportURL();
        first.searchParams.set("recipe.name", "First recipe");
        second.searchParams.set("recipe.name", "Second recipe");
        second.searchParams.set("bean.roaster", "Second roaster");
        second.searchParams.set("bean.image", "https://images.example.test/second.jpg");
        await withServer(async server => {
            const a = await get(server, `/import${first.search}`);
            const b = await get(server, `/import${second.search}`);
            htmlSecurity(a);
            htmlSecurity(b);
            expect(a.body).toContain("<h1>First recipe</h1>");
            expect(a.body).not.toContain("Second roaster");
            expect(b.body).toContain("<h1>Second recipe</h1>");
            expect(b.body).toContain("Second roaster");
            expect(b.body).toContain('src="https://images.example.test/second.jpg"');
            expect(b.body).not.toContain('src="https://images.example.test/bag.jpg"');
            originalQueryAction(a, first.search);
            originalQueryAction(b, second.search);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    it.each([
        ["https://public.example.test", "ignored.vercel.app", "https://public.example.test"],
        ["https://public.example.test/", undefined, "https://public.example.test"],
        [undefined, "trusted-preview.vercel.app", "https://trusted-preview.vercel.app"],
        [undefined, undefined, "https://xbrwplusplus.vercel.app"]
    ])("uses only configured public origins: %s / %s", async (origin, vercel, expected) => {
        if (origin !== undefined) process.env.PUBLIC_IMPORT_ORIGIN = origin;
        if (vercel !== undefined) process.env.VERCEL_URL = vercel;
        await withServer(async server => {
            const result = await get(server, "/api/import?v=1&share=XB0001", "GET", {host: "evil.example.test"});
            expect(result.status).toBe(200);
            expect(result.body).toContain(
                `property="og:url" content="${expected}/import?v=1&amp;share=XB0001"`
            );
            expect(result.body).not.toContain("evil.example.test");
        });
    });

    it.each([
        "", "not-a-url", "http://public.example.test", "https://user:pass@public.example.test",
        "https://public.example.test/prefix", "https://public.example.test/?query=1",
        "https://public.example.test/#fragment"
    ])("fails closed on malformed PUBLIC_IMPORT_ORIGIN: %s", async origin => {
        process.env.PUBLIC_IMPORT_ORIGIN = origin;
        process.env.VERCEL_URL = "do-not-fallback.vercel.app";
        await withServer(async server => {
            const page = await get(server);
            expect(page.status).toBe(500);
            expect(page.body).toBe("Recipe page unavailable");
            privateHeaders(page.headers, "text/plain; charset=utf-8");
            expect(page.headers.get("content-length")).toBe(String(Buffer.byteLength(page.body)));
            const head = await get(server, undefined, "HEAD");
            expect(head.status).toBe(500);
            expect(head.body).toBe("");
            privateHeaders(head.headers, "text/plain; charset=utf-8");
            expect(head.headers.get("content-length")).toBe(page.headers.get("content-length"));
            expect(global.fetch).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenNthCalledWith(1, "import: adapter failed", "Error");
            expect(console.error).toHaveBeenNthCalledWith(2, "import: adapter failed", "Error");
        });
    });

    it("fails closed on invalid VERCEL_URL configuration", async () => {
        process.env.VERCEL_URL = "preview.vercel.app/prefix";
        await withServer(async server => {
            const result = await get(server);
            expect(result.status).toBe(500);
            expect(result.body).toBe("Recipe page unavailable");
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    it.each(["https://attacker.example.test/import?v=1&share=XB0001", "//attacker.example.test/import"])(
        "rejects a non-local request target without lookup: %s", async target => {
            await withServer(async server => {
                const page = await get(server, target);
                expect(page.status).toBe(400);
                privateHeaders(page.headers, "text/plain; charset=utf-8");
                expect(page.body).not.toContain("xbrw:");
                const head = await get(server, target, "HEAD");
                expect(head.status).toBe(400);
                expect(head.body).toBe("");
                expect(head.headers.get("content-length")).toBe(page.headers.get("content-length"));
                expect(global.fetch).not.toHaveBeenCalled();
            });
        }
    );

    it.each(["build", "render"])("rethrows unexpected %s bugs to the adapter as 500, not shape 502", async step => {
        const error = new TypeError(`private programming error ${fullImportURL()}`);
        const fail = () => { throw error; };
        if (step === "build") jest.spyOn(importView, "buildImportView").mockImplementation(fail);
        else jest.spyOn(importPage, "renderImportPage").mockImplementation(fail);
        await expect(respond(new Request(fullImportURL()))).rejects.toBe(error);
        await withServer(async server => {
            const result = await get(server);
            expect(result.status).toBe(500);
            expect(result.body).toBe("Recipe page unavailable");
            privateHeaders(result.headers, "text/plain; charset=utf-8");
            const head = await get(server, undefined, "HEAD");
            expect(head.status).toBe(500);
            expect(head.body).toBe("");
            expect(head.headers.get("content-length")).toBe(result.headers.get("content-length"));
            expect(console.warn).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenNthCalledWith(1, "import: adapter failed", "TypeError");
            expect(console.error).toHaveBeenNthCalledWith(2, "import: adapter failed", "TypeError");
        });
    });

    it("logs only the constant UnknownError category for a non-Error programming failure", async () => {
        jest.spyOn(importView, "buildImportView").mockImplementation(() => { throw "private thrown text"; });
        await withServer(async server => {
            expect((await get(server)).status).toBe(500);
            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledWith("import: adapter failed", "UnknownError");
            expect(console.warn).not.toHaveBeenCalled();
        });
    });

    it("adds only the exact import rewrites without changing the dependency-free Vercel configuration", () => {
        const config = JSON.parse(readFileSync(`${__dirname}/../../vercel.json`, "utf8"));
        expect(config).toEqual({
            $schema: "https://openapi.vercel.sh/vercel.json", framework: null,
            installCommand: "echo skipping install: the mint function has no dependencies",
            buildCommand: "echo skipping build: only api/ is deployed", outputDirectory: "public",
            rewrites: [
                {source: "/import", destination: "/api/import"},
                {source: "/import/", destination: "/api/import"}
            ]
        });
    });
});
