# Appearance and recipe palettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Inline execution is a good fit for this single, cross-cutting presentation change; do not run competing migrations or heavy test processes.

**Goal:** Implement the approved combined #257/#243 appearance design: four themes, independent recipe-colour modes, neutral utility selections, selective primary-action colour, and consistent accessible presentation without changing recipe identities or brewing.

**Architecture:** Keep canonical colour identities and all actual colour definitions in `constants/colors.ts`; add pure, explicit presentation resolution and one reactive appearance scope above the navigator. Settings remain the synchronous persistence authority, while pure domain code stays independent of React and active appearance. Existing Tamagui controls, layout, charts and export compositions are retained, with explicit colours resolved for the surface being drawn.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19/React Compiler, TypeScript 6, Tamagui 2, Expo Router, synchronous expo-sqlite, Reanimated, SVG, ViewShot, Jest projects `ios` and `android`, asynchronous RNTL 14.

---

## Authority, permissions and starting point

The maintainer approved `docs/superpowers/specs/2026-10-21-theming-design.md`
after commit `85150b2931e0b2d9aae0289dd9ae2ac6ad0d8c3b`. That specification,
including its twelve-slot palette tables and contrast floors, is authoritative.
This plan is not permission to start implementation, create a PR, close #243,
merge, build a native client, deploy, or promote a release.

**Execution status — 2026-10-22:** The maintainer subsequently authorized serial
implementation. Tasks 1–11 are implemented, reviewed and pushed through
`8cb8b1190901e00cdc2520b3873c4530153fafef`; Tasks 8 and 9 preceded Task 7 as
required by its boundary gate. Task 12 is local qualification/documentation
only. Its new commits remain local for controller review and push. No PR,
automated GitHub review, native build/prebuild, merge, deployment or cleanup
permission is implied. The original per-step instructions/checklists below
remain execution history, not evidence that a historical RED command or a
native/manual gate ran; current task states and qualification are recorded here
and in Task 12.

| Task | Current state / implementation checkpoint |
| --- | --- |
| 1 — identities and validation | Implemented/reviewed; `94b0c514` |
| 2 — pure presets and contrast | Implemented/reviewed; `57d59448`, `c677280d` |
| 3 — persistence and pure scope | Implemented/reviewed; `c9448dd3` |
| 4 — action/selection controls and legacy colours | Implemented/reviewed; `785df105`, `aa35aeb1` |
| 5 — shared primitives | Implemented/reviewed; `5ca507f1`, `6380663e` |
| 6 — recipe/shelf/machine presentation | Implemented/reviewed; `170d40d1` |
| 8 — charts/history/contrast refinements | Implemented/reviewed; `7801b95a` through `59f064ee` |
| 9 — stable root and native configuration | Implemented/reviewed; `87b0e955`; native qualification pending |
| 7 — all remaining consumers and AST boundary | Implemented/reviewed; `253fda4e`, `4c8c4093`, `38e1d4f3` |
| 10 — frozen image appearance | Implemented/reviewed; `7f5f0c2e`; actual PNG qualification pending |
| 11 — Settings, restore and scripted lifecycle | Implemented/reviewed; `8cb8b119`; physical gates pending |
| 12 — qualification/documentation | Local execution only; native/manual/PR acceptance remains pending |

Continue the owned task rather than creating another design branch:

| Item | Exact value |
| --- | --- |
| Worktree | `/Users/jesperhessius/Dev/XBRW-220-appearance-20261022` |
| Branch | `feat/2.2.0-appearance-20261022` |
| Pinned implementation base | `98f3ae5255dfc691bc44d7c5ed356e47830f3df9` |
| Approved spec commit | `85150b2931e0b2d9aae0289dd9ae2ac6ad0d8c3b` |
| Integration target, when authorized | `develop` |

Do not cherry-pick #243 wholesale or use cumulative preview #252 as the base.
The #243 source inspected was `8a45a42c1bfbb33ccde33d8ea012dc389b02b52b`;
its one Copilot review has already happened. An authorized focused adaptation
gets at most one review round of its own, including automatic reviews.

Read `AGENTS.md`, `.github/copilot-instructions.md`, and
`docs/development-workflow.md` before execution. Preserve the shared primary,
cumulative preview, external foldable and original theming worktrees. The
preview-only paused-subscription copy correction is a separately tracked
backport, not part of this change.

## File responsibilities and fixed interfaces

| File | Responsibility |
| --- | --- |
| `library/appearance.ts` (new) | IDs, defaults, enum guards and validation results. No colours, React or database imports. |
| `constants/colors.ts` | Existing canonical exports; complete preset definitions; pure display-fill, foreground, chart and machine-ink resolution. No settings access. |
| `hooks/useAppearance.tsx` (new) | Pure `AppearanceScope`, `useAppearance`, and production `AppearanceProvider` using `useSetting`. No native side effects in the pure scope. |
| `hooks/useNativeAppearance.ts` (new) | Applying explicit light/dark mode and native root background; lifecycle cleanup and reported native failures. |
| `components/AppearanceSheet.tsx` (new) | Existing `XbrwSheet` and labelled choices; no second sheet/picker library. |
| `library/Settings.ts`, `app/settings.tsx` | Independent persisted keys, backup snapshot, restore guards and error notices. |
| `app/_layout.tsx` | Stable provider composition, navigation/Tamagui surfaces, status/navigation bars. |
| `test-utils/render.tsx` | SafeArea/Tamagui/appearance test wrapper without opening the production database. |
| `library/brew/traceStyle.ts` | Pure chart presentation receiving explicit appearance; no active global theme. |
| `hooks/useBrewExport.ts` | Freeze a capture appearance at the image press; canonical data exports unchanged. |
| `components/BrewStorySheet.tsx` | Apply the capture scope around the actual ViewShot child, not only around an already-resolved parent. |
| Existing UI consumers in the inventory below | Reactive tokens, actual-surface foregrounds, no geometry or business-logic rewrite. |
| `app.json`, `package.json`, `package-lock.json` | Native light/dark support and the SDK-matched Android navigation-bar dependency. |
| `plugins/withDarkNavigationBar.js`, its test | Retire the conflicting fixed-dark plugin in favour of SDK 57 navigation-bar configuration. |

Use the following names consistently throughout implementation:

```ts
// library/appearance.ts
export const THEME_IDS = ["original", "light", "blue", "magenta"] as const;
export type ThemeId = typeof THEME_IDS[number];
export type RecipeColourMode = "original" | "themed";
export type AppearanceChoice = Readonly<{
    theme: ThemeId;
    recipeColours: RecipeColourMode;
}>;
export const DEFAULT_APPEARANCE: AppearanceChoice = {
    theme: "original", recipeColours: "original"
};
export function isThemeId(value: unknown): value is ThemeId {
    return THEME_IDS.some((id) => id === value);
}
export function isRecipeColourMode(value: unknown): value is RecipeColourMode {
    return value === "original" || value === "themed";
}
```

The Settings keys are **`appearanceTheme`** and **`recipeColourMode`**. IDs are
wire values; displayed names are Original Dark, Light, Offline Blue, Magenta,
Original and Themed. Do not add follow-system, a third selector or custom colours.

```ts
// Public presentation contracts in constants/colors.ts.
export type Palette = {readonly [K in keyof typeof palette]: string};
export type AccentForeground = {readonly [K in keyof typeof onAccent]: string};
export type ControlPair = Readonly<{
    fill: string; ink: string; pressedFill: string; pressedInk: string;
}>;
export type DisplayRecipeColour = Readonly<{
    canonical: string;
    fill: string;
    ink: string;
    cupInk: string;
    onAccent: AccentForeground;
    keyInk: Readonly<{normal: string; success: string; danger: string}>;
}>;
export type Appearance = Readonly<{
    choice: AppearanceChoice;
    scheme: "light" | "dark";
    palette: Palette;
    primary: ControlPair;
    selection: ControlPair;
    onBrand: {readonly text: string; readonly marker: string};
    chromeSwitch: SwitchPair;
    recipe: (canonical: string) => DisplayRecipeColour;
    chartInk: (displayColour: string, grounds: readonly string[], floor?: number) => string;
    onFill: (fill: string) => AccentForeground;
    switchOn: (fill: string) => SwitchPair;
    machineColour: (canonical: MachineColour) => MachineColour;
}>;
export type SwitchPair = Readonly<{
    on: Readonly<{track: string; ring: string; thumb: string}>;
    off: Readonly<{track: string; ring: string; thumb: string}>;
}>;
// Implemented in Task 2:
// resolveAppearance(choice: AppearanceChoice): Appearance
```

`recipe` accepts canonical colours, never already-mapped display fills. `onFill`
accepts a displayed fill and **does not map identity**. `ink` is for small text
on chrome, `fill` for the card, `cupInk` for the chart. Do not introduce a global
active `onAccent`: a badge on `palette.info`, a neutral selection, and a recipe
card can require three different foregrounds in the same frame.
`chartInk` fits an already-displayed colour against non-empty actual chart
grounds (including composited tints), defaulting to the 3:1 graphic floor.
It does not map identity; text callers explicitly request the 4.5:1 floor.

### Execution dependencies

Execute Tasks **1, 2, 3, 4, 5, 6, 8, 9, 7, 10, 11, 12** in that order.
Task numbers identify work packages, not an implied dependency chain:
the complete UI import-boundary gate in Task 7 requires the chart-reference
migration in Task 8 and root/native migration in Task 9. Settings persistence
and snapshot typing land in Task 3; the user-facing entry and restore flow land
in Task 11. Do not run these overlapping UI migrations concurrently.

## Task 1: Lock canonical identities and the validation boundary

**Files:** Create `library/appearance.ts`,
`library/__tests__/appearance.test.ts`; extend
`library/__tests__/Recipe.card.test.ts` and
`library/machine/__tests__/commands.test.ts` in Task 11, not domain production code.

- [ ] Add failing ID/default tests before adding the module:

```ts
import {
    DEFAULT_APPEARANCE, THEME_IDS, isThemeId, isRecipeColourMode
} from "@/library/appearance";

it("has four explicit themes and two independent modes", () => {
    expect(THEME_IDS).toEqual(["original", "light", "blue", "magenta"]);
    expect(DEFAULT_APPEARANCE).toEqual({theme: "original", recipeColours: "original"});
    expect(["original", "themed"].every(isRecipeColourMode)).toBe(true);
});
it.each([null, 1, "", "Light", "system", " original "])("rejects theme %p", (value) => {
    expect(isThemeId(value)).toBe(false);
});
it.each([null, false, "Original", "custom"])("rejects mode %p", (value) => {
    expect(isRecipeColourMode(value)).toBe(false);
});
```

- [ ] Run `npx --no-install jest --runTestsByPath library/__tests__/appearance.test.ts`.
  Expect a missing-module failure in both projects. If the chosen command fails
  because this task worktree has no dependencies, run `npm ci` in this worktree
  only, then repeat. Do not symlink another session's dependency tree.
