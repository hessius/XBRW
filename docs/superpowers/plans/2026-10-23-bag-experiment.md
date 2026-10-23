# Optional Bag Beta Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt #238, #241 and #242 into a default-off Labs experiment with shared physical bags, optional remembered selection, honest quantity estimates and one Ready to brew suggestion.

**Architecture:** Store physical bags, many-to-many recipe links, per-recipe selections and durable run accounting in the existing SQLite database. Freeze optional bag attribution when the existing live-run owner accepts a recipe, forward observations through its existing subscriptions, and keep inventory independent of recipe serialization and history deletion. Render the complete experiment through one device-local gate; source domain and presentation work is reused selectively, not merged from the cumulative preview.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, React Compiler, Tamagui, expo-sqlite synchronous API, Expo Router, Jest iOS/Android projects, real `node:sqlite` test harness.

---

## Contract, ownership and source evidence

Approved spec:
`docs/superpowers/specs/2026-10-23-bag-experiment-design.md`.

Task worktree:
`/Users/jesperhessius/Dev/XBRW-220-bag-labs-20261023`.

Branch: `feat/2.2.0-bag-labs-20261023`.

Pinned base: `8f2638dfa2e75928ff447fbbd0ee03ba14986886`.

The approved spec was pushed at `a372fd51f1519b7a6051ba7d4041cd5a15ac9c1c`.
Implementation is authorised for inline execution. Tasks 1-7 now have local
iOS/Android qualification; Tasks 8-11 and all native/manual gates remain pending.
The default-off gate and device-local tracker keys were introduced with Task 4
so the live-owner integration is type-safe before the settings UI arrives.

**#239 is not part of this plan.** Do not port its dose chips, save-as-dose,
bypass-rescaling changes, sheet-height change or compiler opt-out. Existing
quick-edit doses still count as the intended dose of their particular run.

Read `AGENTS.md`, `.github/copilot-instructions.md` and
`docs/development-workflow.md` in this worktree before execution. Fetch
`origin --no-prune`, run `npm run worktrees:check`, and verify this task still
owns a clean checkout. Do not switch the shared primary checkout or stop
either existing Metro server. No PR, merge, new review round, native build,
deployment or cleanup is authorised by this plan alone.

| Source | Pinned head | Reuse boundary |
| --- | --- | --- |
| #238 | `06ba667e143baf05f7ab89ec1af48493b39febf5` | Date/quantity helpers, bean-link codec and tests; bag UI as a starting point, not its ownership/accounting |
| #241 | `797f1b3be1d53773973e6808d91b4402a75cd05c` | Roast advice, local-calendar arithmetic, midnight/foreground refresh and tests |
| #242 | `acb625711e1b90627e253f780a528f5d40508181` | Ready card presentation and tests, not recipe-keyed ranking or empty/resting suggestions |
| Reviewed preview appearance adaptation | `dcf0343a2e6501027781738dc35ab78a0d27acd3` | Three named bag presentation files in Task 8 and the Ready card in Task 9; no whole-branch merge |

All three source PR review rounds are spent. Recheck their live heads before
extracting code; a moved source head requires an explicit delta assessment,
not silently replacing these pins.

Run commands from the task worktree. The planning step does not install
dependencies or run implementation tests.

At execution, first run `npm test -- --listTests --runInBand`. If it fails
because Jest/dependencies are missing, run `npm ci` in this owned worktree,
then repeat it. Do not let `npx` fetch an unrelated runner, borrow another
worktree's dependencies or treat a missing executable as a valid red test.

## File map and boundaries

| File(s) | Responsibility |
| --- | --- |
| `library/coffeeBag.ts` | Independent bag model, IDs, strict facts validation, source date/quantity helpers and truthful balance copy |
| `library/bagRun.ts` | Frozen run snapshot, explicit/saved/invalid route request, progress reducer and store contract |
| `library/CoffeeBagDatabase.ts` | Shared-handle schema, links/selections, ordered accounting, grouped reads and transactional operations |
| `library/bagBackup.ts` | Portable v2 inventory bundles, validation and skipped-row diagnostics |
| `library/bagMigration.ts` | Read-only conversion from the preview's legacy `coffee_bags` table |
| `library/brew/BagRunTracker.ts` | Forward run observations into the store; no machine subscription or brewing command |
| `library/roastAdvice.ts`, `library/restPeak.ts` | Supplied/user/estimated advice and local-calendar freshness |
| `library/readyToBrew.ts` | Deduplicated explicit selections and deterministic recommendation ranking |
| `hooks/useCoffeeBag.ts`, `hooks/useBagLibrary.ts` | Enabled-only inventory reads, change subscription and explicit error state |
| `hooks/useNow.ts` | Enabled-only midnight/foreground clock |
| `hooks/useLiveBrew.tsx`, `hooks/useBrewRun.ts` | Freeze attribution in the existing accepted run; observe through existing callbacks |
| `library/brew/BrewRecord.ts`, `library/BrewDatabase.ts` | Optional historical bag snapshot; old rows retain their old shape |
| `library/Settings.ts`, `app/settings.tsx` | Default-off Labs control, tracker ownership, export/restore orchestration |
| `library/backup.ts`, `hooks/useBackup.ts`, `components/RestoreSheet.tsx` | Optional inventory payload and explicit restore results |
| `library/RecipeDatabase.ts` | Unlink deleted recipes without deleting physical bags or resetting retained selections on replace |
| `components/SelectedBagRow.tsx`, `components/BagPickerSheet.tsx` | Approved layout A and the shared optional chooser |
| `components/BagSection.tsx`, `components/BagSheet.tsx`, `components/RoastDayField.tsx` | ABOUT management and editable bag facts/advice |
| `components/ReadyToBrewCard.tsx`, `app/index.tsx` | One optional suggestion and exact displayed-pair navigation |
| `app/editRecipe.tsx`, `components/AboutDeck.tsx` | Bag row above the existing bar and independent ABOUT management |
| `components/RecipeCard.tsx`, `components/RecipeShelfTile.tsx`, `components/SwipeableRecipeRow.tsx`, `components/ShelfRoom.tsx` | Pass enabled, selected-bag-derived badges without another per-row query |
| `app/brew.tsx`, `app/brewRecord.tsx`, `hooks/useBrewHandoff.ts`, `hooks/useBrewRecordHandoff.ts`, `library/brew/handoff/envelope.ts` | Parse optional request and honour frozen external bean identity |
| `library/brew/handoff/beanLink.ts`, `library/brew/handoff/bagBean.ts` | Explicit add-bean handoff and bag-specific identity |
| `test-utils/bags.ts` and named tests below | Shared factual fixtures, not SQL pattern emulation |
| `docs/copy.md`, `docs/release-2.2.0-changes.md` | Experimental copy, source provenance and still-pending manual gates |

Do not restructure unrelated screens or duplicate the library query engine.
Do not add another live-run provider or alter `Machine.ts`, wire encoding or
NFC limits. Each task ends in a coherent commit with the required Copilot
co-author trailer.

## Task 1: Independent bag facts and shared test fixtures

**Create:** `library/coffeeBag.ts`, `library/roastAdvice.ts`,
`library/__tests__/coffeeBag.test.ts`, `test-utils/bags.ts`.

**Reference:** pinned #238 `library/coffeeBag.ts`; current
`library/podCoffee.ts`; `test-utils/sqlite.ts`.

- [x] **Step 1: Write failing ownership and validation cases.**

```ts
import {newBag, reviveBag} from "@/library/coffeeBag";

it("creates a physical bag without recipe ownership", () => {
    const bag = newBag({
        name: "Colombia, roasted 12 Oct",
        sizeGrams: 250,
        boughtOn: "2026-10-23"
    }, 1_000, "bag-a");
    expect(bag).toMatchObject({id: "bag-a", sizeGrams: 250});
    expect(bag).not.toHaveProperty("recipeUuid");
    expect(bag).not.toHaveProperty("gramsAtCount");
});

it.each([NaN, Infinity, -1, 0, 5001, 250.5])(
    "rejects invalid purchase size %s", (sizeGrams) => {
        expect(reviveBag({
            id: "bag-a", name: "Coffee", sizeGrams,
            boughtOn: "2026-10-23", addedAt: 1_000
        })).toBeNull();
    }
);
```

- [x] **Step 2: Run the red test.**

```bash
npx jest --runTestsByPath library/__tests__/coffeeBag.test.ts --runInBand
```

Expected: both projects fail because the new module/export does not exist.

- [x] **Step 3: Add these model contracts and constructors.**

```ts
export type BagTracker = "xbrw" | "beanconqueror";
export type BagTrackerSetting = "auto" | BagTracker;
import type {AdviceSource} from "@/library/roastAdvice";
export type {AdviceSource} from "@/library/roastAdvice";

export type CoffeeBag = {
    id: string;
    name: string;
    sizeGrams: number;
    boughtOn: string;
    addedAt: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
    finishedAt?: number;
    restDays?: number;
    peakDay?: number;
    bestUntilDay?: number;
    adviceSource?: AdviceSource;
};

export type BagInput = Omit<CoffeeBag, "id" | "addedAt" | "finishedAt">;

export type BagBalance =
    | {kind: "estimate"; remainingGrams: number; usedGrams: number;
       brewsLeft: number | null; low: boolean; empty: boolean}
    | {kind: "needsCheck"}
    | {kind: "external"};

export const BAG_PRESETS = [160, 250, 320, 480, 1000] as const;
export const BAG_GRAMS = {min: 1, max: 5000} as const;
export const BAG_PRICE = {min: 0, max: 100000} as const;
export const BAG_NAME_MAX = 160;
export const BAG_BEAN_NAME_MAX = 40;

export function isBagId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

export function newBagId(): string {
    return `bag-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newBag(
    input: BagInput, now = Date.now(), id = newBagId()
): CoffeeBag {
    const bag = reviveBag({...input, id, addedAt: now});
    if (bag === null) throw new Error("The bag details are invalid.");
    return bag;
}

