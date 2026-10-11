# Easy Mode UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved recipe slabs, writing ceremony, deliberate recovery and persistent-draft departure reminder.

**Architecture:** Keep the existing per-machine SQLite journal and exclusive Machine slot port. Domain helpers derive byte status, a shared hook reports attempts, focused components render them, and the route intercepts navigation without owning transport.

**Tech Stack:** Expo 57, TypeScript, React Compiler, Tamagui, XbrwSheet, Reanimated, SQLite, dual-platform Jest/RNTL.

---

## Workspace and contracts

Work only in `/Users/jesperhessius/.config/superpowers/worktrees/XBRecipeWriterPlus/slot-recovery`.
Baseline `4a5eb56`; spec `docs/superpowers/specs/2026-10-10-easy-mode-ux-design.md`.
Do not touch the default worktree or other Metro servers. Metro 8082 already
serves this worktree. No dependencies, PR, push or merge.

Use existing module naming and aliases, central colours/motion, module-scope
components and no manual memo hooks. All component/hook test renders and presses
are asynchronous. Use `renderWithProviders`, `SHEET_PRESS_TIMEOUT` for sheet
press retries and real `createTestDatabase` for SQL behavior.

File responsibilities:

- `library/slots/slotModel.ts`: per-slot written comparison and change count.
- `slotWriter.ts`, `machineSlotPort.ts`, `Machine.ts`: explicit replay/observe
  recovery without weakening immutable bytes, durability or operation exclusion.
- `hooks/useEasyModeSlots.ts`: identity-bound attempt state and explicit recovery.
- `components/EasyModeSlotCard.tsx`: recipe slab and explicit update.
- `components/EasyModeWriteOverlay.tsx`: actual receipt steps and saving/success.
- `components/EasyModeSlots.tsx`: composition, search/picker/help/recovery sheets.
- `app/easyMode.tsx`: navigation guard and departure sheet.
- `MachinePanel.tsx`, `RecipeCard.tsx`, `RecipeShelfTile.tsx`: entry and badge order.

## Task 1: Durable manual recovery and byte-based status

**Modify:** `library/slots/slotModel.ts`, `slotWriter.ts`,
`machineSlotPort.ts`, `library/machine/Machine.ts`, `hooks/useEasyModeSlots.ts`.
**Tests:** `library/slots/__tests__/slotModel.test.ts`, `slotWriter.test.ts`,
`machineSlotPort.test.ts`, `hooks/__tests__/useEasyModeSlots.test.ts`,
`hooks/__tests__/machineSlotOwner.test.tsx`.

- [ ] Add failing real-database recovery tests: unknown B while SAVING_SLOTS
  explicitly replays immutable B/C, never A; without explicit permission it
  remains refused. Unknown final completion observes only and sends nothing.
  Refusal, identity mismatch, native write still pending, backgrounding and
  failed persistence retain existing safety guards.
- [ ] Add byte-status tests with this assertion shape:

```ts
const saved = snapshotRecipe(coffee("Morning"));
const record = emptySlotRecord();
record.drafts = [saved, saved, saved];
expect(unwrittenSlotCount(record)).toBe(3);
record.written = {at: 1, slots: [saved, saved, saved]};
expect(unwrittenSlotCount(record)).toBe(0);
expect(slotNeedsWrite(record, 1)).toBe(false);
```

Then mutate B's prepared temperature bytes through a new valid snapshot and
expect count 1; returning B to `saved` returns count 0. Null drafts are not
counted as changes.
- [ ] Run the five focused test paths and confirm the new assertions fail.
- [ ] Implement exported helpers using `sameBytes`:

```ts
export function slotNeedsWrite(record: SlotRecord, index: SlotIndex): boolean {
    const draft = record.drafts[index];
    if (draft === null) return false;
    const written = record.written?.slots[index];
    return written === undefined || !sameBytes(draft.blob, written.blob);
}
export function unwrittenSlotCount(record: SlotRecord): number {
    return ([0, 1, 2] as const).filter(index => slotNeedsWrite(record, index)).length;
}
```

