# XBRW++ URL integration

This guide describes the version-1 import contract. It lets another app or
website open an xBloom recipe in XBRW++, optionally
carrying coffee metadata and a link back to the producer's recipe page.

## Supported entry point

```text
xbrw://import?v=1&share=<encoded xBloom share URL>
```

`xbrecipewriter://import` is also supported. Prefer `xbrw://import` for new
integrations. Both schemes are registered on iOS and Android. The app must
already be installed; these custom-scheme links do not provide installation or
a web fallback. Provide a normal web link alongside the app button if needed.

### HTTPS browser entry point: implemented, not yet deployed

This branch implements `https://xbrwplusplus.vercel.app/import` (also `/import/`)
as a full server-rendered recipe page. This is an existing-host checkpoint,
not a claim that this implementation is already live. Publish links only after
the separately approved deployment and public read-only smoke checks.

The page works in a browser before native domain association: all recipe and
coffee content is HTML without JavaScript. It uses the app's actual xBloom
normalizer and import decorator, displaying every available coffee fact,
flavours, tags, roast advice, notes, image and recipe stage rather than a
summary-only preview. Missing fields stay absent. Lookup defaults to Studio;
an explicit Original response remains Original, with no grind conversion.

**Open in app** is an explicit `xbrw://import` link preserving every original
query value, including duplicate and unknown parameters and nested URLs.
Hosting may normalize equivalent encodings such as `+` to `%20` for spaces.
Nothing automatically
launches the app. Without the app, use the install destinations, then **return
to the same browser page and tap Open in app**. There is no deferred/post-install
handoff. iOS installation uses [the App Store](https://apps.apple.com/app/id6806339475);
Android uses [GitHub Releases](https://github.com/hessius/XBRW/releases/latest),
not Google Play. Product (`bean.url`), producer recipe (`recipe.url`) and
**View on xBloom** destinations are separate.

No current store binary's Universal Link / Android App Link support is claimed.
Domain ownership, published association files, signing identities, a fresh
fingerprinted native build and installed-device acceptance are separate gates.
`xbrw.app` is not owned/verified for this integration; do not publish it.

## Ready-to-use buttons

Use **muted** by default, or **bold** when XBRW++ is a prominent action.
Both work on light and dark backgrounds. Choose the logo version for a
standalone recipe link, or the text-only version for tighter layouts.
The logo is the app's existing mark without its glow, for clarity at small sizes.

| Style | Preview | Logical size | Downloads |
| --- | --- | --- | --- |
| Muted, with logo | ![Open recipe in XBRW++](../assets/branding/link-buttons/open-in-xbrw-muted-logo.svg) | 215 × 48 | [SVG][muted-logo-svg] · [PNG 1×][muted-logo-1x] · [2×][muted-logo-2x] · [3×][muted-logo-3x] |
| Muted, text only | ![Open recipe in XBRW++](../assets/branding/link-buttons/open-in-xbrw-muted-text.svg) | 175 × 48 | [SVG][muted-text-svg] · [PNG 1×][muted-text-1x] · [2×][muted-text-2x] · [3×][muted-text-3x] |
| Bold, with logo | ![Open recipe in XBRW++](../assets/branding/link-buttons/open-in-xbrw-bold-logo.svg) | 215 × 48 | [SVG][bold-logo-svg] · [PNG 1×][bold-logo-1x] · [2×][bold-logo-2x] · [3×][bold-logo-3x] |
| Bold, text only | ![Open recipe in XBRW++](../assets/branding/link-buttons/open-in-xbrw-bold-text.svg) | 175 × 48 | [SVG][bold-text-svg] · [PNG 1×][bold-text-1x] · [2×][bold-text-2x] · [3×][bold-text-3x] |

Download and host a copy of the assets, or bundle them in your app. The download
links point to a fixed artwork revision, so their contents will not change.
SVGs include outlined lettering and vector logos; no fonts or external images
are needed. PNGs have transparent corners and are exported at 1×, 2× and 3×.

### Websites

Use an SVG inside a normal link. This example uses a directly hosted asset;
replace `src` with your own hosted copy if preferred. Do not use a GitHub
`blob` page URL as an image source.

```html
<a href="xbrw://import?v=1&amp;share=XB0001">
  <img
    src="https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-logo.svg"
    alt="Open recipe in XBRW++"
    width="215"
    height="48"
  >
</a>
```

`XB0001` is an example pod code. Replace it with your recipe's real pod code or
generate the full import URL as described in [Constructing links safely](#constructing-links-safely).
For an xBloom share URL, encode the nested URL before applying HTML escaping.
Keep the anchor's keyboard focus indicator visible. The image's alt text names
the link; do not add a second, duplicate label or make the image a separate
focusable control.

The button only works when XBRW++ is installed. Provide a separate web link to
the recipe for people without the app; the image does not add installation or
fallback behaviour.

### Native apps

PNG is the simplest option across native image APIs; SVG support depends on
your platform or image library. Display the logo version at 215 × 48 logical
units, or text-only at 175 × 48, rather than at a high-density file's pixel size.
Preserve the aspect ratio and provide a touch target of at least 44 points on
iOS and 48 dp on Android. The supplied 48-high designs meet both height targets.

For React Native, copy the muted-logo PNG and its `@2x` and `@3x` siblings
alongside the component below. React Native selects the appropriate density.
Pass the `appUrl` generated in [Constructing links safely](#constructing-links-safely)
as `importUrl`:

```tsx
import {Alert, Image, Linking, Pressable} from "react-native";

export function XbrwImportButton({importUrl}: {importUrl: string}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Open recipe in XBRW++"
      onPress={() => {
        Linking.openURL(importUrl).catch(() => {
          Alert.alert(
            "Could not open XBRW++",
            "Check that XBRW++ is installed, then try again."
          );
        });
      }}
      style={{
        minHeight: 48,
        alignSelf: "flex-start",
        justifyContent: "center",
      }}
    >
      <Image
        source={require("./open-in-xbrw-muted-logo.png")}
        accessible={false}
        resizeMode="contain"
        style={{width: 215, height: 48}}
      />
    </Pressable>
  );
}
```

The wrapper supplies the accessible name; the image is decorative to assistive
technology in this example. If your app checks whether the scheme can be opened
before showing the button, follow your platform's URL-scheme query configuration.
A successful URL-open call still does not confirm import or saving.

### Using the artwork

You may copy and display these buttons in websites and apps to link to XBRW++.
Keep the supplied proportions and colours; do not stretch, crop or recolour
them. Keep the complete labelled button rather than using the logo alone as
an unexplained import action. Usage does not imply endorsement.

The [asset notice](../assets/branding/link-buttons/NOTICE.txt) includes the
permission and font attribution. This permission covers the supplied buttons,
not unrelated repository content or third-party marks.

[muted-logo-svg]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-logo.svg
[muted-logo-1x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-logo.png
[muted-logo-2x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-logo@2x.png
[muted-logo-3x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-logo@3x.png
[muted-text-svg]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-text.svg
[muted-text-1x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-text.png
[muted-text-2x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-text@2x.png
[muted-text-3x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-muted-text@3x.png
[bold-logo-svg]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-logo.svg
[bold-logo-1x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-logo.png
[bold-logo-2x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-logo@2x.png
[bold-logo-3x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-logo@3x.png
[bold-text-svg]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-text.svg
[bold-text-1x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-text.png
[bold-text-2x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-text@2x.png
[bold-text-3x]: https://raw.githubusercontent.com/hessius/XBRW/0faf007174121d91d070d0627920fe2029e62183/assets/branding/link-buttons/open-in-xbrw-bold-text@3x.png

## Query parameters

Parameter names are case-sensitive. Send each parameter once.

| Parameter | Required | Meaning |
| --- | --- | --- |
| `v` | Yes | Exactly `1`. Missing or unknown versions are not processed as version-1 imports. |
| `share` | Yes | An xBloom HTTP(S) share URL with a nonempty `id` query parameter. A valid xBloom pod code (XID), such as `XB0001`, is also accepted. Prefer a share URL. |
| `source` | No | Your producer/app identifier. Unknown identifiers are accepted; currently only the exact value `brewmind` receives a dedicated source label. Other values use ordinary import provenance. Do not impersonate another app. |
| `recipe.name` | No | Producer's recipe title, independent of the coffee name. Whitespace is folded; long titles are fitted to the editor's 100-character ceiling, preserving a dose suffix where possible. |
| `recipe.url` | No | Your own HTTPS page for this recipe, at most 2,000 characters. Separate from the xBloom share URL and the coffee's `bean.url`. |
| `feed` | No | Public HTTPS catalogue address, at most 2,000 characters. Parsing/browser lookup does not fetch it; the app may offer a subscription through its normal workflow. Shared Vercel feed service B (#281) is not integrated in this branch. |
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
// Inputs supplied by your product/recipe, not constants from an example recipe.
const link = new URL("https://xbrwplusplus.vercel.app/import");
link.searchParams.set("v", "1");
link.searchParams.set("source", "your-app");
link.searchParams.set("share", xbloomShareURL);
link.searchParams.set("bean.name", coffeeName);
link.searchParams.set("bean.roaster", roasterName);
link.searchParams.set("bean.image", coffeeImageURL);

const browserUrl = link.toString(); // Use only after deployment is verified.
const appUrl = `xbrw://import${link.search}`; // Installed-app-only alternative.
```

Use the real xBloom share URL and public HTTPS coffee image URL from your data.
If the inner URL already contains `%2B`, `%2F` or `%3D`, keep that
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

`bean.name` is required for the coffee block to be retained. Without a usable
name, the coffee block is ignored, but the recipe can still import. The
recipe-level tags and colour can apply independently; flavours require the
named coffee block.
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
| `bean.flavours` | Comma-separated short flavour labels, separate from `aromatics`. At most 500 input characters, 12 labels, 32 characters per label; whitespace is folded and duplicates removed case-insensitively. Invalid labels are omitted. |
| `bean.tags` | Comma-separated tags; the same limits and normalization as flavours. |
| `bean.colour` | Strict `#RRGGBB` label colour, matched to a canonical recipe accent rather than persisted as an arbitrary UI colour. `bean.color` is also read. |
| `bean.rest_days` | Whole days after roasting before use, 0–540, at most four input characters; zero is valid. |
| `bean.peak_day` | Recommended peak day after roasting, 0–540, at most four input characters. |
| `bean.best_until_day` | Recommended end of the window after roasting, 0–540, at most four input characters. |

Text caps count JavaScript string length (UTF-16 code units), not encoded URL
bytes. There is no advertised whole-link size guarantee: browsers, launch APIs
and operating systems impose their own limits. Keep links short and use URLs
for longer content.

Legacy aliases remain readable: `bean.roastDate` (`roastingDate`),
`bean.roastLevel` (`roast`), `bean.process` (`processing`),
`bean.cuppingScore` (`cupping_points`), and `bean.decaf` (`decaffeinated`).
`bean.imageUrl`, `bean.restDays`, `bean.peakDay`, and `bean.bestUntilDay` are
also read. New integrations should use the table above and
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

Use public URLs, not secrets, credentials, signed private image links or personal
information: query strings may appear in browser history, application logs or
analytics outside XBRW++. Browser responses use private/no-store at the browser,
CDN and Vercel CDN layers and a no-referrer policy; this does not make a public
URL a secret.

## Integration checks

Try a real link with XBRW++ closed, then while it is open. Verify an installed
iOS and Android beta, a new recipe and an existing library recipe, Unicode and
reserved characters in coffee metadata, and a failed lookup/retry. Check that
the selected machine model is correct; Studio and Original grind scales are
not interchangeable.

The browser contract additionally lives in `api/import.ts` and `api/_lib/import*`.
The native implementation contract lives in `library/brewmindLink.ts`,
`library/importInput.ts`, `hooks/useImportLink.ts`, `hooks/useRecipeImport.ts`,
`app/+native-intent.tsx` and `app/index.tsx`. The historical `brewmind` module
names do not restrict this endpoint to BrewMind.
