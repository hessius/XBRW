# Recipe Picture Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task by task. Use superpowers:subagent-driven-development only if the maintainer explicitly chooses delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preview's all-or-nothing pictures with the approved circular, placement-specific treatment without sacrificing recipe information.

**Architecture:** Keep preferences in `Settings`, membership queries in `RecipeDatabase`, and layout in existing components. Pass bounded, corresponding member records into cover art. The approved follow-up below supersedes the original automatic-glyph-only and list-rail steps. Native layout measurements decide whether optional card photos fit, with pure arithmetic separated from measurement state.

**Tech Stack:** Expo SDK 57, React Native 0.86, React Compiler, Tamagui, expo-sqlite, Jest iOS/Android projects, async React Native Testing Library.

---

## Implemented follow-up (2026-10-20)

The maintainer explicitly revised two placements after the initial implementation:

- Only `xbloom`, `favourites`, `pods`, `mostBrewed`, `recentlyAdded` may use four
  photographed actual members, including copies sharing one coffee/pod image.
  Their separate bounded SQL query selects recipes in stable name/UUID order;
  no visible-query data or author portrait is used. Three pictured members or previews OFF keep
  the glyph and inversion. Personal/tag first-four mixed covers are unchanged.
- Home list photos now use 20 pt circles beside bottom-row brew evidence,
  with the actual card accent behind the circle and no shaded bottom strip. Keep
  the original 200x56 graph and corner position, permitting decorative overlap.
  Remove the 36 pt rail, 60 pt shift, silhouette and name-width gates.
  Current bottom-row/figures/evidence measurements omit crowded or large-text
  decoration before controls/text; long names retain photos when metadata fits.

The 2026-10-21 correction counts photographed recipes, not distinct image URLs,
and removes the unintended full-width bottom wash. Compact-card images start
loading before metadata measurements, remaining invisible and outside row flow
until there is room; the same native image is revealed without remounting.

The original implementation steps below are historical, not instructions to
restore the superseded policy. Preferences, migration/backup behavior, compact
card appearance, Ready to brew, editor and ABOUT remain unchanged. Native layout checks
remain unverified; no production/native build is part of this follow-up.

## Approved contract and execution boundaries

Read [the approved specification](../specs/2026-10-20-recipe-picture-placement-design.md)
before executing. Its written review was approved on 2026-10-20.

