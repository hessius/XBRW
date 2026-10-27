# Machine Tools and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development`
> to implement this plan task-by-task, as explicitly requested by the user.
> Steps use checkbox (`- [ ]`) syntax for tracking. Do not compete for hardware.

**Goal:** Implement #64 as a discoverable machine page with home shortcuts,
dedicated Grind/Scale/Pour instruments and focused machine-setting editors.

**Architecture:** Keep the existing shared Machine/transport, extend its
exclusive-operation boundary, and install one plain-TypeScript control owner
beside the existing slot owner. Thin routes and hooks expose its snapshots;
confirmed machine feedback, not React component lifetimes or successful BLE
writes, advances operation state.

**Tech Stack:** Existing Expo SDK 57, React Native, TypeScript, Tamagui,
expo-router, Reanimated, Doto/DotMatrixText, Jest iOS+Android and FakeTransport.
No new native dependency is planned.

---

## Status, ownership and execution gates

This plan does not establish hardware qualification. The user subsequently
confirmed the other session is idle and authorized subagent-driven
implementation, a PR against develop and one Copilot review round, but not a
merge or deployment.

Implementation worktree: `/Users/jesperhessius/Dev/XBRW-machine-tools-20261027`.
Implementation branch: `feat/machine-tools-settings-20261027`.
Freshly fetched implementation base: `229511ffcb235b430585ce0bf9931213d5b196cc`.

Task 1's evidence audit found no complete qualified standalone tool/settings
profile, and the approved physical iPhone 17 Pro was unavailable. Software-only
work may proceed behind explicit unavailable capabilities. Command encoders,
production capability enablement and physical acceptance remain gated on real
evidence; synthetic tests do not satisfy that gate.

Design: `docs/superpowers/specs/2026-10-27-machine-tools-settings-design.md`.
Planning base: `f24fc968a9f48232323145cfe99a6ba443f9d7c4`
(`origin/develop`, fetched 2026-10-27).
Planning worktree: `/Users/jesperhessius/Dev/XBRW-machine-tools-plan-20261027`.
Planning branch: `docs/machine-tools-plan-20261027`.

Before implementation, fetch `origin --no-prune`, run `npm run worktrees:check`,
and inspect other-session changes. The implementation task must start from a
freshly pinned `origin/develop`, bringing these documentation commits forward
without changing another session's checkout. Preserve the diagnostics route,
saved-machine behaviour and all existing release/PR gates.

Hardware-dependent code cannot honestly be specified byte-for-byte until
Task 1 resolves the contradictory command contracts. The plan fixes the
software interfaces and required evidence now; Task 1's exit condition is a
hard gate for the corresponding command builders and capability enablement.
Do not fill that gap with mockup values, guessed predicates or fake fixtures.

## Bounded delivery sequence

1. Qualify commands and add the shared ownership/recovery foundation.
2. Implement the three tools and their navigation guard.
3. Implement the expandable machine settings index and editors; wire both
   discovery routes and complete device acceptance.

Use serial checkpoints within one feature task. These are cohesive slices,
not independent simultaneous hardware clients. A capability may be developed
behind an explicit unavailable state, but #64 is not complete until its agreed
capabilities are qualified or the user explicitly accepts a reduced scope.

## Existing seams to preserve

| File | Current seam and consequence |
| --- | --- |
| `app/machine.tsx` | Raw diagnostic console. Keep its route and tests intact. |
| `components/MachinePanel.tsx` | Home status/refresh/Easy Mode panel. Add launchers, not inline tool controls. |
| `components/MachineSection.tsx` | Saved machine cards, connect, Manage callbacks and secret console access. Add a clearly named machine-page action. |
| `components/MachineDetailSheet.tsx` | Existing name/model/colour/order/forget UI; reuse under Manage. |
| `hooks/useMachine.ts` | Shared Machine, slot installation, switching and AppState lifecycle. Integrate here, never create a second transport. |
| `library/machine/Machine.ts:335-399` | Background flag, ordinary-operation guard and exclusive slot lease acquisition. Extend symmetrically for controls. |
| `library/machine/Machine.ts:993-1038` | Raw send and generation-checked write. Owner-only sends must use the same frame-budget/logging path. |
| `library/machine/Machine.ts:1072-1105` | Decoded receive, state/info bookkeeping and notification fanout. Preserve brew guards and water flag handling. |
| `library/machine/Machine.ts:1212-1295` | Brew preflight and ordinary-operation acquisition. Refuse tools/recovery before any recipe cleanup/upload. |
| `hooks/useMachine.ts:255-348` | Background lifecycle currently retains a brew but releases an idle link. Active tools cannot follow the idle path. |
| `hooks/useMachine.ts:687-705` | Machine-change blocker. Extend to tool/settings ownership and uncertain recovery. |
| `library/machine/protocol.ts:267-317` | MachineInfo currently omits hardware settings; add raw nullable fields without changing existing defaults/mode interpretation. |
| `library/machine/protocol.ts:379-437` | Parses only two receipt command codes and otherwise general events. Add only capture-proven response decoders. |
| `library/machine/__tests__/protocolFixtures.ts` | Independent byte builders. Do not build expected frames with production encoders. |
| `app/easyMode.tsx:65-110` | Native-stack `usePreventRemove` and original-action replay; reuse the pattern for tool exit. |
| `hooks/useLiveBrewBarGuard.ts` | Navigation through the global brew bar must honour the same tool departure guard. |
| `library/brew/grindFlicker.ts` | The existing RPM-derived cadence. Reuse, do not duplicate constants. |
| `hooks/useTraceAnimation.ts` | Existing grinding state visual semantics; do not instantiate a second brew run for tools. |

