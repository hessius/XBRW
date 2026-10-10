# Easy Mode recipe slabs and writing ceremony

Approved design direction: 2026-10-10.
Base: `fix/easy-mode-recovery` at `cf9f7aef`.

## Purpose and scope

Make Easy Mode feel like the recipe editor, not the machine console. Someone
should immediately understand their three shortcuts, what has not been written,
what a write is doing and how to recover when it stops.

This covers the Easy Mode screen, its recipe picker, writing and recovery
surfaces, departure reminder, machine-panel entry and home slot-marker order.
It also includes the approved explicit attempt to finish an uncertain partial
write while the machine remains on its saving screen.

It does not add tea encoding, change NFC bytes, add backup fields, implement
firmware abort, introduce background writing or redesign ordinary brewing.
Existing coffee encoding and native frame-size limits remain authoritative.
Tea is an unsupported app capability, not a claimed machine limitation.

This spec supersedes the screen, warning placement and uncertain-recovery
restrictions in `2026-10-09-easy-mode-slots-design.md`. Its identity, persistence,
snapshot validation, exclusion and receipt requirements remain in force.
The approved browser studies are visual references, not pixel or copy contracts.

## Chosen direction

Three recipe-coloured slabs keep the complete replacement set visible. A tabbed
editor would hide two of the three recipes; a compact shortcut list would not
provide enough recipe identity or fit the editor's visual language.

Use the existing ScreenHeader, Tamagui, XbrwSheet, recipe accents, pour profiles,
dot typography and NFC writer's visual vocabulary. No native dependency or
navigation-system replacement. Colours and motion come from their existing
central modules.

### Recipe slabs

Each slab contains a dot-matrix A, B or C, the snapshot's recipe name, its
recipe-coloured pour silhouette, compact dose/ratio/grind identity and a visible
CHANGE control. Grinder off is shown as OFF, not the stale grind-size value.
Avoid duplicated previous names, statistics, timestamps or warning paragraphs.

An empty slot has a neutral surface, its letter and CHOOSE RECIPE. An empty
phone draft does not mean the physical machine slot is empty. Explain that
initial machine contents cannot be read in help, rather than repeating it three
times. All three slots must be deliberately assigned before writing.

Keep existing explicit snapshot semantics:

- Assignments persist immediately on the phone.
- A library edit never silently changes a slot snapshot. Show RECIPE UPDATED
  with an explicit USE UPDATED RECIPE action when its brewing bytes differ.
  Validate the update before replacing the snapshot.
- A deleted library recipe retains its valid snapshot, with REMOVED FROM LIBRARY
  and CHANGE available. Deletion alone does not invalidate prepared bytes.
- Renaming does not make identical machine bytes unwritten.

For a populated slot, show NOT WRITTEN when its prepared bytes differ from the
corresponding last-written snapshot, or there is no last-written set. Otherwise
show LAST WRITTEN. This is an app record, not live machine read-back. During an
incomplete transaction, recovery replaces this normal status presentation so
old history cannot imply the partial replacement is complete.

The screen shows a compact changed-slot count based on those same byte
comparisons. Returning to the last-written bytes clears NOT WRITTEN. Changing
the source recipe without changing its encoded bytes does not require a write.

### Recipe picker and contextual entry

Use a searchable XbrwSheet with recipe-accent rows, pour profiles and accessible
names. Read the whole library, not the active home search or shelf result.
Unsupported or invalid recipes have a concise reason and cannot be assigned;
do not silently alter them to make them eligible.

Keep context entry from a recipe: fill the first empty slot, or ask which of
A/B/C to replace when all are occupied. Never silently replace an occupied slot.
A recipe may occupy several slots. Successful selection persists immediately
and closes the picker.

### Action area and ordinary states

Use a compact pinned action area, visually related to the editor action bar.
The main action is WRITE TO MACHINE. The essential effect stays beside it:

> Writes A, B and C. Switches to EASY.

The last-written time appears once, with help explaining:

> This is the last set written by XBRW++. Changes made elsewhere cannot be read.

Do not say synced, current on machine or verified by read-back. Keep WRITE
available for an unchanged valid set, since external changes are undetectable.
Missing assignments, no connection, another machine operation and conflicting
identity each produce one specific availability reason, not stacked warnings.
Do not create a journal for a preflight refusal.

Help owns protocol limitations and longer explanations. Any applicable custom
overflow-protection limitation must remain visible before writing: stored slots
do not run the app's automatic pause protection. Never imply that it is encoded
in the machine recipe.