Planning is not permission to merge PRs, start a production build, deploy, or
implement the deferred wrong-recipe hypothesis (#251). Do not change #243
colours. Magenta ON switches are already accepted.

This plan belongs to the ongoing, owned cumulative-preview task:

```text
worktree: /Users/jesperhessius/Dev/XBRW-220-preview-20261019
branch: chore/2.2.0-preview-20261019
pinned develop base: 7108d0c3ad2563014de18dfa9879994942716eea
approved spec commit: ad41cd2236402cbd630b68e464673d38589616cc
```

Do not create a new task from this branch or apply preview-only patches directly
to develop. If resuming outside this ongoing task, follow `AGENTS.md` and ask
how the cumulative work should be carried into the newly pinned develop task.

At execution startup, fetch `origin --no-prune`, run
`npm run worktrees:check`, inspect status/upstream and confirm this session still
owns the preview. Stop on conflicting ownership or unexpected source changes.
Read any applicable `AGENTS.md` before edits.

Run every red/green command from the preview worktree. A new export can first
fail TypeScript/import resolution; after declaring its signature, establish a
behavioural failure before implementing the passing body. Never claim a failed
test run against the implementation before executing it.

## File map

| File | Responsibility |
| --- | --- |
| `library/Settings.ts` | Two new boolean defaults; one-time legacy shelf-preference initialization |
| New `library/pictureSettings.ts` | Pure legacy/new backup preference precedence |
| `app/settings.tsx` | Three scoped rows, setting hooks, snapshot and restore wiring |
| New `library/shelfCover.ts` | Cover-member type, independent four-member cap and cell selection |
| `library/RecipeDatabase.ts` | Bounded stable membership ordering; no photos-only cover query |
| `hooks/useRecipeLibrary.ts` | Corresponding member records, revision-driven and query-independent |
| `components/ShelfPhotoMark.tsx` | Circular photo cells, accents and keyed failure handling |
| `components/ShelfTile.tsx` | Automatic glyph versus personal/tag cover, using actual count |
| `components/RecipeHero.tsx`, `app/editRecipe.tsx` | Remove header image and photo-specific geometry |
| `components/RecipePhoto.tsx` | Reuse whole-product fitting within circular frames |
| New `components/RecipeTileMetadata.tsx` | Extract existing badge row for visible and non-accessible intrinsic measurement |
| New `library/recipePictureLayout.ts` | Exact fit and rectangle-intersection arithmetic |
| `components/RecipeShelfTile.tsx` | Full-width name; conditional 20 pt metadata photo |
| `components/RecipeCard.tsx` | Right-centred conditional 36 pt photo |
| `components/ReadyToBrewCard.tsx` | Conditional 36 pt circle, independent controls |
| `app/index.tsx` | Card setting to all card consumers; shelf setting to cover data |
| Existing tests plus named new tests below | Behaviour, SQL, native measurement events, accessibility and restore regression coverage |
| `docs/release-2.2.0-changes.md`, `docs/release-2.2.0-testing.md`, `docs/copy.md` | Changed design, software evidence, unchecked native cases and settings copy |

Do not restructure routes or the entire metadata system. The new metadata
component is justified only by rendering the same status content for intrinsic
measurement without duplicating badge logic.

## Task 1: Scoped preferences and compatible backup restore

**Files:** `library/Settings.ts`, new `library/pictureSettings.ts`,
`app/settings.tsx`, `library/__tests__/Settings.test.ts`,
new `library/__tests__/pictureSettings.test.ts`,
`library/__tests__/backup.test.ts`, `app/__tests__/settings.test.tsx`.

- [ ] **1. Add failing default/upgrade tests using existing `fakeStorage`.**

```ts
it.each<[Record<string, string>, boolean, boolean]>([
    [{}, false, true],
    [{showRecipeAvatars: "false"}, false, false],
    [{showRecipeAvatars: "true"}, false, true],
    [{showRecipeAvatars: "false", showShelfPhotoPreviews: "true"}, false, true]
])("separates card and shelf choices for %j", (seed, cards, shelves) => {
    const settings = new Settings(fakeStorage(seed));
    expect(settings.get("showRecipeCardPhotos")).toBe(cards);
    expect(settings.get("showShelfPhotoPreviews")).toBe(shelves);
});

it("changing ABOUT later does not change the initialized shelf preference", () => {
    const storage = fakeStorage({showRecipeAvatars: "false"});
    const settings = new Settings(storage);
    settings.set("showRecipeAvatars", true);
    expect(settings.get("showShelfPhotoPreviews")).toBe(false);
    settings.set("showShelfPhotoPreviews", true);
    expect(new Settings(storage).get("showShelfPhotoPreviews")).toBe(true);
});
```

- [ ] **2. Run the Settings tests and establish the red behaviour.**

```sh
npx jest --runTestsByPath library/__tests__/Settings.test.ts --watch=false
```

- [x] **3. Add the defaults and initialize only a missing shelf key.**

Replace the old broad picture comment with an ABOUT-only description. Keep
`showRecipeAvatars: true` and add:

```ts
showRecipeCardPhotos: false,
showShelfPhotoPreviews: true,
```

After assigning `this.storage` in the constructor:

```ts
if (this.storage.read("showShelfPhotoPreviews") === null) {
    this.storage.write(
        "showShelfPhotoPreviews",
        JSON.stringify(this.get("showRecipeAvatars"))
    );
}
```

This materializes the legacy choice once, before subscription. Do not make
shelf previews dynamically follow ABOUT forever. Existing typed reads continue
to reject malformed stored values.

- [ ] **4. Add red backup-precedence tests before adding this pure helper.**

Use `toEqual` on each complete result: `{}` stays `{}`; legacy false produces
three false values; legacy true produces ABOUT true, cards false, shelves true;
an explicit new value wins; invalid new values behave as absent.

The helper's complete contract is:

```ts
export type PicturePreferences = Partial<Record<
    "showRecipeAvatars" | "showRecipeCardPhotos" | "showShelfPhotoPreviews",
    boolean
>>;

export function pictureSettingsFromBackup(
    incoming: Record<string, unknown>
): PicturePreferences {
    const result: PicturePreferences = {};
    if (typeof incoming.showRecipeAvatars === "boolean") {
        result.showRecipeAvatars = incoming.showRecipeAvatars;
        result.showRecipeCardPhotos = false;
        result.showShelfPhotoPreviews = incoming.showRecipeAvatars;
    }
    if (typeof incoming.showRecipeCardPhotos === "boolean") {
        result.showRecipeCardPhotos = incoming.showRecipeCardPhotos;
    }
    if (typeof incoming.showShelfPhotoPreviews === "boolean") {
        result.showShelfPhotoPreviews = incoming.showShelfPhotoPreviews;
    }
    return result;
}
```

- [x] **5. Wire settings and restore in the same checkpoint so typecheck stays valid.**

Bind both new keys with `useSetting(key, settings)` and include both in
`settingsSnapshot()`'s existing typed object. At the beginning of
`applySettings`, obtain:

```ts
const pictures = pictureSettingsFromBackup(incoming);
if (pictures.showRecipeAvatars !== undefined) {
    setShowRecipeAvatars(pictures.showRecipeAvatars);
}
if (pictures.showRecipeCardPhotos !== undefined) {
    setShowRecipeCardPhotos(pictures.showRecipeCardPhotos);
}
if (pictures.showShelfPhotoPreviews !== undefined) {
    setShowShelfPhotoPreviews(pictures.showShelfPhotoPreviews);
}
```

Replace, rather than retain, the old direct ABOUT restore block. Add the rows:

```tsx
<SettingsToggleRow label="Recipe card photos"
    description="Show coffee or pod photos on recipe cards and Ready to brew."
    value={showRecipeCardPhotos} onChange={setShowRecipeCardPhotos}/>
<SettingsToggleRow label="Shelf photo previews"
    description="Show coffee photos in your own shelves and tag shelves."
    value={showShelfPhotoPreviews} onChange={setShowShelfPhotoPreviews}/>
<SettingsToggleRow label="Pictures in ABOUT"
    description="Show coffee, pod and author pictures in recipe details."
    value={showRecipeAvatars} onChange={setShowRecipeAvatars}/>
```

Use the existing restore-screen test harness to restore legacy false onto a
store whose new keys are true, and legacy true onto a store whose card key is
true. Assert the resulting settings, not just the helper call. Assert a backup
with all three explicit keys preserves their independent values. Extend the
existing export test to inspect both new values; do not bump `BACKUP_VERSION`.

- [x] **6. Run the focused group and typecheck, then commit only these paths.**

```sh
npx jest --runTestsByPath library/__tests__/Settings.test.ts library/__tests__/pictureSettings.test.ts library/__tests__/backup.test.ts app/__tests__/settings.test.tsx --watch=false
npm run typecheck
git add library/Settings.ts library/pictureSettings.ts app/settings.tsx library/__tests__/Settings.test.ts library/__tests__/pictureSettings.test.ts library/__tests__/backup.test.ts app/__tests__/settings.test.tsx
git commit -m "feat: separate recipe card and shelf picture preferences" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Actual-member shelf covers and automatic glyphs

**Files:** new `library/shelfCover.ts`, `library/RecipeDatabase.ts`,
`hooks/useRecipeLibrary.ts`, `components/ShelfPhotoMark.tsx`,
`components/ShelfTile.tsx`, new `library/__tests__/shelfCover.test.ts`,
new `library/__tests__/RecipeDatabase.shelfCovers.test.ts`,
`hooks/__tests__/useRecipeLibrary.test.ts`,
`components/__tests__/ShelfPhotoMark.test.tsx`,
`components/__tests__/ShelfGrid.test.tsx`,
`library/__tests__/RecipeDatabase.unreadable.test.ts`,
`library/__tests__/RecipeDatabase.test.ts`, `app/__tests__/index.test.tsx`.

- [ ] **1. Add failing pure cover tests, then implement the cell model.**

Required cases: five actual members with only the fifth pictured; one pictured
among three; two members with the same URL; one actual member; failed-photo
retention at component level. Use this complete selector after observing red:

```ts
export const COVER_MEMBERS = 4;

export type ShelfCoverMember = {
    uuid: string;
    accent: string;
    imageURL?: string;
};

export function coverCells(
    members: readonly ShelfCoverMember[], count: number
): ShelfCoverMember[] {
    const selected = members.slice(0, COVER_MEMBERS);
    if (selected.length === 0 || count === 0) return [];
    const seen = new Set<string>();
    const length = count === 1 ? 1 : COVER_MEMBERS;
    return Array.from({length}, (_, index) => {
        const member = selected[index % selected.length];
        const imageURL = index < selected.length
            && member.imageURL
            && !seen.has(member.imageURL) ? member.imageURL : undefined;
        if (imageURL !== undefined) seen.add(imageURL);
        return {uuid: member.uuid, accent: member.accent, imageURL};
    });
}
```

Example assertion:

```ts
const members = [
    {uuid: "a", accent: "a", imageURL: "https://example.com/coffee.jpg"},
    {uuid: "b", accent: "b"},
    {uuid: "c", accent: "c", imageURL: "https://example.com/coffee.jpg"}
];
const cells = coverCells(members, 3);
expect(cells).toHaveLength(4);
expect(cells.filter(cell => cell.imageURL !== undefined)).toHaveLength(1);
expect(cells.map(cell => cell.accent)).toEqual(["a", "b", "c", "a"]);
```

- [x] **2. Establish actual SQL ordering with the real database harness.**

Copy the `createTestDatabase`/`mockBacking` import setup from
`RecipeDatabase.unreadable.test.ts`, not the array-matching SQL mock.
Insert five recipes named Alpha through Echo using `insertRecipe`, each tagged
with `setTags(["photos"])`; only Echo has an image. Query:

```ts
const members = db.shelfMembers(["tag:photos"], resolveLibraryFilter, 4);
expect(members["tag:photos"].map(recipe => recipe.name))
    .toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
expect(members["tag:photos"].some(recipe => recipe.imageURL)).toBe(false);
```

Add equal-name recipes with UUIDs `"a"` and `"b"` inserted in reverse order and
assert `"a"` precedes `"b"`. Change the existing shelf-members SQL ordering to
`ORDER BY sortName ASC, uuid ASC`; retain parameter binding, the SQL cap and
`UNREADABLE_ALLOWANCE`/hydration guard. Do not add a schema.

- [x] **3. Replace independent photo arrays with corresponding members.**

Change `ShelfMarkMembers` to:

```ts
export type ShelfMarkMembers = {
    accents: string[];
    coverMembers?: ShelfCoverMember[];
};
```

In `readShelfMarks`, partition parsed IDs by `id.startsWith("tag:")`. Read tag
IDs with `COVER_MEMBERS`, automatic IDs with unchanged `MARK_MEMBERS`, through
the existing optional `shelfMembers` seam. Build each result with:

```ts
{
    accents: recipes.slice(0, MARK_MEMBERS).map(resolveAccent),
    ...(id.startsWith("tag:") ? {
        coverMembers: recipes.map(recipe => ({
            uuid: recipe.uuid,
            accent: resolveAccent(recipe),
            imageURL: recipe.imageURL
        }))
    } : {})
}
```

Keep this on `revision`, outside the rail query. Remove the unused
`shelfPhotos` query/seam and its obsolete tests once all callers are removed.
Do not replace it with whole-library hydration. The optional seam still lets
simple stores return no shelf artwork.

Remove the `RecipeDatabase.shelfPhotos` block from
`library/__tests__/RecipeDatabase.test.ts`; its photos-only behaviour is
deliberately replaced by the new real-SQL tests, not retained as an API.
In `app/__tests__/index.test.tsx`, replace the fake store's `shelfPhotos` with
`shelfMembers(ids, resolver, perShelf = 3)`: use its existing tag/tea membership
selection, sort by name then UUID, and return bounded Recipe arrays including
unpictured members. This keeps the screen fixture faithful to the new seam.

- [ ] **4. Update cover rendering and its adapter, then establish component red/green.**

`ShelfPhotoMark` takes `members`, `count`, and `fallback`; compute
`coverCells(members, count)`. For multiple recipes each cell is
`(MARK_SIZE - 2) / 2`; its background is that member's accent. Render the photo
with `RecipePhoto`, `radius={cell / 2}`, and an inset small enough to retain the
colour field. Use index plus UUID as the React key for repeated accent cells.
The single-member circle may use `MARK_SIZE`.

Keep the grid mounted while `RecipePhoto` keys each failure by URL, so the accent
cell remains if all images fail instead of the cover collapsing. When no selected member has
an eligible URL initially, render `fallback`.

Replace `withShelfPhotos`'s stripping of `photos` with stripping of
`coverMembers`; keep `accents`. In `ShelfTile`, automatic shelves render
`ShelfMark` directly. Only personal/tag shelves may render:

```tsx
<ShelfPhotoMark members={members?.coverMembers ?? []}
    count={shelf.count} fallback={fallbackMark}/>
```

`fallbackMark` is the existing `<ShelfMark kind={shelf.kind}
glyph={shelfGlyph(shelf.id)} accents={members?.accents} inverted={inverted}/>`
element. Do not add another mark or photo badge to automatic tiles.

Replace tests that deliberately pinned a sole photo filling a multi-recipe
cover or repeated photos. Test a five-recipe shelf with one selected photo:
one circular image, four colour cells, unchanged 44 pt outer frame.
Fire `"error"` on that image and assert four cells remain. Test changed URLs
retry. Assert automatic tiles keep their existing glyph even if their supplied
member data contains images, with inversion on and off.

- [x] **5. Run the complete shelf group, typecheck, then commit.**

```sh
npx jest --runTestsByPath library/__tests__/shelfCover.test.ts library/__tests__/RecipeDatabase.shelfCovers.test.ts library/__tests__/RecipeDatabase.unreadable.test.ts library/__tests__/RecipeDatabase.test.ts hooks/__tests__/useRecipeLibrary.test.ts components/__tests__/ShelfPhotoMark.test.tsx components/__tests__/ShelfMark.test.tsx components/__tests__/ShelfGrid.test.tsx app/__tests__/index.test.tsx --watch=false
npm run typecheck
git add library/shelfCover.ts library/RecipeDatabase.ts hooks/useRecipeLibrary.ts components/ShelfPhotoMark.tsx components/ShelfTile.tsx library/__tests__/shelfCover.test.ts library/__tests__/RecipeDatabase.shelfCovers.test.ts library/__tests__/RecipeDatabase.unreadable.test.ts library/__tests__/RecipeDatabase.test.ts hooks/__tests__/useRecipeLibrary.test.ts components/__tests__/ShelfPhotoMark.test.tsx components/__tests__/ShelfGrid.test.tsx app/__tests__/index.test.tsx
git commit -m "fix: compose shelf photos from actual members" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Restore the photo-free editor header

**Files:** `components/RecipeHero.tsx`, `app/editRecipe.tsx`,
`components/__tests__/RecipeHero.test.tsx`,
`components/__tests__/DetailPhoto.test.tsx`, `app/__tests__/editRecipe.test.tsx`.

- [x] **1. Replace photo-acceptance tests with the approved absence assertion.**

Render a pictured recipe through the existing editor harness. Assert no
`hero-photo`, no `hero-photo-button`, and no header PhotoViewer. Open ABOUT
and assert the existing coffee/pod image remains with ABOUT pictures enabled.
Keep existing author-picture, rename, long-name and collapse assertions.

- [ ] **2. Run the editor/hero group and observe the expected failures.**

```sh
npx jest --runTestsByPath components/__tests__/RecipeHero.test.tsx components/__tests__/DetailPhoto.test.tsx app/__tests__/editRecipe.test.tsx --watch=false
```

- [x] **3. Remove only photo-specific header code.**

Drop `imageURL`/`showPicture` from `RecipeHero` props and call sites, `picture`
and viewing state, `RecipePhoto`/`PhotoViewer` imports and rendering, photo
constants and photo-only split-title branches. Call:

```ts
const nameLayout = heroNameLayout(name, width, fontScale, {pours});
```

Reduce `heroNameLayout` to its existing non-photo path: preserve `plain`,
`fitted`, word-fit tests, font steps and `bandReserve`'s non-photo calculation.
Remove the `photo` option, `photoSize` result and optional `photoFoot` parameter
once no caller uses them. Do not rewrite long-name fitting.

In `heroFoldAway`, preserve the non-photo calculation and remove its photo
argument. In the editor:

```ts
heroFoldAway(recipe?.displayName() ?? "")
```

The `AboutDeck showAvatar={showRecipeAvatars}` binding stays unchanged.
Remove only the now-unused photo-only parts of `DetailPhoto.test.tsx`; retain
tests for shared `PhotoViewer`/`RecipePhoto` functionality used elsewhere.

- [ ] **4. Rerun the same tests, typecheck, then commit these five paths.**

```sh
npx jest --runTestsByPath components/__tests__/RecipeHero.test.tsx components/__tests__/DetailPhoto.test.tsx app/__tests__/editRecipe.test.tsx --watch=false
npm run typecheck
git add components/RecipeHero.tsx app/editRecipe.tsx components/__tests__/RecipeHero.test.tsx components/__tests__/DetailPhoto.test.tsx app/__tests__/editRecipe.test.tsx
git commit -m "fix: keep recipe photos out of the editor header" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Exact fit arithmetic and compact-card metadata photos

**Files:** new `library/recipePictureLayout.ts`,
new `library/__tests__/recipePictureLayout.test.ts`,
new `components/RecipeTileMetadata.tsx`,
new `components/__tests__/RecipeTileMetadata.test.tsx`,
`components/RecipeShelfTile.tsx`,
`components/__tests__/RecipeShelfTilePhoto.test.tsx`,
`components/__tests__/RecipePhoto.test.tsx`.

- [ ] **1. Write boundary tests, then implement measured fit arithmetic.**

The metadata measurement includes existing gaps but excludes the photo and
the extra photo gap. Test that `74 + 6 + 20` fits exactly in `100`, not `99`,
and that missing readings return false.

```ts
export const CARD_PHOTO_SIZE = 36;
export const TILE_PHOTO_SIZE = 20;
export const PHOTO_GAP = 6;

export function metadataPhotoFits(
    available: number | undefined, content: number | undefined
): boolean {
    return available !== undefined && content !== undefined
        && available > 0 && content >= 0
        && Math.ceil(content + PHOTO_GAP + TILE_PHOTO_SIZE)
            <= Math.floor(available);
}

export type Rect = {x: number; y: number; width: number; height: number};

export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}
```

Add rectangle tests for clear, touching-edge, overlapping and contained shapes.
Use actual layout rectangles in Task 5; do not compare font sizes as a proxy.

- [x] **2. Extract the metadata content, preserving all existing badge behaviour.**

Move the existing badges from `recipe-tile-badges` into the module-scope
`RecipeTileMetadata` component. Pass already-derived primitive strings and
flags, not the mutable `Recipe` object: evidence, slot, bag, freshness, star,
beverage marker, editing and the action callback.

Have it accept `measurement: boolean`; in measurement mode omit the flex spacer,
use `flexShrink={0}` for intrinsic badge content, omit test IDs and action
handlers, and hide it from accessibility. In visible mode preserve the spacer,
wrapping, action hit areas and existing test IDs.

The measuring host uses horizontal `ScrollView` content-size measurement so
the natural row is not constrained to the tile width:

```tsx
<ScrollView horizontal scrollEnabled={false} pointerEvents="none"
    accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    testID="recipe-tile-metadata-measure"
    style={{position: "absolute", height: 0, opacity: 0}}
    onContentSizeChange={(width) => setMeasured({signature, width})}>
    <RecipeTileMetadata {...metadata} measurement/>