export function balanceLine(balance: BagBalance): string {
    if (balance.kind === "needsCheck") return "Check remaining coffee";
    if (balance.kind === "external") return "Tracked in Beanconqueror";
    return `Approx. ${balance.remainingGrams} g remaining`;
}
```

Reuse #238's actual implementations of `calendarDay`, `dayOf`, `dayDate`,
`roastedOnDate`, `daysSinceRoast`, `roastDayLabel`, `roastDayRange`,
`roastDayFromCoffee`, `isBagGrams`, `isGramsLeft`, `isBagPrice` and
`resolveBagTracker`, keeping their independent date tests. These functions
do not need recipe ownership or a live bag counter. Do not copy `withSize`,
`withGramsLeft`, `readBag`, `recipeUuid` validation or the old `newBag`.

Implement `reviveBag(entry: unknown): CoffeeBag | null` as the source's explicit
field-by-field validator adapted to the model above: validate a nonblank name
up to 160 characters, ID up to 100, purchase grams 1..5000 integer, real
`YYYY-MM-DD` dates, finite nonnegative timestamps, optional price 0..100000,
optional nonblank Beanconqueror name up to 40, and complete advice ordering
from Task 7. Return null on malformed supplied fields; do not truncate identity
or silently invent dates. Keep strict facts validation separate from the
legacy-preview validator in Task 6.

Use this strict reconstruction in `coffeeBag.ts`, with the existing source
calendar/quantity guards and the advice helpers defined below:

```ts
export function isBagRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function reviveBag(value: unknown): CoffeeBag | null {
    if (!isBagRecord(value) || !isBagId(value.id)
        || typeof value.name !== "string" || !value.name.trim()
        || value.name.trim().length > BAG_NAME_MAX
        || !isBagGrams(value.sizeGrams)
        || typeof value.addedAt !== "number"
        || !Number.isFinite(value.addedAt) || value.addedAt < 0) return null;
    const boughtOn = calendarDay(value.boughtOn);
    const roastedOn = calendarDay(value.roastedOn);
    if (boughtOn === undefined) return null;
    if (value.roastedOn !== undefined && roastedOn === undefined) return null;
    if (value.price !== undefined && !isBagPrice(value.price)) return null;
    if (value.beanName !== undefined && (
        typeof value.beanName !== "string" || !value.beanName.trim()
        || value.beanName.trim().length > BAG_BEAN_NAME_MAX
    )) return null;
    if (value.finishedAt !== undefined && (
        typeof value.finishedAt !== "number"
        || !Number.isFinite(value.finishedAt) || value.finishedAt <= 0
    )) return null;
    const source = value.adviceSource;
    if (source !== undefined && source !== "coffee"
        && source !== "estimate" && source !== "user") return null;
    const advice = reviveRoastAdvice(value);
    for (const key of ["restDays", "peakDay", "bestUntilDay"] as const) {
        if (value[key] !== undefined && advice[key] === undefined) return null;
    }
    if (roastAdviceProblem(advice) !== null) return null;
    return {
        id: value.id, name: value.name.trim(), sizeGrams: value.sizeGrams,
        boughtOn, addedAt: value.addedAt,
        ...(roastedOn !== undefined ? {roastedOn} : {}),
        ...(isBagPrice(value.price) ? {price: value.price} : {}),
        ...(typeof value.beanName === "string"
            ? {beanName: value.beanName.trim()} : {}),
        ...(typeof value.finishedAt === "number"
            ? {finishedAt: value.finishedAt} : {}),
        ...(source !== undefined ? {adviceSource: source} : {}),
        ...advice
    };
}
```

Copy the pinned `roastAdvice.ts` numeric-field implementation, then add the
shared source union and ordering function:

```ts
export type AdviceSource = "coffee" | "estimate" | "user";

export function roastAdviceProblem(advice: RoastAdvice): string | null {
    const ordered = [advice.restDays, advice.peakDay, advice.bestUntilDay]
        .filter((value): value is number => value !== undefined);
    if (ordered.some(value => roastDays(value) === undefined)) {
        return "Enter whole days, 0 to 540.";
    }
    if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) {
        return "The estimated peak follows the rest, and the window ends after it.";
    }
    return null;
}
```

Import `reviveRoastAdvice`/`roastAdviceProblem` into coffeeBag. Keeping
individual supplied numbers available lets the form display inconsistent
advice as a problem rather than silently replacing it with a default.

- [x] **Step 4: Add the shared fixture, then finish green cases.**

```ts
// test-utils/bags.ts
import type {CoffeeBag} from "@/library/coffeeBag";
import Recipe from "@/library/Recipe";

export const BAG_NOW = 1_792_756_800_000;

export function bagFixture(
    changes: Partial<CoffeeBag> = {}
): CoffeeBag {
    return {
        id: "bag-a", name: "Colombia, roasted 12 Oct",
        sizeGrams: 250, boughtOn: "2026-10-23",
        roastedOn: "2026-10-12", addedAt: BAG_NOW,
        ...changes
    };
}

export function bagRecipe(uuid = "recipe-a"): Recipe {
    const recipe = new Recipe();
    recipe.uuid = uuid;
    recipe.name = `Coffee ${uuid}`;
    recipe.dosage = 18;
    recipe.ratio = 16;
    return recipe;
}
```

Add explicit malformed ID/name/date/optional-field cases, local-day/DST source
cases, and prove extra `recipeUuid` does not become a field in the revived bag.
Move the small advice-shape validator into `roastAdvice.ts` in this task if
needed to keep the first commit compiling; its full freshness consumers come
in Task 7. This task must create that file with the shared
`AdviceSource = "coffee" | "estimate" | "user"` type. Task 7 imports/re-exports
that type rather than defining a different same-named union.

- [x] **Step 5: Run green and commit.**

```bash
npx jest --runTestsByPath library/__tests__/coffeeBag.test.ts --runInBand
git add library/coffeeBag.ts library/roastAdvice.ts library/__tests__/coffeeBag.test.ts test-utils/bags.ts
git commit -m "feat(bags): model independent physical coffee bags" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Shared-handle schema, links and explicit selections

**Create:** `library/CoffeeBagDatabase.ts`,
`library/__tests__/CoffeeBagDatabase.test.ts`.

**Modify:** `library/RecipeDatabase.ts:423-473`.

- [x] **Step 1: Write these real-SQLite relationship tests.**

Each DB suite uses this setup, not a query-pattern mock:

```ts
import {createTestDatabase} from "@/test-utils/sqlite";
import {bagFixture, bagRecipe} from "@/test-utils/bags";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockDb
}));

beforeEach(() => { mockDb = createTestDatabase(); });

it("supports two recipes and two simultaneously open bags", () => {
    const recipes = new RecipeDatabase();
    recipes.insertRecipes([bagRecipe("a"), bagRecipe("b")]);
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    bags.create(bagFixture({id: "bag-b"}));
    bags.select("a", "bag-a", 1);
    bags.select("b", "bag-a", 2);
    bags.link("a", "bag-b");
    expect(bags.linked("a").map(bag => bag.id).sort())
        .toEqual(["bag-a", "bag-b"]);
    expect(bags.selection("b")?.bagId).toBe("bag-a");
    expect(bags.get("bag-a")?.finishedAt).toBeUndefined();
});

it("remembers No bag and removes only a deleted recipe's links", () => {
    const recipes = new RecipeDatabase();
    recipes.insertRecipes([bagRecipe("a"), bagRecipe("b")]);
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    bags.select("a", "bag-a", 1);
    bags.select("b", "bag-a", 2);
    bags.select("a", null, 3);
    expect(bags.selection("a")).toMatchObject({bagId: null});
    recipes.deleteRecipe("b");
    expect(bags.get("bag-a")).not.toBeNull();
    expect(bags.selection("b")).toBeNull();
    expect(bags.selection("a")?.bagId).toBeNull();
});
```

- [x] **Step 2: Run red.**

```bash
npx jest --runTestsByPath library/__tests__/CoffeeBagDatabase.test.ts --runInBand
```

- [x] **Step 3: Create the schema without touching legacy `coffee_bags`.**

Use `appDatabase()`; keep its filename and singleton. `ensureBagTables(db)`
executes the following DDL:

```sql
CREATE TABLE IF NOT EXISTS coffee_bags_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  bag TEXT NOT NULL,
  baselineGrams REAL NOT NULL,
  needsCheck INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS coffee_bag_links (
  recipeUuid TEXT NOT NULL,
  bagId TEXT NOT NULL,
  PRIMARY KEY (recipeUuid, bagId)
);
CREATE INDEX IF NOT EXISTS coffee_bag_links_bag
  ON coffee_bag_links (bagId, recipeUuid);
CREATE TABLE IF NOT EXISTS coffee_bag_selections (
  recipeUuid TEXT PRIMARY KEY NOT NULL,
  bagId TEXT,
  selectedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS coffee_bag_runs (
  runId TEXT PRIMARY KEY NOT NULL,
  bagId TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  consumption TEXT NOT NULL DEFAULT 'pending'
    CHECK (consumption IN ('pending', 'used', 'unused', 'uncertain')),
  possible INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  coveredByBaseline INTEGER NOT NULL DEFAULT 0,
  overlapsBaseline INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS coffee_bag_runs_bag
  ON coffee_bag_runs (bagId);
```

Do not add foreign keys or cascade deletes to `brews`. Accounting must survive
history deletion. Validate references and perform relationship writes in
transactions rather than changing global database PRAGMAs.

Implement this public API in `CoffeeBagDatabase`; later tasks add accounting
and backup methods to the same class:

```ts
export type BagSelection = {
    recipeUuid: string;
    bagId: string | null;
    selectedAt: number;
};

// Constructor uses appDatabase(); no module-scope database opening.
// Each method throws on corrupt rows or failed writes.
export interface BagFactsStore {
    uses(db: import("expo-sqlite").SQLiteDatabase): boolean;
    get(id: string): CoffeeBag | null;
    all(): CoffeeBag[];
    create(bag: CoffeeBag): void;
    createAndSelect(bag: CoffeeBag, recipeUuid: string, at: number): void;
    edit(bag: CoffeeBag): void;
    linked(recipeUuid: string): CoffeeBag[];
    link(recipeUuid: string, bagId: string): void;
    unlink(recipeUuid: string, bagId: string): void;
    selection(recipeUuid: string): BagSelection | null;
    select(recipeUuid: string, bagId: string | null, at: number): void;
    finish(bagId: string, at: number): void;
    remove(bagId: string): void;
}
```

`create` inserts a validated new bag with `baselineGrams = sizeGrams`.
`edit` updates its JSON facts only, never its baseline. Selecting a real bag
checks that the saved recipe exists, the bag exists and is unfinished, links
the pair with `INSERT OR IGNORE`, then upserts its selection in one transaction.
Selecting null still writes a selection row. Reject unknown IDs with an error;
do not turn invalid selection input into successful No bag.

Use a nesting-aware transaction helper, like RecipeDatabase's existing
`atomically`, so `createAndSelect` can compose create/link/select and publish
only after the complete operation commits:

```ts
private transactionDepth = 0;

private atomically(work: () => void): void {
    if (this.transactionDepth > 0) { work(); return; }
    this.db.withTransactionSync(() => {
        this.transactionDepth++;
        try { work(); }
        finally { this.transactionDepth--; }
    });
    publishBagChanges();
}

public createAndSelect(bag: CoffeeBag, recipeUuid: string, at: number): void {
    this.atomically(() => {
        this.create(bag);
        this.select(recipeUuid, bag.id, at);
    });
}
```

The upsert body is:

```sql
INSERT INTO coffee_bag_selections (recipeUuid, bagId, selectedAt)
VALUES (?, ?, ?)
ON CONFLICT(recipeUuid) DO UPDATE
  SET bagId = excluded.bagId, selectedAt = excluded.selectedAt;
```

`finish`, `remove` and unlinking the selected pair explicitly set affected
preferences to null, never choose another bag. Keep finished bags available
for management and backup. Removing a bag does not change historical brew
snapshots; remove its own accounting only as part of that explicit deletion.

Add a plain revision subscription in this module: `subscribeBagChanges`,
`bagRevision` and private `publishBagChanges`. Publish once after successful
transactions, never before a commit or after rollback. Hooks in Task 8 use
`useSyncExternalStore`, not one SQL read per recipe row.