- [ ] Add the exact ID/default/guard implementation above. Add this pure
  recovery result so an unknown stored string cannot silently become a preset:

```ts
export function readAppearanceChoice(theme: unknown, recipeColours: unknown): {
    choice: AppearanceChoice; invalidKeys: string[];
} {
    const invalidKeys: string[] = [];
    if (!isThemeId(theme)) invalidKeys.push("appearanceTheme");
    if (!isRecipeColourMode(recipeColours)) invalidKeys.push("recipeColourMode");
    return {
        choice: {
            theme: isThemeId(theme) ? theme : DEFAULT_APPEARANCE.theme,
            recipeColours: isRecipeColourMode(recipeColours)
                ? recipeColours : DEFAULT_APPEARANCE.recipeColours
        },
        invalidKeys
    };
}
```

  Test valid mixed choices, both invalid values, and one invalid value leaving
  the other choice intact. The production provider reports `invalidKeys`;
  this helper neither notifies during render nor rewrites storage.
- [ ] Repeat the test command; expect both projects green.
- [ ] Commit the module and tests with subject `feat: define appearance choices`
  and the required Copilot trailer. Every later checkpoint also uses that trailer.

## Task 2: Complete pure presets, actual-surface roles and contrast tests

**Files:** Modify `constants/colors.ts`, extend
`components/__tests__/colors.test.ts`; create
`components/__tests__/appearanceColors.test.ts`. Reuse the independent
`contrast` and `over` from `test-utils/contrast.ts`; production must not import it.

- [ ] Add failing all-eight-combination tests:

```ts
import {accents, resolveAppearance} from "@/constants/colors";
import {THEME_IDS} from "@/library/appearance";
import {contrast, over} from "@/test-utils/contrast";

for (const theme of THEME_IDS) {
    for (const recipeColours of ["original", "themed"] as const) {
        const a = resolveAppearance({theme, recipeColours});
        it(`${theme}/${recipeColours}: all twelve card and key compositions`, () => {
            for (const canonical of [...accents.coffee, ...accents.tea]) {
                const c = a.recipe(canonical);
                expect(c.canonical).toBe(canonical);
                expect(contrast(c.onAccent.text, c.fill)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(c.onAccent.label, c.fill)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(c.onAccent.marker, c.fill)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(c.onAccent.profileStroke, c.fill)).toBeGreaterThanOrEqual(3);
                const key = over(c.onAccent.key, c.fill);
                expect(contrast(c.onAccent.key, c.fill)).toBeGreaterThanOrEqual(3);
                for (const ink of Object.values(c.keyInk)) {
                    expect(contrast(ink, key)).toBeGreaterThanOrEqual(3);
                }
                expect(contrast(c.ink, a.palette.base)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(c.cupInk, a.palette.base)).toBeGreaterThanOrEqual(3);
            }
        });
    }
}
```

  Add explicit expectations for each corresponding hex, original-mode identity,
  case-insensitive historical matching, unknown `#C86A3B` retaining its exact
  fill, four distinct choice identities, and no mutation of canonical arrays.
  Verify eight distinct coffee slots and four distinct tea slots for each
  themed preset; do not merely check array lengths.
- [ ] Run both colour files with one `npx jest --runTestsByPath` invocation.
  Expect missing `resolveAppearance`, not a changed canonical expectation.
- [ ] Keep current `palette`, `onAccent`, `onBrand`, `accents`,
  `machineColours`, `mix`, `cupLineFor` as canonical/default-compatible exports.
  Add the widened types above and these complete corresponding arrays:

```ts
const recipePalettes: Readonly<Record<ThemeId, typeof accents>> = {
    original: accents,
    light: {
        coffee: ["#254E83", "#8B463A", "#8B3656", "#426039", "#255F58", "#654581", "#286076", "#83465E"],
        tea: ["#46613D", "#725429", "#685D25", "#84433F"]
    },
    blue: {
        coffee: ["#A9C1FF", "#7296E8", "#8CA9ED", "#BACDFB", "#86BBD9", "#B7B1F0", "#C6DFFF", "#8E9BD9"],
        tea: ["#CED7F5", "#AABCD9", "#D6E4EE", "#9EADD3"]
    },
    magenta: {
        coffee: ["#F4A0CA", "#CC7AA7", "#EAB0D0", "#BA95B6", "#D9A0C2", "#D1A5D8", "#E7C0D5", "#DC8EBA"],
        tea: ["#DFCBD8", "#BBA2B2", "#F1DAE8", "#CBADB9"]
    }
};
```

  Implement `resolveAppearance` by looking up `(group,index)` in canonical
  `accents` using uppercase comparison. Map only a recognised slot when
  `recipeColours === "themed"`; otherwise retain the supplied fill. Return the
  original canonical argument unchanged. Do not round-trip through a Recipe.
- [ ] Add complete palette overrides, with all colour literals still in this
  module. The approved foundations are fixed; supplementary roles start here:

```ts
const chrome: Readonly<Record<ThemeId, Palette>> = {
    original: palette,
    light: {
        ...palette, base: "#F5F4F0", surface: "#FFFFFF", raised: "#ECEBE6",
        control: "#DCDAD5", line: "#C5C3BD", text: "#171717", dim: "#595959",
        placeholder: "#595959", muted: "#78736B", brand: "#AD0057",
        brandFill: "#D10069", success: "#1F6A3B", warn: "#785B00",
        danger: "#AF2118", info: "#254E83", dangerFaint: "#956C66",
        successMuted: "#42664C", warnMuted: "#71623F"
    },
    blue: {
        ...palette, base: "#0015B8", surface: "#061FA8", raised: "#0D28B8",
        control: "#1936C2", line: "#3455CC", text: "#FFFFFF", dim: "#CED7FF",
        placeholder: "#CED7FF", muted: "#7F98E4", brand: "#FFB5D8",
        success: "#9AF1B3", warn: "#FFE58F", danger: "#FFB0A5",
        info: "#C6DFFF", dangerFaint: "#D3A3AA",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    },
    magenta: {
        ...palette, base: "#260B1D", surface: "#331127", raised: "#401831",
        control: "#50213F", line: "#6A3153", text: "#FFFFFF", dim: "#D7BECE",
        placeholder: "#D7BECE", muted: "#9A748A", brand: "#FF76BA",
        success: "#9AF1B3", warn: "#FFE58F", danger: "#FFB0A5",
        info: "#E7C0D5", dangerFaint: "#BD969F",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    }
};
const actionPairs: Readonly<Record<ThemeId, readonly [string, string]>> = {
    original: ["#FF007F", "#0C0C0C"], light: ["#D10069", "#FFFFFF"],
    blue: ["#E0ECFF", "#091536"], magenta: ["#FF76BA", "#250B1B"]
};
const selectionPairs: Readonly<Record<ThemeId, readonly [string, string]>> = {
    original: ["#FFFFFF", "#0C0C0C"], light: ["#202020", "#FFFFFF"],
    blue: ["#FFFFFF", "#0C0C0C"], magenta: ["#FFFFFF", "#0C0C0C"]
};
function controlPair([fill, ink]: readonly [string, string]): ControlPair {
    return {fill, ink, pressedFill: mix(fill, ink, 0.06), pressedInk: ink};
}
```

  Measure secondary text, placeholders, status ink and wordmark brand on every
  real chrome surface, including `control` when used there. Decorative line
  and actually disabled tokens do not get body-text tests. Informative text
  using `muted`, including `BrewHistoryRow`'s NOT WATCHED, moves to `dim`.
- [ ] Implement actual-fill foreground resolution with these exact rules:
  stock fills keep the existing black roles; Light themed fills use white
  text/0.90 labels/0.80 profile strokes; Blue/Magenta themed fills use dark
  text/black 0.80 labels/black 0.70 strokes. Preserve decorative profile washes.
  A white-ink dark card needs a light action key, not the stock dark key.
  Resolve `keyInk` against that key, not against the page background.

  For unknown historical fills, choose the higher-contrast black/white main
  ink. Starting at the applicable label/marker/stroke alpha, increase alpha
  in 0.01 increments until the required floor is met, including alpha 1.
  Implement this bounded search, composition and WCAG relative luminance
  locally in `constants/colors.ts`; use the independent test helper as the
  oracle. Invalid colour syntax must throw an explicit error, not return NaN
  or a plausible colour. Preserve existing valid historical colour support.

  Fit pastel chrome text/chart ink toward the contrasting neutral endpoint
  using `mix(candidate, endpoint, step / 100)` for steps 0 through 100;
  return the first candidate meeting 4.5 for `ink` or 3 for `cupInk`.
  Derive the latter from existing `cupLineFor(fill)` first, retaining its
  avoidance of the warning hue. Never alter a card fill to fix chart contrast.
  Preserve existing Original Dark channel colours when they already pass.
- [ ] Resolve `chromeSwitch` from action/neutral roles, retaining Original
  Dark's existing switch values. Resolve `switchOn(fill)` from the actual
  card foreground: filled versus outlined track and a contrasting thumb.
  Measure on/off track, ring, thumb and adjacent surface compositions.
  Resolve machine ink/muted ink for chrome without changing name or index.
  Keep fixed `brandFill`/`onBrand` support-tile treatment distinct from
  primary action and neutral selection.
- [ ] Run both colour suites. Add failures for primary and selection normal/
  pressed pairs on `base`, `surface`, `raised`; all twelve labels, action keys,
  stock/themed badges, switches, and all four machine identities. Expect no
  lower-contrast waiver. Commit `feat: resolve accessible appearance palettes`.

## Task 3: Persist independent choices and provide a test-safe reactive scope

**Files:** Modify `library/Settings.ts`, `test-utils/render.tsx`,
`app/_layout.tsx`, `app/settings.tsx`; create
`hooks/useAppearance.tsx`, `hooks/__tests__/useAppearance.test.tsx`,
`library/__tests__/appearanceSettings.test.ts`; extend
`library/__tests__/Settings.test.ts`.

- [ ] Add failing defaults/persistence/failure tests. Reuse `fakeStorage` in
  Settings tests; use `createTestDatabase()` from `test-utils/sqlite.ts` and
  mock `appDatabase()` for the SQL-backed test:

```ts
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {Settings, SqliteSettingsStorage} from "@/library/Settings";
let mockDb: FakeSQLiteDatabase;
jest.mock("@/library/appDatabase", () => ({appDatabase: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); });
it("persists both choices through the actual SQL backend", () => {
    const first = new Settings(new SqliteSettingsStorage());
    first.set("appearanceTheme", "light");
    first.set("recipeColourMode", "themed");
    const reopened = new Settings(new SqliteSettingsStorage());
    expect(reopened.get("appearanceTheme")).toBe("light");
    expect(reopened.get("recipeColourMode")).toBe("themed");
});
```

  For write failure, make storage throw only for `appearanceTheme`, after
  constructing Settings. Assert no subscriber notification and previous value
  retained. Do not replace SQL with a query-pattern-matching fake.
