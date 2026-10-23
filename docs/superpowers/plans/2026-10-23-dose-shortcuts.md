# Dose Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline without subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add small coffee-dose shortcuts and make interactive dose changes scale active bypass water consistently.

**Architecture:** Share pure proportional arithmetic in `library/bypassLimits.ts`. Quick Edit derives from its saved recipe; the normal editor retains an event-owned, recipe-keyed dose/bypass anchor that survives autosave. Keep existing persistence, stage balancing and one-brew boundaries.

**Tech Stack:** Expo SDK 57, TypeScript, mutable Recipe, Tamagui, React Native ScrollView, Jest iOS/Android projects, RNTL v14.

---

## Contract and ownership

- Approved spec: `docs/superpowers/specs/2026-10-23-dose-shortcuts-design.md`.
- Worktree: `/Users/jesperhessius/Dev/XBRW-220-dose-shortcuts-20261023`.
- Branch: `feat/2.2.0-dose-shortcuts-20261023`.
- Pinned base: `8f2638dfa2e75928ff447fbbd0ee03ba14986886`.
- No additional dependency, setting, SAVE AS action, native build or source-PR review.
- Keep normal editor stage-volume validation; only Quick Edit automatically resizes stages.
- Existing SAVE permits incomplete recipes. A scaling problem must be visible, not silently repaired or serialized as UI state.
- No new PR, integration or source closeout is authorized by this plan.

## File map

| File | Responsibility |
| --- | --- |
| `library/bypassLimits.ts` | Shared rounded, bounded dose/bypass calculation and limit notice |
| `library/quickEdit.ts` | Presets, immutable one-brew application, problems and water explanation |
| `hooks/useRecipeEditor.ts` | Transient anchor and event resets, returned bypass notice |
| `components/QuickEditPanel.tsx` | Existing RailChip shortcuts beneath dose row |
| `components/BypassRung.tsx` | Visible notice even when its fold is closed |
| `app/editRecipe.tsx` | Pass notice to rung and bound/scroll panel above sole BREW |
| `app/index.tsx` | Scroll home panel without increasing 72% sheet |
| Corresponding existing test files | Arithmetic, editor, compiler, component and host regressions |
| `docs/copy.md`, `docs/release-2.2.0-changes.md` | Actual behavior and remaining manual gates |

### Task 1: Shared arithmetic and Quick Edit behavior

**Files:** Modify `library/bypassLimits.ts`, `library/quickEdit.ts`; test
`library/__tests__/bypassLimits.test.ts`, `library/__tests__/quickEdit.test.ts`.

- [x] Add failing unit cases for 18 g/30 ml to 20 g/33 ml, limits, invalid baselines, ratio-only, disabled bypass, tea, temperature preservation and unchanged source serialization. Concrete core expectations:

```ts
expect(scaleBypassForDose(30, 18, 20)).toEqual({
    ok: true, volume: 33, limited: false
});
expect(scaleBypassForDose(500, 18, 20)).toEqual({
    ok: true, volume: 500, limited: true
});
expect(scaleBypassForDose(1, 20, 1)).toEqual({
    ok: true, volume: 1, limited: true
});
expect(scaleBypassForDose(30, 0, 20).ok).toBe(false);
```

- [x] Run `npm test -- --runTestsByPath library/__tests__/bypassLimits.test.ts library/__tests__/quickEdit.test.ts --runInBand`. Verify failures assert missing behavior, not unrelated setup. If Jest is missing, install this worktree's locked dependencies with `npm ci`, then repeat.

- [x] Add the pure result and arithmetic to `bypassLimits.ts`:

```ts
export type BypassDoseScale =
    | {ok: true; volume: number; limited: boolean}
    | {ok: false; problem: string};

export function scaleBypassForDose(
    volume: number, fromDose: number, toDose: number
): BypassDoseScale {
    const raw = volume * toDose / fromDose;
    if (![volume, fromDose, toDose, raw].every(Number.isFinite)
        || fromDose <= 0 || toDose <= 0
        || volume < BYPASS_VOLUME.min || volume > BYPASS_VOLUME.max) {
        return {ok: false, problem: "Check the starting dose and bypass amount before resizing."};
    }
    const bounded = clampBypassVolume(raw);
    return {ok: true, volume: bounded, limited: raw < BYPASS_VOLUME.min
        || raw > BYPASS_VOLUME.max};
}

export function describeBypassDoseScale(result: BypassDoseScale): string | null {
    return result.ok
        ? result.limited ? `Bypass limited to ${result.volume} ml.` : null
        : result.problem;
}
```

- [x] Add `dosePresets(recipe)` returning sorted unique valid `[15,18,20,recipe.dosage]`, or `[]` for tea. Add an internal Quick Edit calculation using the **source** dose/volume only when coffee, enabled bypass, and a changed dose adjustment. Apply a successful result to the cloned recipe; retain supplied water and append its explicit correction problem otherwise. Extend `describeAdjustment` with actual bypass and total cup water, describing a clamped result as limited rather than proportional. Ratio-only retains bypass.

```ts
const result = quickEditBypass(recipe, adjustments);
if (result?.ok) edited.bypassVolume = result.volume;
```

- [x] Repeat the targeted command until green. Assert repeated previews do not mutate the source, and restoring the original dose restores original bypass even after clipping. Include existing card/serialization coverage without changing its expectations.
- [x] Commit with message `feat: scale quick-edit bypass with dose` and the required Copilot trailer (`b895bb12`).

### Task 2: Normal editor anchor and notice

**Files:** Modify `hooks/useRecipeEditor.ts`, `components/BypassRung.tsx`,
`app/editRecipe.tsx`; test `hooks/__tests__/useRecipeEditor.bypass.test.ts`,
existing save/autosave tests and `components/__tests__/BypassRung.test.tsx`.

- [x] Add hook regressions using awaited `renderHook`/`act`. With 18 g/30 ml, successive dose calls through `editInputComplete` must yield 32 ml at 19 g and 33 ml at 20 g, not 34 ml. Preserve stage volumes and bypass temperature. A 500 ml baseline clips at 20 g and returns to 500 ml at 18 g.

```ts
await act(async () => {
    result.current.editInputComplete(RECIPE_LABELS.DOSE, "19");
});
await act(async () => {
    result.current.editInputComplete(RECIPE_LABELS.DOSE, "20");
});
expect(result.current.recipe?.bypassVolume).toBe(33);
```

- [x] Run `npm test -- --runTestsByPath hooks/__tests__/useRecipeEditor.bypass.test.ts components/__tests__/BypassRung.test.tsx --runInBand` and observe the new failures.
- [x] Store anchor in a ref and notice in recipe-keyed state:

```ts
const bypassDoseAnchor = useRef<{
    recipe: Recipe; dose: number; volume: number
} | null>(null);
const [bypassDoseReading, setBypassDoseReading] = useState<{
    recipe: Recipe; result: BypassDoseScale
} | null>(null);
```

In the dose field's existing mutation callback, lazily capture the previous dose/volume for this Recipe, call `scaleBypassForDose`, apply successful water and publish the result before assigning the new dose. Do not scale tea, off bypass or unchanged dose. Do not read or mutate refs during render.

- [x] Clear anchor/notice in the **volume** edit and bypass-toggle event handlers. Temperature edits and saves must not rebase it. Cup-type edits reset it. Different Recipe identity after revert lazily establishes another baseline and suppresses the old notice. Invalid scaling retains water and renders a correction problem; a valid explicit volume edit clears it. Keep existing SAVE and card-write policies.
- [x] Return a derived `bypassDoseNotice` from the hook. Add optional `doseNotice?: string | null` to BypassRung and pass it through StagesDeck. Render outside its Collapsible so a closed rung cannot hide clipping:

```tsx
{doseNotice && (
    <Text testID="bypass-dose-notice" fontSize={12} lineHeight={17}
          color={palette.warn}>
        {doseNotice}
    </Text>
)}
```

Use the existing warning role; add no color literal.

- [x] Add cases for manual volume rebasing, temperature-only non-rebasing, toggle rebasing, replacement/revert, ratio-only, tea/off and autosave between taps. Run these plus existing hook persistence tests, then typecheck and targeted lint.
- [x] Checkpoint editor anchoring together with its controls and regressions in `9c95a022`.

### Task 3: Compact chips and reachable hosts

**Files:** Modify `components/QuickEditPanel.tsx`, `app/index.tsx`,
`app/editRecipe.tsx`; test `components/__tests__/QuickEditPanel.test.tsx`,
`hooks/__tests__/compilerOptOut.test.ts` and existing home/editor route suites.

- [x] Add red component tests for sorted/deduplicated recipe-dose chips, selected gram accessibility state, same adjustment/reset semantics as stepper and no tea chips. Rerender after mutating Recipe in place to prove its own-dose chip updates. Add compiler check for QuickEditPanel using existing `slotsKeyedOnMutatedModels`.
- [x] Run component/compiler tests and verify failures.
- [x] Reuse RailChip in a wrapping XStack directly under the dose row. Preserve its 44 pt touch target:

```tsx
<XStack testID="quick-edit-dose-presets" gap="$2" flexWrap="wrap">
    {dosePresets(recipe).map((preset) => (
        <RailChip key={preset} active={dose === preset} accent={accent}
                  label={`${preset} g`}
                  accessibilityLabel={`Quick edit dose ${preset} grams`}
                  onPress={() => onChange(updateAdjustment(
                      adjustments, "dose", preset, savedDose
                  ))}/>
    ))}
</XStack>
```

Only render that stack for coffee. Add `"use no memo"` to QuickEditPanel because its source Recipe mutates in place; do not memoize derived presets.

- [x] Wrap HomeQuickEditSheet's panel in ScrollView with bounded flex and `keyboardShouldPersistTaps="handled"`; keep `heightPercent={72}`. Bound the editor's absolute panel to its existing available-height wrapper with `maxHeight: "100%"` and wrap its content in a shrinking ScrollView. Preserve the action-bar-height exclusion and non-modal accessibility.

```tsx
<ScrollView testID="home-quick-edit-scroll" style={{flex: 1}}
            keyboardShouldPersistTaps="handled">
    <QuickEditPanel recipe={recipe} adjustments={adjustments} accent={accent}
                    temperatureUnit={temperatureUnit} onChange={onChange}
                    renderBrewAction={(brewability) => (
                        <Button testID="home-quick-edit-brew"
                                accessibilityRole="button"
                                accessibilityLabel="Brew with quick edits"
                                accessibilityState={{disabled: !brewability.brewable}}
                                disabled={!brewability.brewable}
                                opacity={brewability.brewable ? 1 : 0.45}
                                backgroundColor={brewability.brewable ? colour.fill : palette.raised}
                                color={brewability.brewable ? colour.onAccent.text : palette.dim}
                                borderRadius="$5" onPress={onBrew}>
                            BREW THIS
                        </Button>
                    )}/>
</ScrollView>
```

Keep the existing sole BREW action and no save action.

- [x] Test both hosts: chip/stepper changes feed the same brewed JSON including bypass; closing discards changes; normal SAVE still owns permanent edits; no library write is introduced. At short dimensions and font scale 2, assert scroll containers, last controls, and exactly one BREW. This is structural evidence, not native layout proof. Cover eight accepted appearance combinations.
- [x] Run combined affected suites, typecheck and targeted lint. Commit `feat: add compact dose shortcuts and stable editor bypass scaling` (`9c95a022`).

### Task 4: Qualify and document

**Files:** Modify `docs/copy.md`, `docs/release-2.2.0-changes.md`, this plan.

