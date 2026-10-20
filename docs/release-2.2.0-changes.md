# 2.2.0 preview change ledger

This is an evaluation branch, not an approved release candidate. The notes below
come from the contributor proposals and describe intended behavior, not completed
hardware acceptance. The 24 proposal heads at the integration checkpoint are
included for testing; later contributor rebases need comparison before acceptance.
No contributor PR has been merged into develop or main.
Draft cumulative evaluation PR [#252](https://github.com/hessius/XBRW/pull/252)
targets develop. Its initial green CI at `b63602eb` predates the picture
redesign below and is not verification of that implementation.

Issue [#249](https://github.com/hessius/XBRW/issues/249) owns package order, review
findings and acceptance gates. Home roasters (#240), Ready to brew (#242) and
magenta primary controls (#243) still require product decisions. Cancellation
ownership fixes are applied locally below; physical BLE/NFC qualification remains
open. The wrong-recipe report is not reproduced or fixed by this integration.

The preview uses app version 2.2.0 because the date picker and Android navigation
bar plugin change the native runtime. EAS profiles, channels and remote build
numbers are unchanged. This version bump does not build, submit or deploy an app.

## Testing packages

| Package | Proposals | Acceptance focus |
| --- | --- | --- |
| Brew correctness | #247, #246 | Cancel/upload/reconnect ownership; wrong-recipe investigation deferred to #251 |
| Small UI fixes | #233, #224, #236, #225, #229, #226 | Duplicate on Android; names, tiles, defaults and model evidence |
| Shared layout and identity | #232, #234, #235, #230, #223 | Insets, long names, pictures, import and reimport |
| Multiple machines | #227, #228, #231 | Selection, connection ownership and saved identity |
| Roasters | #237, #240, #245 | Import/restore ownership and uncluttered home UI |
| Bags and brew suggestions | #238, #241, #242; #239 separately | Restore conflict policy, historical beans, freshness and dose presets |
| Brand proposal | #243 | Contrast and explicit visual approval |

## Verified preview follow-ups

### Single cumulative review follow-ups

The single Copilot round on #252 reported two reproducible catalogue defects.
A failed search-row photo now suppresses only that URL, so a replacement image
from a refreshed feed is attempted without remounting the coffee row.

Catalogue bags now use the existing fixed-name rule when recipe coffee metadata
determines the name sent with brews. The sheet shows that name read-only, and
bag creation enforces the same rule; recipes without coffee metadata retain
editable bean names. Both-platform regressions cover the row, form and stored
name. Beanconqueror matching still needs an external-app pass.

### Confirmed and inferred missing beans

An explicit no-beans state (`0x0F`) keeps #246's "No beans detected" message.
A generic idle event (`40517`) during grinding instead records `grindingStopped`
and asks the user to check the hopper without claiming an empty-hopper report.
The brew screen and mini bar distinguish both cases, history keeps the distinct
reason, and both retain TRY AGAIN. Existing history is not reclassified.

The maintainer provisionally accepted #247 based on the contributor's reported
machine verification. The remaining device checks are in
[the 2.2.0 testing checklist](release-2.2.0-testing.md); they are not recorded as
passed locally. The wrong-recipe hypothesis is deferred to
[#251](https://github.com/hessius/XBRW/issues/251) for hardware investigation,
not treated as fixed by cancellation changes.

### Mutable recipes and compiler caches

Quick edit and the pod section now use the editor's existing compiler opt-out
pattern. Saving a new dose can replace the recipe-dose chip without remounting
the panel (#239), and a late pod-name lookup removes the now-duplicate coffee
name (#230). Compiler regressions reproduce the unsafe reference-keyed caches;
component regressions retain the same recipe instance across each update.
Recipes remain mutable and no brew or card serialization changes.

### Catalogue content behind sheets

The roaster list, a roaster's coffees and a coffee page now leave the screen-reader
tree while the global brew-note sheet covers them, including empty and missing
catalogue states (#237). A coffee page also hides its background while its bag
sheet is open. Regression coverage checks that the content stays mounted but
inaccessible, then returns after closing or completing the sheet. TalkBack and
VoiceOver still need a device pass.

### Freshness and daily dismissal across midnight

The shared freshness clock now refreshes at local midnight and on foregrounding,
without polling during the day. Ready to brew can return after yesterday's
dismissal while the app stays open, and hiding it after midnight records the new
date (#242). Home roasters and the cached catalogue screens use the same clock
instead of keeping the time from mount (#240). Regression coverage includes
calendar midnight on daylight-saving boundaries, foreground rescheduling and
timer/listener cleanup. This does not add network refreshes.

### Cancellation and interrupted uploads

An interrupted upload no longer reinstalls manual START, and CANCEL invalidates
an already offered START immediately. Late upload/START write completions cannot
overwrite a cancelled or replacement connection's phase. Pending cancellation
and preflight waits cannot send commands on a replacement connection. A PRO retry
stops after cancellation or reconnection during either pacing gap.

Upload write errors now carry an explicit non-retryable classification. A lost
link after sending may mean the recipe reached the machine; the automatic
preflight relink must not resend it. A hook/transport regression covers that
boundary as well as the machine-level cancellation tests on both platforms.
The unanswered-vitals cancellation reported by review already remains terminal
in the combined incoming code and is pinned by a regression test.

These are preview-owned follow-ups, not edits to the contributor's #247 branch.
They do not establish recipe-buffer clearing or resolve the wrong-recipe report.

### Low-grind brew history

The shared `grinderRan` predicate now accepts integer BLE grinds 1-80 rather than
requiring the narrower NFC card band. Explicit grinder use is still required;
off, fractional, non-finite and out-of-range values remain excluded. History
sorting, dial figures, brew notes and handoff grinder details have regression
coverage for values below 40. No NFC limits, card encoding or stored records
change. This corrects a shipped 2.1.0 defect only on the 2.2.0 preview.

### Selected machine and refused runs

The saved-machine identity check now runs after preflight learns fresh vitals,
and before PRO retry commands as well as before its recipe upload. The original
selection is captured for each request; cancellation and replacement-link guards
remain in force across the asynchronous check. Tests reproduce a stranger whose
serial arrives only during preflight and refuse it without recipe frames.

Wrong-machine and no-saved-machine refusals now use the existing local terminal
refusal path: stop the recorder, release overflow ownership and allow a new run,
without sending cancellation to the other machine or writing brew history.
These preview fixes address the shared findings on #227, #228 and #231, not the
unreproduced same-machine A/B report or those contributor branches.

### Name identity and narrow layouts

Saving an untouched borrowed pod name now compares both names with the same
line-break normalization, so a multiline upstream name does not become a fixed
local rename (#224). Long-name layout refuses a zero/negative usable column
beside the profile instead of entering a non-terminating wrapping loop at
257-260 pt window widths (#234). Regression coverage runs on both platforms;
the loop regression has a VM deadline rather than hanging the test process.

### Bag restore conflict policy and reporting

Replacing the recipe library now preserves newer local bags for recipe UUIDs
that remain in the replacement. Bags belonging to removed recipes are deleted;
an insertion failure rolls the whole replacement back. A backup cannot reset
the remaining grams or reopen a locally finished bag merely because the user
chose replacement (#238). Real SQLite regressions cover both states and rollback.

The non-destructive restore action also accepts bags or brew history when all
recipes already exist, without requiring settings or replacement. Restore
messages count the bags that actually landed, report bag-store failures and
retain unreadable-entry warnings even when only settings were restored.

### Stable bag freshness

Editing grams left or another unrelated bag field no longer recalculates the
bag's saved best-until day or replaces its figures with newer coffee advice.
Typed rest/peak edits retain the window chosen by the last roast preset, and
partial coffee advice keeps its stated best-until day. Derived windows stay
inside the same 0-540 day range that storage and restore accept (#241, #242).

### Reimports distinguish local edits from author updates

A locally edited recipe no longer prompts to use the roaster's latest when
the author still serves the originally imported content (#237). Link imports
and catalogue saves keep the local copy and its original import fingerprint;
a genuinely changed author version still asks before replacing local edits.

Restoring subscriptions also clears their old sync timestamps because the
catalogue cache is not included in backups. The next normal sync can fetch
coffees immediately; paused subscriptions remain paused. An orchestration
regression restores settings, runs the real sync path with an injected feed
response and checks the populated catalogue.

Cancelling an import or replacing it with an ordinary share, browser import
or clipboard shortcut now disarms its roaster-feed follow-up. A later,
unrelated successful import cannot fetch or offer the cancelled link's feed.
Home-screen regressions cover cancellation, replacement and successful
follow-up of the original link.

## Imported proposal notes

Moved from additions to the shipped 2.1.0 ledger without rewriting that ledger.
Dates and claims below retain the contributor's original wording.

Integration follow-ups: the machine panel imports its existing chevron component;
the native configuration regression now pins 2.2.0. Price tests select a fixture
locale rather than assuming the host is English, and separately exercise Swedish
currency placement. Production formatting still follows the phone's locale.
The bean-filter clear test advances the existing search debounce explicitly,
instead of fitting a 600 ms debounce and rendering into a one-second polling budget.

## No beans and no water, said plainly (2026-10-19)

When a brew stops because the machine reports no beans (state 0x0F) or no water
(state 0x0C), the brew screen now names it and says what to do: "No beans
detected. Fill the hopper and tap TRY AGAIN." and "No water detected. Fill the
tank before brewing again." The water copy names no button because NO_RETRY
keeps TRY AGAIN off after a water fault (the dose may be spent). The beans copy
used to read as a guess ("stopped during grinding"), and the water copy gave no
next step. Device check: start a brew with an empty hopper, then an empty tank.

## Primary buttons in the brand colour (2026-10-18, proposal)

Primary buttons that do not run a recipe (SAVE NAME, CREATE SHELF, SEND, DONE,
WRITE TO MACHINE, TRY AGAIN, SAVE in the hub) and selected states with no recipe
accent (segmented controls, the list/grid toggle, active rail chips including
the history edit pencil) now fill with the brand magenta instead of white. All
of them read one new token, `primary` in `constants/colors.ts`. Dark ink is
5.18:1 on the magenta. Disabled buttons turn grey rather than a faded magenta.
Recipe accents still win where a recipe is on screen. Reverting is one line:
set `primary.fill` back to `palette.text`. Checkboxes, filter-sheet rows and
the switch track are unchanged. No card, BLE or storage behaviour changes.

## Ready to brew card (2026-10-18)

Builds on the bag tracker and rest and peak. While any recipe has an open bag,
the home library shows one compact card under the rail: the coffee worth
brewing now. It prefers a bag at its peak, then a ready one, then the open bag
brewed most recently; a resting bag is offered only when nothing else is open
("Resting, ready from 23 Oct", with a quiet BREW). A bag with not enough left
for another brew comes after any that can still be brewed. Ties go to the
recipe brewed most recently, then the newest bag.

The card optionally shows a 36 pt circular coffee/pod photo when Recipe card
photos is on and native text measurements leave room. It shows the coffee's
name on up to two lines, a short freshness line and, in
this app's bag mode, "212 g left, about 11 brews". BREW pushes the same brew
route as the row's BREW and is drawn only with a machine remembered; tapping
the name opens the recipe. In this app's bag mode, an open bag under two doses
adds "Vinka is running low · Reorder", with Reorder only when the coffee or
recipe has an https link. With several coffees at their peak or ready, "+2 more
ready" steps the card to the next one rather than opening a second surface.

A small close hides it for the rest of the local day (`readyToBrewDismissedOn`,
held out of backups like the drawer hint). No open bag means no card and no
change to the screen. It is hidden while picking shelf members, editing, or
inside a shelf room, and folds away with the header on scroll.

Release checks: on both platforms, add bags to two recipes with roast days that
put one at its peak and one resting, and confirm the peak one is offered; tap
BREW with a machine paired and confirm the brew screen opens on that recipe;
tap the name and confirm the editor opens; brew a bag down under two doses and
confirm the running-low line and Reorder; close the card and confirm it stays
away until the next day; check at 360 dp and with the largest text size.
## Shelf tile name and pour profile (2026-10-18)

A recipe tile in a shelf room now draws its name under the badges on up to two
lines, with or without figures, then the figures, then the pour profile in the
bottom corner. The profile used to be pinned to the corner over the name and the
figures, which on a device drew its line through both and cut the name to one
line. It now gets only the room the text leaves, measured at layout, at most
26 pt tall (about what a two-line name leaves at the default text size) and
4 pt clear of the figures, and is not drawn when that room is under 12 pt (the
largest text sizes). Tile height, the grid and the badge row
are unchanged. Large-text and narrow-screen tiles need a device check.

## Quick edit dose presets (2026-10-18)

Roasters publish one coffee at 15 g and again at 18 g, so libraries filled
with "- 15g" / "- 18g" pairs. Quick edit now shows one-tap dose chips under
the dose stepper: 15, 18 and 20 g plus the recipe's own dose. Tea gets none.
A new dose keeps the ratio. Every stage scales and rounds to whole millilitres
that add up to dose times ratio. Temperatures, pauses and patterns stay as
they were. A live bypass now scales with the dose too, held at 1-500 ml, and
the explainer gives the bypass and the whole cup. A ratio change leaves the
bypass alone. A stage pushed past 240 ml is refused with the existing
CANNOT BREW message, and BREW goes dead.

SAVE AS N G makes the adjusted dose the recipe's own. It is offered only when
the dose alone brews. Other adjustments stay one-brew changes. From the home
sheet it writes a scaled copy to the library. In the editor it writes at once
only when nothing else is waiting for SAVE; otherwise the dose joins the
pending edits and a toast says to press SAVE. No card bytes or BLE frames
change; a brew still sends the adjusted `recipeJSON`.

Not done: offering "you already have the 18g version" during import. Pastes
and shares hand off straight to the editor without the found panel, so the
offer would need a new step in the import flow.

## Roaster catalogue (2026-10-18)

An import link may carry `feed=<https URL>` naming a roaster feed
(`docs/roaster-feed.md`). After that link's recipe imports and the person is back
in the library, the app offers "Subscribe to {roaster}?" unless they already
subscribe (it refreshes quietly instead) or ticked "Don't ask again".
Subscribing adds the roaster to the catalogue and imports nothing.

Catalogue > Roasters lists subscribed roasters; each opens a list of coffees
(photo, roast level, tasting notes, bag sizes, SOLD OUT) drawn from the cached
feed. Opening a coffee fetches its recipe from xBloom and shows roast advice,
bean details, sizes and the roaster's page, with two actions: Brew now
(editor, unsaved) and Add to shelf, which saves the recipe to the library and
then puts it on a shelf the person picks or makes. There is no separate Add to
library (owner decision, 2026-10-18). A TODO marks where bags will attach. Feed sync runs on open and foreground at most every 12 hours and
on Refresh, reads only the feed, and never touches the library or xBloom.

Re-importing a share link the library holds now follows the author: an
unedited copy takes the latest brewing content quietly; an edited one asks
"The roaster has a newer version" (Use the roaster's latest / Keep mine). Name,
notes, tags and brews always stay. Import-time brewing fingerprints are kept in
the `importFingerprints` setting, carried in backups. Settings > Library >
Roaster subscriptions manages subscriptions (Browse, Refresh now, Pause/Resume,
Open roaster's site, Unsubscribe) and "Don't ask again" answers. Device checks:
cold-start link with feed, foreground refresh, large text on the catalogue
screens, TalkBack on SOLD OUT and the re-import question.

Third device pass (2026-10-18): a coffee page has two actions, Brew now and
Add to shelf (Add to library removed). The roaster's coffee list puts its count
on a line under the name ("2 of 44 coffees", "44 coffees") instead of a
superscript a long name clipped. The filter rail starts clear of the screen
edge and fades whichever end has more chips. A coffee's flavours (link
`bean.flavours`, feed `flavours`) are now stored on the recipe's coffee for
ABOUT; they are never sent to Beanconqueror. Device check: the fade on a long
rail and the count with a long roaster name on the cover screen.

NEW and back in stock (2026-10-18): the app remembers which catalogue coffees
were seen (shown in the list or opened). A sync that brings an unseen coffee
tags it NEW in the list and on its page, and a dot with a count appears on
Catalogue > Roasters and on the roaster's row. The tag lasts one visit to the
list (the dot clears on that visit) or until the coffee is opened; the first
sync after subscribing marks everything seen. A sold-out coffee's page has
"Tell me when it's back"; a sold-out bag of a coffee on sale has TELL ME. A
later sync that finds it on sale tags it BACK IN STOCK, dots the roaster and
shows one toast "{coffee} is back at {roaster}."; opening it or switching the
watch off clears it. All of it lives in the `roasterAlerts` setting, held out
of backups. Foreground sync only, no push, no background fetch, no xBloom
calls. The coffee page photo is now drawn whole (square until loaded, then its
own shape between 4:5 and 16:9, up to 420 wide and centred) instead of a
cropped banner. Long catalogue names are fitted under the 100-character name
ceiling (`library/fitName.ts`), and re-adding a coffee renames a copy still
showing xBloom's own name. Roasters get `docs/roaster-guide.md` and
`npm run check-feed -- <url or file>`. Device checks: NEW and dot after a real
feed change, back-in-stock toast after a restock, TalkBack on the dot rows and
the TELL ME switch, the square photo on the Fold inner screen.

Roasters on the home screen (2026-10-18): with at least one subscription the
home screen has four ways into the catalogue, and without one it is unchanged.
A strip under the three tiles lists the roasters (name, a status line,
`${k} NEW` and `${b} BACK`, a small photo stack; see the pins entry below for
how many); it folds away with the tiles. The library search also
searches the subscribed roasters' cached feeds (no request) with the roaster
list's own matching (`filterCoffees`), coffees on sale only, shown after the
library under FROM YOUR ROASTERS;
a result opens the coffee's page. The import sheet gains YOUR ROASTERS above
BROWSE THE CATALOGUE, and an empty library gains BROWSE ${ROASTER} (or BROWSE
YOUR ROASTERS) when a subscribed roaster has coffees cached. Every
subscription state has a row: "Loading coffees" or "Couldn't update" before a
feed is cached (the row then opens the roaster's feed screen), a PAUSED marker, "No coffees
on sale right now", and "Updated 3 d ago" beside a failing feed's cached count.
Search uses the cache of paused and failing roasters and leaves out sold-out
coffees and roasters not yet loaded. Unsubscribing clears the strip, results
and NEW counts at once. Strip order: something NEW or back first, then by
name. Logic in `library/roasterHome.ts`. Device checks: the strip at
360 dp and with large text, the strip folding on scroll, TalkBack on the strip
rows and the search results.

Home strip, pins and the home switch (2026-10-19): following hessius's
suggestion, the strip lists every roaster when there are 1 to 3, and with 4 or
more shows only pinned roasters (3 at most, in the order pinned) followed by one
"Roasters · {n}" row that opens the roasters list and adds up every roaster's
NEW and BACK. A roaster's feed screen has "Pin to the home screen"; pinned
roasters come first and carry a small star on the strip and on the Roaster feeds
list. Pins live on the subscription (`pinnedAt`), so a backup carries them and
unsubscribing removes them. Roaster feeds starts with "Show roasters on the home
screen" (`showRoastersOnHome`, on by default, in backups): off hides the strip
and the empty library's Browse button, never the search. A strip row for a
roaster still loading opens its feed screen. Device checks: the summary row and
pin star at 360 dp and with large text, TalkBack on the summary row, pinning
from the feed screen and Back to home.

Roaster colour (2026-10-19): a feed coffee may carry `bean.colour` (or
`bean.color`), a strict `#RRGGBB` for the roaster's own colour coding, e.g. by
origin. A recipe added from the catalogue takes the palette accent nearest its
hue (`library/roasterColour.ts`); greys and far hues get the usual accent, and
a copy already in the library keeps its accent. The hex is never stored.

Roaster recipes in ABOUT (2026-10-18): for a recipe whose link or catalogue
named a roaster, FROM reads "From {roaster}" alone (the "Shared on xBloom by"
line is gone), and XPOD labels xBloom's title "xBloom profile name", drawn
quietly, with no USE THIS NAME. Pod recipes and links without a roaster keep
"Arrived from {sharer}" and the button. Device check: a CCC link recipe's ABOUT
on the cover screen.

Roaster feeds as list and detail (2026-10-19): the Settings > Library row is
renamed "Roaster feeds" (owner decision) and opens a list of that name, "Your
roasters", one row per roaster with "{n} coffees · Updated 2 h ago" (or Paused,
Couldn't update, Loading coffees), plus Refresh all (every roaster that is not
paused, one after another past the 12 hour limit, one toast) and the "Asked not
to" opt-outs with Ask again. A row opens that roaster's own screen: its name,
the coffee count and freshness, then Browse coffees, Open {roaster}'s site (when
the feed names one), Refresh now, Pause/Resume updates and Unsubscribe, which
confirms and then lands on the list. A roaster's coffee list ends with MANAGE
FEED, which opens that roaster's screen directly, and the roasters list's link
reads MANAGE FEEDS. Subscribe and Unsubscribe keep their names. Device checks:
Back from a roaster's screen to the list, unsubscribing after arriving from the
coffee list, and a long roaster name in the header on the cover screen.

## Scoped recipe pictures (2026-10-20, replacement preview design)

The approved [picture placement design](superpowers/specs/2026-10-20-recipe-picture-placement-design.md)
replaces the #225/#235 combined defaults and placement proposal on this
cumulative preview. It does not mean those contributor PRs were merged.

- **Recipe card photos**, default OFF: 20 pt circles at the bottom right of list
  cards beside brew evidence, 36 pt alongside Ready to brew text, and 20 pt at
  the start of compact metadata rows, including selection mode.
- **Shelf photo previews**, default ON: mixed personal/tag covers plus four-photo
  grids for XBLOOM RECIPES, STARRED, XBLOOM PODS, MOST BREWED and RECENTLY ADDED
  only when four distinct usable actual-member coffee/pod URLs exist. Below that
  threshold and for every other automatic/author shelf, retain the glyph/inversion.
- **Pictures in ABOUT**, default ON: the existing `showRecipeAvatars` preference
  now controls only coffee/pod and separate author pictures in recipe details.
  The editor header has no photo, viewing button or photo reservation in either
  collapse state. Rename, HELP/menu and the profile watermark remain.

A stored legacy OFF choice initializes an absent shelf choice OFF once; later
ABOUT toggles are independent. Legacy backups restore ABOUT and shelf choices,
but set card photos OFF even over an already configured device. Valid explicit
new keys win, and a backup without picture keys changes none of these choices.
Both new preferences are exported. No backup version or recipe schema changes.

Personal/tag covers read the first four actual members alphabetically by
`sortName`, then UUID, using bounded SQL plus the existing unreadable allowance.
Unpictured members still occupy cells. Multi-member covers keep a fixed 2x2
grid inside 44 pt, with circular whole-product images on each member's accent.
Duplicate URLs are drawn once; spare cells repeat accents, not photos. Only an
actually single-member shelf can use one 44 pt circle. A fifth pictured member
does not replace one of the selected four. Image failures leave cell colours
and geometry intact. Existing three-member fallback art is unchanged.

The five stock exceptions separately select the first four distinct photographed
matching members in stable name/UUID order, not the first four recipes or the
visible query. SQL guards JSON, deduplicates before the limit, and returns at
most seven candidates (four plus the existing unreadable allowance), then the
normal guarded hydrate/HTTPS validation applies. Excessive corrupt candidates
leave glyph fallback, not an unbounded recovery read. No schema change is needed.

Compact photos wait for current intrinsic badge and available-row measurements;
the measuring copy includes the visible row's zero-width spacer and its gaps,
but no duplicate badge IDs or actions. If the photo would wrap metadata, it is
omitted before any badge is sacrificed. Names and figures keep their full width,
tile height remains fixed, and #236's shrinking/hiding profile behavior stays.

The approved list follow-up places the 20 pt circle at the trailing end of the
bottom metadata row beside brew evidence. It may overlay the decorative graph,
whose original 200x56 geometry/corner position never changes. No photo rail,
60 pt shift, profile collision or name-width gate remains: long names and notes
keep their existing width. Measured bottom-row/figure/evidence widths admit the
photo only without wrapping; editing or large accessibility text omits it first.
The bottom strip uses the existing shaded profile wash, and the circle uses the
actual lighter card accent. Photos do not shrink text or add card height.
Loading reserves the admitted frame; failure releases it, and a changed URL can
retry. Native visual qualification remains open.
Ready to brew similarly omits its circle before text
would be crowded and keeps its independent controls and 44 pt BREW target.

All browsing images are decorative coffee/pod images with whole-product
`contain` fitting; author portraits are not coffee fallbacks. The shared image
renderer owns failure handling, and the obsolete full-screen header viewer is
removed. The network inventory describes the three independent preferences.
Software tests cover both platforms, real SQLite membership, restore/export,
exact fit and identical gap geometry, current/stale layout events, failures,
changed URLs, normal 390 pt real-pour cards and busy omissions. Native narrow
widths, Dynamic Type and screen-reader behavior are **not yet verified**; see
the [testing checklist](release-2.2.0-testing.md). No NFC/BLE logic changes.

## Import link name, picture and fill-blanks (2026-10-18)

An import link can now name the recipe with `recipe.name`. It lands on the
recipe's own name (the one a rename writes), whitespace folded, fitted under the
rename sheet's 100 characters (trailing bracketed groups first, then whole
words with "…", always keeping a " - 18g" size suffix); `xbloomName` stays, so USE THIS NAME still goes
back to xBloom's. The link's `bean.image` becomes the recipe's picture when the
recipe has none of its own; pod artwork wins. Its display follows the scoped
ABOUT, card and shelf preferences described above.

A link that points at a recipe already in the library opens the stored recipe
as before, and now fills its blanks: the picture when it has none, the coffee
when it has none, and missing fields of an existing coffee. Nothing with a
value is replaced. The name and the source are never touched, and derived tags
are added only to a recipe with no tags, from fields just filled. The recipe is
saved only when something changed. So a recipe imported before links carried
`bean.image` gets its photo on the next import. The found panel shows the
recipe's own picture before the pod's. No card, BLE or backup format change.
Not yet checked on a device.

## Android crash after Duplicate in the editor (2026-10-18)

Closing a sheet no longer moves the screen behind it between native parents.
The wrappers that hide a screen from TalkBack while a sheet is up were stacking
contexts only while hidden, so Fabric lifted their children into the parent on
every close. On the editor's More > Duplicate that move failed on Android
(`addViewAt ... View already has a parent`) and closed the app. These wrappers,
and the sheet body, now always keep their own native view
(`constants/views.ts`). No card, brew or storage behaviour changes. Needs an
Android device check: open and close each sheet in the editor, then More >
Duplicate and More > Delete.

## Long recipe names wrap (2026-10-18)

A roaster's import can name a recipe with its origin, farm, producer and lot,
often 40 to 100 characters. The recipe screen cut that off after two lines.
Names of 28 characters or fewer look exactly as before (26 pt, two lines).
A longer name takes at most three lines, at the largest of 22, 20, 18, 16 and
15 pt that fits it in three at the screen's width and text size. Only past
15 pt (about 100 characters on a 360 pt phone at the largest text sizes) does
it end in an ellipsis. The size is worked out from the characters before the
first layout, so the title never jumps, and the name uses simple line breaks so
the phone wraps where the estimate does. The estimate is calibrated against two
Fold cover screen screenshots and reproduces the second one's line breaks.
A name past 28 characters is never drawn across the pour-profile watermark. On
a phone it takes the full width and the watermark, drawn at 50 pt rather than
74, sits in a band of up to 40 pt under it; a short last line lets the
watermark rise beside it and the band shrinks. On a wide screen such as the
Fold's inner display the name sits in the column beside the watermark instead.
With the band, the space under the button row closes up a little; the COFFEE
label stays.
The folded header bar, the brew screen's title and a catalogue recipe's screen
title each allow two lines in place of one. Library cards and shelf tiles keep
their fixed heights, so they still truncate. The editor now tells its collapsing
header how much it folds away for the current name (up to about 250 pt with the
stage curve, for a three-line name at the largest text size), so the taller slab
cannot make the header strobe on a short page; the home screen keeps its 140.
Name limits are unchanged. Two earlier builds were checked on the Fold cover
screen: the first cut a 77-character name after three lines and ran it into the
watermark; the second showed a 98-character name in four lines over a tall
band. This revision is not yet checked on a device.

## Pod details in XPOD (2026-10-18)

The XPOD section on ABOUT now lists what the recipe's coffee block carries
(from an xPod, an import link or a backup), under the pod line: roaster,
origin, country, region, farm, farmer, elevation, process, fermentation,
varietal, type, roast, roast date, decaf, flavour, cupping score, the note and
a link to the product page. A field with no value has no row, and nothing is
added when the block has nothing beyond the pod name. ORIGIN shows only when
there is no country. The link is dropped when it is the recipe page FROM
links to. Notes over 200 characters fold behind SHOW NOTE. Display only: no
storage, backup, card or BLE change. Not yet checked on a device.

## Settings order and machine cards (2026-10-18)

Settings now opens on Machines: one card per saved machine. The card of the
machine in use starts open; the others start closed until tapped. Its summary
line turns red while the link has an error, green with "Connected" while this
phone holds the link, and says "Selected" (formerly "In use") for the machine
this phone uses when it has no link. An open card holds the link status and
Connect (or Use this machine now), the model, a row to the machine's existing
name-and-order sheet, a Details fold with serial, firmware, water, grind size,
mode and the Bluetooth ID, and Forget. While connected the separate
"Connected" row is not drawn, since the header says it. The model choice is
left out once the machine's serial has named its model (see "Machine model
from the serial" below).
Add another machine sits under the cards. With no machine saved, the section
is one plain card with the model choice and Connect.

Brewing follows (Start brewing automatically, Animate the brew chart, Ask how
a brew was, Brew detail storage, Brew history), then Units, Recipe list,
xBloom account and Library. About, What leaves this device and the support
tile moved to the bottom, followed by Labs and card diagnostics. Labs gains a
Machine console row; the console keeps its own acknowledgement gate.

Placement only. No setting, default, backup key or machine-safety rule
changed: Forget and Use this machine now are still refused while a brew owns
the link. Not yet checked on a device: large text, TalkBack/VoiceOver reading
of the expanded state, and the fold animation on a folding phone.

## Switching machines from home, the order word and machine colours (2026-10-18)

With two or more machines saved, the home screen's machine panel opens with a
switcher row (name, model, CONNECTED or SELECTED, and a chevron) that opens
the existing machine picker. Holding the home link glyph opens the same picker
directly. Both go through the picker's existing selection path, so a pick is
refused while a brew, a lost-contact brew or an Easy Mode slot operation owns
the link, and no look-around scan runs then. With one machine a hold does what
a tap does. The glyph carries a hint and a named "Switch machine" action for
screen readers.

"Default" is gone from machine rows. It meant only "first in the connect
order" (tried first when no machine was picked this session and the machine
in use is not heard), and beside "Connected" on another row it read as a
second machine in use. Rows now say "Tried 1st", "Tried 2nd" and so on, and
only with two or more saved. "Make default" is "Try this one first".

Each saved machine has a colour (Green, Blue, Violet, Cyan), chosen in its
sheet under the name and shown as a dot on picker rows, the panel switcher
and the Settings rows. The home link glyph draws in the connected machine's
colour. The first machine keeps the old connected green and new machines take
the next unused colour; nothing changes with one machine saved. Connected or
not is still carried by the glyph's shape, and the label says "Connected to
Home" or "Not connected". The colour is stored in the saved-machine list,
which stays out of backups.

Not yet checked on a device: the hold on the glyph with TalkBack and
VoiceOver, and the four colours on the Fold's cover and inner screens. On
the Settings cards the colour dot sits beside the machine's name in the card
header, the star and order word only with two or more saved.

## The whole app clears the bottom inset (2026-10-18)

Android 15+ draws the app under the navigation bar. With three-button
navigation that is a 48 dp bar the system paints opaque, and several surfaces
sat partly behind it: the brew screen's START BREWING, PAUSE, RESUME and
CANCEL, the editor's BREW, WRITE and SAVE, the last row of the recipe sheet
(DELETE), and the bottom of Settings. Every surface that reaches the bottom of
the display now clears the safe-area inset through one helper,
`hooks/useBottomInset.ts`:

- The brew screen pads its bottom by the inset. On iOS its keyboard offset takes
  it back out, so the rating note sits where it did above the keys.
- The editor's action bar takes the whole inset on Android. iOS keeps its
  5 point sink into the home indicator.
- Every XbrwSheet frame pads by the inset, and its snap point grows by the same
  amount, so the content keeps the room it was tuned for and ends above the bar.
- Settings, About, Licences, Machine and Network end their scroll content at
  least 24 points above the inset. A gesture bar or the home indicator keeps
  the 48 point end they had.
- The brew record, history and compare screens, the library lists, the
  catalogue screens, cloud import and Easy Mode pad their scroll ends and
  pinned bars by the inset, as before. Easy Mode's slot list now does it too
  while a write hides the actions panel.
- While the live brew bar or the rating question is drawn it takes the inset
  itself, so the screens above it get none and no longer show a doubled gap.
- The three-button bar is no longer a light grey scrim over the dark app. A
  config plugin (`plugins/withDarkNavigationBar.js`) sets the app theme's
  `android:enforceNavigationBarContrast` and `android:windowLightNavigationBar`
  to false, so the bar is transparent over the app's black with light buttons.
  Native (theme) change: needs a new build, not an update.

Release checks: on Android with three-button and with gesture navigation, and on
iOS: the brew screen, the editor action bar, the recipe sheet from the library
and the editor, the bottom of Settings, the catalogue's save bar, and the same
screens with the live brew bar showing; the brew rating note with the keyboard
up, on iOS and Android; the navigation bar dark with light buttons on
three-button navigation, with the phone in light and in dark mode, and the
gesture handle still visible.

## Rename sheet opens on the visible name (2026-10-17)

A recipe following its pod used to open the Rename sheet with an empty field.
It now opens on the pod name. Saving that name unchanged keeps the recipe
following its pod; clearing the field still does the same, and only a
different name becomes the recipe's own. A recipe titled only by its Recipe ID
or a placeholder still opens empty. A pod name lookup that lands while the
sheet is open replaces the field only if it has not been edited.
Not yet checked on a device.

## Recipe pictures on by default (2026-10-17, superseded)

The broad default proposal in #225 is replaced by the 2026-10-20 scoped
picture design above. `showRecipeAvatars` remains true for ABOUT only, card
photos default OFF, and shelf previews initialize from a legacy choice once.

## Machine model from the serial, and link wording (2026-10-18)

A saved machine's model is now set from its serial when the serial names one.
The serial in the machine's 40521 info frame starts with xBloom's model code:
`J15` is the Studio (read off two real Studios, and xBloom's catalogue uses
the same code), and `J20` is the Original (xBloom's catalogue code only; no
Original has been read). It is set on connect, through the saved list, so for
the machine in use it lands in `machineModel`, the setting every importer
reads. A serial that names neither leaves the user's choice alone. Settings
stops offering the model choice once the serial and the saved model agree.

The link copy now says only what the phone can know. The machine takes one
phone at a time and, held by another, stops answering just as it does when
off, so a failed connect says "Not found. It may be off, out of range or
connected to another phone." (was "Not in range · <Bluetooth ID>") and the
Connect row says to close XBRW++ or the xBloom app on the other phone. The
machine this phone uses but has no link to is "Selected" (was "In use"). The
Bluetooth ID moved from the status line to the machine's details. With a
machine saved, the "Connected" row is hidden while connected, because the
machine's own row says Connected.

Not yet checked on a device: the model correction on a Studio previously set
to Original, and the wording with a second phone holding the machine.

## Rest and peak freshness (2026-10-18)

Builds on the bag tracker's roast day. A bag with a roast day now says how
fresh it is: resting ("Resting, ready from 23 Oct"), ready, at its peak (within
3 days of the peak day) or past its best ("Past its best, still fine to brew").
The line is in the ABOUT deck's BAG section, and a short REST / READY / PEAK /
PAST badge sits beside the bag badge on list cards and shelf tiles, in the same
row so nothing changes height. Both tracker modes show it.

Each bag stores `restDays`, `peakDay` and `bestUntilDay` (whole days since
roasting, 0 to 540, each checked on its own, same as the roaster feed). The bag
sheet asks for them under REST AND PEAK once a roast day is typed, prefilled by
roast level: Nordic 14/35/52, Light 11/28/42, Medium 7/18/27 (used when no
level is known), Dark 4/10/15, Decaf 5/14/21. When the coffee states a rest and
a peak itself, the sheet shows the roaster's figures instead of asking. A coffee
gets them from a BrewMind link's optional `bean.rest_days`, `bean.peak_day` and
`bean.best_until_day`, or from the roaster catalogue's `roast` block
(`roastAdviceFromFeed`). They are never sent to Beanconqueror.

No notifications: the app has no notification dependency, and adding a native
one was out of scope, so freshness is in-app only.

Release checks: on both platforms, add a bag with a roast day a few days ago
and confirm the resting line and REST badge; change the roast day so it is past
the rest and near the peak and confirm READY and PEAK; open a BrewMind link with
`bean.rest_days` and confirm the sheet shows the roaster's figures; switch the
tracker to Beanconqueror and confirm the line and badge stay.

## Bag tracker and reorder (2026-10-18)

A recipe can carry the bag of coffee it is brewed from: size (160, 250, 320,
480 or 1000 g presets, or any whole grams), an optional roasted-on day and the
buy day. It is added from the ABOUT deck's new BAG section or the recipe menu
("I bought a bag"), and edited, finished or removed from the same sheet.
Bags live in their own `coffee_bags` table, travel in backups under a new
`bags` key (older files simply have none) and are deleted with their recipe.
Brew history is untouched by finishing or removing a bag.

A Labs choice, "Track bags in", decides which app counts the bag, because
Beanconqueror already subtracts every brew it is handed and two counts drift.
It follows the Beanconqueror handoff switch until set.

- XBRW++: grams left are derived at read time from the doses of counted brews
  (`done` and `endedOnMachine`) started since the bag was added or last
  corrected. Cancelled, failed and lost brews cost nothing; hand-logged brews
  carry no dose. The section reads "212 g left, about 11 brews"; under two
  doses it says "Running low" with REORDER (opens the coffee's or recipe's
  https link, hidden without one); under one dose it offers MARK FINISHED.
  List cards and shelf tiles show grams or LOW in the badge corner.
- Beanconqueror: no grams estimate here. Adding a bag opens
  `beanconqueror://ADD_USER_BEAN` with a `BeanProto` carrying name, weight,
  buy and roast dates, optional price and the pod's origin fields. The name is
  the one the brew handoff sends for that recipe, and the brew and record
  screens' bean sheet now offers the bag's name, so brews land on that bean.

The roast day is picked from the platform's own calendar
(`@react-native-community/datetimepicker`, the Expo SDK 57 version): the
Android date dialog, or an inline calendar on iOS. A new bag starts on today
(or the pod's roast day), an edited bag shows its own day or none, days run
from a year back to today, and CLEAR leaves it empty. It is still stored as a
local `YYYY-MM-DD` day. This is a new native module, so it needs a fresh
native build rather than an OTA update.

Release checks: on both platforms, add a bag in each mode; pick a roast day
from the calendar, confirm a future day cannot be chosen, and confirm the
saved day is the one picked late at night; brew and confirm the
count drops by the dose (XBRW++) and that a cancelled brew does not; confirm
Beanconqueror opens its add-bean screen prefilled with the right name, weight
and dates, and that a later brew handed over is linked to that bean; restore a
backup with bags onto a clean install.

## Roaster colour on import (2026-10-19)

An import link may carry `bean.colour` (or `bean.color`), a strict `#RRGGBB`
for a roaster's own colour coding, e.g. by origin. A newly imported recipe takes
the palette accent nearest that colour's hue, so the card stays in the app's
palette and keeps its dark ink at AA. Greys and hues far from every accent fall
back to the usual accent assignment. A recipe already in the library keeps its
accent on re-import. The colour itself is never stored. No card bytes change.