- [ ] Run the three new/extended test paths; expect missing keys/provider.
- [ ] Add both defaults:

```diff
 export const DEFAULTS = {
+    appearanceTheme: "original" as ThemeId,
+    recipeColourMode: "original" as RecipeColourMode,
```

  Use imports from `library/appearance.ts`. Preserve existing Settings
  write-before-notify behaviour and lazy `sharedSettings()`. Do not open SQLite
  at module import or introduce asynchronous appearance initialization.
- [ ] Add read bindings and the typed backup snapshot entries in the same
  checkpoint, otherwise adding SettingKeys breaks the existing snapshot type:

```tsx
const [appearanceTheme] = useSetting("appearanceTheme");
const [recipeColourMode] = useSetting("recipeColourMode");
```

```diff
             temperatureUnit,
+            appearanceTheme, recipeColourMode,
```

  This diff is inside `settingsSnapshot()`'s returned object. Task 11 extends
  these two bindings with setters; it must not redeclare duplicate bindings.
- [ ] Implement the pure scope without mounting a production settings store:

```tsx
const AppearanceContext = createContext<Appearance | null>(null);
export function AppearanceScope({choice, children}: {
    choice: AppearanceChoice; children: React.ReactNode;
}) {
    const appearance = resolveAppearance(choice);
    return (
        <AppearanceContext.Provider value={appearance}>
            <Theme name={appearance.scheme}>{children}</Theme>
        </AppearanceContext.Provider>
    );
}
export function useAppearance(): Appearance {
    const appearance = useContext(AppearanceContext);
    if (appearance === null) throw new Error("AppearanceScope is missing");
    return appearance;
}
```

  `AppearanceProvider({children, settings?})` reads both `useSetting` keys,
  calls `readAppearanceChoice`, and renders this scope. It reports invalid
  stored enum values in an effect through `notify({tone:"error",...})`, once
  per invalid signature via a ref. Copy: “Some appearance preferences could
  not be read. Default choices are shown.” Do not set state or write storage
  from that effect, render or `getSnapshot`.
- [ ] Export the existing test `Providers` and add an optional
  `appearance: AppearanceChoice`, defaulting to `DEFAULT_APPEARANCE`:

```tsx
<SafeAreaProvider initialMetrics={METRICS}>
    <TamaguiProvider config={config} defaultTheme={appearance.theme === "light" ? "light" : "dark"}>
        <AppearanceScope choice={appearance}>{children}</AppearanceScope>
    </TamaguiProvider>
</SafeAreaProvider>
```

  Preserve `renderWithProviders`' existing options signature. Tests needing a
  changing choice can put a nested `AppearanceScope` inside the normal wrapper;
  the nearest scope wins. Hook tests use `wrapper: Providers`. Update affected
  bare-render harnesses rather than providing a silent missing-provider fallback.
- [ ] In the provider test, seed a Light/Themed store **before** rendering and
  assert the very first render sees that pair; then change only the theme and
  assert the mode survives. Test valid fallback/reporting for an invalid stored
  string, no database access from pure scopes, and no context-created remount.
  Await every render, renderHook, fireEvent and act.
- [ ] Mount the production provider now, before migrating consumers. Inside
  the existing TamaguiProvider wrap the current Theme/SafeArea/navigation tree
  with one `<AppearanceProvider>`. Keep that wrapper unconditional, without a
  changing key. Task 9 replaces frozen navigation/native values inside it;
  it must not add a second production appearance provider.
- [ ] Run `npx jest --runTestsByPath library/__tests__/Settings.test.ts library/__tests__/appearanceSettings.test.ts hooks/__tests__/useAppearance.test.tsx`
  and `npm run typecheck`; expect green.
  Commit `feat: persist and provide reactive appearance`.

## Task 4: Fix core controls and explicitly separate action from selection

**Files:** Modify `components/RailChip.tsx`, `RailViewToggle.tsx`,
`SegmentedControl.tsx`, `XbrwSwitch.tsx`, `SortSheet.tsx`,
`NameShelfSheet.tsx`, `RenameSheet.tsx`, `NewRecipeSheet.tsx`,
`SettingsActionRow.tsx`, `SupportTile.tsx`, `ExportButton.tsx`,
`SplitBrewButton.tsx`; extend their existing tests and create
`components/__tests__/appearanceControls.test.tsx`.

- [ ] Add failing rendered tests for neutral active filters/list-grid/sort
  choices, recipe-accented segments, SAVE/CREATE SHELF, and support-tile
  independence. Parameterize them over all eight choices using `Providers`.
  Assert accessibility state and actual rendered fill/ink, not child component
  props or `UNSAFE_getAllByType`.
- [ ] Add the two pressed-state regressions: press in on an enabled active
  RailChip and selected RailViewToggle; inspect the rendered native style/SVG
  colour and group opacity. Use `over` to compose foreground and background,
  then any group opacity against the actual parent surface. Assert >=4.5 for
  text and >=3 for the view glyph. Verify the test fails when the former 0.7
  group opacity is restored. Do not only test opaque palette values.
- [ ] Run `npx jest --runTestsByPath components/__tests__/appearanceControls.test.tsx`.
  Expect role/pressed failures before changing the controls.
- [ ] Resolve neutral selections explicitly:

```tsx
const {selection, palette} = useAppearance();
<XStack
    backgroundColor={selected ? selection.fill : palette.none}
    pressStyle={selected
        ? {backgroundColor: selection.pressedFill, opacity: 1}
        : {backgroundColor: palette.control, opacity: 1}}
>
    <DotIcon name={option.icon}
             color={selected ? selection.ink : palette.dim}/>
</XStack>
```

  For a recipe-scoped segment, resolve `appearance.recipe(accent)` and use
  its fill/foreground, not `palette.base` or global recipe ink. If the supplied
  value is already an explicit display fill, name it `displayFill` and use
  `appearance.onFill(displayFill)`. Do not double-map.
- [ ] Use `primary.fill`/`primary.ink` and the explicit pressed pair for primary
  non-recipe SAVE/CREATE SHELF actions. Keep utility actions neutral, BREW
  recipe-local, delete destructive and support on its own brand-filled role.
  Preserve existing accepted switch positioning and thumb motion; migrate
  colour roles rather than replacing XbrwSwitch.
- [ ] Run the targeted control tests and typecheck. Commit
  `fix: separate primary actions from neutral selections`.

## Task 5: Migrate shared primitives and remove frozen colour snapshots

**Files:** Existing components in the inventory; particularly `DigitRoll`,
`DotIcon`, `DotMatrixText`, `Wordmark`, `Stepper`, `ScrollFade`, `RecipePhoto`,
`BeanProfileDeck`, `BeanProfileSheet`, `RecipeOverflowSheet`,
`ShelfOverflowSheet`, `PourProfile`, `BrewMiniBar`, `BrewStageRung`,
`QuickEditPanel`, `MachineDot`, `CloudImportRow`, `CatalogueParts`,
`WriteSweep`, `XbrwToast`.

- [ ] Add a rerender regression in
  `components/__tests__/appearanceConsumers.test.tsx`: render one persistent
  tree in Original, rerender its scope in Light and assert existing text,
  glyphs, input placeholder, stepper controls, open sheet and toast use the new
  colours without losing text-entry state. Explicit colour props still win.
  Run it and observe static-token failures.
- [ ] Migrate default parameters **inside the component after its
  unconditional hook**, preserving optional props:

```tsx
export default function ScrollFade({color, ...rest}: Props) {
    const {palette} = useAppearance();
    const resolvedColor = color ?? palette.base;
    // Existing render uses resolvedColor and rest; geometry is unchanged.
}
```

  Apply the same operation to BeanProfileDeck/Sheet `accent`, DigitRoll/DotIcon/
  both DotMatrixText paths `color`, overflow-sheet `tone`, RecipePhoto
  `backing`, Wordmark `color`, BrewTrace `planColor`, RailChip `accent` and
  PourProfile's stroke/fill/dot. Resolve palette-derived defaults before any
  early return. Destructure DotMatrixText props before hooks; do not add hooks
  conditionally in its animated/nonanimated branch.
- [ ] Replace module-time colour snapshots with render-time values or pure
  factories. These are the complete identified snapshots:

| File | Frozen value | Replacement |
| --- | --- | --- |
| `app/_layout.tsx` | `AppTheme` | Active navigation object in Task 9 |
| `app/machine.tsx` | `TIER_COLOUR` | Local map from active palette |
| `components/BrewStoryCard.tsx` | `styles.frame.backgroundColor` | Keep geometry static; active background style |
| `components/BrewSummary.tsx` | `styles.capture.backgroundColor` | Active capture background |
| `components/BrewTrace.tsx` | `PAUSE_FILL` | Active chart-role value |
| `components/CatalogueParts.tsx` | `BADGE_COPY` | Static copy plus active tone map |
| `components/CloudImportRow.tsx` | `TONES` | Local active map |
| `components/MachineDot.tsx` | `LOOKS` | Pure palette-parameter factory |
| `components/SplashOverlay.tsx` | backdrop | Explicit fixed branded launch exception, Task 9 |
| `components/Stepper.tsx` | `stepStyle` | Geometry static, active background/border |
| `components/WriteSweep.tsx` | `COLOURS` | Local active state map |
| `components/XbrwToast.tsx` | `TONE_COLOUR` | Local active tone map |

  For example:

```tsx
export function XbrwToast({type, message, width = FALLBACK_WIDTH}: Props) {
    const {palette} = useAppearance();
    const toneColours: Record<NoticeTone, string> = {
        success: palette.success, error: palette.danger, info: palette.info
    };
    const tone = libTypeToTone(type);
    const colour = toneColours[tone];
    // Keep the current accessible alert, resolved notice and layout.
}
```

  `notify` is an ordinary function: it must not call a hook. Its custom
  `XbrwToast` component reads context from the root toaster. Include a mounted
  toaster/portal test, not just a standalone toast-body test.
- [ ] Give ordinary helpers explicit presentation parameters:
  `say(props, palette)` in BrewMiniBar;
  `fillColour(kind, stageColour, palette)` and
  `hatchColours(stageColour, palette)` in BrewStageRung;
  `baselineDetail(...existingArguments, secondaryInk)` in QuickEditPanel.
  Pass `palette.dim` into that final argument. Do not call hooks from lowercase
  helpers, animation worklets or `notify`.
- [ ] Run the new consumer test plus existing DotMatrixText, Stepper, toast,
  profile, stage and switch tests in one Jest invocation. Fix affected harness
  wrappers. Run typecheck and lint; commit
  `refactor: make shared presentation respond to appearance`.

## Task 6: Map recipe, shelf and machine presentation without changing identity

