# Easy Mode Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement approved direction A: exception-only status, wrapping identity, a full-width shallow profile and a shared Scale/CHANGE footer.

**Architecture:** Keep all presentation in EasyModeSlotCard. Measure the decorative band's actual width with onLayout, then feed the existing PourProfile its geometry; state changes come only from that event. Preserve snapshot, switch, focus, update, write and recovery contracts.

**Tech Stack:** Expo SDK 57, React Native, Tamagui, react-native-svg, Jest's iOS/Android projects and asynchronous RNTL 14.

---

## Ownership and scope

Worktree: `/Users/jesperhessius/Dev/XBRW-easy-mode-layout-20261014`.
Branch: `docs/easy-mode-card-layout-20261014`.
Integration base: `2cd68f58b0389ac0be98899fc952c8877fcf0747`.
User-approved local dependency merge: PR #219 head
`ba8c2ec7671677c4fc56de595a07616e78ee75bd`.
Do not modify #219, request another Copilot review, merge into develop,
change native dependencies or issue hardware commands.

## File map

- `components/EasyModeSlotCard.tsx`: card composition and measured decorative band.
- `components/__tests__/EasyModeSlots.test.tsx`: rendered composition, actual SVG dimensions, exception-only status and scale-only pending/revert coverage.
- `app/__tests__/easyMode.test.tsx`: remove the matching-state badge assertion in the retained-trial case.
- `docs/superpowers/specs/2026-10-14-easy-mode-card-layout-design.md`: approved dependency exception and source-of-truth design.

No database, hook, protocol, PourProfile arithmetic, font or palette changes.
Retain the existing Tamagui switch rather than adding a native dependency to
a presentation-only task.

### Task 1: Characterize the new composition and status

**Files:** Modify `components/__tests__/EasyModeSlots.test.tsx` and
`app/__tests__/easyMode.test.tsx`.

- [x] **Step 1: Replace the compact-watermark test with rendered band/footer assertions.**

Use the existing assigned-three-slots setup and `renderWithProviders`:

```tsx
expect(card).toHaveStyle({backgroundColor: resolveAccent(recipe), paddingTop: 14, paddingLeft: 14});
expect(identity).toHaveStyle({fontSize: 16});
expect(identity.props.numberOfLines).toBeUndefined();
const details = within(screen.getByTestId("slot-A-details"));
expect(details.getByText(/GRIND/)).toBeOnTheScreen();
expect(details.queryByRole("button")).toBeNull();
const footer = screen.getByTestId("slot-A-footer");
expect(footer).toHaveStyle({flexWrap: "wrap"});
expect(within(footer).getByRole("button", {name: "Change slot A recipe"}))
    .toHaveStyle({height: "auto", minHeight: 44, backgroundColor: palette.base});
const band = screen.getByTestId("slot-A-profile-band", {includeHiddenElements: true});
expect(band).toHaveStyle({height: 45, marginLeft: -14, marginRight: -14, overflow: "hidden"});
expect(band.props.pointerEvents).toBe("none");
expect(band.props.accessibilityElementsHidden).toBe(true);
expect(band.props.importantForAccessibility).toBe("no-hide-descendants");
await fireEvent(band, "layout", {nativeEvent: {layout: {width: 320, height: 45, x: 0, y: 0}}});
expect(screen.getByTestId("slot-A-profile", {includeHiddenElements: true}).props.width).toBe(320 + 2 * PROFILE_BLEED);
```

Assert both SCALE OFF and its accessible switch within the same footer.
Repeat the layout event at width 240 and assert SVG width `240 + 2 * PROFILE_BLEED`.
For tea, assert the same profile band alongside existing steep figures.
For empty slots, assert no profile band or scale switch.

Replace each positive LAST WRITTEN assertion with:

```tsx
expect(screen.queryByText("LAST WRITTEN")).toBeNull();
expect(screen.queryByText("NOT WRITTEN")).toBeNull();
```

Keep timestamp, zero-change and enabled rewrite assertions. Add a scale-only pending/revert regression:

