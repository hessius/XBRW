# XBRW++ URL integration

This guide describes the version-1 import contract implemented in XBRW++ 2.1.0
beta. It lets another app or website open an xBloom recipe in XBRW++, optionally
carrying coffee metadata and a link back to the producer's recipe page.

## Supported entry point

```text
xbrw://import?v=1&share=<encoded xBloom share URL>
```

`xbrecipewriter://import` is also supported. Prefer `xbrw://import` for new
integrations. Both schemes are registered on iOS and Android. The app must
already be installed; these custom-scheme links do not provide installation or
a web fallback. Provide a normal web link alongside the app button if needed.

There is no configured HTTPS Universal Link / Android App Link entry point.
The parser can read an HTTPS URL containing an `import` path, but that does not
make such a URL launch XBRW++. Do not use `https://xbrw.app/import` as an app link.

## Query parameters

Parameter names are case-sensitive. Send each parameter once.

| Parameter | Required | Meaning |
| --- | --- | --- |
| `v` | Yes | Exactly `1`. Missing or unknown versions are not processed as version-1 imports. |
| `share` | Yes | An xBloom HTTP(S) share URL with a nonempty `id` query parameter. A valid xBloom pod code (XID), such as `XB0001`, is also accepted. Prefer a share URL. |
| `source` | No | Your producer/app identifier. Unknown identifiers are accepted; currently only the exact value `brewmind` receives a dedicated source label. Other values use ordinary import provenance. Do not impersonate another app. |
| `recipe.url` | No | Your own HTTPS page for this recipe, at most 2,000 characters. Separate from the xBloom share URL and the coffee's `bean.url`. |
| `bean.*` | No | Coffee metadata described below. |

The share ID is opaque. Preserve its case and characters. Its decoded, trimmed
length must be 1–256 characters. Supplying an arbitrary host does not cause the
app to fetch that host: the ID is resolved through xBloom's recipe service.
Use a genuine xBloom URL rather than relying on this permissive parsing.

There is no raw recipe JSON/byte payload, callback URL, import-result response,
automatic brewing command, or NFC-write command in this public contract.
Internal router paths such as `editRecipe`, `brew` and `machine` are not a
supported third-party API. The `dataUrl=...ShareKey` URL used by the iOS share
extension is private transport, not an integration endpoint.

## Constructing links safely

Use a URL library and pass the complete inner share URL as an ordinary parameter
value. Do not concatenate an unescaped URL after `share=`: its `&`, `+`, `#` or
`=` characters could otherwise change the outer query.

```js
const link = new URL("xbrw://import");
link.searchParams.set("v", "1");
link.searchParams.set("source", "your-app");
link.searchParams.set(
  "share",
  "https://share-h5.xbloom.com/?id=example%2Bshare%2Fid%3D"
);
link.searchParams.set("recipe.url", "https://example.com/recipes/morning");
link.searchParams.set("bean.name", "Morning coffee");
link.searchParams.set("bean.roaster", "Example Roastery");

const appUrl = link.toString();
// Launch appUrl using your platform's URL-opening API, or an HTML link.
```

The example ID is illustrative, not a working recipe. Replace the inner URL
with a real share link. If it already contains `%2B`, `%2F` or `%3D`, keep that
encoding intact when setting the outer parameter. `URLSearchParams` encodes the
percent signs for the outer URL; the two nested URL parsers undo their own
layers. Do not pre-encode a value before passing it to `searchParams.set`.

A minimal pod-code example:

```text
xbrw://import?v=1&share=XB0001
```

For HTML, escape `&` as `&amp;` in an `href` attribute. Generate the URL first,
then apply HTML escaping.

## Optional coffee metadata

`bean.name` is required for any coffee metadata to be retained. Without a usable
name, the whole bean block is ignored, but the recipe can still import.
Fields are trimmed. Invalid, empty or over-length optional fields are omitted,
not truncated; valid fields in the same block survive.

| Parameter | Value / limit |
| --- | --- |
| `bean.name` | Coffee name; 120 characters. |
| `bean.roaster` | Roaster name; 120 characters. |
| `bean.roastingDate` | Real calendar date in `YYYY-MM-DD` form; 120-character input cap. |
| `bean.roast` | Roast description; 120 characters. |
| `bean.origin` | Origin description; 120 characters. |
| `bean.country` | Country; 120 characters. |
| `bean.region` | Region; 120 characters. |
| `bean.farm` | Farm; 120 characters. |
| `bean.farmer` | Producer/farmer; 120 characters. |
| `bean.processing` | Processing method; 120 characters. |
| `bean.fermentation` | Fermentation description; 120 characters. |
| `bean.variety` | Variety; 120 characters. |
| `bean.beanMix` | Blend/type description, e.g. `Single Origin`; 120 characters. |
| `bean.elevation` | Positive elevation up to 10,000 metres; 120-character input cap. Prefer an integer in metres, e.g. `1750`. Single heights such as `1,750 masl` or `5900 ft` are also read; feet are converted to metres. Ranges are not supported. |
| `bean.aromatics` | Tasting notes; 500 characters. |
| `bean.note` | Longer coffee description; 2,000 characters. |
| `bean.cupping_points` | Finite numeric score greater than 0 and at most 100, e.g. `86.5`. |
| `bean.decaffeinated` | Exactly `1` for decaffeinated or `0` for caffeinated. Omit when unknown; strings such as `true` are not accepted. |
| `bean.url` | HTTPS coffee/product page; 2,000 characters. |
| `bean.image` | HTTPS image URL; 2,000 characters. Stored internally as `imageUrl`. |

Text caps count JavaScript string length (UTF-16 code units), not encoded URL
bytes. There is no advertised whole-link size guarantee: browsers, launch APIs
and operating systems impose their own limits. Keep links short and use URLs
for longer content.

Legacy aliases remain readable: `bean.roastDate` (`roastingDate`),
`bean.roastLevel` (`roast`), `bean.process` (`processing`),
`bean.cuppingScore` (`cupping_points`), and `bean.decaf` (`decaffeinated`).
`bean.imageUrl` is also read. New integrations should use the table above and
must not send both a legacy and current spelling; do not depend on collision
ordering.

## What the user sees

The import handler listens both when the app launches and while it is running.
It resolves the recipe through xBloom using the user's selected machine model,
then opens the editor. It does not start brewing or write a card. Recipe saving
continues to follow the editor's normal workflow.

Coffee metadata and `recipe.url` decorate a newly imported recipe. If the
recipe matches one already in the library, the existing recipe is opened and
its existing coffee metadata is preserved; a link does not overwrite the
user's edits.

Resolution requires network access and an available xBloom recipe. A failed
lookup shows the import error UI. A missing/unsupported version or missing
`share` does not activate this import handler; unsupported links may reach the
unmatched-route screen. A nonempty but unrecognisable `share` value can be
ignored before lookup. There is no machine-readable success/failure callback.
Do not treat successful URL opening as proof of import or saving.

Avoid putting secrets or personal information into URLs: they may appear in
browser history, application logs or analytics outside XBRW++.

## Integration checks

Try a real link with XBRW++ closed, then while it is open. Verify an installed
iOS and Android beta, a new recipe and an existing library recipe, Unicode and
reserved characters in coffee metadata, and a failed lookup/retry. Check that
the selected machine model is correct; Studio and Original grind scales are
not interchangeable.

The implementation contract lives in `library/brewmindLink.ts`,
`library/importInput.ts`, `hooks/useImportLink.ts`, `hooks/useRecipeImport.ts`,
`app/+native-intent.tsx` and `app/index.tsx`. The historical `brewmind` module
names do not restrict this endpoint to BrewMind.
