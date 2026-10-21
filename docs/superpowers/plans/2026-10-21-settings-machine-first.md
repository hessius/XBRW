# Machine-first Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt #231 into the approved machine-first Settings page, with simplified cards, a persistent labelled support action and About last.

**Architecture:** Retain the accepted A-D connection hooks, machine management sheet and screen-owned sheet hosts. Adopt #231's card presentation and standalone section title, then simplify the card body and bind readings to the actual link. Extend the shared header with an optional wrapping action; rearrange existing Settings groups without changing their state or persistence.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, existing Reanimated Collapsible, Jest iOS/Android projects and asynchronous RNTL.

---

## Ownership, inputs and boundaries

- Worktree: `/Users/jesperhessius/Dev/XBRW-220-settings-231-20261021`.
- Branch: `feat/2.2.0-settings-231-20261021`.
- Base: `b66ec311f51e4994a2189298c52705f63d1453e7`.
- Spec: `docs/superpowers/specs/2026-10-21-settings-machine-first-design.md`.
- Source #231: `437d1d36def383a43b78ab480b72eb2e56d6246a`.
- User authorized immediate execution, push, a focused develop PR, one Copilot
  review round, finding fixes and green CI. Stop before merging.
- Do not alter the live cumulative preview or the other owner's theming worktree.
- No transport, native configuration, setting-schema or dependency changes.
- Use the existing Tamagui stack rather than installing `@expo/ui`.

## File map

| File | Responsibility |
| --- | --- |
| `components/MachineCard.tsx` | Contributor card summary, independent folds and accessible expansion |
| `components/MachineSection.tsx` | Onboarding, card actions, correct-device readings and existing console gesture |
| `components/SettingsSection.tsx` | Shared heading for independently surfaced machine cards |
| `components/ScreenHeader.tsx` | Optional action area with natural wrapping and unchanged ordinary headers |
| `components/SupportTile.tsx` | Existing support constants/tile plus compact reusable header action |
| `app/settings.tsx` | Approved group order, action wiring and existing sheet hosts |
| `app/about.tsx` | Correct the obsolete top-of-Settings placement comment |
| `components/__tests__/{MachineSection,ScreenHeader,SupportTile}.test.tsx` | Card, link ownership, lock, header and support regressions |
| `app/__tests__/settings.test.tsx` | Page order, footer, shortcuts, persistence and sheet regressions |
| `docs/copy.md` | Current Settings navigation and support placement |
| `docs/release-2.2.0-{changes,testing}.md` | Scope and honest UI/device acceptance checklist |

## Task 1: Adopt the contributor presentation without losing A-D

- [x] **Step 1: Recheck the source and inspect its merge.**

```bash
gh pr view 231 --repo hessius/XBRW --json headRefOid,state
git merge --no-ff --no-commit 437d1d36def383a43b78ab480b72eb2e56d6246a
git status --short
git diff --cached --stat
```

Expected source: the pinned SHA, still OPEN. If moved, review the new delta before
adoption. Resolve conflicts retaining A-D's inset handling, restore logic,
Brewing controls, picture preferences, accessibility locks and native hosts.
Only the eight Settings-related source files should enter from this proposal.
Do not carry a new release note into the already shipped 2.1.0 ledger.

- [x] **Step 2: Add regressions in the existing test harnesses before fixing the adopted cards.**

Use the existing typed `mockLink`, saved-machine fixtures, `renderOrder` and
`memoryStorage` helpers. Add `choose`, `changeBlocker` and `linkedDeviceId` to the
machine test mock; every connected fixture supplies its actual device ID.
Exercise this mismatch explicitly:

```tsx
mockLink.remembered = "HOME";
mockLink.status = "connected";
mockLink.machine.linkedDeviceId = "WORK";
await renderWithProviders(<MachineSection/>);
await fireEvent.press(screen.getByTestId("saved-machine-HOME"));
await fireEvent.press(screen.getByTestId("saved-machine-WORK"));
```

Within HOME, assert no live firmware/water values. Within WORK, open Details and
assert the fixture firmware, model fallback and water reading. Also assert that
neither inline Model nor Forget is present after expanding a saved card, and
that Manage machine targets that card's exact ID.

Add a lock regression with `changeBlocker = "A brew is running."`: Connect/Use and
Add expose `disabled: true`, announce the reason and do not invoke their handlers.
Keep zero-machine model/onboarding, Android permission recovery, initial-error
expansion and the existing no-handshake-on-open tests.

- [x] **Step 3: Run the targeted tests and observe the intended failures.**

```bash
npx jest --runTestsByPath components/__tests__/MachineSection.test.tsx --watch=false
```

Expected: failures for duplicate management, wrong readings or unannounced locks,
not a native-module/mock crash. If tools are missing in the new worktree, first
compare the manifests and lockfiles before reusing another dependency tree.
The preview's dependencies differed, so the missing-preset failure was resolved
with `npm ci` against this task's unchanged lockfile.

