# Development workflow

`AGENTS.md` is the workflow contract for people and agents.
`.github/copilot-instructions.md` holds the codebase's technical conventions.
This runbook explains the branch lifecycle and recovery procedures.

## Branch roles and transition

| Branch | Role |
| --- | --- |
| `main` | Approved release line. No ordinary task development. |
| `integration/2.1.0` | Current integration base until this cycle closes. |
| `develop` | Permanent integrated development line after explicit activation. |
| `feat/`, `fix/`, `chore/`, `docs/`, `recover/` task branches | One bounded task, isolated worktree, explicit base. |
| `release/<version>` | Optional, explicitly approved short-lived freeze candidate; fixes only. |

**The develop migration is not active yet.** Finish the 2.1.0 integration cycle,
carry main-only changes into the candidate, satisfy its release acceptance
gates, and promote with permission. Create `develop` from authoritative
post-promotion main history, then update this section and agent instructions.
Do not seed it from a stale local integration branch or rewind main: main
already carries unreleased work from the previous workflow.

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
git rev-parse origin/integration/2.1.0
```

Once develop is active, replace the last ref with `origin/develop`.
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

PR creation and merging require explicit permission. During transition, target
`integration/2.1.0`; after activation, ordinary tasks target `develop`.
Check that the PR delta contains only the intended task and no inherited
unrelated features. Run existing targeted checks first; do not add tooling for
this process. Existing CI requires typecheck, repository lint, both Jest
platforms and Expo Doctor.

Use one automated Copilot review round at most. Automatic ruleset reviews count
towards that limit; never request a second round simply after fixing comments.
Integrate approved tasks serially with merge commits, then validate the
integrated state. No one session should silently merge another task.

## Releases, hotfixes and deployments

The usual path after activation is:

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

At develop activation, add pushes to `[main, develop]` to the existing CI
workflow while retaining PR checks. Protect both branches with PR-only
integration, the actual emitted CI status context, deletion protection and
non-fast-forward protection. Keep required linear history disabled because
merge commits are intentional.

Do not require approval from a second maintainer who does not exist. Minimize
routine bypasses where supported, but report actual permission/platform limits.
Keep default-branch/Copilot behavior unchanged unless separately authorized.
Leave automatic branch deletion off until the historical audit is complete.

**Current enforcement:** CI checks pushes to main and PRs. The existing main
ruleset prevents deletion/non-fast-forward updates and enables code quality
and Copilot review, but it does not require this CI job or PR-only integration.
Develop protection is planned, not currently established. Documentation alone
cannot guarantee an agent or administrator never bypasses the process.

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
backup and audit after cleanup. Prefer weekly small reviews of completed task
branches over large age-based deletion sweeps.

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