**Files:** `RecipeCard.tsx`, `RecipeHero.tsx`, `RecipeShelfTile.tsx`,
`ShelfMark.tsx`, `ShelfTile.tsx`, `ShelfRoom.tsx`, `SelectableRecipeRow.tsx`,
`EasyModeSlotCard.tsx`, `EasyModeSlots.tsx`, `BeanProfileDeck.tsx`,
`BeanProfileSheet.tsx`, `HubRow.tsx`, `ImportResult.tsx`, `CloudImportRow.tsx`,
`MachineCard.tsx`, `MachineChip.tsx`, `MachineDetailSheet.tsx`,
`MachineSection.tsx`, `MachinePickerSheet.tsx`, `HomeHeader.tsx`,
`hooks/useMachinePicker.ts`; corresponding tests.

- [ ] Add a failing RecipeCard test for Light/Themed using canonical Sky:

```tsx
const choice = {theme: "light", recipeColours: "themed"} as const;
const expected = resolveAppearance(choice).recipe("#9FC3F0");
const recipe = new Recipe();
recipe.name = "Appearance fixture";
recipe.accentIndex = 0;
const savedIndex = recipe.accentIndex;
const savedJson = JSON.stringify(recipe);
await renderWithProviders(
    <AppearanceScope choice={choice}>
        <RecipeCard recipe={recipe} onPress={jest.fn()}/>
    </AppearanceScope>
);
expect(screen.getByTestId("recipe-card-surface")).toHaveStyle({
    backgroundColor: expected.fill
});
expect(recipe.accentIndex).toBe(savedIndex);
expect(JSON.stringify(recipe)).toBe(savedJson);
```

  Use the existing `recipe-card-surface` native test ID; add a native name-node
  ID only if needed. Assert recipe JSON and index remain identical after
  repeated appearance changes.
- [ ] Migrate recipe surfaces through this pattern:

```tsx
const appearance = useAppearance();
const colour = appearance.recipe(resolveAccent(recipe));
// Existing card background -> colour.fill
// Name/stat copy -> colour.onAccent.text / colour.onAccent.label
// Profile -> explicit stroke/fill/dot from colour.onAccent
// Action well -> colour.onAccent.key; action tone -> colour.keyInk
// Small accent text on page -> colour.ink, never colour.fill
```

  `Stat` and `Action` remain module-scope components. Give them actual-fill/
  foreground props or use context with an explicit display fill; never define
  a new component inside RecipeCard to capture appearance.
- [ ] In colour choosers, iterate the canonical `accents[group]`, resolve only
  the displayed swatch, and keep the callback's existing canonical index/value.
  Test every slot, including tea. Do not change `resolveAccent`, `setAccent`,
  new-recipe defaults, roaster assignment, hub normalization or colour matching.
- [ ] Map all shelf-member accents through `recipe` when drawing; preserve
  ShelfMark's 44-point contract, at-most-three profile candidates and accepted
  photo-grid rules. Keep list photos bottom-right at their current size;
  no narrower graph and no new shaded bottom band. RecipePhoto backing must
  match its actual card fill, including dark Light-themed cards.
- [ ] Keep `machineColourOf`/`machineColours` canonical in
  `library/machine/savedMachines.ts`. At UI boundaries call
  `appearance.machineColour(machineColourOf(machine))`; a picker displays
  active inks but still saves the canonical integer. Verify all four names,
  ordering and assignments remain unchanged, including a machine without a
  stored colour. Do not derive model identity from its colour.
- [ ] Run existing card/hero/shelf/photo/machine/chooser tests plus the new
  appearance consumer tests, then typecheck. Commit
  `feat: theme recipe and machine presentation without changing identities`.

### Task 6 implementation checkpoint — 2026-10-22

The listed recipe, shelf and machine presentation consumers now resolve
appearance at their drawing boundaries. Two additional components were necessary:
`ShelfPhotoMark` resolves each canonical cover-cell accent and passes its actual
fill to `RecipePhoto`; `SlotMarker` accepts the card's resolved foreground.
No photo eligibility, caching, shelf queries or model/storage code changed.

`RecipeHero`, `BeanProfileDeck` and `BeanProfileSheet` still accept **canonical**
recipe accents. Bean figures use the resulting page ink, or chrome `info` when
no recipe accent is supplied. `useMachinePicker` instead returns an
**already-resolved display pair**, passed unchanged through the home header to
the link glyph; machine management continues saving canonical colour integers.
Neither boundary should be mapped a second time by its caller.

There is no recipe-accent index-editing chooser in this revision. The existing
`NewRecipeSheet` category previews already map canonical swatches (Task 4) and
remain unchanged. Rendered regressions cover every corresponding coffee/tea
slot (8 + 4) across all eight choices, all four machine colours and missing-colour
green, canonical names/order/assignments, unchanged recipe/snapshot/saved-machine
payloads, exact historical colour strings, and stable card instances across
appearance changes.

The 44 pt shelf mark, three-member accent cap, accepted stock/manual/roaster
photo rules, 21 pt cover cells, 20 pt bottom-right list photos and full-width
profiles are preserved. Photo backing is the actual displayed card/cell fill,
including dark Light/Themed cards. Stat/action/metadata helpers remain at module
scope; no state-reset effects, new manual memoisation or root-provider changes
were introduced.

Verification:

- RED: the Sky Light/Themed card regression failed on both platforms
  (`#9FC3F0` instead of `#254E83`); additional consumer/chooser RED failures
  demonstrated unmapped shelf/cloud/slot/machine presentation.
- GREEN: one serialized targeted Jest invocation covered **62 suites / 1,836
  tests**, both platforms, with no failures. It included the existing card,
  hero, tile, photo, shelf, slot, bean, import, machine, header and category
  chooser suites, shared appearance controls/consumers, the new
  `appearanceRecipeConsumers` suite, `useMachinePicker`, `accent`,
  `savedMachines` and `savedMachineSettings`.
- `npm run typecheck`, changed-file ESLint and `git diff --check` all passed.
- Intentional expectation changes follow actual-ground roles: header/slot
  action wells use `keyInk`, neutral slot actions use `onFill(palette.text)`,
  and roaster initials use their real field's foreground. Shelf-grid art
  fixtures now use valid RN shorthand `#AAA` instead of invalid `#A`.
- No native build, deployment, screenshot qualification or NFC/BLE hardware
  claim is part of this checkpoint. Route/chart/native/capture/Settings stages
  remain the later tasks below.

## Task 7: Complete screen, sheet and overlay reactivity

**Files:** All remaining production UI files in the inventory at the end.
Execute Tasks 8 and 9 before this task so root/native and historical reference
imports do not leave the full boundary test red. Capture freezing follows in
Task 10.

- [x] Add an import-boundary test in
  `components/__tests__/appearanceBoundary.test.ts` that parses imports with
  the installed TypeScript compiler, not a text search. Scan production
  `app/`, `components/`, `hooks/` and reject static imports of `palette`,
  `onAccent`, `switchColours` and `onBrand`. Task 8 refined
  `referenceCupColour` and `referenceWaterColour` into pure factories taking a
  required explicit `Appearance`; keep these shared grammar imports allowed.
  An AST assertion must keep their definitions explicit functions with that
  required argument, rejecting any reintroduction of frozen reference values.
  Existing trace-style tests prove their per-theme outputs. Do not duplicate
  reference values in callers to satisfy a name ban. Allow only explicitly documented launch art;
  canonical `accents` and `machineColours` imports remain permitted.
  Run it to print the remaining concrete filenames as failures.

```ts
import {readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(__dirname, "../..");
function sources(directory: string): string[] {
    return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        if (entry.name === "__tests__") return [];
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? sources(file)
            : /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) ? [file] : [];
    });
}
it("has no frozen presentation imports outside fixed launch artwork", () => {
    const violations: string[] = [];
    const banned = new Set([
        "palette", "onAccent", "onBrand", "switchColours"
    ]);
    for (const directory of ["app", "components", "hooks"]) {
        for (const file of sources(path.join(root, directory))) {
            const relative = path.relative(root, file).split(path.sep).join("/");
            if (relative === "components/SplashOverlay.tsx") continue;
            const source = ts.createSourceFile(file, readFileSync(file, "utf8"),
                ts.ScriptTarget.Latest, true);
            for (const statement of source.statements) {
                if (!ts.isImportDeclaration(statement) ||
                    !ts.isStringLiteral(statement.moduleSpecifier)) continue;
                const module = statement.moduleSpecifier.text;
                if (module !== "@/constants/colors") continue;
                const bindings = statement.importClause?.namedBindings;
                if (bindings && ts.isNamespaceImport(bindings)) {
                    violations.push(`${relative}: namespace ${module}`);
                } else if (bindings && ts.isNamedImports(bindings)) {
                    for (const entry of bindings.elements) {
                        const imported = (entry.propertyName ?? entry.name).text;
                        if (banned.has(imported)) {
                            violations.push(`${relative}: ${imported}`);
                        }
                    }
                }
            }
        }
    }
    expect(violations).toEqual([]);
});
```
- [x] For each remaining component/screen, replace the static palette binding
  with an unconditional `const {palette} = useAppearance()` and keep pure
  imports (`mix`, canonical arrays, types). For fills/foregrounds, apply the
  actual-surface rules rather than renaming static `onAccent` mechanically:

```tsx
const appearance = useAppearance();
const {palette} = appearance;
const badgeForeground = appearance.onFill(palette.info);
<XStack backgroundColor={palette.info}>
    <DotMatrixText color={badgeForeground.text}>{count}</DotMatrixText>
</XStack>
```

  This matters in CatalogueParts, where a dark Light-mode informational badge
  cannot use a stock pastel card's black foreground.
- [x] Migrate the inventory in three serial batches: shared sheet/overlay
  consumers; editor/live-brew consumers; remaining routes/library/import/
  roaster/subscription consumers. In each batch, add one changing-scope
  rendered regression covering its primary screen and an already-open sheet.
  Use `waitFor` press retries with `SHEET_PRESS_TIMEOUT` for sheet actions.
  Keep every existing `screenCovered` guard complete on both platforms.
- [x] For Reanimated/SVG values, resolve plain strings before worklets and
  include changed colour inputs in derived/animated dependencies. Do not close
  over an appearance context object in a worklet or freeze processColor at
  module import. Preserve motion timings, geometry and reduced-motion policy.
- [x] Run targeted tests for each changed batch, then
  `components/__tests__/appearanceBoundary.test.ts`, typecheck and lint.
  Commit each coherent batch separately with subject
  `refactor: apply appearance to sheets`, `refactor: apply appearance to editor and brew`,
  or `refactor: apply appearance to remaining screens`.

### Task 7 execution evidence (2026-10-22)

Owned checkout: `/Users/jesperhessius/Dev/XBRW-220-appearance-20261022`,
branch `feat/2.2.0-appearance-20261022`; pinned task base
`98f3ae5255dfc691bc44d7c5ed356e47830f3df9`, Task 7 starting head
`87b0e955ff6cc59f2a0407974ef5d32fee2614d3`. No dependencies, native builds,
prebuild, push, PR, external review, integration or deployment.

