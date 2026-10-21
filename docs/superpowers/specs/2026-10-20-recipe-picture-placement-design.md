# Recipe picture placement for 2.2.0

## Status and scope

Design and written specification approved, implemented and revised on 2026-10-21.
The approved follow-up replaces the original list-photo rail and adds precisely
five automatic-shelf photo exceptions below. Native visual qualification remains open.

This replaces the combined picture-placement/default proposal in #225 and
#235. It is based on the cumulative preview at
`ccf6a6427505a1c3271b4a3dbec0c8456048e599`, not an assumption that current
contributor heads have been integrated. No app changes or PR merges are
authorized by committing this document.

Package B's four functional fixes (#233, #224, #236 and #226) and #229's magenta
ON switches were accepted separately. This design does not accept #243's
broader colour proposal.

## Purpose

Pictures are secondary recognition cues. They must not dominate a recipe,
displace its name or brew figures, or imply that one pictured member represents
an entire collection.

Browsing pictures represent the coffee or pod only. An importing person's
portrait is not a fallback coffee image. Author portraits remain beside author
identity in ABOUT.

Use circular frames for individual images, consistent with existing ABOUT
pictures. A shelf mosaic remains square, but photos inside its cells are
circular. Retain whole-product fitting for bag photos rather than stretching
them or introducing a new aggressive crop.

## Placement and settings

| Placement | Treatment | Preference |
| --- | --- | --- |
| Home list recipe card | 20 pt circle at bottom right, beside brew evidence, over the decorative graph if needed | Recipe card photos, default OFF |
| Compact recipe card inside a shelf, including selection mode | 20 pt circle at the start of the metadata row | Same preference, default OFF |
| Ready to brew | 36 pt circle alongside its text; independent BREW/dismiss controls remain reachable | Same preference, default OFF |
| Five eligible automatic shelf covers | Four-cell grid with four photographed recipes, including copies sharing a photo; otherwise existing glyph | Shelf photo previews, default ON |
| Other automatic / author shelf covers | Existing category glyph and inversion | Never replaced by a photo |
| Personal or tag shelf cover | Mixed actual-member photo/accent cells | Shelf photo previews, default ON |
| Editor header, expanded and collapsed | No picture or picture-specific space reservation | Not configurable |
| ABOUT coffee/pod and author details | Existing circular images, with distinct meanings | Existing ABOUT picture preference |

Do not add a separate list-versus-compact picture switch. Settings should expose
three clearly scoped rows:

- **Recipe card photos**: coffee or pod pictures on recipe cards and Ready to brew.
- **Shelf photo previews**: coffee pictures in personal/tag covers and the five eligible automatic covers.
- **Pictures in ABOUT**: coffee/pod and author pictures in recipe details.

The existing `showRecipeAvatars` key remains the ABOUT preference, retaining
stored values and its current preview default. New defaults are not implemented
by globally flipping that key.

Add `showRecipeCardPhotos` and `showShelfPhotoPreviews` to the existing settings
mechanism, not a parallel preference store.

### Upgrade and backup compatibility

| Incoming/stored preferences | Card photos | Shelf previews | ABOUT |
| --- | --- | --- | --- |
| No picture preference stored | OFF | ON | Existing default |
| Legacy `showRecipeAvatars: false`, no new keys | OFF | OFF | OFF |
| Legacy `showRecipeAvatars: true`, no new keys | OFF | ON | ON |
| New keys present | Each explicit new value wins | Each explicit new value wins | Existing value |

A legacy OFF choice must not silently enable another picture surface.
Legacy ON does not enable the newly redesigned card photos.

The same precedence applies when restoring an old backup: translate its legacy
picture choice for missing new keys instead of leaving a newer device's shelf
choice accidentally in force. A backup without any picture keys does not
invent a legacy OFF choice. Explicit new keys override legacy-derived values.
Unrelated restore merge semantics remain unchanged.

Include both new settings in export, restore and their tests. Retain the legacy
key for backward compatibility. No backup-version or recipe-data change is
needed.

## Recipe-card layout

### Home list

