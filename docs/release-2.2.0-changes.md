# 2.2.0 change ledger

Accepted development changes for 2.2.0 are integrated into `develop` in packages.
Integration is not release qualification. The cumulative evaluation branch and
draft #252 also contain proposals that have not been accepted; they must not be
merged wholesale. Issue #249 records source heads, decisions and integration.
The shipped 2.1.0 ledger remains unchanged.

## Package E: roasters in Import and saved shelves

The focused adaptation uses these reviewed source heads:
#237 `27535f8b72fd30febe51d07f7bd2cbd20bf63980`,
#240 `25672dfab641116521be313aa650ab788f869994` and
#245 `d306e9c22aa54bf803ec0fb07fc1cea5d3055395`.
This branch is a merge candidate, not accepted development or a release.

Home, search and empty-library states remain saved-only. Independent roaster
catalogues are reached through Import. Customers choose up to three **Show in
Import** shortcuts in selection order, with no automatic filling; **All
roasters** remains available whenever subscriptions exist. Plain Import opening
keeps the keyboard closed and Paste stays beside the field with native consent.
The separate **xBloom catalogue** names both xBloom and community contributions.

Typed results stage updates until explicitly opened. Existing-recipe writes
complete before mutating the held recipe; refused navigation and failed storage
do not replace it or record a successful author fingerprint. Local edits and
nonblank metadata survive ordinary re-import. New catalogue recipes prefer the
coffee's declared roaster, then the underlying import's roaster, then the feed's
declared name. Feed offers are scoped to their successful import and discarded
on cancellation, replacement or failure. Relative catalogue ages refresh each
minute and when the app returns to the foreground.

Saved `coffee.roaster` metadata forms automatic shelves independently of
subscriptions. Matching trims and normalizes Unicode and case, without guessing
aliases or treating an account author as a roaster. Existing library visibility
rules apply: three members, at most 80% of the whole library and applied-shelf
passthrough. JSON remains authoritative and the SQL projection rebuilds for
older saved recipes. Copy and backup preserve membership.

Roaster marks use mixed four-cell photos and member accents, or an initial when
photos are disabled, absent or all fail. The existing stock-auto requirement for
four successful photos is unchanged. Photo performance remains #253; this is
not a cache or timing fix. Adoption and publishing feedback are tracked without
new analytics in #261. No home discovery strip, tracking, dependency or native
configuration change is included. Physical/native UI checks remain separate.

## Package D follow-up: machine-first Settings

Source #231 is preserved at
`437d1d36def383a43b78ab480b72eb2e56d6246a`, with the maintainer-approved
adaptation rather than its original complete layout.

Settings opens on collapsed saved-machine cards. Expand for a targeted
Connect/Use action, Manage machine and read-only Details. Naming, colour,
order, model and confirmed forgetting remain in the existing management sheet.
The selected card starts open if it already has an error on entry. Connection
and readings follow the actual linked device, not a selected device that has
not connected. Blank reported models retain the accepted fallback. Opening
Settings still sends no handshake.

The single review round found a selected/linked mismatch in the existing
selection helper. Connect now skips reconnecting only if that exact selected
machine is actually linked. A different live link is disconnected before the
targeted connection; the already-linked case still sends no extra handshake.
Real-machine/fake-transport regressions cover the helper and the Settings
button. This is not confirmation of the separate reported mechanism in #251.

App-wide auto-start joins the existing Brewing group, followed by Units,
Recipe list, account, Library and gated tools. About/version is the final row.
The labelled support action stays in the fixed header and can wrap onto its
own row with large text. History remains in the home header, and disclosure
remains under About; their redundant Settings shortcuts are removed.

The existing palette, preferences, persistence, sheet hosts, model rules and
Package D brew locks are retained. The Settings adaptation itself makes no BLE
protocol, native configuration or dependency change. The separately authorized
patch/runtime maintenance below is included in the same focused PR.
Implementation and software acceptance are not
physical-device qualification, and this task does not close #251 or #253.