- [x] **Step 4: Simplify the cards and correct ownership.**

Remove inline saved-model selection and Forget from `MachineSection`; retain the
zero-machine global model preference. Remove the card's destructive footer prop
and footer Collapsible. Place this row before the existing Details fold:

```tsx
<SettingsActionRow
    label="Manage machine"
    detail="Name, model, colour and connection order."
    onPress={() => onOpenMachine?.(entry.id)}/>
```

Bind each card's connection and Details to the actual link:

```tsx
const linked = entry.id === machine.linkedDeviceId;
const liveInfo = linked ? machine.info : null;
const reportedModel = liveInfo === null ? ""
    : liveInfo.model !== "" ? liveInfo.model : machine.modelNumber;
```

Show Connected for the linked card even if the selected ID differs. Show
Connecting only for the selected card while the hook reports connecting;
otherwise use Selected. Display the model readout only when nonblank. Render
saved serial/identifier and the disconnected explanation when `liveInfo` is null.
Keep source `initiallyOpen={active && error !== null}` and fix its stale comments.

Use the existing blocker on each mutating connection/add row:

```tsx
disabled={changeBlocker !== null || status === "connecting"}
detail={changeBlocker ?? (status === "connecting"
    ? "A connection is already being made." : CONNECT_NEEDS_STUDIO)}
```

Keep model-specific connection guidance in place of `CONNECT_NEEDS_STUDIO` when
appropriate. Existing `connect` rejection is already surfaced by the hook's
error; existing `choose` rejection retains its notification.

- [x] **Step 5: Run the machine, sheet and section tests.**

```bash
npx jest --runTestsByPath components/__tests__/MachineSection.test.tsx components/__tests__/MachineDetailSheet.test.tsx components/__tests__/MachineAddSheet.test.tsx components/__tests__/ForgetMachineSheet.test.tsx components/__tests__/SettingsSection.test.tsx --watch=false
```

Expected: both projects green. Commit the adapted proposal with the required
Copilot coauthor trailer after Tasks 2-3 finish resolving the layout merge.

## Task 2: Persistent support action and responsive header

- [x] **Step 1: Add failing header and support tests.**

Extend `ScreenHeader.test.tsx`, importing `Text` from `react-native`:

```tsx
await renderWithProviders(
    <ScreenHeader title="Settings" onBack={jest.fn()}
                  action={<Text>Support action</Text>}/>
);
expect(screen.getByText("Support action")).toBeTruthy();
expect(screen.getByRole("header", {name: "Settings"})).toBeTruthy();
expect(screen.getByLabelText("Back")).toBeTruthy();
```

Assert the action/header hosts allow wrapping and the action variant does not
cap title lines. Retain the existing no-action one-line and recipe-title tests.
In `SupportTile.test.tsx`, render the new named `SupportAction`, press its link
and assert the literal `https://buymeacoffee.com/hsus`. Assert browser failure
reports `LINK_OPEN_FAILED`, the visible full title, browser announcement and a
minimum 44-point target.

- [x] **Step 2: Run the two suites to confirm the missing action/export fails.**

```bash
npx jest --runTestsByPath components/__tests__/ScreenHeader.test.tsx components/__tests__/SupportTile.test.tsx --watch=false
```

- [x] **Step 3: Add the action slot and compact support component.**

Add `action?: React.ReactNode` to ScreenHeader. Keep the current header subtree
for callers without an action. The action variant uses an outer wrapping row,
a max-width-constrained Back/title group and a right-aligned action host.
The title can wrap, rather than compete with the action at large font scale.

Add this named export beside the existing tile and constants:

```tsx
export function SupportAction() {
    return (
        <Pressable accessibilityRole="link"
                   accessibilityLabel={`${SUPPORT_TITLE}. Opens in your browser.`}
                   onPress={() => openLink(SUPPORT_URL)}
                   style={({pressed}) => ({
                       minHeight: 44, maxWidth: "100%",
                       justifyContent: "center",
                       paddingHorizontal: 12, paddingVertical: 10,
                       borderRadius: 12, backgroundColor: palette.brandFill,
                       opacity: pressed ? 0.7 : 1
                   })}>
            <Text color={onBrand.text} fontSize={13} fontWeight="700">
                {SUPPORT_TITLE}
            </Text>
        </Pressable>
    );
}
```

Do not add `numberOfLines`, disable font scaling, or substitute an icon-only label.
Reuse the existing safe-area header and preserve meta/count for other consumers.

- [x] **Step 4: Run the two suites and existing title coverage to green.**

```bash
npx jest --runTestsByPath components/__tests__/ScreenHeader.test.tsx components/__tests__/ScreenTitle.test.tsx components/__tests__/SupportTile.test.tsx --watch=false
```

