# 2.2.0 testing checklist

Package acceptance is separate from merging and release qualification.
Record the exact app commit, native build, platform, machine and firmware with
each result. Leave a box open until its result is captured.

## Package E: Import, catalogues and saved-roaster shelves

- [ ] On both native platforms, open Import with zero subscriptions, then with
  subscriptions and zero/one/three chosen shortcuts. Verify selection order,
  fourth-choice refusal, All roasters access and no automatic slot filling.
  With none, recover a declined offer through Settings → Library → Roaster feeds.
- [ ] Check narrow widths, large system text, sheet scrolling, native Paste
  consent and keyboard remaining closed on a plain open. Source choices close
  Import before navigating and disappear during lookup/error/found states.
- [ ] Follow a feed and verify no unsaved coffees appear in home, search or
  empty-library states. Browse through Import and return with accessibility
  focus restored. The xBloom catalogue credits xBloom and the community.
- [ ] Type an existing import, cancel or replace it, then explicitly open it.
  Only the explicit open may save staged changes. Fail storage and retry:
  the held recipe, local metadata and author fingerprint remain unchanged on
  failure. An arrival within the editor push guard must neither save nor leave
  a sheet covering Home.
- [ ] Exercise newer-author choices, local edits and unchanged-author
  fingerprints. Check feed offers on return and cancellation, replacement,
  failed lookup and failed feed without losing a valid imported recipe.
  Edit and save a catalogue Brew now recipe, then reimport its unchanged author:
  it must keep the edit without claiming there is a newer author version.
- [ ] Save catalogue recipes with coffee-, import- and feed-level roaster
  metadata; check precedence and fill-only-blank existing metadata. Copy,
  backup/restore and unsubscribe without losing saved roaster identity.
- [ ] Verify roaster shelves at two/three members, exactly/over 80%, applied
  zero-member passthrough, Unicode/case variants and hidden-shelf restoration.
  The shelf count, opened recipes and art must identify the same saved members.
- [ ] Check 0/1/2/3/4 photos, a pictured member beyond the first three, repeated
  URLs on different saved recipes, failed images and photos disabled.
  Roaster marks stay 44 pt; no single photo expands to fill the preview.
  Stock auto shelves still need four successful photos.
- [ ] Leave catalogue status visible across a minute and background/foreground
  transition. Confirm age labels advance and no timer remains after unmount.

Software regressions do not satisfy these native presentation checks. The
existing client/runtime compatibility gap still applies. #253 remains the
photo-performance follow-up and #261 the non-blocking adoption follow-up.

## SDK 57 patch and runtime follow-up

- [ ] Rebuild the native client from the final accepted commit before device
  acceptance. Expo 57.0.31, Router 57.0.29 and Sharing 57.0.24 replace earlier
  patch versions; Metro reload does not update their native code.
- [ ] Record the platform-specific fingerprint with the native artifact and
  verify its runtime is not the earlier `appVersion` identifier `2.2.0`.
  Keep native build, release and deployment approvals separate. No OTA package,
  deployment or hardware pass is introduced by changing the runtime policy.

## Package D follow-up: Settings (#231)

- [ ] Check the header at 320/390-point widths and default/2x text: the full
  support label remains readable, wraps when needed and opens the same browser
  destination. Back and Settings remain reachable without overlap.
- [ ] With zero, one and several saved machines, verify onboarding/model
  selection, collapsed cards, independent folds and the error-on-entry card.
  Opening Settings must not produce a handshake beep.
- [ ] Expand each machine and its Details. Live readings and Connected belong
  only to the actual linked device, including while another one is selected.
  Disconnected cards show saved identity, not stale readings or invented zeros.
  Check blank reported-model fallback and long names/readouts with large text.
- [ ] Connect/Use targets that exact saved machine. Refuse it or switch it off:
  do not announce success for a different machine. Check Android permission
  recovery and visible disabled reasons during connection and a live brew.
  Include HOME selected with WORK still linked: Connect must actually reach
  HOME, not merely announce it. Reconnecting an already linked selection must
  not add a handshake.
- [ ] Manage machine still renames, colours, reorders and sets eligible models.
  Forget asks first; switching, adding and forgetting respect live brew locks.
  Open/close sheets with keyboard and screen reader on both platforms.
- [ ] Confirm one Brewing group with auto-start, Units before Recipe list, all
  accepted picture/account/library preferences, gated tools and About/version
  last. History works from home and network disclosure from About.
- [ ] Recheck bottom insets and sheet accessibility, including the global brew
  judgement sheet. Back up/restore preferences without changing their values.

