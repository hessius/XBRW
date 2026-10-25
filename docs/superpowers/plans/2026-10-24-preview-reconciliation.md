# Selective Preview Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the explicitly approved refinements from historical preview #252 into accepted 2.2.0 development without restoring superseded proposals.

**Architecture:** Start from accepted develop and port narrow behaviour into existing domain helpers and UI components. Existing coffee-detail, appearance and catalogue abstractions remain authoritative; preserve accepted dose and bag implementations. Keep the historical preview unchanged and account for its remaining differences by content, not tree equality.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, Jest's iOS and Android projects, asynchronous React Native Testing Library v14.

---

## Execution contract

The maintainer approved
`docs/superpowers/specs/2026-10-24-preview-reconciliation-design.md`
before this plan was written, then explicitly approved inline implementation.
Tasks 1-9 are implemented and software-qualified in serial checkpoints.
PR creation/review, merge, #252 closure, Metro changes, native builds and
worktree deletion still require separate applicable authority.

Use inline execution unless the maintainer requests delegation. This is one
bounded reconciliation with serial, independently testable commits; it does not
require parallel agents or simultaneous heavy suites.

- Owned worktree: `/Users/jesperhessius/Dev/XBRW-220-preview-reconciliation-20261024`.
- Branch: `chore/2.2.0-preview-reconciliation-20261024`.
- Pinned develop base: `f48738fd9479ac0c9308eb9433678db02ca32c45`.
- Pinned preview source: `dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2`.
- Approved design checkpoint: `feaeda0c71a3d4b61d6e9e6c3fb71f5c6ac880c2`.
- Read `AGENTS.md`, `.github/copilot-instructions.md` and
  `docs/development-workflow.md` before changes. Keep all other worktrees intact.
- Use `@/` imports, existing palette roles, no new manual memoisation and no
  state-reset effects. Await RNTL render, renderHook, fireEvent and rerender.
- Use `renderWithProviders`; wrap test trees in `AppearanceScope` when selecting
  a theme. Do not pass an unsupported wrapper option to `renderWithProviders`.
- Sheet presses that need to complete an action use `waitFor` with
  `{timeout: SHEET_PRESS_TIMEOUT}`.
- Every implementation commit includes the Copilot co-author trailer.
- Never restore an entire modified production file from preview.

## File map and task order

| Task | Production responsibility | Existing test surfaces |
| --- | --- | --- |
| 1 | `library/brew/BrewRecord.ts`, `library/subscriptionStatus.ts`: history validity and status copy | BrewRecord, brewNote, dialAfterBrew, historyQuery, handoff/envelope; new subscriptionStatus suite |
| 2 | `components/RecipeHero.tsx`: whole-word fitting | RecipeHero |
| 3 | `components/FromSection.tsx`, `components/PodSection.tsx`: one shared roaster display rule | FromSection, PodSection, AboutDeck |
| 4 | `library/coffeeDetails.ts`, `components/PodCoffeeRows.tsx`, `library/roasterCatalogue.ts`: shared bean facts | coffeeDetails, PodCoffeeRows, roasterCatalogue |
| 5 | Remaining action consumers and catalogue selection: existing theme roles only | Focused new primary-action suite; existing EasyModeSlots and route tests |
| 6 | BrewStageLadder/Rung and catalogue callers; shared photo/chip reuse | BrewStageRung, hubRecipe, roasterCatalogue |
| 7 | External artwork and `docs/url-scheme.md` | licences and native-intent suites; asset inspection |
| 8 | Additional import regressions and current documentation | Re-import, BrewMind/importDecoration and network inventory |
| 9 | Integrated qualification and decision accounting | Existing full software gates; explicit manual gaps |

Tasks 1-3 are independent. Task 4 shares the coffee presentation surface with
Task 3 but has no arithmetic dependency on it. Task 5 establishes catalogue
action/selection expectations before Task 6 changes the same route files.
Task 8 reconciles documentation after Tasks 1-7. Task 9 follows all prior tasks.
Do not restructure the app or extract a general presentation framework.

## Task 1: Correct fine-grind history and paused/no-cache status

**Files**
- Modify: `library/brew/BrewRecord.ts`, `library/brew/dialAfterBrew.ts`.
- Test: `library/brew/__tests__/BrewRecord.test.ts`,
  `library/brew/__tests__/brewNote.test.ts`,
  `library/brew/__tests__/dialAfterBrew.test.ts`,
  `library/brew/__tests__/historyQuery.test.ts`,
  `library/brew/handoff/__tests__/envelope.test.ts`.
- Modify: `library/subscriptionStatus.ts`.
- Create: `library/__tests__/subscriptionStatus.test.ts`.

- [x] Add valid/invalid grinder cases to the existing `grinderRan` describe.
  Import the existing full `brew` fixture from
  `@/library/brew/handoff/__tests__/fixtures`, rather than creating new partial
  records with casts:

```ts
it.each([1, 15, 30, 39, 40, 80])("recognises whole BLE grind %p", grindSize => {
    expect(grinderRan(brew({grinderUsed: true, grindSize}))).toBe(true);
    expect(grinderRan(brew({grinderUsed: false, grindSize}))).toBe(false);
});
it.each([-1, 0, 81, 200, NaN, Infinity, 1.5, 40.5])(
    "does not claim grinding at %p", grindSize => {
        expect(grinderRan(brew({grinderUsed: true, grindSize}))).toBe(false);
    }
);
```

- [x] Add this handoff regression in the existing envelope suite; `buildEnvelope`,
  `brew` and `DEVICE_NAME` are already imported:

```ts
it.each([1, 30, 39])("exports fine BLE grind %p", grindSize => {
    const envelope = buildEnvelope(brew({grinderUsed: true, grindSize}), []);
    expect(envelope.brew.grindSize).toBe(String(grindSize));
    expect(envelope.brew.grinderName).toBe(DEVICE_NAME);
});
```

- [x] Bring in the new, isolated paused-copy test suite from the pinned source:

```bash
git restore --source=dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2 -- library/__tests__/subscriptionStatus.test.ts
npx jest --runTestsByPath library/brew/__tests__/BrewRecord.test.ts library/brew/handoff/__tests__/envelope.test.ts library/__tests__/subscriptionStatus.test.ts
```

Expected red: whole fine grinds are excluded and paused/no-cache says loading
or failure. Invalid fractional grinds must remain excluded.

- [x] Preserve the existing `grinderUsed !== true` early return and replace
  only the following grind predicate:

```ts
return typeof record.grindSize === "number"
    && Number.isInteger(record.grindSize)
    && grindBand(record.grindSize) !== undefined;
```

  In `dialAfterBrew.ts`, correct the narrowing comment to "a valid BLE band".
  Do not change grind bounds, card encoding or the handoff schema.

