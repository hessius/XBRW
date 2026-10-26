# Shared Vercel host: share mint and browser import

## Implementation versus deployment

The existing host is `https://xbrwplusplus.vercel.app`. This branch implements
the full recipe HTML browser import page; it does **not** record deployment
of that page. No domain configuration, Vercel deployment, production build or
native qualification is authorized by this document. Shared feed service B
(#281) is not integrated; do not advertise its routes here as deployed.

`api/import.ts` exports the classic Node `(req, res)` adapter, with a Web
`respond` core behind it. `vercel.json` rewrites **exactly** `/import` and
`/import/` to `/api/import`; it does not catch arbitrary nested paths. Keep
the no-op install/build commands and `public` output: the Node dependency
closure is pure TypeScript/Node, not the Expo application or its native
dependencies. Returning a Web `Response` directly to Vercel would leave the
socket open; see the handler warning below.

The import function is read-only. It posts only to the fixed xBloom
`https://client-api.xbloom.com/RecipeDetail.html` (share ID) or
`https://client-api.xbloom.com/tRecipeDetailOfPods.thtml` (pod XID) lookup
endpoints, with an 8-second deadline, a 1 MiB streamed-response ceiling and
redirects refused. Producer/product/feed URLs are not server lookup targets.
The 64 KiB request-target ceiling also applies before lookup.

Every import response, including errors and HEAD, sets:

```text
Cache-Control: private, no-store
CDN-Cache-Control: no-store
Vercel-CDN-Cache-Control: no-store
Referrer-Policy: no-referrer
```

Do not copy future cached feed-response policy onto personalized query pages.
Cached B feeds belong on this host **only once B is integrated**, with their
own separately reviewed routes/cache behavior.

### Public origin configuration

`PUBLIC_IMPORT_ORIGIN` is a server environment setting for the canonical
public HTTPS origin, not a secret and not an Expo public bundle variable.
It must be a bare HTTPS origin without credentials, path, query or fragment.
If absent, the adapter uses `https://${VERCEL_URL}` when supplied by Vercel,
otherwise `https://xbrwplusplus.vercel.app`. Configure each environment
deliberately: do not derive the public origin from an untrusted Host header
or point it at unowned `xbrw.app`. No mint credentials are required for import.

### Local dependency-closure proof

Run strict root typechecking **before** the transpile-only closure check.
Choose a new persistent artifact directory outside the app dependency tree,
with no ancestor `node_modules`; do not install packages into it.

```bash
npm run typecheck
npx --no-install tsc --ignoreConfig --noCheck --module commonjs \
  --moduleResolution node --ignoreDeprecations 6.0 --target ES2022 \
  --jsx react-jsx --esModuleInterop --skipLibCheck --rootDir . \
  --outDir "$ARTIFACT" api/import.ts test-utils/importPageFixtures.ts
```

Set the artifact's `package.json` to `{"private":true,"type":"commonjs"}`.
Copy `scripts/smoke-import-node.cjs` into that directory, then run **from the
artifact** `node smoke-import-node.cjs .`. Alternatively
`npm run test:import-node -- "$ARTIFACT"` runs the retained dependency-free
check against the same isolated output.

This requires the actual compiled adapter and synthetic fixture, refuses
resolution of native/app dependencies, substitutes only the fixed read-only
xBloom response, and performs a real IPv4 Node HTTP GET on an ephemeral port.
It asserts full-roaster/photo/xBloom HTML and all three no-store headers.
Request/deadline bounds and finally/error cleanup close the server. It does
not start a persistent browser service or touch Metro. It is not a deployment
or external-app pass.

### Separately authorized public smoke and native gates

After an approved deployment, use a known public share link to GET both
`/import?...` and `/import/?...`: expect complete HTML without JavaScript,
the correct model/stages/metadata and the headers above. HEAD must omit the
body; malformed imports must fail without a lookup. Verify the explicit app
link preserves the original query and that product, producer recipe and
xBloom links remain distinct. These are read-only checks: do not use a mint
POST as an import smoke.

Real browser acceptance remains separate: 320/390/1280 widths, landscape,
200% text, stationary visible footer, no horizontal overflow, all content
reachable, keyboard focus, real/broken images and no-referrer behavior.
No current store binary's Universal Links/App Links are qualified here.
First verify domain ownership, public AASA/assetlinks content and MIME/status,
Apple team/bundle identifiers and Android signing SHA-256 certificates.
Then build a fresh fingerprint-runtime native artifact and verify installed
iOS/Android link opening. Do not claim an old store binary gained native
association from an HTML deployment.

The page's explicit installation links are
`https://apps.apple.com/app/id6806339475` and
`https://github.com/hessius/XBRW/releases/latest` for Android (no Play listing).
There is no automatic launch/deferred handoff: after installation return to
the same browser URL and tap Open in app. Domain/association work (Task 7)
and production deployment (Task 9) remain blocked/separately authorized.

## Deploying the share mint

The XBRW++ app can turn a recipe into a link that opens in the official xBloom
app. Doing that means creating the recipe in an xBloom account, which means
holding a password — so it happens in a small serverless function rather than in
the app. This is how to deploy it.

## What you need

- A Vercel account. The free tier is enough.
- The XBRW++ xBloom service account's email and password.

## One-time setup

1. Import `hessius/XBRecipeWriterPlus` as a new Vercel project.
2. Leave the framework preset as **Other**. `vercel.json` already sets the
   install and build commands to no-ops — the function has no dependencies, and
   without that Vercel installs the whole Expo tree and tries to build the app.
3. Add these environment variables, all marked **Sensitive**, for Production
   and Preview:

   | Name | Value |
   |---|---|
   | `XBLOOM_EMAIL` | the service account's email |
   | `XBLOOM_PASSWORD` | the service account's password |
   | `SHARE_IP_SALT` | any long random string, e.g. `openssl rand -hex 32` |

4. Deploy, then check the URL. `https://<project>.vercel.app/api/share` should
   answer a `GET` with `405` and `{"error":"method"}`. If it 404s, the function
   was not deployed — see Troubleshooting.
5. Put that URL in `constants/share.ts` as the default, or set
   `EXPO_PUBLIC_SHARE_API_URL` in the build environment.

## Optional: real rate limiting

Without a KV store the rate limiter is per-instance, which means it limits a
burst from one warm function and not much else. To make it real, add an Upstash
Redis integration and set:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | from the Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | from the Upstash dashboard |

The code picks these up automatically and falls back to in-memory when they are
absent. Nothing else changes.

## Checking it works

```bash
curl -s -X POST https://<project>.vercel.app/api/share \
  -H 'content-type: application/json' \
  -d '{"payload":{"theName":"Deploy check","theColor":"#C9D5B8","dose":18,
       "grandWater":16,"grinderSize":55,"isSetGrinderSize":1,"rpm":90,
       "cupType":2,"bypassTemp":85,"bypassVolume":0,"subSetType":2,
       "theSubsetId":0,"appPlace":[4],"isShortcuts":2,"isEnableBypassWater":2,
       "adaptedModel":1,"pourCount":1,
       "pourDataJSONStr":"[{\"theName\":\"Bloom\",\"volume\":288,
        \"temperature\":93,\"flowRate\":3.5,\"pattern\":1,\"pausing\":0,
        \"isEnableVibrationBefore\":2,\"isEnableVibrationAfter\":2}]"}}'
```

Expect `{"tableId":…,"url":"https://share-h5.xbloom.com/?id=…"}`. Open the URL.

**This creates a real recipe in the service account and it cannot be deleted.**
Deleting it through the API removes it from the account's library but the link
keeps resolving. Use one check, not ten.

## The handler shape, which cost an afternoon

Vercel's Node runtime here invokes the default export as `(req, res)`, the
classic Node signature. A web-standard `export default (request: Request) =>
Response` **deploys without any complaint at all** and is then handed arguments
it does not understand: it builds a `Response`, returns it, and nothing ever
ends the socket. Every request hangs until the gateway gives up with a 504.

That failure is indistinguishable from a broken function, and no unit test
catches it, because the tests call the logic directly. `api/share.ts` therefore
keeps its logic written against `Request`/`Response` and exports a thin
`(req, res)` adapter as the default, with tests of its own.

`api/import.ts` uses that same adapter shape. Its real HTTP tests and the
isolated Node smoke above catch an unended socket without deploying probes.

## Troubleshooting

- **`/api/share` hangs and then 504s.** The handler is using the web-standard
  signature. See the section above.
- **`/api/share` 404s.** Vercel did not pick the function up. Move `api/` and
  `vercel.json` into a `server/` subdirectory and set the project's Root
  Directory to `server`, so nothing else in the repo is in scope.
- **The build fails installing dependencies.** The no-op `installCommand` was
  overridden in the project settings. Clear the override so `vercel.json` wins.
- **`503 {"error":"unavailable"}`.** The credentials are not set in this
  environment. Check Preview as well as Production.
- **`502 {"error":"upstream"}`.** Look at the function logs for the error class.
  `login rejected` means the password changed. `share link not found` means the
  mint succeeded but the new row was not in the first 20 of the library listing
  — see the `adaptedModel` note in `cloud-api.md` § C-bis.
