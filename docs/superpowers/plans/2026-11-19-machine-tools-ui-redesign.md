# Machine Tools UI Redesign & Control Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the redesigned inline Home Machine Overlay (`Design 1`) and Unified Full Tool Screen (`Design 2`), plus seamless control lifecycle fixes (zero-flash entry, background idle exit with serialized re-entry, horizontal head-shake active refusal, immediate `STOP -> STOPPING…` feedback, dot-matrix cadence animations, and Reduce Motion fallbacks), verified 1:1 against the approved HTML visual design.

**Architecture:** Extract pure motion constants (`constants/motion.ts`), add serialized `closeInBackground()` to the shared `MachineControls` BLE owner, centralize per-session parameter drafts alongside `useMachineTool`, update `useMachineToolNavigation` (`mode === "tool"`) for non-blocking idle departure and head-shake active refusal, and build reusable Tamagui + Reanimated + `react-native-svg` instrument components (`ToolHeroStage`, `ToolParameterDeck`, `DotMatrixCadenceStrip`, `ToolHeadShakeView`) consumed by both `MachinePanel` (toned-down `palette.success` inline mode) and `/machineTool` (`palette.brand` 1.5 px rim + `palette.brandFill` Option A controls, strictly zero sheen).

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19 (React Compiler enabled), TypeScript 6, Tamagui 2.7, `react-native-reanimated` 4.5, `react-native-svg` 15, `expo-router`, Jest (`ios` + `android` projects), `@testing-library/react-native` v14.

**Canonical Visual Target:** `docs/superpowers/specs/2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html`  
**Design Specification:** `docs/superpowers/specs/2026-11-19-machine-tools-ui-redesign-design.md`  
**Baseline:** `origin/develop` (`45631160`) with `PR #300` (`c8d2dd45`) merged locally on `docs/machine-tools-ui-redesign-20261119`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `constants/motion.ts` | Add `TOOL_MOTION` constants (dot-matrix cadence cycles, stagger step, head-shake keyframes/duration, Reduce Motion pulse duration). |
| `library/machine/MachineControls.ts` | Add `closeInBackground()` with `closing: Promise<void> | null` tail; serialize `open()` behind in-flight `leaving` / `closing` so rapid close -> open transitions never collide with `"A control session is already owned."`. |
| `library/machine/controlDrafts.ts` | New pure TS in-memory store keyed by `{deviceId, serial, tool}` holding uncommitted `GrindRequest` / `PourRequest` drafts across Home inline expansion and `/machineTool` mode switches, plus session scale sample buffer (`<= 12` real `cupGrams` points). |
| `hooks/useMachineTool.ts` | Bind shared draft store & session scale sample ring; resolve candidate initial draft immediately while `phase === "entering"` so parameter controls render without plain-text flash; add clean `setMode` support cleanly even pre-ready. |
| `hooks/useMachineToolNavigation.ts` | For `mode === "tool"`: immediately navigate + call `closeInBackground()` when `phase === "closed" | "ready"`; block + increment `blockedCount` (`headShake` + notify) during `starting | running | stopping` or connected `unknown`; allow explicit disconnected-`unknown` escape prompt preserving recovery marker; keep `mode === "setting"` unchanged. |
| `components/DotMatrixCadenceStrip.tsx` | New Reanimated 16-dot status cadence wave strip (`switching` amber, `running` green, `stopping` coral, neutral resting) honoring `useReducedMotion()`. |
| `components/ToolHeadShakeView.tsx` | New Reanimated wrapper running damped horizontal head-shake (`TOOL_MOTION.headShakeOffsets`) when `shakeKey` increments; degrades to fast opacity pulse under `useReducedMotion()`. |
| `components/ToolHeroStage.tsx` | New shared hero readout card supporting `variant="full"` (`palette.surface`, `1.5px` `palette.brand` rim + glow, SVG dot-grid, **zero sheen**, white 54 pt Doto value, `palette.brand` unit & visualizer) and `variant="inline"` (toned-down `palette.raised`, `palette.success` border/unit/visualizer, 36 pt Doto value). Renders `burr-matrix` (using `flickerMsFor(rpm)`), `scale-spark` (genuine in-session readings only), or target `vessel-fill` dot-grid bar (never shown for `continuous`). |
| `components/ToolParameterDeck.tsx` | Shared parameter list (`Grind size`, `RPM`, `Scale stream`, `Mode`, `Target volume`, `Flow rate`, `Setpoint`, `Pattern` with `PourGlyph`), rendered full-layout immediately at rest opacity during `entering` (`zero flash`), themed cleanly with `palette.brandFill`/`onBrand` (full) or `palette.success`/`onFill` (inline). |
| `components/MachineControlReadout.tsx` | Upgrade `MachineToolActions` (`variant`: `"full" | "inline"`, `toolLabel`, immediate outlined `STOPPING <TOOL>…` visual state on `stopping`, explicit theme token ink via `palette.brandFill` / `onBrand` or `palette.success` / `onFill`, solid coral `STOP <TOOL>` via `palette.danger`). Keep `MachineControlReadout` & `MachineNumericControl` compatible. |
| `components/GrindTool.tsx` | Compose `ToolHeroStage`, `ToolParameterDeck`, and `MachineToolActions` (`variant?: "full" | "inline"`), preserving validation and zero-slop inline errors. |
| `components/ScaleTool.tsx` | Compose `ToolHeroStage`, `ToolParameterDeck`, and `TARE` action (`variant?: "full" | "inline"`), keeping `formatScaleGrams` (`0.1 g`) and honest `"Unavailable"` / `—` handling. |
| `components/PourTool.tsx` | Compose `ToolHeroStage`, `ToolParameterDeck`, and `MachineToolActions` (`variant?: "full" | "inline"`), preserving qualified live temp/pattern boundaries and continuous-mode no-progress/no-dispensed contract. |
| `components/MachinePanel.tsx` | Implement Option B Focused Inline Tool Mode inside `MachinePanel`: `GRIND | SCALE | POUR` launcher swaps vitals -> `STUDIO · WATER … · PRO` context bar, `↗` Expand, `✕` Collapse (idle background exit vs active head-shake + notify), green inline active tool deck (`ToolHeadShakeView`). |
| `app/index.tsx` | Pass shared machine identity/expand handler/active-collapse guard into `MachinePanel`; update `onMachinePress` (`MachineDot`) so tapping dot during active inline run shakes `MachinePanel` + notifies rather than hiding drawer underneath running motor/pump. |
| `app/machineTool.tsx` | Convert into Unified Instrument Screen with pinned `GRIND | SCALE | POUR` switcher (`ToolHeadShakeView`), `ScreenHeader` (`ToolHeadShakeView` on blocked `<`), single-route `switchTool` state + `router.setParams` sync, clean recovery banners (without AI-slop copy), disconnected escape prompt, and anchored bottom CTA dock. |

