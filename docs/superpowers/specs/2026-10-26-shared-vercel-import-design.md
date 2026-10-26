# Shared Vercel feed and recipe landing page

Date: 2026-10-26

Status: Written specification approved by the maintainer; implementation plan requested.

Related work: #177, #279 and package B PR #281.

## Goal and scope

Use the existing Vercel project for two related public reads: package B's
xBloom release feed and a useful browser destination for recipe import links.
Someone without XBRW++ must be able to read the complete recipe and supplied
coffee information, visit its xBloom page, or install the app.

The page must support the full existing version-1 import contract, not a
reduced share-ID-only link. Additional metadata must be visible on the page
as well as preserved when opening the app.

This design does not authorize merging #281, production deployment, purchasing
or configuring a domain, native builds, store submission or cleanup. It does
not add automatic deferred import after installation.

## Agreed approach

Use a dependency-free server-rendered HTML handler, not a new Next.js
application, Expo web export or browser-only recipe fetch. The server returns
the useful recipe and recipe-specific social metadata in the initial HTML.
Small progressive enhancements must not become prerequisites for reading it.

Keep the framework-free Vercel configuration: static assets in `public/`,
Node functions in `api/`, and no installation of the mobile dependency tree.
Use the actual Node `(req, res)` adapter pattern documented in
`docs/machine-integration/share-deploy.md`; merely returning a Web `Response`
from the default export does not work in this deployment.

Responsibilities remain separate:

| Surface | Responsibility |
| --- | --- |
| Existing `/api/share` | Existing authenticated mint behavior, unchanged. |
| `/api/feeds/xbloom` | Package B's cached public feed, reused rather than rewritten. |
| `/import` | Read-only recipe lookup, decorated HTML and explicit outgoing actions. |
| `/.well-known/apple-app-site-association` | Verified iOS association, served directly as JSON. |
| `/.well-known/assetlinks.json` | Verified Android association, served directly as JSON. |

The association endpoints must not redirect or fall through to the website.
The existing mint URL and existing public-host URLs must continue working.
Do not add a broad catch-all redirect or change existing credentials.

## Browser layout and actions

The approved direction is recipe-first, with a compact persistent footer.
Use the app's established visual vocabulary and canonical palette, without
introducing a website theme selector or changing stored recipe colours.

Reading order:

1. App identity, recipe title, supplied roaster and coffee identity, and compact
   artwork/photo treatment. A photo must not become a full-screen installation
   pitch or hide the recipe.
2. Dose, water and ratio, machine context, grind/grinder state, RPM and dripper.
3. Every stage: volume, temperature, pattern, flow, pause and agitation.
   Show enabled bypass volume/temperature separately; identify tea correctly.
4. The remaining coffee facts, roast guidance, descriptions, tags and source
   links, grouped into readable sections.

The footer is visible from the first viewport and remains available while
reading. It contains:

- **Get XBRW++**, the primary installation action.
- **Open app**, an explicit action for someone who already has it.
- **View on xBloom**, opening this recipe's xBloom share page.

Use verified iOS and Android destinations. On a desktop or unknown platform,
offer both destinations rather than guessing a device. Installation copy
explains that the visitor returns to this page and taps Open app afterwards.
Do not promise an automatic post-install recipe handoff.

Account for safe-area insets and the footer's actual height. All final content
must remain reachable at narrow widths, landscape and enlarged text sizes.
The three actions must remain readable and usable when labels wrap.
Use semantic headings, meaningful image alt text, visible keyboard focus and
adequate touch targets.

Opening the page never launches a custom scheme automatically. Verified HTTPS
links may be handled by an installed, supported app through the OS. When the
visitor is already in the browser, Open app is a user-initiated custom-scheme
handoff, avoiding a loop back to the same HTTPS page. Preserve existing
`xbrecipewriter` and `xbrw` schemes and their order in native configuration.

## Complete import data contract

The authoritative contract is `library/brewmindLink.ts`,
`library/importInput.ts` and their current validators. `docs/url-scheme.md`
is related documentation, but its older table does not list every supported
field. Implementation must inventory the current parser, not copy only that
table.

