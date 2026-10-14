# Easy Mode slot card composition

## Approval and scope

One focused brainstorming session on 2026-10-14 selected direction A from the
revised browser study: separate slot heading, full-width recipe silhouette,
and a shared Scale/CHANGE footer. The user explicitly required preserving the
card's existing dot-matrix typography assignments.

This is a presentation-only follow-up to beta-feedback PR #219. Do not add
these changes to that already-reviewed PR or request another review round.
Implementation starts from freshly fetched, pinned `origin/develop` after the
required Scale ON changes are integrated. This document does not authorize
integration, hardware writes, native builds or deployment.

The design worktree is owned by this session:

- Branch: `docs/easy-mode-card-layout-20261014`
- Path: `/Users/jesperhessius/Dev/XBRW-easy-mode-layout-20261014`
- Base: `2cd68f58b0389ac0be98899fc952c8877fcf0747`

Browser studies are session artifacts, not application source. Their system
monospace font and illustrative SVG shapes are not implementation references
for typography or profile arithmetic.

## Card hierarchy

Keep the existing recipe-coloured slabs, corner treatment and A/B/C order.
Within an assigned ordinary card:

1. A/B/C at the leading edge, NOT WRITTEN at the trailing edge only when needed.
2. Recipe name on its own wrapping line.
3. Coffee dose/ratio/grind, or the existing tea figures, on their own line.
4. A full-width recipe profile.
5. Scale label/switch at the leading edge and CHANGE at the trailing edge of
   one shared footer.

Remove the small absolutely positioned profile watermark. The profile occupies
the width of the slab, rather than an inset or small right-aligned area. Use
the existing `PourProfile`, its silhouette/fill conventions and recipe-snapshot
pours. Do not implement the illustrative stepped SVG from the study, replace
the profile's equal-pour axis with real time, or imply this is a measured brew
trace.

The profile has its own shallow, approximately 45 pt-high band with no extra
background, border or inset card. It extends across the slab between identity
and controls. Keep it non-interactive, decorative and hidden from assistive
technology. Clip decorative drawing at the slab's bounds, not names or
controls.

Identity and controls keep the slab's horizontal padding. The dark CHANGE
button remains compact and at least 44 pt high. The profile supplies separation
between identity and controls; do not add a competing heavy divider.

No fixed total card height. Names and figures wrap with available width and
supported text scaling. The footer wraps into reachable rows at narrow widths
or larger text instead of squeezing the switch/button or overlapping them.
Cards remain in the existing scrollable screen with the existing pinned write
action. All three assignments stay in the list; no tabs or collapsed slots.

## Typography is unchanged

Preserve the current `EasyModeSlotCard` split exactly:

| Content | Renderer |
| --- | --- |
| Slot letter A/B/C | `DotMatrixText`, current 24 pt bold styling |
| NOT WRITTEN | `DotMatrixText`, current 11 pt bold styling |
| Dose, ratio, grind and tea figures | `DotMatrixText`, current 11 pt bold styling |
| SCALE ON / SCALE OFF | `DotMatrixText`, current 11 pt bold styling |
| CHANGE / CHOOSE RECIPE | `DotMatrixText`, current 11 pt bold styling |
| RECIPE UPDATED / REMOVED FROM LIBRARY | `DotMatrixText`, current 11 pt bold styling |
| Recipe name | Existing ordinary `Text`/Inter, current 16 pt semibold styling |
| Update action and validation/error prose | Existing ordinary `Text`/button rendering |

Do not substitute system monospace text for Doto chrome. Do not make the recipe
name dot-matrix. Keep centralized palette/onAccent colours and existing
Tamagui components; no new fonts or native UI dependency.

## Status is exception-only

Remove LAST WRITTEN from matching cards. Retain NOT WRITTEN when the populated
draft differs in encoded slot content from the corresponding snapshot in the
last successfully written set, or there is no successful app write on record.
Scale changes still count as a pending difference. Reverting to the recorded
content clears the indicator.

No badge means "matches the last successful set written by XBRW++", not "read
back from the machine". Keep the single set-level last-written timestamp in
the footer and the existing help explanation that changes made elsewhere
cannot be read. Do not add replacement success copy to every card.

Do not change the status predicate, durable receipt semantics, changed-slot
count, write availability or ability to rewrite an unchanged valid set.
Interrupted transactions continue using the separate recovery presentation.

## Other states and controls

Empty slots remain neutral: slot letter and CHOOSE RECIPE, without profile,
scale control or a fake written-state claim.

Edited library content retains the explicit RECIPE UPDATED / USE UPDATED
RECIPE section below the normal card footer, with its validation reason where
applicable. Never silently replace a snapshot. Removed library recipes retain
their valid snapshot and REMOVED FROM LIBRARY notice. Recipe rename alone
continues not to require writing.

Coffee and ordinary tea assignments both follow this composition. Tea retains
its existing steep/water/temperature/pause figures and grinder-off behavior,
not coffee ratio copy. Registered fixed probes retain their existing special
presentation and exact candidate restrictions; they do not gain an editable
scale control.

Keep the existing Scale checked state, slot-specific accessible label/hint,
change/update focus refs and operation locks. Scale continues changing only the
phone draft until WRITE TO MACHINE is pressed. Recipe replacement and explicit
update preserve its state. No encoding, database, recovery or hook behavior
changes are in this layout task.

## Architecture and verification

Keep layout in `components/EasyModeSlotCard.tsx`; reuse `PourProfile` and
existing snapshot/scale props. Do not move stateful logic into the route or add
another source of card status. The only intentional behavior shift is the
removal of the redundant matching-card label.

Update directly affected component assertions for exception-only status and
profile layout. Preserve Scale ON/OFF interaction, locks, focus restoration,
edited/removed notices, recipe updates and write/recovery tests on both Jest
platforms.

Native visual checks must cover populated and empty slots, long wrapping
names, tea, pending scale-only changes, edited/removed recipes, larger text,
and VoiceOver/TalkBack reachability. Verify the full-width profile band and
shared footer on narrow and ordinary phone widths. Jest can establish rendered
content and props/contracts; it cannot establish native visual fit.

The approved layout does not qualify automatic tare or Bluetooth hardware.
Those physical-device gates remain attached to PR #219.
