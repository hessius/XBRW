# Machine tools UI redesign & control workflow

**Date:** 2026-11-19  
**Task branch:** `docs/machine-tools-ui-redesign-20261119`  
**Canonical visual source of truth:** [`06-full-and-inline-final.html`](2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html)  
**Predecessor safety & qualification spec:** [`2026-10-27-machine-tools-settings-design.md`](2026-10-27-machine-tools-settings-design.md)

## Purpose, scope & sequencing

Redesign the standalone Machine Tools UX (`Grind`, `Scale`, `Pour`) to turn the functional prototype from `#64` into an intentional, cohesive hardware interface on top of the app's existing Doto + OLED aesthetic, while fixing the workflow friction discovered during device testing.

Specifically, this design delivers:

1. **Design 1 — Home Inline Tool Overlay (`MachinePanel`)**: Toned-down inline tool operation inside the Home machine status panel, accented with machine status green (`palette.success`), featuring focused mode swapping and one-tap expansion (`↗`) to the full screen.
2. **Design 2 — Unified Full Tool Screen (`/machineTool`)**: One dedicated instrument screen unifying `GRIND | SCALE | POUR` under `ScreenHeader` via a pinned mode switcher, pairing Option A dark OLED hierarchy & `palette.brandFill` controls with the crisp `1.5px` `palette.brand` hero card rim (no sheen gradients).
3. **Workflow & feedback fixes across both views**:
   - Eliminate the non-interactive plain-text flash when opening/entering a tool (`entering` -> `ready`).
   - Remove redundant instructional boilerplate copy ("Selected values are an editable proposal...", unnecessary `READY` explanations, etc.).
   - Allow **immediate non-blocking exit** when leaving/collapsing an idle tool (`phase === "ready"`), running BLE tool exit (`{kind: "exit"}`) cleanly in the background with serialized re-entry.
   - Block accidental departure, panel collapse, or tool switching during active work (`starting`, `running`, `stopping`, `unknown`) with a crisp **horizontal head-shake refusal animation** (`headShake`) and concise toast/banner.
   - Add an unmistakable visual transition on `Stop` tap (**solid coral `STOP` -> outlined `STOPPING…`** immediately while awaiting BLE confirmation).
   - Add on-brand **dot-matrix wave cadence animations** during `entering` (switching tools), `running`, and `stopping`, with full Reduce Motion fallbacks.

### Branch & dependency sequencing

`PR #300` (`fix/machine-tools-qualified-readback-20261117`) is currently open against `develop` and owns protocol/qualification repairs (auto-opening tools on entry, auto-fetching machine vitals, `0.1 g` scale formatting, targeted/continuous pour stop & dispense telemetry fixes, and initial `MachinePanel` row trimming).  
Implementation of this UI redesign **must merge after or rebase onto `develop` once `PR #300` lands**, inheriting those hardware qualification fixes cleanly rather than duplicating them here.  
All hardware safety, qualification, recovery-marker, and `/machineSetting` contracts from `2026-10-27-machine-tools-settings-design.md` remain in full force. `/machineSetting` and its focused editors are visually unchanged.

---

## Saved visual design artefacts (audit trail)

All HTML brainstorming screens for this session are tracked in [`docs/superpowers/specs/2026-11-19-machine-tools-ui-visual/`](2026-11-19-machine-tools-ui-visual/):

1. [`01-inline-overlay-layout.html`](2026-11-19-machine-tools-ui-visual/01-inline-overlay-layout.html) — Round 1: Inline Home overlay layout options -> selected **Option B (Focused Tool Mode Swap)**.
2. [`02-unified-tool-directions.html`](2026-11-19-machine-tools-ui-visual/02-unified-tool-directions.html) — Round 2: Unified full-screen layout & visual directions (`A`, `B`, `C`).
3. [`03-brand-pink-comparison.html`](2026-11-19-machine-tools-ui-visual/03-brand-pink-comparison.html) — Round 3: Brand pink contrast study comparing `A`, `B1` (`brandFill` `#D10069`), and `B2` (`brand` `#FF007F`).
4. [`04-option-a-neon-tuning.html`](2026-11-19-machine-tools-ui-visual/04-option-a-neon-tuning.html) — Round 4: Three calibrated levels on Option A (`A0` baseline, `A1` neon controls + sheen, `A2` neon hero VFD + C-rim).
5. [`05-final-unified-preview.html`](2026-11-19-machine-tools-ui-visual/05-final-unified-preview.html) — Round 5: Hybrid preview with animated active sheen before final refinement.
6. [`06-full-and-inline-final.html`](2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html) — **Approved Canonical Design**: Home Inline Overlay (toned-down machine status green) alongside Unified Full Tool Screen (Option A + `1.5px` `#FF007F` top card outline, zero sheen, dot-matrix cadence animations).