---

### Task 1: Centralize Tool Animation & Head-Shake Tokens (`constants/motion.ts`)

**Files:**
- Modify: `constants/motion.ts`
- Create: `constants/__tests__/toolMotion.test.ts` (or extend existing motion tests if present — verify first)

- [ ] **Step 1: Check existing motion tests**
  Run: `ls constants/__tests__ components/__tests__/*motion* 2>/dev/null || true`

- [ ] **Step 2: Write failing test for `TOOL_MOTION` tokens**
  Ensure all dot-matrix wave timings and head-shake keyframes exist in `constants/motion.ts` with positive finite timings and symmetric damped offsets ending at `0`.

- [ ] **Step 3: Run Jest on the new test to verify failure**
  Run: `npx jest --runTestsByPath constants/__tests__/toolMotion.test.ts`

- [ ] **Step 4: Add `TOOL_MOTION` to `constants/motion.ts`**
  ```ts
  export const TOOL_MOTION = {
      dotCount: 16,
      waveStepMs: 45,
      switchingCycleMs: 800,
      runningCycleMs: 960,
      stoppingCycleMs: 550,
      headShakeDurationMs: 420,
      headShakeOffsets: [-6, 6, -4, 4, -2, 0] as const,
      reducedPulseMs: DURATION.fast
  } as const;
  ```

- [ ] **Step 5: Run test to verify pass, then commit**
  Commit: `feat(motion): add shared machine tool wave and head-shake tokens`

---

### Task 2: Serialize Background Close & Tool Switching in `MachineControls`

**Files:**
- Modify: `library/machine/MachineControls.ts`
- Test: `library/machine/__tests__/MachineControls.test.ts`