```tsx
const options = props();
const saved = snapshotRecipe(recipes[0]);
options.record.drafts = [saved, saved, saved];
options.record.written = {at: 1000, slots: [saved, saved, saved]};
const view = await renderWithProviders(<EasyModeSlots {...options} available/>);
expect(screen.queryByText("NOT WRITTEN")).toBeNull();
options.record.drafts[0] = {...saved, scaleEnabled: true};
await view.rerender(<EasyModeSlots {...options} available/>);
expect(screen.getAllByText("NOT WRITTEN")).toHaveLength(1);
expect(screen.getByText("1 CHANGE")).toBeOnTheScreen();
options.record.drafts[0] = saved;
await view.rerender(<EasyModeSlots {...options} available/>);
expect(screen.queryByText("NOT WRITTEN")).toBeNull();
expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
```

- [x] **Step 2: Run red tests.**

Run `npx jest --runTestsByPath components/__tests__/EasyModeSlots.test.tsx app/__tests__/easyMode.test.tsx --maxWorkers=2 --silent`.
Expected failure: old matching badge and missing profile-band/footer IDs.

### Task 2: Implement the measured profile and shared footer

**Files:** Modify `components/EasyModeSlotCard.tsx`.

- [x] **Step 1: Add event-driven profile sizing.**

Import `useState` and `PROFILE_BLEED`. Inside the component:

```tsx
const [profileWidth, setProfileWidth] = useState(0);
```

Delete the absolute watermark. After the name and figures, render:

```tsx
{recipe !== null && !probe && <View testID={`slot-${name}-profile-band`}
    pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    onLayout={event => setProfileWidth(event.nativeEvent.layout.width)}
    style={{height: 45, marginHorizontal: -14, overflow: "hidden"}}>
    {profileWidth > 0 && <View style={{position: "absolute", left: -PROFILE_BLEED, top: -PROFILE_BLEED}}>
        <PourProfile testID={`slot-${name}-profile`} pours={recipe.pours}
            width={profileWidth} height={45}/>
    </View>}
</View>}
```

The geometry fills the band. The outer SVG extends beyond the clipped band
by the half-stroke on each side, with outer width `profileWidth + 2 * PROFILE_BLEED`.

- [x] **Step 2: Replace unconditional matching status with the existing pending predicate.**

```tsx
{snapshot !== null && !recovery && needsWrite && <DotMatrixText fontSize={11} weight="bold"
    color={ink}>NOT WRITTEN</DotMatrixText>}
```

- [x] **Step 3: Put figures alone above the profile and combine controls below it.**

Retain the current figures renderer verbatim inside `slot-${name}-details`.
Move the existing CHANGE/CHOOSE RECIPE button verbatim into:

```tsx
<XStack testID={`slot-${name}-footer`} alignItems="center" justifyContent="space-between"
    gap="$3" flexWrap="wrap">
    {snapshot !== null && !probe && <XStack alignItems="center" gap="$3"
        minHeight={44} flexWrap="wrap">
        <DotMatrixText fontSize={11} weight="bold" color={ink}>
            {scaleEnabled ? "SCALE ON" : "SCALE OFF"}
        </DotMatrixText>
        <Switch accessibilityRole="switch" accessibilityLabel={`Scale for slot ${name}`}
            accessibilityHint="Automatically tares when this slot is started. Write to machine to apply."
            accessibilityState={{checked: scaleEnabled, disabled: scaleLocked}}
            checked={scaleEnabled} disabled={scaleLocked} size="$3"
            backgroundColor={scaleEnabled ? palette.base : palette.control}
            onCheckedChange={enabled => { if (!scaleLocked) onSetScaleEnabled?.(enabled); }}>
            <Switch.Thumb backgroundColor={palette.text}/>
        </Switch>
    </XStack>}
    {!locked && <Button ref={changeRef} height="auto" minHeight={44} paddingVertical="$2"
        paddingHorizontal="$3" borderRadius={8}
        accessibilityLabel={`Change slot ${name} recipe`} onPress={onChange}
        backgroundColor={palette.base} color={accent}>
        <DotMatrixText fontSize={11} weight="bold" color={accent}>
            {snapshot === null ? "CHOOSE RECIPE" : "CHANGE"}
        </DotMatrixText>
    </Button>}
</XStack>
```

Preserve 24/11/16 pt renderer assignments, all control
labels/hints, lock handling, changeRef and edited/removed sections.
No total height or root clipping: only the decorative band is clipped.

