# Roaster Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate reviewed roaster catalogues through Import and add saved-recipe roaster shelves, without putting unsaved catalogue content on home.

**Architecture:** Adapt additive catalogue code from pinned contributor heads, retaining accepted develop's importer and Settings. Roaster identity stays in recipe JSON and its rebuildable SQL index. Import shortcuts are explicit subscription choices, independent of shelf membership.

**Tech Stack:** Expo 57, React Native 0.86, React 19, Tamagui, TypeScript, expo-sqlite, dual-platform Jest/RNTL and the real node:sqlite test harness. No new dependency or native configuration is required.

---

## Execution contract

Work only in `/Users/jesperhessius/Dev/XBRW-220-roaster-import-20261021`,
branch `feat/2.2.0-roaster-import-20261021`, based on
`4aa7c02d226c1900efb453ab63529172c1801ea7`.
Read `AGENTS.md`, `.github/copilot-instructions.md` and the approved
`docs/superpowers/specs/2026-10-21-roaster-import-design.md`.

Source heads:

```text
237 27535f8b72fd30febe51d07f7bd2cbd20bf63980
240 25672dfab641116521be313aa650ab788f869994
245 d306e9c22aa54bf803ec0fb07fc1cea5d3055395
```

Do not use preview HEAD as a code donor: it also contains unaccepted bag,
date-picker and other package work. Original PRs already had a Copilot round.
The newly authorized focused PR gets at most one, counting automatic reviews.
No merge, release build, deployment or cleanup is authorized.

Commit each coherent checkpoint with the required Copilot trailer. Retain
contributor attribution in imported changes and record source SHAs.

## File responsibilities and isolation

| Unit | Files |
| --- | --- |
| Catalogue and feeds | Additive `library/roaster*.ts`, `library/importRefresh.ts`, `library/fitName.ts`, `library/coffeeLabels.ts`, catalogue/subscription routes, their fixtures and tests from #237 |
| Catalogue presentation | Additive `components/CatalogueParts.tsx`, `FadingRail.tsx`, `RoasterCoffeeRow.tsx`, offer/replacement/shelf/unsubscribe sheets; narrowly extend existing headers |
| Import orchestration | `hooks/useRecipeImport.ts`, `useRoasterOffer.ts`, `useRoasterSubscriptions.ts`, `components/ImportSheet.tsx`, `app/index.tsx` |
| Choice policy | New `library/roasterImport.ts`; adapt subscription `pinnedAt`, sync choice mutation and management controls from #240; no home strip/search modules |
| Recipe metadata | `library/brewmindLink.ts`, `podCoffee.ts`, `importDecoration.ts`, `roasterFeed.ts`, `roasterRecipes.ts`, `importRefresh.ts` |
| Saved-library identity | New `library/roasterIdentity.ts`; existing `recipeIndex.ts`, `libraryFilters.ts`, `hiddenShelves.ts`, `RecipeDatabase.ts`, `shelves.ts`, `hooks/useRecipeLibrary.ts` |
| Shelf presentation | `components/ShelfTile.tsx`, `ShelfPhotoMark.tsx`, `ShelfMark.tsx`, `library/shelfCover.ts`, home shelf/count wiring |
| Shared settings/lifecycle | `library/Settings.ts`, `app/settings.tsx`, `app/_layout.tsx`, `constants/network.ts`; new minute/foreground catalogue clock hook |
| Documentation | Existing roaster publishing/feed guides, copy/network inventory and 2.2.0 release/testing docs |

The catalogue/import unit and the saved-library/shelf unit can be developed
independently with bounded file ownership. They share `app/index.tsx`; integrate
that file serially. Domain shelf work must not edit the importer or catalogue
files while the catalogue unit owns them.

## Task 1: Extract the pinned catalogue foundation

**Files:** New files in #237's diff; existing Settings/defaults/backup snapshot,
headers, route registration, network inventory and publisher documentation.

