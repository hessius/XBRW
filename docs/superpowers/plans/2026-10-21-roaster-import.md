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

- [x] **Step 1: Record the source delta and additive-file inventory.**

Run from the owned worktree:

```bash
git diff --name-status 4aa7c02d226c1900efb453ab63529172c1801ea7...27535f8b72fd30febe51d07f7bd2cbd20bf63980
git diff --diff-filter=A --name-only 4aa7c02d226c1900efb453ab63529172c1801ea7...27535f8b72fd30febe51d07f7bd2cbd20bf63980
```

Exclude all preview-only dependencies and bag files. Do not restore modified
files wholesale, especially Settings, headers, home, importer or recipe DB.

- [x] **Step 2: Replay the additive source files with Git.**

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

- [x] **Step 3: Run the new domain suites to identify actual integration gaps.**

```bash
npx jest --runTestsByPath library/__tests__/roasterFeed.test.ts library/__tests__/roasterCatalogue.test.ts library/__tests__/roasterSync.test.ts library/__tests__/importRefresh.test.ts
npm run typecheck
```

If the fresh worktree reports missing Jest/dependencies, run `npm ci` once and
rerun. Do not change package versions to satisfy an unrelated preview dependency.

- [x] **Step 4: Resolve imports and shared API mismatches, then rerun.**

Retain accepted `ScreenHeader` action wrapping; add only required count,
subtitle/title-size support. Keep all palette values centralized. Preserve
Settings snapshot exhaustiveness and mark catalogue caches as non-backup data.
Source additions remain unaccepted until targeted suites pass.

- [x] **Step 5: Commit the coherent catalogue foundation and source provenance.**

### Task 1 integration record

The additive catalogue foundation is replayed from #237 at
`27535f8b72fd30febe51d07f7bd2cbd20bf63980`, with surgical shared APIs.
Accepted `fitName` files already existed and were retained. The donor's
`useRecipeImport.reimport` hook test is deferred with Task 3 rather than making
the accepted importer depend on an unintegrated API. No #240 home promotion,
#245 database-copy changes, native configuration or dependencies are included.

Foreground syncing has one root-owned hook, not a home-screen effect. Import
offer wiring must not add a second foreground owner. Backups carry choices and
fingerprints but exclude catalogue/alert caches; restored subscriptions reset
sync timestamps while preserving pause. The feed checker pipes fetched bodies
through stdin instead of writing downloads to a temporary directory. Currency
fixtures explicitly select an Australian locale instead of depending on the
developer machine's locale.

Self-review: foundation/domain and route suites pass, but this is not production
acceptance of the source flows. Task 3 still owns typed save-before-open, staging
every existing-recipe save, distinguishing storage failures from lookup failures,
the enclosing-feed roaster fallback, and replacing mount-time catalogue age
clocks. The copied catalogue still mutates existing recipes before saving and
its ADD catch still reports storage failures as connectivity failures. The
accepted import hook, `fillImportBlanks`, recipe-name/photo decoration and
machine-first Settings layout are retained. Catalogue stage previews use the
existing ladder without replaying the source's optional plan styling.

Verification: the four required suites pass on iOS and Android (138 tests).
The expanded foundation/shared-surface run passes 50 suites and 990 tests; the
CLI harness is intentionally skipped there on both platforms and passes when
invoked by `npm run check-feed`. Accepted importer/ImportSheet regression
coverage plus the required suites passes 12 suites and 320 tests. Typecheck
and `git diff --check` pass; lint has no errors and 32 warnings. The checker
accepts the 30-coffee sample both as a local file and through its mocked-fetch
stdin path. No native build, live roaster request, NFC or BLE test was attempted.

## Task 2: Add explicit Import choices and the approved sheet

**Files:** `library/roasterImport.ts`, `roasterSubscription.ts`, `roasterSync.ts`,
`hooks/useRoasterSubscriptions.ts`, `components/ImportSheet.tsx`,
subscription management routes and their tests.

