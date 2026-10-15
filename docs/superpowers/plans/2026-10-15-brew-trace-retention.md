# Brew trace retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the count-based trace expiry and manual pin with compressed trace storage and a size-budgeted, tiered sweep (default 10 MB).

**Architecture:** A pure `library/brew/traceCodec.ts` compresses samples and frame logs. `BrewDatabase` writes the compressed form, reads both formats, and sweeps by total stored bytes in three tiers. The `brewTraceBudgetMB` setting replaces `brewTraceRetention`. The pin UI goes away.

**Spec:** `docs/superpowers/specs/2026-10-15-brew-trace-retention-design.md`

**Rules that apply to every task:** work only in `/Users/jesperhessius/Dev/XBRW-trace-retention-20261015`; await `render`/`renderHook`/`fireEvent`; SQL tests use `createTestDatabase` from `test-utils/sqlite.ts`; no em dashes in copy; colours and motion from the constants modules; no hand-written `useMemo`/`useCallback`; commit each task with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Run jest as `npx jest --runTestsByPath <files> --maxWorkers=2 --silent` (both platform projects run).

## Findings that amend the spec

1. **Lossless layout.** Real samples have float `water`/`cup` that are not millisecond-exact (1,175 values in the sample brew), so delta-coding them risks drift. Delta only the integer `at` and `pour` columns; store `water` and `cup` verbatim. Measured: 64 KB raw to 6.4 KB gzip (about 10x). Plain base64 adds a third, so roughly 8.6 KB per brew, about 1,100 brews in 10 MB.
2. **Existing "no trace" wording stays.** `BrewHistoryRow` already shows `NO TRACE KEPT` and the record screen already says "No trace was kept for this brew." (`components/BrewSummary.tsx`). No new tag or sentence is needed; Task 6 only checks copy still reads correctly now that nothing is "kept" by the user.
3. **Compare screen "Keep this trace" is removed** (`canKeepTrace`, `keepSurvivingTrace`, `COMPARE_PINNED`), because tiering supersedes it.
4. **Recipe identity** for the per-recipe tier is `brews.recipeUuid` (indexed).
5. **Hermes has no `btoa`/`atob`.** The codec needs its own base64, like `library/brew/handoff/encode.ts` (`base64Url`).

## File map

- Create `library/brew/traceCodec.ts`, `library/brew/__tests__/traceCodec.test.ts`
- Create `library/__tests__/BrewDatabase.retention.test.ts`
- Modify `library/BrewDatabase.ts`, `library/Settings.ts`, `hooks/useBrewHistory.ts`, `app/_layout.tsx`, `app/settings.tsx`, `components/MachineSection.tsx`, `app/brewRecord.tsx`, `app/brew.tsx`, `components/BrewHistoryRow.tsx`, `hooks/useBrewComparison.ts`, `app/brewCompare.tsx`, `constants/brewCopy.ts`, `library/brew/BrewRecord.ts`, `library/backup.ts`, `docs/copy.md`
- Update tests that reference pinning/retention (list in Task 5).

---

### Task 1: Trace codec

**Files:** create `library/brew/traceCodec.ts`, `library/brew/__tests__/traceCodec.test.ts`

- [ ] **Step 1: Write failing tests.** Cover: round trip of a 1,000-sample stream with float `water`/`cup` (exact equality via `toEqual`); empty stream; `decodeSamples` accepts legacy raw JSON array text; `decodeSamples` returns `[]` for garbage and for a corrupt `z1:` payload; output is deterministic (same input, same string); `encodeText`/`decodeText` round trip a 256-line frame log and accept legacy raw text; encoded form starts with `z1:`; encoded length is under 25% of `JSON.stringify(samples)` length for a realistic series (build one in the test: `at` steps of about 200-250 ms, `water` ramping, `cup` floats such as `16.44499969482422`).
- [ ] **Step 2: Run, expect failure** (module missing).
- [ ] **Step 3: Implement.**