- [x] **Step 4: Unlink recipe deletions without breaking replace.**

Inside the existing RecipeDatabase transactions, delete corresponding link
and selection rows only if the v2 tables exist. Do not instantiate a bag store
merely to delete a recipe. Explicit delete-all clears links/preferences, not
bags. Refactor `replaceAllRecipes` to replace recipe/tag rows internally, insert
the incoming rows, then delete only links/preferences whose recipe UUID no
longer exists. Calling the public delete-all method would erase preferences
for recipes that are restored with the same UUID.

The final pruning statements are:

```sql
DELETE FROM coffee_bag_links
WHERE recipeUuid NOT IN (SELECT uuid FROM recipes);
DELETE FROM coffee_bag_selections
WHERE recipeUuid NOT IN (SELECT uuid FROM recipes);
```

Add tests that replacement retains the selected bag and explicit No bag for
retained UUIDs, prunes removed UUIDs, and rolls back everything when a recipe
insert fails. Publish the bag revision after the outer transaction succeeds.

- [x] **Step 5: Run green and commit.**

```bash
npx jest --runTestsByPath library/__tests__/CoffeeBagDatabase.test.ts hooks/__tests__/useRecipeLibrary.realDb.test.ts --runInBand
git add library/CoffeeBagDatabase.ts library/RecipeDatabase.ts library/__tests__/CoffeeBagDatabase.test.ts hooks/__tests__/useRecipeLibrary.realDb.test.ts
git commit -m "feat(bags): persist shared links and explicit bag choices" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Durable, ordered quantity accounting

**Create:** `library/bagRun.ts`, `library/__tests__/bagRun.test.ts`.

**Modify:** `library/CoffeeBagDatabase.ts`,
`library/__tests__/CoffeeBagDatabase.test.ts`.

- [x] **Step 1: Define the run contract and write red accounting tests.**

```ts
export type BagRunSnapshot = {
    runId: string;
    bagId: string;
    bagName: string;
    recipeUuid: string;
    dose: number;
    tracker: BagTracker;
    acceptedAt: number;
    beanName?: string;
};

export type BagRunProgress = {
    consumption: "pending" | "used" | "unused" | "uncertain";
    possible: boolean;
    closed: boolean;
};

export type BagRunEvent =
    "sending" | "grinding" | "pouring" | "refused" |
    "ended" | "recovered" | "retryBeforeSend";

export const INITIAL_BAG_PROGRESS: BagRunProgress = {
    consumption: "pending", possible: false, closed: false
};

export interface BagAccountingStore {
    beginRun(snapshot: BagRunSnapshot): BagRunProgress;
    updateRun(runId: string, progress: BagRunProgress): void;
    balance(bagId: string, dose: number, tracker: BagTracker): BagBalance;
    correct(bagId: string, grams: number): void;
    markAllNeedsCheck(): void;
    recoverPending(): void;
}
```

Add `bagRunFixture(changes: Partial<BagRunSnapshot> = {})` to
`test-utils/bags.ts`, returning run-a, bag-a, recipe-a, 18 g, local tracker and
`BAG_NOW`, with overrides applied last.

```ts
it("keeps used coffee spent when history disappears", () => {
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    bags.beginRun(bagRunFixture());
    bags.updateRun("run-a", {consumption: "used", possible: true, closed: true});
    mockDb.runSync("DELETE FROM brews;");
    expect(bags.balance("bag-a", 18, "xbrw"))
        .toMatchObject({kind: "estimate", remainingGrams: 232});
});

it("does not recharge an old run after a manual correction", () => {
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    bags.beginRun(bagRunFixture());
    const used = {consumption: "used" as const, possible: true, closed: false};
    bags.updateRun("run-a", used);
    bags.correct("bag-a", 100);
    bags.updateRun("run-a", {...used, closed: true});
    expect(bags.balance("bag-a", 18, "xbrw"))
        .toMatchObject({kind: "estimate", remainingGrams: 100});
});

it("does not guess on which side of a correction grinding used beans", () => {
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture());
    bags.beginRun(bagRunFixture());
    bags.updateRun("run-a", {consumption: "uncertain", possible: true, closed: false});
    bags.correct("bag-a", 100);
    bags.updateRun("run-a", {consumption: "used", possible: true, closed: true});
    expect(bags.balance("bag-a", 18, "xbrw")).toEqual({kind: "needsCheck"});
    bags.correct("bag-a", 100);
    expect(bags.balance("bag-a", 18, "xbrw"))
        .toMatchObject({kind: "estimate", remainingGrams: 100});
});
```

Ensure the suite creates `brews` through the existing BrewDatabase before the
history-deletion assertion, rather than relying on a missing-table failure.

- [x] **Step 2: Run red.**

```bash
npx jest --runTestsByPath library/__tests__/bagRun.test.ts library/__tests__/CoffeeBagDatabase.test.ts --runInBand
```

- [x] **Step 3: Implement the pure transition function.**

```ts
export function nextBagProgress(
    current: BagRunProgress, event: BagRunEvent
): BagRunProgress {
    if (event === "retryBeforeSend") {
        return current.closed && current.consumption === "unused"
            ? {...INITIAL_BAG_PROGRESS}
            : current;
    }
    if (current.closed) return current;
    if (event === "refused") {
        return current.consumption === "used"
            ? {...current, closed: true}
            : {consumption: "unused", possible: false, closed: true};
    }
    if (event === "pouring") {
        return {consumption: "used", possible: true, closed: false};
    }
    if (event === "sending" || event === "grinding") {
        return {
            ...current, possible: true,
            consumption: current.consumption === "used" ? "used" : "uncertain"
        };
    }
    if (event === "recovered") {
        return current.consumption === "used"
            ? {...current, closed: true}
            : {consumption: "uncertain", possible: true, closed: true};
    }
    return {
        ...current, closed: true,
        consumption: current.consumption === "used" ? "used"
            : current.possible ? "uncertain" : "unused"
    };
}
```

Test every event, duplicate terminal notifications, inability to reopen used
or uncertain runs, preflight-only rearming, and used-before-recovery. A
preflight refusal is evidence that nothing was sent; a failure without that
evidence is not equivalent.

- [x] **Step 4: Add the SQL methods and corruption checks.**

`beginRun` validates the complete snapshot, requires the bag, and inserts once
by run ID. An existing run must have the same immutable snapshot; a conflicting
run ID throws rather than reassigning it. External-tracker snapshots remain
historical attribution, but never create local quantity charges.

Define the shared strict snapshot/progress readers in `bagRun.ts`:

```ts
export function reviveBagRunSnapshot(value: unknown): BagRunSnapshot | null {
    if (!isBagRecord(value)) return null;
    const {runId, bagId, recipeUuid, bagName, dose, tracker, acceptedAt, beanName} = value;
    if (!isBagId(runId) || !isBagId(bagId) || !isBagId(recipeUuid)
        || typeof bagName !== "string" || !bagName.trim()
        || bagName.length > BAG_NAME_MAX
        || typeof dose !== "number" || !Number.isFinite(dose)
        || dose <= 0 || dose > BAG_GRAMS.max
        || (tracker !== "xbrw" && tracker !== "beanconqueror")
        || typeof acceptedAt !== "number" || !Number.isFinite(acceptedAt)
        || acceptedAt < 0) return null;
    if (beanName !== undefined && (
        typeof beanName !== "string" || !beanName.trim()
        || beanName.length > BAG_BEAN_NAME_MAX
    )) return null;
    return {
        runId, bagId, recipeUuid, bagName, dose, tracker, acceptedAt,
        ...(typeof beanName === "string" ? {beanName} : {})
    };
}

export function reviveBagRunProgress(value: unknown): BagRunProgress | null {
    if (!isBagRecord(value)) return null;
    const {consumption, possible, closed} = value;
    if ((consumption !== "pending" && consumption !== "used"
        && consumption !== "unused" && consumption !== "uncertain")
        || typeof possible !== "boolean" || typeof closed !== "boolean") return null;
    if ((consumption === "used" || consumption === "uncertain") && !possible) return null;
    if (consumption === "pending" && closed) return null;
    if (consumption === "unused" && (possible || !closed)) return null;
    return {consumption, possible, closed};
}
```

Import the bag guards/limits and BagTracker/BagBalance types from coffeeBag.
Import Recipe as a type for eligibility in Task 4; the module remains plain
TypeScript and introduces no runtime Recipe/BrewDatabase import cycle.

`updateRun` updates only progress columns after validating the transition.
It does not rewrite `snapshot` or bag ID. Preserve idempotence when the same
progress is delivered twice.

Use this grouped arithmetic for local balances:

```sql
SELECT b.id, b.bag, b.baselineGrams, b.needsCheck,
  COALESCE(SUM(CASE
    WHEN r.coveredByBaseline = 0 AND r.consumption = 'used'
    THEN json_extract(r.snapshot, '$.dose') ELSE 0 END), 0) AS usedGrams,
  COALESCE(MAX(CASE
    WHEN (r.coveredByBaseline = 0 AND r.consumption = 'uncertain')
      OR (r.overlapsBaseline = 1 AND r.consumption <> 'unused')
    THEN 1 ELSE 0 END), 0) AS unresolved
FROM coffee_bags_v2 b
LEFT JOIN coffee_bag_runs r ON r.bagId = b.id
GROUP BY b.id;
```

Do not persist external-tracker runs in the local accounting table: their
historical BrewRecord snapshot is sufficient. `beginRun` for external mode returns
initial progress without inserting a local run. `BagRunTracker` skips local
updates when `snapshot.tracker !== "xbrw"`.

For a valid known balance, `usedGrams` is retained without clamping;
`remainingGrams = Math.max(0, baselineGrams - usedGrams)`.
`empty` means zero, not fewer than the current dose. `low` means fewer than
two doses; `brewsLeft` is floor division only for a positive finite dose.
If needsCheck or unresolved is true, return only `{kind: "needsCheck"}`.
External mode returns only `{kind: "external"}`.

`correct` validates 0..5000 integer grams and executes these statements together:

```sql
UPDATE coffee_bag_runs
SET coveredByBaseline = CASE
      WHEN consumption IN ('used', 'uncertain')
        OR (consumption = 'pending' AND possible = 1)
      THEN 1 ELSE coveredByBaseline END,
    overlapsBaseline = CASE
      WHEN closed = 0 AND possible = 1
        AND consumption IN ('pending', 'uncertain') THEN 1 ELSE 0 END
