# 2.2.0 testing checklist

Package acceptance, integration and release qualification are separate.
Record the exact app commit, native build, platform, machine and firmware for
each device result. Software transports do not qualify BLE or NFC hardware.

## Package E: Import, catalogues and saved-roaster shelves

- [ ] On both native platforms, open Import with zero subscriptions, then with
  subscriptions and zero/one/three chosen shortcuts. Verify selection order,
  fourth-choice refusal, All roasters access and no automatic slot filling.
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

The maintainer accepted #247 provisionally on the contributor's report of
machine verification. No maintainer hardware pass is recorded here.
Source #247 is `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`; #246 is
`687c0f7e029abf8b11473e2edfe18492de097d7e`.
The standalone preflight differs from the full cumulative preview, so a preview
result does not qualify this integration or a different built commit.

- [ ] On an already-startable machine, retry without an unnecessary cancel.
- [ ] After a fault, send one cancel and wait for its reply or bounded timeout.
  Record commands and beeps.
- [ ] Repeated CANCEL taps share one cancellation. Cancel during preflight or
  upload sends no later recipe/commit and never restores manual START.
- [ ] A tank-low refusal allows another attempt after refilling without
  spending a dose on the refusal. A low flag alone during a running pour does
  not end a successful brew. Check tap-fed behavior where available.
- [ ] Explicit `0x0F` says "No beans detected"; generic `40517` during grinding
  says grinding stopped. Both offer TRY AGAIN; mini bar and history agree.
- [ ] Mid-brew no-water has no TRY AGAIN; preflight water refusal is retryable.
- [ ] Interrupted uploads cannot later START. Reconnection cannot resume old
  cancellation/upload continuations or automatically resend an upload.
- [ ] A connection replaced during preflight is not disconnected or retried by
  the superseded request. Genuine preflight link failures still get one retry.
- [ ] If either cancel write fails during startup, the app reports an
  unconfirmed stop, finishes the history record once and offers no START or
  retry. Check the machine rather than assuming the stop succeeded.
- [ ] Pause/resume remains intact. State `0x1F` also means armed/loaded and is
  not by itself evidence that a brew is paused or safe to cancel.

## Deferred wrong-recipe investigation

[#251](https://github.com/hessius/XBRW/issues/251) needs a real A-loaded,
reconnect, B-selected capture and fresh state/ack evidence. No conditional-cancel
mitigation is implemented or accepted. Confirm whether cancellation actually
clears the recipe buffer before choosing one.

## Package B: grouped native layout and accessibility

- [ ] Android: duplicate a recipe, open and close every affected sheet, and
  confirm the Fabric host crash is absent on a rebuilt client.
- [ ] Rename a borrowed multiline name untouched, edit it while details arrive,
  and check that saving follows the visible name.
- [ ] Check magenta ON and outlined OFF switches on dark and accent surfaces;
  confirm disabled states and screen-reader labels.
- [ ] Check missing/blank machine model display without claiming detection.
- [ ] Enable card photos: list circles stay bottom-right beside brew evidence;
  graph size, long-name width and uniform card tint do not change.
- [ ] At narrow widths and large text, compact photos yield to metadata,
  actions remain reachable, and profiles never overlap the name or figures.
- [ ] Four pictured recipes sharing one pod URL fill each eligible auto cover.
  Below four usable pictures, including failed loads, the glyph returns.
  Personal/tag shelves retain mixed member accents and photos.
- [ ] Fresh install defaults card photos OFF and shelf previews ON. Restore
  legacy OFF and explicit new preferences; confirm ABOUT is independent.
- [ ] Editor headers remain photo-free with either ABOUT preference.
- [ ] Measure cold/warm photo-heavy shelf opening under #253. Earlier mounting
  is not evidence of cache hits or a guaranteed native performance improvement.

## Package C: grouped native and import checks

- [ ] Rebuild Android at the exact 2.2.0 source. Check gesture and three-button
  navigation, status-bar clearance, dark navigation treatment, keyboard and
  pinned brew controls across the affected routes and sheets.
- [ ] Check iOS note entry and sheet keyboard offsets without extra gaps.
- [ ] Check long names at narrow widths, foldable widths and large system text;
  the editor name stays clear of the profile and its header remains photo-free.
- [ ] XPOD shows available coffee details, omits blanks/duplicate links and
  updates after in-place edits without toggling decks.
- [ ] Import a producer link with a name, image and coffee details, then reimport
  over edited local metadata. Only blanks fill; local names and brews remain.
- [ ] Refuse the existing-recipe database write: show a save error, keep the
  held recipe unchanged and do not navigate or announce success. Retry the same
  import after storage recovers, including the clipboard shortcut.
- [ ] Round-trip backup and BrewMind import/share details. External-app and
  native-device acceptance remain open; software tests are not these results.