- [ ] **Step 1: Record the source delta and additive-file inventory.**

Run from the owned worktree:

```bash
git diff --name-status 4aa7c02d226c1900efb453ab63529172c1801ea7...27535f8b72fd30febe51d07f7bd2cbd20bf63980
git diff --diff-filter=A --name-only 4aa7c02d226c1900efb453ab63529172c1801ea7...27535f8b72fd30febe51d07f7bd2cbd20bf63980
```

Exclude all preview-only dependencies and bag files. Do not restore modified
files wholesale, especially Settings, headers, home, importer or recipe DB.

- [ ] **Step 2: Replay the additive source files with Git.**

```bash
git diff --diff-filter=A --name-only -z \
  4aa7c02d226c1900efb453ab63529172c1801ea7...27535f8b72fd30febe51d07f7bd2cbd20bf63980 |
  xargs -0 git restore --source=27535f8b72fd30febe51d07f7bd2cbd20bf63980 --worktree --
```

These files are source replays, not handwritten substitutes for the reviewed
implementation. Inspect their imports against accepted develop. Apply only
required additive changes to existing shared files using the source diff.
Add feed settings and their existing backup exclusions/snapshot entries;
register catalogue routes and foreground syncing without changing native config.
Keep Settings' approved machine-first layout and header action.

- [ ] **Step 3: Run the new domain suites to identify actual integration gaps.**

```bash
npx jest --runTestsByPath library/__tests__/roasterFeed.test.ts library/__tests__/roasterCatalogue.test.ts library/__tests__/roasterSync.test.ts library/__tests__/importRefresh.test.ts
npm run typecheck
```

If the fresh worktree reports missing Jest/dependencies, run `npm ci` once and
rerun. Do not change package versions to satisfy an unrelated preview dependency.

- [ ] **Step 4: Resolve imports and shared API mismatches, then rerun.**

Retain accepted `ScreenHeader` action wrapping; add only required count,
subtitle/title-size support. Keep all palette values centralized. Preserve
Settings snapshot exhaustiveness and mark catalogue caches as non-backup data.
Source additions remain unaccepted until targeted suites pass.

- [ ] **Step 5: Commit the coherent catalogue foundation and source provenance.**

## Task 2: Add explicit Import choices and the approved sheet

**Files:** `library/roasterImport.ts`, `roasterSubscription.ts`, `roasterSync.ts`,
`hooks/useRoasterSubscriptions.ts`, `components/ImportSheet.tsx`,
subscription management routes and their tests.

- [ ] **Step 1: Add failing tests for choice ordering and the three-row cap.**

Use the existing `RoasterSubscription` shape and source test factories:

```ts
import {selectedImportRoasters} from "@/library/roasterImport";
import type {RoasterSubscription} from "@/library/roasterSubscription";

function sub(name: string, pinnedAt?: number): RoasterSubscription {
    return {
        feed: `https://example.com/${name}.json`, roaster: name,
        lastSync: 0, lastAttempt: 0, paused: false, pinnedAt
    };
}

it("shows chosen roasters in selection order and caps old data at three", () => {
    const a = sub("A", 30), b = sub("B"), c = sub("C", 10);
    const d = sub("D", 20), e = sub("E", 40);
    expect(selectedImportRoasters([a, b, c, d, e]).map(item => item.roaster))
        .toEqual(["C", "D", "A"]);
    expect(selectedImportRoasters([sub("A"), sub("B")])).toEqual([]);
});
```

Run `npx jest --runTestsByPath library/__tests__/roasterImport.test.ts`.
Expected failure: the new module is absent.

- [ ] **Step 2: Implement the pure selection policy.**

```ts
import type {RoasterSubscription} from "./roasterSubscription";

export const IMPORT_ROASTER_LIMIT = 3;

