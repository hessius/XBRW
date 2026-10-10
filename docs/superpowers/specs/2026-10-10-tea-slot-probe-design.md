# Bounded tea slot hardware probe

Approved first trial: 2026-10-10. Work in `fix/easy-mode-recovery`.

## Physical-result amendment and next candidate

The first candidate saved, but the user observed no tea steep-counter overview
and no tea drain cycle: water was dispensed, a minute elapsed and the machine
finished. The user confirmed restoring the original set. This rejects
`0x02` plus the tea blob as sufficient to select tea on the tested firmware.

The user explicitly approved one next candidate on 2026-10-10: change only
A's flag from `0x02` to `0x04`, with identical tea blob, parameters and B/C.
The ID is `tea-slot-0x04-one-steep-v1`. The first candidate's ID and exact
validation remain readable. A public official recipe reports API `cupType: 4`
for TEA separately from its grinder-off flag, but that is not proof that the
slot byte has the same meaning. The trial still tests that mapping.

Allow this next trial only after confirmed restoration of the first. Archive
the complete first experiment, originals, evidence and observation atomically
before preparing the second, rather than resetting or overwriting it. Retained
history remains copyable and validated on relaunch. No third candidate,
arbitrary flag choice or automatic execution is authorised. This amendment
supersedes the original one-trial-only restriction solely for this named
second candidate; all other acquisition and recovery boundaries still apply.

## Question and bound

Does an existing tea blob inside `11510 [slot, 0x02, blob]` select tea behavior
without another command or flag? This is a hypothesis, not known tea support.
Test exactly one candidate. No flag sweep, mode commands, automatic brewing,
background work or automatic retry.

Alternative approaches were source recovery and candidate flag exploration.
The user chose a bounded hardware probe. Begin with unchanged known slot flags
and the existing tea timing encoder; if this fails, stop and reassess evidence
rather than treating failure as permission for more candidates.

## Trial

Require a complete validated original A/B/C set, matching connected machine and
serial, normal machine state and no pending write/brew/native operation.
Prefer the app's last-written set; if absent, require a complete draft set.
Clearly say this restores the app-recorded set, not unknowable changes made
through the official app.

Preserve that set durably before preparing or sending the candidate. A is a
fixed one-steep probe: 60 ml, 70 degrees C, 60 seconds, grinder off, no agitation
or bypass. The recipe's valid nominal dose is 5 g, but physical testing uses no
leaves. B/C retain the original snapshots and exact encoded recipes. All slots
use flags 0x02. Use `encodeTeaBlob`, not card bytes or coffee timing.

The user has the Omni Tea Brewer. After confirmed storage, inspect A on the
machine before any execution. Check grinder off and displayed values. Start A
manually only, with the Tea Brewer, no leaves, empty receiving vessel, adequate
water and the user present. Follow the device's physical safety instructions.
Do not touch or move the hot brewer during the trial.

Observe whether water is held for approximately sixty seconds and subsequently
drained as tea, instead of executing an ordinary coffee pour. Record actual
display and observed times; acceptance of three writes alone does not prove
tea behavior. A nominally tea-looking display alone is also insufficient.

Stop after refusal, incomplete/ambiguous saving or unexpected execution. Do not
start a brew while the slot transaction is unresolved. Existing explicit
recovery may finish the immutable candidate set; restoration cannot bypass it.
After the observation, explicitly restore the full preserved original set
through the same writer and confirm final saving. No automatic restoration.

## Tooling and persistence

Expose a development-only TEA SLOT PROBE entry from Easy Mode, with fixed
parameters and visible WRITE PROBE and RESTORE ORIGINAL SET actions. Reuse the
existing focused writing ceremony, exclusive transport, receipt journal and
recovery rather than creating a raw-send console route.

Normal tea picker assignment remains blocked. Do not broaden snapshot
validation to arbitrary tea recipes. A probe snapshot must be explicitly
identified and strictly validated against the exact fixed recipe and candidate
bytes. Persisted probe snapshots/journals must remain readable after relaunch,
including when the development entry is unavailable, so normal recovery and
restoration never become stranded behind a build flag.

Bind retained originals to device ID and reported serial. Keep them until
explicit restoration succeeds; repeated probe presses never overwrite originals
with the probe. This is one trial per retained machine record: after restoration,
no second candidate may be prepared. Show that the original set was restored and
the trial evidence remains available to copy. A future new trial requires a
separately approved reset policy, not an archive or implicit replacement.
Keep original drafts distinct from restored machine snapshots.
Candidate/restore preparation must be atomic and errors explicit. No backup or
Recipe serialization changes; experiment metadata lives in the slot domain.
Do not invent success or clear the pending journal when persistence fails.

