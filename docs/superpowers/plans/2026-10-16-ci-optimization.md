# CI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce CI elapsed time without dropping validation or changing the protected required check.

**Architecture:** Run quality checks and platform-isolated Jest matrix jobs independently, then require both through the existing aggregate status. Restore and save only platform-local derived Jest caches, retaining failed-test diagnostics and artifacts.

**Tech Stack:** GitHub Actions, Node from `.nvmrc`, npm, Jest 29, Expo Doctor, actionlint, existing YAML parser dependencies.

---

## Ownership and file map

Work only in `/Users/jesperhessius/Dev/XBRW-ci-20261016`, branch
`perf/ci-platform-jobs-20261016`, base
`540f23e81080e964ffadb4db781616d4685da32e`.

- Create `docs/superpowers/specs/2026-10-16-ci-optimization-design.md`: approved contract.
- Create this plan: exact implementation and verification sequence.
- Modify `.github/workflows/ci.yml`: graph, transform caching, diagnostics and gate.
- Modify `.gitignore`: local Jest cache exclusion.
- Modify `docs/development-workflow.md`: operator-facing CI behavior.
- Leave package/Jest configuration, application code, tea work and PR #221 untouched.

### Task 1: Persist the approved contract

- [x] Read `AGENTS.md`, `.github/copilot-instructions.md`, and
  `docs/development-workflow.md`; confirm status, branch, upstream and base.

```bash
git status --short --branch
git rev-parse HEAD origin/develop
git worktree list --porcelain
git fetch origin --no-prune
npm run worktrees:check
```

- [x] Save this plan and the approved specification, self-review every spec
  section against Tasks 2–4, then commit both documents.

```bash
git add docs/superpowers/specs/2026-10-16-ci-optimization-design.md docs/superpowers/plans/2026-10-16-ci-optimization.md
git commit -m "docs: record approved CI optimization design and plan" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Implement independent runners and a strict aggregate

**Files:** `.github/workflows/ci.yml`

- [x] Replace the workflow with this complete definition:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Typecheck, lint and Expo Doctor
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Lint
        run: npm run lint
      - name: Worktree audit tests
        run: npm run test:worktrees
      - name: Expo Doctor
        run: npx expo-doctor

  tests:
    name: Jest (${{ matrix.platform }})
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        platform: [ios, android]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        id: node
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Restore Jest transforms
        id: jest-cache
        uses: actions/cache/restore@v4
        with:
          path: .jest-cache/${{ matrix.platform }}
          key: jest-v1-${{ runner.os }}-${{ runner.arch }}-node-${{ steps.node.outputs.node-version }}-${{ matrix.platform }}-${{ hashFiles('package-lock.json', 'package.json', '.nvmrc', 'jest.config.js', 'jest.setup.js', 'jest.afterEnv.js', 'babel.config.js', 'tsconfig.json', 'tamagui.config.ts') }}-${{ github.sha }}
          restore-keys: |
            jest-v1-${{ runner.os }}-${{ runner.arch }}-node-${{ steps.node.outputs.node-version }}-${{ matrix.platform }}-${{ hashFiles('package-lock.json', 'package.json', '.nvmrc', 'jest.config.js', 'jest.setup.js', 'jest.afterEnv.js', 'babel.config.js', 'tsconfig.json', 'tamagui.config.ts') }}-
      - name: Test
        id: jest
        run: npm run test:${{ matrix.platform }} -- --ci --cacheDirectory="$GITHUB_WORKSPACE/.jest-cache/${{ matrix.platform }}" --json --outputFile=jest-results.json
      - name: Save Jest transforms
        if: ${{ success() && steps.jest.outcome == 'success' && steps.jest-cache.outputs.cache-hit != 'true' }}
        uses: actions/cache/save@v4
        with:
          path: .jest-cache/${{ matrix.platform }}
          key: ${{ steps.jest-cache.outputs.cache-primary-key }}
      - name: Name the failing test
        if: ${{ failure() && steps.jest.outcome == 'failure' }}
        run: node scripts/name-failing-tests.mjs jest-results.json
      - name: Keep the jest report
        if: ${{ failure() && steps.jest.outcome == 'failure' && hashFiles('jest-results.json') != '' }}
        uses: actions/upload-artifact@v4
        with:
          name: jest-results-${{ matrix.platform }}
          path: jest-results.json
          retention-days: 14
          if-no-files-found: error

  check:
    name: Typecheck, lint and test
    needs: [quality, tests]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Require every validation job to succeed
        env:
          QUALITY_RESULT: ${{ needs.quality.result }}
          TESTS_RESULT: ${{ needs.tests.result }}
        run: |
          printf 'quality=%s tests=%s\n' "$QUALITY_RESULT" "$TESTS_RESULT"
          test "$QUALITY_RESULT" = success && test "$TESTS_RESULT" = success
```

