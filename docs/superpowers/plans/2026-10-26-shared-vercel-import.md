# Shared Vercel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the existing xBloom release feed and a complete, metadata-rich recipe import page from the current Vercel project, with verified native links activated when the final domain and signing evidence are ready.

**Architecture:** Reuse package B's feed and extract the small platform-free pieces of the existing import pipeline for a dependency-free Node HTML endpoint. Render all valid import metadata server-side with a persistent action footer and lossless app handoff. Keep minting, public reads, domain activation and native distribution separate.

**Tech Stack:** Existing TypeScript 6, Node/Vercel functions, HTML/CSS, Expo SDK 57 configuration, Jest's existing iOS/Android projects, and existing browser tools. No Next.js, Expo web build, runtime dependency installation or new service.

---

## Authority, source and delivery checkpoints

Approved specification:
`docs/superpowers/specs/2026-10-26-shared-vercel-import-design.md`.
The maintainer approved that written specification and requested this plan.
That is not approval to execute the plan or perform production operations.

Planning worktree:
`/Users/jesperhessius/Dev/XBRW-shared-vercel-import-20261026`.
Branch: `docs/shared-vercel-import-20261026`.
Pinned task base: `e71736172cf219a7d68ce4887a0efdd345271a5a`.
Approved spec commit: `288373b8e8d155345fc46f50b04ff21123534efc`.

Package B is already implemented on #281 at
`f2855996855a7865bd34528e26ae250f18f858fb`. Do not copy or redo it.
The page can be implemented before its merge; a combined production
deployment requires its separately authorized integration.

There are two delivery checkpoints, not two competing endpoint implementations:

- **Existing-host checkpoint:** Tasks 1-6 and 8 produce a testable page on the
  existing host. Feed integration/deployment is an authorized operation in
  Task 9. Domain purchase must not hold up this work.
- **Domain/native checkpoint:** Task 7 activates the final owned domain and
  native associations. It is blocked until the stated external evidence and
  permissions exist. Keep #177 open until that acceptance is complete.
  If the first task has already merged, start the follow-up from a freshly
  fetched, pinned `origin/develop`, not a reused merged task head.

Do not merge #281, open a new PR, deploy, change project settings, build or
submit an artifact without the applicable explicit permission. Do not request
a second Copilot round for #281. Keep primary Metro serving develop.

### Verified planning inputs

- Existing mint: `https://xbrwplusplus.vercel.app/api/share`, from
  `constants/share.ts`. Verify the linked project's identity before deployment;
  the local Vercel CLI currently has no credentials.
- Apple's public bundle lookup returned `com.hessius.xbrwplusplus`, app ID
  `6806339475`, version 2.1.0. The published release also links that listing.
  Use `https://apps.apple.com/app/id6806339475` for the iOS destination.
- Android is a GitHub APK distribution, not a Google Play listing.
  `https://github.com/hessius/XBRW/releases/latest` is the stable download page.
  The published 2.1.0 asset is `XBRWplusplus-2.1.0-android.apk`.
- Its published signer SHA-256 is
  `b003f18b1e4d7bf280edac00484d22e8cd1018a22da0da7ec8623b0647f93f98`.
  Recheck the actual distribution artifact before association activation.
  Apple application-identifier evidence is still required.
- A read-only live share lookup returned HTTP success with
  `result: "success"`, `recipeVo`, `recipeVo.adaptedModel: 1` and `pourList`.
  No mint/login was called. Do not invent permanent-removal codes from
  localized `info` text.
- `xbrw.app` is planned, not owned. Never advertise it as live before approval
  and DNS/TLS verification.

## File structure

These are the intended boundaries. Mechanical moves retain their existing
comments and exports; they are not an opportunity for unrelated cleanup.

| Files | Responsibility |
| --- | --- |
| `constants/colourValues.ts` (new), `constants/colors.ts` | Pure canonical `palette`, `onAccent`, `accents` and `AccentGroup`; existing colors facade re-exports them and retains native appearance logic. |
| `library/recipeIdentity.ts` (new), `library/Recipe.ts` | Pure scalar identity constants, XID/tag validation and ratio arithmetic; preserve Recipe's public exports and methods. |
| `library/brewmindLink.ts`, `importInput.ts`, `podCoffee.ts`, `roasterColour.ts`, `cloud/accentMatch.ts`, `accent.ts`, `importDecoration.ts`, `bypassLimits.ts` | Remove runtime native dependencies from the reused import closure without changing valid app imports. |
| `library/xbloomRecipeData.ts` (new), `library/XBloomRecipe.ts` | One normalized recipe-field projection; keep Recipe construction, identity, card backup and transport outside the pure projection. |
| `test-utils/importPageFixtures.ts` (new) | Synthetic, independent upstream and full-metadata fixtures. No live response snapshots or credentials. |
| `api/_lib/importLookup.ts` (new) | Bounded, read-only requests to the two fixed upstream endpoints. |
| `api/_lib/importView.ts` (new) | Validated page view, decoration, source/model context and safe exact-recipe outgoing links. |
| `api/_lib/importPage.ts` (new) | Semantic HTML, all coffee fields, canonical CSS, footer and social metadata. No network calls. |
| `api/import.ts` (new), `vercel.json` | GET/HEAD Node adapter, status mapping, cache/CSP/privacy headers and exact `/import` rewrites. |
| `scripts/generate-app-links.mjs` (new, Task 7) | Generate association JSON only from required verified public signing inputs. |
| `public/.well-known/apple-app-site-association`, `public/.well-known/assetlinks.json`, `app.json` (Task 7) | Exact-domain association and native intent configuration after external gates. |
| `library/__tests__/importBoundary.test.ts`, `xbloomRecipeData.test.ts`, `api/__tests__/importLookup.test.ts`, `importView.test.ts`, `importPage.test.ts`, `import.test.ts` (new) | Focused characterization, visible-field, transport and adapter evidence. |
| `app/__tests__/native-intent.test.ts`, `hooks/__tests__/useImportLink.test.ts` | HTTPS cold/warm import delivery through existing handlers. Extend existing tests rather than introducing an app import route. |
| `api/__tests__/appLinks.test.ts` (new, Task 7), integration/deployment guides | Association correctness and operational handoff. |

The pure colour module is a necessary, narrow deviation from keeping all
definitions inside `constants/colors.ts`: that file now imports
`@react-native/normalize-colors`. Do not ship that package to Vercel or fork
the palette into CSS literals. Existing app imports continue using the facade.
Update its documentation to describe this boundary.

## Task 1: Isolate the existing import contract

**Files:** `constants/colourValues.ts`, `constants/colors.ts`,
`library/recipeIdentity.ts`, `library/Recipe.ts`, and the reused import
closure listed above.

- [ ] **Step 1: Capture the baseline and ownership.**

From the owned task worktree:

```bash
git status --short --branch
git fetch origin --no-prune
npm run worktrees:check
npm run typecheck
npx --no-install jest --runTestsByPath \
  library/__tests__/brewmindLink.test.ts \
  library/__tests__/importDecoration.test.ts \
  library/__tests__/XBloomRecipe.endpoint.test.ts \
  library/__tests__/XBloomRecipe.bypass.test.ts \
  library/__tests__/XBloomRecipe.temperature.test.ts --runInBand
```

Expected: existing tests pass in both projects. Record unrelated baseline
failures rather than changing expectations. This worktree has no dependencies
installed at plan time. Only after a missing-dependency failure, compare its
lockfile with the primary checkout before using the existing ignored shared
node_modules symlink; otherwise restore from its lockfile. Do not install
esbuild: it was not present during planning and is not needed.

- [ ] **Step 2: Add a failing runtime-boundary test.**

In `library/__tests__/importBoundary.test.ts`:

```ts
it("loads the import grammar without the native colour resolver", () => {
    jest.resetModules();
    jest.doMock("@react-native/normalize-colors", () => {
        throw new Error("Native colour dependency reached the server closure");
    });
    try {
        const {parseBrewMindLink} =
            jest.requireActual<typeof import("../brewmindLink")>("../brewmindLink");
        expect(parseBrewMindLink(
            "https://preview.example.test/import?v=1&share=XB0001"
        )?.share).toBe("XB0001");
    } finally {
        jest.dontMock("@react-native/normalize-colors");
        jest.resetModules();
    }
});
```

Run `npx --no-install jest --runTestsByPath library/__tests__/importBoundary.test.ts --runInBand`.
Expected before extraction: FAIL from the native colour dependency.

- [ ] **Step 3: Move pure values, preserving existing public APIs.**

Move the complete existing definitions and their comments for `palette`,
`onAccent`, `accents` and `AccentGroup` from `constants/colors.ts` into
`constants/colourValues.ts`, unchanged. No new values or copied second palette.
Replace those definitions in the facade with:

```ts
import {palette, onAccent, accents, type AccentGroup} from "./colourValues";
export {palette, onAccent, accents};
export type {AccentGroup};
```

Move the existing `CUP_TYPE`, `GRINDER_OFF`, `GRIND_SIZE_OFFSET`,
`GRINDER_OFF_VALUE`, `XID_LENGTH`, `MAX_NAME`, `MAX_TAG_LENGTH`,
`MAX_TAGS_PER_RECIPE`, `RecipeSource` and `isValidXID` definitions unchanged
from `Recipe.ts` into `library/recipeIdentity.ts`. Import and re-export them
from `Recipe.ts` so every existing consumer remains valid.

Add these complete helpers in `recipeIdentity.ts`, using its moved constants:

```ts
import {tagKey} from "./tagKey";

export function normaliseRecipeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const entry of tags) {
        if (typeof entry !== "string") continue;
        const tag = entry.trim();
        if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue;
        const key = tagKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(tag);
        if (kept.length === MAX_TAGS_PER_RECIPE) break;
    }
    return kept;
}

export function ratioForVolumes(volumes: readonly number[], dose: number): number {
    return Math.round(volumes.reduce(
        (total, volume) => total + (volume > 0 ? volume : 0), 0
    ) / dose);
}
```

Replace the two existing Recipe method bodies, preserving their signatures:

```ts
public static normaliseTags(tags: unknown): string[] {
    return normaliseRecipeTags(tags);
}

public fixRatio(): void {
    this.ratio = ratioForVolumes(this.pours.map(pour => pour.volume), this.dosage);
}
```

Keep imports used elsewhere in Recipe; remove only imports that become unused.
Do not change its constructor, serialization, NFC or byte constants.

- [ ] **Step 4: Make the reused runtime graph platform-free.**

Use relative imports within this graph because standalone Node output must not
depend on Metro's `@/` resolver:

| Module | Runtime imports after change |
| --- | --- |
| `brewmindLink.ts` | `./fitName`, `./coffeeLabels`, `./recipeIdentity`, `./podCoffee`, `./roasterColour` |
| `importInput.ts` | `./recipeIdentity`, not `./Recipe` |
| `podCoffee.ts` | `./coffeeLabels`, `./roastAdvice` |
| `roasterColour.ts` | `../constants/colourValues`, `./cloud/accentMatch` |
| `cloud/accentMatch.ts` | `../../constants/colourValues` |
| `accent.ts` | `../constants/colourValues`; change Recipe import to type-only |
| `bypassLimits.ts` | `./units`, not a runtime import of cardLimits |

In `accent.ts`, broaden only the helper's structural input:

```ts
export function accentGroupFor(recipe: {isTea(): boolean}): AccentGroup {
    return recipe.isTea() ? "tea" : "coffee";
}
```