- [x] Replace only the no-cache branch in `rowLine`:

```ts
if (feed === null) {
    if (sub.paused) return "Updates paused";
    return sub.lastError === undefined ? "Loading coffees" : "Couldn't update";
}
```

- [x] Run the combined affected-domain suites:

```bash
npx jest --runTestsByPath library/brew/__tests__/BrewRecord.test.ts library/brew/__tests__/brewNote.test.ts library/brew/__tests__/dialAfterBrew.test.ts library/brew/__tests__/historyQuery.test.ts library/brew/handoff/__tests__/envelope.test.ts library/__tests__/subscriptionStatus.test.ts
```

Expected: both projects pass; existing off/unrecorded behaviour is unchanged.
Preserve or selectively add preview's consumer regressions for fine grind,
but do not duplicate cases already proved by these suites.

- [x] Commit the Task 1 files:

```bash
git add library/brew/BrewRecord.ts library/brew/dialAfterBrew.ts library/brew/__tests__ library/brew/handoff/__tests__/envelope.test.ts library/subscriptionStatus.ts library/__tests__/subscriptionStatus.test.ts
git commit -m "fix: recognise fine BLE grinds and paused subscriptions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Fit long editor titles without splitting words beside the watermark

**Files**
- Modify: `components/RecipeHero.tsx`.
- Test: `components/__tests__/RecipeHero.test.tsx`.

- [x] Extend the existing imports with `wordsFit` and add these focused cases:

```ts
it("requires whole words when fitting beside the profile", () => {
    expect(wordsFit("hydrohoney", 1, 22)).toBe(false);
    expect(wordsFit("hydrohoney", 1000, 22)).toBe(true);
    expect(wordsFit("two words", 1000, 22)).toBe(true);
});
it.each([320, 360, 412])("uses the band for an overwide title word at %p", width => {
    const name = "Colombia hydrohoneyhydrohoney";
    const layout = heroNameLayout(name, width);
    expect(layout.tight).toBe(true);
    expect(layout.profileHeight).toBe(PROFILE_BAND_HEIGHT);
    expect(layout.reserve).toBeGreaterThanOrEqual(0);
});
```

- [x] Run `npx jest --runTestsByPath components/__tests__/RecipeHero.test.tsx`.
  Expected red: helper missing and/or current narrow-column selection.
- [x] Add the pure helper adjacent to `wrapLines`/`estimateLines`:

```ts
export function wordsFit(text: string, width: number, fontSize: number): boolean {
    return text.split(" ").filter(Boolean)
        .every(word => textEm(word) * fontSize <= width);
}
```

  Add `&& wordsFit(name, beside - FIT_SLACK, size)` to the existing beside
  layout condition. Keep existing full-width fallback, band reserve and pencil
  calculations unless the focused geometry tests demonstrate a coupled defect.
  Do not copy preview's unused `breakLines` word bookkeeping or `hero-name-row`.

- [x] Re-run RecipeHero and `app/__tests__/editRecipe.test.tsx` together.
  Expected: normal titles, long-name termination, rename access, collapse,
  existing photo placement and narrow/large-scale layout cases still pass.
- [x] Commit:

```bash
git add components/RecipeHero.tsx components/__tests__/RecipeHero.test.tsx
git commit -m "fix(editor): keep long title words whole beside the profile" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Apply the approved roaster-first display rule consistently

**Files**
- Modify: `components/FromSection.tsx`, `components/PodSection.tsx`.
- Test: `components/__tests__/FromSection.test.tsx`,
  `components/__tests__/PodSection.test.tsx`,
  `components/__tests__/AboutDeck.test.tsx`.

- [x] Add FromSection regression cases using existing `recipeWith`/`props`:

```tsx
it.each(["import", "brewmind"] as const)("prefers the named roaster for %s", source => {
    const recipe = recipeWith({source, sharedBy: "A sharer",
        sharedByAvatar: "https://example.com/avatar.png",
        coffee: {name: "", roaster: " Roastery ", imageUrl: "https://example.com/coffee.png"}});
    expect(roasterOf(recipe)).toBe("Roastery");
});
it("keeps an ordinary personal share inside the broad display rule", async () => {
    const recipe = recipeWith({source: "import", sharedBy: "A sharer",
        sharedByAvatar: "https://example.com/avatar.png",
        coffee: {name: "", roaster: "Roastery", imageUrl: "https://example.com/coffee.png"}});
    const before = JSON.stringify(recipe);
    await renderWithProviders(<FromSection {...props({recipe, showAvatar: true})}/>);
    expect(screen.getByText("From Roastery")).toBeTruthy();
    expect(screen.queryByText("Arrived from A sharer")).toBeNull();
    expect(screen.getByTestId("from-avatar").props.source)
        .toEqual({uri: "https://example.com/coffee.png"});
    expect(JSON.stringify(recipe)).toBe(before);
});
```

  Import `roasterOf` from FromSection. Also exercise blank roaster, local
  recipe with coffee metadata, disabled images, missing coffee image, image
  load failure, roaster-only/no-XID display and existing recipe-page links.
  Existing ordinary-sharer and xBloom cases must stay.

- [x] In PodSection tests, add:

```tsx
it("labels a roaster profile without offering to replace the chosen title", async () => {
    await renderWithProviders(<PodSection {...props({recipe: linked({
        source: "import", name: "Chosen coffee name", coffee: {name: "", roaster: "Roastery"}
    })})}/>);
    expect(screen.getByText("xBloom profile name")).toBeTruthy();
    expect(screen.queryByTestId("pod-use-name")).toBeNull();
    expect(screen.getByLabelText("Recipe ID")).toBeTruthy();
});
```

  Retain tests that ordinary renamed recipes can USE THIS NAME and that
  following the pod clears the name rather than copying it.

- [x] Run the three Task 3 suites and establish the intended red cases.
- [x] Export this helper from FromSection and import it in PodSection:

```ts
export function roasterOf(recipe: Recipe): string | undefined {
    if (recipe.source !== "import" && recipe.source !== "brewmind") return undefined;
    const roaster = recipe.coffee?.roaster?.trim() ?? "";
    return roaster === "" ? undefined : roaster;
}
```

  Use a short truthful comment: this is a display heuristic, not verified
  provenance. Do not copy preview comments asserting that every match really
  arrived from that roaster.

- [x] In FromSection, compute and use these values:

```ts
const roaster = roasterOf(recipe);
const avatar = roaster !== undefined
    ? recipe.coffee?.imageUrl ?? ""
    : recipe.sharedByAvatar ?? "";
```

  Extend the empty-section guard with `&& roaster === undefined`. Render
  `From ${roaster}` when defined, otherwise preserve the existing wording.
  Keep the image setting/failure fallback and page link intact.