WHERE bagId = ?;
UPDATE coffee_bags_v2
SET baselineGrams = ?, needsCheck = 0
WHERE id = ?;
```

This conservatively keeps overlapping unresolved grinding visible. A later
correction after observed consumption resolves it. A pending run that has
not reached sending/grinding is not covered; its subsequent first pour must
still subtract its dose. Add this exact regression: accept run, correct to
100 g before sending, observe pouring, finish, expect 82 g.

Per-run coverage is changed in the correction transaction, not inferred from
the run's acceptance timestamp or insertion order. Those would incorrectly
cover later consumption of an earlier accepted run. A confirmed preflight
retry resets coverage/overlap on its unused allocation before rearming.

`markAllNeedsCheck` sets the explicit gap marker on open bags.
`recoverPending` resolves open old-process rows using the reducer, preserving
already observed consumption and marking the rest uncertain. Run it once when
the shared bag store is first opened in this JS lifetime, before accepting a
new tracked run, not on every constructor or focus event.

Expose `sharedBagDatabase()` lazily, reusing the source's `uses(appDatabase())`
handle check so Jest's `forgetAppDatabase()` still creates isolated stores.
Do not open SQLite at module import.

- [x] **Step 5: Run the accounting matrix and commit.**

Add tests for two different recipe doses drawing from one bag; duplicate run
IDs; malformed stored JSON; negative over-consumption; external mode; refused
and unresolved attempts; same-time corrections; re-enable gap markers;
pending recovery; metadata edits not resetting a corrected baseline.

```bash
npx jest --runTestsByPath library/__tests__/bagRun.test.ts library/__tests__/CoffeeBagDatabase.test.ts --runInBand
git add library/bagRun.ts library/CoffeeBagDatabase.ts library/__tests__/bagRun.test.ts library/__tests__/CoffeeBagDatabase.test.ts test-utils/bags.ts
git commit -m "feat(bags): account for attributed brews independently of history" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Freeze attribution in the existing live-run lifetime

**Create:** `library/brew/BagRunTracker.ts`,
`library/brew/__tests__/BagRunTracker.test.ts`,
`library/__tests__/bagRunRequest.test.ts`.

**Modify:** `hooks/useLiveBrew.tsx:146-186,270-295`,
`hooks/useBrewRun.ts:79-85,142-230,375-393`,
`app/brew.tsx:214-242`,
`hooks/__tests__/useLiveBrew.test.tsx`,
`hooks/__tests__/useBrewRun.test.ts`.

- [x] **Step 1: Add request parsing and its red cases.**

```ts
export type BagRunRequest =
    | {kind: "saved"}
    | {kind: "explicit"; bagId: string | null}
    | {kind: "invalid"; reason: string};

export function parseBagRunRequest(raw: string | undefined): BagRunRequest {
    if (raw === undefined) return {kind: "saved"};
    if (raw.length > 650) return {kind: "invalid", reason: "Invalid bag selection."};
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { return {kind: "invalid", reason: "Invalid bag selection."}; }
    if (value === null || isBagId(value)) return {kind: "explicit", bagId: value};
    return {kind: "invalid", reason: "Invalid bag selection."};
}

export function bagRunParam(bagId: string | null): string {
    return JSON.stringify(bagId);
}
```

Test absent, null, valid Unicode IDs, strings needing escaping, oversized,
malformed JSON, booleans, arrays and objects. Invalid input produces a visible
tracking warning and an unchanged untracked brew, not a different bag.

- [x] **Step 2: Write the tracker red test, then implement its complete bridge.**

```ts
// library/brew/BagRunTracker.ts
import {
    INITIAL_BAG_PROGRESS, nextBagProgress,
    type BagAccountingStore, type BagRunEvent,
    type BagRunProgress, type BagRunSnapshot
} from "@/library/bagRun";

export class BagRunTracker {
    private progress: BagRunProgress = INITIAL_BAG_PROGRESS;
    private available = false;
    private dirty = false;
    private observedOwnSend = false;

    constructor(
        readonly snapshot: BagRunSnapshot,
        private readonly store: Pick<BagAccountingStore, "beginRun" | "updateRun">,
        private readonly onError: (
            error: unknown, snapshot: BagRunSnapshot, progress: BagRunProgress
        ) => void
    ) {
        if (snapshot.tracker !== "xbrw") return;
        try {
            this.progress = store.beginRun(snapshot);
            this.available = true;
            this.observedOwnSend = this.progress.possible;
        }
        catch (error) {
            this.dirty = true;
            onError(error, snapshot, this.progress);
        }
    }

    event(event: BagRunEvent): void {
        if (this.snapshot.tracker !== "xbrw") return;
        if (event === "sending") this.observedOwnSend = true;
        if ((event === "grinding" || event === "pouring" || event === "ended")
            && !this.observedOwnSend) return;
        if (event === "retryBeforeSend"
            && this.progress.consumption === "unused") this.observedOwnSend = false;
        const next = nextBagProgress(this.progress, event);
        if (next.consumption === this.progress.consumption
            && next.possible === this.progress.possible
            && next.closed === this.progress.closed && !this.dirty) return;
        this.progress = next;
        this.dirty = true;
        try {
            if (!this.available) {
                this.store.beginRun(this.snapshot);
                this.available = true;
            }
            this.store.updateRun(this.snapshot.runId, next);
            this.dirty = false;
        } catch (error) {
            this.onError(error, this.snapshot, next);
        }
    }
}
```

`onError` must notify and log in the hook, with an actionable quantity-check
message. It is injected, not a silent default. Keep observed progress in memory
and retry persistence on subsequent existing events; never keep claiming
tracking success after a failed write or forget an observed pour.

Add `invalidateBagEstimate(snapshot, progress)` to CoffeeBagDatabase. Keep
failed progress in a module-local Map keyed by run ID, publish its revision,
and make affected runtime balance reads return needsCheck. Attempt to persist
that bag's needsCheck marker; report a secondary storage failure rather than
claiming it was durable. A successful later update may remove its cached
failed progress, but must not clear a persistent gap from another cause.

Before applying a correction, flush any cached observed progress for that bag
inside the same transaction using the existing validated run insertion/update
logic. Then apply the coverage SQL from Task 3. Clear cached faults only after
commit. If that flush fails, the correction fails visibly and the warning
remains. This prevents a correction from treating a failed-to-save first pour
as a never-started pending run. Test: failed first-pour write, recover storage,
correct during that run, late terminal callback, no second charge.

Existing pending entries make uncertainty recoverable on next launch. If
even the initial entry could not be written, explicitly warn that this run
could not yet be tracked; do not promise a durable write while storage is
unavailable. Deduplicate the user notification per run, not the observed
progress or the logged error.

The sending gate is deliberate. At `Machine.ts:1361`, sending follows the
existing preflight ownership check. Earlier global pouring/terminal phases
may belong to a brew already running on the machine and cannot charge the
new request's bag. Add this regression: old recipe pours before the new
request is refused, then confirmed refusal, expect no used entry. Do not
change the core ownership/packet logic to implement bag accounting.

- [x] **Step 3: Freeze a request in the accepted owner, not a route effect.**

Extend `LiveBrew.start` and `startInPro` with an optional third
`BagRunRequest`. Preserve existing calls. The provider's `begin` resolves
literal-true `bagExperimentEnabled`, the recipe's saved identity and either
the explicit linked unfinished bag or its saved selection.

Use `newBrewId()` for the stable allocation's `runId`. Do not replace existing
BrewRecorder record IDs: a preflight-only automatic retry can replace its
recorder within one live-run generation. Both recorder instances share one
allocation; a user-initiated fresh run gets a new allocation.

Add `bag?: BagRunSnapshot` to the provider's current-run state and pass it
through `RunOwner` to an optional fifth `useBrewRun` argument. Add an optional
sixth `bagStore` argument with the same beginRun/updateRun Pick as the tracker,
so the test injection follows the accepted owner without touching the normal
history store argument. Resolve the
snapshot before the state update; keep the state updater pure. Persist it only
when that generation's owner actually opens its recorder. Thus discarded
same-tick starts cannot leave phantom pending charges.

The resolver has an explicit result:

```ts
export type BagCapture =
    | {kind: "untracked"}
    | {kind: "tracked"; snapshot: BagRunSnapshot}
    | {kind: "unavailable"; message: string};
```

An off switch, ineligible coffee recipe or explicit No bag returns untracked
without opening the store.
Missing/finished/unlinked requested bags, invalid requests and read errors
return unavailable and are notified. A valid result snapshots ID, local name,
optional external name, recipe UUID, actual adjusted dose and resolved tracker.
Do not change a valid preference when starting a brew. If a saved preference
is positively known to reference an unavailable bag, clear it to explicit
No bag and notify; a storage read failure cannot claim this clear succeeded.
An invalid transient route request does not overwrite an unrelated valid
saved selection.

Use one eligibility helper in capture, bag management and Ready ranking:

```ts
export function bagEligible(recipe: Recipe): boolean {
    return !recipe.isTea() && Number.isFinite(recipe.dosage)
        && recipe.dosage > 0 && recipe.pours.length > 0;
}
```

A disabled grinder alone is not evidence of water-only brewing: somebody can
have loaded preground coffee. Test tea, zero-dose and stageless recipes
without modifying their machine inputs.

- [x] **Step 4: Wire existing callbacks without another subscription.**

Add the tracker to the existing `owner.current` object in `useBrewRun`.
`replaceRecorder` retains it and emits `retryBeforeSend` only for the existing
confirmed preflight-retry path. The existing phase listener forwards sending,
grinding and pouring; paused phases use their `was` phase for observation.
Terminal notifications forward ended, except confirmed blocked-before-send
refusals which forward refused. `refuseAttempt` explicitly forwards refused.
No notification listener is added for bag tracking.

Add this mapping to `bagRun.ts`, importing BrewPhase as a type:

```ts
export function bagEventForPhase(phase: BrewPhase): BagRunEvent | null {
    if (phase.name === "paused") return bagEventForPhase(phase.was);
    switch (phase.name) {
        case "sending": return "sending";
        case "grinding": return "grinding";
        case "pouring": return "pouring";
        case "failed": return phase.reason === "blocked" ? "refused" : "ended";
        case "done":
        case "cancelled":
        case "lostContact": return "ended";
        default: return null;
    }
}
```

Keep idle/waking/readyToStart/armed/pressPlay/bypass/settling nonterminal for
accounting. Do not close the allocation when the recorder is replaced or an
effect cleans up for replay.

An onRecord callback carries the frozen snapshot from its owner. Stale
callbacks cannot use the next run's selection or tracker. A normal completed
run and post-pour cancellation use the same already-counted allocation.

Parse `bagSelection?: string` beside current brew-route parameters and pass
the parsed request into `start`/`startInPro`. Keep view mode from starting or
attributing anything. Retries retain that run's intended bag, not a newly
selected bag in a different screen.

- [x] **Step 5: Extend the existing harness and run green.**

In `useLiveBrew.test.tsx`, reuse its existing `harness`, `h.setPhase`,
`h.water`, `h.written`, `renderWithProviders` and `act` helpers. Inject a narrow
bag store dependency into LiveBrewProvider for tests instead of constructing
another provider or mocking SQL arithmetic. Its optional `bagStore` prop is
`Pick<BagFactsStore, "get" | "linked" | "selection"> &
Pick<BagAccountingStore, "beginRun" | "updateRun">`. Thread the same store
through the owner to the tracker; use the shared runtime store only when this
prop is absent and the experiment is actually enabled. The tracker itself
needs only the beginRun/updateRun Pick, not correction or UI methods.

Replace this suite's blanket settings mock with a per-key version:

```ts
let mockBagEnabled = false;
jest.mock("@/hooks/useSetting", () => ({
    ...jest.requireActual("@/hooks/useSetting"),
    sharedSettings: () => ({
        get: (key: string) => key === "bagExperimentEnabled" ? mockBagEnabled
            : key === "bagTracker" ? "xbrw" : 10
    })
}));
beforeEach(() => { mockBagEnabled = false; });
```