In `bypassLimits.ts`, remove the runtime `TEMPERATURE` import and the Range
type annotation on these two structurally identical exports:

```ts
import {CELSIUS_RANGE} from "./units";
export const BYPASS_VOLUME = {min: 1, max: 500};
export const BYPASS_TEMPERATURE = CELSIUS_RANGE;
```

Keep its other constants and functions unchanged. The existing unit/card
range tests must still agree; do not widen any range.

In `importDecoration.ts`, use relative runtime imports and import
`RecipeSource` from `./recipeIdentity` as a type. Replace its Recipe dependency
with this structural interface:

```ts
export type ImportCandidate = {
    source: RecipeSource;
    recipeUrl?: string;
    name: string;
    tags: string[];
    accentIndex?: number;
    coffee?: PodCoffee;
    imageURL?: string;
    isTea(): boolean;
    setTags(tags: unknown): void;
};
```

Keep both function bodies and their ordering unchanged; change signatures to:

```ts
export function decorateImport<T extends ImportCandidate>(
    recipe: T, decoration: ImportDecoration
): T
export function fillImportBlanks(
    recipe: ImportCandidate, decoration: ImportDecoration
): boolean
```

These are signature replacements, not additional overload declarations.
The existing Recipe implements the interface without a cast. The server
will use the same decorator on its plain candidate.

- [ ] **Step 5: Run the focused tests and typecheck, then commit.**

Expected: both projects pass and no baseline expectation changes.

```bash
npx --no-install jest --runTestsByPath \
  library/__tests__/importBoundary.test.ts \
  library/__tests__/brewmindLink.test.ts \
  library/__tests__/importDecoration.test.ts \
  library/__tests__/XBloomRecipe.endpoint.test.ts \
  library/__tests__/XBloomRecipe.bypass.test.ts \
  library/__tests__/XBloomRecipe.temperature.test.ts --runInBand
npm run typecheck
git add constants library
git commit -m "refactor: isolate platform-free import primitives" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Share the recipe-field normalization

**Files:** Create `library/xbloomRecipeData.ts`,
`library/__tests__/xbloomRecipeData.test.ts`,
`test-utils/importPageFixtures.ts`; modify `library/XBloomRecipe.ts`.

- [ ] **Step 1: Add an independent synthetic fixture.**

`test-utils/importPageFixtures.ts`:

```ts
export function importDetail() {
    return {
        result: "success",
        recipeVo: {
            adaptedModel: 1, theName: "Morning coffee",
            dose: 15, grandWater: 16, grinderSize: 54,
            isSetGrinderSize: 1, rpm: 90, cupType: 2,
            isEnableBypassWater: 1, bypassVolume: 30, bypassTemp: 92.77,
            pourCount: 3,
            podsVo: {
                id: "XB0001", theName: "Pod coffee",
                subtitle: "", imagePath: "https://images.example.test/pod.jpg"
            },
            shareRecipeLink: "https://share-h5.xbloom.com/?id=fixture%2Bid%3D",
            pourList: [
                {volume: 40, temperature: 93, flowRate: 3, pattern: 1,
                    pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2},
                {volume: 120, temperature: 93, flowRate: 3.5, pattern: 2,
                    pausing: 15, isEnableVibrationBefore: 1, isEnableVibrationAfter: 2},
                {volume: 80, temperature: 92, flowRate: 3, pattern: 3,
                    pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 1}
            ]
        }
    };
}

export function fullImportURL(): URL {
    const url = new URL("https://preview.example.test/import");
    const fields: Record<string, string> = {
        v: "1", share: "https://share-h5.xbloom.com/?id=fixture%2Bid%3D",
        source: "brewmind", "recipe.name": "Producer's morning recipe",
        "recipe.url": "https://producer.example.test/recipe?one=1&two=2",
        "bean.name": "Bag coffee", "bean.roaster": "Example Roastery",
        "bean.image": "https://images.example.test/bag.jpg",
        "bean.url": "https://producer.example.test/coffee",
        "bean.origin": "East Africa", "bean.country": "Ethiopia",
        "bean.region": "Guji", "bean.farm": "Example Farm",
        "bean.farmer": "Example Farmer", "bean.elevation": "5900 ft",
        "bean.processing": "Natural", "bean.fermentation": "Anaerobic",
        "bean.variety": "Heirloom", "bean.beanMix": "Single Origin",
        "bean.roast": "Light", "bean.roastingDate": "2026-10-01",
        "bean.aromatics": "Stone fruit and jasmine", "bean.flavours": "Apricot,Jasmine",
        "bean.note": "A complete description.\nA second paragraph.",
        "bean.cupping_points": "86.5", "bean.decaffeinated": "0",
        "bean.rest_days": "0", "bean.peak_day": "14", "bean.best_until_day": "35",
        "bean.tags": "Morning,Filter", "bean.colour": "#338855",
        feed: "https://producer.example.test/feed.json",
        future: "Keep + / = % & Unicode \u00e9"
    };
    for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
    return url;
}
```

- [ ] **Step 2: Characterize the actual app output before changing it.**

In the new normalization test, import `XBloomRecipe`, the fixture and
`normaliseXBloomRecipe` from the new module. First write:

```ts
it("matches the app's imported numbers and existing normalization", async () => {
    const detail = importDetail();
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(detail))
    );
    try {
        const app = new XBloomRecipe({kind: "share", id: "fixture+id="}, "studio");
        await app.fetchRecipeDetail();
        const recipe = app.getRecipe();
        if (recipe === null) throw new Error("Fixture failed to import");
        const fields = normaliseXBloomRecipe(detail);
        expect(fields.dosage).toBe(15);
        expect(fields.ratio).toBe(16);
        expect(fields.bypassTemp).toBe(93);
        expect(fields.pours.map(pour => pour.pourPattern)).toEqual([0, 2, 1]);
        expect(fields.pours.map(pour => pour.flowRate)).toEqual([30, 35, 30]);
        expect(fields.pours.map(pour => pour.agitation)).toEqual([0, 1, 2]);
        for (const key of ["dosage", "ratio", "grindSize", "grindRPM",
            "grinder", "cupType", "defaultCups", "bypassEnabled",
            "bypassVolume", "bypassTemp", "xbloomName", "imageURL"] as const) {
            expect(fields[key]).toEqual(recipe[key]);
        }
        expect(fields.pours.map(pour => JSON.parse(pour.toJSON()))).toEqual(
            recipe.pours.map(pour => JSON.parse(pour.toJSON()))
        );
        expect(recipe.offline_backup.length).toBeGreaterThan(0);
    } finally {
        fetchSpy.mockRestore();
    }
});
```

Run the new test alongside the three existing XBloomRecipe tests from Task 1.
Expected initial failure: missing shared module, not a changed app fixture.

- [ ] **Step 3: Extract the normalized field projection.**

The module has only relative imports of the pure `Pour`, identity, units,
podCoffee and bypass modules. Its public contract is:

```ts
import Pour, {POUR_PATTERN} from "./Pour";
import {podCoffeeFromPodsVo, podImageUrl, type PodCoffee} from "./podCoffee";
import {CUP_TYPE, GRINDER_OFF_VALUE, ratioForVolumes} from "./recipeIdentity";
import type {RecipeSource} from "./recipeIdentity";
import {clampCelsius, normaliseCelsius} from "./units";
import {BYPASS_DEFAULT_TEMPERATURE, BYPASS_TEMPERATURE, BYPASS_VOLUME}
    from "./bypassLimits";

export type XBloomRecipeData = {
    dosage: number; ratio: number; grindSize: number; grindRPM: number;
    grinder: boolean; cupType: number; defaultCups: number; pours: Pour[];
    bypassEnabled: boolean; bypassVolume: number; bypassTemp: number;
    xbloomName: string; xid: string; source: RecipeSource;
    imageURL?: string; coffee?: PodCoffee;
    sharedBy?: string; sharedByAvatar?: string;
};

export class InvalidImportDataError extends Error {
    constructor() {
        super("Invalid recipe data");
    }
}

export function recordOf(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidImportDataError();
    }
    return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new InvalidImportDataError();
    }
    return value;
}

export function xbloomTitle(name: string, subtitle: string): string {
    const hidden = subtitle.includes("\u660e") && subtitle.includes("\u8c26");
    const visible = hidden ? "" : subtitle;
    return name.length > 0 && visible.length > 0 ? `${name} | ${visible}` : name;
}