- [ ] **Step 1: Write failing tests in `library/machine/__tests__/MachineControls.test.ts`**
  1. `closeInBackground()` immediately transitions snapshot to `leaving`, resolves `{kind: "exit"}` -> `"closed"` asynchronously, and ignores benign double calls while leaving.
  2. Calling `open(identity, "pour")` while `closeInBackground()` on `"grind"` is still awaiting `{kind: "exit"}` queues cleanly behind `this.closing` and opens `"pour"` after `{kind: "exit"}` returns `"closed"`, without throwing `"A control session is already owned."`.
  3. If the in-flight `closeInBackground()` fails (`phase === "unknown"`), an awaiting `open()` rejects with uncertainty and never double-opens.
  4. Calling `closeInBackground()` while `phase` is moving (`running`, `starting`, `stopping`, `unknown`) rejects/refuses safely without dropping the lease.

- [ ] **Step 2: Run `MachineControls.test.ts` to verify failure**
  Run: `npx jest --runTestsByPath library/machine/__tests__/MachineControls.test.ts`

- [ ] **Step 3: Implement `private closing: Promise<void> | null = null;` and `closeInBackground()` in `MachineControls.ts`**
  - Extract `performClose()` updating `phase: "leaving"`, storing promise in `this.closing`, awaiting `{kind: "exit"}` -> release -> `closeSessionToRestoredSettings()`, catching to `uncertain`, clearing `this.closing` in `finally`.
  - `close()` delegates to `performClose()` (idempotent when `this.closing` already matches).
  - `closeInBackground()` initiates `performClose()` if `phase === "ready"` (no-op if `"closed"`), returning the promise so non-UI callers can observe completion while callers doing fire-and-forget navigate immediately cleanly; reject on active/uncertain phases (`starting`, `running`, `stopping`, `unknown`).
  - In `open(identity, tool, signal)`: before checking `this.snapshot.phase !== "closed"`, if `this.closing` is non-null, register under `this.preflight` key (or await `this.closing` cleanly inside serialized preflight queue, checking `signal?.aborted` & `this.disposed` right after!), then proceed only when `phase === "closed"`.

- [ ] **Step 4: Run `MachineControls.test.ts` & `Machine.controls.test.ts` to verify pass, then commit**
  Commit: `feat(machine-controls): support non-blocking background exit and serialized re-open`

---

### Task 3: Shared Draft Store & Zero-Flash Entry in `useMachineTool`

**Files:**
- Create: `library/machine/controlDrafts.ts`
- Modify: `hooks/useMachineTool.ts`
- Create/Update Test: `hooks/__tests__/useMachineControls.test.tsx` (or `hooks/__tests__/useMachineTool.test.tsx`)

- [ ] **Step 1: Write failing tests for shared draft persistence, session scale sample trace, and synchronous pre-ready seed**
  - Editing Grind/Pour draft in one hook instance (e.g., Home Inline) makes that edited draft immediately available in another hook instance (e.g., expanded `/machineTool`) for the same `{deviceId, serial, tool}` key.
  - While `phase === "entering"`, `useMachineTool` already returns valid pre-seeded `grind` / `pour` (or carried-over shared draft) whenever qualification policy allows, so tool controls never flash plain `"Unavailable"` text!
  - Switching saved machine `identity` resets stale drafts cleanly.
  - Scale session records only genuine `cupGrams` values into a bounded ring (`<= 12`) cleared when Scale closes or `cupGrams` turns `null`/stale.

- [ ] **Step 2: Run new hook tests to verify failure**

- [ ] **Step 3: Implement `library/machine/controlDrafts.ts` and wire `hooks/useMachineTool.ts`**
  - Keep React Compiler rules intact (destructure args cleanly, no `set-state-in-effect`, subscribe to shared draft revision store cleanly via `useSyncExternalStore` or pass controller/shared store cleanly!).
  - Notice: subscribe via `useSyncExternalStore` to a small external `ControlDraftStore` attached per `MachineControls` instance (via `WeakMap<MachineControls, ControlDraftStore>` — disposed cleanly with `MachineControls` / keyed by identity!) so multiple `MachineControls` instances in tests remain 100% isolated!! **CRITICAL TEST ISOLATION WIN (`WeakMap<MachineControls, ...>` guarantees tests never bleed state across fake controllers)!**

