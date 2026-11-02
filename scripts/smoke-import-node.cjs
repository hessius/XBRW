/* Run against an isolated tsc output directory, never the app dependency tree. */
const assert = require("node:assert/strict");
const {createServer, get} = require("node:http");
const {createRequire} = require("node:module");
const {resolve} = require("node:path");
const {once} = require("node:events");

async function main() {
    assert.ok(process.argv[2], "Pass the isolated transpilation directory");
    const artifact = resolve(process.argv[2]);
    const standaloneRequire = createRequire(resolve(artifact, "package.json"));
    for (const name of [
        "react-native", "react", "expo", "expo-sqlite", "tamagui",
        "react-native-uuid", "@react-native/normalize-colors"
    ]) {
        assert.throws(() => standaloneRequire.resolve(name), {code: "MODULE_NOT_FOUND"});
    }
    const handler = standaloneRequire("./api/import.js").default;
    const {fullImportURL, importDetail} = standaloneRequire("./test-utils/importPageFixtures.js");
    const previousFetch = global.fetch;
    let lookups = 0;
    global.fetch = async (url, options) => {
        assert.equal(url, "https://client-api.xbloom.com/RecipeDetail.html");
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "error");
        assert.equal(JSON.parse(options.body).tableIdOfRSA, "fixture+id=");
        lookups++;
        return new Response(JSON.stringify(importDetail()));
    };
    const server = createServer((req, res) => {
        Promise.resolve(handler(req, res)).catch(error => res.destroy(error));
    });
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    try {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const url = fullImportURL();
        const response = await new Promise((accept, reject) => {
            const request = get({
                hostname: "127.0.0.1", port: server.address().port,
                path: url.pathname + url.search, timeout: 5_000
            }, res => {
                const chunks = [];
                res.on("data", chunk => chunks.push(chunk));
                res.on("end", () => accept({
                    status: res.statusCode, headers: res.headers,
                    html: Buffer.concat(chunks).toString("utf8")
                }));
                res.on("error", reject);
            });
            request.on("timeout", () => request.destroy(new Error("Smoke request timed out")));
            request.on("error", reject);
        });
        assert.equal(response.status, 200);
        assert.equal(lookups, 1);
        for (const text of ["Example Roastery", "Coffee photo", "View on xBloom", "Producer&#39;s morning recipe"]) {
            assert.ok(response.html.includes(text), `Missing ${text}`);
        }
        assert.equal(response.headers["cache-control"], "private, no-store");
        assert.equal(response.headers["cdn-cache-control"], "no-store");
        assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
        assert.equal(response.headers["referrer-policy"], "no-referrer");
        assert.ok(!Object.keys(require.cache).some(path => path.includes("/node_modules/")));
        console.log("PASS isolated Node adapter: real IPv4 GET, full metadata, fixed read-only lookup, no native dependencies, private/no-store");
    } finally {
        global.fetch = previousFetch;
        clearTimeout(deadline);
        server.closeAllConnections();
        if (server.listening) await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