</ScrollView>
```

Keep the native measuring host mounted only while pictures are requested and a
non-empty image URL exists. The host is not a second actionable badge row.
Test the native `"contentSizeChange"` event using RNTL and verify it is absent
when photos are off.

- [x] **3. Key layout readings by what was measured, not an effect.**

Store intrinsic readings with a signature built from the derived badge values,
font scale and editing state. Store available width with its layout context.
Use readings only when their signatures still match the current render. This
handles a different recipe, changed badges, resize and font-scale changes
without `setState` in an effect. Do not serialize the whole mutable recipe.

Until measurements are current, omit the optional photo. Render the eligible
circle at the beginning of `recipe-tile-badges`, with:

```tsx
<RecipePhoto testID="recipe-tile-photo" uri={picture}
    size={TILE_PHOTO_SIZE} radius={TILE_PHOTO_SIZE / 2}
    backing={onAccent.key}/>
```

Remove the old leading photo column and `TILE_PHOTO_GAP` reservation beside
the name. Keep the name outside the metadata row and full-width; preserve the
existing text-first profile-room measurement and fixed tile-height contract.

- [x] **4. Exercise native measurement events and all degradation cases.**

Update the old top-left photo test to assert the photo is inside
`recipe-tile-badges`, not beside the name. Drive available width through
`"layout"` and intrinsic width through `"contentSizeChange"`. Assert a 20 pt
circular frame fits at the exact threshold and disappears one point below it.
The title keeps two lines, figures remain, and the existing badges survive.

Test a changed signature discards old measurements before the next native
event; a new image after failure retries; switching photos off removes the
measurement host; a failed photo keeps the name and action semantics.
Use `includeHiddenElements` only for decorative images, not to treat the
measurement copy as accessible content.

- [x] **5. Run the compact group, typecheck and targeted lint, then commit.**

```sh
npx jest --runTestsByPath library/__tests__/recipePictureLayout.test.ts components/__tests__/RecipeTileMetadata.test.tsx components/__tests__/RecipeShelfTilePhoto.test.tsx components/__tests__/RecipeShelfTile.test.tsx components/__tests__/RecipePhoto.test.tsx --watch=false
npm run typecheck
npx eslint components/RecipeTileMetadata.tsx components/RecipeShelfTile.tsx library/recipePictureLayout.ts
git add library/recipePictureLayout.ts library/__tests__/recipePictureLayout.test.ts components/RecipeTileMetadata.tsx components/__tests__/RecipeTileMetadata.test.tsx components/RecipeShelfTile.tsx components/__tests__/RecipeShelfTilePhoto.test.tsx components/__tests__/RecipePhoto.test.tsx
git commit -m "fix: keep optional compact photos within metadata space" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Right-centred list photos, Ready to brew and home wiring