- [x] **Step 1: Add failing tests for choice ordering and the three-row cap.**

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

- [x] **Step 2: Implement the pure selection policy.**

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

- [x] **Step 3: Add component regressions before changing Import.**

Assert native Paste still uses `PasteOverlay`, plain opening does not call
`TextInput.prototype.focus`, field tapping remains available, three chosen
roasters and All roasters appear only while idle, and unchosen subscriptions
never appear as shortcuts. With none chosen, All roasters remains reachable.
Pressing a source closes the sheet before pushing the correct route.

Run `npx jest --runTestsByPath components/__tests__/ImportSheet.test.tsx app/__tests__/subscriptions.test.tsx`.
Expected failures: old focus, layout/copy and missing choices.

- [x] **Step 4: Adapt the sheet and management controls.**

Keep `PasteOverlay` intact, place its face beside a flexing input, and give the
Paste control a minimum 44 pt target. Keep hook intent-specific failure focus;
make plain initial/reset focus false. Use explicit Show in Import controls,
selected rows in timestamp order and the existing route for All roasters.
Do not import `RoasterStrip`, `RoasterSearchRow`, `roasterHome` or
`useHomeRoasters`. Rename the hub entry and heading to the approved copy.
Use scrolling content rather than a fixed height.

- [x] **Step 5: Rerun the tests, typecheck and commit.**

### Task 2 integration record

Adapted only #240's subscription pin storage/mutation/control pattern from
`25672dfab641116521be313aa650ab788f869994` (Rhys Evans). Pins now mean
**Show in Import**, never home access. New choices use monotonic timestamps,
refuse a fourth without writing, and never fill vacant slots. Validated legacy
choices survive backup/restore, including extra pins; management exposes each
one. Subscription replacement now preserves list position so a sync cannot
reshuffle equal legacy timestamps.

Import keeps the native `PasteOverlay` next to the flexing input. Plain
open/reset remain keyboard-down; existing share/shortcut failure policies stay
intact. One scrolling body contains idle-only selected roasters, All roasters,
the account and the renamed xBloom catalogue. Cached counts remain absent
until a cache exists. Source navigation closes before pushing. Home and the
accepted catalogue `id:`/`index:` routing fix are unchanged.

Verification: test-first failures were observed for missing choice policy,
management controls, initial focus, catalogue copy and source rows. A separate
red regression caught equal pins reordering after sync. The targeted dual-
platform run passes 22 suites / 1,020 tests (ImportSheet, subscriptions,
roaster catalogue routes/domain, hub, Settings restore, import hook,
choice policy, sync, backup and alerts). Typecheck and whitespace checks pass;
repository lint reports no errors and the existing 32 warnings. Self-review
followed pin parsing through persistence, sync, restore and navigation, and
checked that ImportResult introduces no nested scroll view.

Native clipboard consent, touch/keyboard behaviour, large-font/short-screen
scrolling and gesture interaction still need device verification; Jest is not
evidence of native behaviour. No native/dependency changes, live feed fetch,
NFC/BLE test, push, PR, automated review, merge or deployment was performed.
Task 3 offer/re-import/metadata work and Tasks 4–5 shelves remain unimplemented.

## Task 3: Preserve safe imports and capture roaster metadata

**Files:** `hooks/useRecipeImport.ts`, `library/roasterFeed.ts`,
`roasterRecipes.ts`, `importDecoration.ts`, `importRefresh.ts`,
`brewmindLink.ts`, `podCoffee.ts`, related tests and offer wiring in home.

- [x] **Step 1: Add failing regressions for mutation timing and feed fallback.**

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

- [x] **Step 2: Integrate author-version handling without replacing the hook.**

