# Beta Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved history, Bluetooth and Easy Mode corrections,
and resolve the duplication report only with evidence.

**Architecture:** Keep history matching pure and its controls separate from the
route. Propagate existing typed radio refusals rather than adding another BLE
check. Extend slot snapshots, not Recipe, so recovery preserves the exact flags.
Each subsystem is an independent checkpoint in the owned task worktree.

**Tech Stack:** Expo SDK 57, TypeScript, React Native, Tamagui, SQLite, Jest
projects `ios` and `android`.

**Worktree:** `/Users/jesperhessius/Dev/XBRW-beta-feedback-20261014`

**Spec:** `docs/superpowers/specs/2026-10-14-beta-feedback-design.md`

---

## Execution rules

Run commands in the task worktree. Do not switch the shared checkout. Restore
dependencies only after the selected validation reports them missing. Run both
Jest projects, not concurrent full suites. Await RNTL v14 render, renderHook and
fireEvent. Use `renderWithProviders` for components and the real SQLite test
adapter for persistence. Include the Copilot co-author trailer on commits.
No PR, push, merge, deployment or physical-machine operation is included.

## Task 1: Radio refusals

**Files:** Modify `hooks/useMachine.ts`; test
`hooks/__tests__/useMachine.test.ts`; update
`docs/machine-integration/ble-protocol.md`.

- [ ] Add a regression using the real Machine and FakeTransport:

```ts
const transport = new FakeTransport();
const failure = new RadioUnavailableError("Bluetooth is switched off.");
const connect = jest.spyOn(transport, "connect").mockRejectedValue(failure);
const scan = jest.spyOn(transport, "scan");
const wait = jest.fn(async () => {});
await expect(openLink(new Machine(transport, {frameGapMs: 0}), {
    rememberedId: () => "AA:BB",
    rememberId: jest.fn(),
    recordMachine: () => false
}, async () => ({granted: true}), {delays: [0, 100, 200], wait}))
    .rejects.toBe(failure);
expect(connect).toHaveBeenCalledTimes(1);
expect(scan).not.toHaveBeenCalled();
expect(wait).not.toHaveBeenCalled();
```

- [ ] Add equivalent no-remembered-machine scan refusal coverage.
- [ ] Run `npx jest --runTestsByPath hooks/__tests__/useMachine.test.ts`
  and observe the new retry assertions fail.
- [ ] Import `RadioUnavailableError` and add this guard in both `openLink`'s
  retry catch and `attemptLink`'s connect fallback catch:

```ts
if (e instanceof RadioUnavailableError) throw e;
```

- [ ] Run the hook test plus
  `library/machine/__tests__/Transport.test.ts` in one Jest invocation.
  Existing stale-id fallback, transient retry and radio-startup cases must pass.
- [ ] Document that adapter refusals are not retried, then commit.

## Task 2: Slot-only scale setting

**Files:** Modify `library/slots/slotModel.ts`,
`library/slots/SlotDatabase.ts`, `hooks/useEasyModeSlots.ts`,
`components/EasyModeSlotCard.tsx`, `components/EasyModeSlots.tsx`,
`app/easyMode.tsx`; test the corresponding slot model/database/hook/component
suites; update `docs/machine-integration/ble-protocol.md`.

- [ ] Add independent byte assertions:

```ts
const off = snapshotRecipe(coffee());
const on = {...off, scaleEnabled: true};
expect(prepareSet([on, off, on]).map(frame => frame[11]))
    .toEqual([0x12, 0x02, 0x12]);
expect(prepareSet([on, off, on])[0].slice(12, -2)).toEqual(off.blob);
expect(snapshotStatus(on, coffee())).toBe("unchanged");
const record = emptySlotRecord();
record.drafts = [on, off, off];
record.written = {at: 1, slots: [off, off, off]};
expect(slotNeedsWrite(record, 0)).toBe(true);
```

- [ ] Add tea assertions for selectors `0x1C`, `0x3C`, `0x5C`; reject
  non-boolean stored scale values and any new attribute on fixed probes.
- [ ] Run slotModel tests and observe missing scale-bit failures.
- [ ] Extend `SlotSnapshot` with `scaleEnabled?: boolean`. Validate it in
  `readSnapshot` and preserve explicit booleans without adding a field to old
  snapshots. Keep probe validation unchanged. Encode ordinary flags:

```ts
const selector = recipe.isTea()
    ? 0x0C + (recipe.pours.length - 1) * 0x20 : 0x02;
return selector | (snapshot.scaleEnabled === true ? 0x10 : 0);
```

- [ ] Keep `sameSlotContent` scale-aware for pending writes. In
  `snapshotStatus`, compare against an updated recipe snapshot carrying the
  original slot's scale setting, so a slot-only option is not a recipe edit.
- [ ] Add `SlotDatabase.setScaleEnabled(deviceId, index, enabled)` using the
  existing transactional `change`. Reject empty slots, active trials and
  pending journals; run `readSnapshot` on the replacement. Preserve the old
  slot's scale state in `assign`, which also handles library updates.
