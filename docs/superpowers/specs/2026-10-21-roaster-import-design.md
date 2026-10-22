# Roaster import and saved-roaster shelves

## Purpose and approval

Package E adapts the contributor's roaster catalogue proposals for 2.2.0.
Home remains the library of recipes the user saved. Discovery belongs in
Import, not in a second catalogue mixed into that library.

The user approved the Import behaviour, automatic shelf rules, mixed-photo
artwork and metadata contract on 2026-10-21. They subsequently authorized
writing the implementation plan, implementation, a focused PR, one Copilot
review round, fixes and green CI. Stop ready to merge; merging is not authorized.

## Integration boundaries

Start from accepted develop, pinned for this task at
`4aa7c02d226c1900efb453ab63529172c1801ea7`.
The cumulative preview is an evaluation environment, not an integration base
and not a branch to merge wholesale.

The reference proposals were rechecked while writing this spec:

| Proposal | Reference head |
| --- | --- |
| #237, catalogue | `27535f8b72fd30febe51d07f7bd2cbd20bf63980` |
| #240, Import-related discovery | `25672dfab641116521be313aa650ab788f869994` |
| #245, import colours | `d306e9c22aa54bf803ec0fb07fc1cea5d3055395` |

Recheck their heads before extracting code and at PR handoff. Preserve
attribution and account for contributor follow-up commits. Source inclusion
still requires technical review.

Keep accepted Packages A-D, including Package C's staged importer, save-error
handling and fill-only-blank metadata behaviour. This design does not authorize
replacing that importer with an older contributor implementation.

## Import

### Arrangement

Keep the existing Import sheet and the shared link/pod-code parser. Place the
native Paste action beside the input rather than in a separate full-width row.
Preserve platform clipboard consent and an independently accessible, labelled
touch target.

Opening Import without supplied input does not focus the field or summon the
keyboard. Tapping the field starts typing. An incoming share, paste or shortcut
must still start its existing lookup flow without an extra confirmation.

While idle, show these sources in order:

1. The user's explicitly selected roasters, up to three, followed by
   **All roasters**.
2. **Your xBloom account**.
3. **xBloom catalogue**, with **Recipes from xBloom and the community**.

The roaster section is absent when there are no subscriptions. With
subscriptions but no selected shortcuts, show All roasters without empty
placeholders or automatic selections. All roasters opens the complete saved
subscription list, including access to feed management.

Source browsing remains idle-only. It must not compete with a lookup, error,
found recipe or replacement decision. Close the sheet before navigating to
another source. The sheet must scroll on short screens and with enlarged text;
the three-row cap is not permission to clip another source or the close action.

Use the xBloom catalogue name consistently on its entry and screen heading.
Do not claim that its contents are exclusively user-shared, or that independent
roaster catalogues are official xBloom publications.

### Explicit shortcut choices

Repurpose the proposal's existing subscription pin mechanism as
**Show in Import**, not Pin to home. Persist choices with subscriptions and
carry them through the existing settings backup validation.

Show only chosen roasters, in selection order. Do not fill spare places
alphabetically, infer favourites from usage or reshuffle after syncing.
Selecting a fourth leaves existing choices intact and explains that one must
be removed first. Removing a choice does not unsubscribe or remove recipes.
Unsubscribing removes that feed's shortcut and does not fill the vacant place.

Previously stored proposal pins retain their order as Import choices. If an
older value contains more than three, preserve the data, show only the first
three and expose all choices through management so the user can reduce them.
Do not silently replace a choice when restoring such a value.

## Home and saved-roaster shelves

### Library boundary

Do not include a roaster strip, promotional catalogue tiles or unsaved feed
search results on home. Home search, list counts, backups and recipe actions
continue to mean saved recipes. Import shortcut choices do not define shelf
membership.

A saved-roaster shelf is a query over saved recipes whose coffee metadata names
that roaster. It is not a subscription, a feed snapshot or a copy of catalogue
contents. Existing recipes carrying roaster metadata qualify without
reimporting, and membership continues to work offline and after unsubscribing.

### Presentation and visibility

Place roaster shelves in the existing Auto shelves section. Apply the shared
auto-shelf visibility gate: at least three saved recipes and no more than 80%
of the whole saved library. Preserve the existing exception that keeps an
applied shelf visible when its count crosses a threshold.

Use the declared roaster name as the label, the usual saved-recipe count and
the existing tile dimensions and hide/unhide behaviour. Unknown or blank
roasters create no shelf. An account that shared a recipe is not its roaster;
author shelves remain a separate concept.

Shelf counts, the opened recipe list and member artwork must resolve the same
filter. Keep this logic in the domain/index/query layer, not in route-level
array filtering. Use a distinct `roaster:` identity rather than adding
ordinary tags or overloading `sharedBy:`.

### Artwork

The shelf mark remains 44 pt. Use coffee photos attached to saved member
recipes, never unrelated images from the current feed or a new brand-logo
field.

With any usable photos, draw the existing four-cell arrangement. One to three
photos occupy individual cells; remaining cells use member accent colours.
Do not enlarge a lone photo or repeat it just to fill an empty cell. Separate
saved recipe UUIDs may legitimately share an image URL; do not invent a new
recipe-identity rule from image URL equality.

