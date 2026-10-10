# Tea Slot Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Prepare one recoverable hardware experiment without enabling general tea slots.

**Architecture:** An exact validated probe snapshot travels through the existing per-machine journal and exclusive slot writer. A retained experiment record preserves originals and evidence; a development-only panel controls explicit preparation/restoration and never brews.

**Tech Stack:** Existing TypeScript, SQLite, Tamagui/XbrwSheet, dual-platform Jest.

---

Workspace: `/Users/jesperhessius/.config/superpowers/worktrees/XBRecipeWriterPlus/slot-recovery`.
Spec: `docs/superpowers/specs/2026-10-10-tea-slot-probe-design.md`.
No new dependencies, PR, push, merge or arbitrary raw writes.

## Task 1: Exact probe validation and retained originals

**Create:** `library/slots/teaSlotProbe.ts`,
`library/slots/__tests__/teaSlotProbe.test.ts`.
**Modify:** `library/slots/slotModel.ts`, `SlotDatabase.ts`, `slotWriter.ts`
only as required for atomic preparation and retained evidence.

- [ ] Write failing real-SQL tests establishing exact probe identity/recipe/bytes,
  ordinary tea rejection, atomic original retention, B/C byte preservation,
  repeated prepare not overwriting originals, pending journal blocks restoration,
  serial mismatch, relaunch parsing and restoration preserving original drafts.
  Include negative corrupted probe pause/temperature/grinder/volume/flags cases.
- [ ] Run `npx jest --runTestsByPath library/slots/__tests__/teaSlotProbe.test.ts --silent`.
  Expected new APIs fail before implementation.
- [ ] Build the candidate from existing Recipe/Pour APIs:

```ts
export const TEA_SLOT_PROBE_ID = "tea-slot-0x02-one-steep-v1";
export const TEA_SLOT_PROBE_PARAMETERS = {
    volume: 60, temperature: 70, pauseTime: 60, dosage: 5
} as const;
```

  Encode with encodeTeaBlob, no agitation/bypass/grinder. Use a narrowly
  discriminated probe snapshot, not a global tea validator bypass. `readSnapshot`
  validates exact metadata and full recipe plus recomputed bytes. General
  `snapshotRecipe` still rejects tea. Persisted read/recovery must not depend on
  `__DEV__`. Existing prepareSet always retains index and flags0x02.
- [ ] Retain original written set (or complete validated drafts if none) and
  original phone drafts separately, device/serial binding and candidate ID.
  Save originals and prepare candidate atomically before a journal/send.
  Persist write/restore attempts with exact frames and boundary/error/save
  evidence using shared database mutation points, not guessed success. Preserve
  observation independently. Do not replace originals on another click.
  One retained trial only: reject new candidates after restoration and leave
  prior evidence available to copy. Cancellation without final save confirmation
  is `candidate-unconfirmed`, not candidate success or restored.
- [ ] Expose typed prepare/restore/read/observation functions, with restoration
  prepared only after no journal; after actual restoration completion restore
  original phone drafts and retain history evidence. Serial mismatch and DB
  failure explicitly throw. Copy output includes actual machine/firmware when
  supplied, candidate, frames, evidence and separately labelled observation.
- [ ] Run new tests plus slotModel/SlotDatabase/slotWriter/machineSlotPort and
  typecheck. Expected both platforms pass, unchanged ordinary tea rejection.
  Commit with Copilot coauthor trailer.

## Task 2: Explicit development trial panel and route integration

**Create:** `components/TeaSlotProbePanel.tsx`,
`components/__tests__/TeaSlotProbePanel.test.tsx`.
**Modify:** `app/easyMode.tsx`, `components/EasyModeSlots.tsx`,
`hooks/useEasyModeSlots.ts` as needed; related route tests and protocol ledger.

- [ ] Write failing tests: entry only dev for new probe, retained originals/
  recovery/restoration accessible regardless dev mode; clear fixed parameter
  summary and explicit WRITE PROBE/RESTORE ORIGINAL SET; unavailable/pending/
  mismatch guards; preparation failure does not call write; success does not
  auto-brew; copy observations separate from storage evidence.
- [ ] Run panel/route tests to verify failures.
- [ ] Implement small Tamagui panel in existing XbrwSheet. New probe action is
  development-gated, restoration remains reachable when retained state exists.
  Call the dedicated shared hook `writeTeaProbe` / `restoreTeaOriginal` actions;
  fresh probe preparation occurs under one lease with `requireKnownNormal: true`.
  Do not prepare then call ordinary draft `write`. The exact candidate uses the
  normal ceremony and recovery. No Machine.send path or alternative owner.
  Show original-set provenance, immutable original names, parameters,
  no-leaves/manual-start instructions and stop conditions from the approved spec.
  Observations are entered deliberately and copied through existing clipboard/
  notification helpers. Include every new sheet in accessibility coverage and
  native/global navigation guard. Clear no journals from UI.
- [ ] Make probe presentation accurately show steep/time/grinder OFF rather
  than coffee ratio. Avoid removed-from-library false alarm for the fixed probe.
  Ordinary tea picker stays blocked. Restoration cannot be mistaken for physical
  read-back or general production tea support.
- [ ] Run panel/route/slots/hook targeted paths both platforms, typecheck, lint,
  Doctor and compile Metro8082 iOS bundle. Keep Metro running. Document candidate
  UNTESTED and exact user procedure; no hardware claim.
- [ ] Commit with coauthor; final spec and code-quality review. Leave branch
  local. Hardware trial begins only after user inspects UI and explicitly starts
  the physical machine.

## Task 3: Reference-derived A/B/C matrix

**Modify:** `library/slots/{teaSlotCandidate,teaSlotProbe,slotModel,SlotDatabase}.ts`,
`hooks/useEasyModeSlots.ts`, `components/{TeaSlotProbePanel,EasyModeSlotCard}.tsx`
and their tests (library, hook, panel, EasyModeSlots, route, machineSlotOwner).

- [x] Failing tests first: pinned frames for slots 0/1/2 with flags 2/4/4 and
  independent constants/CRC; actual first/second write + restore then matrix;
  both archived trials unchanged across relaunch incl. pending matrix; negative
  cases (flags, order, C suffix); no fourth trial; DB failure rollback; identity,
  serial, normal-state and pending-native guards; panel/route owner harness.
- [x] Implement `tea-slot-reference-abc-v1` as the sole successor of a restored
  v2; `observeSlot` per-slot reports; matrix-aware snapshots and card figures.
- [x] Panel: ABC rows, reference-derived label, C no-start warning.
- [ ] Validate: dual jest, typecheck, lint, doctor, Metro 8082 iOS bundle curl.
  Commit with Copilot coauthor; do not stage `docs/machine-integration/ble-protocol.md`.