Preserve its existing semantics: version exactly `1`; a usable `share`;
decoded, trimmed share IDs of 1-256 characters; pod-code normalization;
required `bean.name` for a retained coffee block; per-field caps; HTTPS
metadata links; existing aliases; and the current numeric/date/boolean rules.
Do not invent a new photo-gallery or machine-selection query parameter.

All supplied, valid information below must be surfaced, not merely embedded
in an outgoing URL or hidden data attribute:

| Input | Page treatment |
| --- | --- |
| `recipe.name` | Producer's title, using the app's fitting/whitespace rules; preserve xBloom's title as the upstream identity. |
| `bean.name`, `bean.roaster` | Coffee and stated roaster near the heading. Do not infer roaster from a catalogue/source name. |
| `bean.image` / `bean.imageUrl` | Supplied coffee photo, with HTTPS validation and a non-blocking failure state. |
| xBloom artwork | Keep the app's artwork precedence. If it differs from the supplied coffee photo, make both visible with distinct roles; do not silently discard either. |
| `bean.origin`, `bean.country`, `bean.region` | Origin information, without repeating identical values. Distinct supplied information remains available. |
| `bean.farm`, `bean.farmer`, `bean.elevation` | Farm, farmer and validated elevation, formatted using existing rules. |
| `bean.processing`, `bean.fermentation`, `bean.variety`, `bean.beanMix` | Separate coffee facts where present. |
| `bean.roast`, `bean.roastingDate` | Stated roast and calendar date, without timezone shifting. |
| `bean.aromatics`, `bean.flavours` | Short flavours and any distinct longer tasting narrative. |
| `bean.note` | Full retained description, not a permanently truncated excerpt. |
| `bean.cupping_points` | Valid score, without invented precision. |
| `bean.decaffeinated` | Explicitly supplied caffeine status; unknown is not a claim of caffeinated. |
| `bean.restDays`, `bean.peakDay`, `bean.bestUntilDay` | Supplied day-based guidance, including valid zero values. No invented dates or estimates. |
| `bean.tags` | Valid tags, with existing normalization and limits. |
| `bean.colour` / `bean.color` | Validated presentation accent, not arbitrary injected CSS. |
| `bean.url` | Coffee/product link. |
| `recipe.url` | Producer's own recipe page, distinct from the xBloom share page. |
| `source` | Stated source, not a verified endorsement or inferred roaster. |
| `feed` | Catalogue/source information and a labelled destination, never an automatic server fetch or web subscription. |

Retain all supported aliases, including old roast, process, score, decaf and
roast-guidance spellings. Empty groups disappear. Identical destinations can
share one clearly labelled link; distinct product, producer and xBloom pages
must not be conflated.

The current contract has one supplied coffee-photo URL, alongside any
upstream artwork. Showing both does not expand the public URL grammar.

### Preservation and precedence

Keep the incoming query for the app handoff instead of reconstructing a
whitelist containing only `v` and `share`. Preserve unknown parameters and
properly nested URLs as well. Attribute escaping must not alter query values
or introduce an extra decoding/encoding pass. Hosting may normalize equivalent
URL encodings, such as spaces from `+` to `%20`; byte-identical spelling is not
required. Every value, duplicate parameter and nested URL must survive. This
clarification was approved during the live-preview review.

The page's data view follows a fresh candidate import: xBloom supplies the
recipe; validated link decoration supplies the supported additions, using
the same title, coffee and artwork precedence as the app. Do not merge
upstream and supplied coffee fields differently on the website.

Browser display is not a promise to overwrite an existing library recipe.
The app's existing deduplication and fill-only-blank behavior remains intact.
No website change may erase an existing user's name, image or other edits.

View on xBloom uses the supplied original share URL when it is a genuine
xBloom destination. A permissively parsed non-xBloom host must not become
an external link labelled xBloom: use the validated ID with the known public
xBloom share host instead. For a pod code, use the lookup's verified
`shareRecipeLink` when available. If no exact-recipe destination is available,
state that rather than linking to an unrelated catalogue/product page.
xBloom is not expected to display decorations supplied only to XBRW++.

## Lookup and app parity

Only known xBloom API endpoints are contacted by the server. Share input is
parsed for its opaque ID; the server does not fetch the supplied share host.
Pod codes use the existing pod-detail endpoint. Read-only lookup must not
call login/mint or create a recipe in the service account.