Add named cases:

```ts
it("freezes bag A when a second start requests recipe B", async () => {
    const h = harness();
    const first = recipe();
    const second = recipe();
    second.uuid = "second";
    mockBagEnabled = true;
    const physicalBag = bagFixture();
    const bags = {
        get: jest.fn(() => physicalBag),
        linked: jest.fn(() => [physicalBag]),
        selection: jest.fn(() => ({
            recipeUuid: first.uuid, bagId: physicalBag.id, selectedAt: 1
        })),
        beginRun: jest.fn(() => ({...INITIAL_BAG_PROGRESS})),
        updateRun: jest.fn()
    };
    let live!: ReturnType<typeof useLiveBrew>;
    function Read() { live = useLiveBrew(); return null; }
    await renderWithProviders(
        <LiveBrewProvider store={h.store} bagStore={bags}><Read/></LiveBrewProvider>
    );
    await act(async () => live.start(first));
    await h.setPhase({name: "sending"});
    await h.setPhase({name: "pouring", pour: 1, pours: 2});
    await act(async () =>
        live.start(second, undefined, {kind: "explicit", bagId: "bag-b"}));
    expect(live.run?.recipe.uuid).toBe(first.uuid);
    expect(global.__brewer.brew).toHaveBeenCalledTimes(1);
    expect(bags.beginRun).toHaveBeenCalledTimes(1);
    expect(bags.beginRun).toHaveBeenCalledWith(expect.objectContaining({
        recipeUuid: first.uuid, bagId: "bag-a", dose: first.dosage
    }));
});
```

Add bag-store assertions using its injected test seam: selected snapshot
unchanged, one allocation, intended quick-edit dose, and no second charge.
Cover navigation/remount, synchronous double starts, recorder replacement,
turning Labs off mid-run, restart recovery, tracker-write failure and confirmed
preflight refusal. Existing mocks returning `10` for every setting must not
enable the experiment: use `=== true`, not truthiness.

```bash
npx jest --runTestsByPath library/__tests__/bagRunRequest.test.ts library/brew/__tests__/BagRunTracker.test.ts hooks/__tests__/useLiveBrew.test.tsx hooks/__tests__/useBrewRun.test.ts --runInBand
git add library/bagRun.ts library/brew/BagRunTracker.ts library/__tests__/bagRunRequest.test.ts library/brew/__tests__/BagRunTracker.test.ts hooks/useLiveBrew.tsx hooks/useBrewRun.ts app/brew.tsx hooks/__tests__/useLiveBrew.test.tsx hooks/__tests__/useBrewRun.test.ts
git commit -m "feat(bags): freeze optional attribution for the live brew owner" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Historical snapshots and portable backups

**Create:** `library/bagBackup.ts`, `library/__tests__/bagBackup.test.ts`.

**Modify:** `library/brew/BrewRecord.ts`, `library/BrewDatabase.ts`,
`library/backup.ts`, `hooks/useBackup.ts`, `app/settings.tsx`,
`components/RestoreSheet.tsx` and their existing tests.

- [x] **Step 1: Write persistence and restoration red cases.**

Add tests to `library/__tests__/BrewDatabase.test.ts` and the real-SQLite
coverage for insert/restore/hydrate of the optional bag snapshot. Old records
must not acquire a `bag` key.

```ts
// Optional BrewRecord field; no recipe field.
bag?: BagRunSnapshot;
```

Add a `bag TEXT NOT NULL DEFAULT ''` column with a PRAGMA table-info existence
check. Do not broadly swallow ALTER failures. Serialize through the same
`writeBrewRow` used by both live inserts and restores, validate at hydration,
and preserve corrupted raw data with an explicit diagnostic rather than
silently rewriting its identity.

In the existing `useBrewRun` onRecord callback, decorate once before both
`setRecorded` and `insert`:

```ts
const attributed = heldBag === undefined ? record : {...record, bag: heldBag};
setRecorded({runId: id, record: attributed});
database.current?.insert(attributed, taken, frames);
```

`heldBag` is the frozen callback value for that recorder, never a live lookup.
Downstream dial updates preserve the extra field.

- [x] **Step 2: Add the portable inventory contracts and validators.**

```ts
export type BagRunBackup = {
    snapshot: BagRunSnapshot;
    progress: BagRunProgress;
    coveredByBaseline: boolean;
    overlapsBaseline: boolean;
};

export type BagBundle = {
    bag: CoffeeBag;
    baselineGrams: number;
    needsCheck: boolean;
    linkedRecipeUuids: string[];
    runs: BagRunBackup[];
};

export type BagInventoryBackup = {
    version: 2;
    bags: BagBundle[];
    selections: BagSelection[];
};

export type BagBackupResult = {
    inventory: BagInventoryBackup | null;
    skippedBags: number;
    skippedBagRows: number;
    warnings: string[];
};
```

Export `parseBagInventory(value: unknown): BagBackupResult` from
`library/bagBackup.ts`. Rebuild every field explicitly. Reuse strict bag,
snapshot and progress guards, reject duplicate bag/run IDs, validate references,
nonnegative finite quantities and 0..5000 integer baselines. A malformed
accounting row marks its valid bag as needsCheck as well as reporting the
skipped row. An absent collection is normal; a present invalid collection is
a reported problem, never an empty-success fallback. A version other than 2
adds an explicit unsupported-bag-version warning.

A missing runs collection or invalid baseline rejects that bundle with a
reported diagnostic; never substitute its purchase size as trusted remaining
coffee. For a valid baseline with an individually malformed run, retain the
bag but mark needsCheck and report the skipped run.

Add an optional final `inventory?: BagInventoryBackup` argument to
`buildBackup`/`useBackup.exportBackup`; write `bagInventory` only when supplied.
Extend BackupPayload with `bagInventory?: BagInventoryBackup`,
`skippedBags: number`, `skippedBagRows: number` and `bagWarnings: string[]`.
An absent collection sets the counts to zero; present malformed data supplies
the parser's explicit diagnostics.
Keep outer backup version 1 and existing old-file semantics. Validate optional
BrewRecord.bag at `backup.ts`'s existing brew validator and preserve it in the
field-by-field rebuild. No samples enter the inventory bundle.

- [x] **Step 3: Implement portable export and non-overwriting restore.**

Add `exportInventory(): BagInventoryBackup` and
`restoreInventory(inventory): {added: number; skippedRows: number}` to the
bag store. Export the per-run coverage flag directly; neither a device-local
sequence number nor a timestamp comparison is needed in the portable format.

Restore each new bag and all its run rows as a transaction, preserving each
coverage/overlap flag exactly. A locally existing bag wins as a complete unit.
An imported unclosed run has no live owner on this device, so recover only
that imported run to closed used/uncertain, retaining both coverage flags.
Do not run global pending recovery over an existing local live owner.
Existing per-recipe preference rows, including null, win even for a newly
restored bag. Only link saved recipe UUIDs that exist after recipe restore;
keep valid orphan bags but report broken links. Reject conflicting global
run IDs without reassigning them and mark the affected new bag needsCheck.

Add these assertions with two distinct fresh SQLite stores:

```ts
expect(second.restoreInventory(exported).added).toBe(1);
expect(second.balance("bag-a", 18, "xbrw"))
    .toMatchObject({kind: "estimate", remainingGrams: 232});
expect(second.restoreInventory(exported).added).toBe(0);
second.correct("bag-a", 80);
second.restoreInventory(exported);
expect(second.balance("bag-a", 18, "xbrw"))
    .toMatchObject({kind: "estimate", remainingGrams: 80});
```

Expose a constructor/test handle seam only if necessary; use the shared
real-SQLite harness, not an object that simulates arithmetic.

- [x] **Step 4: Wire all backup doors without making Labs a data-loss switch.**

Settings export reads `exportInventory` even with the experiment disabled,
but only when inventory tables exist; an ordinary empty install does not open
or migrate the experiment just to export. Fail export explicitly if existing
bag data is unreadable rather than producing a backup that silently omits it.

After recipe restore succeeds, restore bag inventory with explicit reporting.
The existing settings path already commits recipes/settings/history in stages;
do not claim a global rollback. A bag failure says recipes were restored but
bag restoration failed. Add bag counts and skipped-row warnings to RestoreSheet
and completion copy. This is not permission to change unrelated brew-restore
failure handling.

Do not clear local bags for a replace-library restore; local bags win and only
links to recipes genuinely removed by the replace are pruned. Do not restore
the experiment enable flag or indirect current-selection changes.

- [x] **Step 5: Run green and commit.**

```bash
npx jest --runTestsByPath library/__tests__/bagBackup.test.ts library/__tests__/BrewDatabase.test.ts library/__tests__/backup.test.ts hooks/__tests__/useBackup.test.ts components/__tests__/RestoreSheet.test.tsx app/__tests__/settings.test.tsx --runInBand
git add library/bagBackup.ts library/__tests__/bagBackup.test.ts library/brew/BrewRecord.ts library/BrewDatabase.ts library/backup.ts hooks/useBackup.ts hooks/useBrewRun.ts app/settings.tsx components/RestoreSheet.tsx library/__tests__/BrewDatabase.test.ts library/__tests__/backup.test.ts hooks/__tests__/useBackup.test.ts components/__tests__/RestoreSheet.test.tsx app/__tests__/settings.test.tsx
git commit -m "feat(bags): preserve inventory and historical identity in backups" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Migrate existing preview inventory without guessing old identities

**Create:** `library/bagMigration.ts`,
`library/__tests__/bagMigration.test.ts`.

**Modify:** `library/CoffeeBagDatabase.ts`, `library/bagBackup.ts`.

- [x] **Step 1: Seed the exact legacy schema in a real test DB.**

```sql
CREATE TABLE coffee_bags (
  id TEXT PRIMARY KEY NOT NULL,
  recipeUuid TEXT NOT NULL,
  countedFrom INTEGER NOT NULL,
  finishedAt INTEGER NOT NULL DEFAULT 0,
  bag TEXT NOT NULL
);
```

Write a legacy JSON fixture using the actual #238 shape:
`id`, `recipeUuid`, `sizeGrams`, `boughtOn`, `addedAt`, `countedFrom`,
`gramsAtCount`, optional `roastedOn`, `price`, `beanName` and advice. Seed
done, endedOnMachine, cancelled and failed brews with doses after its anchor.
Assert migration preserves the legacy displayed estimate, not the new counting
definition; preserves two same-named IDs; creates explicit links; does not
invent a bag snapshot on old brews; and is idempotent.

- [x] **Step 2: Run red, then implement the legacy adapter.**

```bash
npx jest --runTestsByPath library/__tests__/bagMigration.test.ts --runInBand
```

Export `migrateLegacyBags(db): {migrated: number; unreadable: number}`.
Inspect `sqlite_master` before querying the legacy table. Decode the pinned
legacy fields with a separate validator. For each new ID, compute its old
open-bag estimate with the original COUNTED_SQL semantics:

```sql
SELECT COALESCE(SUM(dose), 0) AS used
FROM brews
WHERE recipeUuid = ? AND startedAt >= ?
  AND outcome IN ('done', 'endedOnMachine');
```