**Files:** `components/RecipeCard.tsx`, `components/ReadyToBrewCard.tsx`,
`app/index.tsx`, `components/__tests__/RecipeCard.test.tsx`,
`components/__tests__/ReadyToBrewCard.test.tsx`,
`app/__tests__/index.test.tsx`, `app/__tests__/index.readyToBrew.test.tsx`,
`components/__tests__/ShelfRoom.test.tsx`.

- [ ] **1. Write failing layout/wiring assertions before moving the photo.**

In existing card tests, enable `showPicture` and drive the card's layout events.
Assert the photo is no longer inside `recipe-card-title-row`, is circular and
36 pt, and occupies the right-centred frame. Drive a conflicting badge,
figures or silhouette boundary and assert it is absent without losing those
elements. Keep a normal 390 pt-wide case that actually shows the photo, so
an always-hidden implementation cannot pass.

For Ready to brew, assert a 36 pt circle and separately press open, BREW and
dismiss. Preserve reorder/more tests. Assert the photo yields when space is
insufficient without making BREW unreachable.

- [x] **2. Reserve and measure the list photo's trailing space.**

Remove the photo from the leading title row. Reserve a 44 pt trailing rail
(36 pt frame plus 8 pt clearance) for the optional picture candidate; keep
the badge corner independent. Calculate the candidate from the actual card
content layout:

```ts
const candidate: Rect = {
    x: content.width - CARD_PHOTO_SIZE,
    y: (content.height - CARD_PHOTO_SIZE) / 2,
    width: CARD_PHOTO_SIZE,
    height: CARD_PHOTO_SIZE
};
```

All rectangles must share card-content coordinates. Measure the actual occupied
badge/figure areas, not full-width spacer rows. For the profile boundary,
reuse `profileHeightAt` from `PourProfile` with its actual width, height and
offset; do not treat its entire transparent SVG box as occupied.
Reject the candidate if it overlaps those occupied regions or leaves no
positive prose width. Keep layout readings tied to the recipe-content,
width/font-scale and badge signature as in Task 4, with no effect-based resets.

Render it outside normal title flow:

```tsx
<View pointerEvents="none" testID="recipe-card-photo-frame"
    style={{position: "absolute", left: candidate.x, top: candidate.y}}>
    <RecipePhoto testID="recipe-card-photo" uri={picture}
        size={CARD_PHOTO_SIZE} radius={CARD_PHOTO_SIZE / 2}
        backing={onAccent.key}/>
</View>
```

Keep the reservation during loading. With no URL, switch off, failed URL or
ineligible geometry, reclaim it; do not increase card height or reduce the
existing name/note line allowance. Verify portrait and landscape transitions
do not leave a previously valid picture overlapping content.