- [ ] **Step 4: Run hook tests to verify pass, then commit**
  Commit: `feat(machine-tools): share draft edits and scale samples across inline and full views`

---

### Task 4: Non-Blocking Idle Departure & Head-Shake Refusal Guard (`useMachineToolNavigation.ts`)

**Files:**
- Modify: `hooks/useMachineToolNavigation.ts`
- Update Test: `hooks/__tests__/useMachineToolNavigation.test.tsx`

- [ ] **Step 1: Update & write failing tests in `hooks/__tests__/useMachineToolNavigation.test.tsx`**
  - In `mode === "tool"`:
    - Idle (`phase === "ready"`): `requestDeparture(navigate)` & `usePreventRemove` / `useLiveBrewBarGuard` call `navigate()` synchronously on the press, fire `{kind: "exit"}` via `closeInBackground()`, and NEVER mount `"Leave tool?"` sheet or block UI.
    - Failed background exit (`"ready"` -> exit errors after departure): `controls.getSnapshot().phase` becomes `"unknown"`, `controlBlocker` stays set, and no motor Stop is sent.
    - Moving (`starting | running | stopping`) or connected `unknown`: `requestDeparture` / back / swipe-back does NOT navigate, increments `blockedCount`, invokes `onBlocked`, NEVER opens the blocking `"Leave tool?"` modal sheet (and preserves lease).
    - Disconnected `unknown` (`support.reconnectable`): still provides explicit safe `prompt` escape (`Leave screen — keep recovery warning` / `Reconnect` / `Stay`) preserving `controlRecovery.marker` on local storage.
    - `mode === "setting"`: preserves existing confirmation & synchronous recovery/close behavior.

- [ ] **Step 2: Run tests to verify failure cleanly**

- [ ] **Step 3: Implement `useMachineToolNavigation.ts` updates cleanly**
  - Respect React Compiler & `useLayoutEffect` safety rules (`current()`, unmount cancellation).

- [ ] **Step 4: Run `useMachineToolNavigation.test.tsx` to verify pass, then commit**
  Commit: `feat(machine-tools): non-blocking idle departure and active-run refusal guard`

---

### Task 5: Build `DotMatrixCadenceStrip` & `ToolHeadShakeView` Primitives

**Files:**
- Create: `components/DotMatrixCadenceStrip.tsx`
- Create: `components/ToolHeadShakeView.tsx`
- Create Test: `components/__tests__/toolMotionComponents.test.tsx`

- [ ] **Step 1: Write failing RNTL v14 tests**
  - `DotMatrixCadenceStrip`: renders 16 dot cells, selects semantic colour from `useAppearance().palette` (`warn` on `entering`, `success` on `running`, `danger` on `stopping`, subtle `line` on `ready`/`idle`), exposes `testID="tool-cadence-strip"`, honors `useReducedMotion()` without crashing or leaking raw hexes.
  - `ToolHeadShakeView`: renders children, responds to `shakeKey` increments with `useSharedValue`/`withSequence` horizontal offsets (`TOOL_MOTION.headShakeOffsets`) when motion allowed and opacity pulse (`TOOL_MOTION.reducedPulseMs`) under `useReducedMotion()`.

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement both components cleanly at module scope using `react-native-reanimated` and `TOOL_MOTION` / `useAppearance()`**
  - Verify `React Compiler` compliance: drive `shakeKey` changes cleanly inside `useEffect` mutating only Reanimated shared values (never React `setState` inside effect!).
  - Verify zero hardcoded hex colours (`appearanceBoundary.test.ts`).

- [ ] **Step 4: Run tests + `appearanceBoundary.test.ts` to verify pass, then commit**
  Commit: `feat(ui): add dot-matrix cadence strip and head-shake refusal view`

---

### Task 6: Build `ToolHeroStage`, `ToolParameterDeck`, & Upgraded `MachineToolActions`

**Files:**
- Create: `components/ToolHeroStage.tsx`
- Create: `components/ToolParameterDeck.tsx`
- Modify: `components/MachineControlReadout.tsx`
- Create/Update Tests: `components/__tests__/ToolStageAndDeck.test.tsx`, `components/__tests__/MachineTools.test.tsx`