### Task 3: Document cache and gate behavior

**Files:** `.gitignore`, `docs/development-workflow.md`

- [x] Add this Git ignore entry beside `jest-results.json`:

```gitignore
.jest-cache/
```

- [x] Add the following subsection before `## Preserve before cleaning`:

```markdown
### CI jobs, caches and failure reports

`.github/workflows/ci.yml` runs independent Ubuntu jobs: `quality` runs
typecheck, lint, worktree-audit tests and Expo Doctor (10-minute timeout);
`tests` runs the existing iOS and Android Jest projects on separate runners
(20 minutes each, matrix fail-fast disabled). All use `npm ci` and setup-node's
npm cache. Jest worker limits, test discovery and coverage settings are unchanged.

The `check` aggregate (2-minute timeout) retains the exact required status
`Typecheck, lint and test`, GitHub Actions app ID 15368, on main and develop.
It runs even after dependency failures and passes only when quality and the
entire test matrix both report success. Failed, skipped or cancelled validation
cannot pass it; whole-workflow cancellation may cancel the gate, never turn it
green. Existing push/PR triggers and concurrency cancellation remain unchanged.

Jest restores only `.jest-cache/ios` or `.jest-cache/android`. Cache keys
include schema `jest-v1`, runner OS/architecture, resolved Node version,
platform, dependency/configuration hash and commit SHA. The restore prefix
omits only the SHA; successful Jest runs save the primary key unless already
an exact hit. No cross-platform/configuration fallback, secret or workspace
cache is allowed. These caches contain derived data, including transformed
source, and are not a place for credentials. The workflow uses read-only
contents permission and does not use `pull_request_target`.

A failed Jest step still runs `scripts/name-failing-tests.mjs`; when its JSON
report exists, it is uploaded as `jest-results-ios` or `jest-results-android`
for 14 days. Missing reports do not turn failures or cancellations into passes.
Remote timing, cache restore/save, artifact delivery and cancellation behavior
need observation in a separately authorized PR run; local validation is not
evidence of those Actions runtime outcomes.
```

### Task 4: Validate, checkpoint and preserve

- [x] Run actionlint. If missing, download an official release into the
  worktree's `.ci-validation` scratch directory, run it there, then remove only
  the generated scratch files at the end. Do not change dependencies to add a
  workflow linter.

```bash
actionlint .github/workflows/ci.yml
```

The command was missing locally; the worktree-local fallback is:

```bash
mkdir -p .ci-validation
gh release download v1.7.12 --repo rhysd/actionlint --pattern 'actionlint_1.7.12_darwin_arm64.tar.gz' --dir .ci-validation
tar -xzf .ci-validation/actionlint_1.7.12_darwin_arm64.tar.gz -C .ci-validation actionlint
.ci-validation/actionlint .github/workflows/ci.yml
```

- [x] Parse YAML and execute the actual aggregate shell body for all result
  combinations using an existing parser dependency:

```bash
node <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const yaml = require('js-yaml');
const ci = yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
assert.deepEqual(ci.on.push.branches, ['main', 'develop']);
assert.ok(Object.hasOwn(ci.on, 'pull_request'));
assert.deepEqual(ci.permissions, {contents: 'read'});
assert.deepEqual(ci.jobs.check.needs, ['quality', 'tests']);
assert.equal(ci.jobs.check.name, 'Typecheck, lint and test');
assert.equal(ci.jobs.check.if, '${{ always() }}');
assert.deepEqual(ci.jobs.tests.strategy.matrix.platform, ['ios', 'android']);
assert.equal(ci.jobs.tests.strategy['fail-fast'], false);
for (const quality of ['success', 'failure', 'cancelled', 'skipped']) {
  for (const tests of ['success', 'failure', 'cancelled', 'skipped']) {
    const result = spawnSync('bash', ['-e', '-c', ci.jobs.check.steps[0].run], {
      env: {...process.env, QUALITY_RESULT: quality, TESTS_RESULT: tests}
    });
    assert.equal(result.status === 0, quality === 'success' && tests === 'success');
  }
}
console.log('YAML semantics and all 16 aggregate result pairs passed');
NODE
```