Line references describe the planning base; resolve symbols again before edits.

## Planned file responsibilities

### Domain and shared ownership

- Create `library/machine/controlModel.ts`: tool/setting IDs, requests,
  snapshots, recovery marker and input validation.
- Create `library/machine/controlCapabilities.ts`: evidence-qualified
  model/firmware capabilities and command encoders/feedback decoders. Unsupported
  cases return a reason; no guessed fallback profile.
- Create `library/machine/controlRecovery.ts`: local-only marker parsing/storage.
- Create `library/machine/MachineControls.ts`: one session/setting transaction
  state machine; owns subscriptions, pending requests and terminal proof.
- Modify `library/machine/Machine.ts`: identity/generation-bound control lease,
  mutual exclusion and recovery reservation.
- Modify `library/machine/protocol.ts`: raw info fields and capture-proven
  standalone notifications, preserving current brew notification semantics.
- Modify `library/machine/errors.ts`: typed control refusal, included in the
  existing non-retrying brew-refusal union where relevant.
- Modify `library/Settings.ts`: one recovery-marker key, excluded from backup.
- Modify `hooks/useMachine.ts`: install one controller, preserve recovery
  identity, switching/forget guards and background handling.
- Create `hooks/useMachineControls.ts`: subscribe to the shared controller via
  `useSyncExternalStore`; no per-hook controller construction.
- Create `hooks/useMachineToolNavigation.ts`: focused tool departure guard and
  confirmed-stop/original-action replay.
- Modify `constants/machine.ts`: named protocol deadlines justified by captures,
  separate from animation timing.

### Presentation and routing

- Create `components/MachineTools.tsx`: the shared Grind/Scale/Pour launcher row.
- Create `components/MachineControlReadout.tsx`: accessible Doto readout with
  label/unit/unavailable state, not another font or drawing library.
- Create `components/GrindActivityBand.tsx`: small state animation, steady
  label handled by the tool, shared cadence and Reduced Motion.
- Create `components/GrindTool.tsx`, `components/ScaleTool.tsx`,
  `components/PourTool.tsx`: presentational task-specific instruments.
- Create `components/MachineSettingsList.tsx`: grouped summary rows and
  unsupported reasons.
- Create `components/MachineSettingEditor.tsx`: typed proposal editing and
  explicit Apply; uses existing Stepper/SegmentedControl/PourGlyph.
- Create `app/machineHome.tsx`: named machine, launchers, settings summaries,
  reported details and existing Manage/Forget sheets.
- Create `app/machineTool.tsx`: one typed tool route selecting one of the
  module-scope tool components; it is a dedicated screen, not an inline panel.
- Create `app/machineSetting.tsx`: focused setting route.
- Modify `app/_layout.tsx`: register those routes with `headerShown: false`.
- Modify `components/MachinePanel.tsx`, `components/MachineSection.tsx`,
  `app/index.tsx`, `app/settings.tsx`: wire shortcuts and discovery without
  changing `/machine` diagnostic entry points.

Create tests beside those units using the existing `__tests__` layout. No
dependency, card-format, recipe-schema, brew-history or native-config changes.

## Shared software contracts

Define these types in `controlModel.ts` before consumers. Keep canonical
temperature in whole Celsius and flow in ml/s. Do not reuse the NFC grind
offset or assume card volume/flow constraints are standalone hardware limits.

```ts
export type ToolId = "grind" | "scale" | "pour";
export type ControlIdentity = {
    deviceId: string;
    serial: string | null;
};
export type Pattern = "centered" | "circular" | "spiral";
export type PourRequest = {
    temperatureC: number;
    flowMlPerSecond: number;
    pattern: Pattern;
} & (
    | {mode: "target"; volumeMl: number}
    | {mode: "continuous"}
);
export type GrindRequest = {grindSize: number; rpm: number};
export type SettingValues = {
    temperatureUnit: "C" | "F";
    weightUnit: "g" | "oz" | "ml";
    brightness: number;
    waterSource: "tank" | "tap";
    pourRadius: number;
    vibrationAmplitude: number;
};
export type SettingId = keyof SettingValues;
export type SettingReadings = {
    [K in SettingId]: SettingValues[K] | null;
};
export type ControlPhase =
    | "closed" | "entering" | "ready" | "starting" | "running"
    | "stopping" | "leaving" | "applying" | "unknown";
export type ControlSnapshot = {
    identity: ControlIdentity | null;
    tool: ToolId | null;
    phase: ControlPhase;
    error: string | null;
    cupGrams: number | null;
    dispensedMl: number | null;
    grindRequest: GrindRequest | null;
    pourRequest: PourRequest | null;
    temperatureC: number | null;
    pattern: Pattern | null;
    pendingTemperatureC: number | null;
    pendingPattern: Pattern | null;
    settings: SettingReadings | null;
    applyingSetting: SettingId | null;
};
export type ControlRecovery = {
    version: 1;
    deviceId: string;
    serial: string | null;
    tool: "grind" | "pour";
};
```