- [ ] **Step 1: Write failing tests matching exact HTML spec (`06-full-and-inline-final.html`)**
  - `ToolHeroStage`:
    - `variant="full"`: uses `palette.surface`, `borderWidth={1.5}` + `borderColor={palette.brand}`, `react-native-svg` dot-grid overlay, **no gradient sheen layer**, primary `DotMatrixText` in `palette.text`, unit & meters in `palette.brand`.
    - `variant="inline"`: uses flat `palette.raised`, thin `mix(palette.raised, palette.success, 0.42)` border, compact `36 pt` numeral, unit & meters in `palette.success`, no glow halo.
    - Renders semantic status label (`READY`, `SWITCHING TO POUR…`, `POURING · 3.0 ML/S`, `GRINDING · 90 RPM`, `LIVE SCALE`, `STOPPING…`), Grind 12-cell `burr-matrix` (flicker via `flickerMsFor(rpm)` only when running + animated), Scale `scale-spark` ONLY from `samples.length >= 2` (baseline otherwise, never invented data), Pour `vessel-fill` dot-grid bar ONLY for `mode === "target"` (`Math.min(1, dispensedMl / volumeMl)` during run, subdued target preview before run; hidden completely in `continuous` mode!).
  - `ToolParameterDeck`:
    - Immediately renders full `Stepper` and segment rows during `phase === "entering"` (`opacity: 0.55`, non-editable/disabled) with **zero** plain-text swap flash.
    - Uses `palette.brandFill` + `onBrand.text` on active segment buttons when `variant="full"`, and `palette.success` + `onFill(palette.success).text` when `variant="inline"`.
    - Uses `PourGlyph` on `Centred | Circular | Spiral`.
  - `MachineToolActions`:
    - Renders `START <TOOL>` (`variant` accent tokens) when idle/ready, disabled `ENTERING <TOOL>…` during `entering`, solid `palette.danger` `STOP <TOOL>` during `starting | running | unknown`, and immediate **outlined `STOPPING <TOOL>…`** (`borderWidth={1}`, `borderColor={palette.danger}`, `color={palette.danger}`, `disabled`) during `stopping`.

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement `ToolHeroStage.tsx`, `ToolParameterDeck.tsx`, and `MachineControlReadout.tsx`**
  - Verify `DotMatrixText fontSize >= 11` everywhere.
  - Verify accessibility (`accessibilityLabel` on `MachineControlReadout`, no `liveRegion` spam, large font wrapping).
  - Verify React Compiler & `appearanceBoundary.test.ts` pass cleanly (derive tint mixes with exported `mix` from `@/constants/colors` + runtime `palette.*`, zero raw hexes).

- [ ] **Step 4: Run component + appearance tests to verify pass, then commit**
  Commit: `feat(ui): add unified ToolHeroStage, ToolParameterDeck, and STOPPING action states`

---

### Task 7: Refactor `GrindTool`, `ScaleTool`, and `PourTool` Around Shared Components

**Files:**
- Modify: `components/GrindTool.tsx`
- Modify: `components/ScaleTool.tsx`
- Modify: `components/PourTool.tsx`
- Update Test: `components/__tests__/MachineTools.test.tsx`

- [ ] **Step 1: Update failing expectations in `components/__tests__/MachineTools.test.tsx`**
  - Update expectations where UI copy/states upgraded intentionally (`START GRIND`/`STOP GRIND`/`STOPPING GRIND…`, `Until stopped` segment label, `entering` dimmed controls instead of hidden text flash, `scaleSamples` optional prop).
  - Preserve ALL qualification/safety assertions (unavailable vs `0`, continuous Pour never showing `DISPENSED` / `TARGET VOLUME` / `progressbar`, unqualified live temp/pattern disabled, pending vs confirmed setpoint separation, `formatScaleGrams` `0.1 g` rounding, `Scale` never showing `0.0` when `null`).

- [ ] **Step 2: Refactor `GrindTool.tsx`, `ScaleTool.tsx`, and `PourTool.tsx`**
  - Add optional `variant?: "full" | "inline"` (default `"full"`).
  - Compose `ToolHeroStage` + `ToolParameterDeck` cleanly inside bounded layout (`flex={1} minHeight={0}` in `"full"` mode, compact flex/natural flow in `"inline"` mode) + bottom-anchored CTA outside the scroll container (`"full"`) or docked cleanly at the base of the inline card (`"inline"`).
  - Strip AI-slop helper sentences; display crisp explanations ONLY on actual `error` or `unavailable` blockers.

