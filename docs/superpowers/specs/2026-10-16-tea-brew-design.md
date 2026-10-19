# Tea brew recording and presentation

## Goal and approved direction

Treat tea as repeated fill, steep, release and drain cycles rather than coffee
pours with unexplained stalls. Preserve the existing chart-and-ladder structure
(visual option A). Keep coffee behavior unchanged.

The user approved the tea-aware ladder and the proposed recording/display rules,
adding that tea brews must not be offered for sending to BeanConqueror.

## Evidence and limits

The supplied screenshot shows a three-steep recipe with 90 ml fills, temperatures
92/92/80 C and steep times 45/60/90 seconds. Its export contains:

| Observation | Value |
| --- | --- |
| Sample count | 904 |
| Last sample time | 202.584 seconds from first water |
| Last water reading | 290.2375 ml |
| Last cup reading | 248.631 g |
| Recorded steep indices | 1 and 2 only |
| Stored stage water | 139.8875, 150.35, 0 ml |
| First two water plateaus | 44.814 and 60.105 seconds |
| Stored outcome | done |

Both water and cup readings are still increasing at the end of the export.
The plateau durations match the first two planned steep times, but neither a
third steep nor its 90-second hold is present in the recording.

The user is not sure whether the machine physically completed all three steeps.
The export contains no BLE frames, so it cannot establish whether the machine
stopped early, a terminal event was interpreted incorrectly, stage events were
misidentified, or recording stopped while brewing continued.

The user's expected cycle is a 90 ml fill followed by approximately 30 ml of
release water. The observed first two stage totals do not establish a fixed
release amount. Do not relabel those totals as correct 120 ml cycles or change
the wire recipe to compensate.

The ordinary tea path already uploads with command 4513 and executes with 4512.
Its encoder includes each planned fill and steep duration. This is not proof
that all three steeps ran on the reported device.

## Record identity and compatibility

Persist a tea/coffee discriminator on new brew records, snapshotted from the
recipe at brew start and preserved through storage, backups, neutral exports,
restore and history reads. The exact field belongs in the implementation plan.
Do not infer tea solely from a disabled grinder, dose, ratio, name or pour size.

Older records without the discriminator retain their existing compatible
behavior unless there is reliable evidence of their historical type. Looking
up a mutable recipe is not proof of the type at brew time. Do not destructively
rewrite old observations or reinterpret the supplied brew as complete.

## Live and finished tea display

Each ladder row is a steep cycle:

1. Fill: planned fill volume, temperature and observed delivery when available.
2. Steep: the planned steep duration, plus live elapsed time where meaningful.
3. Release and drain: distinct from the fill and steep; measured water and time
   are shown only when supported by observations.

Keep the compact ladder and chart. Show the current cycle and phase clearly,
using the app's existing typography, colors, motion and accessible controls.
Separate release water from fill water in stage detail. A 90 ml recipe fill is
not the target for the combined fill-plus-release total.

A timer may estimate progress, but must not claim a machine-confirmed transition
or completion. When observations do not distinguish release from drain, show
the combined phase rather than manufacturing a precise boundary.

Intentional steep holds are not stalls. Drain time between steeps is not coffee
overflow time. Preserve raw samples and events independently of derived phases
so a future correction does not require inventing data.

An unobserved final steep is not a successful zero-ml steep. Show that it was not
observed, or that the record is incomplete, as appropriate to the evidence.
Unknown drain time is absent/unknown, not zero seconds.

The chart must include the complete observed stream and share its real-time
axis with the rate chart. Distinguish actual record truncation from SVG clipping.
Do not extend a truncated trace with made-up samples or render an unobserved
cycle as completed simply because the terminal outcome says done.

## Tea-specific figures and judgement

Hide grinder-off, grind size/RPM, dial adjustment and coffee-ratio figures on
tea brew surfaces. Retain useful leaf dose, delivered water, cup reading and
elapsed time with accurate units.

Use tea-specific rating/note copy, without coffee/grind suggestions. Keep the
existing whole-star rating and note persistence behavior.

Apply the same semantics to live brew, finished brew, history record,
comparison, shared story/card rendering and accessibility descriptions.
Update directly related copy documentation.

## No BeanConqueror handoff for tea

Do not offer sending tea brews to BeanConqueror:

- No live/finished-brew send action or post-brew prompt.
- No record-screen action or coffee-identification prerequisite sheet.
- Batch handoff excludes known tea records and accurately describes eligible
  records; it must not send tea through a generic selection path.
- Shared eligibility and handoff validation reject known tea records before
  creating a URL or invoking another app.

Do not change unrelated recipe import or source-attribution features merely
because they mention BeanConqueror. Ordinary backups and neutral brew exports
remain available for tea. Unknown legacy type is not evidence of tea.

## Correctness investigation before protocol changes

Obtain a BLE log for a controlled multi-steep tea brew, with the plan and sample
export plus the user's observation of the actual cycles. Capture upload/execute,
stage indices, release events, terminal events and state changes. Record
firmware/model and distinguish telemetry from an app-derived phase.

Use that evidence to reproduce the problematic event sequence through the
Machine and BrewRecorder tests. Fix the layer responsible for early ending or
misassigned stages. Do not suppress terminal events, fabricate stage indices or
change release-water commands on the basis of the sample export alone.

If the historical log cannot be recovered, report the original cause as
unresolved rather than claiming that a redesigned display fixed brewing.
Tea protocol changes require physical-device qualification.

## Error handling and tests

Malformed or missing tea metadata must not crash history or restore.
Unknown phase boundaries stay unknown with clear accessible copy. Failures to
persist or decode data follow the repository's explicit logging/error patterns.

Coverage must include:

- Tea identity survives SQLite, backup/restore and neutral export round trips.
- Old records with no identity still load; coffee output is unchanged.
- Correct separation of known fill/release observations and unknown boundaries.
- Steep timing is visible, and intentional steep holds do not become stalls.
- Partial/truncated recordings never mark an unobserved steep complete.
- Volume and rate charts include all real samples on one axis.
- Tea has no grinder/coffee-ratio copy or coffee rating suggestions.
- Every BeanConqueror entry point and batch path excludes known tea.
- Real SQLite tests for SQL behavior; async RNTL calls on both Jest platforms.
- A physical three-steep replay with BLE logs before claiming brew correctness.

## Scope and delivery

This task starts at pinned develop
`540f23e81080e964ffadb4db781616d4685da32e` in the dedicated
`fix/tea-brew-20261016` worktree. PR #221 is still open and is not part of this
base; integrate any eventual overlap serially with explicit permission.

CI optimization is an independent task. No deployment, PR creation, native build
or hardware-client operation is authorized merely by this design.