Extend accepted develop's staged importer with `planReimport`, retaining
`onSaveExisting`, the storage error reason and fill-only-blank decoration.
Store a pending deliberate action alongside its found preview; clear it on
every edit, reset, newer generation and error. Only `openFound` commits that
action. Whole-input flows retain their existing navigation semantics.

Stage catalogue existing-recipe updates as copies too: save first, then apply
to the held object. Preserve corrected original-author fingerprints. Feed offers
are associated with the current import generation and disarmed on cancellation,
replacement and failure.

- [x] **Step 3: Add contextual metadata fallback at the fetch/decorate boundary.**

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

- [x] **Step 4: Fix retained catalogue age readings.**

Add `hooks/useCatalogueNow.ts`, a clock read on mount, once per minute and on
foreground activation, with timer/listener cleanup and injected-clock tests.
Use it where source code captured a mount-time `now` for relative timestamps.
This is a status clock, not an animation; do not add a brew-chart timer.

- [x] **Step 5: Run import/feed/catalogue regressions and commit.**

### Task 3 integration record

Adapted author-refresh and offer behavior from Rhys Evans's #237
`27535f8b72fd30febe51d07f7bd2cbd20bf63980` into the accepted importer, not
the old donor hook. Preserved its author-print comparison (an unchanged author
fingerprint is SAME even when the local brew differs). The cancellation cases
from `82472860b8decc4473c8f114e18555d2bb251f20` are adapted to generation-bound
hook callbacks, covering every lookup, field edit, paste, reset and failure
rather than duplicating disarm calls across home entry points. A successful
handoff clears its interaction without cancelling its own feed follow-up.

Reused #245's strict colour reader and hue-to-existing-palette mapping already
replayed with the foundation, and added its `bean.colour`/`bean.color` link
decoding from `d306e9c22aa54bf803ec0fb07fc1cea5d3055395`. Accepted name/photo
decoration and blank filling remain intact; no RecipeDatabase donor or
coffee-based broadening of ordinary duplicate colour retention is included.
#240 `25672dfab641116521be313aa650ab788f869994` remains the Task 2 choice
foundation, unchanged by this task. No cumulative preview head was used.

Typed blank filling and unedited author replacement now stage at preview,
with no save or held-object mutation until OPEN. Pending actions are bound to
the preview and request generation, consumed once, and discarded on edits,
reset, replacement, error and unmount. Explicit latest/keep choices use the
existing Import sheet; it still owns the field/focus and home coverage.
Every existing write saves a clone before changing the held recipe; without
an existing-save callback, the editor receives an isolated staged copy instead.
A rejected guarded navigation does not follow a feed or remember a new import.

Catalogue same/replace/explicit-latest/shelf writes also stage copies first.
Failed saves preserve held JSON and fingerprints, leave their controls
actionable and show storage-specific feedback rather than network copy.
New saves remember nothing on failure. Metadata adoption fills blanks only.
The fetch API takes an explicit enclosing feed roaster; precedence is coffee,
valid underlying recipe import, then feed. Saved roaster metadata survives
recipe copies and backup JSON independently of a subscription. Cancelled
contexts do not decorate or save; feed/size changes invalidate pending choices.

Home remains saved-only. Its only new catalogue surface is the post-import
subscription offer, covered by the existing screen-reader guard; replacement
choices remain inside the already-covered Import sheet. Opt-outs and pause
remain authoritative. Failed feed follow-ups have explicit, non-server-text
feedback and never undo an imported recipe. Root-owned foreground syncing is
still the only foreground sync owner, and never imports saved recipes.

`useCatalogueNow` refreshes relative status every minute and on foreground,
with an injected clock and timer/listener cleanup. Retained roaster list,
roaster detail, subscriptions and subscription detail use it. No brew animation
clock, dependency or native configuration changed.