- [x] In PodSection add `const fromRoaster = roasterOf(recipe) !== undefined`.
  Insert the label and change only the linked-name presentation and button gate:

```tsx
{fromRoaster && (
    <Text testID="pod-profile-label" fontSize={12} color={palette.dim}>
        xBloom profile name
    </Text>
)}
<Text testID="pod-name" numberOfLines={2}
      fontSize={fromRoaster ? 14 : 16}
      color={fromRoaster ? palette.dim : palette.text}>
    {recipe.xbloomName}
</Text>
```

  Gate the existing USE THIS NAME block with `renamed && !fromRoaster`.
  Preserve the existing USING THIS NAME state for unnamed recipes, XID input,
  lookup notes, image settings and header-rename flow.

- [x] Run all three Task 3 suites. Expected: eligible imports change display;
  local/blank-roaster recipes and serialized metadata do not change.
- [x] Commit the two components and their three test files with message
  `feat(editor): prefer roaster identity for named coffee imports` and the
  required co-author trailer.

## Task 4: Share flavour detail and complete catalogue bean facts

**Files**
- Modify: `library/coffeeDetails.ts`, `components/PodCoffeeRows.tsx`,
  `library/roasterCatalogue.ts`.
- Test: `library/__tests__/coffeeDetails.test.ts`,
  `components/__tests__/PodCoffeeRows.test.tsx`,
  `library/__tests__/roasterCatalogue.test.ts`.

- [x] Add this pure regression and variants for no flavours, identical
  case/spacing-folded notes, flavours-only and an empty coffee:

```ts
it("leads with flavours and retains distinct notes", () => {
    const detail = coffeeDetails({
        flavours: ["Papaya", "Citrus"], aromatics: "Sweet papaya with a citrus finish"
    }, {podName: ""});
    expect(detail?.groups.flat().find(row => row.field === "aromatics"))
        .toEqual({field: "aromatics", label: "FLAVOUR", spokenLabel: "Flavour",
            value: "Papaya, Citrus", detail: "Sweet papaya with a citrus finish"});
});
```

  Add the matching component assertion through the existing PodCoffeeRows
  recipe fixture: main text, secondary text and the composed label
  `Flavour, Papaya, Citrus. Sweet papaya with a citrus finish`.

- [x] Add the catalogue fact case using the existing `feed` fixture:

```ts
it("includes shared optional facts without repeating catalogue headings", () => {
    const base = feed([{id: "a"}]).coffees[0];
    const facts = beanFacts({...base, coffee: {
        beanMix: "Single origin", roastingDate: "2026-09-03",
        decaffeinated: true, roaster: "Roastery", roast: "Light", aromatics: "Citrus"
    }});
    expect(facts).toEqual([
        {label: "TYPE", value: "Single origin"},
        {label: "ROASTED", value: "2026-09-03"},
        {label: "CAFFEINE", value: "Decaf"}
    ]);
});
```

- [x] Run all three Task 4 suites; expect missing detail and optional facts.
- [x] Add `detail?: string` to `CoffeeDetailRow` and implement:

```ts
function flavourRow(coffee: PodCoffee): CoffeeDetailRow[] {
    const flavours = coffee.flavours ?? [];
    if (flavours.length === 0) return row("aromatics", "FLAVOUR", "Flavour", coffee.aromatics);
    const value = flavours.join(", ");
    const notes = said(coffee.aromatics);
    const detail = notes !== undefined && folded(notes) !== folded(value) ? notes : undefined;
    return [{field: "aromatics", label: "FLAVOUR", spokenLabel: "Flavour", value,
        ...(detail !== undefined ? {detail} : {})}];
}
```

  Replace only the existing aromatics row with `...flavourRow(coffee)`.
  The hydrated PodCoffee flavour list is already the input contract; do not add
  a second import normaliser here.

- [x] Replace DetailRow's single value Text with a flexible YStack containing
  its original 13/19 text and optional 12/17 dim detail:

```tsx
<YStack flex={1} minWidth={0} gap={2}>
    <Text fontSize={13} lineHeight={19} color={palette.text}>{row.value}</Text>
    {row.detail !== undefined && (
        <Text testID={`coffee-${row.field}-detail`} fontSize={12} lineHeight={17}
              color={palette.dim}>{row.detail}</Text>
    )}
</YStack>
```

  Set the row label to `row.detail === undefined
  ? \`${row.spokenLabel}, ${row.value}\`
  : \`${row.spokenLabel}, ${row.value}. ${row.detail}\``.

- [x] Import shared `coffeeDetails`, `formatCuppingPoints` and `formatElevation`
  into roasterCatalogue. Replace only its duplicate fact/formatter code:

```ts
export {formatElevation};
export function formatScore(points: number): string {
    return `${formatCuppingPoints(points)} points`;
}
const DRAWN_ELSEWHERE = new Set(["roaster", "aromatics", "roast"]);
export function beanFacts(coffee: FeedCoffee): BeanFact[] {
    const details = coffeeDetails(coffee.coffee, {podName: coffee.name});
    if (details === null) return [];
    return details.groups.flat()
        .filter(row => !DRAWN_ELSEWHERE.has(row.field))
        .map(row => ({label: row.label, value: row.value}));
}
```

  Keep cache functions unchanged; do not add `readCatalogueFrom`.
- [x] Run Task 4 suites plus `app/__tests__/roasterCatalogue.test.tsx`.
  Expected: existing origin suppression/formatting and omitted empty/false
  caffeine fields remain correct.
- [x] Commit with message `feat(coffee): share flavour detail and catalogue facts`
  and the required co-author trailer.

## Task 5: Finish enabled primary actions without restyling disabled controls

**Files**
- Modify: `components/BeanNameSheet.tsx`, `components/BrewNoteSheet.tsx`,
  `components/LeaveEditorSheet.tsx`, `components/EasyModeSlots.tsx`,
  `app/hub.tsx`, `app/hubRecipe.tsx`, `app/index.tsx`,
  `app/roasterCoffee.tsx`.
- Create: `components/__tests__/primaryActionReconciliation.test.tsx`.
- Extend: `components/__tests__/EasyModeSlots.test.tsx`,
  `app/__tests__/hub.test.tsx`, `app/__tests__/hubRecipe.test.tsx`,
  `app/__tests__/index.test.tsx`, `app/__tests__/roasterCatalogue.test.tsx`.

- [x] Before edits, capture the existing disabled assertions/styles for
  EasyModeSlots write, retry, both confirmation variants and original-set
  restore. Extend those existing fixtures to all `THEME_IDS`; do not invent
  machine fixtures or bypass serial/busy guards.
- [x] Add a new focused primary-action suite with an actual sheet consumer:

```tsx
import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";
import {StyleSheet} from "react-native";
import BeanNameSheet from "@/components/BeanNameSheet";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import LeaveEditorSheet from "@/components/LeaveEditorSheet";
import {RATING_SHEET_DONE} from "@/constants/brewCopy";
import {resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS} from "@/library/appearance";
import {renderWithProviders} from "@/test-utils/render";

it.each(THEME_IDS)("uses the primary pair for save in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <LeaveEditorSheet open intent="leave"
                onSave={jest.fn()} onDiscard={jest.fn()} onCancel={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByRole("button", {name: "Save changes"});
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(primary.fill);
    expect(within(button).getByText("Save changes")).toHaveStyle({color: primary.ink});
});

it.each(THEME_IDS)("uses the primary pair for DONE in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <BrewNoteSheet open onOpenChange={jest.fn()} figures="14:32"
                recipeName="Coffee" rating={0} note=""
                onRate={jest.fn()} onNote={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByTestId("brew-note-done");
    expect(button).toHaveStyle({backgroundColor: primary.fill});
    expect(within(button).getByText(RATING_SHEET_DONE)).toHaveStyle({color: primary.ink});
});

it.each(THEME_IDS)("keeps coffee-name actions primary in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <BeanNameSheet open onOpenChange={jest.fn()} suggestion=""
                onConfirm={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByTestId("bean-name-send");
    expect(button).toHaveStyle({backgroundColor: primary.fill});
    expect(within(button).getByText("SKIP")).toHaveStyle({color: primary.ink});
    await fireEvent.changeText(screen.getByTestId("bean-name-field"), "Coffee");
    expect(within(button).getByText("SEND")).toHaveStyle({color: primary.ink});
});
```

  These cases use the declared props and existing copy. Assert rendered label
  ink through `within(button).getByText(...)`, not child component props.
  Keep cancellation, required-name NOT NOW and send behaviour covered by the
  existing route tests.

- [x] Run the focused new suite and affected route suites to show missing
  primary roles on non-default themes.
- [x] For enabled-only consumers, destructure `{palette, primary}` and replace
  the old action `palette.text`/`onFill(palette.text).text` pair with
  `primary.fill`/`primary.ink`. Apply this to:
  BeanName SEND/SKIP/NOT NOW, BrewNote DONE, LeaveEditor save,
  HubStatus, HubFooter retry, hub-detail TRY AGAIN and home clear-search.
  Remove a now-unused `onAccent` variable only when no other branch needs it.
- [x] In EasyModeSlots, retain `appearance.onFill(palette.text)` as the old
  disabled ink source. For write/retry and their inner Doto labels use:

```tsx
backgroundColor={primary.fill}
color={blocked ? onAccent.text : primary.ink}
disabledStyle={{backgroundColor: palette.text, opacity: 0.45}}
```

  Inner label `color` uses the same blocked conditional. For the primary
  confirmation branch, retain the existing disabledStyle (including absence
  where absent) and old disabled background/ink, changing only its enabled
  pair. For restore, name the existing boolean `restoreBlocked` if needed
  and conditionally keep its old background/ink while disabled:

```ts
const restoreBlocked = active || overlay || !connected || !serialMatches || busy || !available;
```

  Do not copy preview's new disabled roles or change any recovery callback,
  confirmation gate, experiment state or port availability.
- [x] In roasterCoffee, destructure `selection`; replace selected size fill/ink
  with `selection.fill`/`selection.ink`. Preserve its primary Action component's
  disabled opacity and colours. Do not alter bag, shelf or hub SAVE disabled
  styling.
- [x] Run the new suite and affected suites together, then existing
  `components/__tests__/appearanceBoundary.test.ts`,
  `components/__tests__/colors.test.ts` and
  `components/__tests__/bagAppearance.test.tsx`.
  Expected: theme-aware enabled actions, neutral selected size, unchanged
  disabled rendering and interactions.
- [x] Commit with message `fix(appearance): finish primary actions without disabled restyling`
  and the required co-author trailer.

## Task 6: Make catalogue stage plans readable and reuse catalogue parts

**Files**
- Modify: `components/BrewStageLadder.tsx`, `components/BrewStageRung.tsx`,
  `app/hubRecipe.tsx`, `app/roasterCoffee.tsx`, `constants/network.ts`.
- Test: `components/__tests__/BrewStageRung.test.tsx`,
  `app/__tests__/hubRecipe.test.tsx`,
  `app/__tests__/roasterCatalogue.test.tsx`,
  `library/__tests__/networkInventory.test.ts`.

- [x] Extend the rung suite's existing `draw` helper cases:

```tsx
it("uses text ink for a catalogue plan but leaves live pending ink dim", async () => {
    const view = await draw({plan: true});
    expect(view.getByText("93°")).toHaveStyle({color: palette.text});
    expect(view.getByText("70 ml")).toHaveStyle({color: palette.text});
    await view.unmount();
    const live = await draw();
    expect(live.getByText("93°")).toHaveStyle({color: palette.dim});
    expect(live.getByText("70 ml")).toHaveStyle({color: palette.dim});
});
```

  Also assert the plan number uses resolved recipe ink, SVG glyph stroke
  uses the same accent through `processColor`, and existing segment flexes,
  pause markers and active/done/stalled tests are unchanged.
- [x] Run the rung test and establish the missing plan-mode red case.
- [x] Add `plan?: boolean` to both Props types; default it to false in both
  component parameter lists and pass `plan={plan}` from ladder to each rung.
  Make only these colour substitutions:

```tsx
color={state === "active" || plan ? displayAccent : palette.dim}
accent={state === "active" || plan ? displayAccent : palette.dim}
color={plan ? palette.text : palette.dim}
```

  First applies to stage number, second to PourGlyph, third to both
  temperature and volume/readout. Do not add container opacity.
- [x] Pass `plan` only at hubRecipe and roasterCoffee's static ladder call sites.
  Keep live run and history callers on the default.
- [x] Import `{Chip, DetailPhoto}` from `@/components/CatalogueParts` in
  hubRecipe. Remove only its local duplicate components, their photo constants
  and now-unused Image import. Keep `whole` absent, preserving banner mode.
  Remove `app/hubRecipe.tsx` from outbound image `sources` because the actual
  Image call now resides in existing CatalogueParts.
- [x] Run Task 6 suites. Existing route tests must still prove absent-photo
  placeholders and image-error fallback; add the same two assertions through
  shared CatalogueParts if existing route mocks obscure the actual Image.
  Expected: identical banner geometry, same catalogue data, unchanged live
  rung values and no assertion based solely on mocked ladder props.
- [x] Commit with message `feat(catalogue): clarify stage plans and share detail parts`
  and the required co-author trailer.

## Task 7: Preserve the external link-button kit