Create the v2 baseline as the old displayed remaining amount, preserve saved
facts and finished state, link its valid saved recipe, and select only an
unfinished bag where no local selection exists. If a legacy recipe has more
than one open bag, preserve all of them; select the most recently added one
with stable ID tie-breaking, matching the old library's displayed choice.
Do not finish the others.

For finished legacy bags without a trustworthy final remaining snapshot,
preserve their saved baseline and finished state with needsCheck rather than
claiming a measured final quantity. Missing recipes leave orphan bags, not
deleted bags. Missing legacy display names may use the saved bean name,
saved recipe display name or the literal Coffee bag, without merging IDs.

Keep the original legacy table unchanged as recovery evidence. An unreadable
row increments an explicit diagnostic count; preserve it and show that some
old bag data needs attention. Reopening the store must not repeat warnings
every render.

Keep a per-ID migration receipt so deleting a migrated bag does not resurrect
it from that recovery table at the next launch. Unreadable native legacy
rows block inventory export explicitly rather than producing an incomplete
backup. Backups discover legacy-only inventory even while Labs is disabled.

- [x] **Step 3: Handle legacy backup `bags` arrays separately.**

When outer backup JSON contains legacy `bags` but no v2 bagInventory, use the
same legacy validator. Compute each baseline only from the legacy backup's
own supplied brew records, never from additional local history. Missing or
invalid brew evidence makes the imported balance needsCheck. Existing local
v2 state still wins. A valid empty v2 collection must not accidentally trigger
the legacy adapter.

- [x] **Step 4: Run green and commit.**

```bash
npx jest --runTestsByPath library/__tests__/bagMigration.test.ts library/__tests__/bagBackup.test.ts library/__tests__/CoffeeBagDatabase.test.ts --runInBand
git add library/bagMigration.ts library/__tests__/bagMigration.test.ts library/CoffeeBagDatabase.ts library/bagBackup.ts
git commit -m "feat(bags): migrate preview inventory without rewriting its history" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 7: Reuse and qualify freshness advice and the local-day clock

**Create/reuse:** `library/roastAdvice.ts`, `library/restPeak.ts`,
`hooks/useNow.ts`, their source tests.

**Modify:** `library/podCoffee.ts`, `library/brewmindLink.ts`,
`library/roasterRecipes.ts:73-80` and their tests.

- [x] **Step 1: Reuse only the pinned pure/calendar files.**

For files not already introduced by Task 1, extract this bounded source patch:

```bash
git diff --binary 06ba667e143baf05f7ab89ec1af48493b39febf5 797f1b3be1d53773973e6808d91b4402a75cd05c -- library/restPeak.ts library/__tests__/restPeak.test.ts hooks/useNow.ts hooks/__tests__/useNow.test.ts | git apply --3way
```

Use the pinned roastAdvice implementation as the starting point, retaining
whole-day bounds 0..540, then enforce
`restDays <= peakDay <= bestUntilDay` wherever both adjacent fields exist;
also check rest/best ordering when peak is absent. Supplied invalid ordering
produces a field/problem result rather than a confident freshness state.

- [x] **Step 2: Add red source/estimate and disabled-clock tests.**

```ts
it("does not turn an unknown roast into known medium information", () => {
    const answer = startingFigures(undefined);
    expect(answer.source).toBe("estimate");
    expect(answer.level).toBeUndefined();
});

it("produces no freshness for missing or inconsistent bag advice", () => {
    expect(freshnessOf(bagFixture(), BAG_NOW)).toBeNull();
    expect(freshnessOf(bagFixture({
        restDays: 30, peakDay: 10, bestUntilDay: 42
    }), BAG_NOW)).toBeNull();
});
```

Add a hook test that disabled useNow schedules no timer or AppState listener,
then enabled updates at the next local midnight and foreground. Use awaited
`renderHook`. Keep the source's DST tests and verify re-enable refreshes stale
time through a tagged reading rather than setState at effect entry.

- [x] **Step 3: Adapt the public advice contract and clock.**

`startingFigures` returns `{figures, level?: RoastLevelKey, source}`.
Known explicit coffee advice uses source coffee; known roast-level defaults
and generic defaults use estimate. Unknown roast has no selected level, even
if the editable generic figures start from the existing medium defaults.
Saving an edited field records user source; later recipe edits do not rewrite
the bag.

Change the hook to `useNow(clock = Date.now, enabled = true): number | null`.
It remains unconditional, but no timer/listener runs when disabled.
Do not call the clock during a render-time state reset. Tag readings with a
generation and take the refreshed reading from a timer callback:

```ts
export function useNow(clock = Date.now, enabled = true): number | null {
    const [mode, setMode] = useState({enabled, generation: 0});
    const [reading, setReading] = useState(() => ({
        generation: 0, now: clock()
    }));
    if (mode.enabled !== enabled) {
        setMode({enabled, generation: mode.generation + 1});
    }
    const generation = mode.generation;
    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            const now = clock();
            setReading({generation, now});
            const day = new Date(now);
            const next = new Date(
                day.getFullYear(), day.getMonth(), day.getDate() + 1
            ).getTime();
            timer = setTimeout(refresh, Math.max(1, next - now));
        };
        timer = setTimeout(refresh, 0);
        const listener = AppState.addEventListener("change", state => {
            if (state !== "active") return;
            if (timer !== undefined) clearTimeout(timer);
            refresh();
        });
        return () => {
            if (timer !== undefined) clearTimeout(timer);
            listener.remove();
        };
    }, [clock, enabled, generation]);
    return enabled && reading.generation === generation ? reading.now : null;
}
```

Import useState/useEffect from React and AppState from react-native. Before
the enabled generation has a current clock reading, suppress freshness
badges/Ready suggestions rather than briefly recommending a resting bag from
stale time. Quantity UI does not need to wait for this clock.

Apply the pinned small `PodCoffee & RoastAdvice` and BrewMind parameter alias
changes manually onto current develop, retaining Package E's `flavours` and
other metadata. Do not apply the entire old podCoffee file. Pass the already
validated `FeedCoffee.roast` day values into saved coffee metadata in
`library/roasterRecipes.ts:73-80`; do not introduce a second feed request.

```ts
const bean = {
    ...coffee.coffee,
    ...reviveRoastAdvice(coffee.roast ?? {}),
    ...(roaster ? {roaster} : {})
};
```

The current feed parser already uses camel-case advice fields. Do not run
this object through the source's snake-case `roastAdviceFromFeed` without
adapting that helper. Preserve the ordinary catalogue's roast-advice text
when the bag experiment is disabled.

Use Provided with coffee, Estimated peak window, Generic estimate and
Outside the estimated window rather than assertions of taste or expiry.
Missing roast date produces no status. Saved invalid/future roast dates
produce a visible correction problem, not an invented ready date.

- [x] **Step 4: Run green and commit.**

```bash
npx jest --runTestsByPath library/__tests__/restPeak.test.ts hooks/__tests__/useNow.test.ts library/__tests__/podCoffee.test.ts library/__tests__/brewmindLink.test.ts library/__tests__/roasterRecipes.test.ts --runInBand
git add library/roastAdvice.ts library/restPeak.ts hooks/useNow.ts library/__tests__/restPeak.test.ts hooks/__tests__/useNow.test.ts library/podCoffee.ts library/brewmindLink.ts library/roasterRecipes.ts library/__tests__/podCoffee.test.ts library/__tests__/brewmindLink.test.ts library/__tests__/roasterRecipes.test.ts
git commit -m "feat(bags): distinguish supplied guidance from freshness estimates" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 8: One Labs gate and approved bag selection UI

**Create/adapt:** `hooks/useCoffeeBag.ts`, `hooks/useBagLibrary.ts`,
`components/SelectedBagRow.tsx`, `components/BagPickerSheet.tsx`,
`components/BagSection.tsx`, `components/BagSheet.tsx`,
`components/RoastDayField.tsx`.

**Modify:** `library/Settings.ts`, `app/settings.tsx`,
`app/editRecipe.tsx`, `app/index.tsx`, `components/AboutDeck.tsx`, relevant tests,
`package.json`, `package-lock.json`, `jest.setup.js`, generated licences.

- [ ] **Step 1: Add disabled-path tests before adding the settings row.**

In `app/__tests__/settings.test.tsx`, `app/__tests__/editRecipe.test.tsx`
and new `hooks/__tests__/useCoffeeBag.test.ts`, assert literal default false;
restoring even `bagExperimentEnabled: true` leaves current local opt-in
unchanged; hidden Labs does not reset an explicitly enabled experiment;
off opens no bag store and renders no bag elements; read errors produce a
visible problem rather than No bag.

Add these defaults and exclude their device-local state explicitly:

```ts
bagExperimentEnabled: false,
bagTracker: "auto" as BagTrackerSetting,
readyToBrewDismissedOn: "",
```

Add all three to `BackupExcluded` and `NOT_IN_BACKUP`; never add them to
`applySettings`. The tracker follows the local Beanconqueror preference in
auto mode, so copying it between devices is not appropriate here.

- [ ] **Step 2: Add the single explicit opt-in and enabled-only hooks.**

```tsx
<SettingsToggleRow
    label="Coffee bags"
    description="Experimental bag tracking, freshness estimates and brew suggestions. Off by default and may not stay in the app."
    value={bagExperimentEnabled}
    onChange={changeBagExperiment}
/>
```

`changeBagExperiment(true)` marks existing local bag estimates needsCheck
before enabling; failures notify instead of claiming success. Disabling must
remain possible even if reading inventory fails. Existing active-run
snapshots are unaffected. Changes to explicit tracker choice or the local
Beanconqueror switch while auto is selected also mark the new local estimate
as needing a check, without retrospective history replay.

Use `useSyncExternalStore` for bag revision subscriptions, with a stable no-op
subscription and constant disabled snapshot when off. The hooks return a
discriminated `{status: "off" | "ready" | "error"}` result; the error branch
contains a user-facing message. No broad catch returning null.

Add one grouped selected-recipe read to CoffeeBagDatabase, joining
`coffee_bag_selections`, valid links, `coffee_bags_v2`, `recipes` and grouped
accounting. Return `{recipe, bag, balance, selectedAt}` rows after validation.
Never call `getRecipe` once per card or use the currently filtered
`library.recipes` as a whole-inventory lookup.

- [ ] **Step 3: Reuse only the three named bag presentation files.**

```bash
git diff --binary 8f2638dfa2e75928ff447fbbd0ee03ba14986886 dcf0343a2e6501027781738dc35ab78a0d27acd3 -- components/BagSection.tsx components/BagSheet.tsx components/RoastDayField.tsx | git apply --3way
```

Review this exact generated diff before applying. It is bounded presentation
reuse, not preview integration. Replace source-model dependencies with the
new explicit bag/balance contracts. Use `useAppearance` in every helper;
do not bring over the preview-only `primary.disabledFill/disabledInk` API.
Disabled filled controls can use the existing `palette.control` and
`palette.dim`, with disabled accessibility state. Keep canonical colour
identity and the appearance resolver unchanged.