Demonstrated red regressions before their fixes: early typed writes,
failed catalogue writes mutating held objects, missing contextual metadata,
frozen catalogue age, absent offer/prompt/colour integration, blocked or
obsolete offers, misleading storage feedback, dropped-navigation follow-ups,
no-save-callback mutation, obsolete catalogue action saves and revived author
choices after size changes. Tests additionally cover rapid/stale opens,
out-of-order responses, encoded shares, whole-library accent assignment,
author-print preservation, user metadata and backup survival.

Final verification: the focused hook/reimport/decoration/link/coffee/feed/
catalogue/offer/alerts/subscriptions/home matrix passes **40 suites, 1,226
tests**, both platforms, with four existing skipped home tests. Typecheck and
`git diff --check` pass. Lint has zero errors and 32 warnings (the same count
as the accepted checkpoint). The home harness emits non-failing timer-overflow
warnings. No heavy full suite, native build, live network, NFC or BLE test was
performed. No push, PR or automated review was requested; controller publication
and the eventual focused PR's single review/check gate remain pending.

Self-review: audited write-before-mutation ordering, preview/generation
invalidation, callback/offer cancellation, a11y coverage, feed context,
palette retention, and unchanged machine/HTTP/envelope/publication limits.
Tasks 4–5's SQL identity, roaster shelves and artwork remain untouched.
Task worktree remains owned by the Task 3/controller session for publication
and the subsequent tasks; its local branch checkpoint is the recovery pointer,
not a claimed remote backup.

## Task 4: Add SQL-backed saved-roaster identity

**Files:** `library/roasterIdentity.ts`, `recipeIndex.ts`, `RecipeDatabase.ts`,
`libraryFilters.ts`, `hiddenShelves.ts`, `shelves.ts`,
`hooks/useRecipeLibrary.ts`, home shelf wiring and SQL tests.

- [x] **Step 1: Write failing key, resolver and real-SQLite tests.**

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

- [x] **Step 2: Implement the canonical key and index columns.**

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

- [x] **Step 3: Wire the namespace through saved-library domain surfaces.**

Add `roasterFilterId`/`roasterFromFilterId`, a bound `roasterKey = ?` resolver,
`asLibraryFilters`, `filterLabel` and canonical hidden-shelf identities.
Extend `buildShelves` with `roasterCounts` and route them through
`availableFilters`; keep the usual applied-filter exemption. Extend the
library store/hook to read counts on the same revision and include roaster IDs
in shelf mark reads.

- [ ] **Controller Task 6: Pass whole-library counts into home shelf construction.**

`app/index.tsx` remains controller-owned during Task 3 review. Add
`roasterCounts: library.roasterCounts,` to its existing `buildShelves` input,
beside `authorCounts`. Applied non-stock chips already use the shared resolver
and label; do not add unsaved roaster rows or a home discovery strip.

- [x] **Step 4: Cover boundaries, hiding, copy and backup.**

Assert 2/3 members, exactly 80%/over 80%, active shelf passthrough, Unicode
case changes, blank metadata, unsubscribe independence and existing recipe
hydration. Exercise opened list, counts and member queries with the same ID.
Round-trip recipe metadata through copy and backup/restore.

- [x] **Step 5: Run the identity/index/filter/shelf/query/hook suites and commit.**

### Task 4 implementation record

- Owned worktree: `/Users/jesperhessius/Dev/XBRW-220-roaster-import-20261021`;
  branch `feat/2.2.0-roaster-import-20261021`.
- Accepted base: `4aa7c02d226c1900efb453ab63529172c1801ea7`;
  starting checkpoint: `5372223eadce34056966fab68742f70bfd04e101`.
  Controller's concurrent Task 3 guard fix
  `bc4e429988bc0b09283ca456d5b9ff4860c100c9` touched only its importer/home
  paths and became the implementation parent. Task 4 implementation checkpoint:
  `c9ecf98a18afbf76dbcd6e97445491a8163533d3`.