```ts
import {gunzipSync, gzipSync, strFromU8, strToU8} from "fflate";
import type {BrewSample} from "@/library/brew/BrewRecord";

export const CODEC_PREFIX = "z1:";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hand-written: Hermes ships no btoa/atob. */
function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
        out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=";
        out += i + 2 < bytes.length ? ALPHABET[n & 63] : "=";
    }
    return out;
}

function fromBase64(text: string): Uint8Array {
    const clean = text.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0, acc = 0, at = 0;
    for (const ch of clean) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) throw new Error("bad base64");
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[at++] = (acc >> bits) & 255;
        }
    }
    return out.subarray(0, at);
}

function pack(text: string): string {
    return CODEC_PREFIX + toBase64(gzipSync(strToU8(text), {mtime: 0}));
}

function unpack(stored: string): string {
    return stored.startsWith(CODEC_PREFIX)
        ? strFromU8(gunzipSync(fromBase64(stored.slice(CODEC_PREFIX.length))))
        : stored;
}

const deltas = (a: number[]) => a.map((v, i) => (i === 0 ? v : v - a[i - 1]));
const undelta = (a: number[]) => {
    const out: number[] = [];
    a.forEach((v, i) => out.push(i === 0 ? v : out[i - 1] + v));
    return out;
};

export function encodeSamples(samples: BrewSample[]): string {
    return pack(JSON.stringify({
        at: deltas(samples.map((s) => s.at)),
        water: samples.map((s) => s.water),
        cup: samples.map((s) => s.cup),
        pour: deltas(samples.map((s) => s.pour)),
    }));
}

/** Reads the compressed form and the legacy raw JSON array. `[]` when unreadable. */
export function decodeSamples(stored: string): BrewSample[] {
    try {
        const parsed = JSON.parse(unpack(stored));
        if (Array.isArray(parsed)) return parsed as BrewSample[];
        const at = undelta(parsed.at), pour = undelta(parsed.pour);
        return at.map((t: number, i: number) => ({
            at: t, water: parsed.water[i], cup: parsed.cup[i], pour: pour[i],
        }));
    } catch {
        return [];
    }
}

export const encodeText = pack;
export const decodeText = unpack;
export const isCompressed = (stored: string) => stored.startsWith(CODEC_PREFIX);
```

  Note `decodeText` can throw on a corrupt payload; callers wrap it (Task 2).
- [ ] **Step 4: Run tests, expect pass.** Run `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(brew): compressed trace codec`.

### Task 2: Compressed insert and tolerant reads

**Files:** modify `library/BrewDatabase.ts` (`insert` ~584, `samples` ~1040, `frames` ~1055); test in new `library/__tests__/BrewDatabase.retention.test.ts`.

- [ ] **Step 1: Write failing tests** with `createTestDatabase` (copy the construction used by `library/brew/__tests__/brewPopulation.test.ts`): after `insert(record, samples, frames)`, the stored `brew_samples.stream` and `brew_frames.frames` start with `z1:`; `samples(id)` and `frames(id)` return the originals; a row written directly with legacy raw JSON still reads back; a corrupt `z1:` value returns `[]` (samples) and `[]` or empty text (frames, match the current failure return).
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** In `insert`, replace `JSON.stringify(samples)` with `encodeSamples(samples)` and the frame text with `encodeText(...)`. In `samples(id)` replace `JSON.parse` with `decodeSamples(stream)`. In `frames(id)` pass the stored value through `decodeText` inside the existing try/catch before its current parse. Keep every other behaviour identical.
- [ ] **Step 4: Run the new test plus `library/__tests__/BrewDatabase.test.ts`.** That older suite mocks `expo-sqlite`; update only assertions that pin the exact raw JSON string written.
- [ ] **Step 5: Commit** `feat(brew): store traces compressed`.

### Task 3: Budgeted tiered sweep

**Files:** modify `library/BrewDatabase.ts`; extend `library/__tests__/BrewDatabase.retention.test.ts`.

Replace `sweep(keep: number)` with `sweep(budgetMB: number)`; `0` means Unlimited.