export function normaliseXBloomRecipe(
    detail: unknown, titleOverride?: string
): XBloomRecipeData {
    const root = recordOf(detail);
    const row = recordOf(root.recipeVo);
    const pods = row.podsVo == null ? undefined : recordOf(row.podsVo);
    const dosage = finiteNumber(row.dose);
    const grindSize = finiteNumber(row.grinderSize ?? GRINDER_OFF_VALUE);
    const grinderFlag = row.isSetGrinderSize ?? 2;
    const rawCup = row.cupType ?? 1;
    finiteNumber(rawCup);
    const cupType = rawCup === 2 ? CUP_TYPE.OMNI
        : rawCup === 3 ? CUP_TYPE.OTHER
        : rawCup === 4 ? CUP_TYPE.TEA : CUP_TYPE.XPOD;
    const count = finiteNumber(row.pourCount);
    if (!Number.isInteger(count) || count < 0 ||
        !Array.isArray(row.pourList) || count > row.pourList.length) {
        throw new InvalidImportDataError();
    }
    const pours: Pour[] = [];
    for (let index = 0; index < count; index++) {
        const stage = recordOf(row.pourList[index]);
        const volume = finiteNumber(stage.volume);
        const pattern = stage.pattern === 1 ? POUR_PATTERN.CENTERED
            : stage.pattern === 2 ? POUR_PATTERN.SPIRAL : POUR_PATTERN.CIRCULAR;
        const pour = new Pour(index + 1,
            cupType === CUP_TYPE.TEA && volume > 90 ? 90 : volume,
            clampCelsius(Math.round(finiteNumber(stage.temperature))),
            finiteNumber(stage.flowRate) * 10, 0, pattern,
            finiteNumber(stage.pausing));
        pour.setAgitationAfter(stage.isEnableVibrationAfter === 1);
        pour.setAgitationBefore(stage.isEnableVibrationBefore === 1);
        pours.push(pour);
    }
    const rawVolume = row.bypassVolume;
    const rawTemp = row.bypassTemp;
    const volumeValid = typeof rawVolume === "number" && Number.isFinite(rawVolume)
        && rawVolume >= BYPASS_VOLUME.min && rawVolume <= BYPASS_VOLUME.max;
    const tempValid = typeof rawTemp === "number" && Number.isFinite(rawTemp)
        && rawTemp >= BYPASS_TEMPERATURE.min && rawTemp <= BYPASS_TEMPERATURE.max;
    const coffee = podCoffeeFromPodsVo(row.podsVo) ?? undefined;
    const artwork = coffee?.imageUrl ?? podImageUrl(pods?.imagePath);
    const avatar = podImageUrl(root.shareMemberHead);
    const name = typeof row.theName === "string" ? row.theName : "";
    const subtitle = typeof pods?.subtitle === "string" ? pods.subtitle : "";
    return {
        dosage, ratio: ratioForVolumes(pours.map(pour => pour.volume), dosage),
        grindSize, grinder: grinderFlag !== 2 && grindSize !== GRINDER_OFF_VALUE,
        grindRPM: typeof row.rpm === "number" && row.rpm >= 60 && row.rpm <= 120
            ? row.rpm : 120,
        cupType, defaultCups: cupType === CUP_TYPE.TEA ? count : 0,
        pours, source: "import",
        xbloomName: titleOverride ?? xbloomTitle(name, subtitle),
        xid: typeof pods?.id === "string" ? pods.id : "",
        bypassVolume: volumeValid ? rawVolume : 0,
        bypassTemp: volumeValid && tempValid
            ? normaliseCelsius(rawTemp) : BYPASS_DEFAULT_TEMPERATURE,
        bypassEnabled: cupType !== CUP_TYPE.TEA &&
            volumeValid && row.isEnableBypassWater === 1,
        ...(coffee ? {coffee} : {}),
        ...(artwork !== undefined ? {imageURL: artwork} : {}),
        ...(typeof root.shareMemberName === "string" ? {sharedBy: root.shareMemberName} : {}),
        ...(avatar !== undefined ? {sharedByAvatar: avatar} : {})
    };
}
```

This is the existing mapper extracted into a typed projection, not a second
mapping kept beside the app's original. Finite-number/record guards reject
malformed shapes rather than injecting strings into numeric HTML. Valid
imports retain the same defaults and arithmetic. No card stage-count/grind
limit or volume rescaling is introduced. Test a genuine read-only response
before changing any upstream field-type expectation.

Use the override when supplied, including an explicit empty override, so
account-row imports retain their current private-name behavior. The normal
web projection reads valid string `theName` and `podsVo.subtitle` through
this helper. Keep `applyPodCoffee` exported for its existing callers/tests.

- [ ] **Step 4: Wire the app to the extracted algorithm.**

Replace the field-reading portion of `XBloomRecipe.getRecipe()` with:

```ts
const recipe = new Recipe(undefined, undefined);
Object.assign(recipe, normaliseXBloomRecipe(this.xbRecipeJSON, this.getRecipeTitle()));
```

Retain the existing `byXid` versus share-ID block verbatim after this assignment.
Keep the final `recipe.fixRatio()`, `recipe.offline_backup = recipe.getData()`,
return and existing error boundary. Do not move card encoding into the pure
module or change the legacy pod share-ID decoding as an incidental refactor.

Make `getRecipeTitle()` delegate to `xbloomTitle(this.getName(), this.getSubtitle())`.
Keep `getName`, `getSubtitle`, `getImageURL`, fetch selection and required
constructor machine argument intact.

- [ ] **Step 5: Expand parity cases, run and commit.**

Add these independent expectations alongside the first characterization:

```ts
it.each([
    ["xPod", {cupType: 1}, {cupType: 0, defaultCups: 0}],
    ["Omni", {cupType: 2}, {cupType: 2, defaultCups: 0}],
    ["Other", {cupType: 3}, {cupType: 1, defaultCups: 0}],
    ["tea", {cupType: 4}, {cupType: 3, defaultCups: 3, ratio: 14, bypassEnabled: false}],
    ["Original", {adaptedModel: 2}, {grindSize: 54}],
    ["grinder flag off", {isSetGrinderSize: 2}, {grinder: false}],
    ["grinder sentinel", {grinderSize: 81}, {grinder: false, grindSize: 81}],
    ["missing RPM", {rpm: undefined}, {grindRPM: 120}],
    ["low RPM", {rpm: 59}, {grindRPM: 120}],
    ["high RPM", {rpm: 121}, {grindRPM: 120}],
    ["bypass off", {isEnableBypassWater: 2}, {bypassEnabled: false, bypassVolume: 30}],
    ["zero bypass", {bypassVolume: 0}, {bypassEnabled: false, bypassVolume: 0, bypassTemp: 85}],
    ["invalid bypass", {bypassVolume: 501}, {bypassEnabled: false, bypassVolume: 0}],
    ["missing bypass temperature", {bypassTemp: undefined}, {bypassEnabled: true, bypassTemp: 85}],
    ["fractional bypass", {bypassTemp: 92.5}, {bypassEnabled: true, bypassTemp: 93}],
    ["invalid bypass temperature", {bypassTemp: 38}, {bypassEnabled: true, bypassTemp: 85}]
])("keeps app parity: %s", async (_label, patch, expected) => {
    const detail = importDetail();
    Object.assign(detail.recipeVo, patch);
    const spy = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(detail)));
    try {
        const app = new XBloomRecipe({kind: "share", id: "fixture+id="}, "studio");
        await app.fetchRecipeDetail();
        const recipe = app.getRecipe();
        if (!recipe) throw new Error("Fixture failed to import");
        const fields = normaliseXBloomRecipe(detail);
        expect(fields).toMatchObject(expected);
        expect(recipe).toMatchObject(expected);
        expect(fields.pours.map(pour => pour.toJSON()))
            .toEqual(recipe.pours.map(pour => pour.toJSON()));
        if (fields.cupType === 3) {
            expect(fields.pours.map(pour => pour.volume)).toEqual([40, 90, 80]);
        }
    } finally {
        spy.mockRestore();
    }
});

it.each([[99.4, 99], [92.5, 93], [38, 39]])(
    "normalizes stage temperature %s to %s", (raw, expected) => {
        const detail = importDetail();
        detail.recipeVo.pourList[0].temperature = raw;
        expect(normaliseXBloomRecipe(detail).pours[0].temperature).toBe(expected);
    }
);

it.each([
    [1, 2, 2, 0, 0], [2, 1, 2, 2, 1],
    [3, 2, 1, 1, 2], [999, 1, 1, 1, 3]
])("maps pattern %s and agitation %s/%s", (pattern, before, after, mapped, bits) => {
    const detail = importDetail();
    Object.assign(detail.recipeVo.pourList[0], {
        pattern, isEnableVibrationBefore: before, isEnableVibrationAfter: after
    });
    const pour = normaliseXBloomRecipe(detail).pours[0];
    expect(pour.pourPattern).toBe(mapped);
    expect(pour.agitation).toBe(bits);
});
```

```bash
npx --no-install jest --runTestsByPath \
  library/__tests__/xbloomRecipeData.test.ts \
  library/__tests__/XBloomRecipe.endpoint.test.ts \
  library/__tests__/XBloomRecipe.bypass.test.ts \
  library/__tests__/XBloomRecipe.temperature.test.ts --runInBand
npm run typecheck
git add library test-utils/importPageFixtures.ts
git commit -m "refactor: share xBloom import field normalization" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: both projects pass without revising existing behavior assertions.
Stop and investigate a characterization difference rather than blessing it.

## Task 3: Add bounded, read-only upstream lookup

**Files:** `api/_lib/importLookup.ts`, `api/__tests__/importLookup.test.ts`.

- [ ] **Step 1: Add failing endpoint, deadline and body tests.**

Use `importDetail()` and real `Response` objects. The basic request test is:

```ts
it("resolves an opaque share ID without fetching the supplied host", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(importDetail()))
    );
    try {
        await lookupImport({kind: "share", id: "opaque+/="}, "studio");
        expect(fetchSpy).toHaveBeenCalledWith(
            "https://client-api.xbloom.com/RecipeDetail.html",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    interfaceVersion: 19700101, skey: "testskey",
                    tableIdOfRSA: "opaque+/="
                })
            })
        );
        const options = fetchSpy.mock.calls[0][1];
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        expect(new Headers(options?.headers).get("Referer")).toBe(
            "https://share-h5.xbloom.com/"
        );
    } finally {
        fetchSpy.mockRestore();
    }
});
```

Run `npx --no-install jest --runTestsByPath api/__tests__/importLookup.test.ts --runInBand`.
Expected initial failure: missing `lookupImport`.

- [ ] **Step 2: Implement the fixed endpoint/request builder.**

`api/_lib/importLookup.ts` starts with:

```ts
import type {ImportSource} from "../../library/importInput";
import {adaptedModelFor, type MachineModel} from "../../library/machine/machineModel";
import {recordOf} from "../../library/xbloomRecipeData";

export const IMPORT_DEADLINE_MS = 8_000;
export const IMPORT_BODY_BYTES = 1024 * 1024;

export class ImportLookupError extends Error {
    constructor(
        public readonly status: 502 | 503 | 504,
        public readonly kind: "http" | "envelope" | "body" | "timeout" | "network"
    ) {
        super(`import lookup: ${kind}`);
    }
}

function upstreamRequest(source: ImportSource, model: MachineModel) {
    const common = {interfaceVersion: 19700101, skey: "testskey"};
    return source.kind === "share" ? {
        endpoint: "https://client-api.xbloom.com/RecipeDetail.html",
        body: {...common, tableIdOfRSA: source.id}
    } : {
        endpoint: "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml",
        body: {...common, xid: source.xid, languageType: 0,
            adaptedModel: adaptedModelFor(model), isRefreshScanTime: 1,
            appVersion: "2.1.2"}
    };
}
```

No credentials, login, account library, mint helpers or arbitrary URL fetch.
Pod request `appVersion` is the existing upstream protocol value, not the
app's marketing version.

- [ ] **Step 3: Implement bounded reading and envelope validation.**

```ts
async function readBody(response: Response): Promise<unknown> {
    if (response.body === null) throw new ImportLookupError(502, "body");
    const declared = Number(response.headers.get("content-length"));
    if (declared > IMPORT_BODY_BYTES) {
        await response.body.cancel();
        throw new ImportLookupError(502, "body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > IMPORT_BODY_BYTES) {
                await reader.cancel();
                throw new ImportLookupError(502, "body");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const text = new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks));
    return JSON.parse(text);
}

export async function lookupImport(
    source: ImportSource, model: MachineModel = "studio"
): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORT_DEADLINE_MS);
    try {
        const request = upstreamRequest(source, model);
        const response = await fetch(request.endpoint, {
            method: "POST",
            headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/json",
                Referer: "https://share-h5.xbloom.com/",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
                    "Mobile/15E148 Safari/604.1"
            },
            body: JSON.stringify(request.body), signal: controller.signal,
            redirect: "error"
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ImportLookupError(response.status === 429 ? 503 : 502, "http");
        }
        let data: Record<string, unknown>;
        try {
            data = recordOf(await readBody(response));
        } catch (error) {
            if (error instanceof ImportLookupError) throw error;
            throw new ImportLookupError(502, "body");
        }
        if (data.result !== "success" ||
            (data.code !== undefined && data.code !== 0 && data.code !== 200)) {
            throw new ImportLookupError(502, "envelope");
        }
        try {
            recordOf(data.recipeVo);
        } catch {
            throw new ImportLookupError(502, "envelope");
        }
        return data;
    } catch (error) {
        if (controller.signal.aborted) throw new ImportLookupError(504, "timeout");
        if (error instanceof ImportLookupError) throw error;
        throw new ImportLookupError(502, "network");
    } finally {
        clearTimeout(timer);
    }
}
```

The timer spans response-body reading, not just response headers. Errors
contain only a constant category; no upstream body or localized message.
There is currently no verified permanent-removal code. Generic `result:
"fail"` is an ambiguous 502, not a made-up 404.

- [ ] **Step 4: Add exact boundary tests and commit.**

Test pod bodies with adaptedModel 1 and 2, and no adaptedModel on shares.
Test HTTP 429 -> 503, other non-OK -> 502, `result:"fail"` inside 200 -> 502,
malformed JSON, absent recipeVo, lying content-length and streamed bodies of
exactly 1 MiB versus 1 MiB + 1 byte.

For timeout tests, fake fetch must reject when its supplied signal aborts:

```ts
it("aborts a lookup after the exact deadline", async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(
        (_input, init) => new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) throw new Error("Missing signal");
            signal.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
            }, {once: true});
        })
    );
    try {
        const pending = expect(lookupImport({kind: "xid", xid: "XB0001"}))
            .rejects.toMatchObject({status: 504, kind: "timeout"});
        await jest.advanceTimersByTimeAsync(IMPORT_DEADLINE_MS);
        await pending;
    } finally {
        fetchSpy.mockRestore();
        jest.useRealTimers();
    }
});
```

Also test a body that starts successfully but errors on signal abort while
waiting for its next chunk. Restore spies/timers in `afterEach` so a failure
cannot contaminate the next project.

```bash
npx --no-install jest --runTestsByPath api/__tests__/importLookup.test.ts --runInBand
npm run typecheck
git add api/_lib/importLookup.ts api/__tests__/importLookup.test.ts
git commit -m "feat: add bounded public recipe lookup" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Build the decorated view without losing metadata

**Files:** `api/_lib/importView.ts`, `api/__tests__/importView.test.ts`.

- [ ] **Step 1: Write the failing metadata/handoff test.**

```ts
it("decorates the browser candidate and preserves the entire original query", () => {
    const url = fullImportURL();
    const link = parseBrewMindLink(url.toString());
    if (!link) throw new Error("Invalid fixture");
    const source = parseImportInput(link.share);
    if (!source) throw new Error("Invalid fixture source");
    const view = buildImportView(importDetail(), link, source, url.search);
    expect(view.recipe.name).toBe("Producer's morning recipe");
    expect(view.recipe.coffee?.roaster).toBe("Example Roastery");
    expect(view.recipe.imageURL).toBe("https://images.example.test/pod.jpg");
    expect(view.recipe.coffee?.imageUrl).toBe("https://images.example.test/bag.jpg");
    expect(new URL(view.openAppURL).search).toBe(url.search);
    expect(new URL(view.openAppURL).searchParams.get("future"))
        .toBe("Keep + / = % & Unicode \u00e9");
    expect(view.model).toBe("studio");
});
```

Use imports from the actual parser, source parser, fixture and new view
module. Run the new test; expect missing-module failure.

- [ ] **Step 2: Implement the complete view builder.**

```ts
import {parseImportInput, type ImportSource} from "../../library/importInput";
import type {BrewMindLink} from "../../library/brewmindLink";
import {decorateImport, type ImportCandidate} from "../../library/importDecoration";
import {CUP_TYPE, normaliseRecipeTags} from "../../library/recipeIdentity";
import {InvalidImportDataError, normaliseXBloomRecipe, recordOf, type XBloomRecipeData}
    from "../../library/xbloomRecipeData";
import type {MachineModel} from "../../library/machine/machineModel";

export type ImportPageView = {
    recipe: XBloomRecipeData & ImportCandidate;
    link: BrewMindLink;
    model: MachineModel;
    openAppURL: string;
    xbloomURL?: string;
};

export function canonicalShareURL(id: string): string {
    const url = new URL("https://share-h5.xbloom.com/");
    url.searchParams.set("id", id);
    return url.toString();
}

export function sourcePageURL(
    source: ImportSource, supplied: string, podShare?: unknown
): string | undefined {
    if (source.kind === "share") {
        const candidate = new URL(supplied);
        if (candidate.protocol === "https:" &&
            candidate.hostname === "share-h5.xbloom.com" &&
            !candidate.port && !candidate.username && !candidate.password) {
            return candidate.toString();
        }
        return canonicalShareURL(source.id);
    }
    if (typeof podShare !== "string") return undefined;
    const parsed = parseImportInput(podShare);
    return parsed?.kind === "share" ? canonicalShareURL(parsed.id) : undefined;
}

export function buildImportView(
    detail: unknown, link: BrewMindLink, source: ImportSource, rawSearch: string,
    requestedModel: MachineModel = "studio"
): ImportPageView {
    const root = recordOf(detail);
    const row = recordOf(root.recipeVo);
    const model = row.adaptedModel === 2 ? "original"
        : row.adaptedModel === 1 ? "studio" : requestedModel;
    if (row.adaptedModel !== undefined &&
        row.adaptedModel !== 1 && row.adaptedModel !== 2) {
        throw new InvalidImportDataError();
    }
    const fields = normaliseXBloomRecipe(detail);
    const recipe: XBloomRecipeData & ImportCandidate = {
        ...fields, name: "", tags: [],
        isTea() { return this.cupType === CUP_TYPE.TEA; },
        setTags(tags) { this.tags = normaliseRecipeTags(tags); }
    };
    decorateImport(recipe, {
        coffee: link.coffee, recipeUrl: link.recipeUrl, recipeName: link.recipeName,
        tags: link.tags, colour: link.colour, feed: link.feed,
        source: link.source === "brewmind" ? "brewmind" : "import"
    });
    if (!Number.isFinite(recipe.dosage) || recipe.dosage <= 0 ||
        !Number.isFinite(recipe.ratio) ||
        ![recipe.grindSize, recipe.grindRPM, recipe.defaultCups, recipe.cupType,
            recipe.bypassVolume, recipe.bypassTemp].every(Number.isFinite) ||
        recipe.pours.some(pour => ![
            pour.pourNumber, pour.volume, pour.temperature, pour.flowRate,
            pour.pauseTime, pour.pourPattern, pour.agitation
        ].every(Number.isFinite))) {
        throw new InvalidImportDataError();
    }
    return {
        recipe, link, model,
        openAppURL: `xbrw://import${rawSearch}`,
        xbloomURL: sourcePageURL(source, link.share, row.shareRecipeLink)
    };
}
```

Do not parse the query into a new reduced URL. Do not follow `feed`, image,
product or producer links here. The candidate is structurally typed; no
`as Recipe`, `as any` or dummy native Recipe instance.

- [ ] **Step 3: Add precedence, safety and model tests, then commit.**

Use the same fixture/test body for missing bean name, unsupported versions,
every existing alias and encoded opaque IDs. Assert a non-xBloom share host
is never used as the xBloom button destination. Reject unsupported explicit
adaptedModel; preserve Original `2`; default an absent discriminator to Studio.
For pod input, use `shareRecipeLink` if parseable and leave the xBloom action
explicitly unavailable if absent. Never mint one.

Compare decoration against `decorateImport(actualAppRecipe, decoration)` from
the same fixture, including full coffee object, source, name, imageURL, tags
and accentIndex. Existing-library fill behavior stays in its current tests.

```bash
npx --no-install jest --runTestsByPath \
  api/__tests__/importView.test.ts library/__tests__/importDecoration.test.ts --runInBand
npm run typecheck
git add api/_lib/importView.ts api/__tests__/importView.test.ts
git commit -m "feat: preserve complete import data in browser views" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Render the full page and persistent footer

**Files:** `api/_lib/importPage.ts`, `api/__tests__/importPage.test.ts`.

- [ ] **Step 1: Write visible-output tests, not hidden-payload tests.**

```ts
it("surfaces supplied metadata in the actual page body", () => {
    const url = fullImportURL();
    const link = parseBrewMindLink(url.toString());
    if (!link) throw new Error("Invalid fixture");
    const source = parseImportInput(link.share);
    if (!source) throw new Error("Invalid fixture");
    const view = buildImportView(importDetail(), link, source, url.search);
    const html = renderImportPage(view, {
        nonce: "fixtureNonce", userAgent: "Android", pageURL: url.toString()
    });
    const body = html.slice(html.indexOf("<body>"));
    for (const value of [
        "Example Roastery", "Bag coffee", "East Africa", "Ethiopia", "Guji",
        "Example Farm", "Example Farmer", "1,798 m", "Natural", "Anaerobic", "Heirloom",
        "Single Origin", "Light", "2026-10-01", "Stone fruit and jasmine",
        "Apricot", "86.5", "Caffeinated", "0 days", "14 days", "35 days",
        "A complete description.", "A second paragraph.", "Morning", "Filter",
        "brewmind", "Get XBRW++", "Open app", "View on xBloom"
    ]) expect(body).toContain(value);
    expect(body).toContain("https://images.example.test/pod.jpg");
    expect(body).toContain("https://images.example.test/bag.jpg");
    expect(body).toContain("https://producer.example.test/feed.json");
    expect(body).not.toContain("<script");
});
```

Run the new test; expect missing renderer failure. Keep body assertions
separate from Open Graph assertions so hidden metadata cannot satisfy them.

- [ ] **Step 2: Add escaping, destinations and the page shell.**

Use this complete base in `api/_lib/importPage.ts`:

```ts
import {palette, onAccent, accents} from "../../constants/colourValues";
import {formatCuppingPoints, formatElevation, formatRoastingDate}
    from "../../library/coffeeDetails";
import type {PodCoffee} from "../../library/podCoffee";
import type {ImportPageView} from "./importView";

export const DOWNLOADS = {
    ios: "https://apps.apple.com/app/id6806339475",
    android: "https://github.com/hessius/XBRW/releases/latest"
} as const;

export function escapeHTML(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character] ?? character));
}

type PageOptions = {
    nonce: string; userAgent: string; pageURL?: string;
    openAppURL?: string; xbloomURL?: string;
};

function anchor(href: string, label: string, className = ""): string {
    return `<a class="${className}" href="${escapeHTML(href)}" ` +
        `rel="noopener noreferrer">${escapeHTML(label)}</a>`;
}

function downloadURL(userAgent: string): string {
    return /android/i.test(userAgent) ? DOWNLOADS.android
        : /iphone|ipad|ipod/i.test(userAgent) ? DOWNLOADS.ios : "#get-app";
}

function footer(options: PageOptions): string {
    const open = options.openAppURL
        ? anchor(options.openAppURL, "Open app")
        : "<span>Open app unavailable</span>";
    const xbloom = options.xbloomURL
        ? anchor(options.xbloomURL, "View on xBloom")
        : "<span>xBloom page unavailable</span>";
    return `<footer class="app-dock" aria-label="Recipe actions">
        ${anchor(downloadURL(options.userAgent), "Get XBRW++", "get-app")}
        <div class="dock-links"><span>${open}</span><span>${xbloom}</span></div>
        </footer>`;
}

function installSection(): string {
    return `<section id="get-app" tabindex="-1"><h2>Get XBRW++</h2>
        <p>After installing, return to this page and tap Open app.</p>
        ${anchor(DOWNLOADS.ios, "Download for iOS")}
        ${anchor(DOWNLOADS.android, "Android download")}
        </section>`;
}
```

Both destinations are verified public distribution pages. Do not substitute a
guessed Google Play page or silently send Android visitors to TestFlight.

- [ ] **Step 3: Add complete coffee-field rendering.**

