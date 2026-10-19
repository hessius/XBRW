# CI optimization design

Approved on 2026-10-16. Implementation is authorized without another design
gate, on `perf/ci-platform-jobs-20261016` from
`540f23e81080e964ffadb4db781616d4685da32e`, in
`/Users/jesperhessius/Dev/XBRW-ci-20261016` only.

## Goal and boundaries

Reduce CI wall-clock time by running quality checks and the two existing Jest
projects concurrently on separate Ubuntu runners, with reusable platform-local
Jest transform caches. Preserve all existing validation and branch protection.
Do not change package scripts, Jest configuration, worker limits, coverage or
test discovery. Tea investigation and open PR #221 are outside this task and
are not incorporated into its base.

## Workflow graph and required status

Keep push triggers for `main` and `develop`, all `pull_request` events, and the
existing `ci-${{ github.ref }}` concurrency group with cancellation enabled.
Set workflow permissions to `contents: read`; never use `pull_request_target`.

The independent `quality` job runs checkout v5, setup-node v5 using `.nvmrc`
and npm caching, `npm ci`, typecheck, lint, worktree-audit tests and Expo Doctor,
with a ten-minute timeout. Doctor remains a hard failure.

The independent `tests` matrix uses `platform: [ios, android]`,
`fail-fast: false`, `ubuntu-latest` and a twenty-minute timeout per runner.
Each checks out, sets up Node with step ID `node` and npm caching, installs
dependencies and runs its unchanged platform script:

```yaml
run: npm run test:${{ matrix.platform }} -- --ci --cacheDirectory="$GITHUB_WORKSPACE/.jest-cache/${{ matrix.platform }}" --json --outputFile=jest-results.json
```

Job ID `check` and exact name `Typecheck, lint and test` become the two-minute
aggregate gate, depending on `[quality, tests]` with `if: ${{ always() }}`.
It exits successfully only if both dependency results are exactly `success`.
Failures, skipped jobs and cancelled jobs cannot become a green required
status. No job or step uses `continue-on-error`. Whole-workflow cancellation
may cancel the gate too; cancellation is not a passing check.

The existing required status name and GitHub Actions app ID 15368 remain
unchanged on both protected branches. No remote rules or workflow dispatches
are part of this implementation.

## Cache identity and safety

Keep setup-node's npm cache. Restore with `actions/cache/restore@v4` and save
with `actions/cache/save@v4`, targeting only the current
`.jest-cache/${{ matrix.platform }}` directory, never a workspace, environment
file or credential. Jest's cache contains derived transform/discovery data
(including transformed source), so it must never contain secrets.

The primary cache key is:

```text
jest-v1-${{ runner.os }}-${{ runner.arch }}-node-${{ steps.node.outputs.node-version }}-${{ matrix.platform }}-${{ hashFiles('package-lock.json', 'package.json', '.nvmrc', 'jest.config.js', 'jest.setup.js', 'jest.afterEnv.js', 'babel.config.js', 'tsconfig.json', 'tamagui.config.ts') }}-${{ github.sha }}
```

The sole restore prefix is that same key without the final SHA and with a
trailing hyphen. Never fall back across platform, Node version or configuration
hash. Save the restore step's `cache-primary-key` only after successful Jest,
when `cache-hit != 'true'`; failed/cancelled tests never publish a cache.
Ignore `.jest-cache/` in Git.

## Failure evidence

Keep `scripts/name-failing-tests.mjs` unchanged, running when the Jest step
fails. Upload only when that step failed and `jest-results.json` exists.
Use distinct `jest-results-ios` / `jest-results-android` artifact names with
fourteen-day retention. Missing reports, including interrupted runs, cannot
change the Jest failure/cancellation or satisfy the aggregate gate.

## Documentation and verification

Update `docs/development-workflow.md` with the graph, unchanged required status,
cache scope/invalidation and failure artifacts. Persist the exact implementation
plan alongside this specification.

Validate YAML/actions with actionlint (install locally only after observing a
missing-tool failure), parse the workflow using available YAML dependencies,
and exercise the aggregate's actual shell command over all sixteen pairs of
`success`, `failure`, `cancelled` and `skipped`. Verify platform scripts select
the intended projects, compare discovered suite lists with the pinned base,
and run only the targeted platformHarness tests when dependencies are available.
Do not add brittle YAML text-pattern tests or run competing full suites.

Real Actions timings, remote cache restore/save, failure artifact delivery and
remote cancellation remain unverified until a separately authorized PR run.
No PR creation, merging, review request, deployment or hardware claim is
authorized. Commit coherent checkpoints with the Copilot trailer, push the
authorized task branch, then fetch without pruning and run `worktrees:check`.
Retain this worktree for its owner pending authorized PR/integration; its remote
branch is the committed recovery pointer, not approval for local deletion.