RED: `npx jest --runTestsByPath components/__tests__/appearanceBoundary.test.ts --runInBand --silent`
printed all 110 remaining frozen imports (both platforms). The explicit
reference-factory assertion was already green. Each new rendered regression
also failed before its batch's production migration:

- A: `app/__tests__/editRecipe.test.tsx -t 'recolours the editor header'`;
  already-open help stayed white in Light. GREEN batch: 14 suites / 484 tests.
- B: `app/__tests__/editRecipe.test.tsx -t 'recolours editor parameters'`;
  the editor target retained canonical pastel ink in Light/Themed. GREEN batch:
  20 suites / 758 tests.
- C: `app/__tests__/index.test.tsx -t 'recolours the library'`;
  the library background stayed black with Import already open. The final
  targeted command below includes all remaining routes and boundary checks:
  38 suites / 1,358 passing tests, 4 existing skips. The boundary alone is
  2 suites / 6 passing tests.

All RED selectors use `npx jest --runTestsByPath`, `--runInBand --silent`,
and run both Jest projects. Actions on open sheets retry with
`SHEET_PRESS_TIMEOUT`; assertions cover actual rendered styles, preserved
recipe/dose/ratio/name/import drafts and `screenCovered`. Appearance is never
mocked. Existing historical chart assertions now respect Task 8's no-samples
breathing trough, without changing production chart contrast or wash bounds.

Batch A (`253fda4e4396d95d6658aa6062743909521e43c5`) file manifest:

- `app/__tests__/editRecipe.test.tsx`
- `components/{BeanFilterSheet,BeanNameSheet,BrewNoteSheet,BypassWriteSheet,CompareWithSheet,DeleteAllSheet,DotBloom,EasyModeWriteOverlay,ForgetMachineSheet,HelpSheet,HubFilterSheet,ImportSheet,LeaveEditorSheet,MachineAddSheet,NewerVersionPrompt,NfcOverlay,PasteOverlay,RemoveShelfSheet,RestoreSheet,RevertSheet,RoasterOfferSheet,ScreenHeader,ScreenTitle,ShelfChoiceSheet,UnsubscribeSheet}.tsx`
- `components/__tests__/{RoasterOfferSheet.test.tsx,appearanceBoundary.test.ts}`
- This existing plan.

Batch B (`4c8c409321a1ab7c6bc5c46c897e53f8f708b7a7`) file manifest:

- `app/{brew,editRecipe}.tsx`, `app/__tests__/{brew,editRecipe}.test.tsx`
- `components/{BrewHistoryControls,BrewJudgement,BrewMindBrowser,BrewMindMark,BrewNowCard,BrewRatingBar,BrewStars,BypassRung,DeckSwitch,FromSection,HistorySection,NoteSection,OverflowSection,OverflowStatus,PodCoffeeRows,PodSection,QuickEditPanel,StageDetail,StageProfile,StageTile,TagSection,TeaBanner,TeaStageDetail,TeaStageLadder}.tsx`

Batch C (`refactor: apply appearance to remaining screens`) file manifest:

- `app/{about,easyMode,hub,hubRecipe,importCloud,index,licences,machine,network,roaster,roasterCoffee,roasters,settings,subscription,subscriptions}.tsx`
- `app/__tests__/index.test.tsx`
- `components/{AboutTicker,CardReadDiagnostic,CtaTile,EmptyLibrary,FadingRail,HomeTitle,HubSaveBar,LinkText,LivingMark,MachinePanel,MachineSpikeSection,RailSearch,RoasterCoffeeRow,SettingsChoiceRow,SettingsSection,SettingsToggleRow,ShelfGrid,ShelfPickerBar,ShelfPickerHeader,SlotLabControls,SwipeableRecipeRow,TeaSlotProbePanel}.tsx`
- `components/__tests__/appearanceBoundary.test.ts`, this existing plan.

The authoritative exact file list for each checkpoint is
`git show --format=fuller --name-only <commit>`; the C commit is identifiable
by its exact subject immediately after B (no amend). Final targeted C command:

```sh
npx jest --runTestsByPath \
  app/__tests__/editRecipe.test.tsx components/__tests__/RoasterOfferSheet.test.tsx \
  components/__tests__/ImportSheet.test.tsx components/__tests__/RevertSheet.test.tsx \
  components/__tests__/EasyModeWriteOverlay.test.tsx components/__tests__/DotBloom.test.tsx \
  components/__tests__/ScreenHeader.test.tsx --runInBand --silent

npx jest --runTestsByPath \
  app/__tests__/editRecipe.test.tsx app/__tests__/brew.test.tsx \
  components/__tests__/StageTile.test.tsx components/__tests__/StageProfile.test.tsx \
  components/__tests__/StageDetail.test.tsx components/__tests__/QuickEditPanel.test.tsx \
  components/__tests__/BrewNowCard.test.tsx components/__tests__/TeaBanner.test.tsx \
  components/__tests__/TeaStageLadder.test.tsx \
  components/__tests__/BrewHistoryControls.test.tsx --runInBand --silent

npx jest --runTestsByPath \
  app/__tests__/index.test.tsx app/__tests__/settings.test.tsx \
  app/__tests__/easyMode.test.tsx app/__tests__/hub.test.tsx \
  app/__tests__/hubRecipe.test.tsx app/__tests__/importCloud.test.tsx \
  app/__tests__/roasterCatalogue.test.tsx app/__tests__/roasterAlerts.test.tsx \
  app/__tests__/subscriptions.test.tsx app/__tests__/about.test.tsx \
  app/__tests__/licences.test.tsx app/__tests__/machine.test.tsx \
  app/__tests__/network.test.tsx components/__tests__/LivingMark.test.tsx \
  components/__tests__/ShelfGrid.test.tsx components/__tests__/SwipeableRecipeRow.test.tsx \
  components/__tests__/HomeTitle.test.tsx components/__tests__/MachinePanel.test.tsx \
  components/__tests__/appearanceBoundary.test.ts --runInBand --silent
```

Static validation: `npm run typecheck -- --pretty false`,
`npx eslint` over changed TypeScript files, and `git diff --check`.
Only the pre-existing `index.test.tsx` settings-mock `require` lint warning
remains. No full-suite or parallel heavy-test run. Self-review found no
appearance/palette object captured in production animated callbacks; LivingMark
closes over plain changed strings with explicit dependencies. Compiler opt-out
directives remain first statements. Canonical recipes, history, storage,
recorder and transport payloads remain unchanged; no photo or chart geometry
was changed. Device NFC/BLE and visual hardware checks are not claimed.

Task 10 capture freezing and Task 11 Settings/AppearanceSheet UI are intentionally
not implemented here. The controller owns whole-Task-7 review and pushing;
these three new checkpoints remain local until that handoff.

## Task 8: Theme charts, history and comparisons with explicit pure inputs

**Files:** `library/brew/traceStyle.ts`, `components/BrewTrace.tsx`,
`BrewRateChart.tsx`, `CompareTrace.tsx`, `CompareTable.tsx`, `FlowSparkline.tsx`,
`TraceLegendItem.tsx`, `BrewStageRung.tsx`, `BrewBypassRung.tsx`,
`BrewHistoryRow.tsx`, `BrewSummary.tsx`, `BrewStoryCard.tsx`,
`app/brewCompare.tsx`, `brewHistory.tsx`, `brewRecord.tsx`;
`library/brew/__tests__/traceStyle.test.ts`,
`components/__tests__/traceGrammar.test.tsx` and existing chart tests.

- [x] Extend pure channel tests to take explicit `appearance`:

```ts
const appearance = resolveAppearance({theme: "light", recipeColours: "original"});
const input = {accent: "#9FC3F0", appearance};
const water = channelStyle("water", input);
const cup = channelStyle("cup", input);
expect(contrast(water.stroke, appearance.palette.base)).toBeGreaterThanOrEqual(3);
expect(contrast(cup.stroke, appearance.palette.base)).toBeGreaterThanOrEqual(3);
```

  Preserve `ChannelStyle`'s SVG `stroke` field and existing dash/width assertions.
  Cover holding water, plan, subject/reference, missing stream, all twelve
  accents and both modes. Run and observe missing input/contrast failures.
- [x] Add `appearance: Appearance` to `ChannelInput`. Use
  `appearance.recipe(input.accent).ink` for water, its `cupInk` for cup,
  `appearance.palette.warn` for holding water, and explicit neutral active
  palette values for reference channels and plan. Preserve the original
  channel widths, dash grammar, time geometry and warning-hue distinction.
  Replace static reference-colour exports with pure access through the
  supplied appearance; update legends and CompareTable, not only the trace.
  Update every `channelStyle` test call with explicit default appearance,
  including traceGrammar. Do not make the input optional to hide unmigrated
  callers.
- [x] Resolve plan, pause fills, hatch and stage marks for their actual
  backgrounds. Existing pending-stage group opacity must be included when
  measuring informative text; lower opacity is not a disabled exemption for
  future brew stages. Move informational “NOT WATCHED” text to `palette.dim`.
  Do not change held-time/rate arithmetic, `FLOW_WINDOW_MS`, bypass exclusion,
  staircase time scaling or PourProfile's intentionally even stage division.
  Qualification found Blue/Themed combinations could not clear 4.5:1 over
  overlapping selection, pause and water shading. A legacy-white record
  also exceeds the stock slots' brightest wash. Blue's water-gradient top
  opacity is therefore 0.20 rather than 0.28; Magenta uses 0.26. Both are
  bounded against the black and white extremes of every RGB channel.
  Original, Light, geometry and animation are unchanged.
  Fit the waking plan at its shared 0.45 opacity trough through the existing
  colour fitter, including actual alpha composition. A deliberately hidden
  history plan (`planOpacity: 0`) requires no visible-ink fit.
- [x] Add historical regressions: recognised uppercase/lowercase stock
  snapshots map to the same current slot; unknown `#C86A3B` stays itself;
  deleting or recolouring the source recipe does not change historical
  identity. Render history marker, record, comparison and story in all eight
  choices. Assert stored rows and sample arrays unchanged.
- [x] Run the pure trace tests and existing renderer tests in one Jest call,
  then typecheck. Commit `feat: apply appearance to historical and live charts`.

### Task 8 implementation checkpoint — 2026-10-22

- `ChannelInput.appearance` is required; reference colours are pure functions of
  that input. Chart accent props remain canonical, and water/cup/holding retain
  the original solid/dotted/dashed widths and time geometry.
- Added the small pure `Appearance.chartInk` role rather than altering approved
  palette values. Plan and temperature marks fit their actual selected,
  paused and shaded grounds. Measured channels have base-colour SVG clearance
  underneath the unchanged signal strokes, so their real background remains
  the ground against which `ink`/`cupInk` were resolved.
- Intentional contrast corrections: comparison plans are opaque (dashes and
  width still distinguish them), hatch stripes clear 3:1 on their raised lanes,
  and future rungs retain opaque informational text instead of the former
  0.45 group opacity. Missing-stream and not-watched copy uses `dim`.
