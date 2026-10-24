# Development workflow

`AGENTS.md` is the workflow contract for people and agents.
`.github/copilot-instructions.md` holds the codebase's technical conventions.
This runbook explains the branch lifecycle and recovery procedures.

## Branch roles and transition

| Branch | Role |
| --- | --- |
| `main` | Approved release line. No ordinary task development. |
| `develop` | Permanent integrated development line; next planned release is 2.2.0. |
| `feat/`, `fix/`, `chore/`, `docs/`, `recover/` task branches | One bounded task, isolated worktree, explicit base. |
| `release/<version>` | Optional, explicitly approved short-lived freeze candidate; fixes only. |

On 2026-10-11, develop was seeded from the authoritative former
`integration/2.1.0` candidate at
`3a02987030dd378daea5ae0bd1135dce63e4ee66`. That migration did not promote
application code to main; beta corrections continued through the ordinary
task/PR process. Do not recreate the old integration branch or rewind main.

Version 2.1.0 shipped on 2026-10-19 from
`a121929e0d770d39db07168b482e2e3cd7c1102a`, tagged `v2.1.0`.
PR #248 reconciled that source into develop; PR #250 promoted it to main.
The [release record](https://github.com/hessius/XBRW/releases/tag/v2.1.0)
identifies the shipped Android artifact and maintainer sign-off.
Historical open-gate notes in the [2.1.0 ledger](release-2.1.0-changes.md)
describe their recorded checkpoints, not new verification by reconciliation.
Future physical/native/external release gates remain mandatory.

Keep the GitHub default branch `main`. Users requesting a PR must name its base;
GitHub's default PR target is not the ordinary development target.
Use merge commits for task integration and release promotion, so an integrated
task remains identifiable by ancestry. Existing squash-merged branches need
content-level proof rather than retrospective history rewriting.

Versions belong to release records, not permanent development branches.
Record the exact source commit, app version and platform build/artifact for
each release. Create an immutable `v<version>` tag on genuinely shipped source.
Do not infer a historical release commit from the current version string.
Existing unprefixed 2025 tags belong to the upstream history and must not be
moved or relabeled.

## Start a task

First read `AGENTS.md` and `.github/copilot-instructions.md`. Inspect:

```bash
git status --short --branch
git worktree list --porcelain
git branch -vv
git fetch origin --no-prune
git rev-parse origin/develop
```

Record the resolved full SHA and create a uniquely named worktree/branch from
that exact SHA. Use the existing external worktree location, or an explicitly
chosen ignored `.worktrees/` directory. Confirm ownership and clean status
before writing. A checkout being clean does not prove another session is idle.

Do not branch from whatever happens to be checked out. Do not switch an
existing shared checkout underneath another session. Only use `pull --ff-only`
inside a worktree you own and after checking its branch/upstream; pulling a
stale branch blindly can bring in the wrong integration history.

Keep design/spec changes with the task. Separate branches are justified by
independent work, not by every planning step needing a new branch.
Hand subagents an explicit worktree, base and file ownership. Serialize shared
integration operations, full-suite contention and physical-device operations.

## Checkpoints and review

Commit coherent changes frequently; do not commit credentials, native build
trees, installed dependencies or scratch experiments. Push approved task
branches before ending a session when possible. If pushing fails or is not
authorized, say precisely where the local-only work is preserved.

Handoffs must identify branch/worktree, base and head SHA, local/remote state,
uncommitted work, remaining tasks, relevant validation and unverified hardware
claims. A session note is a pointer, not a substitute for preserved source.

PR creation and merging require explicit permission. Ordinary tasks and beta
fixes target `develop`; hotfix/release and workflow-only main changes are
explicitly identified exceptions.
Check that the PR delta contains only the intended task and no inherited
unrelated features. Run existing targeted checks first; do not add tooling for
this process. Existing CI requires typecheck, repository lint, both Jest
platforms and Expo Doctor.

Use one automated Copilot review round at most. Automatic ruleset reviews count
towards that limit; never request a second round simply after fixing comments.
Integrate approved tasks serially with merge commits, then validate the
integrated state. No one session should silently merge another task.

## Releases, hotfixes and deployments

The usual path is:

```text
task from develop -> focused checks -> authorized PR -> CI
-> authorized merge commit -> integrated validation -> release acceptance
-> authorized main promotion -> exact-source production artifact
-> confirmed shipping -> immutable release tag
```

Keep physical NFC cards/devices and the release ledger's BLE, native UI and
external-app checks as release gates. Software tests and simulators do not
substitute for them. A merged fix does not close the whole release cycle.

If hardware/store qualification takes long enough that new development must
continue, one temporary `release/<version>` candidate is allowed with explicit
approval. Accept only fixes there and merge them back into develop. Retire it
after promotion and preservation; do not accumulate old version branches.

Hotfixes start from approved main, pass their relevant checks and are promoted
with permission. Merge main back into the active integration line afterwards.
Rollback means an authorized revert/fix commit and a new artifact, never
rewriting shared history or moving a published tag.

EAS development/preview/production channels are separate from Git branch names.
Keep existing build profiles; builds, submissions and deployments remain
manual authorized actions. Confirm Vercel's production branch setting rather
than assuming `vercel.json` selects it. A workflow migration is not permission
to add paid services or production automation.

## Remote enforcement

CI checks pushes to both main and develop and all PRs. Both branches require
PR-only integration and the `Typecheck, lint and test` GitHub Actions status
(app ID 15368), with strict up-to-date checks, deletion protection and
non-fast-forward protection. Required linear history is disabled because
merge commits are intentional. The workflow gate has no bypass actors and
does not require a second human reviewer.

Do not require approval from a second maintainer who does not exist. Minimize
routine bypasses where supported, but report actual permission/platform limits.
Keep default-branch/Copilot behavior unchanged unless separately authorized.
Automatic remote branch deletion is enabled after the completed historical
audit. It also handles PRs merged by the user. Enforced merge commits keep
integrated source reachable; local follow-up work still requires preservation.

The existing main ruleset additionally enables code quality and Copilot review.
No second automatic review target is added for develop. Documentation alone
cannot guarantee an agent or administrator never bypasses the process.

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

## Preserve before cleaning

A Git bundle preserves referenced committed history, not every loose file or
abandoned object. Before deleting anything:

1. Pause other writers. Capture full refs, upstreams, live remote tips, PR state,
   worktrees, staged/unstaged binary patches and reflogs.
2. Snapshot valuable untracked and ignored work separately. Keep secrets in
   private local backups, never in Git refs or public audit reports.
3. Inspect unreachable objects. Preserve unresolved commit objects with
   recovery refs in a standalone backup mirror; preserve orphan file objects
   there too. Do not run garbage collection.
4. Create a bundle and full-SHA manifest. Restore it into an isolated mirror and
   verify every saved ref. Verify copied file checksums.
5. Make and verify a second user-controlled copy. A second directory on the
   same machine is not protection against disk failure.

Audit every local, live remote and cached-only branch separately. Associate
upstream refs exactly: a local integration branch may track a differently named
remote feature branch. Check ancestry against both relevant integration lines.
For squash/rebase history, compare aggregate patches with the merged PR's
actual parent/result, then explain residual hunks and later local edits.
Individual cherry comparisons cannot prove a many-commit squash.

Classify each row as active, integrated, superseded, unique/recoverable or
unresolved. Give each a backup pointer and evidence. Review documentation,
experimental work and hardware observations too. A branch's age, deleted
upstream or merged PR alone is never sufficient deletion evidence.

## Execute approved cleanup

Present exact branch names, full local/live tip SHAs, exact worktree paths and
recovery pointers for explicit approval. Preserve unresolved rows; exclude
main, the active integration line, open-PR branches and release/archive tags.

Immediately before each deletion recheck live tips, PR state, worktree ownership
and files, including valuable ignored work. New work or a moved tip invalidates
that row. Remove only approved inactive worktrees using exact-path
`git worktree remove` without force. Never delete their parent directory.

Use `git branch -d` where ancestry permits. Squash-integrated history may need
`-D`, but only after approval of that exact evidenced, backed-up row. A refusal
is a stop, not permission to force.

For remote deletion, use an expected-tip lease with the approved full SHA and
an explicit deletion refspec. Abort if the tip changed; do not replace the lease
with blanket force. Prune stale origin tracking refs only after preservation
and approval. Do not prune tags or the unrelated upstream remote.

Re-list kept refs/worktrees and verify their tips after each batch. Keep the
backup and audit after cleanup.

### Local cleanup after any merge

At every agent startup and final handoff:

```bash
git fetch origin --no-prune
npm run worktrees:check
```

The command is read-only and emits exact paths/head SHAs. It detects merge
ancestry even when a human merged the PR and GitHub deleted its head branch.
`protected` includes the primary checkout and main/develop checkouts.
`dirty`, `unmerged`, `detached-keep`, `locked-keep` and `unavailable-keep` must
remain until explicitly resolved. Missing/external-volume registrations are
reported conservatively, not pruned by the command. Ignored directory entries
are collapsed rather than buffering entire dependency/build trees.
`merged-preserve-ignored` requires inspection/snapshot of ignored files, not
an assumption that they are disposable. `merged-clean` still requires
owner-idle confirmation, backup and exact-path/head approval before removal.
Stale local-only integration refs are evidence to inspect, not proof of a
remote merge; refresh origin and check the reported integration refs.

Before ending a finished task, agents must execute the approved exact-path
`git worktree remove` and branch cleanup, or record a specific owner/pending
work/recovery pointer for retention. Do not leave completed worktrees
unexplained. This also applies to human-merged PRs detected at the next session.
No unattended process force-deletes local directories: remote merge status
cannot establish that local edits or another session are disposable.

## Restore work

Use the verified bundle/mirror to create a new `recover/<topic>` ref, never to
overwrite an active branch. For reflog-only history, use its recorded
`refs/preservation/<snapshot-date>/<full-sha>` in the backup mirror. Address bare
mirrors with an explicit `--git-dir` when local safe-bare settings require it.

Restore loose files from their separate snapshot after inspecting paths and
current worktree state. Port only useful changes onto the current integration
base; an old commit can otherwise overwrite later fixes.
Record recovered/superseded decisions and keep unresolved work discoverable.
Do not claim “no lost work” while unpreserved or unexplained changes remain.