**Files**
- Create: `assets/branding/link-buttons/NOTICE.txt` and all sixteen artwork files.
- Modify: `docs/url-scheme.md`, `constants/__tests__/licences.test.ts`.
- Historical references: `docs/superpowers/specs/2026-10-17-link-buttons-design.md`,
  `docs/superpowers/plans/2026-10-17-link-buttons.md`.

- [x] Restore only the new asset directory from the pinned preview:

```bash
git restore --source=dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2 -- assets/branding/link-buttons
git ls-files assets/branding/link-buttons
```

  Expected: seventeen files, four designs (bold/muted, logo/text), each with
  SVG and PNG 1x/2x/3x, plus NOTICE. No font binaries.
- [x] Port the Ready-to-use buttons section from pinned preview's
  `docs/url-scheme.md` with its usage examples, fixed asset revision URLs and
  notices. Preserve develop's existing protocol text. Verify every fixed URL
  targets an existing committed asset; never point an image at a blob page.
  Preserve normal accessible link semantics and lack of install fallback.
- [x] Add this asset inventory test to the licences suite with imports
  `readdirSync`/`readFileSync` from `node:fs` and `join` from `node:path`:

```ts
it("ships self-contained external buttons and their notices", () => {
    const root = join(process.cwd(), "assets/branding/link-buttons");
    const files = readdirSync(root);
    expect(files).toHaveLength(17);
    for (const tone of ["bold", "muted"]) {
        for (const kind of ["logo", "text"]) {
            const stem = `open-in-xbrw-${tone}-${kind}`;
            for (const suffix of [".svg", ".png", "@2x.png", "@3x.png"]) {
                expect(files).toContain(`${stem}${suffix}`);
            }
            const svg = readFileSync(join(root, `${stem}.svg`), "utf8");
            expect(svg).not.toMatch(/<text\b|<image\b|<script\b/i);
        }
    }
    expect(readFileSync(join(root, "NOTICE.txt"), "utf8"))
        .toContain("SIL OPEN FONT LICENSE");
});
```

  Also retain preview's stronger dependency-coverage assertion: import
  `{dependencies}` from `@/package.json` and iterate `Object.keys(dependencies)`
  instead of the existing four-package sample. Do not hand-edit generated
  `constants/licences.ts` or weaken coverage for a missing declared package.
- [x] Run `npx jest --runTestsByPath constants/__tests__/licences.test.ts app/__tests__/native-intent.test.ts`.
  Inspect PNG dimensions with `sips -g pixelWidth -g pixelHeight` for each
  named variant/density: logo 215x48, text 175x48 at 1x, exact 2x/3x multiples.
  Open the actual four SVG designs on light and dark grounds; preserve the
  approved source artwork rather than redesigning it.
- [x] Preserve the two link-button historical design/plan files from the pinned
  source only as historical evidence; do not execute their old plan.
- [x] Commit with message `docs: publish external recipe-link button kit`
  and the required co-author trailer.

## Task 8: Retain useful import regressions and reconcile current documentation

**Files**
- Create: `hooks/__tests__/useRecipeImport.reimport.test.ts`.
- Extend: `library/__tests__/importDecoration.test.ts`,
  `library/__tests__/brewmindLink.test.ts`.
- Modify: `README.md`, `app/settings.tsx`, `constants/network.ts`,
  `docs/copy.md`, `docs/release-2.2.0-changes.md`,
  `docs/release-2.2.0-testing.md`.
- Evidence-dependent edits only: `AGENTS.md`, `.github/copilot-instructions.md`,
  `docs/development-workflow.md`, `docs/release-2.1.0-changes.md`,
  `docs/machine-integration/ble-protocol.md` and related historical designs.

- [x] Restore the new re-import suite from pinned preview, then run it unchanged:

```bash
git restore --source=dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2 -- hooks/__tests__/useRecipeImport.reimport.test.ts
npx jest --runTestsByPath hooks/__tests__/useRecipeImport.reimport.test.ts hooks/__tests__/useRecipeImport.test.ts
```

  Expected: it characterises existing production code, not a new importer.
  It covers unchanged/edited copies, refresh decisions, blank-field enrichment
  and failed saves. If a test conflicts with accepted contracts, reconcile that
  test explicitly; do not silently change production to match old preview.
- [x] Compare preview's added roaster-colour describes with current tests.
  Preserve only missing cases, including valid colour application and invalid
  colour omission without losing the recipe. Never append duplicate describes
  merely to reproduce preview's file shape.

```bash
git diff f48738fd9479ac0c9308eb9433678db02ca32c45 dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2 -- library/__tests__/importDecoration.test.ts library/__tests__/brewmindLink.test.ts
npx jest --runTestsByPath library/__tests__/importDecoration.test.ts library/__tests__/brewmindLink.test.ts
```

- [x] Update the setting description to:

```tsx
description="Show coffee or pod photos on recipe cards and Ready to brew."
```

  Update the outbound-image trigger sentence to say Recipe card photos
  includes Ready to brew, without changing its placements or privacy controls.
  Add README's roaster capability paragraph and existing roaster-guide link.
- [x] Add current reconciliation sections to the 2.2.0 change/testing records:
  list accepted items, explicit exclusions, exact task head and actual software
  results after Task 9. Preserve #266/#267 merge facts and the newer dose
  spec/plan. Explain that #252 remains historical and does not need parity.
  Native large-text/VoiceOver/TalkBack, real device theme/coffee-image rendering
  and physical NFC/BLE remain open unless independently qualified.
- [x] Reconcile the copy inventory with roaster/profile/flavour/paused wording.
  Do not add an unused updated-to-latest constant or restore SAVE AS copy.
- [x] Verify historical release and protocol additions against the existing
  coordinating evidence before carrying them:

```bash
git show --no-patch v2.1.0
gh pr view 248 --json state,mergeCommit,mergedAt
gh pr view 250 --json state,mergeCommit,mergedAt
gh release view v2.1.0 --json tagName,targetCommitish,publishedAt,body
```

  Keep useful released-2.1.0 chronology and already-recorded field-capture
  protocol evidence, with its original source/firmware limitations. Do not
  invent hardware passes, transplant unrelated timing code or erase caution.
  If a historical claim cannot be verified, retain its source in the
  reconciliation evidence record as unverified rather than asserting it in
  authoritative docs.
- [x] Preserve relevant picture-placement/shelf/BrewMind history only where it
  explains accepted work; clearly label obsolete experiments. Do not copy the
  774-line historical picture implementation plan as a new instruction to
  restore photo-in-header layouts.
- [x] Run:

```bash
npx jest --runTestsByPath hooks/__tests__/useRecipeImport.reimport.test.ts hooks/__tests__/useRecipeImport.test.ts library/__tests__/importDecoration.test.ts library/__tests__/brewmindLink.test.ts library/__tests__/networkInventory.test.ts app/__tests__/settings.test.tsx
git diff --check
```

- [x] Commit with message `test: retain import regressions and reconcile preview records`
  and the required co-author trailer.

## Task 9: Qualify the combined result and prepare content-based closeout

**Files**
- Update evidence only in this plan and the current 2.2.0 change/testing ledger.
- Do not modify app.json, dependency manifests, card limits, Quick Edit,
  bypass arithmetic, bag databases or machine transport as incidental work.

- [x] Inspect `git diff --stat f48738fd9479ac0c9308eb9433678db02ca32c45`
  and review every production hunk against the sixteen-row spec ledger.
  Record an accepted/omitted/supporting classification for all original preview
  paths; whitespace and duplicate tests do not require separate product decisions.
- [x] Prove protected surfaces stayed unchanged:

```bash
git diff --exit-code f48738fd9479ac0c9308eb9433678db02ca32c45 -- app.json package.json package-lock.json library/bypassLimits.ts library/quickEdit.ts hooks/useRecipeEditor.ts hooks/useRecipeLibrary.ts library/roasterRecipes.ts components/AboutDeck.tsx components/RecipeOverflowSheet.tsx components/QuickEditPanel.tsx components/BypassRung.tsx constants/colors.ts
```

  Expected: no delta. App route primary-role edits are permitted but must not
  reintroduce SAVE AS, remove scrolling/notices or alter bag relationships.
- [x] Run the existing integrated gates serially:

```bash
npm run typecheck
npm run lint
npm test -- --watch=false
npx expo-doctor
```

  Expected: typecheck succeeds; lint has no errors; both platform projects pass;
  Doctor passes all checks. Record exact counts, warnings, skips and head.
  Restore/install dependencies only after a missing-dependency failure.
  Do not hide failures, run competing heavy pools or weaken expectations.
- [x] Review the final diff directly for meaningful errors, especially disabled
  ink in Light/Blue, broad roaster eligibility, stale documentation and
  catalogue default/live separation. Fix regressions and rerun their smallest
  covering suites before escalating again.
- [x] Commit actual qualification evidence and push the authorised task branch.
  Do not invent CI results: a task branch push does not replace PR CI.
- [x] At handoff fetch `origin --no-prune`, run `npm run worktrees:check`, and
  record exact base/head, branch/path, clean/dirty and remote state. Retain this
  owned task worktree for pending review, with its pushed branch as recovery
  pointer. Existing retained worktrees still require exact cleanup authority.
- [x] Stop for lifecycle permission. If later authorised, open one focused PR
  against develop, count automatic ruleset review before requesting a single
  Copilot review, resolve findings and wait for exact-head required CI.
  Merge only with explicit approval. After integration, update #249 and close
  #252 only with permission and complete content accounting, never by merging
  or resetting historical preview wholesale.

## Qualification results (2026-10-25)

The application and test tree was qualified at
`3debb92e38d64afb4bef8706aa532c45d721bdc8`, based on develop
`f48738fd9479ac0c9308eb9433678db02ca32c45`. Subsequent closeout edits
record results only; they do not change that application/test tree.

| Gate | Actual result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with 0 errors and 33 warnings; no rule suppression added. |
| `npm test -- --watch=false` | Both projects: 924 suites passed, 2 skipped; 20,866 tests passed, 26 skipped; both snapshots passed. |
| `npx expo-doctor` | 21/21 checks passed. |
| Protected-surface diff against pinned develop | Empty: manifests/config, accepted dose/bypass/bag paths and colour definitions remain unchanged. |
| Original preview inventory | Exactly 120 unique paths: 36 accepted, 46 supporting, 38 omitted. |
| External kit | All 16 fixed-revision download URLs returned HTTP 200; original SVGs inspected on light/dark grounds and PNG sizes verified. |
| Direct final review | No further introduced correctness issue found; disabled styles, metadata preservation and default/live stage separation retained. |

The first two full attempts failed only the subsequently approved sharing-test
retry race; those failures are not represented as passes. The unchanged test
passed in the 18-suite/784-test focused batch before its approved correction.
After the correction, the share/export batch passed 6 suites/324 tests, and the
complete integrated gate sequence above passed. No test skip/todo flags were
added or removed. Existing React animation/act warnings remain visible.

Serial implementation checkpoints are `4ee37582` (domain), `e4fb6aae` (title),
`a09950bc` (roaster), `590063b7` (coffee), `6dd8008a` (primary actions),
`c6616f5e` (catalogue), `de1b7e1f` (kit), `702a1fa1` (supporting evidence),
`5d527b6b` (supplementary regressions/inventory) and `3debb92e` (approved
test-only retry correction). All are on the owned task branch.

Logs and the SVG comparison screenshot are retained in the coordination
session's files under `reconcile-qualified-*`,
`reconcile-share-race-fix-green.log`, `reconcile-support-extra-tests.log` and
`reconciliation-button-artwork-light-dark.png`.
At this software-qualification checkpoint, no reconciliation PR or new automated
review had been authorised or created. The maintainer subsequently authorised
PR #277 and one Copilot review round with CI closeout, stopping before merge.
The PR records exact-head review/check results. Local software qualification
is not release/device sign-off; the native/manual checklist remains open.

The owned worktree is retained for the pending lifecycle decision and has its
pushed task branch as recovery pointer. Historical preview/Metro are unchanged.
The older merged appearance, bag and dose worktrees still need ignored-content
preservation, idle-owner verification and exact cleanup approval; the dose
worktree also supplies this task's lockfile-matched dependency symlink.
No cleanup or release operation is implied by completing this plan.

## Original preview path accounting

This accounts for all 120 paths differing between pinned develop
`f48738fd9479ac0c9308eb9433678db02ca32c45` and historical preview
`dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2`. Accepted means the selected
behaviour/artwork was ported, not that the entire preview file was copied.
Supporting means retained/adapted evidence or coverage. Omitted means preserve
accepted develop instead of the preview delta. New focused regression files
outside this original inventory are additional coverage, not unaccounted source.