- [ ] Add a hook handler returning success/failure, using the existing
  active-operation guard and visible error reporting. Thread the callback
  through EasyModeSlots into EasyModeSlotCard.
- [ ] Add a Tamagui Switch with slot-specific checked/disabled accessibility
  state. Show it only for assigned ordinary snapshots; disable while locked.
  Use palette/onAccent colours, not literals. Add help copy explaining that
  scale on tares when that machine slot is started.
- [ ] Add database reload, assignment/update, lock and exact journal-recovery
  tests. Old scale-off journal bytes must remain identical after hydration.
- [ ] Run slot model/database/writer/probe/hook/component/route suites together,
  document the still-open physical tare gate, then commit.

## Task 3: History matching and persistence

**Files:** Create `library/brew/historyQuery.ts`,
`library/brew/__tests__/historyQuery.test.ts`,
`hooks/useBrewHistoryQuery.ts`; modify `library/Settings.ts` and
`app/settings.tsx`; test hook/settings/backup behavior.

- [ ] Add tests for all five axes, both directions, deterministic ties,
  recipe scope and composable filters. Use `StoredBrew` fixtures with different
  snapshot values, absent values, rating 0 and grinder-off values.
- [ ] Run the new query test and observe missing-module failure.
- [ ] Implement the exported query vocabulary and guards:

```ts
export const HISTORY_SORTS = ["date", "rating", "dose", "ratio", "grind"] as const;
export type HistorySort = typeof HISTORY_SORTS[number];
export type HistoryDirection = "asc" | "desc";
export type HistoryQuery = {
    sort: HistorySort;
    direction: HistoryDirection;
    hideUnsuccessful: boolean;
    ratedOnly: boolean;
    recipeUuid?: string;
};
```

Use `countsAsBrewed`, `isRated` and `grinderRan`. Filter before sorting.
Missing values compare after present ones before direction is applied. Equal
values compare by `startedAt` descending, then `id` ascending. Never mutate the
input array. Guard unknown persisted axes/directions to date/descending.

- [ ] Add Settings defaults `brewHistorySort: "date"` and
  `brewHistorySortDirection: "desc"` with imported vocabulary types.
- [ ] Implement `useBrewHistoryQuery` using two `useSetting` calls and two
  transient boolean states, returning query, sort setter, filter setters and
  clearFilters. Do not add memoization or effects.
- [ ] Add both settings to settingsSnapshot and restore handlers, validating
  values with the query vocabulary guards. Add persistence/backup tests.
- [ ] Run query/hook/settings/backup tests and typecheck, then commit.

## Task 4: History controls and selection safety

**Files:** Create `components/BrewHistoryControls.tsx`; modify
`app/brewHistory.tsx`; test `app/__tests__/brewHistory.test.tsx`,
`app/__tests__/brewHistorySelection.test.tsx` and the controls.

- [ ] Add screen tests for Hide unsuccessful, Rated only, axis/direction,
  selection reset, recipe heading retained on no matches, clear filters and
  Android sheet coverage. Await presses; use SHEET_PRESS_TIMEOUT for sheet
  entrance retries.
- [ ] Run screen tests and observe controls missing.
- [ ] Implement presentational controls: two filter chips, sort opener and
  XbrwSheet containing five radio rows plus the shared SegmentedControl for
  direction. Use existing DotMatrixText, palette and Tamagui components.
- [ ] In the route derive scoped history for heading identity, then use
  `queryBrewHistory(brews, query)` for visible rows and count. Keep query state
  in its hook. Wrap query-change handlers with `handleSelectCancel`.
- [ ] Keep controls/sheets mounted when filters return zero rows; replace the
  separate filtered-empty early return with FlatList ListEmptyComponent.
  Preserve NO BREWS YET for an actually empty scoped history; use NO MATCHING
  BREWS and Clear filters for an empty query result.
- [ ] Include sort sheet state in screenCovered; preserve existing deletion,
  comparison and handoff behavior.
- [ ] Run history and selection suites, then commit.

## Task 5: Duplication investigation and final verification

**Files:** Inspect `app/editRecipe.tsx`, `app/index.tsx`,
`hooks/useRecipeLibrary.ts`, `library/RecipeDatabase.ts` and their tests.
Create `docs/android-crash-report.md` only if the investigation cannot prove a
cause, documenting private crash-log collection.

- [ ] Run existing duplication tests on both platforms. Follow the copy's
  insert, reload/navigation and affected component lifetime. Check native
  error evidence if locally available; do not run competing hardware clients.
- [ ] If a reproducible failure is established, add a failing regression,
  verify failure, fix its source and rerun the affected suites. Otherwise
  record the unresolved hypothesis and provide tester instructions, not a
  speculative fix.
- [ ] Run `npm run typecheck`, `npm run lint` and the smallest combined Jest
  selection covering changed files. Escalate when targeted failures require it.
- [ ] Inspect the complete diff, commit coherent checkpoints and report exact
  branch/base/head, clean/dirty and local-only state.
- [ ] Fetch `origin --no-prune` and run `npm run worktrees:check`. Retain this
  owned unmerged worktree for pending review and physical qualification; do
  not remove it without exact approval and preservation.