```ts
function coffeeFacts(coffee: PodCoffee | undefined): string {
    if (!coffee) return "";
    const fields: readonly [keyof PodCoffee, string][] = [
        ["origin", "Origin"], ["country", "Country"], ["region", "Region"],
        ["farm", "Farm"], ["farmer", "Farmer"], ["elevation", "Elevation"],
        ["processing", "Process"], ["fermentation", "Fermentation"],
        ["variety", "Varietal"], ["beanMix", "Type"], ["roast", "Roast"],
        ["roastingDate", "Roasted on"], ["flavours", "Flavours"],
        ["aromatics", "Tasting notes"], ["cupping_points", "Cupping score"],
        ["decaffeinated", "Caffeine"], ["restDays", "Rest"],
        ["peakDay", "Peak"], ["bestUntilDay", "Best until"]
    ];
    const rows = fields.flatMap(([key, label]) => {
        const value = coffee[key];
        if (value === undefined || value === "") return [];
        if (key === "origin" && typeof value === "string" &&
            value.trim().toLowerCase() === coffee.country?.trim().toLowerCase()) {
            return [];
        }
        let text = Array.isArray(value) ? value.join(", ") : String(value);
        if (key === "elevation" && typeof value === "number") text = formatElevation(value);
        if (key === "cupping_points" && typeof value === "number") {
            text = `${formatCuppingPoints(value)} points`;
        }
        if (key === "roastingDate" && typeof value === "string") text = formatRoastingDate(value);
        if (key === "decaffeinated") text = value ? "Decaf" : "Caffeinated";
        if (key === "restDays" || key === "peakDay" || key === "bestUntilDay") {
            text = `${value} days`;
        }
        return [`<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(text)}</dd></div>`];
    });
    const note = coffee.note ? `<p class="prose">${escapeHTML(coffee.note)}</p>` : "";
    if (rows.length === 0 && !note) return "";
    return `<section><h2>About this coffee</h2><dl>${rows.join("")}</dl>
        ${note}</section>`;
}

function sourceLinks(view: ImportPageView): string {
    const destinations = [
        {url: view.recipe.coffee?.url, label: "Coffee page"},
        {url: view.recipe.recipeUrl, label: "Producer's recipe page"},
        {url: view.link.feed, label: "Coffee catalogue"}
    ];
    const grouped = new Map<string, {url: string; labels: string[]}>();
    for (const {url, label} of destinations) {
        if (!url) continue;
        const normalized = new URL(url).toString();
        const existing = grouped.get(normalized);
        if (existing) existing.labels.push(label);
        else grouped.set(normalized, {url, labels: [label]});
    }
    const links = [...grouped.values()].map(({url, labels}) =>
        anchor(url, labels.join(" / "))).join("");
    return links ? `<div class="source-links">${links}</div>` : "";
}

function pictures(view: ImportPageView): string {
    const entries = [
        {url: view.recipe.imageURL, role: "Recipe artwork"},
        {url: view.recipe.coffee?.imageUrl, role: "Coffee photo"}
    ];
    const seen = new Set<string>();
    return `<div class="pictures">${entries.flatMap(({url, role}) => {
        if (!url || seen.has(url)) return [];
        seen.add(url);
        return [`<figure><img src="${escapeHTML(url)}" width="96" height="96"
            alt="${role}" referrerpolicy="no-referrer"><figcaption>${role}</figcaption></figure>`];
    }).join("")}</div>`;
}
```

Do not fold notes behind JavaScript, drop explicit false/zero values, or
reuse an app row-suppression rule that hides distinct supplied fields.
The browser's broken-image/alt treatment must remain non-blocking; no fake photo.

- [ ] **Step 4: Add CSS with a layout-owned footer height.**

```ts
function styles(accent: string): string {
    return `:root{color-scheme:dark;--accent:${accent}}
    *{box-sizing:border-box}
    html,body{margin:0;background:${palette.base};color:${palette.text}}
    body{height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) auto;
      font:16px/1.5 system-ui,sans-serif}
    main{min-height:0;overflow:auto;overscroll-behavior:contain}
    .content{max-width:740px;margin:auto;padding:24px max(20px,env(safe-area-inset-left))}
    h1{font-size:clamp(28px,6vw,42px);line-height:1.15;margin:12px 0}
    h2{font-size:20px;margin:28px 0 12px}
    p,dd,a,h1,h2{overflow-wrap:anywhere}
    a{color:${palette.text};text-underline-offset:4px}
    a:focus-visible{outline:3px solid var(--accent);outline-offset:5px}
    main:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .brand{font:800 20px monospace}.brand b{color:${palette.brand}}
    .muted,dt,figcaption{color:${palette.dim}}
    .pictures{display:flex;flex-wrap:wrap;gap:16px}
    figure{margin:12px 0}figure img{object-fit:contain;background:${palette.surface}}
    figcaption{font-size:12px}
    .metrics{display:flex;flex-wrap:wrap;gap:24px;border-block:1px solid ${palette.line};
      padding:18px 0;margin:20px 0}
    .metrics strong{display:block;color:var(--accent);font:600 28px monospace}
    dl{margin:0}dl>div{padding:10px 0;border-bottom:1px solid ${palette.line}}
    dt{font-size:13px}dd{margin:3px 0 0}
    ol{padding-left:24px}li{margin:20px 0}.prose{white-space:pre-wrap}
    .tags{display:flex;flex-wrap:wrap;gap:8px}.tag{border:1px solid ${palette.line};padding:3px 8px}
    .source-links{display:flex;flex-wrap:wrap;gap:18px}
    .source-links a,#get-app>a{display:inline-flex;align-items:center;min-height:44px}
    #get-app>a{display:inline-block;margin:8px 20px 8px 0}
    .app-dock{border-top:1px solid ${palette.line};background:${palette.surface};
      padding:12px max(20px,env(safe-area-inset-left)) max(16px,env(safe-area-inset-bottom));
      max-height:45dvh;overflow:auto}
    .app-dock>*{max-width:700px;margin-inline:auto}
    .get-app{display:block;text-align:center;background:var(--accent);color:${onAccent.text};
      border-radius:10px;padding:14px 12px;text-decoration:none;font-weight:650;min-height:48px}
    .dock-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px}
    .dock-links a,.dock-links span>span{display:inline-block;padding:12px 0;min-height:44px}
    .dock-links span>span{color:${palette.dim}}
    @media(min-width:800px){.content{padding-block:36px}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}`;
}
```

The footer is a separate grid row, not an overlay with a guessed padding
constant. Its height follows wrapping/safe areas; extreme zoom can scroll the
action area without eliminating the recipe's scroll container.

- [ ] **Step 5: Add the complete document, stages and source sections.**

```ts
function documentHTML(
    title: string, description: string, content: string,
    options: PageOptions, accent: string, image?: string
): string {
    const page = options.pageURL
        ? `<meta property="og:url" content="${escapeHTML(options.pageURL)}">` : "";
    const picture = image ? `<meta property="og:image" content="${escapeHTML(image)}">` : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <meta name="referrer" content="no-referrer">
        <title>${escapeHTML(title)} | XBRW++</title>
        <meta name="description" content="${escapeHTML(description)}">
        <meta property="og:type" content="website">
        <meta property="og:title" content="${escapeHTML(title)}">
        <meta property="og:description" content="${escapeHTML(description)}">
        ${page}${picture}<style nonce="${escapeHTML(options.nonce)}">${styles(accent)}</style>
        </head><body><main tabindex="0" aria-label="Import page content"><div class="content">
        <div class="brand">XBRW<b>++</b></div>${content}${installSection()}
        <p class="muted">Independent app. Not affiliated with xBloom.</p>
        </div></main>${footer(options)}</body></html>`;
}

export function renderImportPage(view: ImportPageView, options: PageOptions): string {
    const recipe = view.recipe;
    const title = recipe.name || recipe.xbloomName || "Shared recipe";
    const beverage = recipe.isTea() ? "Tea" : "Coffee";
    const stageWater = recipe.pours.reduce((sum, pour) => sum + pour.volume, 0);
    const model = view.model === "studio" ? "Studio" : "Original";
    const group = recipe.isTea() ? "tea" : "coffee";
    const accent = accents[group][recipe.accentIndex ?? 0] ?? accents[group][0];
    const coffee = recipe.coffee;
    const coffeeIdentity = coffee ? `<p>${escapeHTML(coffee.name)}</p>
        ${coffee.roaster ? `<p>Roasted by ${escapeHTML(coffee.roaster)}</p>` : ""}` : "";
    const patterns: Readonly<Record<number, string>> = {0: "Centered", 1: "Circular", 2: "Spiral"};
    const stages = recipe.pours.map(pour => `<li>
        <strong>Stage ${pour.pourNumber}: ${pour.volume} ml</strong>
        <p>${pour.temperature} &deg;C · ${escapeHTML(patterns[pour.pourPattern] ?? "Unknown pattern")}
        · ${pour.flowRate / 10} ml/s · Pause ${pour.pauseTime} s</p>
        <p>Agitation before: ${pour.getAgitationBefore() ? "On" : "Off"}.
        After: ${pour.getAgitationAfter() ? "On" : "Off"}.</p></li>`).join("");
    const cupNames: Readonly<Record<number, string>> = {0: "xPod", 1: "Other", 2: "Omni", 3: "Tea"};
    const bypass = recipe.bypassEnabled
        ? `<p>Bypass: ${recipe.bypassVolume} ml at ${recipe.bypassTemp} &deg;C.
            Planned total water: ${stageWater + recipe.bypassVolume} ml.</p>`
        : "<p>Bypass off</p>";
    const mismatch = Math.abs(stageWater - recipe.dosage * recipe.ratio) >= 1
        ? `<p>Stages contain ${stageWater} ml. Dose and ratio imply
            ${recipe.dosage * recipe.ratio} ml.</p>` : "";
    const tags = recipe.tags.length ? `<div class="tags">${recipe.tags.map(tag =>
        `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>` : "";
    const source = view.link.source
        ? `<p>Source: ${escapeHTML(view.link.source)}</p>` : "";
    const upstream = recipe.xbloomName && recipe.xbloomName !== title
        ? `<p>xBloom recipe: ${escapeHTML(recipe.xbloomName)}</p>` : "";
    const xid = recipe.xid ? `<p>Pod ID: ${escapeHTML(recipe.xid)}</p>` : "";
    const sharer = recipe.sharedBy
        ? `<p>Shared by ${escapeHTML(recipe.sharedBy)}</p>` : "";
    const content = `<p class="muted">Shared recipe · ${model}</p>
        <h1>${escapeHTML(title)}</h1>${upstream}${coffeeIdentity}${pictures(view)}
        <div class="metrics"><div><strong>${recipe.dosage} g</strong>${beverage}</div>
        <div><strong>${stageWater} ml</strong>Stage water</div>
        <div><strong>1:${recipe.ratio}</strong>Ratio</div></div>
        <p>${recipe.grinder ? `Grind ${recipe.grindSize}` : "Grinder off"} ·
        ${recipe.grindRPM} RPM · ${cupNames[recipe.cupType] ?? "Unknown cup"}</p>
        ${recipe.isTea() ? `<p>${recipe.defaultCups} cups</p>` : ""}
        <h2>The brew</h2><ol>${stages}</ol>${bypass}${mismatch}
        ${coffeeFacts(coffee)}${tags}${source}${xid}${sharer}${sourceLinks(view)}`;
    return documentHTML(title, `${recipe.dosage} g ${beverage.toLowerCase()}. ${stageWater} ml stage water. ${model}.`,
        content, {...options, openAppURL: view.openAppURL, xbloomURL: view.xbloomURL},
        accent, recipe.imageURL ?? coffee?.imageUrl);
}

export function renderImportError(message: string, options: PageOptions): string {
    return documentHTML("Could not load this recipe", "Recipe import help.",
        `<h1>Could not load this recipe</h1><p>${escapeHTML(message)}</p>
        <p>Check the link or try again shortly.</p>`,
        options, accents.coffee[0]);
}
```

Numeric interpolation is allowed only after the typed normalization and view
guard. Test it with malicious wrong-type upstream fields as well as valid
numeric fixtures; do not weaken the guard to make output tests pass.
A validated accent becomes a canonical palette value, not arbitrary CSS.

- [ ] **Step 6: Prove visibility, escaping, photos and footer behavior.**

Add tests for all fields in `fullImportURL`, full long notes, false caffeine,
zero rest days, legacy aliases, empty groups, duplicate destinations and
different origin/country values. Ensure the actual body contains each value.
Verify the two pictures when different, one picture when equal, no script,
no automatic scheme launch, real download URLs and separate product/recipe/
catalogue/xBloom links.

Use malicious title/note text `"><script>alert(1)</script>` and assert no raw
script tag, while its escaped text remains visible. Assert escaped `&` in
handoff attributes decodes back to the exact query; do not compare HTML
source escapes to URL values.

```bash
npx --no-install jest --runTestsByPath api/__tests__/importPage.test.ts --runInBand
npm run typecheck
git add api/_lib/importPage.ts api/__tests__/importPage.test.ts
git commit -m "feat: render full recipe import pages with persistent actions" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Wire the Node endpoint and exact hosting routes

**Files:** `api/import.ts`, `api/__tests__/import.test.ts`, `vercel.json`.

- [ ] **Step 1: Write HTTP behavior tests first.**

```ts
it("rejects an unsupported link without contacting xBloom", async () => {
    const spy = jest.spyOn(global, "fetch");
    try {
        const response = await respond(new Request(
            "https://preview.example.test/import?v=2&share=XB0001"
        ));
        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
        expect(spy).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain('href="xbrw://');
    } finally {
        spy.mockRestore();
    }
});
```

Add GET versus HEAD and POST/405 cases. Run
`npx --no-install jest --runTestsByPath api/__tests__/import.test.ts --runInBand`;
expect the missing endpoint.

- [ ] **Step 2: Implement response logic with no-store and a nonce CSP.**

```ts
import {randomBytes} from "node:crypto";
import type {IncomingMessage, ServerResponse} from "node:http";
import {parseBrewMindLink} from "../library/brewmindLink";
import {parseImportInput} from "../library/importInput";
import {InvalidImportDataError} from "../library/xbloomRecipeData";
import {lookupImport, ImportLookupError} from "./_lib/importLookup";
import {buildImportView, sourcePageURL} from "./_lib/importView";
import {renderImportPage, renderImportError} from "./_lib/importPage";

export const IMPORT_TARGET_BYTES = 64 * 1024;

function responseHTML(
    html: string, status: number, method: string, nonce: string
): Response {
    return new Response(method === "HEAD" ? null : html, {
        status,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "content-length": String(Buffer.byteLength(html)),
            "cache-control": "private, no-store",
            "cdn-cache-control": "no-store",
            "vercel-cdn-cache-control": "no-store",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
            "content-security-policy": [
                "default-src 'none'", "script-src 'none'",
                `style-src 'nonce-${nonce}'`, "img-src https:",
                "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
            ].join("; ")
        }
    });
}