- [ ] Extend acquire/writer options with `finishUncertain?: boolean` alongside
  existing `restart`. The existing `recover(false)` hook explicitly passes
  `finishUncertain: true`; domain callers without it retain conservative refusal.
  Machine accepts that option only for the same existing journal under normal
  identity/serial/foreground/operation guards. It permits SAVING_SLOTS, not
  arbitrary active/fault states. Full restart still requires a normal screen.
  Do not clear inFlight before acquiring exclusive ownership. Before resending,
  persist `dispatching` at the same acknowledged boundary, preserving frames.
  `MachineSlotLease.next` remains journal.acknowledged.
- [ ] For acknowledged 3 with explicit finish permission, skip all sends,
  subscribe before waiting and call `confirmSaved`; only a newly observed saved
  event completes. Old state is never accepted as evidence.
- [ ] Add a hook operation status that survives journal clearing long enough
  for success presentation and is associated with the device that started it.
  Keep `running`, `error`, `write`, `recover`, `cancel` compatibility. Do not
  synthesize success after cancellation. Reset status from events, not effects.
- [ ] Run:

```bash
npx jest --runTestsByPath library/slots/__tests__/slotModel.test.ts library/slots/__tests__/slotWriter.test.ts library/slots/__tests__/machineSlotPort.test.ts hooks/__tests__/useEasyModeSlots.test.ts hooks/__tests__/machineSlotOwner.test.tsx --silent
npm run typecheck
```

Expected: both platforms pass; no type errors. Update hardware qualification
notes without claiming replay established by scripted tests.
- [ ] Commit the task with the required Copilot coauthor trailer.

## Task 2: Recipe slabs, writing ceremony and clear recovery

**Create:** `components/EasyModeSlotCard.tsx`,
`components/EasyModeWriteOverlay.tsx`.
**Modify:** `components/EasyModeSlots.tsx`, `MachinePanel.tsx`,
`RecipeCard.tsx`, `RecipeShelfTile.tsx`, `constants/motion.ts` only if a new
success-hold timing is needed.
**Tests:** `components/__tests__/EasyModeSlots.test.tsx`,
`slotSurfaces.test.tsx`; add `EasyModeWriteOverlay.test.tsx`.

- [ ] Replace superseded warning/layout expectations with failing assertions:

```tsx
await renderWithProviders(<EasyModeSlots {...options} available />);
expect(screen.getAllByText("NOT WRITTEN")).toHaveLength(3);
expect(screen.getByText("Writes A, B and C. Switches to EASY.")).toBeOnTheScreen();
expect(screen.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
```

Cover byte count/status, updated/removed snapshots, name-only equality,
searchable whole-library picker and explicit unsupported reasons. Keep
meaningful safety assertions; remove only copy contracts superseded by spec.
- [ ] Add overlay tests for received A, active B, pending C; acknowledged 3
  means SAVING, not SLOTS WRITTEN. Success appears only after hook completion.
  Assert background controls are hidden and no cancel button exists while active.
- [ ] Run new/changed tests and confirm failures.
- [ ] Build a slab with `snapshot`, `index`, byte-status, current recipe,
  `locked`, `onChange`, `onUpdate`. Reuse `RecipeHero`'s accent lookup,
  `PourProfile` and `DotMatrixText`; read exact APIs before using them.
  Use intrinsic Tamagui stacks, accessible CHANGE/CHOOSE controls and wrapping
  names. Show dose, integer ratio and effective grinder state.
- [ ] Replace ordinary screen warning panels with slabs, a single count,
  compact scroll-capable pinned bar and help. Render one availability reason
  with explicit precedence: missing identity, busy, serial conflict, unavailable
  transport, disconnected, missing assignments. Writing unchanged sets remains
  enabled. Help explains unknown/external contents; show applicable overflow
  limitation outside help.
- [ ] Use an accent-row searchable FlatList in XbrwSheet. Preserve incoming
  replacement and synchronous persistence failure behavior.
- [ ] Implement overlay using existing DotBloom and DotMatrixText with
  palette/motion imports. A/B/C glyphs have text status as well as colour.
  Use a scroll-capable focused stage on small/large-text screens, no percentage.
  Announce only meaningful boundaries. After completed attempt show a short
  success phase, then dismiss using a central duration and cleaned timer.
- [ ] Replace stopped journal cards with a focused reason/step panel. RETRY
  opens the state question: STILL SAVING, FINISH WRITE calls `onRecover(false)`
  even for unknown B or final observe-only state; BACK TO NORMAL, RETRY calls
  true. Explain duplicate unknown delivery concisely without certainty claims.
  CANCEL confirms no saving, clears only app state through existing action.
  All open picker/help/confirmation/overlay states participate in the host's
  accessibility-covered guard on both platforms.
