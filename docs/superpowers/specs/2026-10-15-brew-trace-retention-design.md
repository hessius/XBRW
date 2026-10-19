# Brew trace retention: size budget, not a count and a pin

Status: design, awaiting review. Base: `origin/develop` at `2cd68f58`.

## Problem

Retention today is a flat count (`brewTraceRetention`, default 50) plus a
hidden pin: rating or noting a brew silently exempts it from the sweep, and the
record screen then shows `TRACE KEPT` and a `LET IT EXPIRE` button that nothing
explains. Nobody wants to manage storage by hand, and 50 is far below what the
data costs.

Measured on a real brew (`kochere-supermind-2026-09-30.json`, 1,086 samples):

| Form | Size |
|---|---|
| Raw JSON, as stored today | 64 KB |
| gzip | 9.4 KB |
| Columnar delta, then gzip | 3.8 KB |

The frame log (`brew_frames`) is capped at 256 lines per brew and was not
measured; compressing it the same way is expected to help similarly.

## Goals

- Compress stored traces so far more of them fit.
- Replace the count with a size budget the user can pick, default 10 MB.
- Decide automatically what to drop; remove the pin and its copy.
- Say plainly in the history list which brews have no trace.

## Non-goals

- Records are never deleted; only traces expire, as now.
- Backups still carry records without traces.
- No change to what is recorded, to flow-rate arithmetic or to `hasStream`'s
  meaning.

## Design

### 1. Storage format

New module `library/brew/traceCodec.ts`, pure TypeScript:

- `encodeSamples(samples)`: columnar arrays (`at`, `water`, `cup`, `pour`),
  delta-encoded, JSON, gzipped with `fflate` (mtime 0, so output is stable),
  then base64. Prefixed `z1:` so the format is self-describing.
- `decodeSamples(text)`: returns samples for a `z1:` value, and parses a legacy
  raw JSON array unchanged. Anything that fails to decode is a stream that is
  gone, exactly as the reader treats unparseable JSON today.
- The same wrapper (`encodeText`/`decodeText`) compresses the frame log.
- Decoding is exact. Floating-point columns are delta-coded on the stored
  values, so the round trip is verified sample for sample in tests.

`BrewDatabase.insert` writes the compressed form. Reads accept both, so there is
no blocking migration. At launch and after a brew, `sweepWhenReady` awaits
`migrateLegacyTraces` before enforcing the budget, including with Unlimited.
Legacy rows are rewritten in transactions of at most 25 rows, with a macrotask
yield between batches so startup can keep rendering. Batches advance by brew ID,
including past skipped rows. Concurrent callers sharing the database connection
share one migration and sweep, with the latest requested budget winning.
A database-level migration failure leaves the budget unenforced until a later
attempt; `migrateLegacyTraces` resolves false rather than throwing. Each conversion is isolated: malformed sample arrays (including
non-object samples or non-finite numeric fields) and failed frame conversions
remain untouched rather than blocking launch or being retried within that sweep.

### 2. The budget

- One setting, `brewTraceBudgetMB`, labelled "Brew detail storage": 10 MB
  (default), 25 MB, 50 MB, Unlimited. Stored as a number, `0` meaning Unlimited.
- It replaces `brewTraceRetention`. Add the new key to `DEFAULTS` and
  `settingsSnapshot()`, so it is backed up. Restore ignores the old count key in
  older backups.
- Size is `SUM(length(stream)) + SUM(length(frames))` over the two tables, read
  in SQL. Stored text is ASCII after base64, so characters equal bytes. Measure
  the total once, select ordered candidates with their combined SQL `length()`
  once, and subtract those lengths as rows are deleted in a transaction.
  The synchronous `sweep` / `sweepBytes` path does not migrate: it still counts
  any legacy raw text with SQL `length()`. App callers use `sweepWhenReady` so
  larger, uncompressed traces cannot cause premature eviction.

### 3. What goes first

The sweep runs at launch and after each new brew, and does nothing while the
total is within budget. Over budget, it drops traces one at a time, lowest tier
first and oldest first within a tier, until the total fits.

Tiers, highest protection first:

1. Brews with a rating or a note.
2. The two newest brews of every recipe, so a recipe with a single brew always
   keeps it. Recency counts strictly newer summaries, including ones whose
   traces are gone; equal timestamps do not count as newer. The indexed lookup
   stops after finding two newer rows. Equal-time eviction candidates use brew
   ID as a stable tiebreaker.
3. Everything else.

A brew that qualifies for several tiers takes the highest. If tier 1 and 2
alone exceed the budget, the oldest tier-2 and then tier-1 traces go, rather
than the budget being ignored. Recipe identity for the per-recipe rule is the
recipe UUID on the brew row; a brew whose recipe was deleted counts under its
snapshotted recipe name.

Dropping a trace deletes its `brew_samples` and `brew_frames` rows and sets
`hasStream = 0`, as the current sweep does. A row in either trace table makes
a brew eligible, including frame-only logs whose `hasStream` is already zero.

### 4. UI

- Remove the pin from behaviour and copy: `TRACE KEPT`, `LET IT EXPIRE`,
  `setPinned` in the judgement hook, and the compare screen's `Trace pinned`.
  Rating and noting stop pinning; they raise a brew's tier instead. The `pinned`
  column stays in the schema, and old values are ignored, so existing data and
  backups still load.
- History list: a brew without a trace shows a quiet `SUMMARY ONLY` tag. It is
  also in the row's accessibility label.
- Record screen: where the trace would be, one sentence, for example "This
  brew's detailed trace was cleared to save space. Its figures are kept."
- Settings: the choice row is renamed and gets one line of explanation: "Detailed
  traces are cleared oldest first when this is full. Rated brews, brews with
  notes and each recipe's latest brews are kept longest."
- All copy follows `docs/copy.md`, with no dashes, and each new string is
  listed there.

### 5. Testing

Run against the real SQLite helper (`createTestDatabase`), on both Jest
projects.

- Codec: round trip on the real export's samples, empty input, one sample,
  corrupt input, and legacy JSON still readable.
- Sweep: tier order, a single-brew recipe keeps its trace, a rated or noted
  brew outlives an unrated one, the budget boundary, `0` meaning Unlimited, and
  a bad value deleting nothing.
- Migration: mixed legacy and compressed rows both read; legacy rows get
  compressed once across multiple yielded batches, including with Unlimited;
  corrupt rows cannot stall keyset pagination. Budget enforcement waits for
  conversion, overlapping callers share one run, and database failures allow retry.
- Settings and backup: the new key is in `DEFAULTS` and the snapshot, restore
  ignores the old count key.
- Components: the tag in the list and the record sentence, and the absence of
  the pin controls.

## Risks

- A bug in the codec could make traces unreadable. The reader falls back to
  "no trace", never to a crash, and the round-trip test guards the format.
- Compression adds a little CPU on write and on opening a record; at a few KB
  per brew this is negligible but should be checked on a device.
- Legacy compression yields between 25-row transactions, but each individual
  batch still uses synchronous CPU and SQLite work. Confirm launch responsiveness
  on a device with a large legacy history.

## Open questions

None blocking. Frame-log compression gain is unmeasured and only affects how
many brews fit, not correctness.