When enabled and a coffee image is available, place a 20 pt circular frame at
the trailing end of the bottom metadata row beside brew-count/last-brew evidence.
Keep the original uniform card background, without a shaded bottom strip.
The circle uses the recipe accent as its backing over the decorative graph.

The graph keeps its original 200x56 geometry and corner position regardless of
photos. Overlap with this decorative background is explicitly permitted. There
is no rail, profile shift, narrowing, silhouette collision or name-width gate.
Long names and notes retain their full original width and never suppress a photo.
Current measured row, figures and evidence widths determine whether the circle
and its gap fit without wrapping. Omit it first for crowded metadata, editing
controls or accessibility text that consumes the available width. Allocate the frame
before loading, not on image arrival; failed URLs disappear and changed URLs retry.

Keep the existing name-line allowance and card interactions. Photos do not
increase the card height or become separate browsing buttons.

### Compact cards

Use the chosen direction B: a 20 pt circle in the metadata row, never beside
the name. Names and brew figures retain the full existing content width.

Include a photo only when the metadata can remain on one row with it.
If adding the photo would cause a wrap, omit the photo first. Existing badges
can still wrap without it; do not hide them to keep decorative artwork.

The photo has no independent touch target and must not compete with the star,
overflow action, Easy Mode slot, bag/freshness, evidence or beverage markers.
Selection/edit modes follow the same layout rules.

Mount the photo at its final decoding size immediately, invisible and outside
the row's flow until the metadata measurements permit revealing it. Do not
delay starting the native image request/cache lookup behind those measurements,
or remount the image when revealing it. Crowded metadata still omits the photo
visually. Images use the native HTTP/decoded-image caches, subject to response
headers, size-specific decoded entries and eviction; this is not an offline
photo store or a guarantee of instantaneous rendering.

Retain #236's text-first profile behaviour: the silhouette uses remaining room,
shrinks when needed and disappears below its readable minimum instead of
overlapping text. Do not shrink text to preserve a photo.

### Ready to brew

Use the same card-photo preference and a 36 pt circular frame. Preserve the
separate open-recipe, BREW, dismiss, reorder and next-coffee controls. Omit the
image before allowing it to crowd those controls or their text.

## Shelf-cover composition

Only `xbloom` (XBLOOM RECIPES), `favourites` (STARRED), `pods` (XBLOOM PODS),
`mostBrewed` and `recentlyAdded` may replace their glyph with the existing
four-cell grid, and only with at least four actual matching recipes carrying
usable coffee/pod photos. Different recipes sharing one image URL each count:
four copies of a photographed recipe fill all four cells with that photo.
If a selected image fails to load, restore the automatic shelf's glyph rather
than leaving a partial grid. Failure is keyed by URL so a replacement can load.
Select the first four photographed members in `sortName`, UUID order;
unpictured members do not consume this automatic-cover quota.
Do not enlarge a photo. Below threshold or with previews OFF, keep the
glyph, including inversion. Other automatic and shared-author shelves always
keep glyphs; author portraits never count.

The separate stock-photo database read applies the real filter clause with its
bound parameters, guards JSON extraction, counts recipes rather than unique URLs and
returns at most four plus the existing three-row unreadable allowance. Hydration
and the existing HTTPS validator still apply; excessive corrupt candidates may
leave a fallback glyph rather than causing an unbounded repair scan. No whole
library is hydrated in the hook/component, no schema or settings migration is
added, and selection is independent of visible search/sort. Fallback art still
uses the first three actual members' accents, including when inverted.

For personal and tag shelves with photo previews enabled:

1. Select up to four valid actual members, including recipes without pictures,
   in stable alphabetical order (`sortName`, then UUID as a deterministic tie).
   Do not change the cover when the visible recipe query/sort changes.
2. Read through the existing shelf-membership/database mechanism. Do not scan
   the visible result set or perform an unbounded whole-library read.
3. For a multi-recipe shelf, use a fixed 2x2 grid within the existing 44 pt mark.
   Each selected recipe contributes its accent and, when available, a circular
   coffee/pod image within that cell.