- Capture/frame backgrounds react now; capture freezing remains Task 10.
  Closely coupled `BrewFigures`/`BrewRecipeContext` use the same appearance as
  their summary, and only the live route's plan-colour interpolation boundary
  changed. Its other consumers remain in Task 7.
- Historical row, record route, comparison route and story tests cover all
  eight choices, upper/lowercase stock identities, unknown/named/alpha legacy
  colours, source recolouring/deletion, and unchanged stored-row/sample data.
- RED evidence: the pure light/original stroke measured 1.65:1; missing required
  input failed chart renderers; rendered hatch and composed plan tests failed
  below their floors; the live plan warmed toward the old colour; missing-stream
  copy still used a graphic grey. All were observed before the respective fixes.
- GREEN: one serial 23-file Jest invocation covering pure trace, existing
  chart/history/live renderers, coupled figures/context and appearance regressions:
  **46 platform suites, 2,488 tests**. `npm run typecheck`, changed-file
  `npx eslint`, and `git diff --check` passed. Lint has zero errors and three
  baseline warnings verified against the incoming commit: the record test's
  existing require import and two unused purity directives in history.
  No held-time, rate, bypass-exclusion, sample, plan-time or even-stage profile
  arithmetic changed.
- No native build, physical-device visual check, capture-freezing change,
  production action, PR/review or push is part of this checkpoint.

## Task 9: Wire the stable root and native appearance, including Android buttons

**Files:** `app/_layout.tsx`, `hooks/useNativeAppearance.ts` (new),
`app.json`, `package.json`, `package-lock.json`, generated
`constants/licences.ts`, `components/SplashOverlay.tsx`;
retire `plugins/withDarkNavigationBar.js` and
`plugins/__tests__/withDarkNavigationBar.test.ts`;
create `app/__tests__/appearanceConfig.test.ts`,
`hooks/__tests__/useNativeAppearance.test.tsx`.

The task base already has `expo.version: "2.2.0"` and
`runtimeVersion.policy: "fingerprint"`. Do not follow stale appVersion-policy
instructions or change the release/runtime policy as part of theming.
Native differences produce a new fingerprint and require a new client.

- [ ] Add failing root/config tests for supported automatic native appearance,
  stable LiveBrewProvider identity, status-bar style, native background and no
  conflicting fixed-dark navigation plugin. Test Light on OS-dark and each
  dark preset on OS-light; OS preference does not choose the app preset.
- [ ] In this **authorized implementation phase only**, run
  `npx expo install expo-navigation-bar`. This is a justified native dependency:
  current `withDarkNavigationBar` hard-codes light buttons and `expo-system-ui`
  exposes root background only. SDK 57 documents the supported replacement:
  `https://docs.expo.dev/versions/v57.0.0/sdk/navigation-bar/`.
  Use its declarative `NavigationBar`, not removed/deprecated background or
  button-style methods. Regenerate licences with `npm run generate-licences`.
- [ ] Replace all three `userInterfaceStyle: "dark"` entries with
  `"automatic"`. Preserve scheme order, branded black OS splash/icon art,
  bundle IDs, permissions and runtime policy. Replace the custom plugin entry:

```json
["expo-navigation-bar", {"enforceContrast": false, "hidden": false, "style": "light"}]
```

  The startup style matches fixed branded launch artwork. Runtime
  `<NavigationBar style="auto"/>` follows the explicit app scheme. Delete the
  now-conflicting custom plugin and replace its assertions with app-config
  checks for the supported plugin options. Do not edit generated native trees.
- [ ] Add `useNativeAppearance` using `useLayoutEffect`, explicit
  `Appearance.setColorScheme(appearance.scheme)` from React Native, and
  `SystemUI.setBackgroundColorAsync(appearance.palette.base)`. Serialize
  asynchronous background writes with a promise ref so an older request cannot
  settle over a newer preset. Report failed native updates with an error
  notice; never silently claim success. Reapply on AppState becoming active
  using a cleaned-up subscription, without resetting React state in an effect.
  Pure `AppearanceScope` does not change native UI.
- [ ] Add a module-scope `AppFrame` inside the single AppearanceProvider
  installed in Task 3, above the navigator and all portals/toasts. Call
  `useNativeAppearance(appearance)` unconditionally there. Build the navigation
  object inside AppFrame:

```tsx
const appearance = useAppearance();
const {palette, scheme} = appearance;
const navigationBase = scheme === "light" ? DefaultTheme : DarkTheme;
const navigationTheme = {
    ...navigationBase,
    colors: {
        ...navigationBase.colors, background: palette.base, card: palette.base,
        text: palette.text, border: palette.line, primary: palette.text,
        notification: palette.danger
    }
};
```

  Import both navigation themes from `expo-router`. Keep route declarations,
  root insets and native headers unchanged. Use the explicit status-bar style
  and Android component:

```tsx
<StatusBar hidden={false} style={scheme === "light" ? "dark" : "light"}/>
{Platform.OS === "android" && <NavigationBar style="auto"/>}
```

  Do not add an appearance `key` to AppFrame, Stack, Theme, LiveBrewProvider,
  RunOwner or editor. Changing context values must not recreate their types.
  Remove the old inner `<Theme name="dark">`; the single AppearanceScope now
  supplies the active Tamagui theme instead of being overridden by it.
  Tamagui's existing light/dark themes provide fallback control behaviour;
  plain semantic colours still come from the shared appearance boundary.
- [ ] Keep the animated SplashOverlay explicitly branded, using canonical
  launch palette aliases and explicit Wordmark foregrounds. Its fixed black
  backdrop is the single documented UI static-palette exception. Do not let a
  Light Wordmark default turn the launch lettering dark on black. Read
  persisted choices synchronously before rendering AppFrame; hide the OS
  splash only after fonts and that frame are ready.
- [ ] Run config/native-hook/root tests, typecheck, lint and Expo Doctor.
  Verify deferred native success/failure ordering, rapid changes, and resume.
  Commit `feat: synchronize native and application appearance`.
  Do not build a native client without the maintainer's explicit authorization.

## Task 10: Freeze one appearance for each image capture

**Files:** `hooks/useBrewExport.ts`, `hooks/__tests__/useBrewExport.test.tsx`,
`app/brew.tsx`, `app/brewRecord.tsx`, `components/BrewStorySheet.tsx`,
`BrewStoryCard.tsx`, `BrewSummary.tsx` and their tests.

There is currently no generated-image URI cache in `useBrewExport`. Preserve
fresh capture on each press; do not invent a cache just to add a theme key.
Recipe/record JSON, handoff payloads and data-share filenames stay canonical.

- [ ] Add a deferred-capture test: press image share in Light/Themed, hold
  prepare/capture, change global appearance to Blue/Original, then release.
  The image subtree must remain entirely Light/Themed; unrelated UI must be
  Blue/Original. After completion, the subtree returns to the current choice
  and the next press captures Blue/Original. Test the failure path too.
  Use the actual ViewShot ref harness and await its render and presses.
- [ ] Add state and snapshot at the existing synchronously guarded image
  press, before the first await:

```tsx
const appearance = useAppearance();
const [captureChoice, setCaptureChoice] = useState<AppearanceChoice | null>(null);
// Inside shareImage, after the existing guard/source checks:
isSharingImageRef.current = true;
setCaptureChoice(appearance.choice);
setBusy(true);
```

  Await `nextPaint()` after optional `prepare` **even when prepare is absent**,
  so the frozen subtree has committed before capture. Return `captureChoice`
  from the hook. Clear it on capture completion/failure and in final cleanup;
  preserve the existing independent image/data double-tap guards.
  Always mount the capture scope, using the current choice while idle; do not
  add/remove that wrapper only when a capture starts, which would remount its
  child and could lose the capture ref.
- [ ] In live brew, wrap the actual image subtree in
  `<AppearanceScope choice={captureChoice ?? appearance.choice}>`.
  In BrewStorySheet add an optional `captureChoice` prop and put that scope
  inside ViewShot around `{card}`; pass `story.captureChoice` from brewRecord.
  A scope around only the caller is insufficient if the summary's colours
  were computed outside it. Every descendant computes its own presentation
  from canonical props. Scope also selects the matching Tamagui light/dark
  theme, so a global theme switch cannot leak into capture defaults.
- [ ] Keep canonical `summary.accent` and `BrewExportSource.record` unmodified.
  Move BrewSummary/BrewStoryCard capture backgrounds into active styles on the
  actual captured native views, ensuring opaque image backgrounds. Keep
  story width/height, 9:16 budget, safe zones and judgement-outside-capture.
- [ ] Report preparation/capture failures explicitly before they can enter
  the existing share-sheet cancellation catch:

```tsx
try {
    if (prepare) await prepare();
    await nextPaint();
    const capture = shotRef.current?.capture;
    if (capture === undefined) throw new Error("Image capture is not ready");
    // Capture through shotRef.current.capture() so its receiver is preserved.
} catch {
    notify({tone: "error", message: "Could not create this image. Please try again."});
    // Exit this image attempt; the outer finally still releases both state and guard.
}
```

  Structure the handler so this catch returns, rather than continuing with an
  undefined URI. Do not route a capture failure into the old silent cancellation
  path or serialize appearance into data exports.
- [ ] Test both image targets, two consecutive captures with different themes,
  capture while prepare is absent, double taps, thrown preparation/capture,
  missing capture ref, cancellation, unavailable sharing and unchanged JSON
  bytes. Run the existing hook/summary/story/record/brew tests, then typecheck.
  Commit `fix: capture share images with one appearance snapshot`.

## Task 11: Add the Settings entry, restore validation and lifecycle guarantees

**Files:** Create `components/AppearanceSheet.tsx`,
`components/__tests__/AppearanceSheet.test.tsx`; modify `app/settings.tsx`,
`app/__tests__/settings.test.tsx`, `library/__tests__/backup.test.ts`,
`hooks/__tests__/useLiveBrew.test.tsx`,
`app/__tests__/editRecipe.test.tsx`, `library/__tests__/Recipe.card.test.ts`,
`library/machine/__tests__/commands.test.ts`.

- [ ] Add failing Settings tests: one Appearance row, four labelled radios/
  previews, independent Original/Themed choice, immediate persistence and no
  Apply button. Render on a small viewport with large font scale; every choice
  remains reachable through scrolling. Use existing XbrwSheet press retries.
- [ ] Extend Task 3's Settings bindings with their setters, retain both keys
  in `settingsSnapshot()`'s typed return, and add one row opening AppearanceSheet.
  Keep selection changes in event handlers:

```ts
function chooseTheme(theme: ThemeId) {
    try {
        setAppearanceTheme(theme);
    } catch {
        notify({tone: "error", message: "Could not save this appearance. Please try again."});
    }
}
function chooseRecipeColours(mode: RecipeColourMode) {
    try {
        setRecipeColourMode(mode);
    } catch {
        notify({tone: "error", message: "Could not save recipe colours. Please try again."});
    }
}
```

  There is no optimistic local selected value: the store subscription updates
  only after persistence succeeds. Closing keeps successful choices. Add the
  sheet's open state to the Settings screen-covered accessibility guard.
  Use existing dot/check/selected labels in addition to colour previews.