Studio is the default when no specific machine is known. Preserve any
explicitly known machine context; never translate Studio and Original grind
scales. Shared-recipe lookup returns the recipe that was actually shared
and has no machine selector. Do not relabel an explicitly Original recipe
as Studio just because Studio is the default.

Pod previews use Studio when unspecified and label that context. This does
not override an installed app's explicit Original selection. Pod parity is
compared under the same machine context, not by pretending both endpoints
return the same recipe.

Extract/reuse narrowly scoped, dependency-free parser and normalization
helpers for server and app consumers where needed. Do not import `Recipe`,
NFC, Expo, React Native or SQLite into the deployed server bundle. Existing
pure helpers such as coffee detail formatting are prior art, but presentation
suppression must not hide distinct metadata required on the web page.

Keep one tested interpretation of stage numbering, flow units, temperatures,
grinder state, cup types, water/ratio arithmetic and bypass. Existing importer
normalization remains the baseline; this task is not a license to change
brewing or card behavior. Compare the server projection with the actual app
importer on representative independent fixtures.

## Reliability, privacy and metadata

Use one eight-second upstream deadline per page lookup, including body reads,
and a one-MiB upstream-body ceiling. Do not retry within the page request or
replace an unavailable recipe with fabricated defaults. Observe existing
field limits; do not truncate a whole query to make it fit. Oversized requests
must fail explicitly. Do not advertise a whole-link size guarantee across
browsers, hosting ingress and native URL APIs.

Render complete HTML with recipe-specific title, description and Open Graph
metadata derived from the same validated view as the page. A supplied title
is not proof of source authenticity. Escape every untrusted HTML text and
attribute context; do not render upstream error messages or supplied HTML.
Use a restrictive content-security policy and no third-party script/analytics
dependency.

The server never fetches metadata photo, product, recipe-page or feed URLs,
including to generate social previews. Use validated HTTPS image references.
External image loads and outgoing web links must not receive the import URL
as a referrer; use a no-referrer policy and safe new-window link attributes.
Image failure must leave the recipe, text and footer usable.

Decorated HTML, including error responses, uses private/no-store behavior.
Set CDN cache directives consistently so a higher-priority Vercel or CDN
header cannot accidentally make it public. Do not add a shared rendered-page
cache keyed only by recipe ID. Two links to the same ID with different
roasters, names or photos must never leak into each other's pages.

Do not log full import URLs, supplied coffee blocks or upstream bodies in
application diagnostics. Platform access logs/browser history may still
contain URLs; document that public import links are unsuitable for secrets.
Do not claim application logging policy prevents platform logging.

Keep preview reads separate from mint quotas. Existing platform protections
remain in place; adding a paid service or durable cache/rate-limit system
requires its own approval.

Error handling:

| Condition | Response |
| --- | --- |
| Missing/bad input or unsupported version | Explicit 400 page; no upstream request or invalid app-import action. |
| Definitively unavailable recipe | 404 page when upstream evidence supports that conclusion. |
| Timeout | Uncached 504 page with retry. |
| Refused/ambiguous upstream response, malformed body or unusable recipe | Uncached 502 page with retry; do not claim the author removed it without evidence. |
| Upstream rate limit | Uncached 503 with temporary failure/retry guidance; do not spend mint credentials as a fallback. |
| Broken optional photo | Accessible image failure treatment; retain all usable recipe content and actions. |
| Unsupported HTTP method | 405, without lookup or side effects. |

Support GET and HEAD, with no body for HEAD. An input-valid temporary failure
can retain the explicit Open app action, but must not show successful-looking
recipe figures. Omit social recipe claims when lookup did not succeed.

## Feed hosting

Reuse package B's implementation after its separately authorized integration.
Do not independently copy it into this documentation branch or relax its
model/provenance/validation rules to make deployment easier.

Retain both machine partitions, the bounded official-release selection and
the existing successful cache policy:
`public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400`.
An empty or failed feed remains an uncached error so clients preserve their
last good catalogue.

Only enable `EXPO_PUBLIC_XBLOOM_FEED_URL` after the exact approved HTTPS
endpoint serves a real feed accepted by the app's validator. Keep the existing
explicit, default-off subscription and no new Home screen furniture.
Landing-page visits do not subscribe; the preserved `feed` parameter continues
through the existing app workflow.

## Domain, native links and rollout gates