Keep one candidate identifier in logs, with machine/firmware readings when
available, exact prepared frames, dispatch/receipt/save evidence and separate
user-entered observation. Existing notification diagnostics may supply radio
evidence. Evidence survives relaunch and can be copied locally. Never infer a
physical hold/drain observation from a send promise.

### Task 1 API guarantees

`teaProbeStatus(record)` derives completion from durable outcome evidence.
`pending-candidate` and `pending-restore` identify the journal still to resolve;
`candidate-written` requires confirmed candidate save completion. Cancellation
before dispatch, after partial receipts, or after all receipts without final
save confirmation yields `candidate-unconfirmed`, never success. A cancelled
restore is also unconfirmed, not restored or still candidate-written.
`restored` requires confirmed restoration. All prior evidence is retained.

`writeTeaSlotProbe` requests `SlotAcquireOptions.requireKnownNormal: true` on
the same shared port/session used by ordinary writes. `Machine` requires a
non-null `STARTABLE` state (IDLE, READY or COMPLETE), checking before original/
journal preparation and again under the lease before first dispatch. A lazy
preparation callback to `writePreparedSlots` keeps that ordering without a
second acquisition. Ordinary writes, recovery and restoration do not opt into
this fresh-probe gate and retain their existing behavior.

The future trial panel calls `useEasyModeSlots().writeTeaProbe(options)` and
`.restoreTeaOriginal(options)`, which use the hook's existing operation lock,
identity binding, progress and explicit error reporting. It must not prepare a
probe and then call the ordinary draft `.write()`, or bypass the shared port.
`formatTeaProbeEvidence` remains the local copy API after restoration.

## Acceptance and next decision

Software tests use real SQLite and the existing scripted port to establish
fixed bytes/flags, original preservation, no arbitrary tea assignment, identity
binding, pending-operation exclusion, recovery after relaunch and restoration
only after the journal is resolved. UI tests cover explicit actions, persistence
errors and no automatic brew. Both Jest platforms, typecheck and lint apply.

The deliverable is trial tooling, not enabled production tea support. A real
successful single-steep trial establishes only this candidate on this machine
and firmware. Multi-steep execution, mixed slots and reliable restoration need
separate qualification before enabling general tea assignment. A failed trial
ends this candidate's execution and prompts review of the recorded evidence.

## Amendment: reference-derived A/B/C matrix (`tea-slot-reference-abc-v1`)

Approved after v2 originals were confirmed restored. This is the one further
trial; there is no arbitrary candidate chooser and no fourth trial. It is
offered only when the v2 trial is `restored` with history `[v1]`; both prior
trials are archived intact in one transaction (history cap 2).

**Audit.** Official public reference
`https://share-h5.xbloom.com/?id=lRU%2FNUodjN5PzwxNQaOxeA%3D%3D` (via
`RecipeDetail`): cupType 4 TEA, dose 3, grandWater 15, grinderSize 50,
isSetGrinderSize 2, rpm 120, one stage of 90 ml / 92 C / pause 20 s / pattern 2
(spiral) / flowRate 3.5 -> 35 / vibration off -> 0. `teaRecipePerVolumn` 120 is
metadata only; the actual stage is 90 ml. Public HomoLand `build_tea_recipe_code`
keeps grinderSize and `int(grandWater*10)&255` instead of the app's forced 0xFE.
Segment: `[90,92,2,0,236,0,120,35]`.

| Slot | Flag | Blob |
|---|---|---|
| A | 0x02 | `[8, segment, 254, 150]` |
| B | 0x04 | `[8, segment, 254, 150]` |
| C | 0x04 | `[8, segment, 50, 150]` |

Suffix 150 is an explicit audited constant; the ordinary encoder is untouched
and no `Recipe` constructor fix-ratio path derives it. Stored recipe metadata
keeps ratio 15 as the cloud does. No extra 30 ml stage (firmware tea drain
unproven), no new command, no automatic brew. Labelled **reference-derived, NOT
official-byte-proven**. Validation is strict: full recipe, blob and slot flag.

**Risk (user approved).** Suffix 50 in C may run the grinder if the machine
treats it as coffee. Run with the hopper empty, no leaves, an empty OmniTeaBrewer
and receiving vessel, user present. Do NOT start C if the display shows grind; a
display-only report is sufficient. A and B keep the grinder off.

**UI/persistence.** "ABC comparisons" panel with three exact rows, WRITE
COMPARISON and RESTORE ORIGINAL SET through the same journal ceremony, dev-only
write, retained restoration. Per-slot observations (display, steep counter,
hold seconds, drained as tea, note) are stored separately from the older single
observation, and the retained copy carries frames, history and per-slot reports.

**Unproven.** Whether the flags or suffix 150 yield tea overview/drain on
firmware; C's grinder behaviour; any official-byte equivalence.