Pattern names match the shared PourGlyph vocabulary. Map them to the app's
`POUR_PATTERN` values explicitly inside the qualified adapter; the existing
POUR_PATTERN object widens its properties to `number`, so indexing its type
does not produce a safe literal union. Do not copy the community catalogue's numbering.
Keep `"ml"` unavailable unless the actual machine-unit semantics are verified.

The controller's public API is:

```ts
interface MachineControls {
    getSnapshot(): ControlSnapshot;
    subscribe(listener: () => void): () => void;
    open(identity: ControlIdentity, tool: ToolId): Promise<void>;
    startGrind(request: GrindRequest): Promise<void>;
    startPour(request: PourRequest): Promise<void>;
    tare(): Promise<void>;
    setTemperature(celsius: number): Promise<void>;
    setPattern(pattern: Pattern): Promise<void>;
    applySetting<K extends SettingId>(
        identity: ControlIdentity, id: K, value: SettingValues[K]
    ): Promise<void>;
    stop(): Promise<void>;
    close(): Promise<void>;
    recover(): Promise<void>;
}
```

The concrete class uses this name; the interface block fixes its contract.
Use narrow injected ports for tests, not a fake React hook containing domain
logic. Snapshots are immutable cached objects: repeated `getSnapshot()` calls
without a change return the same reference.

### State and proof rules

| From | Action/evidence | Result |
| --- | --- | --- |
| closed | Qualified tool entry under lease | entering, then ready after proven entry |
| ready | Explicit Start | Persist uncertainty before dispatch; starting |
| starting | Qualified running evidence | running |
| starting | Delivery/result uncertain | unknown; keep recovery reservation |
| running | Explicit Stop or natural target completion | stopping, or ready only with terminal proof |
| stopping | Qualified terminal evidence | ready; clear recovery marker |
| any owned state | Link generation/identity changes | unknown; discard old callbacks, retain motor/water uncertainty |
| ready | Close after verified non-moving state | leaving; release only after required exit/normal proof |
| closed | Explicit setting Apply | applying under lease; success only after matching fresh readback |

Refused starts before any possible dispatch do not leave a motor-running
claim. A native write failure after entering the dispatch path remains
uncertain unless the transport can prove non-delivery.

## Task 1: Qualify the hardware contracts before enabling capabilities

**Files:** read `library/machine/commands.ts`, `app/machine.tsx`,
`docs/machine-integration/ble-protocol.md`; update the protocol document's
existing sections with measured evidence. Capture regression fixtures in
`library/machine/__tests__/fixtures/controlCaptures.ts` only after capture.

- [ ] Confirm the other session and any other BLE client are idle. Obtain a
  dedicated device session; for iOS use the configured iPhone 17 Pro target,
  never select the iPhone 13 mini by default.
- [ ] Use the existing console with confirmations enabled; record firmware,
  model, complete sent/received frames, ordering and physical observations.
  Keep the original value before changing any persistent setting.
- [ ] Verify non-starting tool entry/exit: scale `8003/8014`, grinder
  `8006/8012`, brewer `8007/8013`. Entering a screen must not turn a motor or
  water on. Do not call a generic Home command a verified Stop.
- [ ] Verify grinder `3500 [1000, size, rpm]` and `3505`: actual usable
  size/RPM range, start acknowledgement, active feedback, empty hopper,
  physical controls, Stop terminal evidence and repeated-Stop behaviour.
  The animation's RPM does not count as running evidence.
- [ ] Verify scale stream identity, on-wire units/precision, cold/hot readings
  and tare `8500`. Compare readings before/after changing machine display units.
  Tare acceptance must be distinguished from receiving a later zero sample.
- [ ] Verify brewer `4506` payload argument types/scaling, water-source and
  pattern mappings, target-volume limits, natural completion and stop `4507`.
  Independently compare dispensed telemetry with an observed volume/weight;
  determine whether the stream resets per session.
- [ ] Establish the actual continuous-pour entry/start/stop sequence. Specifically
  reject an assumed `volume=0`, a huge finite target, repeat-start loops and
  destructive `8019` use during a recipe. If no supported continuous contract
  is found, stop this capability and ask the user to revise scope.
- [ ] Verify live pattern `8016` and temperature `4510`, including argument
  scale, acknowledgement/readback, failure and whether rapid requests are
  serialised safely. Do not assume live flow adjustment exists.
- [ ] Resolve temperature-unit `8010` and weight-unit `8005` contradictions
  against the physical display. Verify brightness `8103` levels and water
  source `4508`; restore each original value after the experiment.
- [ ] Read and verify tuning: `11506/11507` for radius, `11508/11509` for
  vibration. First compare dedicated read responses with full info fields.
  Establish interpretation, units, supported range/steps and write confirmation
  without probing unsafe mechanical extremes. The reported radius interval
  400-1000 with step 80 is not internally sufficient to define a legal ladder.