| Original path | Disposition | Content decision |
| --- | --- | --- |
| `.github/copilot-instructions.md` | Supporting | Verified shipped-release chronology; workflow gates preserved. |
| `AGENTS.md` | Supporting | Verified release chronology and current development line. |
| `README.md` | Supporting | Roaster capability and publisher guide. |
| `app.json` | Omitted | No bare date-picker plugin or native configuration change. |
| `app/__tests__/editRecipe.test.tsx` | Supporting | Adapted roaster/primary expectations; preserve accepted dose coverage. |
| `app/__tests__/index.beanFilters.test.tsx` | Omitted | Preserve accepted bag/dose fixtures rather than old preview shape. |
| `app/__tests__/index.test.tsx` | Supporting | Enabled clear-search role; retain accepted home contracts. |
| `app/__tests__/settings.test.tsx` | Supporting | Roaster-feed reachability, subscription/opt-out and photo copy. |
| `app/easyMode.tsx` | Omitted | Already themed when enabled; retain disabled appearance. |
| `app/editRecipe.tsx` | Omitted | Keep accepted #267 dose and editor layout. |
| `app/hub.tsx` | Accepted | Enabled primary retry/status roles only. |
| `app/hubRecipe.tsx` | Accepted | Shared photo/chip, primary retry, static plan. |
| `app/index.tsx` | Accepted | Enabled clear-search role only; keep accepted dose and bag logic. |
| `app/roasterCoffee.tsx` | Accepted | Neutral size selection and static plan. |
| `app/settings.tsx` | Accepted | Accurate Recipe card photos copy. |
| `assets/branding/link-buttons/NOTICE.txt` | Accepted | Artwork permission and font notices. |
| `assets/branding/link-buttons/open-in-xbrw-bold-logo.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-logo.svg` | Accepted | Original outlined artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-logo@2x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-logo@3x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-text.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-text.svg` | Accepted | Original outlined artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-text@2x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-bold-text@3x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-logo.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-logo.svg` | Accepted | Original outlined artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-logo@2x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-logo@3x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-text.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-text.svg` | Accepted | Original outlined artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-text@2x.png` | Accepted | Original artwork. |
| `assets/branding/link-buttons/open-in-xbrw-muted-text@3x.png` | Accepted | Original artwork. |
| `components/AboutDeck.tsx` | Omitted | No unused bag prototype controls or obsolete photo placement. |
| `components/BagSheet.tsx` | Omitted | Existing enabled role kept; disabled redesign excluded. |
| `components/BeanNameSheet.tsx` | Accepted | Enabled primary role. |
| `components/BrewNoteSheet.tsx` | Accepted | Enabled primary role. |
| `components/BrewStageLadder.tsx` | Accepted | Default-false catalogue plan flag. |
| `components/BrewStageRung.tsx` | Accepted | Catalogue-only colours without geometry/value changes. |
| `components/BypassRung.tsx` | Omitted | Preserve accepted dose-bound notice and bypass controls. |
| `components/DeckSwitch.tsx` | Omitted | Whitespace only. |
| `components/EasyModeSlots.tsx` | Accepted | Enabled primary roles; old disabled style/ink retained. |
| `components/FromSection.tsx` | Accepted | Broad roaster display heuristic; no metadata mutation. |
| `components/HubSaveBar.tsx` | Omitted | Already themed; retain disabled style. |
| `components/LeaveEditorSheet.tsx` | Accepted | Enabled primary role. |
| `components/NameShelfSheet.tsx` | Omitted | Already themed; retain disabled style. |
| `components/PodCoffeeRows.tsx` | Accepted | Distinct secondary flavour notes and accessible label. |
| `components/PodSection.tsx` | Accepted | Quiet labelled profile; no roaster USE THIS NAME action. |
| `components/QuickEditPanel.tsx` | Omitted | Preserve accepted one-brew shortcuts, scrolling and no SAVE AS. |
| `components/RecipeHero.tsx` | Accepted | Whole-word fit guard only; keep current layout. |
| `components/RecipeOverflowSheet.tsx` | Omitted | No unused legacy bag props. |
| `components/SettingsActionRow.tsx` | Omitted | No unused mark API. |
| `components/XbrwSheet.tsx` | Omitted | Comment-only explanation of already accepted wrapping. |
| `components/__tests__/AboutDeck.test.tsx` | Supporting | Separate circular coffee/author images and setting gate. |
| `components/__tests__/BrewStageRung.test.tsx` | Supporting | Rendered static plan and unchanged live defaults. |
| `components/__tests__/BypassRung.test.tsx` | Omitted | Preserve accepted bounds-notice assertions. |
| `components/__tests__/EasyModeSlots.test.tsx` | Supporting | Enabled theme roles and existing disabled states. |
| `components/__tests__/FromSection.test.tsx` | Supporting | Broad roaster eligibility, fallback and metadata preservation. |
| `components/__tests__/HubSaveBar.test.tsx` | Omitted | Preview expects rejected disabled roles. |
| `components/__tests__/LibraryRail.test.tsx` | Omitted | Keep accepted theme-role assertions. |
| `components/__tests__/PodCoffeeRows.test.tsx` | Supporting | List/detail order, duplicate suppression and a11y. |
| `components/__tests__/PodSection.test.tsx` | Supporting | Quiet profile label and ordinary personal-share behaviour. |
| `components/__tests__/QuickEditPanel.test.tsx` | Omitted | Retain accepted #267 coverage, not original SAVE AS assertions. |
| `components/__tests__/RailChip.test.tsx` | Omitted | Keep accepted selection roles; no global constant. |
| `components/__tests__/RailViewToggle.test.tsx` | Omitted | Keep accepted selection roles; no global constant. |
| `components/__tests__/RecipeHero.test.tsx` | Supporting | Long-word fit regressions across narrow widths. |
| `components/__tests__/RecipeShelfTilePhoto.test.tsx` | Supporting | Photo tile retains rating, bag badge and accessible facts. |
| `components/__tests__/RoasterOfferSheet.test.tsx` | Supporting | Existing retry-on-sheet-entrance helper for decline action. |
| `components/__tests__/ScreenHeader.test.tsx` | Supporting | Existing subtitle/meta placement regression. |
| `components/__tests__/appearanceBoundary.test.ts` | Omitted | Keep current role boundary; no global primary constant. |
| `components/__tests__/bagAppearance.test.tsx` | Supporting | Existing theme matrix plus retained open-calendar/day regression. |
| `components/__tests__/colors.test.ts` | Omitted | Rejected disabled-role proposal; keep existing colour contracts. |
| `components/__tests__/previewAppearanceIntegration.test.tsx` | Supporting | Keep current bag/theme coverage; move useful calendar regression to bagAppearance, omit obsolete BagSection/SAVE AS/disabled API. |
| `constants/__tests__/licences.test.ts` | Supporting | All declared dependencies and self-contained artwork inventory. |
| `constants/colors.ts` | Omitted | Existing theme roles suffice; no global or disabled-primary additions. |
| `constants/copy.ts` | Omitted | Unused UPDATED_TO_LATEST constant. |
| `constants/network.ts` | Supporting | Shared catalogue photo call site and Ready to brew trigger. |
| `docs/copy.md` | Supporting | Current roaster/profile/flavour/status meaning; keep accepted dose copy. |
| `docs/development-workflow.md` | Supporting | Verified #248/#250 release chronology, unchanged gates. |
| `docs/machine-integration/ble-protocol.md` | Supporting | Previously recorded positioning/tea fixture evidence with limitations. |
| `docs/release-2.1.0-changes.md` | Supporting | Verified immutable source/artifact and promotion chronology. |
| `docs/release-2.2.0-changes.md` | Supporting | Current accepted scope and #266/#267 closeout; no stale preview acceptance. |
| `docs/release-2.2.0-testing.md` | Supporting | Open manual gates, distinct from software results. |
| `docs/superpowers/plans/2026-10-17-link-buttons.md` | Supporting | Retained and labelled historical. |
| `docs/superpowers/plans/2026-10-20-recipe-picture-placement.md` | Omitted | Historical experiments remain at pinned preview; not a new execution plan. |
| `docs/superpowers/plans/2026-10-23-dose-shortcuts.md` | Omitted | Preserve newer accepted #267 implementation record. |
| `docs/superpowers/specs/2026-09-16-library-shelves-design.md` | Supporting | Document accepted stock-photo exception against current shelfCover. |
| `docs/superpowers/specs/2026-09-28-brewmind-integration-design.md` | Supporting | Existing colour, feed and rest-field contract amendments. |
| `docs/superpowers/specs/2026-10-17-link-buttons-design.md` | Supporting | Retained and labelled historical. |
| `docs/superpowers/specs/2026-10-20-recipe-picture-placement-design.md` | Supporting | Relevant shelf/photo history accounted for in current docs; experiments remain at pinned preview. |
| `docs/superpowers/specs/2026-10-23-dose-shortcuts-design.md` | Omitted | Preserve accepted lightweight adaptation, not old preview state. |
| `docs/url-scheme.md` | Supporting | Fixed-revision button downloads and accessible website/native examples. |
| `hooks/__tests__/compilerOptOut.test.ts` | Omitted | Preserve accepted compiler and dose contract. |
| `hooks/__tests__/useRecipeEditor.autosave.test.ts` | Omitted | Keep newer regression coverage removed by preview. |
| `hooks/__tests__/useRecipeEditor.bypass.test.ts` | Omitted | Keep stable-anchor, notice and rounding coverage. |
| `hooks/__tests__/useRecipeImport.reimport.test.ts` | Supporting | New characterisation passes unchanged on current importer. |
| `hooks/__tests__/useRecipeImport.test.ts` | Supporting | New/held recipe colour integration regression. |
| `hooks/useRecipeEditor.ts` | Omitted | Preserve accepted stable proportional-bypass anchor and autosave. |
| `hooks/useRecipeLibrary.ts` | Omitted | No old preview saveAtDose workflow. |
| `library/__tests__/brewmindLink.test.ts` | Supporting | Strict valid/invalid colour, alias and no synthetic coffee. |
| `library/__tests__/bypassLimits.test.ts` | Omitted | Keep accepted dose arithmetic and unchanged card boundary. |
| `library/__tests__/coffeeDetails.test.ts` | Supporting | Flavour shape, deduplication/fallback and catalogue facts. |
| `library/__tests__/importDecoration.test.ts` | Supporting | One nonduplicate roaster-colour set. |
| `library/__tests__/networkInventory.test.ts` | Supporting | Accurate shared-image call inventory. |
| `library/__tests__/quickEdit.test.ts` | Omitted | Preserve accepted dose/bypass tests instead of SAVE AS shape. |
| `library/__tests__/subscriptionStatus.test.ts` | Supporting | Paused/no-cache with and without prior error. |
| `library/brew/BrewRecord.ts` | Accepted | Whole BLE grind 1-80, grinderUsed still required. |
| `library/brew/__tests__/BrewRecord.test.ts` | Supporting | Valid fine/ordinary and invalid/off/fractional history. |
| `library/brew/__tests__/brewNote.test.ts` | Supporting | Valid fine-grind history interpretation. |
| `library/brew/__tests__/dialAfterBrew.test.ts` | Supporting | Fine BLE fallback without inventing a confirmed reading. |
| `library/brew/__tests__/historyQuery.test.ts` | Supporting | Fine 39 now participates in valid grind sort. |
| `library/brew/dialAfterBrew.ts` | Supporting | Terminology follows BLE history band, not NFC card band. |
| `library/brew/handoff/__tests__/envelope.test.ts` | Supporting | Fine 1/30/39 include grinder metadata in handoff. |
| `library/bypassLimits.ts` | Omitted | Preserve accepted stable arithmetic. |
| `library/coffeeDetails.ts` | Accepted | Short flavours and distinct longer notes. |
| `library/machine/__tests__/Machine.linkPin.test.ts` | Supporting | Cancel/target replacement cannot send after held verification. |
| `library/machine/__tests__/savedMachineSettings.test.ts` | Omitted | Existing test already passes; no weaker write expectation needed. |
| `library/quickEdit.ts` | Omitted | Accepted one-brew dose/bypass behaviour unchanged. |
| `library/roasterCatalogue.ts` | Accepted | Shared coffee facts/formatters; no unused public cache reader. |
| `library/roasterRecipes.ts` | Omitted | Roast advice already enters through validated path. |
| `library/subscriptionStatus.ts` | Accepted | Paused/no-cache copy before active loading/failure copy. |