4. A photo URL appears at most once in a cover. Other recipes with that same URL
   contribute accent-only cells. Never repeat a photo to fill spare cells.
5. When fewer than four members are available, fill unused cells with selected
   member accent colours, not extra copies or enlargement of their photos.
6. A shelf containing exactly one recipe may use one circle within the 44 pt
   mark. Count actual membership, not just the number of available photos.
7. With no eligible photos, or previews disabled, retain the existing accent
   mosaic. An image-load failure leaves its cell's colour, without changing the
   grid geometry.

The four-member photo-cover selection is separate from the existing
`ShelfMark` three-member fallback-art contract. Do not casually widen that
shared fallback contract to implement photo covers.

For personal/tag covers only, a pictured recipe outside the selected first four
does not force its way onto the cover. This mixed-member rule is unchanged;
the five automatic-cover exceptions seek four photographed members, including
copies sharing a photo.

## Editor and ABOUT

Remove the header photo, its tap-to-view affordance and photo-specific layout
reservations in both expanded and collapsed header states. Recalculate
collapse geometry without those reservations. Retain long-name handling,
rename access, HELP/menu wells and the pour-profile watermark.

Keep existing circular coffee/pod images in ABOUT beside their information.
Author images stay with author identity. No duplicate header photo and no
portrait fallback on other surfaces. Do not introduce a replacement full-screen
photo interaction as part of this work.

## Components and data flow

- `library/Settings.ts` and `useSetting` remain preference owners.
- `app/index.tsx` wires the card preference to list, compact/selection cards and
  Ready to brew, and the shelf preference to eligible shelf covers.
- `RecipeCard`, `RecipeShelfTile` and `ReadyToBrewCard` own their layouts.
- Keep shared circular photo rendering/failure handling in `RecipePhoto` where
  it fits existing component boundaries; do not duplicate transport logic.
- `ShelfTile` decides glyph versus personal/tag or eligible stock cover. Cover rendering receives
  bounded member data with each member's identity, accent and optional image,
  rather than unrelated accent and photo arrays that lose correspondence.
- Shelf data remains revision-driven and independent of the visible query.
- `app/editRecipe.tsx` no longer passes photos into `RecipeHero`; ABOUT retains
  the existing preference.

No new image service, upload flow, persistent image cache, dependency, native
module or schema migration is part of this design. Reuse existing validated
image URLs and platform image loading.

## Failure and accessibility behaviour

Missing or failed decorative images are not recipe errors. Show the existing
text/accent fallback, with no toast, broken-image icon or empty portrait
placeholder. Key failed-load state by URL so a changed URL can be attempted
without effect-driven state resets.

Photos add no new accessible element or duplicated name announcement. Preserve
existing card/shelf labels, custom accessibility actions and separate Ready to
brew controls. Information must remain understandable with all pictures off.

## Verification and acceptance

Implementation must cover both Jest platforms and use existing test helpers.
Tests involving membership SQL must exercise the real test database.

Cover the settings truth table, independent toggles, legacy and new backup
restore precedence, and export of both keys. Verify all card consumers follow
the shared switch without changing ABOUT or noneligible automatic glyphs.

Cover one pictured recipe among multiple unpictured recipes, duplicate URLs,
two/three/four-member covers, a genuinely single-member shelf, no photos,
load failures, changed URLs, and a pictured member beyond the selection limit.
Verify bounded reads and query/sort independence.

Verify there is no editor-header image or photo reservation, while ABOUT keeps
its circular coffee and author images. Preserve rename and collapse behaviour.

Native visual checks remain required on iOS and Android: narrow layouts, long
names and notes, large accessibility text, all badge combinations, editing and
selection modes, Easy Mode slots, tea labels, image-load transitions and
VoiceOver/TalkBack navigation. Software tests alone do not establish native
geometry. This design does not change NFC or BLE and requires no brewing to
evaluate its visual behaviour.

## Boundaries

No contributor merge, production build, release promotion or deployment is
authorized here. The wrong-recipe investigation remains deferred to #251.
Broader home-screen/roaster design, #243 colours and unrelated package decisions
remain separate.