`xbrw.app` is planned, not yet owned or live. Prepare and test on the existing
Vercel host first. Later attach the owned domain to that same project, verify
DNS/TLS, and keep old mint/feed/import URLs working. Do not publish unusable
`xbrw.app` integration links before the host is ready.

Ship association support for the final approved public import hostname.
Do not associate arbitrary branch-preview hosts or redirect well-known
association paths. Verify the Apple application/team identifier and Android
release signing fingerprints from actual distribution records; the bundle
and package identifier alone is insufficient. Confirm whether existing
Vercel-host app-link support is desired before advertising it as verified;
browser fallback and explicit custom-scheme opening do not require that.

Restrict native associations/intent filters to intended import paths.
Keep `app/+native-intent.tsx` and the existing import listener responsible for
cold/warm import delivery, without an unmatched route or a second import.

The project currently uses fingerprint runtime policy. Associated domains
and Android intent-filter changes require a fresh native build and device
qualification, not an OTA to an incompatible runtime. Do not follow #177's
older app-version runtime-policy assumption.

Release sequence:

1. Review this written specification, then approve an implementation plan.
2. Integrate #281 only with separate merge permission. Implement/test the
   focused hosting and native-link changes through the normal task workflow.
3. Verify store/download URLs, signing identities, chosen hostnames and the
   existing Vercel project's production branch/source configuration.
4. With explicit deployment permission, deploy the approved source to the
   existing project. Verify mint method handling without minting, feed
   validation, full HTML, cache separation and direct association responses.
5. When the domain is owned and attachment is approved, verify its DNS/TLS
   and public routes before publishing it to link producers.
6. With separate build/distribution permission, produce the new native builds
   and exercise installed/uninstalled iOS and Android link flows.
7. Enable the built-in feed against the verified production URL in an approved
   app build/update. Do not bundle an endpoint that still returns 404.

At design time, the installed Vercel CLI reports no credentials. Production
branch configuration, domain ownership, store destinations and signing
identities have not been verified by this session. These are release gates,
not fields to fill with guessed identifiers or placeholder download links.

## Documentation updates during implementation

Update `docs/url-scheme.md` to describe the complete supported field set,
browser fallback, installation return flow and the verified HTTPS entry point
when available. Update the roaster guide/feed documentation with the approved
host and lossless link construction. Expand the existing deployment runbook
for the separate feed, HTML and association routes, without changing the
mint's operational contract or advertising an undeployed domain.

## Acceptance evidence

Use existing test tooling. Do not deploy probes that mint recipes merely to
prove routing works.

- Parser/decoration coverage for every row in the metadata table, aliases,
  unknown fields retained in handoff, Unicode, invalid optional values,
  unsupported versions, missing bean names and independent nested URL values
  containing `+`, `/`, `=`, `%`, `&` and encoded whitespace.
- Render assertions proving each supplied field is visible in HTML, including
  distinct origin text, explicit false decaf status, zero-day advice, full
  notes, source/feed information and separate upstream/supplied photos.
- App/server parity for share and pod recipes, both machine contexts, tea,
  grinder off, bypass on/off, fractional/invalid temperature handling, all
  patterns, agitation and flow-rate units. Existing-library behavior stays
  unchanged.
- Actual Node adapter/routing coverage: successful HTML, HEAD/no body, 405,
  deadlines, body caps, upstream status/envelope failures, escaping, outgoing
  link safety, image failures, and no login/mint/arbitrary metadata fetch.
- Cache-isolation checks for two decorated links sharing an ID, no-store on
  failures, and unchanged successful-feed cache behavior.
- Browser checks at narrow/desktop widths and enlarged text: persistent
  first-viewport actions, safe-area/footer clearance, all content reachable,
  keyboard/screen-reader names and readable content without client script.
- Authorized-host smoke checks for `/api/share` method rejection, the app's
  feed validator, real read-only recipe HTML, Open Graph tags and association
  JSON without redirects. Preserve old URLs.
- Physical iOS and Android checks with no app, supported installed app,
  cold/warm launch, a previously saved recipe and return-after-install.
  Confirm one import and full metadata preservation. Simulator checks alone
  do not prove OS association or distributed signing behavior.

This is a design-only checkpoint. No endpoint deployment, native behavior,
store target or hardware acceptance is claimed by committing it.