- [ ] Make MachinePanel entry a bounded ABC/EASY MODE/chevron control.
  Reorder both trailing marker clusters to letters then star, retaining spoken
  metadata and shared marker reads. Assert rendered order, not child props.
- [ ] Run:

```bash
npx jest --runTestsByPath components/__tests__/EasyModeSlots.test.tsx components/__tests__/EasyModeWriteOverlay.test.tsx components/__tests__/slotSurfaces.test.tsx --silent
npm run typecheck
npx eslint components/EasyModeSlots.tsx components/EasyModeSlotCard.tsx components/EasyModeWriteOverlay.tsx components/MachinePanel.tsx components/RecipeCard.tsx components/RecipeShelfTile.tsx
```

Expected: both projects pass, no new lint errors. Commit with coauthor trailer.

## Task 3: Navigation reminder and integrated qualification

**Modify:** `app/easyMode.tsx`, `components/EasyModeSlots.tsx` only for exposing
departure coverage or action availability, `docs/release-2.1.0-changes.md`.
**Create test:** `app/__tests__/easyMode.test.tsx`.

- [ ] Add failing route tests for beforeRemove with changed persisted drafts,
  no reminder for untouched empty/equal bytes, active write blocks departure,
  stopped journal may leave without clearing it, offline LEAVE FOR NOW,
  and WRITE cancels held departure and invokes the normal write exactly once.
  Assert all screen content is hidden while the departure sheet is open.
- [ ] Run `npx jest --runTestsByPath app/__tests__/easyMode.test.tsx --silent`
  and confirm those assertions fail before implementation.
- [ ] Implement the editor's beforeRemove pattern with a held navigation action:

```ts
const heldExit = useRef<(() => void) | null>(null);
const leaving = useRef(false);
```

Register the listener in an effect but never seed/reset state inside that
effect. On active attempt prevent departure. On changed bytes/no journal prevent
departure, store an action closure, then open the sheet from the listener.
The closure sets leaving true around synchronous navigation.dispatch and
restores false in finally, matching the editor's replay semantics.
- [ ] Implement the sheet's three event actions: LEAVE FOR NOW closes and
  invokes heldExit once; Stay here closes and clears heldExit; WRITE closes,
  clears heldExit and starts slots.write without dispatching. Disconnected/
  invalid state omits or disables WRITE with its availability reason.
  Cover the route root for departure plus external judgement; preserve child
  picker/overlay coverage. Pass identity-bound attempt status to the ceremony.
- [ ] Add exact copy from the spec, persist no extra discard flag and use
  `unwrittenSlotCount` rather than duplicating comparison logic.
- [ ] Run combined changed tests, whole typecheck/lint and existing Doctor:

```bash
npx jest --runTestsByPath app/__tests__/easyMode.test.tsx components/__tests__/EasyModeSlots.test.tsx components/__tests__/EasyModeWriteOverlay.test.tsx components/__tests__/slotSurfaces.test.tsx library/slots/__tests__/slotModel.test.ts library/slots/__tests__/SlotDatabase.test.ts library/slots/__tests__/slotWriter.test.ts library/slots/__tests__/machineSlotPort.test.ts hooks/__tests__/useEasyModeSlots.test.ts hooks/__tests__/machineSlotOwner.test.tsx --silent
npm run typecheck
npm run lint
npx expo-doctor
```

Expected: both platforms green, no lint errors, Doctor passes. Broaden selectors
to existing card/shelf/MachinePanel tests covering changed surfaces. Record
actual results and open physical gates in the release ledger, not assumed
hardware success. Check Metro 8082 still serves a compiling iOS bundle.
- [ ] Commit the completed integration with coauthor trailer. Keep local branch;
  no PR/push/merge. Physical duplicate-slot replay and native accessibility/
  layout remain explicit release gates until exercised with the user.

## Review and completion

After each task, perform spec compliance review before code-quality review.
Fix findings through the same implementer and re-review affected requirements.
Final review compares the complete diff against the approved spec. Do not
weaken receipt evidence to make a UI test pass or hide unresolved hardware
qualification behind a success label.