## Writing ceremony

Writing presents a focused overlay above the editor, borrowing NfcOverlay's
dimmed stage, DotBloom and dot typography. BLE does not inherit the iOS NFC
system-sheet geometry. Recipe colour identifies the active slot; ordinary
writing is not amber or red.

Show WRITING YOUR SLOTS, A/B/C steps and the active snapshot's name. Mark a slot
received only after its receipt has been durably recorded. Pending slots are
quiet; the current slot is active. Do not display a made-up percentage.

Keep this instruction visible:

> Keep the app open and stay near your machine.

After all three receipts, show SAVING until fresh completion evidence arrives.
Only the completed database transaction permits SLOTS WRITTEN and three
completed letters. Briefly show success, then return to the recipe slabs.
Motion honours reduced motion; status remains understandable without animation.

Assignment controls and navigation out of the screen are blocked while a
native write/receipt/completion attempt is active. Do not show an inert CANCEL
button or imply that navigating away aborts firmware. Backgrounding, loss and
timeouts end the attempt explicitly, retain the journal and show recovery when
the screen returns. Foregrounding never automatically retries.

## Interrupted writes and deliberate recovery

Replace warning-heavy footers with one focused interruption panel: a short
heading, one reason, A/B/C received/unconfirmed/pending summary, RETRY WRITE and
CANCEL THIS WRITE. Use amber for interruption and restrained red for an actual
refusal or validation/storage failure. Do not render internal protocol jargon.
Map copy and severity together: identity and internal consistency failures are
also red, with a concise explanation rather than raw transport or database text.
Connection loss and background interruption retain distinct, actionable reasons.

Example heading: Writing stopped at B.
Example connection reason: The connection was lost before B was confirmed.
Preserve definite refusal versus missing confirmation in the underlying state.
Your recipes are kept and the machine may still be showing its saving animation.
Do not instruct someone to wait for that animation to disappear before finishing
a partial set; completion of the remaining slots may be what ends it.

RETRY asks which screen the machine actually shows:

1. **Still saving:** explicitly attempt to finish the same frozen set from the
   first slot without a durably recorded receipt. A known refused B sends B/C.
   An uncertain B deliberately resends B/C, not A and not a newly edited draft.
   Explain briefly that the slot may already have arrived and this attempts to
   finish the same set. Never perform this replay automatically.
2. **Back to normal:** explicit confirmation authorises a full immutable A/B/C
   retry. Keep existing state, identity and exclusive-owner checks. If the
   observed state contradicts the physical display, reconnect explicitly rather
   than silently overriding it.

An uncertain retry is a user-authorised recovery attempt, not proof that the
previous transmission was absent or that duplicate delivery is harmless.
Keep the durable received boundary; do not erase uncertainty merely to pass the
current writer guard. Extend the writer/lease contract deliberately so it can
persist the retry boundary and preserve the same journal frames.

When all three receipts were recorded but final completion was lost, there is
no first unconfirmed slot. Do not invent one or replay C speculatively. An
explicit still-saving recovery observes a fresh completion event with a bounded
wait; otherwise retain the unresolved journal. Full A/B/C retry remains
available once the machine is back to normal. This is a separate hardware case
from an unconfirmed B.

Every attempt still requires accepted receipts for the attempted slots and
fresh final-save evidence before promoting last-written snapshots. Native send
completion, the user confirming a screen or idle alone cannot prove success.
Code-only replies cannot distinguish a delayed earlier ACK from the current
slot's ACK; explicit retry does not solve that protocol limitation.

CANCEL THIS WRITE asks for confirmation that the machine is back to normal
and no longer saving. It clears the phone's pending-write record, not the
machine's contents. It sends no firmware abort. Keep assignments as drafts,
conservatively invalidate last-written history when contents may have changed
and clear the durable journal before releasing the brew reservation.
Do not permit cancellation during saving, a brew/fault, background operation,
mismatched identity or an unresolved native write.

Storage failures remain explicit errors. Do not claim cancellation, recovery
or writing succeeded if persistence failed. Relaunch retains the interrupted
state and its immutable set without replay.

## Departure reminder

Phone drafts are not discarded on departure. When no attempt or unresolved
journal is active and populated drafts differ from last-written bytes, intercept
back, swipe, hardware back and other route departure using the editor's
navigation-guard pattern.

The sheet says Not on the machine yet, then:

