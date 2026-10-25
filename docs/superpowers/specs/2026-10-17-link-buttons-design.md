# XBRW++ integration buttons

Historical design retained with the approved artwork kit. Its integration into
develop is tracked by `2026-10-24-preview-reconciliation-design.md`.

## Purpose

Give third-party websites and native apps ready-to-use buttons for the public
recipe-import URL scheme. The assets open XBRW++; they do not install the app,
start brewing, or promise that a recipe has been saved.

## Approved visual design

Use the action-button direction reviewed in the browser, labelled A:

- Copy: `Open in XBRW++`, followed by an outbound arrow.
- A rounded rectangle, 48 logical pixels high, with a 10-pixel corner radius.
- System-style sans-serif action text and a heavier monospace app name.
- Muted: charcoal fill, white text, a visible grey border and magenta `++`.
- Bold: magenta fill and white text.
- Each colour treatment has a logo and a text-only version.

There are four designs, not separate light/dark or compact families. Both
colour treatments must work on light and dark host surfaces. Recommend muted
by default, bold when the action needs emphasis, the logo for standalone links,
and text-only when horizontal space is limited.

Match existing palette values: `raised` (#161616), `brand` (#FF007F),
`brandFill` (#D10069), and `text` (#FFFFFF). Use the preview's #494949 button
border to distinguish the charcoal button from dark surroundings. Static asset
colours are explicit and self-contained; app palette values do not change.
Keep labels at least 4.5:1 against their fill.

Use a 14-pixel text size, approximately 17-pixel horizontal padding, and
10-pixel gaps. Preserve the approved preview's proportions when converting
text to outlines; final widths fit the outlined content without clipping.

## Crisp logo

Derive the button mark from `assets/branding/xbrw-icon.svg`: preserve its dot
geometry, white/magenta colours and black background, but remove its glow
filters. Display it at 30 by 30 pixels with 6-pixel rounded corners, as in the
approved preview. Do not redraw the mark or replace it with a typed `++`.

The existing app icon and source branding SVG remain unchanged. Crispness here
means removing glow, not promising perfectly sharp individual dots at every
fractional raster scale.

## Deliverables

Keep the assets together in `assets/branding/link-buttons/`. Each of the four
designs gets:

- A self-contained SVG with outlined text and an embedded vector logo when used.
- PNG exports at 1x, 2x and 3x, corresponding to 48, 96 and 144 pixels high.

Use descriptive filenames combining `open-in-xbrw`, `muted` or `bold`, and
`logo` or `text`. PNG density suffixes are `@2x` and `@3x`; the 1x file has no
density suffix. Background outside the rounded button is transparent.

SVGs must have intrinsic dimensions and a matching viewBox, with no external
fonts, images, scripts or runtime dependencies. Select openly licensed fonts
for outlining, and retain any required attribution or redistribution notices
beside the assets. Partners do not need to install a font. Do not introduce
production app dependencies to generate static artwork.

## URL documentation

Extend the existing single-file guide, `docs/url-scheme.md`, rather than
creating a separate partner integration guide. Include:

- A preview and direct asset links for each design, including PNG densities.
- A recommendation to use muted by default.
- HTML showing an image inside an anchor using the documented import URL.
- A native-app example using the PNG at its logical size and the platform's
  URL-opening API; preserve its aspect ratio.
- Accessible naming: label the action `Open recipe in XBRW++`; avoid duplicate
  announcements of image and button labels, and retain keyboard focus visibility.
- Adequate native touch targets, at least 44 points on iOS and 48 dp on Android.
- Instructions not to stretch, recolour, crop or make the mark-only image the
  sole unexplained import action.
- Explicit permission to use the supplied buttons to link to XBRW++, without
  implying endorsement or changing the repository's broader licensing.
- The existing installed-app requirement, separate web fallback guidance, and
  the fact that opening the link does not start a brew.

The guide was introduced on the beta consolidation branch at
`a121929e0d770d39db07168b482e2e3cd7c1102a`, and is not yet in this task's
`origin/develop` base. Bring across that document alone when implementing;
do not merge unrelated beta application changes into this asset task.

## Acceptance

Inspect all four SVGs and all PNG densities on light and dark surfaces at
their intended display size. Confirm the actual mark is glow-free, text and
arrows are legible and unclipped, exported bounds preserve the design, and
SVG/PNG versions match. Check alpha transparency at rounded corners.

Check SVGs for external references and live text/font dependencies. Verify
image dimensions, contrast, documentation asset paths and example URL encoding.
Do not claim physical deep-link qualification from image checks. Existing URL
behaviour is unchanged; use the guide's installed-device integration checks
when a partner qualifies its implementation.

## Scope and workflow

This task changes static integration artwork and directly related
documentation only. No app UI, icon, scheme, import behaviour, deployment or
release changes. After approving this design, the user separately authorised
a documentation-only PR into main, with develop left unchanged. No merge,
rebase or production action is authorised.

Task owner: the current Copilot session. Worktree:
`/Users/jesperhessius/Dev/XBRW-link-assets-main-20261017`.
Branch: `docs/link-assets-main-20261017`.
Pinned base: `40d700200558055c34444efeb188a9eec4fc6f27`.

The initial design/artwork task was based on develop at
`5cb58676c0cde53675d378edcb27db43e2c5bbf1`. Its documentation and artwork
commits alone were copied onto the approved main-based branch, without
promoting any beta application code.