---

## Visual system & token mapping

Implementations must strictly use appearance tokens from `constants/colors.ts` / `useAppearance()` (never raw hex literals in components or stylesheets). All pairings below work across both Dark (`original`) and Light/Blue/Magenta appearance themes.

| Surface / element | Home Inline Overlay (`Design 1`) | Full Tool Screen (`Design 2`) |
| --- | --- | --- |
| Primary screen / container ground | `palette.surface` (`MachinePanel` card) | `palette.base` |
| Mode switcher bar & parameter deck container | Neutral (`palette.raised`, `palette.line` border) | `palette.surface`, `1px` `palette.line` border |
| Hero / telemetry readout stage container | Flat `palette.raised`, `1px` `palette.success` border (~42% opacity via helper/border colour), **no outer halo glow** | Flat `palette.surface`, **`1.5px` `palette.brand` rim** + subtle `palette.brand` outer glow, **`palette.brand` low-opacity dot-grid overlay**, **zero sheen gradients** |
| Primary telemetry numeral (`48`, `18.4 g`, `150 ml`) | `palette.text` (`DotMatrixText` compact 36 pt scale) | `palette.text` (`DotMatrixText` 54–56 pt prominent) |
| Telemetry unit (`g`, `ml`) & visualizer bars/dots | `palette.success` | `palette.brand` |
| Hero top kicker label (`SELECTED SIZE`, etc.) | `palette.muted` | `palette.muted` |
| Active mode switcher / launcher tab | Outlined `palette.success` + subtle tinted fill (`palette.success` text) | Solid `palette.brandFill` fill + `onBrand.text` ink (`#FFFFFF` in `original` / `light`) |
| Selected segment pills (`Target`, pattern) & `START` / `TARE` | `palette.success` fill + `onFill(palette.success).text` ink | `palette.brandFill` fill + `onBrand.text` ink |
| Active `STOP` button (`starting` / `running`) | `palette.danger` fill + `onFill(palette.danger).text` ink | `palette.danger` fill + `onFill(palette.danger).text` ink |
| Immediate `STOPPING…` button (`stopping`) | `palette.raised` fill + `1px` `palette.danger` border + `palette.danger` ink (non-interactive) | `palette.raised` (or soft `danger` tint) + `1px` `palette.danger` border + `palette.danger` ink (non-interactive) |
| Dot-matrix wave strip states | `warn` (`entering`/`switching`), `success` (`running`), `danger` (`stopping`) | Same semantic cadence strip inside hero stage |

**Hard visual rules:**
1. **Zero sheen**: Neither the Full Tool hero stage nor the Home Inline card uses diagonal gleam sweeps, top specular highlights, or radial sheen gradients—either at rest or during active runs.
2. **Colour restraint by context**:
   - Home remains library-first; the inline overlay stays understated in `palette.success` (`#5DDC8A` in `original`, theme-resolved otherwise) so it never fights the bright Coffee/Tea recipe cards below it.
   - Brand magenta (`palette.brand` / `palette.brandFill`) is reserved for the dedicated Full Tool hardware instrument (`/machineTool`).
3. **Button state distinction**: Tapping `STOP` mutates visuals **on press frame 1** (before BLE stop finishes) from solid `palette.danger` (`STOP <TOOL>`) into the outlined `STOPPING <TOOL>…` danger box.

---

## Design 1 · Home Inline Tool Overlay (`MachinePanel`)

### Trigger & entry (`Option B · Focused Tool Mode Swap`)