function unsupportedMethod(method: string, userAgent: string, nonce: string): Response {
    const result = responseHTML(
        renderImportError("This page supports GET and HEAD.", {nonce, userAgent}),
        405, method, nonce
    );
    result.headers.set("allow", "GET, HEAD");
    return result;
}

export async function respond(request: Request): Promise<Response> {
    const nonce = randomBytes(18).toString("base64");
    const userAgent = request.headers.get("user-agent") ?? "";
    const base = {nonce, userAgent};
    if (request.method !== "GET" && request.method !== "HEAD") {
        return unsupportedMethod(request.method, userAgent, nonce);
    }
    const url = new URL(request.url);
    if (Buffer.byteLength(url.pathname + url.search) > IMPORT_TARGET_BYTES) {
        return responseHTML(renderImportError("This import link is too long.", base),
            414, request.method, nonce);
    }
    const link = parseBrewMindLink(url.toString());
    const source = link ? parseImportInput(link.share) : null;
    if (!link || !source) {
        return responseHTML(renderImportError("This import link is not supported.", base),
            400, request.method, nonce);
    }
    const fallback = {
        ...base, openAppURL: `xbrw://import${url.search}`,
        xbloomURL: sourcePageURL(source, link.share)
    };
    try {
        const detail = await lookupImport(source);
        const view = buildImportView(detail, link, source, url.search);
        return responseHTML(renderImportPage(view, {
            ...base, pageURL: new URL(`/import${url.search}`, url.origin).toString()
        }), 200, request.method, nonce);
    } catch (error) {
        if (!(error instanceof ImportLookupError) &&
            !(error instanceof InvalidImportDataError)) throw error;
        const status = error instanceof ImportLookupError ? error.status : 502;
        console.warn("import: lookup failed",
            error instanceof ImportLookupError ? error.kind : "shape");
        const message = status === 504 ? "xBloom took too long to respond."
            : status === 503 ? "xBloom is busy. Please try again shortly."
            : "The recipe could not be loaded from xBloom.";
        return responseHTML(renderImportError(message, fallback), status, request.method, nonce);
    }
}
```

The 64-KiB application ceiling is a defensive limit, not a claim about
Vercel/native/browser limits. The deployment smoke must record the real ingress
behavior; the public contract continues to make no whole-link size guarantee.
Do not add public caching headers on this route to match the feed.

- [ ] **Step 3: Add the actual Node adapter.**

Append to `api/import.ts`:

```ts
function importOrigin(): string {
    const raw = process.env.PUBLIC_IMPORT_ORIGIN ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`
            : "https://xbrwplusplus.vercel.app");
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Invalid public import origin");
    }
    return url.origin;
}

export default async function handler(
    req: IncomingMessage, res: ServerResponse
): Promise<void> {
    try {
        const method = req.method ?? "GET";
        const target = req.url ?? "/import";
        if (!target.startsWith("/") || target.startsWith("//")) {
            res.statusCode = 400;
            res.setHeader("cache-control", "private, no-store");
            res.setHeader("cdn-cache-control", "no-store");
            res.setHeader("vercel-cdn-cache-control", "no-store");
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.setHeader("referrer-policy", "no-referrer");
            res.setHeader("x-content-type-options", "nosniff");
            res.end(method === "HEAD" ? undefined : "Invalid request target");
            return;
        }
        const userAgent = req.headers["user-agent"] ?? "";
        const response = method === "GET" || method === "HEAD"
            ? await respond(new Request(`${importOrigin()}${target}`, {
                method, headers: {"user-agent": userAgent}
            }))
            : unsupportedMethod(method, userAgent, randomBytes(18).toString("base64"));
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error("import: adapter failed",
            error instanceof Error ? error.name : "UnknownError");
        res.statusCode = 500;
        res.setHeader("cache-control", "private, no-store");
        res.setHeader("cdn-cache-control", "no-store");
        res.setHeader("vercel-cdn-cache-control", "no-store");
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.setHeader("referrer-policy", "no-referrer");
        res.setHeader("x-content-type-options", "nosniff");
        res.end(req.method === "HEAD" ? undefined : "Recipe page unavailable");
    }
}
```

Do not trust the incoming Host header to construct social URLs. A verified
`PUBLIC_IMPORT_ORIGIN` may override Vercel's own deployment URL. Keep the
existing public-host fallback, not the unowned domain.

- [ ] **Step 4: Extend Vercel configuration, preserving its existing fields.**

Add these exact entries to `vercel.json`:

```json
{
  "rewrites": [
    {"source": "/import", "destination": "/api/import"},
    {"source": "/import/", "destination": "/api/import"}
  ]
}
```

These are new members of the existing object, not a replacement for its
framework/install/build/output settings. No redirect and no global catch-all.
The rewritten function URL still ends with the `import` segment, so the shared
parser reads it without a parallel server grammar. Verify query preservation
on an authorized deployment; unit-reading JSON is not proof of router behavior.

- [ ] **Step 5: Test real adapters, cache isolation and failure shapes.**

Use real `createServer(handler)` and `node:http` requests in tests rather
than `as any` fake request/response objects. Always close the server in
`finally`. Mock only the upstream fetch. Verify:

- GET 200 returns a completed HTML socket; HEAD returns matching status and
  headers with zero body; POST returns 405/Allow without upstream fetch.
- A real Node HTTP TRACE request also returns 405; constructing a Web Request
  with TRACE would throw, so the adapter rejects methods before that conversion.
- Unknown version and malformed share return 400 before fetch.
- Each upstream failure returns the explicit uncached error page.
- Two same-ID requests with different names, roasters and photos get
  independent bodies and no-store headers.
- All HTML branches have safe content type/referrer policy; success and
  normal errors have CSP matching their inline style nonce.
- No full URL, bean object or upstream message reaches application logs.
- The application target limit accepts exactly 65,536 bytes and refuses
  65,537. Build valid requests with padding in an unknown field; test platform
  ingress separately rather than equating this unit limit with Vercel's.
  Exercise this boundary through `respond`; a default Node HTTP server can
  reject oversized request headers before dispatching to the adapter.

```bash
npx --no-install jest --runTestsByPath api/__tests__/import.test.ts --runInBand
npm run typecheck
git add api/import.ts api/__tests__/import.test.ts vercel.json
git commit -m "feat: serve safe read-only import pages on Vercel" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 7: Activate final-domain associations and native links

**Files:** `scripts/generate-app-links.mjs`,
`public/.well-known/apple-app-site-association`,
`public/.well-known/assetlinks.json`, `app.json`, `vercel.json`,
`api/__tests__/appLinks.test.ts`, `app/__tests__/native-intent.test.ts`,
`hooks/__tests__/useImportLink.test.ts`.

**Gate:** Do not execute this task until domain ownership, final host selection
and actual distribution signing inputs are verified. Native builds and domain
attachment/deployment still require their own explicit permission.
If unavailable, deliver the existing-host checkpoint and record this task
as blocked. Never commit fake identifiers to make the task look complete.

- [ ] **Step 1: Obtain public association inputs from distribution evidence.**

Use the Apple `application-identifier` entitlement from the approved signed
app/artifact, not a guessed Team ID concatenated with the bundle identifier.
The value is public association data, not a credential. For a maintainer-
identified local signed app, the read-only commands are:

```bash
codesign -d --entitlements - "$IOS_DISTRIBUTION_APP" > "$IOS_ENTITLEMENTS_PLIST"
plutil -extract application-identifier raw -o - "$IOS_ENTITLEMENTS_PLIST"
```

`IOS_DISTRIBUTION_APP` and `IOS_ENTITLEMENTS_PLIST` must be resolved exact
artifact/session paths before running; request them if no verified artifact
record supplies them. Do not search or print signing passwords or private keys.

Recheck the Android distributed APK with the installed Android SDK's
`apksigner verify --print-certs` against the release record. If store signing
is introduced later, use its actual distribution certificate too, not only
the upload key. No Google Play signing is assumed for today's GitHub APK.

- [ ] **Step 2: Add generator tests, then the complete guarded generator.**

Tests spawn this script with a temporary output directory and synthetic
public IDs. Invalid/missing Apple ID, certificate or domain must exit nonzero
and write no association files. Valid inputs must produce both JSON shapes.

`api/__tests__/appLinks.test.ts`:

```ts
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync}
    from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const appleID = "ABCDEFGHIJ.com.hessius.xbrwplusplus";