- [ ] Capture short and full info payloads; establish exact offsets and
  which responses work on each tested firmware. Record unsupported cases.
- [ ] Capture missing/refused feedback, physical Stop, target completion,
  connection loss and foreground return. Define bounded response deadlines
  from observed latency; a deadline never proves a machine stopped.
- [ ] Commit evidence and fixtures using a `docs:`/`test:` checkpoint with the
  required Copilot co-author trailer.

**Exit:** each enabled capability has a proven encoding, valid inputs,
response correlation, terminal evidence and firmware scope. Unresolved
capabilities remain explicitly disabled. No actual hardware commands are
authorized merely by writing this plan; coordinate the device session first.

## Task 2: Preserve optional hardware readings and define input contracts

**Files:** modify `protocol.ts`; create `controlModel.ts`,
`controlCapabilities.ts`, `__tests__/protocol.controls.test.ts`,
`__tests__/controlCapabilities.test.ts`.

- [ ] Add failing parser cases using the independent fixture builder:

```ts
import {parseNotification} from "@/library/machine/protocol";
import {notification} from "@/library/machine/__tests__/protocolFixtures";

it("does not invent tuning fields on a short whole info frame", () => {
    const payload = new Array<number>(55).fill(0);
    const parsed = parseNotification(
        Uint8Array.from(notification(0x49, 0x9E, payload))
    );
    if (parsed.kind !== "info") throw new Error("Expected an info frame");
    expect(parsed.settingsRaw).toEqual({
        temperatureUnit: 0,
        weightUnit: 0,
        brightness: 0,
        pourRadius: null,
        vibrationAmplitude: null
    });
});
```

- [ ] Run `npm test -- --runTestsByPath library/machine/__tests__/protocol.controls.test.ts --runInBand`.
  Expect the new property assertions to fail before implementation.
- [ ] Define `MachineSettingsRaw` with the five nullable numeric properties
  asserted above; add `settingsRaw?: MachineSettingsRaw` to MachineInfo.
  Populate it on newly parsed info frames. Preserve old synthetic callers and
  existing mode interpretation. Raw zero must not be used as absence.
- [ ] Read optional integer fields only when all their bytes exist:

```ts
function optionalUint32(payload: Uint8Array, offset: number): number | null {
    if (payload.byteLength < offset + 4) return null;
    return new DataView(
        payload.buffer, payload.byteOffset, payload.byteLength
    ).getUint32(offset, true);
}
```

  Use the offsets confirmed in Task 1; research currently points to 55 and 59.
  Add independently captured long-frame values, truncated/CRC-invalid frames,
  and zero-valued raw unit cases.
- [ ] Add `controlModel.ts` types above and input validators. Accept only finite,
  qualified values; use BLE grind range 1-80 rather than NFC range 40-80 where
  the standalone machine qualification agrees. Reuse whole-Celsius conversion;
  standalone volume/flow bounds must come from qualification, not card bytes.
- [ ] Implement capability lookup by explicit machine model and reported
  firmware. A matching test-only injected profile proves controller behaviour,
  not production support. Populate real profiles solely from Task 1 evidence.
  Bind support to the observed model/serial scope established by captures,
  not the user's model preference alone. Do not populate STUDIO_MODEL_STRINGS
  speculatively or assume Studio qualification applies to the Original.
- [ ] Encode frames with the existing protocol builders and explicit DataView
  float/int handling where required. Compare complete frames to independent
  captured expectations, including pattern mapping and distinct live-temperature
  integer encoding. Subscribe for responses before dispatch.
- [ ] Run the new tests together with `library/machine/__tests__/protocol.test.ts`
  and `library/machine/__tests__/commands.test.ts`; commit this checkpoint.

## Task 3: Add exclusive control ownership and restart uncertainty

**Files:** modify `Machine.ts`, `errors.ts`, `Settings.ts`, `hooks/useMachine.ts`;
create `controlRecovery.ts`, `__tests__/Machine.controls.test.ts`,
`__tests__/controlRecovery.test.ts`; extend
`hooks/__tests__/machineSlotOwner.test.tsx`,
`hooks/__tests__/multipleMachines.test.ts`, `library/__tests__/backup.test.ts`.

- [ ] Add a `ControlOperationError` to `errors.ts` and the existing BrewRefusal
  union/predicate, so an ownership refusal cannot trigger an automatic brew retry.
- [ ] Add failing real-Machine/FakeTransport cases: while a control lease is
  held, raw `send`, `brew` and `acquireSlotSession` reject without writing;
  while a slot recovery journal exists, acquiring a control lease rejects.
  Assert both the refusal and the unchanged `radio.written` length.
- [ ] Add `acquireControlSession(identity, purpose)` inside Machine, where purpose
  is a ToolId, `"setting"` or `"recovery"`. Reuse the slot lease's private token/generation
  pattern and the existing private `writeFrame`. Validate actual device/serial,
  fresh qualified normal state, background state, active/lost brew, outstanding
  ordinary operations, unsettled console commands and durable slot reservation.