- [ ] **Step 1: Write failing tests** (real SQL): under budget nothing is dropped; over budget drops tier 3 (unrated, un-noted, not among the recipe's 2 newest) oldest first and sets `hasStream = 0` and deletes both trace rows; it stops as soon as the total fits; rated and noted brews are dropped only after every tier 2 and 3 trace is gone; a recipe with one brew keeps that trace while a recipe with 20 loses its old ones first; `budgetMB = 0` never drops; legacy raw rows are compressed during the sweep (stored value gains `z1:`, decoded samples unchanged); brew summary rows are never deleted. Use a tiny budget by letting the method take bytes internally, e.g. expose `sweepBytes(limit: number)` and have `sweep(mb)` call it with `mb * 1024 * 1024`, so tests do not need megabytes of data.
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.**
  - `traceBytes()`: `SELECT COALESCE(SUM(length(stream)),0) FROM brew_samples` plus the same over `brew_frames.frames`.
  - Compress legacy rows first: select `brewId, stream FROM brew_samples WHERE stream NOT LIKE 'z1:%' LIMIT 50`, re-encode, update; loop until none. Same for frames. Run inside the sweep before measuring.
  - If over the limit, select candidate brews ordered by tier then `startedAt ASC`:
    ```sql
    SELECT b.id,
      CASE
        WHEN b.rating > 0 OR TRIM(b.note) <> '' THEN 1
        WHEN (SELECT COUNT(*) FROM brews n
              WHERE n.recipeUuid = b.recipeUuid AND n.startedAt > b.startedAt) < 2 THEN 2
        ELSE 3
      END AS tier
    FROM brews b WHERE b.hasStream = 1
    ORDER BY tier DESC, b.startedAt ASC
    ```
    Delete trace rows for each in turn, re-measuring (or subtracting each row's length) until under the limit. Confirm the `rating` and `note` column names against `BrewRow` (lines 100-165) before writing.
  - Remove the `pinned` filter from the old sweep.
- [ ] **Step 4: Run tests, expect pass.**
- [ ] **Step 5: Commit** `feat(brew): budgeted tiered trace sweep`.

### Task 4: Setting and wiring

**Files:** `library/Settings.ts` (~192), `app/settings.tsx` (141-142, 202, 296-310), `components/MachineSection.tsx` (21-26, 80, 208-214), `hooks/useBrewHistory.ts` (16, 233), `app/_layout.tsx` (70-79); tests `library/__tests__/Settings.test.ts:100-108`, `app/__tests__/settings.test.tsx`, `components/__tests__/SettingsChoiceRow.test.tsx`, `hooks/__tests__/useBrewHistory.test.ts`.

- [ ] **Step 1: Update tests first.** `Settings.test.ts`: default `brewTraceBudgetMB` is `10`, and `0` round-trips. Settings screen test: the row renders the new label and choosing 25 stores 25; restoring a backup that still carries `brewTraceRetention` does not throw and changes nothing; restoring `brewTraceBudgetMB: 50` applies it. `useBrewHistory` test: `sweepOnLaunch(store, budgetMB)` calls `store.sweep(budgetMB)` once.
- [ ] **Step 2: Implement.** Replace the `brewTraceRetention: 50` default with `brewTraceBudgetMB: 10`. In `app/settings.tsx` rename the state, `settingsSnapshot()` entry and restore branch (accept only numbers in `{0, 10, 25, 50}`; ignore `brewTraceRetention`). In `MachineSection.tsx` replace `RETENTION_OPTIONS` with `[{value: 10, label: "10 MB"}, {value: 25, label: "25 MB"}, {value: 50, label: "50 MB"}, {value: 0, label: "Unlimited"}]`, label `Brew detail storage`, helper copy: `Brew traces are the detailed charts. When they pass this limit, the oldest are dropped first. Rated and noted brews, and the newest brews of each recipe, go last. Summaries are always kept.` Wire `useSetting("brewTraceBudgetMB")` in `app/_layout.tsx` and change the `HistoryStore.sweep` signature. Also call `sweep` after each finished brew where the history write happens (find via `BrewRecorder.onRecord` consumer in `hooks/useBrewRun.ts`), guarded so a sweep failure never affects the brew.
- [ ] **Step 3: Run the four test files, `npm run typecheck`.**
- [ ] **Step 4: Commit** `feat(settings): brew detail storage budget`.

### Task 5: Remove the pin

**Files:** `library/BrewDatabase.ts` (`judge` ~904, `setPinned` ~943), `hooks/useBrewHistory.ts` (`Judgement`, `JudgementStore`, `setPinned` ~181), `app/brewRecord.tsx` (229-237, 580-597), `app/brew.tsx` (450-455), `components/BrewHistoryRow.tsx` (67, 158-170), `hooks/useBrewComparison.ts` (119-127), `app/brewCompare.tsx` (278, 364-369), `constants/brewCopy.ts` (460), `library/brew/BrewRecord.ts` (243, 641), `library/backup.ts` (631, 758).

Tests to update (grep `pinned|setPinned|TRACE KEPT|LET IT EXPIRE|Keep this trace|history-row-pin|COMPARE_PINNED`): `library/__tests__/BrewDatabase.test.ts`, `BrewDatabaseSentAt.test.ts`, `BrewRecord.unobserved.test.ts`, `backup.test.ts`, `hooks/__tests__/useBrewHistory.test.ts`, `app/__tests__/brewRecord.test.tsx`, `brewCompare.test.tsx` (486-516), `components/__tests__/BrewHistoryRow.test.tsx`, `BrewSummary.test.tsx`, `library/brew/__tests__/historyQuery.test.ts`. Many match only on the word `pinned` in unrelated senses (pinned shelves, pinned UI); change only the brew-trace ones.

- [ ] **Step 1: Edit tests to the new behaviour:** judging no longer writes `pinned`; no `TRACE KEPT`/`LET IT EXPIRE` controls on the record; no `KEPT` chip; compare screen has no keep action; backup round trip still accepts a record carrying `pinned` and does not require it.
- [ ] **Step 2: Remove the UI and the hook API** (`setPinned`, `pinned` in `Judgement`, `canKeepTrace`, `keepSurvivingTrace`, `COMPARE_PINNED`, `history-row-pin`). Remove `pinned = 1` from `judge()` and delete `setPinned()`.
- [ ] **Step 3: Leave the column inert.** Keep `pinned` in the schema and `hydrate`/`writeBrewRow` so old backups and databases stay valid; stop setting it in `unobservedBrew` (`BrewRecord.ts:641`). Keep the backup validator tolerant of the field.
- [ ] **Step 4: Run the touched test files and `npm run typecheck`.**
- [ ] **Step 5: Commit** `refactor(brew): remove manual trace pin`.

### Task 6: Copy and docs

**Files:** `docs/copy.md` (rows around 802, 824, 957, 959), `constants/brewCopy.ts`, `components/CompareWithSheet.tsx` (31, 62).

- [ ] **Step 1:** Delete the `brewHistory.row.kept` and `brewRecord.pin.state` rows; update the `machine.section.traces.*` rows to the new label, options and helper copy.
- [ ] **Step 2:** Read `CompareWithSheet` and `NO TRACE KEPT` copy; reword "has expired" to "was not kept" if it implies a timer. Keep wording free of dashes.
- [ ] **Step 3: Run `npx jest --runTestsByPath` on any copy-table test** (`grep -rl "copy.md" --include=*.test.* .`), and the CompareWithSheet tests.
- [ ] **Step 4: Commit** `docs(copy): brew detail storage copy`.

### Task 7: Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npx expo-doctor`: all green.
- [ ] Manual (device): finish a brew, confirm the history row opens with a chart; set budget to 10 MB, confirm no regression; confirm a pre-existing database with raw traces still opens its old records.
- [ ] `git fetch origin --no-prune && npm run worktrees:check`; record branch, head, push state. Do not open a PR without explicit permission.

## Self-review

- Spec coverage: codec (T1), compressed storage and legacy reads (T2), budget sweep and tiers and lazy legacy compression (T3), setting and restore (T4), pin removal (T5), copy (T6), verification (T7). The spec's "SUMMARY ONLY" tag is superseded by the existing `NO TRACE KEPT` wording (finding 2).
- Types: `sweep(budgetMB: number)` is used in T3 and T4; `sweepBytes` is test-facing only.
- Known unknowns to confirm in-task: `rating`/`note` column names (T3), frame failure return value (T2), where the post-brew history write lives (T4).