## SDK 57 patch and native-runtime maintenance

The maintainer separately approved the three patch updates required by the live
Expo Doctor check: Expo 57.0.31, Router 57.0.29 and Sharing 57.0.24. The SDK stays
at 57 and the app remains 2.2.0. No OTA package is added or enabled.

The runtime policy changes from `appVersion` to `fingerprint`, so native inputs
determine compatibility rather than reusing an earlier 2.2.0 preview identifier.
A fresh native build and device qualification are required before distributing
this native change. Existing preview clients are not qualified by Metro reload
or the component-layout harness. No build, deployment, channel change or release
promotion is part of this maintenance.

## Package D: saved machines and selection

Source heads are preserved in merge history:

- #227: `2f24dc375ff58a9df9330cc1c7cfe20669d3379d`.
- #228: `5f4121d6cac5106b3fb264edf031056852e85991`.

Saved machines carry their own name, model, serial and optional colour.
Existing pairing settings migrate without a write; device identifiers stay
out of backups. List order controls automatic selection, while an explicit
selection lasts for the app session. A lost-contact brew reconnects only to
its own machine. Switching models changes matching imports, not saved recipes
or their non-convertible grind values.

The home panel, accessible hold action and persistent editor chip open one
picker. Settings supports naming, colour, ordering, adding and confirmed
forgetting. The picker tracks live connection and brew changes, keeps an
already-connected machine visible before scanning completes, and announces
blocked actions as disabled. An older scan cannot replace a newer manual
selection.

Brew identity is checked again after fresh vitals, before warning-clearing
commands and before PRO retry commands. Missing vitals never trigger warning
cleanup on an unverified link. Selection refusals retire only the unsent app-owned attempt, without
sending CANCEL or inventing a history record. Package A's cancellation,
partial-upload and replacement-connection protections remain in place.

The source stack also includes hardware-informed handshake/vitals changes:
connect waits for the pushed info frame, and fresh connect-time vitals avoid
another handshake before every brew. Missing, stale or tank-low readings
refresh once; opening Settings does not itself trigger a beep. These changes
need qualification on the exact integrated build.

Studio serial prefixes have hardware evidence; the Original `J20` mapping
comes from catalogue model codes and remains unverified on an Original.
#231 was excluded from the original D integration. Its separately approved
Settings adaptation is described above.

## Package A: brew correctness

Source heads:

- #247: `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`.
- #246: `687c0f7e029abf8b11473e2edfe18492de097d7e`.

Cancellation is shared while in flight, waits for the machine's state reply
with a bounded timeout, and does not repeat when the machine is already
startable. Cancellation or connection replacement interrupts pending upload
and retry continuations. A failed upload is not automatically sent again after
relinking, because a lost connection does not prove the recipe was not received.
The tank's pushed low-water flag can refuse a new brew before spending a dose.

Package integration review also exposed two ownership/error paths. A preflight
superseded by a replacement connection is explicitly non-retryable, without
disabling the existing retry for a genuine dropped preflight link. If either
cancellation write fails during startup, START stays withdrawn and the run
finishes as `cancelUnconfirmed`, not a successful cancellation. The screen and
mini bar ask the user to check the machine and offer no retry. A replacement
connection or an observed running brew keeps its own phase.

Explicit no-beans state `0x0F` remains confirmed `noBeans`. A generic idle
event `40517` during grinding is recorded as `grindingStopped` and suggests
checking the hopper without claiming that the machine reported an empty
hopper. The brew screen, mini bar and history retain this distinction.
A mid-brew no-water fault still offers no retry button; preflight tank-low
refusals remain retryable.

The maintainer accepted #247 provisionally on the contributor's report of
hardware verification. This is not a new maintainer device pass.
[Release testing](release-2.2.0-testing.md) remains open.