With no usable photos, use the first letter of the roaster name in the app's
dot-matrix style. A leading digit is retained for a name beginning with a
number. Follow existing font/glyph fallbacks for unsupported names rather than
drawing an empty mark.

Respect the existing show-photos preference. Loading or failed images must not
change tile geometry. Use accent cells for individual failed images and the
initial when no usable images remain. Offline membership and the initial do
not depend on network access; this does not promise uncached remote photos
will be available offline.

This mixed-photo policy is specific to roaster shelves. Existing stock auto
shelves keep their four-photo requirement, and other shelf artwork is unchanged.
The broader photo-loading investigation remains #253.

## Metadata contract

Persist roaster identity in `Recipe.coffee.roaster`, alongside the coffee
metadata already carried by recipe JSON. Do not create feed-dependent library
membership or infer a roaster from a personal xBloom account.

For a new candidate, explicit per-coffee roaster metadata takes precedence over
the feed-level fallback. Preserve a valid roaster already returned by the recipe
import when no per-coffee value replaces it. Only when neither exists may the
validated enclosing feed's declared roaster supply the missing value.

For an existing saved recipe, accepted fill-only-blank behaviour wins:
incoming metadata must not overwrite nonblank saved values. Feed context must
belong to the coffee being imported; a cancelled or superseded feed import
cannot decorate the next candidate.

Match trimmed names case-insensitively using a canonical Unicode-normalized
key. Preserve the display spelling in recipe JSON. Do not strip punctuation,
remove accents or guess aliases such as Acme and Acme Coffee. Choose a stable
display representative from saved data, not from whichever feed last synced.

Keep recipe JSON authoritative and extend the rebuildable recipe index for
roaster queries. Index upgrades must include older saved recipes. Wire the new
filter through validation, labels, counts, list queries, shelf art and
hidden-shelf identity. No side table of duplicated recipe membership is needed.

Copying, saving and backup/restore preserve roaster metadata. Preserve all
existing recipe fields, card restore bytes and brew history. Subscription
choices are validated separately and are not required to restore recipe
membership.

## Import integrity and errors

Typed lookup may discover a matching or newer recipe but must not replace or
save it before the user's existing deliberate action. Preserve staged saves,
storage-error feedback and retry paths. A failed save must not mutate the
already-saved object or claim success.

Closing, cancelling, replacing or failing an import disarms its feed offer.
Out-of-order responses cannot navigate, save or offer a feed for an obsolete
candidate. Keep the corrected author-fingerprint rule: local edits alone do
not mean a newer author version exists.

Keep feed parsing and HTTP validation at the existing trust boundaries,
including limits, HTTPS requirements and machine-specific recipe lookup.
Do not show arbitrary server error text or weaken abort/cancellation handling.
Elapsed cache-age copy must follow the current time wherever retained catalogue
surfaces display it.

Review #245 alongside import integration. Preserve approved imported accents
without broadening unrelated duplication behaviour solely because a recipe
contains any coffee metadata.

## Scope and adoption

Reuse the reviewed catalogue and subscription paths needed for Import. This is
not a new home shopping surface, a broad Add/New vocabulary redesign, a new
roaster directory service or an analytics integration.

#261 tracks adoption after release: independent publishing feeds, voluntary
roaster/customer feedback, repeat usefulness and publishing-guide improvements.
It is not a 2.2.0 release gate. Reconsidering home discovery requires a separate
evidence-based product decision; publisher count alone is insufficient.

Do not change main, release tags, native configuration or deployment settings.
No production build, submission, OTA publication or deployment is authorized.
Keep NFC/BLE and native-device release gates intact.

## Verification and acceptance

Implementation must cover both Jest platforms and the existing CI gates.
Use real SQLite for query behaviour and the repository's asynchronous
provider-aware component helpers.

Required cases:

- Zero subscriptions; subscriptions without choices; one, two and three
  choices; a fourth attempt; removal, unsubscribe, restart and backup restore.
- Selection order remains stable through sync and name changes; no automatic
  filling, recent-use selection or home pin controls remain.
- Plain opening keeps the keyboard down; tapping, native paste, incoming
  shares, source navigation, enlarged text and short screens remain usable.
- Correct xBloom catalogue naming and attribution; idle-only source rows.
- Explicit coffee roaster, feed-name fallback, existing imported roaster,
  conflicting saved values, blank values and a cancelled/replaced feed context.
- Case and canonical-Unicode matching, distinct aliases, missing metadata,
  pre-existing saved recipes and index rebuilds.
- Exact shelf visibility at two/three recipes and 80%/over 80%, including an
  applied shelf, hide/unhide, counts, member queries and opened recipes.
- Zero through four photos, partial/failed images, repeated URLs on distinct
  saved recipes, photos disabled, initial fallback and unchanged tile geometry.
- Copy and backup/restore preserve metadata without requiring a subscription.
- No unsaved catalogue results or discovery rows on home, including search
  and empty-library states.
- Typed replacement, actionable storage failures, author fingerprints,
  cancellation and overlapping imports preserve accepted Package C behaviour.
- Current contributor follow-ups are reconciled against pinned PR heads.

Static browser sketches explain layout only. They are not native clipboard,
accessibility, runtime or physical-device qualification. Finish implementation
with one focused PR, at most one Copilot round, implemented findings and green
CI, then stop ready for the user's merge decision.