- TDD red: identity/index/filter/hiding/shelf selection failed on both platforms
  (10 suites; 20 failed assertions, 312 passing; missing identity module).
  The subsequent real-SQL/hook red run failed 6 suites with 16 failed assertions,
  126 passing (missing count method/namespace and hook output).
- Final focused green: 13 selected files, both Jest platforms, `--runInBand`:
  **26 suites / 736 tests passed**. Files cover identity, index descriptors,
  filters, hidden shelves, shelves, query, RecipeDatabase core/index/migration/
  unreadable/roaster SQL and both library hook suites.
- `npm run typecheck`, changed-file ESLint, repository `npm run lint` and
  `git diff --check` passed. Repository lint retains 32 warnings outside the
  owned changes, with zero errors. No full-suite or native build was run.
- Index revision is 6, hash `ac06759b`. Old blob-only and stale indexed databases
  backfill roaster identity without rewriting recipe JSON. Real SQL tests pin
  count/query/member agreement, bound hostile names, all saved source variants,
  missing metadata, canonical Unicode, copy and backup restore; raw card restore
  bytes remain unchanged.
- Roaster reads use whole-table SQL and the library revision. Missing store
  support throws rather than silently reporting empty membership. Fallback art
  uses the shared resolver and existing member policy; stock photo lookup and
  roaster artwork remain untouched for Task 5.
- File manifest:
  `library/roasterIdentity.ts`,
  `library/recipeIndex.ts`,
  `library/RecipeDatabase.ts`,
  `library/libraryFilters.ts`,
  `library/hiddenShelves.ts`,
  `library/shelves.ts`,
  `hooks/useRecipeLibrary.ts`,
  `library/__tests__/roasterIdentity.test.ts`,
  `library/__tests__/recipeIndex.test.ts`,
  `library/__tests__/RecipeDatabase.roaster.test.ts`,
  `library/__tests__/libraryFilters.test.ts`,
  `library/__tests__/hiddenShelves.test.ts`,
  `library/__tests__/shelves.test.ts`,
  `hooks/__tests__/useRecipeLibrary.test.ts`,
  `hooks/__tests__/useRecipeLibrary.realDb.test.ts`,
  and this plan's Task 4 section only.
- Preservation: coherent local commit containing this record, retained under the
  controller's ownership for Tasks 5–6 and eventual authorized publication.
  No push, PR, review request, merge, deployment or cleanup performed.
  Home integration is intentionally pending above. No physical-device, native,
  NFC or BLE qualification is claimed.
- Task 4 review follow-up: seed missing applied roaster identities with count 0
  before suppression, retaining the active shelf after its final member is
  deleted or relabelled. Canonical matching avoids duplicate Unicode/case
  spellings and preserves a live representative's real count. Regression red:
  6 failures across both platforms; focused shelf green: 2 suites / 66 tests.
  Changed-file ESLint and `git diff --check` passed; no heavy tests run.

## Task 5: Add mixed-photo roaster marks and initial fallback

**Files:** `library/shelfCover.ts`, `components/ShelfPhotoMark.tsx`,
`ShelfMark.tsx`, `ShelfTile.tsx`, `hooks/useRecipeLibrary.ts`,
`RecipeDatabase.shelfPhotoMembers` and their tests.

- [x] **Step 1: Add failing rendering and query tests.**

Test 0/1/2/3/4 usable photos, a pictured member beyond the first three,
photos disabled, individual/all image failures, repeated URLs on distinct
UUIDs and unchanged 44 pt geometry. Assert a roaster initial with no photos.
Retain existing stock four-photo threshold tests unchanged.

- [x] **Step 2: Separate cover policy without broadening other shelves.**

Recognize `roaster:` as mixed-photo eligible. Fetch at most four photographed
saved members through the same resolver, then fill spare cover positions with
ordinary member accents. Do not scan/hydrate the whole shelf.
Keep stock eligibility and its full-four-photo rule unchanged.