- [ ] Give `"recovery"` a narrow exception to the fresh-normal-state requirement:
  it may inspect/stop the exact device named by a valid uncertainty marker.
  It cannot start a tool, change a setting, take another device or override a
  slot journal. Otherwise requiring normal state before recovery would make
  an actually running uncertain tool impossible to stop.
- [ ] Recheck token, connection generation and identity before and after each
  asynchronous write/wait. The leased send path must not use public `send()`
  or bypass frame-budget checks, logging or pacing. Public sends must reject
  another owner's frames, including a console command classified "inert".
- [ ] Provide a lease-bound `refreshInfo()` that reuses the existing private
  `askInfo`/handshake path while checking lease ownership. Keep public
  `askHowItIsDoing()` subject to ordinary-operation refusal during a lease.
  A bare `40521` request is not a reliable readback on the documented firmware.
- [ ] Expose a read-only control blocker and notify existing link subscribers
  when it changes. Add the same blocker to `machineChangeBlocker` and forgetting;
  reject a brew before the first cleanup or upload frame.
- [ ] Add `machineControlRecovery: ""` to Settings.DEFAULTS and add that key
  to both BackupExcluded and NOT_IN_BACKUP. Store only this shape:

```ts
const recovery = {
    version: 1,
    deviceId: "test-machine",
    serial: null,
    tool: "pour"
} satisfies ControlRecovery;
```

- [ ] Implement a strict marker parser: empty string means no marker; malformed
  non-empty content produces a visible error/reservation. Validate the version,
  non-empty device ID, nullable serial and grind/pour discriminant. Do not silently
  turn malformed recovery into an idle machine.
- [ ] Persist the marker before a possible Start dispatch. A storage failure
  refuses dispatch. Clear it only after qualified terminal evidence; failed
  persistence of the clear remains a visible recovery error.
- [ ] Add a control preflight that shares the existing tank-safety readings,
  including the last `40522` flag. Pour refuses a tank-fed low/empty/unknown
  supply before dispatch; tap-fed semantics follow qualified source readback.
  Scale/grinding do not inherit irrelevant recipe volume or tank checks.
  Stop is never blocked by an empty tank or a new ordinary-operation preflight.
- [ ] Restore the reservation during shared-Machine initialization before
  connecting. While a recovery marker exists, startup/foreground connects target
  that device only, never scan/fall through to another saved machine. A serial
  mismatch refuses mutation. Recovery never sends Start.
- [ ] Test restart with a pending marker, wrong device/serial, marker-write
  failure, missing terminal response, late old-generation feedback and backup
  exclusion. Also prove backup restore cannot overwrite the local marker.
  Use the existing real SQLite harness for SQL-dependent behaviour.
- [ ] Run the targeted ownership/recovery/backup tests serially and commit.

## Task 4: Implement the shared tool and setting state machine

### Software-only checkpoint (2026-10-27)

`new MachineControls(machine, {qualifications?: readonly ControlQualification[]})`
owns one shared session. Omitted qualifications mean **no support**. The production
capability registry remains empty; no standalone production encoder/decoder is
provided. The controller tests inject explicitly synthetic model/firmware/serial
scopes, frames, correlation, numeric policies, deadlines and telemetry freshness.
They do not qualify hardware or complete Task 1/Task 10.

`controlProtocol.ts` defines the injected contract:

- `ControlQualification` pairs a captured capability profile with `ControlProtocol`.
- `plan(command: ControlCommand, tokens: ControlTokens): ControlExchange` supplies
  the optional frame, required evidence-derived deadline and optional leased
  info refresh. There are no fallback deadlines, units, bounds or sentinels.
- `decode(frame): ControlFeedback | null` must prove session/transaction correlation.
  Running, terminal, tare acceptance, fresh setting readback, cup grams and
  run-scoped dispensed ml are distinct evidence, not successful writes.
- `actualWaterSource(info, infoAt)` supplies a qualification-proven source;
  `telemetryFreshMs?` optionally expires samples. Display units are irrelevant.
- Moving recovery inspection **only** uses leased `refreshInfo`, never a
  tool-entry frame or general-purpose recovery send.

The lease's optional `beforeDispatch` callbacks on `send`, `sendStop` and
`refreshInfo` run immediately before the native write, after pacing/MTU guards;
handshake renewal does not run the tool command's callback. Start persists its
marker at that boundary, and Pour rechecks actual source/tank availability there.
An optional `checkCurrent` callback additionally cancels queued internal
handshakes/readbacks as well as the final frame; it adds to, never replaces,
Machine's identity/generation/ownership guards.
Native writes/readbacks retain exclusion until they settle even after timeout.

For Task 5, install one owner above routes, pass `getSnapshot`/`subscribe` directly
to `useSyncExternalStore`, and keep the controller alive across remounts. There
is deliberately no dispose/unsubscribe-to-release shortcut and no new support
helper/global flag. `open` is idempotent for the same owned identity/tool.
`close()` is the only ordinary release path and requires ready plus qualified
exit evidence. AppState/connection invalidation comes from the existing Machine
lease; the hook must preserve the blocked connection/recovery target and invoke
`recover()` explicitly after reconnecting the exact device and serial. A
recovered active operation remains unknown/Stop-only; terminal proof closes it
rather than creating a fresh Start session.