- [x] **Step 4: Run targeted green tests and typecheck.**

Run the Task 1 command, then `npm run typecheck`.
Expected: both Jest projects pass and tsc exits zero.

- [x] **Step 5: Commit the coherent presentation change.**

```bash
git add components/EasyModeSlotCard.tsx components/__tests__/EasyModeSlots.test.tsx app/__tests__/easyMode.test.tsx
git commit -m "feat: refine Easy Mode slot card composition" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Verify unchanged behavior and preserve handoff

- [x] **Step 1: Run focused control, persistence and recovery regression coverage.**

```bash
npx jest --runTestsByPath components/__tests__/EasyModeSlots.test.tsx app/__tests__/easyMode.test.tsx hooks/__tests__/useEasyModeSlots.test.ts library/slots/__tests__/slotModel.test.ts library/slots/__tests__/SlotDatabase.test.ts library/slots/__tests__/slotWriter.test.ts library/slots/__tests__/teaSlotProbe.test.ts --maxWorkers=2 --silent
npm run typecheck
npm run lint
git diff --check
```

Expected: both-platform tests and typecheck pass; lint has no errors.
Do not change wire expectations to accommodate layout.

- [x] **Step 2: Record native gaps honestly.**

Jest verifies measurable band widths, intrinsic/wrapping styles and control
reachability contracts, not actual native fit. Native checks still cover
320 pt and ordinary widths, large text, long names, tea, empty slots,
edited/removed notices and VoiceOver/TalkBack. Do not claim automatic tare
or Bluetooth qualification from UI tests. No new native build is authorized.

- [x] **Step 3: Fetch/audit and preserve exact state.**

Run `git fetch origin --no-prune && npm run worktrees:check`.
Record base/head, clean/dirty state and dependency SHA in this plan.
Retain this session-owned worktree for the future layout PR and native review;
do not delete it without exact-path approval and verified backup.
Until branch pushing is authorized, report local-only preservation honestly.

## Execution and handoff record

Implemented at `37ddeb21f7fa1a3e1d33ae8004b77f7dba656567`.
Specification review found one concrete accessibility gap: the passive
44 pt Scale row did not expand the actual switch hit area. Corrected at
`3873e3141d642058ba21e5deaf59297518008b60` with vertical hitSlop and
matching containing padding. The visual switch remains 46 by 23 pt; its
effective target is 46 by 44 pt, without horizontal expansion into CHANGE.
The narrow specification recheck and final quality review both passed.

TDD baseline: 254 tests passed. Red: 12 failed for the new composition/status
requirements. Initial green: 256 passed. The additional target regression
failed on both platforms before the correction and passed afterwards.
Controller verification: 542 tests passed in 14 suites across both platforms;
typecheck passed; repository lint had zero errors and 29 existing warnings;
whitespace checks passed.

Native visual fit, scaled-text wrapping, VoiceOver/TalkBack and actual
native hit-testing remain unverified. No native build or hardware command
was performed. Automatic tare and Bluetooth physical qualification remain
PR #219's separate gates.

PR #219 stayed open and unchanged at
`ba8c2ec7671677c4fc56de595a07616e78ee75bd`; its single Copilot round
reported zero findings. Its completed CI failed only at Expo Doctor:
the current SDK metadata expects newer patch versions of expo, expo-crypto,
expo-dev-client, expo-router, expo-sharing, expo-splash-screen and jest-expo.
This existing dependency-refresh issue is not changed in the layout task.
It remains a merge blocker, not evidence of a layout regression.

Preservation: this session owns the retained layout worktree at
`/Users/jesperhessius/Dev/XBRW-easy-mode-layout-20261014`, branch
`docs/easy-mode-card-layout-20261014`, integration base
`2cd68f58b0389ac0be98899fc952c8877fcf0747`. Code recovery pointer:
`3873e3141d642058ba21e5deaf59297518008b60`. Work remains local-only
with no upstream or layout PR; retained for native review and an authorized
future layout PR after #219's integration. The separate beta-feedback worktree
remains owned by this session for its open PR, CI and physical qualification,
remotely preserved at the dependency SHA above. No cleanup is approved.
Final fetch/audit found no integrated task worktrees requiring cleanup;
the only dirty tracked file was this execution record, committed at handoff.