- On Home (`app/index.tsx` -> `HomeHeader` -> `MachinePanel`), `MachinePanel` retains its compact connected state (`WATER`, `MODE`, `REFRESH`, launcher row `GRIND | SCALE | POUR`, optional `A B C · EASY MODE` on `develop` / `MachinePanel` layout after `PR #300`).
- Tapping `GRIND`, `SCALE`, or `POUR` when connected no longer pushes `/machineTool` away from the recipe library immediately. Instead, `MachinePanel` switches into **Focused Inline Tool Mode** inside the collapsible panel:
  1. The idle vitals rows (`WATER`, `MODE`, `REFRESH`, `EASY MODE`) collapse smoothly out of the panel and are replaced at the top of `MachinePanel` by a crisp single-line context bar (`CONNECTED` fallback if vitals/model aren't populated yet):  
     `<GREEN_DOT> <MACHINE_MODEL_OR_LABEL ?? "MACHINE"> · WATER <OK|PLUMBED|LOW> · <PRO|EASY>`
  2. Two icon-sized (`>= 44×44` hit slop / touch target) header actions sit at the right of that context bar:
     - **`↗` (`Expand`)**: Navigates immediately to `/machineTool?machineId=<id>&tool=<activeTool>`, handing off the active BLE session and uncommitted draft cleanly (including while `RUNNING` without interrupting the motor/pump).
     - **`✕` (`Collapse`)**: If idle (`ready` / `closed`), collapses back to the vitals panel immediately and triggers background BLE exit; if active/uncertain (`starting`, `running`, `stopping`, `unknown`), blocks collapse with the horizontal **head-shake refusal**.
  3. Below the context bar, `GRIND | SCALE | POUR` remains pinned as a 3-column tab row so the user can switch inline tools or re-trigger the current tool directly inside `MachinePanel` (same active-run switch guard as Design 2).
  4. Below the launcher row sit the toned-down green **Inline Readout Card** (`36 pt` Doto value + green dot-matrix visualizer + 16-dot cadence strip), the compact parameter rows (`Stepper` / `Target` / `Continuous` / live temp & pattern pills when scrollable inside a bounded max-height container if Pour parameters exceed viewport), and the fixed bottom inline CTA (`START <TOOL>` / `STOP <TOOL>` / `STOPPING <TOOL>…` / `TARE`).

### Home `MachineDot` collapse safety

In `app/index.tsx`, tapping the top-right `MachineDot` normally toggles `popoverOpen`. While an inline tool inside `MachinePanel` is moving or uncertain (`starting`, `running`, `stopping`, `unknown`):
- Tapping `MachineDot` **must not** close `MachinePanel`. It triggers the same horizontal head-shake refusal on `MachinePanel` and shows a crisp notice (`Stop <tool> before hiding panel`).
- Tapping `MachineDot` while an inline tool is idle (`ready`) collapses the inline panel cleanly and invokes background BLE exit identically to pressing `✕`.

---

## Design 2 · Unified Full Tool Screen (`/machineTool`)

### Navigation & entry points

- `MachineTools` on a named machine's page (`app/machineHome.tsx`) and `↗` Expand inside Home's inline `MachinePanel` both route to `/machineTool?machineId=<id>&tool=<grind|scale|pour>`.
- `app/machineTool.tsx` renders **one unified instrument layout** (`ScreenHeader` with `<` Back + machine title/serial subtitle, pinned **`GRIND | SCALE | POUR`** mode switcher, bounded instrument body `ScrollView`, and bottom-pinned primary CTA dock outside the scroller so `Stop` never scrolls off screen).
- Switching tools via the `GRIND | SCALE | POUR` switcher calls an internal `switchTool(nextTool)` handler (updating active route/tab state cleanly rather than stacking multiple `/machineTool` routes on the back stack, so pressing `<` Back always exits back to where the user came from in one tap!).

### Per-tool presentation (`heroStage` + `paramDeck`)

All three tools render inside the shared `#101010` + `1.5px` `#FF007F` hero card and `#101010` parameter deck:

- **Grind**:
  - Hero kicker: `SELECTED SIZE`; main Doto number: `grindSize` (kept steady, never animated); visualizer: 12-block `burr-matrix` in `palette.brand` that uses the existing RPM-derived cadence (`flickerMsFor(rpm)`) only when confirmed `running` (`animationEnabled && !reducedMotion`); sub-readout: `RPM <rpm>` · operational cue (`BURR CALIBRATED` / status).
  - Deck rows: `Grind size` (`Stepper`, locked outside `ready`), `RPM` (`Stepper`, locked outside `ready`).
- **Scale**:
  - Hero kicker: `LIVE WEIGHT`; main Doto number: confirmed `cupGrams` rounded to 1 decimal (`18.4 g`) or `—` while entering/missing (never fabricated `0.0`); visualizer: `scale-spark` dot/bar trace rendered strictly from recent in-session `cupGrams` observations (muted flat baseline when fewer than 2 live samples have arrived or telemetry is missing—never synthetic bars); sub-readout: `0.1 G PRECISION · GRAMS`.
  - Deck row: `Scale stream` status row (`ACTIVE` in `palette.success` when live); dock CTA: `TARE` (disabled while `entering` or `applying`, showing `ENTERING SCALE…` / `TARING…`).
- **Pour**:
  - Hero kicker: `TARGET VOLUME` before run (or `DISPENSED` while `starting`/`running`/`stopping`/`unknown` in Target mode; `CONTINUOUS POUR` / `DISPENSED` in `Until stopped` mode); main Doto number: target mL or qualified `dispensedMl` (`—` if telemetry hasn't arrived yet; `∞` when pre-start continuous); visualizer: `vessel-fill` dot-grid fill bar in Target mode driven strictly by qualified `dispensedMl / volumeMl` during active runs (and previewed cleanly against target at rest; omitted / non-filling indicator in `Until stopped` mode so no target or progress is invented).
  - Deck rows: `Mode` (`Target` / `Until stopped` segments, locked outside `ready`), conditional `Target volume` (`Stepper`, hidden in `Until stopped`, locked outside `ready`), `Flow rate` (`Stepper`, locked outside `ready`), `Setpoint` (`Stepper`, editable both in `ready` and live during `running` only when `liveTemperature.qualified` and not pending), `Pattern` (`Centred | Circular | Spiral` segments with `PourGlyph`, editable in `ready` and live during `running` only when `livePattern.qualified` and not pending).

---

## Control lifecycle, zero-flash entry & exit guarantees

### 1. Immediate parameter mounting (zero text flash during `entering`)

Historically, `PourTool` and `GrindTool` swapped plain `Text` readouts (`"Target"`, `"Unavailable"`) during `phase === "entering"` to `Stepper` & segmented `Button` controls only once `phase === "ready"`, causing a jarring visual flash on screen open and tool switches.

**Fix:**
- Resolve the candidate initial/carried-over draft synchronously on mount/tool switch (from the shared draft store / last known machine policy profile) BEFORE `open()` settles.
- While `phase === "entering"`:
  - Render the exact final **`Stepper` and segment button hierarchy immediately**, styled at subdued resting opacity (`0.55`, `disabled`) so geometry never shifts when `ready` arrives.
  - Display the `warn`-coloured dot-matrix wave (`SWITCHING TO <TOOL>…` / `ENTERING <TOOL>…`) inside the hero stage and disable only the `START`/`TARE` CTA (`ENTERING <TOOL>…`).
- Remove redundant helper paragraphs (`"Selected values are an editable proposal..."`, static `"READY"` repetition inside explanatory lists, etc.). Error / unavailability explanations appear **only** when the tool or control actually has an error or qualification blocker.

### 2. Shared session & draft continuity

- Extract uncommitted parameter drafts into a lightweight shared store keyed by `{deviceId, serial, tool}` (paired with `sharedMachineControls()`, resetting cleanly when switching machines or invalidating qualification).
- Consequence:
  - Editing Grind size or Pour target in the Home Inline Overlay (`Design 1`) and tapping `↗` Expand carries the exact edited values into `/machineTool` (`Design 2`).
  - Expanding while a tool is already `ready`, `entering`, or `running` rebinds seamlessly to the live session in `MachineControls` (`open()` already returns no-op if the same identity/tool is open and active).

### 3. Non-blocking idle exit & BLE transition serialization

Leaving `/machineTool` (`<` Back or native swipe-back) or collapsing Home inline (`✕` / `MachineDot`) MUST NOT trap the user in a `"Waiting for confirmation…"` modal when no active motion/uncertain run is happening.

**Required `MachineControls` + `useMachineToolNavigation` behavior:**

1. **Idle departure (`phase === "closed" | "ready"`)**:
   - Navigate back / collapse inline overlay **immediately and synchronously on user action**. Do not show a modal confirmation sheet.
   - Invoke `controls.closeInBackground()` (non-blocking). `MachineControls` enters `"leaving"` and sends `{kind: "exit", tool}` asynchronously without keeping the UI screen pinned.
2. **Serialized re-entry (`open` / `switchTool` racing background `close`)**:
   - Add an internal `closing: Promise<void> | null` tail in `MachineControls`.
   - When `open(identity, nextTool)` (or internal `switchTool(nextTool)`) is called while `phase === "leaving"` (or while `this.closing` is in flight), `open()` **awaits `this.closing` first** before checking `closed` and sending `{kind: "enter", tool: nextTool}`.
   - If the prior `close` throws or invalidates recovery (`phase === "unknown"`), `open()` propagates/surfaces the uncertain state cleanly rather than double-opening two tool sessions.
   - **Invariant**: Only one `{kind: "enter" | "exit"}` control exchange can be in flight at any time.
3. **Failure during background exit**:
   - If `{kind: "exit"}` fails or BLE drops after navigation completed, `MachineControls` transitions honestly to `"unknown"` (`error` populated), never silently pretending `"closed"`.
   - The Home `MachinePanel` and the next tool/settings visit surface the error clearly with inline `Reconcile connected machine` / `Reconnect named machine` recovery actions.

### 4. Active-run departure, collapse & switch guard (Horizontal Head-Shake)

Whenever `phase` is `"starting" | "running" | "stopping" | "unknown"`:
- **Tapping `<` Back, iOS swipe-back (`usePreventRemove`), Android back, `✕` Collapse, Home `MachineDot`, or switching tabs (`GRIND | SCALE | POUR`)** cancels navigation/collapse/switch in place.
- Instead of opening a blocking modal on every tap:
  1. Trigger the **horizontal head-shake animation** (`[-6, +6, -4, +4, -2, 0]` px damped horizontal sequence, `420 ms` in `constants/motion.ts`) on the blocked target (`ScreenHeader` or `switcher` on `/machineTool`; `MachinePanel` card/launcher on Home).
  2. Emit a light warning haptic feedback (`expo-haptics` error/warning notification where supported cleanly).
  3. Show a concise warning toast (`notify({tone: "info" | "error", ...})` or inline status banner) explaining why (`"Stop pour before leaving"`, `"Stop grind before switching tools"`).
- **Reduced Motion degradation (`useReducedMotion()`)**:
  - When Reduced Motion is enabled, skip horizontal translation and play a brief border/opacity highlight pulse (`DURATION.fast`) + the notice banner & haptic so feedback remains unmistakable without motion sickness.
- **Disconnected uncertain (`phase === "unknown"` & `!connected`) escape hatch**:
  - Keeping the Oct 27 safety invariant: if the machine disconnected with an uncertain active motor/pump (`controlRecovery?.marker` present), users must never be permanently trapped on `/machineTool` if the machine is turned off or out of range. While the inline banner/recovery card offers `Reconnect named machine` (and physical machine stop guidance), offering a clear secondary action inside that recovery card (`Leave screen — keep recovery warning`) lets the user return Home safely while preserving the local uncertain marker until reconciled.

### 5. Motion timing constants (`constants/motion.ts`)

Add named, reusable timing tokens to `constants/motion.ts` (zero magic durations inside components):
- Dot-matrix wave strip step/cycle durations (e.g., `TOOL_MOTION.waveStepMs`, `TOOL_MOTION.switchingCycleMs`, `TOOL_MOTION.runningCycleMs`, `TOOL_MOTION.stoppingCycleMs`).
- Head-shake refusal sequence keyframes / durations (`TOOL_MOTION.headShakeDurationMs`, `TOOL_MOTION.headShakeOffsets`).
- Re-use existing `flickerMsFor(rpm)` + `ATTRACT` conventions for Grind burr activity and `DURATION.fast` for immediate `Stop -> Stopping…` & Reduced Motion cross-fade fallbacks.

---

## Design adherence & verification gate (mandatory)

Per user mandate, final implementation **must be explicitly verified against [`06-full-and-inline-final.html`](2026-11-19-machine-tools-ui-visual/06-full-and-inline-final.html)** before being considered complete. Verification requires:

### 1. Side-by-side HTML vs. Simulator / Screenshot Audit

Capture screenshots of the built React Native screens (iOS Simulator and/or Android Emulator via Expo) alongside the rendered reference in `06-full-and-inline-final.html` across:
- **Home Inline Overlay (`Design 1`)**: idle `WATER / MODE / REFRESH / GRIND SCALE POUR` state -> inline expanded `POUR` (`READY` & `RUNNING`), `GRIND`, and `SCALE`; verify context bar (`<MACHINE> · WATER … · <MODE>`), `↗` Expand, `✕` Collapse, green accents (`palette.success`), and visible faded/normal recipe cards underneath.
- **Full Tool View (`Design 2`)**: `POUR` (`entering` / `ready` / `running` / `stopping` in both `Target` and `Until stopped`), `GRIND` (`ready` & `running` burr flicker), and `SCALE` (`ready` with `0.1 g` precision).
- Verify 1:1 visual adherence:
  - [ ] Full Tool hero stage has `1.5px` `palette.brand` border rim + soft halo + subtle dot-grid interior and **zero sheen gradients** (static or animated).
  - [ ] Full Tool primary numerals (`150 ml`, `48`, `18.4 g`) are white Doto (`palette.text`); active switcher tab, active parameter segment pills, and `START`/`TARE` are `palette.brandFill` + `onBrand.text`.
  - [ ] Home Inline Overlay uses toned-down `palette.success` accents (`#5DDC8A` in dark `original`, theme-resolved elsewhere) with flat `palette.raised` card and **no** pink/glow competing with Home recipe cards.
  - [ ] Tapping `STOP` transitions on frame 1 from solid `palette.danger` (`STOP <TOOL>`) to outlined `STOPPING <TOOL>…`.
  - [ ] Entering (`phase === "entering"`) shows dimmed `Stepper`/segment controls cleanly with zero plain-text flash, plus amber `warn` dot-matrix wave animation.
  - [ ] Trying to leave, collapse, or switch tools while active (`starting`/`running`/`stopping`/`unknown`) triggers horizontal head-shake refusal + notice without navigating away; idle `<` and `✕` dismiss immediately without any blocking confirmation dialog while BLE closes in background.
  - [ ] Reduced Motion degrades spatial animations cleanly to opacity/border pulse & static highlights; VoiceOver/TalkBack focus, `accessibilityElementsHidden`, and large dynamic-font wrapping keep `Stop` permanently anchored and visible.

### 2. Automated test & CI gate checklist

- Expand/update unit and component suites in:
  - `components/__tests__/MachinePanel.test.tsx` (inline Focus Swap mode, green accent tokens, `↗` Expand handoff, `✕` idle collapse + background close vs active head-shake, `MachineDot` active guard)
  - `components/__tests__/MachineTools.test.tsx` & tool component tests (`Grind`, `Scale`, `Pour`: zero-flash `entering` mount, immediate `STOP -> STOPPING…` tap feedback, no fabricated sheen/telemetry, zero literal hex strings)
  - `app/__tests__/machineTool.test.tsx` (unified 3-tab switcher, shared draft continuity from inline expand, immediate idle departure, active switch/back refusal + offline `unknown` escape)
  - `hooks/__tests__/useMachineToolNavigation.test.tsx` (idle background close, active/uncertain guard, `mode === "setting"` regression preservation)
  - `library/machine/__tests__/MachineControls.test.ts` (serialized `closeInBackground()` -> `open()` handoff queue, failed background close -> `unknown` honest reporting)
- Full repository checks passing after final edits:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:import-node`
  - `npm run worktrees:check`
- Physical hardware acceptance (`Issue #64`) remains required before release promotion (`AGENTS.md` / `2026-10-27` spec).