Implementation evidence: the combined affected suites pass on both Jest
platforms. At the UI-only checkpoint `2ada7e7a`, an isolated harness rendered
the actual header, support action and
long-name card on iPhone 17 Pro / iOS 26.4 with Expo Go 57.0.9. Headers at
320/390 points reflowed without overlap at native font scales 1 and 2.14.
This is component-layout evidence, not a full-app, Android-native or physical
BLE pass. The acceptance boxes above remain open for those broader checks;
the separate wrong-recipe issue #251 is not closed by this work.

## Package D: multiple machines

- [ ] Migrate an existing single pairing without losing its identity or model.
  Save a second machine, rename/reorder/colour it and confirm forgetting.
  Backups must not transfer phone-specific machine identifiers.
- [ ] With both machines nearby, automatic connect prefers the selected one,
  then list order. A manual choice during discovery must remain selected.
  Reconnect a lost-contact brew only to its original machine.
- [ ] With only the other machine nearby, BREW refuses without any recipe
  upload or mode change. Check stale Bluetooth IDs and serials learned late
  during preflight, including the explicit PRO retry path. Repeat after an
  earlier no-beans failure: a mismatched or missing info response must not
  cause warning-clearing CANCEL or home commands on the other machine.
- [ ] A refused selection releases the app's live-run ownership without a
  cancellation command or a synthetic brew record. A later real brew works.
- [ ] Open the picker before its first survey completes, drop the connection,
  and start/finish a brew while it remains open. Connected labels, lock state,
  screen-reader disabled state and rescan availability must follow reality.
- [ ] The editor's selected-machine chip stays visible while scrolling all
  decks, with long machine names and large text. Its sheet hides covered
  controls on both platforms; Settings retains its fixed native sheet hosts.
- [ ] Record commands and beeps on each available firmware: connect uses one
  handshake, a fresh ordinary brew does not repeat it, and missing/stale/low
  vitals refresh before the brew. Refill a previously low tank and retry.
  Recheck Package A's cancellation and connection-replacement cases.
- [ ] Verify Studio serial detection on both observed firmware variants.
  Original `J20` serial/model detection is catalogue-derived, not hardware
  verified; confirm it on a real Original before calling it device-qualified.

#231's separately approved Settings adaptation has its own checklist above;
the original Package D machine/hardware gates remain open.

## Package A: brew correctness

On 2026-10-20 the maintainer accepted #247 provisionally based on the
contributor's report of machine verification. This is reported external evidence,
not a device pass performed by this session. The maintainer currently has no
machine available for further tests.

The reviewed #247 head is `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`;
#246 is `687c0f7e029abf8b11473e2edfe18492de097d7e`. These rebased standalone
heads differ from the original cumulative preview. In particular, #247's
vitals/handshake path is not the combined preview's path. Name the actual tested
commit rather than treating a preview pass as proof for another head.

- [ ] On an already-startable machine, retry without an unnecessary cancel.
- [ ] After a fault that needs clearing, send one cancel and wait for the reply
  or the bounded timeout before continuing. Record commands as well as beeps.
- [ ] Repeated CANCEL taps share one cancellation. Cancellation during preflight
  or upload sends no later recipe/commit and never restores manual START.
- [ ] After a tank-low refusal, filling the tank allows a new attempt without
  spending a dose on the refusal. A low flag during a running pour alone must
  not end a successful brew. Check tap-fed behavior where hardware is available.
- [ ] Explicit no-beans state `0x0F` says "No beans detected". Generic idle
  `40517` during grinding says grinding stopped and suggests checking the hopper.
  Both offer TRY AGAIN; the mini bar and history keep the distinction.
- [ ] A no-water failure after starting offers no TRY AGAIN. A preflight
  water refusal remains retryable.
- [ ] Cancelled or interrupted manual uploads cannot later START. Reconnection
  cannot resume an old cancellation/upload or automatically resend a started upload.
- [ ] Pause/resume remains intact: `0x1F` alone must not be treated as proof
  that a loaded recipe can safely be cancelled.

