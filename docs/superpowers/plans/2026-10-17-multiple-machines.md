# Multiple saved machines Implementation Plan

**Goal:** Save any number of xBloom machines with names, a default and a
priority order; connect to the highest-priority one a single scan hears; switch
from the home machine panel or the editor's machine chip; switch the model with
the machine.

**Architecture:** Pure list rules in `library/machine/savedMachines.ts`; the
bridge to settings in `library/machine/savedMachineSettings.ts`, with the four
existing machine keys kept as the record of the machine in use. `openLink` in
`hooks/useMachine.ts` gains the one-scan selection, a session pick, the add
flow and a scan queue. UI: one picker sheet with two doors, a per-machine sheet
and an add sheet in Settings.

**Spec:** `docs/superpowers/specs/2026-10-17-multiple-machines-design.md`

**Rules that apply to every task:** work only in the task worktree; await
`render`/`renderHook`/`fireEvent`; colours from `constants/colors.ts`; no
hand-written `useMemo`/`useCallback`; no em dashes in copy; nothing in the link
path may send anything but the existing connect sequence.

## File map

- Create `library/machine/savedMachines.ts`, `library/machine/savedMachineSettings.ts`
- Create `hooks/useSavedMachines.ts`, `hooks/useMachinePicker.ts`, `hooks/useMachineAdder.ts`
- Create `components/MachineChip.tsx`, `components/MachinePickerSheet.tsx`,
  `components/MachineDetailSheet.tsx`, `components/MachineAddSheet.tsx`
- Modify `library/Settings.ts` (`savedMachines`, not in backups),
  `constants/machine.ts` (settle, survey and add timings),
  `library/machine/{Transport,Machine,errors}.ts` (scan decider, `rssi`,
  `NoSavedMachineError`), `hooks/useMachine.ts`, `hooks/useBrew.ts`,
  `components/{MachinePanel,MachineSection}.tsx`,
  `app/{index,editRecipe,settings}.tsx`
- Tests: `library/machine/__tests__/savedMachines.test.ts`,
  `library/machine/__tests__/savedMachineSettings.test.ts`,
  `hooks/__tests__/multipleMachines.test.ts`,
  `components/__tests__/{MachinePickerSheet,MachineAddSheet}.test.tsx`, additions
  to `MachineSection.test.tsx` and `MachinePanel.test.tsx`, fixture updates in
  `useMachine.test.ts`, `settings.test.tsx` and `FakeTransport.ts`.

---

### Task 1: List rules

- [x] Pure module: parse (forgiving per entry), serialise, overlay and
  migration (`resolveSavedMachines`), labels and tags, order operations,
  `scanVerdict`, `bestSavedMachine`, `splitByRange`, `unsavedMachines`.
- [x] Tests, including five saved with three nearby and the default absent.

### Task 2: Settings bridge

- [x] `savedMachines` setting, held out of backups.
- [x] `loadSavedMachines`, `saveSavedMachines`, `activateSavedMachine`,
  `rememberMachine`, `addAndActivateMachine`, `forgetSavedMachine`,
  `recordSerial`.
- [x] Tests: an upgraded phone gets a list of one with no writes; model
  switches both ways; forgetting hands over; stale id keeps the name.

### Task 3: Link

- [x] `ScanDecider` on `MachineTransport.scan`; settle timer in `BleTransport`;
  `rssi` on `FoundMachine`; `Machine.scan(decide, seconds)`.
- [x] `openLink`: one-machine path unchanged; session pick; one priority scan;
  `NoSavedMachineError`, not relinked by `useBrew`.
- [x] `attemptLink` remembers before recording, so readings land on the right
  machine; records the serial.
- [x] `chooseMachine`, `machineChangeBlocker`, `findUnsavedMachines`,
  `addMachine`, `surveyMachines`, the scan queue.
- [x] Tests with `FakeTransport`.

### Task 3b: Review fixes

- [x] The machine on screen wins when it is in range (`scanVerdict`/`bestSavedMachine` take a preferred id); `useBrew.attempt` refuses with `WrongMachineError` if the link landed elsewhere; `openLink` pins the machine in use after `lostContact`.
- [x] Only full-window scans become the picker's survey.
- [x] `Transport.scan.test.ts` for the scan timing; tests for the scan queue, the guard and `lostContact`.
- [x] Split into `feat/multiple-machines-core` (Tasks 1 to 3b) and `feat/multiple-machines-ui` (Task 4).

### Task 4: UI

- [x] Picker sheet and chip; home panel row; editor chip above the deck switch.
- [x] Settings rows, machine sheet, add sheet; coverage guards on all three
  screens.
- [x] Component tests.

### Task 5: Verification

- [x] `npm run typecheck`, `npm run lint`, `npm run test:worktrees`, `npm test`,
  `npx expo-doctor`.
- [ ] Hardware: the list in the spec's "What needs testing on hardware". Not
  done; nobody on this branch has had two machines in front of them.