const valid = {
    XBRW_ASSOCIATION_DOMAIN: "xbrw.app",
    XBRW_IOS_APPLICATION_IDENTIFIER: appleID,
    XBRW_ANDROID_CERT_SHA256: "a".repeat(64)
};
function generated(input: Record<string, string>, check: (directory: string, status: number | null) => void) {
    const directory = mkdtempSync(join(tmpdir(), "xbrw-app-links-"));
    try {
        const result = spawnSync(process.execPath,
            [resolve("scripts/generate-app-links.mjs"), directory], {
                encoding: "utf8", env: {...process.env, ...valid, ...input}
            });
        if (result.error) throw result.error;
        check(directory, result.status);
    } finally {
        for (const name of ["apple-app-site-association", "assetlinks.json"]) {
            const file = join(directory, name);
            if (existsSync(file)) unlinkSync(file);
        }
        rmdirSync(directory);
    }
}
it.each<Record<string, string>>([
    {XBRW_ASSOCIATION_DOMAIN: ""},
    {XBRW_ASSOCIATION_DOMAIN: "not-owned.example"},
    {XBRW_IOS_APPLICATION_IDENTIFIER: ""},
    {XBRW_IOS_APPLICATION_IDENTIFIER: "bad"},
    {XBRW_ANDROID_CERT_SHA256: ""},
    {XBRW_ANDROID_CERT_SHA256: "bad"}
])("rejects missing/invalid public inputs: %j", input => {
    generated(input, (directory, status) => {
        expect(status).not.toBe(0);
        expect(readdirSync(directory)).toEqual([]);
    });
});
it("writes exact import-only association JSON", () => {
    generated({}, (directory, status) => {
        expect(status).toBe(0);
        const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
        expect(read("apple-app-site-association")).toEqual({
            applinks: {apps: [], details: [{appID: appleID, paths: ["/import", "/import/"]}]}
        });
        expect(read("assetlinks.json")).toEqual([{
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app", package_name: "com.hessius.xbrwplusplus",
                sha256_cert_fingerprints: [Array(32).fill("AA").join(":")]
            }
        }]);
    });
});
```

`scripts/generate-app-links.mjs`:

```js
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

const appID = process.env.XBRW_IOS_APPLICATION_IDENTIFIER;
const domain = process.env.XBRW_ASSOCIATION_DOMAIN;
const rawCerts = process.env.XBRW_ANDROID_CERT_SHA256;
if (domain !== "xbrw.app") throw new Error("Verify and approve xbrw.app ownership first");
if (!appID || !/^[A-Z0-9]{10}\.com\.hessius\.xbrwplusplus$/.test(appID)) {
    throw new Error("A verified distribution application-identifier is required");
}
if (!rawCerts) throw new Error("Verified distribution certificates are required");
const certs = rawCerts.split(",").map(value => {
    const hex = value.trim().replace(/:/g, "").toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hex)) throw new Error("Invalid SHA-256 certificate");
    return Array.from({length: 32}, (_, index) => hex.slice(index * 2, index * 2 + 2))
        .join(":");
});
const directory = resolve(process.argv[2] ?? "public/.well-known");
const apple = {applinks: {apps: [], details: [
    {appID, paths: ["/import", "/import/"]}
]}};
const android = [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {namespace: "android_app", package_name: "com.hessius.xbrwplusplus",
        sha256_cert_fingerprints: [...new Set(certs)]}
}];
mkdirSync(directory, {recursive: true});
writeFileSync(resolve(directory, "apple-app-site-association"),
    JSON.stringify(apple, null, 2) + "\n");
writeFileSync(resolve(directory, "assetlinks.json"),
    JSON.stringify(android, null, 2) + "\n");
