# Integration Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish four ready-to-use XBRW++ link buttons and document their use on websites and in native apps.

**Architecture:** Ship static, self-contained artwork; do not introduce app components, dependencies or behaviour changes. Derive a crisp embedded logo from the existing mark and outline the lettering so consumers need no fonts. Extend the existing URL guide without merging the unrelated beta application changes.

**Tech Stack:** SVG, PNG, existing Inter/Space Mono artwork fonts, macOS CoreText for outlining, installed `rsvg-convert` for raster exports, Markdown.

---

## Context and file map

Work only in `/Users/jesperhessius/Dev/XBRW-link-assets-20261017`,
branch `docs/link-assets-20261017`, pinned base
`5cb58676c0cde53675d378edcb27db43e2c5bbf1`.
Read `AGENTS.md` and the approved spec:
`docs/superpowers/specs/2026-10-17-link-buttons-design.md`.

| File | Responsibility |
| --- | --- |
| `assets/branding/link-buttons/open-in-xbrw-muted-text.svg` | Charcoal button without logo |
| `assets/branding/link-buttons/open-in-xbrw-muted-logo.svg` | Charcoal button with crisp logo |
| `assets/branding/link-buttons/open-in-xbrw-bold-text.svg` | Magenta button without logo |
| `assets/branding/link-buttons/open-in-xbrw-bold-logo.svg` | Magenta button with crisp logo |
| Matching `.png`, `@2x.png`, `@3x.png` for each SVG | Raster equivalents: 12 files |
| `assets/branding/link-buttons/NOTICE.txt` | Asset-use permission, typography attribution and required font notices |
| `docs/url-scheme.md` | Existing URL contract plus partner asset guide |

Keep one-off conversion and inspection helpers in session artifacts, not the
application source. Do not change `assets/branding/xbrw-icon.svg`,
`constants/colors.ts`, dependency manifests, or generated native directories.
Do not create a second integration guide.

## Task 1: Outline and compose the four buttons

**Create:** the four SVGs and `NOTICE.txt` listed above.
**Read:** `assets/branding/xbrw-icon.svg`, `constants/colors.ts`.

- [ ] **Step 1: Check ownership and tool availability.**

Run:

```bash
git status --short --branch
git rev-parse HEAD
command -v swift
rsvg-convert --version
```

Expected: clean owned task branch; Swift and librsvg available. Do not switch
the shared root checkout. The approved visual previews are preserved under
session artifact `files/link-assets/.superpowers/brainstorm/42736-1792230714/content/`.

- [ ] **Step 2: Prepare font outlines without adding an app dependency.**

Use existing `Inter-SemiBold.otf` from
`/Users/jesperhessius/Dev/XBRW-beta-20261016/node_modules/@tamagui/font-inter/otf/`
for `Open in`, and task-local `assets/fonts/SpaceMono-Regular.ttf` for the
monospace app name. Use a slight same-colour stroke on the outlined name only
if needed to match the heavier approved preview; do not substitute Doto.

Use this complete one-off CoreText helper in session artifacts to convert
each text segment into an SVG group. Its arguments are the font path and the
literal segment; the output JSON contains advance width and path markup.