- [x] **3. Convert Ready to brew's image to the shared circular rendering.**

Replace its 56 pt square with `RecipePhoto` at `CARD_PHOTO_SIZE`, radius
`CARD_PHOTO_SIZE / 2`, backed by the existing palette. Keep the photo inside
the open-recipe area, not in BREW or the dismissal button.

Measure the open area and actual text/control extents. Only retain its photo
slot when the text and separate 44 pt-minimum BREW control fit. Use the same
keyed-reading pattern, with the photo omitted before measurements are current.
Do not cap or truncate freshness/bag lines to preserve decoration.

- [x] **4. Wire the independent preferences at every home consumer.**

Add:

```ts
const [showRecipeCardPhotos] = useSetting("showRecipeCardPhotos", settings);
const [showShelfPhotoPreviews] = useSetting("showShelfPhotoPreviews", settings);
```

Replace every home `showPicture={showRecipeAvatars}` with
`showPicture={showRecipeCardPhotos}`, including selection and shelf-room
paths. Ready to brew receives:

```tsx
imageUri={showRecipeCardPhotos ? readyCard.entry.recipe.imageURL : undefined}
```

ShelfGrid receives:

```tsx
marks={withShelfPhotos(library.shelfMarks, showShelfPhotoPreviews)}
```

Remove the now-unused home ABOUT preference binding. Do not change image
placement on catalogue/import screens that this spec does not cover.