- [ ] **Step 3: Run `MachineTools.test.tsx` & `appearanceBoundary.test.ts` to verify pass, then commit**
  Commit: `refactor(machine-tools): unify Grind, Scale, and Pour components across variants`

---

### Task 8: Design 1 — Home Inline Tool Overlay (`MachinePanel.tsx` & `app/index.tsx`)

**Files:**
- Modify: `components/MachinePanel.tsx`
- Modify: `app/index.tsx`
- Update Tests: `components/__tests__/MachinePanel.test.tsx`, `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write failing tests in `MachinePanel.test.tsx` & `index.test.tsx`**
  - Connected `MachinePanel` initially shows `WATER`, `MODE`, `REFRESH`, and `GRIND | SCALE | POUR` launcher.
  - Tapping `GRIND`, `SCALE`, or `POUR` swaps idle vitals out into Focused Inline Tool Mode (`Option B`): shows single-line context bar (`<MODEL_OR_MACHINE> · WATER … · <MODE>`), `↗` Expand button, `✕` Collapse button, active green launcher tabs, green `ToolHeroStage (inline)` + compact `ToolParameterDeck` + inline CTA, triggering `controls.open` automatically.
  - Tapping `↗` calls `onExpandTool(machineId, tool)` (navigating to `/machineTool`) without stopping any active run.
  - Tapping `✕` when idle (`ready` / `closed`) exits inline tool mode cleanly immediately and calls `controls.closeInBackground()`.
  - Tapping `✕`, switching inline tool tabs, OR tapping Home `MachineDot` when `starting | running | stopping | unknown` keeps the inline panel open, triggers `ToolHeadShakeView` shake (`shakeKey` increment), and shows a crisp `notify` notice (`Stop <tool> before collapsing` / `Stop <tool> before switching tools`) without dropping the BLE lease!
  - Existing Home vitals (`WATER`, `PRO`, `4 MIN AGO`, `TRY NOW`, `Last seen`) continue working unchanged when inline mode isn't open.

- [ ] **Step 2: Run `MachinePanel.test.tsx` & `index.test.tsx` to verify failure cleanly**

- [ ] **Step 3: Implement Focused Inline Tool Mode in `MachinePanel.tsx` and wire Home guard/navigation in `app/index.tsx`**
  - Wait: check test compatibility! Does `MachinePanel.tsx` work cleanly inside tests that render `<MachinePanel ... />` directly *without* a live connected `Machine` (e.g., `MachinePanel.test.tsx` mounts `<MachinePanel open status="connected" vitals={...} machineId="m1" />` using `useMachineControls()` singleton)?
    - Remember: only subscribe/call `useMachineControls(injected)` safely so `MachinePanel` renders vitals when inline tool is closed (`activeTool === null`) cleanly in tests, AND accept optional `controls?: MachineControls` + `onExpandTool?: (machineId: string, tool: ToolId) => void` props for clean dependency injection in unit tests!
    - Also: what if `PR #300`'s `useMachineTool` auto-vitals refresh is triggered? Keep vitals context bar updated dynamically from `vitals`.
  - In `app/index.tsx`: add inline-active state check on `onMachinePress` (`MachineDot`): if `popoverOpen && inlineActiveToolMoving`, trigger `inlineShake` + `notify({tone: "info", message: ...})` instead of `setPopoverOpen(false)`! If `popoverOpen && inlineToolIdle`, close panel & fire `closeInBackground()`.

- [ ] **Step 4: Run `MachinePanel.test.tsx`, `index.test.tsx`, `machineHome.test.tsx`, & `Collapsible.test.tsx` to verify pass, then commit**
  Commit: `feat(home): add toned-down green inline tool overlay to MachinePanel`

---

### Task 9: Design 2 — Unified Full Tool Screen (`app/machineTool.tsx` & `components/MachineTools.tsx`)

**Files:**
- Modify: `app/machineTool.tsx`
- Modify: `components/MachineTools.tsx` (verify route/params clean when launched from `machineHome.tsx`)
- Update Test: `app/__tests__/machineTool.test.tsx`