- [x] Confirm the two existing scripts select exactly one intended project
  and identical discovered suite lists; unchanged package/Jest files establish
  equivalence to the pinned base. Run the small harness serially, not full suites.

```bash
npm run test:ios -- --showConfig
npm run test:android -- --showConfig
npm run test:ios -- --listTests --json
npm run test:android -- --listTests --json
git diff 540f23e81080e964ffadb4db781616d4685da32e -- package.json package-lock.json jest.config.js jest.setup.js jest.afterEnv.js babel.config.js
npm run test:ios -- --ci --cacheDirectory="$PWD/.jest-cache/ios" --runTestsByPath library/__tests__/platformHarness.test.ts
npm run test:android -- --ci --cacheDirectory="$PWD/.jest-cache/android" --runTestsByPath library/__tests__/platformHarness.test.ts
npm run test:worktrees
git diff --check
```

Expected: each script selects one platform, suite lists match and no
package/Jest diff exists; three harness tests pass per platform; audit tests
and workflow validation pass. `--showConfig` prints both configured projects
even with `--selectProjects`, not a filtered project list; verify selection
through the script, discovery's `Running one project` output and the harness's
platform-labelled execution instead. Install dependencies only after a
missing-tool failure. Record real Actions behavior as unverified rather than
faking runs.

- [x] Mark completed plan tasks, record validation evidence, commit, push the
  authorized branch, then run the final read-only audit:

```bash
git add .github/workflows/ci.yml .gitignore docs/development-workflow.md docs/superpowers/plans/2026-10-16-ci-optimization.md
git commit -m "perf: run CI quality and platform tests independently" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin perf/ci-platform-jobs-20261016
git fetch origin --no-prune
npm run worktrees:check
git status --short --branch
git rev-parse HEAD
```

Handoff exact file list, base/head/commits, clean/push state, evidence and remote
runtime gaps. Retain the worktree for the CI task owner pending authorized
PR/integration, with the pushed branch as its recovery pointer. Do not create
a PR, request a review, merge, deploy or delete another worktree.

## Self-review

Spec coverage: Task 2 covers triggers, permissions, graph/timeouts, strict gate,
platform matrix, cache identity/save guard and report conditions; Task 3 covers
ignored cache and operator documentation; Tasks 1 and 4 cover ownership,
persistence, verification and authorized handoff. No uncovered requirements.
YAML IDs, output names and environment variables match across implementation
and validation. No package or application changes are planned.

## Local verification evidence (2026-10-16)

- actionlint 1.7.12: workflow accepted without diagnostics.
- Existing `js-yaml` dependency: semantic assertions passed for unchanged
  triggers/concurrency, read-only permissions, independent runners, timeouts,
  complete quality commands, platform matrix, cache scope/key relationship,
  save guard, failed-Jest diagnostics and artifact conditions.
- Actual aggregate shell command: all sixteen dependency-result pairs passed;
  only `success` / `success` exited zero.
- Platform discovery: 363 suites per project, identical sorted lists, matching
  every tracked TypeScript test in the pinned base (excluding `tools/`).
- Existing platform scripts and presets select iOS / Android as intended.
  Configuration retains four workers on this machine and the 20-second timeout;
  package files and Jest/Babel configuration remain unchanged.
- Targeted platformHarness: 3/3 tests passed on iOS and 3/3 on Android, serially,
  using separate cache directories and the approved JSON report arguments.
- Worktree-audit tests: 2/2 passed. `git diff --check` passed.
- Missing dependencies were restored with `npm ci` only after resolution
  failures. npm reported a blocked optional `unrs-resolver` install script;
  no approval or dependency-manifest change was made.
- One initial validation assertion incorrectly expected `--showConfig` to
  expose `globalConfig.selectProjects`; corrected the validation method above,
  without changing the workflow or application.
- No full platform suite, remote workflow dispatch, PR, review request,
  integration, deployment or hardware operation was performed. Actions timing,
  cache transport, artifact delivery and cancellation remain unverified.