Omit the imported add-bean codec/action from BagSheet in this checkpoint;
Task 10 adds that explicit external action with the qualified identity
implementation. Do not leave imports of not-yet-created bagBean/beanLink
modules. The Ready card is extracted in Task 9 with its ranking dependency.

For RoastDayField's native picker, add the source's SDK-compatible
`@react-native-community/datetimepicker` manifest change, then use the existing
SDK-aware installation command during execution. If npm reports EALLOWSCRIPTS,
follow the repository's expected-version/Doctor route; do not bypass trust
policy or run blocked postinstalls. Regenerate licences, never edit them.
Do not overwrite current app.json with #238's old version/runtime settings;
the task base uses the accepted 2.2.0/fingerprint configuration. Native clients
will need separate authorised rebuilds.

- [ ] **Step 4: Add the complete selected-bag row and chooser bindings.**

```tsx
import {Text, XStack, YStack} from "tamagui";
import {useAppearance} from "@/hooks/useAppearance";

export function SelectedBagRow({
    label, detail, onPress
}: {label: string; detail: string; onPress: () => void}) {
    const {palette} = useAppearance();
    return (
        <XStack accessibilityRole="button"
                accessibilityLabel={`Bag, ${label}, ${detail}`}
                accessibilityHint="Choose a bag or brew without tracking."
                testID="selected-bag-row" onPress={onPress}
                minHeight={44} paddingVertical="$2" gap="$3"
                alignItems="center" justifyContent="space-between"
                borderTopWidth={1} borderColor={palette.line}>
            <YStack flex={1} minWidth={0}>
                <Text color={palette.text} fontSize={13}>{label}</Text>
                <Text color={palette.dim} fontSize={12}>{detail}</Text>
            </YStack>
            <Text color={palette.dim} accessible={false}>{">"}</Text>
        </XStack>
    );
}
```

The chooser props are:

```ts
type BagPickerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipeName: string;
    linked: readonly CoffeeBag[];
    selectedId: string | null;
    summaryFor: (bag: CoffeeBag) => string;
    onSelect: (id: string | null) => void;
    onLinkExisting: () => void;
    onAdd: () => void;
};
```

Render an XbrwSheet with accessible radio rows for No bag and each linked
unfinished bag, then Use another existing bag and Add a bag actions.
Use the same source XbrwSheet/scrollable row construction as BagSheet; radio
rows have minimum 44-point targets and `accessibilityState.checked`.
The existing-bag subview lists all unfinished physical bags, not just those
already linked. Selection calls the store transaction and closes; failures
notify and leave the chooser open. Adding uses the explicit ADD AND USE BAG
action, creating, linking and selecting as one transaction.

BagSheet adds a required local name in both tracker modes and a separately
editable external name in Beanconqueror mode. A pod must not make the external
name read-only: two bags of that pod can need distinct names. Existing roast
advice is always editable and labelled by source.

Expose all three saved guidance values as whole-day fields. Add
`bestUntilDay` alongside the source rest/peak inputs; validate the assembled
object through `roastAdviceProblem` before save. Do not keep moving an
explicitly edited best-window end when the peak changes. For example:

```ts
const starting = startingFigures(bag ?? coffee);
const initialFigures = starting.figures;
const initialSource = bag?.adviceSource ?? starting.source;
const [rest, setRest] = useState(String(initialFigures.restDays));
const [peak, setPeak] = useState(String(initialFigures.peakDay));
const [best, setBest] = useState(String(initialFigures.bestUntilDay));
const advice = {
    restDays: wholeNumber(rest),
    peakDay: wholeNumber(peak),
    bestUntilDay: wholeNumber(best)
};
const adviceProblem = Object.values(advice).some(value => value === undefined)
    ? "Enter whole days, 0 to 540." : roastAdviceProblem(advice);
```

Bind the third field to `best`/`setBest` with the same input, label and error
styling as the two existing day fields. Saving records `adviceSource: "user"`
when any guidance input or roast-level choice was changed; otherwise preserve
initialSource. Keep form state keyed by the existing sheet epoch.

Only a touched remaining-grams field requests a correction:

```tsx
const [leftTouched, setLeftTouched] = useState(false);
const leftOk = !leftTouched || isGramsLeft(wholeNumber(left));

<TextInput value={left} onChangeText={(value) => {
    setLeft(value);
    setLeftTouched(true);
}} />
```

In the save payload, include `gramsLeft` only when touched and valid. Merely
editing a name, size, roast date or price must not reset a baseline from a
stale prefilled reading. Initial creation seeds size; later size edits change
purchase facts only. A needsCheck balance may be corrected explicitly but
does not force a correction to save unrelated bag facts.

- [ ] **Step 5: Integrate layout A and cover screen accessibility.**

Wrap the existing editor action buttons in a measured YStack containing the
selected-bag row only when enabled and linked bags exist. Preserve the
existing single SplitBrewButton and its external action-bar ownership. Pass
the measured complete height to the existing quick-edit layer and scroll
padding; do not hardcode a new panel height.

Render ABOUT management behind the same flag. New unsaved recipes show the
save-before-link explanation; they can still brew without tracking. Bag
actions on a saved recipe must not save its unsaved parameters.

In home TUNE, compose SelectedBagRow above the existing QuickEditPanel rather
than adding dose presets or rewriting QuickEditPanel. Include all open bag
sheets in each host's `screenCovered` guard; Android sibling accessibility
does not follow `accessibilityViewIsModal`.

Add `bagSelection: bagRunParam(selectedId)` to the editor/home navigation
payloads only when the experiment is enabled; absent remains the existing
normal path. An explicit No bag is encoded as JSON null.

- [ ] **Step 6: Run green and commit.**

Add `components/__tests__/SelectedBagRow.test.tsx`,
`BagPickerSheet.test.tsx`, adapt source `BagSheet.test.tsx` and
`BagSection.test.tsx`, and exercise small-screen/large-text action-bar
geometry in the existing editor tests. All component render/press operations
are awaited through `renderWithProviders`. Use the existing sheet press retry
helper/budget rather than inventing delays.

```bash
npx jest --runTestsByPath hooks/__tests__/useCoffeeBag.test.ts components/__tests__/SelectedBagRow.test.tsx components/__tests__/BagPickerSheet.test.tsx components/__tests__/BagSheet.test.tsx components/__tests__/BagSection.test.tsx app/__tests__/editRecipe.test.tsx app/__tests__/settings.test.tsx --runInBand
npm run typecheck
git add library/Settings.ts library/CoffeeBagDatabase.ts hooks/useCoffeeBag.ts hooks/useBagLibrary.ts components/SelectedBagRow.tsx components/BagPickerSheet.tsx components/BagSection.tsx components/BagSheet.tsx components/RoastDayField.tsx app/settings.tsx app/editRecipe.tsx app/index.tsx components/AboutDeck.tsx hooks/__tests__/useCoffeeBag.test.ts components/__tests__/SelectedBagRow.test.tsx components/__tests__/BagPickerSheet.test.tsx components/__tests__/BagSheet.test.tsx components/__tests__/BagSection.test.tsx app/__tests__/editRecipe.test.tsx app/__tests__/settings.test.tsx package.json package-lock.json jest.setup.js constants/licences.ts
git commit -m "feat(bags): add default-off Labs controls and optional bag chooser" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 9: Selected-bag badges and one deduplicated Ready suggestion

**Create:** `library/readyToBrew.ts`,
`library/__tests__/readyToBrew.test.ts`,
`app/__tests__/index.readyToBrew.test.tsx`,
`components/__tests__/ReadyToBrewCard.test.tsx`.

**Modify:** `app/index.tsx`, `components/ReadyToBrewCard.tsx`,
`components/RecipeCard.tsx`, `components/RecipeShelfTile.tsx`,
`components/SwipeableRecipeRow.tsx`, `components/ShelfRoom.tsx`.

- [ ] **Step 1: Add pure selection tests before UI wiring.**

Define this ranking input and output; `ReadyEntry` retains the whole explicit
pair through navigation:

```ts
export type ReadyEntry = {
    recipe: Recipe;
    bag: CoffeeBag;
    balance: BagBalance;
    selectedAt: number;
    freshness: FreshnessReading | null;
};

export function readyToBrew(
    entries: readonly ReadyEntry[]
): ReadyEntry[] {
    const onePerBag = new Map<string, ReadyEntry>();
    for (const entry of entries) {
        if (!bagEligible(entry.recipe)) continue;
        if (entry.bag.finishedAt !== undefined) continue;
        if (entry.freshness?.state === "resting") continue;
        if (entry.balance.kind === "estimate" && entry.balance.empty) continue;
        const old = onePerBag.get(entry.bag.id);
        if (old === undefined || entry.selectedAt > old.selectedAt
            || (entry.selectedAt === old.selectedAt
                && entry.recipe.uuid < old.recipe.uuid)) {
            onePerBag.set(entry.bag.id, entry);
        }
    }
    const rank = (entry: ReadyEntry) =>
        entry.freshness?.state === "peak" ? 0
            : entry.freshness?.state === "ready" ? 1 : 2;
    return [...onePerBag.values()].sort((a, b) =>
        rank(a) - rank(b) || b.selectedAt - a.selectedAt
        || (a.bag.id < b.bag.id ? -1 : a.bag.id > b.bag.id ? 1 : 0));
}
```

Test same bag selected by two recipes produces one entry; most-recent
explicit selection wins; ID ties are stable; resting, finished and known-zero
are omitted; insufficient-for-current-dose but positive quantity is not
treated as empty; unknown advice and uncertain quantity do not invent status.

- [ ] **Step 2: Wire the card and all library badge surfaces.**

Extract only the remaining appearance-qualified card after creating its
ranking module:

```bash
git diff --binary 8f2638dfa2e75928ff447fbbd0ee03ba14986886 dcf0343a2e6501027781738dc35ab78a0d27acd3 -- components/ReadyToBrewCard.tsx | git apply --3way
```

Use `useBagLibrary`'s whole-inventory selected rows, not the filtered recipe
list. Compute freshness with enabled useNow, then pass explicit ReadyEntry
objects to the generic card. `name` is the exact recipe display name, not a
different pod label that obscures which recipe will brew. Include the bag's
name/roast date in its detail and the appropriate `balanceLine`.

`onBrew(entry)` navigates with that entry's recipe JSON and
`bagRunParam(entry.bag.id)`. Do not re-resolve a different selection when
handling the card press. The provider still validates the explicit pair at
acceptance and warns/untracks if it became unavailable.

Keep one card below the rail, hidden during shelf selection, shelf-room
viewing or library editing. Dismissal writes the local calendar day to
`readyToBrewDismissedOn`. Cycle through the deduplicated array; if data changes
invalidate the current entry, use a tagged selection keyed by candidate IDs,
not an effect resetting state. Empty candidates render nothing.

Pass optional derived bag/freshness badge text and accessible descriptions
through RecipeCard, RecipeShelfTile, SwipeableRecipeRow and ShelfRoom.
Only the selected bag contributes; explicit No bag has no badge. Disabled
screens pass nothing and do not read inventory. Use the existing card metadata
line, not a new stacked information panel.

- [ ] **Step 3: Run the red/green UI cases and commit.**

Render the home route with source Ready card tests adapted to the new input.
Assert off/no selections hides it, a filtered library still recommends from
valid whole-inventory selections, displayed recipe and bag match route params,
No bag suppresses its badge, dismissal refreshes on local day change, and
photos honour existing photo settings/error behaviour.

```bash
npx jest --runTestsByPath library/__tests__/readyToBrew.test.ts components/__tests__/ReadyToBrewCard.test.tsx app/__tests__/index.readyToBrew.test.tsx components/__tests__/RecipeCard.test.tsx components/__tests__/RecipeShelfTile.test.tsx --runInBand
git add library/readyToBrew.ts library/__tests__/readyToBrew.test.ts app/index.tsx components/ReadyToBrewCard.tsx components/RecipeCard.tsx components/RecipeShelfTile.tsx components/SwipeableRecipeRow.tsx components/ShelfRoom.tsx app/__tests__/index.readyToBrew.test.tsx components/__tests__/ReadyToBrewCard.test.tsx components/__tests__/RecipeCard.test.tsx components/__tests__/RecipeShelfTile.test.tsx
git commit -m "feat(bags): suggest one explicit bag and recipe at a time" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 10: Beanconqueror identity must follow the brewed bag