Nonmoving entry/Scale/Tare/setting uncertainty retains its in-memory owner without
inventing a durable motor marker. Explicit `recover()` obtains fresh qualified
closed/terminal evidence, or current settings, before releasing that owner.
The hook must keep a failed setting proposal in caller state: the snapshot
retains `applyingSetting` and confirmed readings, never a success-shaped proposal.
Tare pending uses `phase: "applying"` with `applyingSetting: null`, not an
optimistic zero. Full app restart has no durable nonmoving transaction record;
the later hook must not infer that a failed Apply succeeded or automatically
replay it.

**Files:** create `MachineControls.ts`, `__tests__/MachineControls.test.ts`;
extend FakeTransport only to replay independently scripted evidence, not to
invent automatic success for each new outgoing code.

- [ ] Write failing tests against the public contract and transition table.
  Construct the real Machine with FakeTransport and inject an explicit
  qualification profile. Script entry, start, stop and readback frames from
  the independent fixtures. Keep no-response cases genuinely silent.
- [ ] Implement cached snapshots and subscribe/unsubscribe. Capture the selected
  identity and operation token once per session; a route-prop change is not a
  new command target.
- [ ] Implement `open`, with no motor/water start, and `close`, with the qualified
  tool-exit sequence. Close refuses starting/running/stopping/unknown. A stopped
  motor may still need exit/normal confirmation before releasing its lease.
- [ ] Implement `startGrind` and `startPour`: validate request/capability, reserve
  recovery, subscribe before dispatch, enter starting, and wait for qualified
  operation feedback. Ignore stale samples/events outside the owning attempt.
- [ ] Implement one idempotent `stop` request. Retain the same pending promise
  for repeated taps; do not queue multiple unrelated stop commands. A send
  response, timeout or component disposal cannot alone transition to ready.
- [ ] Implement naturally completed target pours with the same terminal-proof
  handling as Stop. Continuous pours cannot become complete from a UI timer.
- [ ] Implement Scale streaming/Tare. Maintain null until an actual sample;
  preserve on-wire units and do not zero optimistically. Detach listeners when
  the owned scale session exits, not on unrelated rendering.
- [ ] Implement dispensed telemetry independently from cupGrams. Discard old-run
  totals, handle qualified stream resets, and never reconstruct delivery by
  multiplying requested flow by elapsed time.
- [ ] Implement live temperature/pattern requests as serialised, identity-bound
  transactions. Expose requested/pending and confirmed values separately in
  the tool hook. Stop preempts queued nonessential live changes; no queued
  update may dispatch after stopping/leaving.
- [ ] Implement `applySetting` as current-reading -> proposal -> send -> matching
  fresh response/readback. Subscribe before sending, prevent overlapping applies
  and reject unsupported/invalid settings. Preserve the proposal on failure.
  Use the lease-bound refresh where the qualified readback needs an info
  handshake; never drop the reservation just to call a public refresh.
- [ ] Implement unknown/recover without automatic restart. Require fresh
  qualified terminal state from the same device before clearing uncertainty.
  Recover through the recovery-only lease rather than the ordinary tool entry
  path. A live recovered operation exposes Stop and cannot be adopted as a
  fresh Start.
- [ ] Test all transitions, synchronous responses during write, out-of-order
  replies, dropped/rejected writes, no feedback, repeated actions, cancellation
  races, fresh connection generations and physical-machine completion.
- [ ] Run controller and Machine ownership tests, then commit.

## Task 5: Integrate shared subscriptions, lifecycle and departure prevention

**Files:** create `hooks/useMachineControls.ts`,
`hooks/useMachineToolNavigation.ts`, their `hooks/__tests__/` tests; modify
`hooks/useMachine.ts`, `hooks/useLiveBrewBarGuard.ts` only where its current
registration contract needs to support a focused tool host.

- [ ] Install one MachineControls alongside the shared slot owner. Reset its
  subscriptions in `__resetSharedMachine` tests. Do not instantiate it in each
  `useMachineControls()` call or add another LiveBrewProvider/recorder.
- [ ] Expose snapshots with `useSyncExternalStore`. Local edit drafts belong to
  event handlers/route-keyed components, not setState-in-effect resets.
- [ ] Extend the AppState lifecycle: an active/unknown motor/water operation
  cannot be treated as idle and disconnected automatically. Retain the link
  while feasible, preserve the recovery marker and explain OS limitations.
  Passive Scale may exit/release through its qualified cleanup path.
- [ ] On foreground, target the owned machine and reconcile before re-enabling
  writes. Never replay Start or assume the machine stopped while absent.
- [ ] Implement `useMachineToolNavigation` using the existing Easy Mode
  `usePreventRemove` pattern from `expo-router/react-navigation`. Cover native
  back, gestures, app links and brew-bar navigation. Store the original action
  with its identity/token and replay once only after `stop` then `close` succeed.
- [ ] Show the existing XbrwSheet pattern with Stop and leave / Stay; keep the
  underlying screen inaccessible while the sheet is open, including Android
  sibling accessibility. Failed stop keeps the user on the guarded screen.
- [ ] Test no-response Stop, two Back attempts, stale navigation callbacks,
  modal dismissal, wrong-device recovery, background/foreground and forced
  unmount/remount without duplicate Start.