- [ ] Extend current per-key restore validation rather than changing
  `BACKUP_VERSION` or making the forgiving Recipe constructor a validator:

```ts
if (incoming.appearanceTheme !== undefined) {
    if (isThemeId(incoming.appearanceTheme)) {
        setAppearanceTheme(incoming.appearanceTheme);
    } else {
        invalidAppearanceKeys.push("appearanceTheme");
    }
}
if (incoming.recipeColourMode !== undefined) {
    if (isRecipeColourMode(incoming.recipeColourMode)) {
        setRecipeColourMode(incoming.recipeColourMode);
    } else {
        invalidAppearanceKeys.push("recipeColourMode");
    }
}
```

  Define `invalidAppearanceKeys: string[]` at the start of the restore operation.
  When nonempty, report “Some appearance preferences were not restored.”
  Preserve each invalid preference's current value. Missing keys are not
  invalid and never reset the current choices. Let actual write failures reach
  the existing restore error path; do not report successful restoration after
  a rejected write. Test valid, omitted, wrong-type and unknown-string values
  with real SQL where persistence is asserted.
- [ ] Extend the existing live-brew harness with an outer changing scope.
  Start once, switch through all eight choices, navigate away/back, pause/
  resume, and finish. Assert one start, continuous samples and exactly one
  record write. Compare its canonical accent before/after and exercise an
  appearance write failure during the run.
- [ ] Extend the editor test: open an unsaved name/note or stage edit, leave
  QuickEdit adjustments visible, switch appearance via the shared store and
  assert the same values and active deck remain. Closing QuickEdit still
  discards adjustments; no theme change creates a draft/history mutation.
- [ ] Add the NFC regression using existing independent fixtures:

```ts
const card = buildCard(XPOD_CARD);
const recipe = new Recipe(card);
const prefix = card.slice(0, HASH_LENGTH);
const before = recipe.getData(prefix, true);
for (const theme of THEME_IDS) {
    for (const recipeColours of ["original", "themed"] as const) {
        resolveAppearance({theme, recipeColours}).recipe(accents.coffee[0]);
        expect(recipe.getData(prefix, true)).toEqual(before);
    }
}
```

  In the existing command harness capture a brew payload for the same recipe
  before and after all eight scope changes and compare bytes, rather than
  inferring BLE safety from the NFC test. Assert backup/data/handoff payloads
  are unchanged by merely resolving appearance. No production NFC/BLE change.
- [ ] Run the new sheet/settings/backup/lifecycle/card/command tests together,
  then typecheck. Commit `feat: expose and restore appearance preferences`.

## Task 12: Full qualification, documentation and authorized handoff

**Files:** Approved spec status, `docs/development-workflow.md` only if a
workflow fact actually changes, `docs/release-2.2.0-changes.md` if it exists;
otherwise record qualification in this plan's final checklist, not a second
planning document. Update the existing colour-module header and directly
related `.github/copilot-instructions.md` colour guidance for canonical versus
presentation imports.

- [x] Run the exact final local gates serially:

```bash
npm run typecheck && npm run lint && npm test && npx expo-doctor
git diff --check
git diff --stat 98f3ae5255dfc691bc44d7c5ed356e47830f3df9
```

  Both Jest projects must pass. Fix regressions instead of weakening original
  byte, geometry, contrast or async expectations. The import-boundary test must
  account for every inventory consumer and its documented launch exception.
- [x] Review the diff for canonical domain changes, accidental F features,
  hard-coded UI colours, changed recipe-photo geometry, generated native files,
  hand-edited licences, hand memoization, effect-driven React state resets and
  missing sheet coverage. Remove task-created scratch artifacts only.
- [ ] With separate build permission, produce fresh iOS/Android development
  clients. Target the iPhone 17 Pro named `iPhone14`, never the iPhone 13 mini.
  Do not claim Metro reload tested native configuration. Check actual Android
  button navigation as well as gesture navigation; SDK 57 documents an Android
  15 emulator navigation-style bug, so that emulator alone cannot qualify it.
- [ ] Review library, editor, open sheet/toast, live brew, history/comparison
  and both image targets in **all eight** combinations on both platforms.
  Include large text/small screen, tea, validation, unknown/deleted-recipe
  history, pressed/selected/disabled controls, launch, resume, OS-opposite
  appearance and rapid switching. Record exact source/client/device and
  screenshots. Mark missing hardware evidence pending, not passed.
- [ ] On authorized physical hardware, confirm active brewing survives an
  appearance change without resending or stopping; retain the existing genuine
  NFC card/Android write release gates. Scripted transports prove payload
  invariance, not radio/hardware qualification.
- [x] Commit qualification/documentation updates locally for controller review.
  The controller owns the subsequent task-branch push; this phase has no push
  permission.
- [ ] Only after explicit PR permission, open one focused PR to `develop`,
  account for at most one Copilot round, implement its findings, and require
  exact-head CI green. Do not close #243/#257 or merge/reconcile preview without
  the applicable approval.
- [x] At handoff, run `git fetch origin --no-prune && npm run worktrees:check`
  and record branch/worktree/base/full HEAD, dirty state, push state, pending
  work and hardware gaps. Retain this task worktree for its named owner and
  pending implementation/review; remote branch is the preservation pointer.
  No unrelated worktree deletion is implied.

## Production migration inventory

This inventory was taken on the pinned base, excluding tests. It is a concrete
completion list, not permission to refactor layout. Files without direct colour
imports can still consume chart styles or caller-resolved colours.

**Routes (21):**
`app/_layout.tsx`, `app/about.tsx`, `app/brew.tsx`, `app/brewCompare.tsx`,
`app/brewHistory.tsx`, `app/brewRecord.tsx`, `app/easyMode.tsx`,
`app/editRecipe.tsx`, `app/hub.tsx`, `app/hubRecipe.tsx`,
`app/importCloud.tsx`, `app/index.tsx`, `app/licences.tsx`, `app/machine.tsx`,
`app/network.tsx`, `app/roaster.tsx`, `app/roasterCoffee.tsx`,
`app/roasters.tsx`, `app/settings.tsx`, `app/subscription.tsx`,
`app/subscriptions.tsx`.

**Shared components (136 direct colour imports; all names below are under
`components/` with extension `.tsx`):**

| Batch | Exact component basenames |
| --- | --- |
| Primitives/chrome | DigitRoll, DotIcon, DotMatrixText, Wordmark, Stepper, ScrollFade, FadingRail, ScreenHeader, ScreenTitle, TextFieldRow, FieldRow, DeckSection, DeckSwitch, LinkText, CtaTile, SupportTile, ExportButton, XbrwSwitch, XbrwSheet, XbrwToast, SplashOverlay |
| Home/library/shelves | AboutTicker, HomeHeader, HomeTitle, EmptyLibrary, RailChip, RailSearch, RailViewToggle, RecipeCard, RecipeHero, RecipePhoto, RecipeShelfTile, SwipeableRecipeRow, SelectableRecipeRow, ShelfGrid, ShelfMark, ShelfRoom, ShelfTile, ShelfPickerBar, ShelfPickerHeader |
| Editor/recipe | BeanProfileDeck, BeanProfileRow, BeanProfileSheet, BypassRung, FromSection, HistorySection, NoteSection, PodSection, PodCoffeeRows, PourProfile, QuickEditPanel, SegmentedControl, SplitBrewButton, StageDetail, StageProfile, StageTile, TagSection, TeaBanner, TeaStageDetail, TeaStageLadder |
| Brew/history | BrewBypassRung, BrewFigures, BrewHistoryControls, BrewHistoryRow, BrewJudgement, BrewMindBrowser, BrewMindMark, BrewMiniBar, BrewNowCard, BrewRateChart, BrewRatingBar, BrewRecipeContext, BrewStageRung, BrewStars, BrewStoryCard, BrewSummary, BrewTrace, CompareTable, OverflowSection, OverflowStatus, TraceLegendItem |
| Machines/NFC/Easy Mode | CardReadDiagnostic, DotBloom, EasyModeSlotCard, EasyModeSlots, EasyModeWriteOverlay, LivingMark, MachineCard, MachineChip, MachineDot, MachinePanel, MachineSection, MachineSpikeSection, NfcOverlay, PasteOverlay, SlotLabControls, SlotMarker, TeaSlotProbePanel, WriteSweep |
| Import/catalogues | CatalogueParts, CloudImportRow, HubRow, HubSaveBar, ImportResult, RoasterCoffeeRow |
| Settings | SettingsActionRow, SettingsChoiceRow, SettingsSection, SettingsToggleRow |
| Sheets/dialogs | BeanFilterSheet, BeanNameSheet, BrewNoteSheet, BypassWriteSheet, CompareWithSheet, DeleteAllSheet, ForgetMachineSheet, HelpSheet, HubFilterSheet, ImportSheet, LeaveEditorSheet, MachineAddSheet, MachineDetailSheet, MachinePickerSheet, NameShelfSheet, NewRecipeSheet, NewerVersionPrompt, RecipeOverflowSheet, RemoveShelfSheet, RenameSheet, RestoreSheet, RevertSheet, RoasterOfferSheet, ShelfChoiceSheet, ShelfOverflowSheet, SortSheet, UnsubscribeSheet |

Also migrate `hooks/useMachinePicker.ts`, `components/CompareTrace.tsx`,
`components/FlowSparkline.tsx`, `components/BrewStorySheet.tsx` and any concrete
consumer exposed by the import-boundary/renderer tests.

**Canonical production exceptions:** `library/accent.ts`,
`library/newRecipe.ts`, `library/roasterColour.ts`,
`library/cloud/accentMatch.ts`, `library/hub/hubRow.ts`,
`library/machine/savedMachines.ts`. These must not read active appearance.
`library/brew/traceStyle.ts` is presentation, not a canonical exception: it takes
an explicit appearance argument.

## Spec-coverage and qualification checklist

| Requirement | Implemented/qualified by |
| --- | --- |
| Four presets, two independent modes, complete twelve-slot correspondence | Tasks 1-3; exact mapping/contrast tests |
| Selective primary actions, neutral utility state, both #243 pressed defects | Task 4; actual rendered/composited pairs |
| All consumers reactive, including default props, constants, helpers and portals | Tasks 5-7; import-boundary and rerender tests |
| Recipe/shelf/photo/machine identities and geometry preserved | Task 6 |
| History after deletion, semantic chart roles and unknown stock colours | Task 8 |
| Persisted first frame, native bars, opposite OS mode, branded launch, resume | Tasks 3 and 9; fresh-client qualification |
| Consistent new image captures and unchanged canonical exports | Task 10 |
| Settings UI, backup compatibility, errors, screen-reader coverage | Task 11 |
| Stable brew/editor state and unchanged NFC/BLE payloads | Task 11 plus physical gates in Task 12 |
| Both platforms, all eight combinations, no unapproved contrast exception | Task 12 |

