# Beta feedback corrections

## Scope and ownership

Address four beta feedback items: brew history controls, Android duplication
investigation, prompt Bluetooth-off feedback, and Easy Mode Scale ON.
The user approved this design on 2026-10-14.

Task branch: `fix/beta-feedback-20261014`.
Worktree: `/Users/jesperhessius/Dev/XBRW-beta-feedback-20261014`.
Pinned base: `2cd68f58b0389ac0be98899fc952c8877fcf0747` from `origin/develop`.
This session owns the newly created task worktree. Shared develop/main checkouts
remain untouched. No PR, merge, deployment, production build or hardware write
is authorized by this task.

## 1. Brew history

Add independent **Hide unsuccessful** and **Rated only** controls and five sort
axes: date, rating, dose, ratio and grind. Each axis supports both directions.
Initial behavior remains all records, newest first. Remember sort and direction
across visits; filters reset when the screen is reopened.

Hide unsuccessful keeps `done` and `endedOnMachine` records, including
hand-logged cups; it hides `failed`, `cancelled` and `lostContact`. Rated only
uses the existing rated-cup predicate, not just a positive number on an
unsuccessful record. Compose both filters with any recipe UUID route scope.

Use stored brew-time values, never current recipe values. Missing numeric
values, unrated entries when sorting rating, and grinder-off entries when
sorting grind go last in either direction. Equal values use newest-first,
then record identity, for deterministic ordering.

Keep matching and sorting in a pure domain helper and query state in a hook.
Continue reading history without sample streams through `useBrewHistory`;
do not introduce database schema/index migrations for filtering.
Reuse the existing rail and XbrwSheet visual idioms rather than redesigning the
screen or adding a UI dependency.

Changing any filter or sort clears batch selection and its handoff state.
Selection, comparison, deletion and handoff must operate on visible records,
never on a hidden selection. The header count reflects the visible answer.
Recipe-scoped heading identity must remain available when filters find no rows.
Distinguish an empty history from an empty filtered result and expose a way to
clear filters. Any new sheet participates in the Android screen-covered guard.

Persisted sort settings belong in Settings.DEFAULTS and the typed backup
snapshot, with validation matching existing settings conventions.

### Alternatives

A smaller date/rating toolbar does not satisfy the chosen dose/ratio/grind
scope. SQL history queries could avoid sorting loaded rows, but introduce query
and migration work without a measured problem. The existing loaded-history
approach is the smallest complete implementation for this release.

## 2. Android duplication investigation

Do not label the report a confirmed crash or change gesture/navigation behavior
without evidence. Investigate home tray, home overflow and editor duplication,
including the committed copy and subsequent refresh/navigation.

Existing evidence:

- `RecipeDatabase.duplicateRecipe` deep-copies the recipe, assigns a new UUID
  and React key, and inserts it before returning.
- Home duplication clones a saved row and immediately reloads the library.
- Editor duplication copies the recipe in hand, catches insert failures, then
  deliberately calls `navigation.goBack()`.
- A successful insertion followed by the reported app closure suggests a
  post-insert failure, but does not identify its cause.

Add targeted regression coverage for any demonstrated defect. Do not apply a
speculative swipe-animation delay or broad catch that hides a render/native
failure. If no culprit is established, deliver concise instructions requesting
the Android crash log plus phone/OS, app version/build, source recipe and exact
entry point. Offer practical no-computer bug-report steps where supported and
an adb logcat alternative; warn that full system reports can contain private
data and should be shared privately, not posted publicly.

## 3. Bluetooth radio refusal

The transport already starts the BLE manager and checks the adapter before
each scan/connect. It rejects off, turning-off, unauthorized and unsupported
states with `RadioUnavailableError`, and waits for a starting/resetting radio.
Machine preserves this error type.

The cause of delayed feedback is above the transport: `attemptLink` scans after
a remembered-device connect fails regardless of cause, and `openLink` retries
every failure with connection delays.

Propagate radio-unavailable failures immediately through both layers. Do not
fall back to scanning or sleep/retry after such a refusal. Keep retries and
stale-identifier scan fallback for ordinary machine connection failures.
Preserve permission handling before retries and existing automatic-connect
notification behavior. Apply the same rule on Android and iOS.

## 4. Easy Mode Scale ON

Add a per-slot boolean independent of Recipe, NFC card serialization and brew
configuration. Existing snapshots without it mean off and must reproduce
their old exact frames, including pending recovery journals.

Expose a Scale ON/OFF control on each assigned ordinary slot card, with
accessible slot-specific labels and explanatory copy about automatic tare.
A toggle changes the draft only; the existing WRITE TO MACHINE action commits
the three-slot set. Default new empty slots to off. Keep a slot's selected
scale state when replacing its recipe or accepting updated library content.
Choosing the same recipe with a different scale setting is a real pending
write, but must not mark the underlying recipe as edited.

Add bit `0x10` to the existing flags byte:

- Coffee remains selector `0x02`; scale on becomes `0x12`.
- Tea keeps `0x0C + (steepCount - 1) * 0x20`, with scale bit added separately.
- Do not change cup selectors, bypass policy, grinder bytes or recipe blobs.

Validate a supplied scale value as boolean. Preserve it in draft,
last-written, preparation, exact journal frames, restoration and recovery
paths. Lock changes during an active write, recovery journal or fixed probe
trial. Registered historical probes remain exact, unmodified candidates.
Recipe-library update comparisons ignore slot-only scale configuration,
while draft-versus-written comparisons include it.

## Verification and release gaps

Use targeted tests on both Jest platforms for:

- Filter combinations, recipe scope, missing values, sort directions and ties.
- History controls, empty results, selection reset and sheet accessibility.
- Settings persistence and backup compatibility.
- Duplication identity and any reproduced post-insert defect.
- Immediate radio-off refusal with no fallback scan or retry delay, plus
  preservation of transient retries and radio-startup waits.
- Scale flags with independent byte expectations, old snapshot/journal
  compatibility, invalid input rejection, replacement/update preservation,
  pending-write detection, probe immutability and recovery exactness.

Run typecheck and relevant lint checks after implementation; preserve existing
CI gates. No native dependencies or app-version changes are planned.

Automated tests cannot establish an Android native crash has been fixed without
a reproduction or crash evidence. They also cannot qualify BLE behavior.
Physical release checks remain necessary for Bluetooth-off feedback and
Easy Mode Scale ON/OFF automatic tare, including tea if enabled. Do not claim
hardware qualification from generated bytes or scripted transports.