## Task 3: Approved Settings order and documentation

- [x] **Step 1: Update layout assertions to the approved intentional behaviour.**

In `app/__tests__/settings.test.tsx`, assert the section headings appear in order:

```tsx
const order = renderOrder(screen.toJSON());
const headings = ["MACHINES", "BREWING", "UNITS", "RECIPE LIST",
                  "XBLOOM ACCOUNT", "LIBRARY"];
for (let index = 1; index < headings.length; index++) {
    expect(order.indexOf(headings[index]))
        .toBeGreaterThan(order.indexOf(headings[index - 1]));
}
expect(screen.queryByText("Brew history")).toBeNull();
expect(screen.queryByText("What leaves this device")).toBeNull();
expect(screen.queryByTestId("support-tile")).toBeNull();
expect(order.indexOf("About XBRW++")).toBeGreaterThan(order.indexOf("LIBRARY"));
```

Enable Labs using the existing injected Settings helper and additionally assert
About follows CARD DIAGNOSTICS. Replace the obsolete top-of-page About/tile tests,
not the persistence, restore, destructive-action or sheet coverage.

- [x] **Step 2: Run the Settings layout selectors to confirm they fail.**

```bash
npx jest --runTestsByPath app/__tests__/settings.test.tsx -t 'order|About|support|tip jar|brewing preferences' --watch=false
```

- [x] **Step 3: Reorder unchanged groups and wire the header.**

Use `<ScreenHeader title="Settings" onBack={() => router.back()}
action={<SupportAction/>}/>` and import the named support export. Remove the
scrolling support tile and redundant shortcut blocks. Place the unchanged
MachineSection first, followed by the single Brewing group with auto-start,
then Units, Recipe list, account, Library, gated tools and About/version.
Keep A-D's exact `scrollEnd`, stable host, sheet siblings, accessibility guards,
restore handlers, accepted copy and preference bindings.

Update About's placement comment, the Settings/support sections of `docs/copy.md`,
and the 2.2.0 change/testing ledgers. Document correct-device readings, narrow/
large-text header checks, real BLE gaps and no changes to model or brew logic.
Keep the shipped 2.1.0 ledger identical to the pinned task base.

- [x] **Step 4: Run the complete Settings and related navigation suites.**

```bash
npx jest --runTestsByPath app/__tests__/settings.test.tsx app/__tests__/about.test.tsx components/__tests__/MachineSection.test.tsx components/__tests__/ScreenHeader.test.tsx components/__tests__/SupportTile.test.tsx --watch=false
npm run typecheck
npm run lint
```

Expected: both-platform tests, typecheck and lint pass; no unrelated source delta.
Commit the source adoption and approved adaptations with the coauthor trailer.

## Task 4: Verification, focused PR and exactly one review

Pre-review checkpoint: all 434 affected tests pass across both platforms;
typecheck and lint pass. Expo Doctor passes 20/21 checks but now requires
`expo` 57.0.31, `expo-router` 57.0.29 and `expo-sharing` 57.0.24, one patch
above the unchanged task lockfile. Package comparisons include native Android
artifacts. Do not suppress the hard gate or silently expand this UI-only task
into dependency/runtime maintenance; obtain a scope decision first.

- [x] Inspect the full base-to-head diff and run the smallest combined affected
  suites, escalating to the existing full-suite CI for the final branch.
- [ ] Verify the header's actual flex layout at 320/390 points and font scales
  1/2, long names, card folds and reachable footer. Use a local simulator or
  isolated actual-component browser harness; do not claim a mockup proves RN
  layout or physical BLE safety.

  Actual-component iOS simulator checks passed at 320/390 points with measured
  font scales 1.00 and 2.14, including the long-name card. Automated tests cover
  folds and footer order. Full-app screen-reader/sheet and physical BLE checks
  remain on the release checklist; the unavailable idb helper was not repaired
  by changing the user's tooling.
- [ ] Push the task branch and open a focused PR against develop, explaining the
  adaptation of #231, acceptance gaps and the no-merge boundary.
- [ ] Inspect existing reviews/requested reviewers before requesting Copilot.
  If none ran automatically, request `copilot-pull-request-reviewer[bot]` once
  and verify a real request/review exists. Do not use the display-name login.
- [ ] Implement meaningful findings, add regressions, reply and resolve threads,
  push, and wait for all CI jobs on the exact final HEAD. Do not request a second
  review after fixes.
- [ ] Fetch origin without pruning and run `npm run worktrees:check`. Record the
  retained task's owner, exact branch/path/base/head, clean/push state, pending
  merge and hardware/UI gaps. Update the coordinating issue only for actual
  readiness; neither #231 nor its package is merged yet.
- [ ] Stop with the PR green and ready for the user's merge decision. Do not merge
  it or reconcile the live preview without further authorization.