### Approved qualification-only exception

Both full-suite attempts reached the unchanged Android invalid-accent sharing
test, where `waitFor` pressed Share again before inspecting a capture that had
completed between retries. Expected capture count 2 became 95/92 rather than
2. The test passed unchanged in the 18-suite/784-test focused run.
The maintainer explicitly approved a narrow test-only correction: retry a press
only while no new capture has been observed, then retain the original exact
`captures + 1` assertion and snapshot-preservation assertion. No sharing,
capture, timeout or application implementation changes are authorised by this
exception. `app/__tests__/brewRecord.test.tsx` is additional qualification work,
not a previously unaccounted original preview path.

The two omitted historical picture documents remain recoverable at the pinned
preview commit. Their obsolete header-photo/implementation experiments are not
current requirements; the current accepted placements and settings are retained.

## Plan self-review and execution handoff

Coverage map: spec decisions 8/11 -> Task 1; 2 -> Task 2; 3/4 -> Task 3;
5/6 -> Task 4; 7/16 -> Task 5; 10/14 -> Task 6; 13 -> Task 7;
15 -> Task 8. Decisions 1/9/12 are preservation/exclusion checks in Task 9.
Task 9 covers integrated qualification and permission boundaries.

The maintainer approved inline execution after the planning checkpoint.
Implementation and software qualification are now recorded above. No subagent
was launched. PR creation/review, integration and destructive cleanup remain
separate lifecycle choices, not implied by the implementation approval.