**Create/reuse:** `library/brew/handoff/beanLink.ts`,
`library/brew/handoff/bagBean.ts`,
`library/brew/handoff/__tests__/beanLink.test.ts`,
`library/brew/handoff/__tests__/bagBean.test.ts`.

**Modify:** `library/brew/handoff/envelope.ts`,
`hooks/useBrewHandoff.ts`, `hooks/useBrewRecordHandoff.ts`,
`app/brew.tsx`, `app/brewRecord.tsx`, `components/BagSheet.tsx`,
`constants/network.ts`, related tests.

- [ ] **Step 1: Reuse the existing pinned bean-link codec and independent tests.**

```bash
git diff --binary 7108d0c3ad2563014de18dfa9879994942716eea 06ba667e143baf05f7ab89ec1af48493b39febf5 -- library/brew/handoff/beanLink.ts library/brew/handoff/__tests__/beanLink.test.ts | git apply --3way
```

Keep the existing supported wire types and chunking. Validate calendar dates
with `calendarDay` before formatting local midnight; add a Feb-31 regression
instead of letting Date roll it into March. Add the add-bean deep-link prefix
to the existing network inventory and its test if that inventory enumerates
outbound transports; do not introduce a service endpoint or automatic launch.

- [ ] **Step 2: Write the historic identity regression first.**

In the existing envelope fixtures, add a record whose coffee.name is the same
for two physical bags but `record.bag.beanName` is bag-specific. Change the
current recipe's selected bag after the record. Assert the historic envelope
still names its original bag; a confirmed hint may override that name, while
records without bag metadata preserve the existing pod-first behaviour.

- [ ] **Step 3: Replace the bag-aware branch of `beanFor`, preserving legacy behaviour.**

```ts
if (brew.bag !== undefined) {
    const confirmed = hint?.trim();
    const saved = brew.bag.beanName?.trim();
    const name = confirmed || saved;
    if (!name) return undefined;
    return brew.coffee === undefined
        ? {name}
        : {...handoffBean(brew.coffee), name};
}
```

Insert before the current pod-first branch; keep that branch unchanged for
old/untracked records. The current implementation ignores a hint whenever
brew.coffee exists, so merely changing the BeanNameSheet suggestion is not
enough.

For an attributed bag without confirmed external identity, show the existing
name confirmation even if coffee metadata exists. Skip sends without a bag
identity instead of guessing another same-named external bag. Do not place
local bag IDs or inventory balances into the vendor-neutral envelope.
Backfill from a current recipe must not replace `record.bag`.

Add-bean handoff is an explicit action from BagSheet, using the selected
physical bag's facts and an editable confirmed external name. Save that name
only after the chosen local action succeeds. `Linking.openURL` rejection
notifies failure and must not claim an external bag was created. Opening
another app is not evidence that it accepted the bean; phrase confirmation
accordingly.

For `bagBean.ts`, keep the pinned `RecipeLike` and `bagShareBean` metadata
mapping, not the old recipe-based name guess. Replace its naming helpers with:

```ts
export function bagBeanName(bag: Pick<CoffeeBag, "beanName" | "name">): string {
    return bag.beanName?.trim() || bag.name.trim().slice(0, BAG_BEAN_NAME_MAX);
}

export function handoffBeanName(
    snapshot: Pick<BagRunSnapshot, "beanName"> | null | undefined
): string | undefined {
    const name = snapshot?.beanName?.trim();
    return name ? name : undefined;
}
```

Import BAG_BEAN_NAME_MAX from coffeeBag and BagRunSnapshot as a type from
bagRun. Remove `bagBeanNameFixed` and the recipe-name parser import; no caller
should lock a physical bag's name to a pod name. Preserve the explicit `name`
argument to `bagShareBean(recipe, bag, name)` and validate it at the action
boundary before invoking the codec.

The brew and record screens use their record's snapshot, never
`sharedBagDatabase().openFor(record.recipeUuid)`. Batch handoff uses saved
historic identity when present and does not start a questionnaire per row.

- [ ] **Step 4: Run green and commit.**

```bash
npx jest --runTestsByPath library/brew/handoff/__tests__/beanLink.test.ts library/brew/handoff/__tests__/bagBean.test.ts library/brew/handoff/__tests__/envelope.test.ts hooks/__tests__/useBrewHandoff.test.ts hooks/__tests__/useBrewRecordHandoff.test.ts hooks/__tests__/useBrewBatchHandoff.test.ts library/__tests__/networkInventory.test.ts --runInBand
git add library/brew/handoff/beanLink.ts library/brew/handoff/bagBean.ts library/brew/handoff/envelope.ts library/brew/handoff/__tests__/beanLink.test.ts library/brew/handoff/__tests__/bagBean.test.ts library/brew/handoff/__tests__/envelope.test.ts hooks/useBrewHandoff.ts hooks/useBrewRecordHandoff.ts app/brew.tsx app/brewRecord.tsx components/BagSheet.tsx hooks/__tests__/useBrewHandoff.test.ts hooks/__tests__/useBrewRecordHandoff.test.ts hooks/__tests__/useBrewBatchHandoff.test.ts constants/network.ts library/__tests__/networkInventory.test.ts
git commit -m "feat(bags): hand off the bag actually used by each brew" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 11: Qualification, release notes and an explicit execution stop

**Create:** `components/__tests__/bagAppearance.test.tsx`.

**Modify:** existing route/restore tests, `docs/copy.md`,
`docs/release-2.2.0-changes.md`, this plan's completion checkboxes.

- [ ] **Step 1: Add the cross-surface qualification matrix.**

Reuse the existing AppearanceProvider test construction and iterate all
THEME_IDS with both recipe colour modes. Render chooser, selected row,
ABOUT facts, quantity-check state, Ready card and disabled controls. Assert
rendered text, roles and colour treatment through accessible elements, not
removed RNTL tree/prop inspection APIs.

Extend real-DB route tests for the complete sequence: two recipes, one
physical bag, two doses, one preflight refusal, post-pour cancellation,
manual correction, history deletion, backup, restore and a second import.
Keep explicit No bag and local opt-in unchanged throughout.

Use existing fixtures to compare canonical recipe JSON/card bytes and
untracked handoff output before/after opt-in. Verify existing frozen-image
capture tests remain unchanged and pass; the bag feature does not add
inventory content to story cards.

- [ ] **Step 2: Run targeted checks, then existing full gates once.**

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
```

Expected: typecheck succeeds; lint has no errors; both Jest projects pass;
Expo Doctor succeeds. Record actual warnings/skips rather than calling them
zero. Serialize full suites; do not launch duplicate heavy validation from
agents or reuse another worktree's node_modules.

- [ ] **Step 3: Document manual and native gates without claiming them passed.**

In the release ledger, record this experiment as default-off and removable.
Credit the three source proposals and the explicit many-to-many/accounting
adaptation. Record #239 as separate, not implicitly completed.

Manual beta cases: enable/disable/re-enable, large text and keyboard on a
small screen, VoiceOver/TalkBack sheet coverage, same-coffee bags, paired
recipes, stale/empty estimates and explicit correction, an interruption after
beans are spent, app termination/reopen, and an actual Beanconqueror add-bean
plus historic-brew handoff. Confirm no automatic app opening.

A new native client is required for the introduced date picker and already
accepted native appearance dependencies. Obtain build permission; do not
pretend Metro alone updates a native client. Existing BLE/NFC hardware
release gates remain in force. No card writes are needed just to qualify
the bag model.

Append this factual release-note section, filling only the actual software
evidence after the preceding commands have completed:

```markdown
## Package F: Optional coffee bag beta experiment

Adapted from #238, #241 and #242. Off by default in Labs. Physical bags can
be shared by recipes, and a recipe can remember one of several bags or No bag.
Remaining coffee and freshness windows are estimates, not measurements or
guarantees. Ready to brew suggests one explicit recipe and bag.

Disabling preserves data and stops new attribution. A brew already accepted
keeps its bag. Beanconqueror mode does not claim synchronised local inventory.
Backups preserve inventory without enabling it on another device.

Manual native, accessibility, interruption and Beanconqueror qualification
remain pending until separately recorded. Final inclusion requires an
explicit retain, revise or remove decision after beta feedback. #239 is
separate.
```

- [ ] **Step 4: Commit/push the verified task and stop at the permission boundary.**

```bash
git add components/__tests__/bagAppearance.test.tsx docs/copy.md docs/release-2.2.0-changes.md docs/superpowers/plans/2026-10-23-bag-experiment.md
git commit -m "test(bags): qualify the optional beta experiment" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:refs/heads/feat/2.2.0-bag-labs-20261023
git fetch origin --no-prune
npm run worktrees:check
```

Report exact base/head/worktree, dirty/push state and pending manual gates.
Ask separately before opening a focused PR or integrating into the cumulative
preview. Request no second review on #238/#241/#242. Do not merge or close
source PRs just because this task is implemented. Do not create a new #239
spec or implementation as an incidental follow-up.

## Plan self-review coverage index

| Approved spec | Implementing tasks |
| --- | --- |
| Purpose, source boundaries and #239 exclusion | Contract; Tasks 1, 7, 8, 11 |
| Default-off gate, disable gaps and no off-path routine work | Tasks 4, 8, 9 |
| Many-to-many and persistent explicit No bag | Tasks 1, 2, 8 |
| Immutable accepted-run identity | Tasks 3, 4, 5 |
| Failed/interrupted consumption, correction ordering and history independence | Tasks 3, 4, 5 |
| Layout A, ABOUT management and optional chooser | Task 8 |
| Freshness truthfulness and calendar changes | Tasks 1, 7, 9 |
| One explicit Ready pair and local dismissal | Task 9 |
| Beanconqueror ownership and historical identity | Tasks 4, 5, 8, 10 |
| Old/new backup validation, local-state precedence and preview migration | Tasks 5, 6 |
| Both platforms, appearance, accessibility and native/hardware gaps | Task 11 |
| Beta exit without analytics or automatic product commitment | Task 11 and release decision after tester feedback |