Implementation checkpoint: Tasks 1–11 are implemented locally and previously
reviewed/pushed. This does not accept Package G into `develop` or complete
Task 12. The local qualification evidence and still-pending manual gates below
supersede the original planning-only status, not the approved product design.

### Task 12 local qualification — 2026-10-22

The first fresh serial gate run exposed one newly stale mini-bar assertion on
both platforms: a custom dark historical accent `#123456` was expected to be
the water stroke verbatim, but Task 8 deliberately fits presentation ink for
contrast. Production `channelStyle` correctly returned
`appearance.recipe(accent).ink`. The narrowly coupled test-only correction is
`83611cb9c65072feed1352ee736ae31082422717`; it retains the exact rendered SVG
payload assertion, using the default resolved ink rather than canonical input.
No byte, geometry, contrast-floor or asynchronous assertion was weakened.
Its targeted both-platform run passed 2 suites / 36 tests. The initial full
run remains evidence: 2 failed, 864 passed, 2 skipped suites; 2 failed,
19,626 passed, 26 skipped tests; 2 passed snapshots. The chained Doctor did
not run after that Jest failure.

**Fresh local gates passed**, serially and without changing worker limits,
test configuration or thresholds:

```sh
npm run typecheck && npm run lint && npm test && npx expo-doctor
git diff --check
git diff --stat 98f3ae5255dfc691bc44d7c5ed356e47830f3df9
```

Typecheck passed. Lint completed with **0 errors / 32 warnings**, not a
warning-free result. Both Jest projects passed: **433 passing suites each**,
**866 passing / 2 skipped suites** in total; **19,628 passing / 26 skipped
tests** (19,654 total), **2 passing snapshots**, 341.950 seconds. The log
also contains 1,313 animation/React `act` warning occurrences and two
`TimeoutOverflowWarning` messages; no comparison run establishes a baseline
for those warnings. Expo Doctor passed **21/21** checks, no issues detected.
The exact chain exited 0. `git diff --check` passed.

Evidence is preserved outside the repository in
`/Users/jesperhessius/.copilot/session-state/96519c03-5860-47ba-837c-30d9b0766696/files/`:

- `appearance-final-full-gates.log` — initial exact-chain failure, including
  typecheck, lint and both mini-bar failures.
- `appearance-final-mini-bar-regression.log` — focused correction, both projects.
- `appearance-final-full-gates-recheck.log` — fresh complete exact chain.
- `appearance-final-lifecycle-review.diff` — scoped root/capture/native review.
- `appearance-final-scope-audit.log` — canonical AST and scope checks.
- `appearance-final-base.diff` and `appearance-final-base-stat.log` — full
  diff/stat against the exact pinned base.
- `appearance-final-precommit-worktrees.log`,
  `appearance-final-worktrees.log` and `appearance-final-handoff.log` —
  read-only ownership audit and exact final Git state.

The qualified implementation/test head is
`83611cb9c65072feed1352ee736ae31082422717`; subsequent qualification changes
are the five directly related documentation/header files only. Both the
test-only correction and documentation checkpoint have the required Copilot
trailer, with no amend. Final full HEAD, dirty state and upstream/ahead state
are recorded in the handoff artifact rather than a self-referential commit.
The remote preservation pointer remains
`origin/feat/2.2.0-appearance-20261022` at
`8cb8b1190901e00cdc2520b3873c4530153fafef` until the controller pushes.
No push was attempted. The owned worktree is retained for the controller's
final review and pending native/manual qualification; session logs preserve
local evidence. Unrelated worktrees are unchanged and no deletion is approved.

**Scope audit:** canonical `palette`, `onAccent`, `onBrand`, `accents`,
`machineColours` and `switchColours` declarations are unchanged against the
pinned base (TypeScript AST declaration comparison). Core recipe/Pour/NFC,
database, backup parser, accent assignment, machine transport/commands and
brew arithmetic production files have no diff. `Settings.DEFAULTS` adds the
two appearance keys; pure `library/appearance.ts` and presentation-only
`traceStyle` are intentional. No Package F feature, new photo layout/cache/
timing behavior, generated native tree, CI/Jest threshold change, added
production UI colour literal, hand memoization or effect-driven React state
reset was found in this local scope review. Photo sizing, shelf cell geometry
and canonical history identities remain intact.

The TypeScript AST import guard has only the approved static
`SplashOverlay` launch exception. Reference chart colours are pure factories
requiring explicit `Appearance`, separately AST-guarded. The pure scope is
separate from production native effects and the root/live owner is unkeyed.
Settings includes its new Appearance sheet in both platform accessibility
coverage guards. Existing sheet coverage and rendered open-sheet regressions
remain in place; controller final feature-quality review is still required.
`npm run generate-licences` reproduced the committed generated file exactly
(824 packages / 63 distinct licence bodies); it was not hand-edited.

Approved colour corrections remain intentional: the official pure
`@react-native/normalize-colors` 0.83.2 direct dependency/ambient type handles
legacy colours. Task 8 bounds the full RGB water wash at Blue 0.20 and Magenta
0.26 over selected/paused/water grounds; Original/Light remain unchanged.
The twelve slots across all eight combinations and RGB extrema have
regressions; no mathematical/wire behavior was changed. Task 9 uses SDK 57
`expo-navigation-bar` 57.0.3 declarative Android `auto` and its supported plugin
instead of the fixed custom plugin. Version 2.2.0 and runtime fingerprint policy
are intact.

**Manual qualification matrix — all rows PENDING, not authorized or exercised
in this phase.** Every visual row requires both platforms and all eight
theme/recipe-colour combinations, with source/client/device/screenshot evidence.

| Gate | Missing evidence |
| --- | --- |
| Fresh native clients | iOS and Android development clients for the changed native fingerprint; no Metro-reload substitution. Intended iOS hardware: iPhone 17 Pro named `iPhone14`, never iPhone 13 mini. |
| Main visual paths | Library, editor, an already-open sheet and toast, live brew, history, comparison, and both actual PNG image targets. Unit/deferred-capture mocks are not actual PNG evidence. |
| Edge/state/accessibility matrix | Small screen and large fonts; tea and validation; unknown/deleted-recipe history; pressed/selected/disabled controls; cold launch, resume, opposite OS appearance and rapid changes. |
| Android native chrome | Actual button navigation and gesture navigation. SDK 57's Android 15 emulator navigation-style bug makes emulator-only qualification insufficient. |
| Physical machine/card/external gates | One active real brew survives appearance switching without a radio resend/stop; genuine NFC card read/write, particularly Android write safety; external handoff/release gates. Scripted byte/lifecycle tests do not qualify radios or physical hardware. |

**Permission boundary:** PR/source closure/merge/cumulative-preview actions
remain unauthorized. Do not close #243/#257 or reconcile evaluation draft #252.
The #243 source's existing Copilot round is already spent. A later approved
focused G PR targets `develop`, gets at most one automated review round
(including automatic ruleset reviews), and needs exact-head PR CI green;
task-branch pushes alone do not prove PR CI. The controller owns final
review/push and coordination updates. No `main`/`develop` changes or worktree
deletion are authorized.

### Final cross-task foreground findings — corrected and requalified

Both P2 findings are fixed in the coherent local checkpoint following
`b9c3effbdaa2a07d724437be3b3b0bc107484639`. This section supersedes the
previous automated-gate counts, not the pending native/manual matrix or
permission boundary above. The exact resulting checkpoint SHA is recorded in
the session handoff artifact, avoiding a self-referential commit.

`Stepper` now accepts its existing canonical recipe accent and resolves it
once to presentation ink for both the Doto readout and editable input.
Omitting the accent still uses `palette.text`. All production callers were
traced: editor dose/ratio use canonical `resolveAccent(recipe)` on surface;
editor grind size/speed omit it; `StageTile`'s `StageValue` passes canonical
accent for volume on raised and omits it for the other numeric fields;
`QuickEditPanel` passes canonical accent for dose/ratio/grind/temperature offset
on surface, from both the editor and home sheet. There are no actual-fill or
on-card Stepper callers and no double-remapping exception is required.
Callbacks, drafts, focus, values, limits and geometry are unchanged.

The shared `recipe().ink` now fits the existing base/surface/raised grounds
together at 4.5:1, reusing the central fitter. Independent first-passing-step
expectations consciously use all three grounds; `cupInk` retains its base-only
3:1 contract. The twelve slots across all eight choices, historic shorthand,
RN native colour formats and base-composited alpha inputs retain their
identity/foreground/switch/key tests. All 96 stock card fills, on-card
foregrounds, key inks and cup inks match the previous head exactly; canonical
palette/slot exports and Original Dark stock inks also match. Fifteen derived
stock page inks change to meet the broader chrome contract, without changing
any approved palette value. The existing chart-water opacity bounds remain
untouched.

Measured independently against actual rendered consumer backgrounds:

| Foreground | Before | After |
| --- | --- | --- |
| Light Original Sky numeric readout/input, white / raised | 1.820 / 1.525 | 5.467 / 4.580 |
| Light Themed Sky numeric readout/input, white / raised | 1.820 / 1.525 | 8.413 / 7.048 |
| Blue Themed Peach small StageDetail labels, raised | 4.076 | 4.518 |
| Blue Themed Rose small StageDetail labels, raised | 4.028 | 4.516 |

TDD RED: 4 failing / 6 passing targeted suites, 376 failing / 998 passing
tests, both platforms. The failures include both numeric modes and both raised
StageDetail labels. GREEN: all 10 targeted suites / 1,374 tests pass.
Rendered regressions exercise eight coffee accents across all eight choices
in both numeric modes on real QuickEditPanel surface and StageValue raised
nodes; unaccented values remain neutral. No new native IDs or custom-child
prop inspection are used. Typecheck, lint and diff-check also pass.

Fresh exact serial full chain after the final implementation:
`npm run typecheck && npm run lint && npm test && npx expo-doctor` exited 0.
Jest: **866 passing / 2 skipped suites; 19,920 passing / 26 skipped tests;
2 passing snapshots**, 348.597 seconds. Lint: **0 errors / 32 warnings**.
Doctor: **21/21**. The full log contains 1,248 React/animation `act` warning
occurrences, two `TimeoutOverflowWarning` occurrences and one non-graceful
worker-exit warning; no new warning-free or teardown-baseline claim is made.

Full RED, GREEN and exact-chain logs, independent before/after contrast and
unchanged-identity audit, caller/diff evidence and exact Git handoff are in
the session's existing `files/appearance-final-foregrounds-*` artifacts.
The worktree remains owned by this appearance task, retained for controller
review and native qualification. This checkpoint is local only; no push,
PR/review, merge, cleanup, native build/prebuild or deployment was performed.