- [x] Document one-brew shortcuts, dose-driven bypass scaling, ratio-only behavior and visible 1-500 ml limiting. Record no new setting, native dependency or save workflow.
- [x] Verify no Recipe hydration/import/backup/card layout changes and no new serialized anchor/explainer. Run the existing Recipe/card, quick-edit record and brew integration suites alongside affected tests.
- [x] Run serial final gates in this worktree: `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npx expo-doctor`. All must succeed; distinguish existing warnings from failures.
- [x] Record actual counts and remaining native small-screen/large-text, VoiceOver/TalkBack and real-machine bypass gates. No native build is authorized.
- [x] Commit and push the implementation checkpoints through `c732330f`; record final documentation with `test: qualify dose shortcuts and bypass scaling`.
- [x] Fetch origin `--no-prune`, run `npm run worktrees:check`, and record exact clean/dirty, base/head and push state. Retain the owned unmerged worktree with its branch as recovery pointer. Do not merge or close #239 without separate authorization.

## Recorded software qualification

Application checkpoint `c732330f7e0717dba243fdb048cf8ac6945ef623` includes
accepted F by merge, not rebase. The remaining changes are documentation only.
Its merge base with current develop is
`e0d29d7cc2e635abef02a64cca386c21f1d1e661`; the original pinned task base above
is unchanged.

| Evidence | Result |
| --- | --- |
| Initial missing-behavior regressions | 62 expected failures; arithmetic then passed 150 tests across both platforms |
| Controls, hosts and compiler selection | 128 passed; native layout is not inferred from renderer structure |
| Autosave, replacement and eight appearance combinations | 130 passed; real SQLite preserves metadata-only saves |
| Post-F full host/hook/component selection | 756 passed, four skipped, 14 suites |
| `npm run typecheck` | Passed |
| `npm run lint` | Zero errors, 32 existing warnings |
| `npm test -- --runInBand` | 20,660 passed, 26 skipped; 918 suites passed, two skipped; both snapshots passed; both platforms; 884.158 seconds |
| `npx expo-doctor` | 21/21 passed |

Canonical card, persistence, accepted live owner, bag-run and compiler suites
passed without changing their existing format expectations. No diff from
accepted develop changes Recipe, Pour, NFC, backup serialization, BrewDatabase,
bag accounting or dependency manifests. The F merge required restoring its
locked date-picker dependency through `npm ci`; this adaptation adds none.
Animation/act warnings remain visible rather than being suppressed.

Logs are in this coordination session's `files/`: `dose-core-red.log`,
`dose-arithmetic-green.log`, `dose-controls-hosts-green.log`,
`dose-autosave-appearance-final.log`, `dose-f-integration-targeted.log`,
`dose-final-typecheck.log`, `dose-final-lint.log`, `dose-final-tests.log`,
`dose-final-doctor.log` and `dose-final-worktrees.log`. Exact final head, push
state and retained-worktree ownership are recorded in
`dose-implementation-handoff.json` alongside these logs.

## Manual gates, not claimed by software qualification

- [ ] Native short-screen/320 pt and large-text reachability, including the selected bag and keyboard.
- [ ] VoiceOver/TalkBack selection, traversal, sheet coverage and access to the sole BREW.
- [ ] Physical-machine dose and bypass delivery after both stepper and shortcut changes.

No new native client, BLE/NFC hardware session, focused PR, source closure or
preview dose integration was performed. Retain this task branch for separately
authorised review/integration. The raw #239/SAVE AS proposal in #252 remains
evaluation-only and must not be mistaken for this adaptation.

## Inline self-review

The four tasks cover the approved spec: shortcuts without save workflow,
shared scaling including normal edits, rounding/limits and invalid input,
stable anchors across autosave, rebasing events, both scrolling hosts,
compiler safety, appearance, persistence/card compatibility and manual gates.
The source review's stale-chip and short-screen concerns are addressed without
requesting another review. Execution is already approved inline.