The wrong-recipe A/B report is a separate deferred investigation in
[#251](https://github.com/hessius/XBRW/issues/251), not a completed Package A fix.
No mitigation is implemented or accepted. Hardware must establish the
failure mechanism, state/ack freshness and whether cancellation clears the
loaded recipe before any conditional-cancel design is chosen.

## Package B: small UI and recipe pictures

Draft evaluation PR #252 is not a contributor merge or release qualification.
Its starting-head CI at `b63602eb` was green before this redesign; record final
implementation-head CI separately. The approved 2026-10-20 picture design
replaces the preview treatment from #225/#235, not #234's later header photo
layout. Package B's functional fixes and #229's switches remain distinct from
the unaccepted broader #243 colours.

Software coverage on both Jest platforms includes scoped default/upgrade and
real-screen legacy restore/export, bounded real-SQL member selection with UUID
ties and unreadable rows, duplicate/fifth-picture exclusion, actual membership
counts, retained auto glyph inversion, image failures/new URLs, editor-header
absence and distinct ABOUT images. Native-event tests cover exact compact fit,
matching visible/intrinsic child gaps, stale badge/size/font-scale readings,
normal 390 pt real-pour list cards with a photo, busy-card omissions and separate
Ready to brew controls. These are software checks, not native geometry proof.

Local gates passed serially at implementation commit `07ab330b` (subsequent
changes are documentation only): typecheck; lint with zero errors and the
existing 35 warnings; both Jest projects with 854 suites and 17,332 tests
passing (2 suites / 26 tests skipped); Expo Doctor, 21/21 checks.
The first full run exposed a read-only machine-settings test counting the new
constructor migration write. Its assertion now compares writes immediately
before and after the read; no machine transport or brewing logic changed.
Final PR-head CI remains a separate, pending parent-owned gate.

The first Copilot round on #252 reviewed `af80b88e`. Both reported catalogue
defects were reproduced and corrected: replacement photo URLs are retried after
a failure, and a bag's fixed coffee name agrees with later brew handoffs.
Focused follow-up checks passed 162 tests across both platforms, typecheck and
lint (zero errors, 35 existing warnings). Final-head CI is still required.
The maintainer subsequently requested a second round on `540476dd`.
Its three findings were reproduced on both platforms before correction:
automatic-cover photo failures now restore the glyph, paused subscriptions
without a cache no longer claim to be loading, and the regenerated licence
inventory includes the date picker. Personal/tag cover fallbacks are unchanged.
No third round is requested. Photo-loading performance remains open in #253.

The first post-review CI run exposed a machine-picker test pressing a mounted
row before its sheet accepted input. Controlled timers reproduced the missed
press on both platforms. The test now retries until the existing choose handler
receives the selection, asserting exactly one call; production code is unchanged.
Both full home-screen suites passed locally (368 tests, 4 skipped).

Red evidence is not uniformly behavioral: the initial settings, cover and pure
layout runs failed on missing new modules, and header-absence coverage followed
the header removal. Compact/list/Ready placement and the shared metadata-spacer
regression did observe behavioral failures before their fixes. Do not treat the
passing suite or plan checkboxes as proof of a stricter chronology.

The explicitly approved picture follow-up supersedes the earlier list rail and
automatic-glyph-only acceptance rules. Its five eligible stock-shelf tests first
failed behaviorally on both platforms (10 expected failures: no photos drawn).
The initial focused checks covered the original distinct-photo threshold,
blank/portrait rejection, real SQLite membership and deterministic selection bounds,
query-independent revision updates, unchanged personal/tag selection, inversion/
OFF fallback, 20 pt list metadata placement, original 200x56 graph/corner geometry,
long names, exact row-fit boundaries, crowded/large-text omission, URL retry,
Settings copy and preserved preference/migration/backup behavior.
That focused iOS/Android run passed 36 suites / 1,260 tests; typecheck passed and
repository lint has zero errors (35 existing warnings). These are targeted local
checks, not another full-suite/CI claim or another Copilot review round.
Native visual checks below remain unverified.

The 2026-10-21 follow-up corrects two mistaken design interpretations: no
full-width bottom shade, and four photographed recipes qualify even when all
four share one image URL. Regressions reproduce the six-pod shelf with four
copies through real SQLite cloning, all five stock shelf renderers, and the
unchanged list graph. Compact photos now mount before metadata measurement,
invisible and outside row flow, then reveal the same image only if it fits.
This removes the request/cache-lookup waterfall, not the fit checks. Native
cache hits and cold/warm rendering times still require device observation.

- [ ] **#233 Android Fabric gate:** duplicate a recipe on a real Android native
  build; confirm the card and all controls render and no flattened-view failure
  occurs. A Jest renderer cannot qualify Fabric.
- [ ] On iOS and Android, test narrow widths (including Fold cover/inner where
  available), long names and notes, default and accessibility Dynamic Type.
  Keep the name-line budget, figures and tile height; omit decoration first.
- [ ] With all badge combinations (evidence, bag, freshness, star, beverage),
  Easy Mode slots, tea, editing/actions and selection mode, verify no metadata
  wraps because of an admitted compact photo and no badge/action disappears.
- [ ] Check #236's compact profile shrink/hide behavior after text changes;
  the profile must never cross names or figures.
- [ ] For list photos, verify the 20 pt bottom-right circle sits beside brew
  evidence without wrapping metadata or moving/resizing the 200x56 graph.
  Decorative graph overlap is now allowed. Long names/notes retain their width
  and photos; crowded evidence, editing controls and large text omit decoration
  first. Confirm the background stays uniform with and without photos; there
  must be no full-width shaded bottom strip.
- [ ] Confirm no arrival reflow, aggressive crop, blank image hole or error
  toast with slow loading, offline first view, failure and a changed image URL.
  Shelf cells keep their accents/geometry; a lone photo in a larger shelf must
  not enlarge to a single-recipe cover.
- [ ] Exercise independent card, shelf and ABOUT preferences, upgrading a legacy
  OFF install and restoring old/new backups over previously configured choices.
  Only XBLOOM RECIPES, STARRED, XBLOOM PODS, MOST BREWED and RECENTLY ADDED may
  replace glyphs with four photographed actual members. Verify four copies
  sharing a photo fill all four cells, while three pictured members, blanks
  and OFF retain glyph/inversion; every other
  automatic/author shelf stays a glyph. Personal/tag mixed covers are unchanged.
- [ ] Compare first opening, repeated opening and reopening offline after a
  successful photo load. Native HTTP/decoded caches are conditional on headers,
  size and eviction, not an app-managed permanent image store. Distinguish
  request/decode time from metadata layout before calling a delay a cache miss.
- [ ] Expand/collapse the editor with short and long names, rename, HELP and
  menu. There must be no header image, viewing action or picture-only space.
  ABOUT keeps separate coffee/pod and author circles.
- [ ] In Ready to brew, verify open, BREW (at least 44 pt), dismiss, reorder
  and next-coffee controls with large text and no safe photo space.
- [ ] With VoiceOver and TalkBack, no decorative photo or hidden measurement
  copy becomes a focus stop or repeats a label. Existing accessible card
  actions, slot information and independent Ready controls stay reachable.

No native/device picture checks were performed in this session. Keep all
Package A BLE, physical NFC and external-app release gates open; no software
picture result waives them.

## Package C: shared layout and recipe identity

The maintainer accepted #232, #234, #230 and #223's recommended scope on
2026-10-20, including correcting the silently ignored import-save failure.
#235's original picture placements are superseded by the approved design and
the later shelf/list refinements. No contributor PR was merged by this decision.

Both-platform regressions reproduce the home screen swallowing a thrown save,
then verify an accessible storage error without navigation or a success toast.
Hook regressions cover unchanged held data and import baselines, retry after
failure, automatic author refresh, fill-only-blank enrichment, USE THE ROASTER'S
LATEST and KEEP MINE. Author content and missing metadata are saved once
together, not as two partially successful writes.

- [ ] On a rebuilt Android 2.2.0 client, check three-button and gesture
  navigation in light and dark system modes. CANCEL/START, editor actions,
  sheet endings and the last settings control must stay clear of system bars.
  Check the brew title/close control against the status bar too.
- [ ] Repeat navigation and keyboard checks with the live brew bar, the rating
  bar and neither visible. Insets must not be applied twice; note entry must
  stay above the keyboard on iOS and Android.
- [ ] Check long names in editor, brew and catalogue headers at narrow widths,
  including 257-260 pt where available, and large text. Expansion/collapse,
  rename and back/menu actions must remain reachable, with no header photo.
- [ ] In ABOUT, check absent and populated coffee metadata, long wrapping
  values, duplicate names/product links and folded notes. A late pod-name
  update must remove a newly duplicated coffee name without reopening.
- [ ] Import a producer-named recipe, then repeat after editing the stored
  name, coffee fields and tags. Existing values must win; an empty recipe
  name must still follow the pod. Missing metadata may fill, and existing
  pod artwork must beat an incoming coffee photo.

These native, layout and user-workflow checks remain open. The SQLite-failure
regressions use injected failures; do not damage a device database to test them.
Final combined software evidence is recorded on #252 separately from these
manual gates.

## Later packages

- [ ] After a catalogue photo fails, refresh that coffee with a different image
  URL and confirm the replacement loads without recreating its search row.
- [ ] In Beanconqueror mode, add a catalogue coffee to a shelf with a bag.
  Confirm the bean name is read-only when coffee metadata fixes it, then send
  a subsequent brew and verify it matches that bag in the external app.

Add focused checks when each package is reviewed. Keep the existing BLE, NFC,
both-platform and external-app release gates; this checklist does not waive them.

## A-C integration review follow-ups

- [ ] During a held brew preflight, select a replacement link, including one
  still connecting. The old attempt must not disconnect or retry it.
- [ ] Interrupt startup and fail either cancellation write. START must stay
  withdrawn, the local record must finish once as `cancelUnconfirmed`, and the
  UI must say to check the machine rather than claim it stopped or offer retry.
- [ ] A late failed cancellation must not finish a replacement run; an observed
  active pour must remain observed when its cancellation fails.

These are open device checks, not proof that cancellation clears recipe memory
or a mitigation for deferred #251. The integrated A-C software gates and review
status are recorded in #249.