> Your changes are kept here. Write them when you want to use them on your machine.

Offer WRITE TO MACHINE when available, LEAVE FOR NOW and Stay here. Offline,
explain that writing needs a connection; LEAVE FOR NOW remains usable.
LEAVE FOR NOW resumes the original navigation action once, without another
prompt. WRITE cancels that navigation and starts the normal writing ceremony.
There is no discard action or warning that persisted assignments will be lost.
An empty untouched setup does not trigger a reminder.

An unresolved journal instead remains visibly interrupted; leaving it after an
attempt has stopped preserves recovery and the machine-operation reservation.
Do not offer the ordinary departure WRITE against a partial set.

## Entry and home markers

Make the machine-panel entry a visibly bounded button with dot A/B/C, EASY MODE
and a chevron. Its accessibility label describes opening Easy Mode slots, not
just the letters. Keep existing navigation and availability behavior.

On list cards and shelf tiles, slot letters precede the favourite star in the
trailing badge cluster. No incomplete-write label on home. Keep the shared
typed marker and spoken draft/last-written/edited explanation; do not add
per-card database reads or claim a physical-machine assignment.

## Architecture, layout and accessibility

Keep `SlotDatabase` authoritative for drafts, snapshots and journal boundaries;
`slotModel` owns byte-based status derivation; the shared slot hook owns operation
state and explicit actions. `Machine` and its installed slot port own identity,
serial, foreground, pacing, native-operation exclusion and completion evidence.
Presentational components consume that state rather than reimplement transport.

`EasyModeSlots` accepts the hook's optional `attempt` and an
`onDismissSuccess` callback (wire it to `resetAttempt`), plus the current
`deviceId` and optional `serial` for identity-bound presentation. Its `recipes`
prop is the full supplied library. Legacy callers may omit `attempt`: `running`
still presents activity, but can never manufacture success. Retry confirmation
calls `onRecover(false)` for **Still saving**, including the three-receipt
observe-only case, and `onRecover(true)` for **Back to normal**. Cancellation
calls `onCancel` only after the physical normal-screen confirmation.
The route continues to own departure handling and navigation exclusion.

Extract focused slab/ceremony/recovery presentation only where it keeps
EasyModeSlots understandable. Components are declared at module scope. Reuse
existing typography, profiles, sheets and animation primitives, not a parallel
design system or redundant state store.

The normal recipe area scrolls under the compact bar. At large text, allow
intrinsic heights and a scrollable action region instead of clipping content.
Names wrap; labels and controls remain legible. Slabs retain all three slots
without requiring all three to fit on one physical screen.

The writing overlay and every open sheet hide underlying content from
accessibility on both platforms. Announce meaningful step, saving, failure and
completion changes, not animation ticks. Colour and motion are never the only
status indication. Preserve focus on dismissal and make all recovery actions
reachable at large text sizes.
Picker and help dismissal return accessibility focus to their originating
CHANGE or HELP control; closing or keeping a recovery confirmation returns it
to RETRY or CANCEL. A completed write or cancellation returns focus to the
surviving WRITE control, only after the covering presentation is dismissed.

## Acceptance and release qualification

Software coverage must establish byte-based NOT WRITTEN and count behavior,
explicit snapshot update/removal, whole-library selection, persistent drafts,
all-navigation departure handling, offline availability, overlay isolation,
real receipt/SAVING/success transitions and slot-before-star ordering.

Use the real SQLite test helper for persistence and recovery. Cover refusal,
uncertain-slot manual replay, immutable frames, relaunch, lost final completion,
pending native exclusion, failed durable mutation and cancellation releasing
ordinary brew ownership. Run relevant tests on both Jest platforms plus the
repository's typecheck and lint commands. Scripted transport tests do not prove
firmware replay behavior.

Before release, use a real machine to qualify an interrupted B with the saving
animation still active, both definite refusal and unknown delivery; repeated
manual retry; missing final completion; native/link loss; and cancellation only
after normal operation returns. Verify all three stored recipes and subsequent
ordinary brewing, not just the disappearance of the saving animation.

Manual uncertain-slot replay is approved for implementation and controlled
hardware qualification, not yet proven safe to ship. If firmware does not
reliably finish the immutable set, revise that recovery path before release;
do not mask failure or weaken completion evidence. Existing extended-stage
slot and tea investigation gates remain separate and open.

Check the actual iOS and Android layout, large text, reduced motion and screen
reader behavior. No screenshot mockup or passing unit test closes those gates.