- [ ] Run hook and existing machine lifecycle/slot-owner tests, then commit.

## Task 6: Build the three instrument views and shared activity signal

**Files:** create `MachineControlReadout.tsx`, `GrindActivityBand.tsx`,
`GrindTool.tsx`, `ScaleTool.tsx`, `PourTool.tsx` and their component tests.
Reuse `Stepper.tsx`, `DotMatrixText.tsx`, `PourGlyph.tsx`,
`library/brew/grindFlicker.ts`, `constants/motion.ts`.

- [ ] Add focused rendering tests before each view. Example for the Scale contract:

```tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import ScaleTool from "@/components/ScaleTool";

it("tares without manufacturing a zero sample", async () => {
    const tare = jest.fn(async () => {});
    await renderWithProviders(
        <ScaleTool grams={18.2} unavailable={null} tarePending={false}
            onTare={tare}/>
    );
    await fireEvent.press(screen.getByRole("button", {name: "Tare"}));
    expect(tare).toHaveBeenCalledTimes(1);
    expect(screen.getByText("18.2")).toBeTruthy();
});
```

- [ ] Implement MachineControlReadout with explicit label/value/unit and null
  handling. Define accessible combined values but do not announce every
  high-frequency sample as a screen-reader alert. Respect the Doto size/scaling
  helpers, not a fixed canvas with clipped text.
- [ ] Implement GrindTool: large steady grind size, labelled size/RPM steppers
  while ready, read-only values while active, persistent READY/STARTING/GRINDING/
  STOPPING/UNKNOWN label, bottom Start/Stop. Omit finer/coarser arrows.
- [ ] Implement the small activity band using Reanimated UI-thread colour
  changes and the existing `flickerMsFor(rpm)` cadence. Never animate the full
  number, screen or Stop. Use `useReducedMotion` and the existing animation
  preference to hold the band steady; do not add a new preference solely for
  this feature. Stop the loop whenever the state is not confirmed running.
- [ ] Implement ScaleTool with the contract exercised above. Only the readout,
  machine context and Tare need prominence; no timer or fake stable indicator.
- [ ] Implement PourTool with a discriminated target/continuous request. Before
  start display TARGET VOLUME for target mode; during running use DISPENSED.
  Continuous has no volume field/fill indicator. Missing dispensed telemetry
  reads unavailable. Keep mode/flow/target read-only during running.
- [ ] Keep live temperature and pattern inline. Use app glyph numbering via the
  qualified adapter. Show pending/failed changes without hiding Stop; distinguish
  the temperature setpoint from measured temperature.
- [ ] Test button labels/enabled state, null versus zero, target versus
  continuous layout, pending/read-only controls, reduced motion and large text.
  Assert rendered output/accessibility, not removed RNTL child-prop APIs.
- [ ] Run those component files in both Jest projects, then commit.

## Task 7: Add the dedicated tool route

**Files:** create `app/machineTool.tsx`, `app/__tests__/machineTool.test.tsx`;
modify `app/_layout.tsx`.

- [ ] Define validated route params `{machineId, tool}`. Accept only the three
  ToolId values and a known saved machine ID. Invalid input renders an explicit
  error and Back; it does not reserve a session or send frames.
- [ ] Wire ScreenHeader, the shared controller hook and the departure guard to
  one module-scope tool component. Opening/re-rendering/remounting does not
  automatically call Start.
- [ ] Register `machineTool` with `headerShown: false`; use the app's own
  ScreenHeader and current navigation imports. Pin the operation to the ID
  carried by the route, not whatever device is now active.
- [ ] Keep the bottom action safe-area aware and reachable at enlarged text.
  If a live brew owns the machine, explain the blocker instead of starting a
  second session.
- [ ] Test route validation, no Start on entry, all three tool selections,
  serial/device mismatch, native Back guarding and wrong-generation responses.
- [ ] Run the route tests plus `hooks/__tests__/machineSlotOwner.test.tsx`;
  commit.

## Task 8: Build focused machine-setting editors

**Files:** create `MachineSettingsList.tsx`, `MachineSettingEditor.tsx`,
`app/machineSetting.tsx` and corresponding component/route tests;
modify `app/_layout.tsx`.

- [ ] Define the six SettingId routes from controlModel; keep each setting's
  proposal typed through SettingValues. Use a discriminated editor state,
  not `any`, a stringly value bag or casts between different unit/value kinds.
- [ ] Render summary rows: temperature unit, weight unit, brightness and water
  source under Machine settings; pour radius/vibration under Tuning. Show the
  reported value only for the matching machine and supported decoding.
- [ ] Keep unavailable settings named and explain missing qualification,
  unsupported firmware or missing readback. Do not select the first option
  as a default while the machine's current value is unknown.
- [ ] Implement unit/brightness choice editors and qualified numeric tuning
  editors with a separate current value, proposal and Apply. Use the
  per-capability allowed values, units and increments. No guessed reset.
- [ ] Give Water source a clear tank/plumbed explanation before Apply. Applying
  to the machine must not mutate the app's temperatureUnit preference.
