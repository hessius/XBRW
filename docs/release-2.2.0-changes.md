# 2.2.0 change ledger

Accepted development changes for 2.2.0 are integrated into `develop` in packages.
Integration is not release qualification. The cumulative evaluation branch and
draft #252 also contain proposals that have not been accepted; they must not be
merged wholesale. Issue #249 records source heads, decisions and integration.
The shipped 2.1.0 ledger remains unchanged.

## Package F follow-up: dose shortcuts and proportional bypass

The approved lightweight #239 adaptation is implemented on
`feat/2.2.0-dose-shortcuts-20261023`, originally based on pinned develop
`8f2638dfa2e75928ff447fbbd0ee03ba14986886`, with accepted F merged from
`e0d29d7cc2e635abef02a64cca386c21f1d1e661`. Focused PR #267 tracks its
review, CI and integration into develop; #249 records the closeout state.
Source #239 is superseded by this adaptation once #267 is merged, after
rechecking the original source head for newer commits.

The cumulative preview #252 is not equivalent to the accepted tree after this
adaptation: it retains the older SAVE AS implementation, photo/editor and
provenance changes, extra appearance roles, link-button assets and native
configuration differences. Keep it separate until those differences are
explicitly reconciled; this PR is not a wholesale preview promotion.

Coffee Quick Edit offers compact 15 g, 18 g, 20 g and saved-dose shortcuts,
deduplicated and restricted to valid whole doses. They use the same one-brew
adjustment as the stepper, never save a recipe, and are absent for tea.
Both home and editor panels scroll within their existing available height;
the home sheet stays at 72% and each host retains its sole BREW action.

Changing a coffee dose also scales enabled bypass water from its original
dose/volume pair, rounds once and limits the result to 1-500 ml. A limit is
reported explicitly; invalid starting values retain the supplied water and
show a correction problem. Quick Edit blocks brewing that invalid adjustment
and explains actual bypass and total cup water. Ratio-only changes, tea and
disabled bypass do not trigger scaling; bypass temperature stays unchanged.

Normal editor dose changes use the same arithmetic without changing its
existing stage-volume policy. The anchor survives saves and metadata autosave
so repeated taps do not accumulate rounding error. Explicit bypass-volume
edits, bypass toggles, cup-type changes and recipe replacement establish a new
baseline. A temperature-only edit does not. The notice appears beside the
dose control on BREW and on the STAGES bypass rung, including when that rung
or hints are closed. Normal SAVE still permits incomplete
recipes under its existing policy; card and brew validation are unchanged.

No new setting, dependency, SAVE AS workflow, serialized adjustment field,
Recipe hydration/import/backup migration or NFC layout is introduced. Existing
bag selection and accepted-run accounting remain separate from dose shortcuts.
Software qualification is recorded in the implementation plan. Native 320 pt
and large-text reachability, keyboard behavior, VoiceOver/TalkBack traversal
and an actual machine's adjusted bypass remain manual gates. No native build
or hardware qualification is claimed.

## Package F: Optional coffee bag beta experiment

Adapted from #238, #241 and #242. Off by default in Labs. Physical bags can
be shared by recipes, and a recipe can remember one of several bags or No bag.
Remaining coffee and freshness windows are estimates, not measurements or
guarantees. Ready to brew suggests one explicit recipe and bag.

This adaptation uses independent many-to-many bag records and a durable
accepted-run accounting ledger instead of inferring identity or consumption
from a recipe name or the remaining history. Actual intended dose and bag
identity freeze at acceptance. Confirmed preflight refusal spends nothing;
observed pouring spends the dose even if the run is cancelled or fails.
Unknown consumption requires a quantity check. History deletion never refunds.

Disabling preserves data and stops new attribution. A brew already accepted
keeps its bag. Beanconqueror mode does not claim synchronised local inventory.
Backups preserve inventory without enabling it on another device. Historical
handoff uses the bag captured for that brew, not today's selection. The
explicit add-bean action opens a form and never claims it created a bean.