```swift
import Foundation
import CoreText
import CoreGraphics

guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: outline.swift FONT_FILE TEXT")
}
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
      let descriptor = descriptors.first else {
    fatalError("Cannot load font")
}
let font = CTFontCreateWithFontDescriptor(descriptor, 14, nil)
let attributes = [kCTFontAttributeName as NSAttributedString.Key: font]
let line = CTLineCreateWithAttributedString(
    NSAttributedString(string: CommandLine.arguments[2], attributes: attributes)
)
let runs = CTLineGetGlyphRuns(line) as! [CTRun]
var markup = ""
for run in runs {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    for index in 0..<count {
        if glyphs[index] == 0 { fatalError("Missing glyph") }
        guard let path = CTFontCreatePathForGlyph(font, glyphs[index], nil) else {
            if glyphs[index] == CTFontGetGlyphWithName(font, "space" as CFString) { continue }
            fatalError("Missing glyph outline")
        }
        var d = ""
        path.applyWithBlock { pointer in
            let element = pointer.pointee
            func point(_ index: Int) -> String {
                let p = element.points[index]
                return "\(p.x + positions[index].x) \(-(p.y + positions[index].y))"
            }
            switch element.type {
            case .moveToPoint: d += "M\(point(0)) "
            case .addLineToPoint: d += "L\(point(0)) "
            case .addQuadCurveToPoint: d += "Q\(point(0)) \(point(1)) "
            case .addCurveToPoint: d += "C\(point(0)) \(point(1)) \(point(2)) "
            case .closeSubpath: d += "Z "
            @unknown default: fatalError("Unsupported path element")
            }
        }
        markup += "<path d=\"\(d)\"/>"
    }
}
let result: [String: Any] = [
    "width": CTLineGetTypographicBounds(line, nil, nil, nil),
    "svg": markup
]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
```

Invoke separately for `Open in`, `XBRW`, and `++`. Preserve the output outlines
for reuse in all four SVGs. Confirm advance widths are positive and no
conversion reports missing glyphs. Use measured outlines rather than assuming
CSS font metrics equal the final artwork.

- [ ] **Step 3: Compose the SVG assets with exact approved styling.**

Use a height of 48, radius 10, 17-pixel horizontal padding, 14-pixel lettering
and 10-pixel gaps. Determine integer intrinsic widths from the actual content
bounds. Centre the lettering vertically using its measured outline bounds.
The logo variant adds a 30-pixel mark and a 10-pixel gap before the action copy.

Use charcoal `#161616`, white `#FFFFFF`, brand ink `#FF007F`,
bold fill `#D10069`, and muted border `#494949`. A 1-pixel border must lie
inside the canvas, not be clipped at its edge. In bold buttons all lettering
is white. Draw the outbound arrow as vector strokes rather than a font glyph.

Embed the existing logo's rectangle and circle groups into the logo SVGs,
scaled from their 1024-square viewBox into 30 pixels. Remove the `filter`
attributes and filter definitions. Use a rounded clipping path for the
6-pixel mark corners. The original logo source stays untouched.

Include intrinsic width/height and matching viewBox, SVG namespace,
`role="img"` and `<title>Open recipe in XBRW++</title>`. No `<text>`,
`<image>`, scripts, external references, font CSS, blur or glow filters.

- [ ] **Step 4: Record font and asset permissions.**

Read the upstream font notices for the exact Inter and Space Mono fonts.
The Tamagui package's top-level software license alone is not proof of the
font's license. Obtain the fonts' copyright/OFL notices from their authoritative
sources and preserve required wording in `NOTICE.txt`. Do not redistribute
font binaries. Add this permission for the finished artwork:

```text
You may copy and display these supplied XBRW++ buttons in websites and
applications to link to XBRW++. Preserve the supplied artwork and proportions.
This permission does not imply endorsement or grant rights to unrelated
repository content or third-party marks.
```

- [ ] **Step 5: Inspect the vector buttons before raster export.**

Show all four on light and dark surfaces using the existing visual companion.
Compare against the approved preview at 48 pixels high. Inspect the actual
embedded dots and ensure no glow, clipping, shifted baseline or missing glyphs.
Correct artwork issues before exporting.

## Task 2: Export and check raster assets

**Create:** the 12 PNGs matching the SVG filenames.

- [ ] **Step 1: Export every density from its final SVG.**

From the owned task root:

```bash
for style in muted bold; do
  for treatment in text logo; do
    stem="assets/branding/link-buttons/open-in-xbrw-$style-$treatment"
    rsvg-convert --height 48 "$stem.svg" --output "$stem.png"
    rsvg-convert --height 96 "$stem.svg" --output "$stem@2x.png"
    rsvg-convert --height 144 "$stem.svg" --output "$stem@3x.png"
  done
done
```

Expected: four SVGs and twelve PNGs. Each scale has exactly proportionate
dimensions and transparent outer corners. Do not add a raster background.