- [x] **5. Run targeted components/screens, then commit.**

```sh
npx jest --runTestsByPath components/__tests__/RecipeCard.test.tsx components/__tests__/ReadyToBrewCard.test.tsx components/__tests__/ShelfRoom.test.tsx app/__tests__/index.test.tsx app/__tests__/index.readyToBrew.test.tsx --watch=false
npm run typecheck
git add components/RecipeCard.tsx components/ReadyToBrewCard.tsx app/index.tsx components/__tests__/RecipeCard.test.tsx components/__tests__/ReadyToBrewCard.test.tsx components/__tests__/ShelfRoom.test.tsx app/__tests__/index.test.tsx app/__tests__/index.readyToBrew.test.tsx
git commit -m "fix: place optional recipe photos behind information priority" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Integrated acceptance, copy and release records

**Files:** `docs/release-2.2.0-changes.md`,
`docs/release-2.2.0-testing.md`, `docs/copy.md`, affected test files from prior tasks.

- [ ] **1. Add missing integrated red/green cases before considering the work done.**

In `app/__tests__/index.test.tsx` and `index.readyToBrew.test.tsx`, cover a
single library containing pictured/unpictured recipes, an automatic shelf, a
tag/personal shelf and an open bag. With card photos off and cover photos on,
cards/Ready have none, personal covers do, and automatic glyphs remain.
Turn on card photos and drive measurement events: only geometrically eligible
cards gain images; no person's portrait appears. Turn off covers: their old
accent art returns without disabling ABOUT or card photos.

In the settings-screen restore harness, repeat the approved precedence against
an already-configured device, not only an empty store. Tests must observe
persisted results after a fresh Settings instance.

- [x] **2. Update the existing release/copy records.**

Record that #225/#235's combined preview design was replaced by this approved
placement policy, not that contributor PRs were merged. Copy the three settings
labels/descriptions from Task 1 into `docs/copy.md`.

Add unchecked native cases to `docs/release-2.2.0-testing.md`: list and compact
photos on/off; personal/automatic covers; long names/notes; narrow widths;
large text; all badges and editing/selection; failed/new URLs; editor
collapse/rename; VoiceOver/TalkBack; Ready controls. Keep #233's Android Fabric
crash qualification and Package A hardware checklist open. Do not check a
native item merely because Jest passed.

- [x] **3. Run software gates serially, using existing tooling.**

```sh
npm run typecheck
npm run lint
npm test -- --watch=false
npx expo-doctor
```

First use prior task groups during iteration; run this full set only at the
integrated acceptance checkpoint. Both Jest projects must pass. Existing lint
warnings are not new failures, but new errors/warnings introduced here must be
resolved or explicitly explained. Do not change dependency manifests merely
to run validation.

- [ ] **4. Perform native visual checks where devices are available.**

Use the already-running preview Metro on 8082; leave primary Metro on 8081
untouched. Before any new device use, resolve the earlier installer still
reported at `Connecting to: iPhone14`; do not start competing installers.
If an iOS build is needed and authorized, use the iPhone 17 Pro named
`iPhone14`, never the iPhone 13 mini. No NFC/BLE brew or new native build is
required just to qualify these JavaScript layouts.

Capture exact device/platform, text scale, width, preference state and source
commit for each observed case. If iOS or Android is unavailable, leave its
checks open and report the gap; do not claim native acceptance.

- [ ] **5. Commit records and push the authorized preview branch.**

```sh
git add docs/release-2.2.0-changes.md docs/release-2.2.0-testing.md docs/copy.md
git commit -m "docs: record redesigned picture acceptance and device checks" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin chore/2.2.0-preview-20261019
git fetch origin --no-prune
npm run worktrees:check
git status --short --branch
git rev-parse HEAD origin/chore/2.2.0-preview-20261019
```

Record exact branch/worktree/base/head, clean/dirty and local/remote state,
remaining device checks and preservation pointer. Retain the owned preview for
ongoing package work; no deletion or cleanup beyond existing exact approvals.

## Plan self-review

| Approved requirement | Planned coverage |
| --- | --- |
| Card photos OFF; one shared switch including Ready | Tasks 1, 5, 6 |
| Personal/tag covers ON; legacy OFF preserved | Tasks 1, 2, 6 |
| Automatic glyphs and inversion retained | Task 2 |
| Four actual members, stable bounded reads, no photo repetition | Task 2 |
| 20 pt metadata photo, full-width name, exact wrap threshold | Task 4 |
| 36 pt right-centred list photo and Ready circle | Task 5 |
| No header image/reservation; ABOUT unchanged | Task 3 |
| Circular whole-product fit, keyed failure fallback | Tasks 2, 4, 5 |
| Export/old/new restore precedence | Tasks 1, 6 |
| Accessibility, all badges/modes, native layout gaps | Tasks 4, 5, 6 |
| No NFC/BLE mitigation or #243 acceptance | Boundaries and Task 6 |

Execute serially. Component tests prove decisions under supplied native
measurements, not that every real platform reports the expected geometry.
Native layout qualification remains a separate acceptance gate.