- [ ] **Step 1: Update & write failing tests in `app/__tests__/machineTool.test.tsx`**
  - Screen renders `ScreenHeader` (`Machine Tools` / machine name + serial), pinned `GRIND | SCALE | POUR` switcher, active tool view with full `#FF007F` C-rim hero (`variant="full"`), zero slop copy (`Selected values...` gone).
  - Entering (`phase === "entering"`) immediately displays dimmed parameter deck controls with zero plain-text flash, while showing the amber switching wave cleanly.
  - Switching between `GRIND`, `SCALE`, `POUR` when idle serializes `closeInBackground()` -> `open(identity, nextTool)` cleanly with `routeKey` updates without pushing duplicate navigation stack entries!
  - Tapping `<` Back or swipe-back (`usePreventRemove`) when `ready`: navigates immediately in 1 step and triggers background exit without modal confirmation.
  - Tapping `<` Back, swipe-back, or switching tools when `starting | running | stopping`: stays put, increments head-shake key on `ScreenHeader` or mode switcher, and emits concise toast notice (`Stop <tool> before leaving` / `Stop <tool> before switching tools`) with NO modal blocker!
  - When `phase === "unknown"` AND disconnected (`support.reconnectable`): renders clean inline reconnect card + escape hatch (`Leave screen — keep recovery warning`) so user is never trapped while keeping `controlRecovery.marker` persisted!
  - Expanding from Home Inline (`Design 1`) onto `/machineTool` (`Design 2`) with edited request parameters shows those exact edited parameters on mount.

- [ ] **Step 2: Run `app/__tests__/machineTool.test.tsx` to verify failure**

- [ ] **Step 3: Implement Unified Full Tool Screen in `app/machineTool.tsx`**
  - Track active `tool` smoothly cleanly in local state initialized from URL param `tool` and synced cleanly without extra stack pushes (`router.setParams` if available cleanly in production / local state fallback).
  - Note: in `app/machineTool.tsx` line 128 previously `<ToolScreen key={JSON.stringify([identity, tool])} ... />` remounted the whole screen on `tool` param change! Change key to `JSON.stringify(identity)` so switching tabs inside the unified instrument **never unmounts `ScreenHeader` or `switcher`** (eliminating screen-flicker on tab switch!) while `useMachineTool` swaps cleanly across `tool` changes!

- [ ] **Step 4: Run `app/__tests__/machineTool.test.tsx` & `machineHome.test.tsx` to verify pass, then commit**
  Commit: `feat(machine-tool): unify full tool screen with mode switcher and zero-flash deck`

---

### Task 10: Mandatory Side-by-Side Visual Adherence Verification & Full Repo CI Audit

**Files:**
- Verify (no feature edits unless visual/test audit uncovers a real defect): all files touched in Tasks 1–9 against `docs/superpowers/specs/2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html` and `docs/superpowers/specs/2026-11-19-machine-tools-ui-redesign-design.md`.

- [ ] **Step 1: Run full automated checks across both platforms (`ios` + `android`) & boundaries**
  - Run: `npm run typecheck`
  - Run: `npm run lint`
  - Run: `npm test` (both `ios` and `android` Jest projects!)
  - Run: `npm run test:import-node`
  - Run: `npx expo-doctor`
  - Run: `git fetch origin --no-prune && npm run worktrees:check`

- [ ] **Step 2: Execute HTML-vs-Built-UI Visual Adherence Check**
  - Render/screenshot reference `docs/superpowers/specs/2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html` cleanly using Chrome headless / browser preview AND build/render the RN UI screens (`npx expo export` / web/simulator screenshot or component layout & token visual audit against every item in the spec checklist: zero sheen, `1.5px` `palette.brand` rim on full hero only, white Doto numbers, `#D10069` Option A full controls vs green `palette.success` inline overlay, immediate `STOP -> STOPPING…` flip, `entering` zero-flash controls, dot-matrix wave strips, head-shake active guard, Reduced Motion fallback, dynamic font wrapping).
  - Fix any visual discrepancy found, re-run full tests & visual verification cleanly, and commit.

- [ ] **Step 3: Final audit & clean handoff preparation**
  - Check `git diff c8d2dd45...HEAD --stat` to confirm pure redesign delta + specs/plans with zero stray debug files, secrets, or scratch edits in repo.
  - Check `git fetch origin --no-prune && npm run worktrees:check` and `git status --short --branch`.