- [ ] During Apply disable re-entrance, preserve identity, show pending and
  explicit failure, and reflect success only after fresh readback. Back with
  an unapplied proposal sends nothing; an in-flight Apply retains the owner
  until its outcome is known.
- [ ] Test that changing a proposal sends nothing, Apply invokes exactly one
  typed transaction, a missing response does not show success, disconnected
  values remain last-known/unavailable and one device cannot show another's
  readings.
- [ ] Run setting component/route tests and capability/controller tests; commit.

## Task 9: Wire the machine page and both discovery routes

**Files:** create `MachineTools.tsx`, `app/machineHome.tsx`,
`components/__tests__/MachineTools.test.tsx`,
`app/__tests__/machineHome.test.tsx`; modify
`components/MachinePanel.tsx`, `components/MachineSection.tsx`,
`app/index.tsx`, `app/settings.tsx`, `app/_layout.tsx` and existing tests.

- [ ] Implement MachineTools once, reused by home panel and machine page.
  Launch by explicit `{machineId, tool}`. Do not put an active instrument,
  duplicate tool logic or Start button in either launcher host.
- [ ] Implement machineHome with the four designed sections and summary-style
  settings index. Include connection status and actual firmware/model where
  reported. Name the exact selected machine even when another is connected.
- [ ] Reuse existing Manage/Forget sheets, their accessibility-covered guard
  and saved-machine permissions. Opening the page does not choose/connect a
  different machine; retain an explicit Use this machine now action.
- [ ] Add a clearly labelled Machine settings and tools action to each saved
  machine card in MachineSection. Keep Manage, connect, adding machines and
  seven-tap console access working.
- [ ] Add home panel launchers and a Machine settings and tools link, preserving
  refresh, Easy Mode, machine choice and dot long-press behaviour. When no
  machine is paired, direct the user to existing pairing rather than pass an
  empty target or connect to an arbitrary nearby machine.
- [ ] Register machineHome and machineSetting with their native headers off.
  Leave `/machine` and Labs diagnostic links unchanged.
- [ ] Test identical destinations from both launchers, one/multiple/no saved
  machines, disconnected/unsupported state and no extra controls on collapsed
  home. Extend existing MachinePanel/MachineSection/settings screen tests.
- [ ] Run the navigation, home panel, machine section and diagnostics tests
  together; commit.

## Task 10: Complete regression and real-device acceptance

**Files:** update `docs/machine-integration/ble-protocol.md`,
`docs/release-2.2.0-changes.md` and the accompanying design spec with exact
qualification/acceptance evidence; these files exist at the planning base.

- [ ] Run typecheck, lint, both Jest projects and Expo Doctor serially after
  focused tests pass:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
```

  Expected: existing CI gates pass. Resolve new failures without changing
  unrelated baseline expectations. Install dependencies only after a missing
  dependency failure or a manifest change; no installs are needed for this
  documentation-only planning checkpoint.
- [ ] On a qualified Studio, exercise all three tools, natural completion,
  repeated runs, Start/Stop races, Tare, live temperature/pattern changes and
  every qualified machine setting. Keep unsupported machine/firmware cases
  explicitly unavailable.
- [ ] Verify that each app exit path requires a confirmed Stop, including
  iOS interactive back, Android back and global brew-bar navigation. Confirm
  that leaving a stopped tool does not dispatch another Start.
- [ ] Exercise physical machine controls, app backgrounding, Bluetooth loss,
  process termination during a run and recovery on relaunch. Check that the
  local marker survives and that no reconnect silently restarts/switches.
- [ ] Regress ordinary coffee/tea brewing, pause/resume, machine switching and
  Easy Mode write/recovery ownership. No NFC encoding changed; retain existing
  NFC release gates without claiming simulator proof of hardware.
- [ ] Check small screens, large text, screen readers and Reduced Motion;
  inspect the grinder activity band on an actual device. Do not show giant
  flashing digits or a fake zero when telemetry disappears.
- [ ] Record tested firmware/device/capabilities and remaining unsupported
  cases. Restore original tuning/settings changed during qualification.
- [ ] Fetch `origin --no-prune`, run `npm run worktrees:check`, commit coherent
  checkpoints and push only the authorized task branch. No PR creation, merge,
  production build, deployment or cleanup without its separate permission.

## Documentation checkpoint

Stage exact task files, never all unrelated work. Save this planning checkpoint:

```bash
git diff --check
git add docs/superpowers/specs/2026-10-27-machine-tools-settings-design.md \
  docs/superpowers/plans/2026-10-27-machine-tools-settings.md
git commit -m "docs: plan machine tools and settings for issue 64" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Implementation checkpoints stage only the explicit paths listed by their
completed task and use descriptive subjects. Include the same co-author
trailer. Do not amend, rebase or rewrite another session's history.

## Handoff boundary

At planning handoff, report the exact documentation branch/worktree/base/head,
clean/dirty state and push state. Retain the worktree for plan execution,
owned by this task, with the documentation commit as its recovery pointer.
Browser mockups live in this Copilot session's files and are illustrations;
the committed spec is the portable design authority.

The user confirmed the concurrent owner is idle and requested serial
subagent-driven execution. Hardware gates remain open until actual captures
and device acceptance exist.