export function selectedImportRoasters(
    subscriptions: readonly RoasterSubscription[]
): RoasterSubscription[] {
    return subscriptions
        .filter(sub => sub.pinnedAt !== undefined && sub.pinnedAt > 0)
        .sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))
        .slice(0, IMPORT_ROASTER_LIMIT);
}
```

Validate `pinnedAt` through existing subscription parsing.
The user-facing mutation refuses a fourth new choice with a visible message,
leaves existing data intact, and uses monotonic selection timestamps so equal
clock readings cannot reorder choices. Removing a choice remains allowed.

- [ ] **Step 3: Add component regressions before changing Import.**

Assert native Paste still uses `PasteOverlay`, plain opening does not call
`TextInput.prototype.focus`, field tapping remains available, three chosen
roasters and All roasters appear only while idle, and unchosen subscriptions
never appear as shortcuts. With none chosen, All roasters remains reachable.
Pressing a source closes the sheet before pushing the correct route.

Run `npx jest --runTestsByPath components/__tests__/ImportSheet.test.tsx app/__tests__/subscriptions.test.tsx`.
Expected failures: old focus, layout/copy and missing choices.

- [ ] **Step 4: Adapt the sheet and management controls.**

Keep `PasteOverlay` intact, place its face beside a flexing input, and give the
Paste control a minimum 44 pt target. Keep hook intent-specific failure focus;
make plain initial/reset focus false. Use explicit Show in Import controls,
selected rows in timestamp order and the existing route for All roasters.
Do not import `RoasterStrip`, `RoasterSearchRow`, `roasterHome` or
`useHomeRoasters`. Rename the hub entry and heading to the approved copy.
Use scrolling content rather than a fixed height.

- [ ] **Step 5: Rerun the tests, typecheck and commit.**

## Task 3: Preserve safe imports and capture roaster metadata

**Files:** `hooks/useRecipeImport.ts`, `library/roasterFeed.ts`,
`roasterRecipes.ts`, `importDecoration.ts`, `importRefresh.ts`,
`brewmindLink.ts`, `podCoffee.ts`, related tests and offer wiring in home.

- [ ] **Step 1: Add failing regressions for mutation timing and feed fallback.**

Cover deliberate typing reaching a replacement or blank-fill preview with zero
save calls and an unchanged held recipe. `openFound` performs the staged save;
a throwing save keeps the held object unchanged and exposes storage retry.
Add feed fixtures with a top-level roaster and no bean roaster, plus a conflicting
explicit coffee roaster and a recipe already carrying a roaster.

```ts
expect(held.coffee?.roaster).toBe("My roaster");
expect(save).not.toHaveBeenCalled();
expect(result.current.state.status).toBe("found");
```

Run the existing import hook, reimport, decoration and roaster recipe suites.

- [ ] **Step 2: Integrate author-version handling without replacing the hook.**

Extend accepted develop's staged importer with `planReimport`, retaining
`onSaveExisting`, the storage error reason and fill-only-blank decoration.
Store a pending deliberate action alongside its found preview; clear it on
every edit, reset, newer generation and error. Only `openFound` commits that
action. Whole-input flows retain their existing navigation semantics.

Stage catalogue existing-recipe updates as copies too: save first, then apply
to the held object. Preserve corrected original-author fingerprints. Feed offers
are associated with the current import generation and disarmed on cancellation,
replacement and failure.

- [ ] **Step 3: Add contextual metadata fallback at the fetch/decorate boundary.**

Pass the enclosing validated roaster name when fetching a catalogue coffee.
Resolve new-candidate roaster as explicit coffee value, then valid recipe
import value, then enclosing feed fallback. Existing saved nonblank values
remain protected by `fillImportBlanks`. The saved JSON, not a subscription,
must carry the result.

Bring in #245's valid colour parser/nearest-accent mapping as an additive
extension of accepted decoration, preserving recipeName, pictures and blank-fill
semantics. Do not take its unrelated removal of accepted shelf photo queries.
Keep ordinary duplicate colour assignment unless the reviewed implementation
has explicit evidence that a colour is coffee-owned.

- [ ] **Step 4: Fix retained catalogue age readings.**

Add `hooks/useCatalogueNow.ts`, a clock read on mount, once per minute and on
foreground activation, with timer/listener cleanup and injected-clock tests.
Use it where source code captured a mount-time `now` for relative timestamps.
This is a status clock, not an animation; do not add a brew-chart timer.

- [ ] **Step 5: Run import/feed/catalogue regressions and commit.**

## Task 4: Add SQL-backed saved-roaster identity

**Files:** `library/roasterIdentity.ts`, `recipeIndex.ts`, `RecipeDatabase.ts`,
`libraryFilters.ts`, `hiddenShelves.ts`, `shelves.ts`,
`hooks/useRecipeLibrary.ts`, home shelf wiring and SQL tests.

- [ ] **Step 1: Write failing key, resolver and real-SQLite tests.**

```ts
expect(roasterKey(" CAFÉ ")).toBe(roasterKey("cafe\u0301"));
expect(roasterKey("Acme")).not.toBe(roasterKey("Acme Coffee"));
expect(resolveLibraryFilter("roaster:CAFÉ"))
    .toEqual({where: "roasterKey = ?", params: ["café"]});