- [ ] **Step 2: Inspect dimensions and visual consistency.**

Run `sips -g pixelWidth -g pixelHeight -g hasAlpha` on each PNG. Verify heights
48/96/144, widths at exact scale multiples, and alpha channels. Inspect the
corner pixels for zero alpha with an available image inspector; do not treat
the mere existence of an alpha channel as proof of transparent corners.

Inspect PNGs at logical display size alongside the SVGs. Confirm fine logo
detail is clean at 1x and the 2x/3x versions are not blurry upscales.
Check label contrast: white on bold, white on charcoal, and brand on charcoal
must each meet 4.5:1. Confirm the muted outline remains visible on dark hosts.

- [ ] **Step 3: Commit the complete artwork checkpoint.**

```bash
git add assets/branding/link-buttons
git commit -m "docs: add ready-to-use XBRW linking buttons" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Extend the existing URL guide

**Create on this base:** `docs/url-scheme.md`, preserving its existing content.

- [ ] **Step 1: Bring across the existing guide only.**

Read `docs/url-scheme.md` from commit
`a121929e0d770d39db07168b482e2e3cd7c1102a` and add that exact content using
the normal file-edit tool. Do not cherry-pick or merge the beta branch.
Keep the original version-1 contract unchanged.

- [ ] **Step 2: Add a button section after Supported entry point.**

Show the four SVG previews with relative image paths. Each row must link its
SVG and all three PNG densities. State intrinsic logical sizes using the
actual exported widths. Use the muted-logo option for the primary example,
and explain when text-only and bold are useful.

Include an HTML example using `xbrw://import?v=1&amp;share=XB0001` and the
muted-logo SVG inside an anchor. Set the image's alt text to
`Open recipe in XBRW++`; avoid a duplicate anchor aria-label. State that
`XB0001` is an example code to replace with a real recipe/share URL and link
back to Constructing links safely for URL generation and nested encoding.
Use the published asset URL as the example `src` and explicitly recommend
downloading and hosting a copy. Do not imply GitHub blob pages are image URLs.

Include this native React Native structure, filling in the exact artwork
width from the exported SVG and using a local copied PNG:

```tsx
<Pressable
  accessibilityRole="link"
  accessibilityLabel="Open recipe in XBRW++"
  onPress={() => Linking.openURL(importUrl).catch(reportLinkError)}
  style={{minHeight: 48, alignSelf: "flex-start", justifyContent: "center"}}
>
  <Image
    source={require("./open-in-xbrw-muted-logo.png")}
    accessible={false}
    resizeMode="contain"
    style={{height: 48, aspectRatio: buttonWidth / 48}}
  />
</Pressable>
```

Explain `importUrl` comes from the URL-construction example,
`buttonWidth` is the listed intrinsic width, and `reportLinkError` is the
host app's visible error handler. Show required imports from `react-native`.
The PNG's supplied `@2x` and `@3x` siblings are selected by native density.
Explain that native SVG support varies, hence PNG is the simplest default.

Retain web focus indicators, maintain aspect ratio, and provide minimum native
touch targets (44 points iOS, 48 dp Android). Explain the image is not a web
fallback or installation link and opening the URL is not proof of import/save.
Link `NOTICE.txt`, describe asset-use permission, and prohibit implying
endorsement. Do not change broader repository licensing.

- [ ] **Step 3: Check the guide and scope.**

Open the guide preview and follow every relative asset link. Confirm HTML
escaping and the native example's matching names, aspect ratio, density files
and error handler explanation. Ensure SVG contains outlines, not references
to the helper's fonts. No full app test run is needed for static artwork/docs.

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: only integration assets and directly related documents. Do not edit
the generated licences module or unrelated app files.

- [ ] **Step 4: Preserve and hand off.**

Commit the guide with the required Copilot trailer and push the task branch.
Fetch `origin --no-prune`, then run `npm run worktrees:check`. Record base/head,
worktree/branch, clean state and push state. Retain this owned worktree for
pending integration, with the remote branch as its recovery pointer. No PR,
merge, deployment, release build or cleanup is authorised by this plan.