Expose a specific roaster mark/initial input rather than passing a brand name
as a `DotIconName`. Use `DotMatrixText` within the existing square. Preserve
the same accent/inversion contrast and accessible shelf name/count.

- [x] **Step 3: Make failed photos use the correct fallback.**

Track failed image URLs with the existing image error callback. Mixed mode
uses an accent for a failed cell, and the initial when all photos fail.
Full-stock mode retains its existing whole-mark fallback. A failed old URL
must not poison a new URI or a different mounted shelf.

- [x] **Step 4: Rerun cover/mark/tile/grid and library regressions; commit.**

### Task 5 implementation evidence (2026-10-21)

- Red before green: new `RoasterShelfPhoto` and
  `RecipeDatabase.roasterCover` tests failed on both platforms with the
  unchanged implementation (missing initial, no mixed photos, no roaster
  photo query). Existing stock four-photo tests were left unchanged.
- Roaster cover lookup uses the same saved `roasterKey` resolver as counts
  and opening the shelf. Each photo query has `LIMIT 7` (four members plus
  the existing three-row unreadable allowance), hydrates at most those
  candidates and returns at most four photos. Four bounded ordinary members
  supply actual-member accents for spare cells; the ordinary glyph mark
  still takes three accents. No whole-library/shelf hydration or feed,
  subscription, import, index-column or namespace changes.
- Distinct UUIDs sharing a URL retain separate cells. Roaster photos never
  expand to fill the mark or repeat into spare cells, including for one
  member. Partial failures leave accent cells; all failures restore the
  initial. Failure state is URL-local and shelf-local, and replacement URLs
  retry. Stock whole-cover failure and manual/tag cover behavior remain.
- `ShelfMark.roasterInitial` renders an explicit initial, not a brand icon.
  ASCII letters/digits use `DotMatrixText`; non-ASCII initials use the existing
  text font fallback. NFC names, leading digits, empty active shelves, accent
  inversion, accessible shelf/count labels and 44 pt geometry are covered.
  Existing `withShelfPhotos` preference gating strips cover data without
  losing the accents needed by the initial.
- Final serial regression run: **24 suites / 558 tests passed**, iOS and
  Android, covering `shelfCover`, database stock/roaster/roaster-cover SQL,
  `ShelfPhotoMark`, `RoasterShelfPhoto`, `ShelfMark`, `RecipeShelfTile`,
  `RecipeShelfTilePhoto`, `ShelfGrid` and both library-hook suites.
  `npm run typecheck`, changed-file ESLint and `git diff --check` passed.
  This is not a full-suite or repository-wide warning-free claim; existing
  warnings were not changed. Startup read-only worktree audit completed.
- Owned manifest: `library/shelfCover.ts`, `library/RecipeDatabase.ts`,
  `library/__tests__/shelfCover.test.ts`,
  `library/__tests__/RecipeDatabase.roasterCover.test.ts`,
  `components/ShelfMark.tsx`, `components/ShelfPhotoMark.tsx`,
  `components/ShelfTile.tsx`, `components/__tests__/ShelfGrid.test.tsx`,
  `components/__tests__/RoasterShelfPhoto.test.tsx`,
  `hooks/useRecipeLibrary.ts`, `hooks/__tests__/useRecipeLibrary.test.ts`,
  `hooks/__tests__/useRecipeLibrary.realDb.test.ts`, and this Task 5 section.
- Preserved as a coherent local-only checkpoint in the controller-owned
  `/Users/jesperhessius/Dev/XBRW-220-roaster-import-20261021` worktree on
  `feat/2.2.0-roaster-import-20261021` (pinned develop base
  `4aa7c02d226c1900efb453ab63529172c1801ea7`).
  Concurrent controller app/import/docs edits were not staged or modified.
  Task 6 integration and independent acceptance remain with the controller.
  No push, PR/review, merge, dependency/native change, build, deployment,
  cleanup or hardware qualification performed.

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