```

Use `createTestDatabase()` from `test-utils/sqlite.ts`, inject it into
RecipeDatabase using existing SQL-suite conventions, insert recipes with
`coffee.roaster`, and assert grouped counts, filtered UUIDs and shelf members.
Test schema rebuild from existing JSON and bound hostile names.

- [ ] **Step 2: Implement the canonical key and index columns.**

```ts
export function roasterKey(name: string): string {
    return name.trim().normalize("NFC").toLowerCase();
}
```

Add `roaster` display and indexed `roasterKey` projections derived from
`coffee.roaster`, with NULL for missing/blank metadata. Update the index golden
tests and revision as required. Group with:

```sql
SELECT MIN(roaster) AS roaster, COUNT(*) AS count FROM recipes
WHERE roasterKey IS NOT NULL
GROUP BY roasterKey ORDER BY count DESC, roasterKey ASC;
```

Expose `countRecipesByRoaster(): {roaster: string; count: number}[]`.

- [ ] **Step 3: Wire the namespace through every saved-library surface.**

Add `roasterFilterId`/`roasterFromFilterId`, a bound `roasterKey = ?` resolver,
`asLibraryFilters`, `filterLabel` and canonical hidden-shelf identities.
Extend `buildShelves` with `roasterCounts` and route them through
`availableFilters`; keep the usual applied-filter exemption. Extend the
library store/hook to read counts on the same revision and include roaster IDs
in shelf mark reads. Pass whole-library counts into home shelf construction
and rail counts, not the current visible result length.

- [ ] **Step 4: Cover boundaries, hiding, copy and backup.**

Assert 2/3 members, exactly 80%/over 80%, active shelf passthrough, Unicode
case changes, blank metadata, unsubscribe independence and existing recipe
hydration. Exercise opened list, counts and member queries with the same ID.
Round-trip recipe metadata through copy and backup/restore.

- [ ] **Step 5: Run the identity/index/filter/shelf/query/hook suites and commit.**

## Task 5: Add mixed-photo roaster marks and initial fallback

**Files:** `library/shelfCover.ts`, `components/ShelfPhotoMark.tsx`,
`ShelfMark.tsx`, `ShelfTile.tsx`, `hooks/useRecipeLibrary.ts`,
`RecipeDatabase.shelfPhotoMembers` and their tests.

- [ ] **Step 1: Add failing rendering and query tests.**

Test 0/1/2/3/4 usable photos, a pictured member beyond the first three,
photos disabled, individual/all image failures, repeated URLs on distinct
UUIDs and unchanged 44 pt geometry. Assert a roaster initial with no photos.
Retain existing stock four-photo threshold tests unchanged.

- [ ] **Step 2: Separate cover policy without broadening other shelves.**

Recognize `roaster:` as mixed-photo eligible. Fetch at most four photographed
saved members through the same resolver, then fill spare cover positions with
ordinary member accents. Do not scan/hydrate the whole shelf.
Keep stock eligibility and its full-four-photo rule unchanged.

Expose a specific roaster mark/initial input rather than passing a brand name
as a `DotIconName`. Use `DotMatrixText` within the existing square. Preserve
the same accent/inversion contrast and accessible shelf name/count.

- [ ] **Step 3: Make failed photos use the correct fallback.**

Track failed image URLs with the existing image error callback. Mixed mode
uses an accent for a failed cell, and the initial when all photos fail.
Full-stock mode retains its existing whole-mark fallback. A failed old URL
must not poison a new URI or a different mounted shelf.

- [ ] **Step 4: Rerun cover/mark/tile/grid and library regressions; commit.**

## Task 6: Validate integration and document the accepted adaptation

**Files:** `app/index.tsx` and its tests, catalogue/subscription tests,
`docs/copy.md`, `docs/roaster-feed.md`, `docs/roaster-guide.md`,
`docs/release-2.2.0-changes.md`, `docs/release-2.2.0-testing.md`.

- [ ] **Step 1: Integrate shared home wiring serially.**

Keep only saved recipe search/list/empty states. Wire catalogue offers and
Import choices without importing source #240's home-strip/search/empty-library
promotion. Assert the absence of unsaved results even with followed feeds.

- [ ] **Step 2: Run targeted tests together, then all required gates.**

```bash
npm run typecheck
npm run lint
npm test -- --ci
npx expo-doctor
npm run test:worktrees
```

Run heavy suites serially; do not contend with another session's device client.
Fix introduced failures rather than weakening tests. Preserve existing
warnings explicitly instead of claiming a warning-free baseline.

- [ ] **Step 3: Check native presentation when an appropriate existing client is available.**

Exercise Import idle, selected rows, native paste, scrolling/large text,
catalogue return and shelf art. Do not rebuild native code or deploy without
authorization. Record a runtime mismatch or unavailable client as a gap;
browser sketches and Jest are not device proof.

- [ ] **Step 4: Update copy, feed fallback/choice guidance and release/testing docs.**

Document the Import-only discovery boundary, selected-only cap, roaster metadata
inheritance, saved-only shelves and photo exception. Link #261 as non-blocking
and keep #253 separate. No analytics, new home promotions or native changes.

- [ ] **Step 5: Self-review the final diff against every spec acceptance case and commit.**

## Task 7: Publish one focused PR and finish ready to merge

- [ ] **Step 1: Push the authorized task branch and open a PR targeting develop.**

Describe the adaptation and source PRs briefly. Include the agreed design and
remaining physical/native limitations. Do not close source PRs or merge them
before the focused integration is approved.

- [ ] **Step 2: Check automatic Copilot activity before requesting a review.**

If the new PR already has an automatic Copilot round, use it. Otherwise request
one. Inspect all findings and implement justified fixes with regressions;
do not trigger a second round on the new PR or original PRs.

- [ ] **Step 3: Wait for final-head CI and resolve implemented findings.**

Verify the exact pushed head has green typecheck/lint, both Jest projects and
Expo Doctor. Recheck original contributor heads for intervening commits and
record any residual changes rather than silently losing them.

- [ ] **Step 4: Update #249 and record a complete handoff.**

Fetch `origin --no-prune`, run `npm run worktrees:check`, and record exact
base/head/branch/worktree, cleanliness, push state, review/CI evidence and gaps.
Retain this owned worktree for pending merge and the cumulative preview for
remaining evaluation work; do not remove other sessions' worktrees.
Stop ready to merge. No merge or cumulative integration is implied by green CI.