Focused PR #266 is merged into develop at
`e0d29d7cc2e635abef02a64cca386c21f1d1e661`; sources #238, #241 and #242 are
closed as superseded after their exact heads were checked for new commits.
The cumulative preview includes reviewed F at
`dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2`. Integration is not release
qualification. The implementation plan records software evidence.
Focused PR #266 received its single Copilot review. The four findings are
addressed: visible and spoken roast dates distinguish bag choices; attributed
handoffs never acquire a later recipe's coffee; a known rest period works
without peak advice; and catalogue roast level supplies the freshness fallback.
Each source proposal already used its one automated Copilot review round.
Its final head `c92976b81d5f95473398473c56fda7c79b745d13` passed every gate in
[CI40029366415](https://github.com/hessius/XBRW/actions/runs/40029366415)
before merge; post-merge develop
[CI40031895608](https://github.com/hessius/XBRW/actions/runs/40031895608)
is also green. History-only backups retain their independent restore action.

Local software qualification passed: typecheck; lint with zero errors and
32 warnings; both Jest projects with 20,550 passed tests, 26 skipped tests,
918 passed suites, two skipped suites and both snapshots passing; Expo Doctor
21/21. The appearance matrix covers all eight combinations. Real-SQLite
checks cover the accepted live owner and the inventory/backup lifecycle.
Canonical recipe/card and legacy handoff compatibility, and existing image
captures remain covered. Animation/act warnings are recorded, not hidden.
Those full-suite figures precede review fixes. Review-fix qualification passed
316 affected tests across both platforms, typecheck and lint with the same
32 warnings and no errors. The new regressions failed before the fixes.
This is software evidence, not physical-device qualification.

Manual native, accessibility, interruption and Beanconqueror qualification
remain pending until separately recorded. Exercise enable/disable/re-enable;
small-screen large text and keyboard; VoiceOver/TalkBack sheet coverage;
same-coffee bags and shared recipes; uncertain/empty estimates and corrections;
interruption after beans are spent; termination/reopen; and actual add-bean
and historic-brew handoff. Confirm that saving never opens another app.

Fresh native clients are required for datetimepicker 9.1.0 and the already
accepted native appearance dependencies. No build is authorised here; Metro
cannot qualify the native change. Existing BLE/NFC physical-device gates
remain in force, though no card write is needed to qualify the bag model.
Final inclusion requires an explicit retain, revise or remove decision after
beta feedback. The #239 adaptation above remains separate from accepted F.

## Package G: appearance and recipe palettes

The approved combined #257/#243 adaptation is implemented on
`feat/2.2.0-appearance-20261022`, based on
`98f3ae5255dfc691bc44d7c5ed356e47830f3df9`. Focused PR #264 is merged into
develop at `8f2638dfa2e75928ff447fbbd0ee03ba14986886`, but is not
release-qualified. The existing #243 source review
round is already spent; do not request another for that source.

Settings offers Original, Light, Blue and Magenta themes independently of
Original/Themed recipe colours. Original/Original remains the default.
Canonical recipe, history, shelf and machine identities stay unchanged;
presentation resolves accessible foregrounds and composited chart roles.
Generic selections are neutral, actual primary actions use their own role,
and branded launch art stays fixed. Live and historical PNG captures freeze
one appearance without changing JSON/handoff data or remounting a live brew.
Legacy React Native colour formats use the pure official
`@react-native/normalize-colors` 0.83.2 parser.

Automatic native appearance and `expo-navigation-bar` 57.0.3 replace the fixed
Android navigation plugin. Version 2.2.0 and fingerprint runtime policy remain
unchanged, but the native fingerprint changes: fresh iOS/Android development
clients are required; Metro reload cannot qualify this configuration.
Client builds, all-eight-combination native visuals and both actual PNG
targets, real-device brew/NFC/Android writes and external handoff gates remain
pending and unauthorized in this local qualification phase. Android button
and gesture navigation both need checking; the SDK 57 Android 15 emulator
style bug means emulator-only evidence is insufficient. The intended iOS
device is the iPhone 17 Pro named `iPhone14`, never the iPhone 13 mini.

The implementation plan records local gate results and the outstanding
manual matrix. Source #243 is closed as superseded after checking its exact
head for new commits. The cumulative preview includes the accepted adaptation;
draft #252 remains evaluation-only, not a wholesale promotion to develop.

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
Settings keeps feed management reachable with no subscriptions, including
re-enabling declined offers. Catalogue **Brew now** records the original author
baseline before editor changes so an unchanged author is not called an update.

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

## Proposed: Easy Mode slots keep their library link

Branch `fix/easy-mode-slot-link`, not yet accepted into `develop`.

A slot links to its recipe by uuid. Catalogue, roaster and link recipes open
unsaved, and each fetch mints a new uuid, so assigning one from the editor's
Assign to Easy Mode left a slot that later read REMOVED FROM LIBRARY. The
editor now saves such a recipe first (or uses the library's copy of the same
share link when it brews exactly the same, the `planReimport` "same" test) and
the slot snapshots the library uuid. A toast says "Saved to your library." A
recipe a slot cannot hold is not saved; the existing error explains why.

Existing slots reconnect for display: when a slot's uuid is not in the library,
Easy Mode looks for the library copy of the same share link (preferring one
that brews the same), then a link-less recipe with the same name and brew.
Home slot markers still match by uuid only; USE UPDATED RECIPE relinks a slot.

Easy Mode help now says only the first write needs all three recipes, since the
phone keeps every written slot and resends the other two. With empty slots the
WRITE reason names them ("Choose a recipe for slots B and C before writing").

## Proposed: WRITE asks Easy Mode slot or NFC card

Branch `feat/write-chooser`, stacked on `fix/easy-mode-slot-link`, not yet
accepted into `develop`. With a machine remembered, the editor's WRITE opens a
small WRITE TO sheet: Easy Mode slot (the existing Assign to Easy Mode, which
saves an unsaved recipe first) or NFC card (the existing card write, bypass
question included). With no machine WRITE writes the card straight away as
before. WRITE's spoken name with a machine is "Write to Easy Mode or card".
The card limits still gate WRITE; Assign to Easy Mode in the more menu is
unchanged.

## Proposed: Easy Mode slot from WRITE places and writes in one tap

Branch `feat/easy-mode-replace-write`, stacked on `feat/write-chooser`, not yet
accepted into `develop`. WRITE, Easy Mode slot no longer opens Easy Mode with a
"Choose a slot for" panel above the cards, and no longer drops the recipe into
the first empty slot. The screen names the recipe ("PLACING", then its name)
and each slot card says REPLACE, or ADD when the slot is empty. Choosing one
assigns the recipe (still through the library, as before) and writes all three
slots straight away, the other two from their remembered drafts. With no
connection it connects first. When the write cannot start (for example the
first write still needs all three slots, or the machine does not connect) the
normal screen comes back with the reason, starting "<recipe> is in slot A.".
After the write is confirmed the success screen shows, then the app goes back
to the editor with "Written. <recipe> is in slot A.". Opening Easy Mode any
other way keeps CHANGE and WRITE TO MACHINE.
