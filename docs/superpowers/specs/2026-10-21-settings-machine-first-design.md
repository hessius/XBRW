# Machine-first Settings for 2.2.0

## Status and scope

The user approved the complete design on 2026-10-21 after comparing browser
mockups, then explicitly authorized finishing the spec, planning and implementing
without another approval pause.

This is the agreed adaptation of [#231](https://github.com/hessius/XBRW/pull/231),
not approval to merge that PR unchanged.

- Task base: `origin/develop` at
  `b66ec311f51e4994a2189298c52705f63d1453e7`, including accepted Packages A-D.
- Proposal reviewed: `feat/settings-tidy` at
  `437d1d36def383a43b78ab480b72eb2e56d6246a`.
- Scope: Settings layout, saved-machine presentation and support placement.
- No new settings, migrations, dependencies, native configuration or BLE
  behaviour. The broader colour proposal in #243 is not approved by this work.

## Purpose

Open Settings on useful machine controls rather than navigation and support
tiles. Keep one scrolling preferences page, make occasional machine management
easy to find, and keep support prominent without consuming a large scroll block.

## Page structure

The app-owned Settings header stays outside the scroll view. The scrolling
content follows this order:

| Position | Group | Contents |
| --- | --- | --- |
| 1 | Machines | Saved-machine cards and the existing Add machine flow |
| 2 | Brewing | Auto-start, chart animation, brew judgement prompt and detail storage |
| 3 | Units | Existing temperature preference |
| 4 | Recipe list | All accepted list, shelf and picture preferences |
| 5 | xBloom account | Existing authentication and account import actions |
| 6 | Library | Existing library information, maintenance, backup and restore |
| 7 | Gated tools | Existing Labs and card diagnostic content, under their existing gates |
| 8 | About | About XBRW++ and version, as the final row |

Move auto-start out of the machine component into the existing Brewing group;
do not duplicate either the setting or the group.

Remove the separate Settings shortcuts for Brew history and network disclosure.
History remains accessible through its existing non-Settings entry. Network
disclosure remains accessible from About through "What leaves this device".
Neither route nor its content is deleted. Removing the history shortcut does
not remove history preferences, backup records or storage controls.

All existing preference values, defaults, account behaviour, backup coverage,
destructive confirmations and diagnostic unlock gestures remain unchanged.

## Header support and About footer

Place a labelled "Buy me a coffee" action at the right of the fixed header.
Remove the full support tile from the Settings scroll content. Keep the existing
support link within About.

Use the existing support destination, `https://buymeacoffee.com/hsus`, and shared
external-link handling. Announce that it opens in the browser. Support remains
optional: no receipt, entitlement, tracking or persisted support flag.

The action uses the existing brand fill and readable foreground from the palette,
with a minimum 44-point touch target. Its prominence comes from its persistent
placement and labelled shape, not a new app-wide colour treatment.

At ordinary widths, title and action share a header row. At narrow widths or
large accessibility text sizes, the header grows and the action can occupy a
second, right-aligned row. Keep the full visible label and text scaling; do not
solve collisions by shrinking text, clipping, or switching to an icon alone.
Preserve the Back action, heading semantics and safe-area spacing.

About and version move to the final scrolling row, after any visible tools.
The row opens the existing About screen. It clears the bottom safe area and
overlays; it is not a second fixed footer.

## Saved-machine cards

Use the approved simplified expandable-card option, not #231's fuller inline
management form or a sheet-only interaction.

### Summary and expansion

Keep saved-machine order and existing naming, model, colour and order conventions.
The summary distinguishes Selected, Connecting and Connected accurately.
"Selected" must not imply a live connection, and an unavailable machine must not
be described as definitely held by another phone.

Cards start collapsed. The selected machine starts expanded if it already has a
connection error when Settings opens. Expansion belongs to the individual
machine, not its list position, and is transient rather than a saved preference.

When there are no saved machines, retain model selection needed for matching
imports and the existing Add/connection onboarding. Moving model management
into cards must not strand users who import recipes without pairing a machine.

### Expanded card

Expose the applicable Connect/Use action, Manage machine, and a separately
collapsed read-only Details fold. Connection status, errors and relevant Android
permission recovery belong with the affected machine, outside the Details fold.

Connect/Use calls the accepted connection and selection operations; it does not
implement another scan or link owner. A failed connection remains an explicit
failure with the existing recovery guidance. Show the Android app-settings
recovery only when the existing permission state makes it relevant.

Details retain useful identity and diagnostic fields: serial, reported model,
Bluetooth identifier, firmware, water, grind and mode where available. Live
readings must be tied to the actual connected machine's identity, not merely the
currently selected card. A disconnected or different saved machine can show its
own saved identity, but never another machine's live readings or invented zeros.
Preserve the accepted nonblank model-reading fallback.

### Management boundary

Manage machine opens the existing management sheet. Name, colour, order, model
and Forget belong there, not as duplicate inline card controls. Keep the
existing conditional colour choice and serial-derived model rules.

Retain the sheet's existing operations, including its Use action where currently
offered; the card is the quick-access connection path. Keep name commit behaviour,
default/order changes, the confirmation before forgetting and existing failure
notifications.

Preserve the Package D change blockers. Switching, adding or forgetting must not
bypass a live brew lock. A blocked action exposes its disabled state and reason,
rather than looking tappable and silently returning. Read-only expansion and
Details do not need a machine change.

## Component and state boundaries

- `app/settings.tsx` orders the groups, wires existing actions and continues to
  own the sheet hosts outside the scrolling content.
- `ScreenHeader` provides a reusable optional action area. Settings supplies the
  support action; existing header consumers without an action remain unchanged.
- `MachineSection` presents the machine list and onboarding. A module-scoped
  card component handles presentation and transient folds.
- Existing machine and saved-machine hooks remain authoritative for connection,
  selection, readings and persistence. No new domain or transport state machine.
- Reuse `MachineDetailSheet`, the picker, Forget confirmation and `XbrwSheet`.
  Preserve stable native hosts, scrolling/keyboard behaviour, and screen-reader
  coverage while any screen-owned or global sheet is open.

Continue using the existing Tamagui components, palette and motion tokens.
This is not a styling-system migration. Update directly affected copy/comments
that still describe About at the top or auto-start inside Machine.

## Acceptance and verification

Both iOS and Android component coverage must exercise:

- Approved group order, one copy of each setting, About/version last, and no
  separate history/disclosure shortcuts or full support tile in Settings.
- The support action's destination and browser announcement, existing About
  navigation, and continued access to history and network disclosure elsewhere.
- Zero, one and multiple saved machines; summary state; independent expansion;
  selected-error initial expansion; collapsed Details; correct action targets.
- Correct ownership of live readings when selected and connected identities
  differ, after selection changes, and when disconnected or readings are absent.
- Explicit connection failure and Android recovery, accessible brew-locked
  controls, management operations and confirmed forgetting.
- Existing settings persistence, diagnostic gates, sheet accessibility and the
  accepted A-D behaviours touched by the rearrangement.

Visually inspect 320-point and ordinary 390-point widths, default and 2x text
scaling, long machine names, expanded cards and open sheets. In particular,
verify header reflow without overlap or clipped labels and that bottom rows
remain reachable.

Use the repository's existing targeted checks and required CI gates for the
eventual implementation. Browser sketches and scripted transports do not
qualify physical BLE behaviour; retain a separate physical-device checklist for
connection, switching and live readings.

## Integration boundary

Create an implementation plan against the pinned task base and recheck the live
#231 head before incorporating contributor changes. Preserve accepted Packages
A-D. Do not merge the cumulative preview wholesale.

The user's subsequent authorization covers implementation, pushing a focused PR
against develop, one Copilot review round on that PR, fixing findings and green
CI. Count any automatic review toward that one round. Do not request another
review on the original #231.

Stop ready to merge: merging, production actions and destructive worktree cleanup
are not authorized. #231 remains open until the appropriate integration is
actually merged. The deferred wrong-recipe investigation #251 and photo-loading
follow-up #253 remain separate.