```

Set the required public input variables from the verified evidence, then run
`node scripts/generate-app-links.mjs`. This is a local generation command,
not a production build hook that would break unrelated feed/mint previews.
Do not add an App Clip declaration.

- [ ] **Step 3: Add exact JSON response headers.**

Merge into `vercel.json` without replacing rewrites:

```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{"key": "Content-Type", "value": "application/json"}]
    },
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [{"key": "Content-Type", "value": "application/json"}]
    }
  ]
}
```

No redirects, suffix `.json` on the Apple filename, wildcard app identifier,
or broad `/*` path claim.

- [ ] **Step 4: Add native configuration only after the host gate.**

Use `apply_patch` to add these members to the existing platform objects:

```json
{
  "ios": {
    "associatedDomains": ["applinks:xbrw.app"]
  },
  "android": {
    "intentFilters": [
      {
        "action": "VIEW",
        "autoVerify": true,
        "data": [
          {"scheme": "https", "host": "xbrw.app", "path": "/import"},
          {"scheme": "https", "host": "xbrw.app", "path": "/import/"}
        ],
        "category": ["BROWSABLE", "DEFAULT"]
      }
    ]
  }
}
```

These snippets are merged into `expo.ios` and `expo.android`; do not replace
bundle IDs, permissions, schemes or other existing fields. The installed Expo
config type supports exact `path`. Preserve fingerprint runtime policy.
Do not manually edit generated native trees or start a build/prebuild here.

- [ ] **Step 5: Prove existing HTTPS delivery without an app route.**

Extend `native-intent.test.ts`:

```ts
it.each([true, false])("claims a verified import path, initial=%s", initial => {
    const url = fullImportURL();
    url.hostname = "xbrw.app";
    expect(redirectSystemPath({path: url.toString(), initial})).toBeNull();
});
```

Extend the existing hook tests so both `getInitialURL()` and the URL event
deliver the same parsed full-metadata link through `useImportLink`. A repeated
intent remains retryable; one OS echo must not create two imports. Keep the
current library screen echo guard and dedup behavior, not a new `app/import`
screen.

Add this to `hooks/__tests__/useImportLink.test.ts`, importing
`fullImportURL` from the shared fixture:

```ts
it.each(["cold", "warm"])("delivers full HTTPS metadata: %s", async mode => {
    const url = fullImportURL();
    url.hostname = "xbrw.app";
    const onLink = jest.fn();
    if (mode === "cold") initial.mockResolvedValue(url.toString());
    await renderHook(() => useImportLink(onLink));
    await act(async () => {
        if (mode === "warm") listener?.({url: url.toString()});
    });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({
        recipeName: "Producer's morning recipe",
        coffee: expect.objectContaining({
            name: "Bag coffee", roaster: "Example Roastery",
            imageUrl: "https://images.example.test/bag.jpg", restDays: 0,
            decaffeinated: false
        })
    }), url.toString());
});
```

Assert the generated association app ID/package/certificates and exact paths;
assert native schemes remain `["xbrecipewriter", "xbrw"]`. Run:

```bash
npx --no-install jest --runTestsByPath \
  api/__tests__/appLinks.test.ts app/__tests__/native-intent.test.ts \
  hooks/__tests__/useImportLink.test.ts --runInBand
npm run typecheck
git add scripts/generate-app-links.mjs public/.well-known app.json vercel.json \
  api/__tests__/appLinks.test.ts app/__tests__/native-intent.test.ts \
  hooks/__tests__/useImportLink.test.ts
git commit -m "feat: configure verified recipe import links" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Physical signed-build acceptance is Task 9, not something these tests prove.

## Task 8: Documentation and existing-host acceptance

**Files:** `docs/url-scheme.md`, `docs/roaster-guide.md`,
`docs/roaster-feed.md` after B integration,
`docs/machine-integration/share-deploy.md`,
`docs/release-2.2.0-testing.md`, `.github/copilot-instructions.md`.

- [x] **Step 1: Update directly related documentation.**

Replace the URL guide's old "no HTTPS entry point" statement only for the
capability actually delivered at this checkpoint. Browser fallback works
before native association; do not call the current store binary universally
linked just because HTML was deployed.

Add this construction example with the actual approved host at publication:

```js
const page = new URL("https://xbrwplusplus.vercel.app/import");
page.searchParams.set("v", "1");
page.searchParams.set("source", "your-app");
page.searchParams.set("share", xbloomShareURL);
page.searchParams.set("bean.name", coffeeName);
page.searchParams.set("bean.roaster", roasterName);
page.searchParams.set("bean.image", coffeeImageURL);
```

Here the three named values are caller inputs, not hardcoded example recipes.
Document all parser-supported fields missing from the existing table:
recipe name, flavours, tags, colour, feed and roast guidance/aliases. Explain
bean-name requirements, full visible metadata, Studio default, Original
preservation, separate product/recipe/xBloom destinations and return-after-
install behavior. Public URLs are unsuitable for secrets.

Expand the deployment guide with the new routes, Node adapter, no-store page
versus cached feed, origin configuration, signing/domain/native gates and
read-only smoke procedure. Preserve the mint's irreversible-creation warning.
In the contributor instructions, describe `constants/colors.ts` as the public
app facade and `constants/colourValues.ts` as its canonical pure data source.
Keep the no-literal-colours rule and canonical-identity invariant.

- [x] **Step 2: Prove the server runs outside the app dependency tree.**

Task 8 proof: strict root typecheck passed before the specified transpilation.
Artifact `S/files/import-api-node-smoke-task8` (`S` is the session-state
directory named below) contains the actual compiled adapter/fixtures and a
dependency-free CommonJS boundary. Running there passed real IPv4 HTTP GET,
fixed read-only RecipeDetail lookup, full HTML and all three no-store checks.
The retained `scripts/smoke-import-node.cjs` / `npm run test:import-node`
also asserts native/app packages cannot resolve and no node_modules is loaded.
Evidence: `S/files/import-task8-pretranspile-typecheck.log` and
`S/files/import-task8-node-smoke.log`. This is not a deployment pass.

After strict root typecheck passes, transpile only the API entry and synthetic
fixture into a newly owned session artifact directory:

```bash
npm run typecheck
npx --no-install tsc --ignoreConfig --noCheck \
  --module commonjs --moduleResolution node --ignoreDeprecations 6.0 \
  --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck \
  --rootDir . \
  --outDir /Users/jesperhessius/.copilot/session-state/96519c03-5860-47ba-837c-30d9b0766696/files/import-api-node-smoke \
  api/import.ts test-utils/importPageFixtures.ts
```

This is a transpile-only smoke, not a replacement for strict typechecking.
No repository tsconfig or CI gate is weakened. Type-only imports may cause
extra files to be emitted; the actual API's loaded runtime closure must not
require them or any mobile package.

Use `apply_patch` to add this package boundary in the emitted directory's
`package.json`, without dependencies:

```json
{"private": true, "type": "commonjs"}
```

Run this complete script from the emitted directory with Node:

```js
const assert = require("node:assert/strict");
const {createServer, get} = require("node:http");
const handler = require("./api/import.js").default;
const {importDetail, fullImportURL} = require("./test-utils/importPageFixtures.js");
global.fetch = async input => {
    assert.equal(String(input), "https://client-api.xbloom.com/RecipeDetail.html");
    return new Response(JSON.stringify(importDetail()));
};
const server = createServer((request, response) => {
    void handler(request, response);
});
server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listener");
    const url = fullImportURL();
    get(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => {
            try {
                assert.equal(response.statusCode, 200);
                assert.match(body, /Example Roastery/);
                assert.match(body, /Coffee photo/);
                assert.match(body, /View on xBloom/);
                assert.match(response.headers["cache-control"], /no-store/);
                console.log("PASS: standalone Node adapter, HTML and no-store");
            } finally {
                server.close();
            }
        });
    }).on("error", error => {
        console.error(error.name);
        process.exitCode = 1;
        server.close();
    });
});
```

Expected: PASS without resolving a React Native, Expo, SQLite or
normalize-colors runtime import. Do not "fix" a failure by installing the
mobile dependency tree into the emitted directory.

- [x] **Step 3: Inspect a responsive loopback page, not the brainstorm mockup.**

Parent-owned local real-browser acceptance passed at implementation head
`839e76877aa6cc9b42290bc78791dba0bece716c` against the actual compiled handler,
not the prototype. Evidence: `S/files/import-browser-acceptance/results.json`;
screenshots in primary `.playwright-mcp/import-actual-*.png`. Ordinary widths/
landscape passed stationary above-fold footer, no overflow and final content
reachability; 200% computed-font instrumentation and extreme 320×240 passed
action/content reachability. Focus, complete metadata, distinct photos, real/
broken images and empty image Referer, no-JS iOS/Android downloads, lossless
app query, explicit Original and error pages passed. One read-only real xBloom
lookup passed through compiled `respond`. No Vercel ingress/deployment,
native association, installed-device or hardware qualification is claimed.
The parent owns/stops its loopback server; Metro 8081 remains untouched.

Use the same compiled handler and synthetic fixture in an attached loopback
server. Verify its listener with a real request before using browser tools.
Do not replace or stop develop Metro on port 8081.

Check 320, 390 and 1280 CSS-pixel widths, a short landscape viewport and 200%
text size. Measure:

```js
const footer = document.querySelector(".app-dock");
const main = document.querySelector("main");
const before = footer.getBoundingClientRect();
main.scrollTop = main.scrollHeight;
const after = footer.getBoundingClientRect();
({
  stationary: before.top === after.top,
  aboveFold: before.top >= 0 && before.bottom <= window.innerHeight,
  noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  recipeScrollable: main.scrollHeight > main.clientHeight
});
```

For ordinary viewports, require stationary/aboveFold/noHorizontalOverflow.
At enlarged text, require all actions and final content to remain reachable,
including the action area's extreme-zoom scroll. Check focus/labels manually
and confirm both distinct photos and complete notes are present. Exercise a
broken image and a real public xBloom image once; no imported URL is sent as
its referrer. Inspect app-link hrefs without automatically launching an app.
Save screenshots to the browser tool's allowed artifact location, not Git.

- [x] **Step 4: Run focused checks once, then the repository gates.**

Local Task 8 evidence: affected suites passed 22/22, 774/774 tests on both
platforms. The independent card-oracle characterization (including tea and
grinder-disabled) passed first, 2/2 suites and 172/172 tests. The initial full
run caught the newly added `api/_lib/importLookup.ts` missing from the outbound
inventory (4 assertions across both platforms); the directly related disclosure
and pinned call count were added, with 136/136 inventory tests passing.
After that fix, serial strict typecheck passed, lint passed (0 errors,
33 existing warnings), full Jest passed 940 suites/21,924 tests and both
snapshots (2 suites/26 tests skipped), and Expo Doctor passed 21/21.
Evidence: `S/files/import-task8-focused.log`, `import-task8-oracle.log`,
`import-task8-network-inventory.log`, `import-task8-typecheck-final.log`,
`import-task8-lint-final.log`, `import-task8-full-tests-final.log` and
`import-task8-doctor-final.log`. No remote CI outcome is claimed.

```bash
npx --no-install jest --runTestsByPath \
  library/__tests__/importBoundary.test.ts \
  library/__tests__/xbloomRecipeData.test.ts \
  library/__tests__/brewmindLink.test.ts \
  library/__tests__/importDecoration.test.ts \
  library/__tests__/XBloomRecipe.endpoint.test.ts \
  library/__tests__/XBloomRecipe.bypass.test.ts \
  library/__tests__/XBloomRecipe.temperature.test.ts \
  api/__tests__/importLookup.test.ts api/__tests__/importView.test.ts \
  api/__tests__/importPage.test.ts api/__tests__/import.test.ts --runInBand
npm run typecheck
npm run lint
npm test -- --runInBand
npx --no-install expo-doctor
```

The focused tests and full suite each use both platform projects. Run heavy
suites serially, not beside another full run. Missing Expo Doctor tooling is
a missing-tool failure to resolve under the repository's dependency rules,
not permission to skip the hard CI gate. Do not claim remote CI from local
checks.

- [x] **Step 5: Commit documentation and hand off the checkpoint.**

Task 8 local-only checkpoint includes the directly related independent byte
oracle, retained Node smoke and missing outbound-network disclosure. Parent
owns per-task spec/quality review and any later authorized push. Retain this
owned worktree for that pending review; no PR, merge, deployment, native build,
B integration or worktree cleanup is performed. Exact commit and recovery/
validation pointers are recorded in `S/files/import-task8-handoff.md`.

```bash
git add docs/url-scheme.md docs/roaster-guide.md \
  docs/machine-integration/share-deploy.md docs/release-2.2.0-testing.md \
  .github/copilot-instructions.md
git commit -m "docs: describe full browser imports and hosting gates" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Include `docs/roaster-feed.md` in the commit only if B has been integrated and
its relevant paragraph is actually changed. Record branch/worktree/base/head,
clean/dirty and push state, exact checks, remaining native/domain gates and
artifact pointers. Stop the specific loopback preview when no longer needed.
Never delete other worktrees to tidy up this checkpoint.

## Task 9: Authorized integration, production and device acceptance

This task is an operational checklist with independent permission gates.
It is not a deploy script to run at the end of code implementation.

- [ ] **Step 1: Integrate package B only with explicit permission.**

Recheck the live head/checks before the approved merge:

```bash
gh pr view 281 --json state,headRefOid,mergeStateStatus,statusCheckRollup
```

Expected approved head: `f2855996855a7865bd34528e26ae250f18f858fb`.
If it moved or checks are not green, stop and reconcile. With merge permission:

```bash
gh pr merge 281 --merge \
  --match-head-commit f2855996855a7865bd34528e26ae250f18f858fb
```

Do not run another Copilot round. Account for original #271/#278 only after
integration. Refresh origin without pruning and audit local worktrees; cleanup
still needs verified preservation and exact path/full-head approval.

- [ ] **Step 2: Open/review/merge the hosting task only when authorized.**

Reconcile fresh develop in the owned task branch without rewriting shared
history. Push a coherent checkpoint. If PR creation is approved:

```bash
gh pr create --base develop --head docs/shared-vercel-import-20261026 \
  --title "Add full recipe import pages to the existing Vercel host"
```

Use a short body linking this plan/spec, tested behavior and unclosed native
gates. Request at most one Copilot round, including any automatic review.
Reproduce findings, fix them, and require the existing four CI gates on the
final exact head before a separately approved merge commit. Never infer
permission to close #177 while Task 7/device acceptance remains blocked.

- [ ] **Step 3: Verify the existing project and approved production source.**

After the maintainer authenticates Vercel locally, use read-only inspection:

```bash
vercel project inspect --non-interactive --no-color
```

If the owned worktree is not linked, identify the existing project's exact
name/ID in the authenticated account and obtain target confirmation before
linking. Do not create a new project or copy credentials into Git.
Record its Git production branch and deployment settings.

Choose the approved clean source commit explicitly. If Git production is
main, either obtain approved release promotion or explicit exact-source CLI
deployment permission; do not silently point production at develop.
Deployment permission is not permission to promote main or change settings.
Keep no-op dependency installation and the existing mint secret values.

- [ ] **Step 4: Perform the separately approved deployment, then verify reads.**

Run the deployment only from the recorded exact clean source and confirmed
existing project. After it completes, verify these real public routes:

```bash
curl --fail --silent --show-error -D - \
  https://xbrwplusplus.vercel.app/api/feeds/xbloom
node scripts/check-feed.mjs https://xbrwplusplus.vercel.app/api/feeds/xbloom
curl --silent --show-error -D - \
  https://xbrwplusplus.vercel.app/api/share
curl --fail --silent --show-error -D - \
  'https://xbrwplusplus.vercel.app/import?v=1&share=XB0001'
```

Expected: feed 200 accepted by the real validator with both models; mint GET
405 without any new recipe; HTML 200 with real recipe/metadata and no-store.
The successful feed must retain
`public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400`;
failed/empty feeds remain uncached errors, not replacement empty catalogues.
Use a valid current public share link with full fixture-style decorations too.
Verify actual rewrites retain the complete nested query, HEAD has no body,
and two decorated same-ID links cannot cross-contaminate via CDN headers.
Do not run a mint POST as a routing smoke.

`check-feed.mjs` takes that positional URL, fetches with the app's Accept
header and invokes the actual feed parser under the iOS Jest project.

- [ ] **Step 5: Attach/verify the owned domain with separate approval.**

Only after purchase and target confirmation, attach `xbrw.app` to this same
project and verify DNS/TLS. Set the approved public origin without removing
the old host. Repeat the read-only import/feed checks on the domain.
If Task 7 is included, request the two well-known URLs without following
redirects. Require 200/application-json and correct signed app identities,
exact import paths and certificates. Never advertise links on an unowned or
unverified hostname.

- [ ] **Step 6: Build and qualify native association with separate permission.**

Load the current eas-app-stores skill before production build/submission
commands. Use the existing fingerprint policy/profiles and record source,
runtime and artifact. For any local iOS device build, use the iPhone 17 Pro
(device name `iPhone14`), not the iPhone 13 mini.

Physical iOS and Android matrix:

| State | Required result |
| --- | --- |
| No app installed | HTTPS opens the full browser page with visible actions and all metadata. |
| Supported signed app installed, cold | Verified link delivers one import with complete metadata. |
| Supported signed app installed, warm | One import; no unmatched route or duplicate editor. |
| Browser kept open after installation | Explicit Open app delivers the preserved full query. |
| Old installed binary | Browser/custom-scheme fallback remains useful; do not claim native associations it lacks. |
| Existing edited library recipe | User's values remain; only the current fill-blank behavior applies. |
| Original shared recipe | Correct machine context and original grind numbers, never a Studio conversion. |

Opening/importing must not start a brew, mint, subscribe on the website or
write NFC. Do not use a real coffee dose or card to test a read-only link.
If the domain/native build is not ready, record the gate as open rather than
marking #177 complete.

- [ ] **Step 7: Enable the already-built feed only after real endpoint acceptance.**

With the approved app build/update configuration, set:

```text
EXPO_PUBLIC_XBLOOM_FEED_URL=https://xbrwplusplus.vercel.app/api/feeds/xbloom
```

Use the custom-domain equivalent only after that host is verified. Check the
Settings built-in entry stays default-off, opt-in performs its first fetch,
turning it off survives relaunch, and machine-compatible variants are chosen.
No new Home screen feature or automatic seed is part of this task.

- [ ] **Step 8: Final preservation and reporting.**

Fetch `origin --no-prune` and run `npm run worktrees:check`.
Record exact worktree/branch/base/head, push/dirty state, the approved deployed
source and URL, native artifacts/signing evidence, physical results and
remaining gates. Preserve valuable ignored/loose work. Delete only exact
approved, backed-up and owner-idle worktree/ref rows; a merged PR or gone
upstream is not deletion permission.

## Plan self-review and execution boundary

The planning self-review covered each spec section, the complete metadata
table, current source paths, cross-task types and response/error policies.
No source implementation or planned acceptance result is claimed here.

Before executing, read this plan and the approved spec in full. File paths,
function signatures and test selections are normative; preserve the existing
source algorithms identified for mechanical moves rather than replacing them
with approximations.

Coverage map: full metadata and lossless URL -> Tasks 1/4/5; shared app
normalization -> Task 2; bounded read-only requests -> Task 3; HTML/Node/cache
and real routes -> Tasks 5/6/8; feed reuse/enablement -> Task 9; owned domain,
association/signing and native builds -> Tasks 7/9; documentation and regression
gates -> Task 8. No production work is authorized by completing the plan.