The wrong-recipe A/B report is an unconfirmed, separate investigation in
[#251](https://github.com/hessius/XBRW/issues/251). These changes do not establish
its cause or prove that cancellation clears a loaded recipe.

## Package B: small UI fixes and scoped pictures

Source heads are preserved in merge history:

- #233: `338f49015f0e0abe75b121db1089b8a0ae401906`.
- #224: `4221f25b15cd62b27adf783db55477b307a04a20`.
- #236: `dc7f4f8ae599c995b65022df1e7e8ffafb68ead9`.
- #229: `7eb2963bf324eeca04d8a82ab1fee22b7666edf4`.
- #226: `e1a6c83104df2fb3cf1fad9cf1f1661570229b47`.
- #225: `4016340794068bae6cf94d4f01e37c8dcf2c99e9`.
- #235: `adb548dbd8b20aa5163abfcea684108132ab85d4`.

Android sheet hosts keep fixed native parents. Rename preserves an untouched
borrowed pod name, including multiline names, and does not overwrite typing
when pod details arrive. Compact profiles yield to text. Machine settings use
an honest model fallback. ON switches use magenta; this does not accept #243's
broader colour proposal.

The original #225/#235 defaults and placements are replaced, not accepted
unchanged. Card photos default OFF and use small circular marks. List photos
are 20pt bottom-right circles beside brew evidence, with lighter card-tint
backing, no full-width bottom wash, and unchanged graph/title geometry. Compact
photos yield when metadata does not fit and begin loading before measurement.
The editor header has no photo; ABOUT retains its independent picture choice.

Personal/tag shelf covers default ON, mix actual members' photos and accents,
and respect a stored legacy OFF choice. Eligible auto shelves need four
photographed recipe UUIDs, even if they share a URL: xBloom recipes, Starred,
xBloom pods, Most brewed and Recently added. Fewer usable photos, including
after image failures, restore the glyph. Other automatic and author shelves
retain glyphs. Cover queries remain bounded.

The approved picture work is ported from preview checkpoints `071e3568`,
`4ff7cd26`, `f6d5dab7`, `2799b826`, `d06f4a78` and the cover-only part of
`c2030d31`. Unaccepted Ready to brew, bags, roaster subscriptions, multiple-machine
features and the broader colour proposal are not included. Package C's hero
name-fitting work remains separate.

The package's single integration review also corrected the library privacy
disclosure: it names all three photo preferences and explicitly covers shelf
requests even with card photos OFF.

Photo performance remains open in #253; no new cache policy, native timing
measurement or hardware acceptance is claimed.

## Package C: layout, identity and import enrichment

Source heads are preserved in merge history:

- #232: `e39db687627a2e55b7bba6c5a1d494da740d0a07`.
- #234: `2e40b738ca04226ceabdd060a49ee8f8411887ed`.
- #230: `7783cffcb8a8efe13c9decd84ea151b1bd575d7c`.
- #223: `02df5e02fc9d670bf3d9a7db21f7c50ff0139056`.

Android screens, sheets and pinned brew controls own their bottom insets, and
the full-screen brew page clears the status bar. iOS keyboard offsets preserve
the note position. The native navigation-bar plugin keeps Android's dark
navigation treatment. Package B's fixed Fabric hosts remain in place.

Long editor names wrap in a bounded, fitted layout clear of the watermark;
other recipe headers can use a second line. The editor header remains
photo-free. Optional coffee details live in XPOD on ABOUT, omit blanks and
duplicate links/names, and stay fresh after in-place edits under React Compiler.

Import links may carry a fitted recipe name and coffee/producer decoration.
New imports use it; existing recipes receive only missing metadata, preserving
their name, brewing choices and nonblank details. The approved preview
correction `540476dd` is adapted to this standalone import path: stage one
copy, persist once before changing the held object, and surface a storage error
without opening the editor or retaining unsaved enrichment. Reimport can retry.
Unaccepted author-refresh/subscription behavior is not introduced.

Package C moved `expo.version` to 2.2.0 under the then-current `appVersion`
runtime policy. The separately approved patch/runtime maintenance above replaces
that policy. Package C itself did not change schemes, EAS profiles, channels,
SDK or dependency manifests. This is not a native build,
submission, deployment or hardware pass.
