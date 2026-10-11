# Development workflow

This is the tool-neutral workflow contract for XBRW++. Read
`.github/copilot-instructions.md` for architecture, coding and hardware rules,
and `docs/development-workflow.md` for the operational runbook. Instructions in
subdirectories add area-specific requirements; they do not authorize bypassing
the branch, ownership or destructive-action gates here.

## Current integration base

The active development and 2.1.0 beta-testing line is `develop`. Task branches
start from a freshly fetched, pinned `origin/develop` commit.
The former `integration/2.1.0` candidate was carried into develop without
promoting its application code to main. Beta fixes use the ordinary task/PR
workflow; do not recreate the old version integration branch.
Never pick a base merely because it is the current checkout.

`main` is the approved release line. It already contains unreleased changes from
the old workflow; do not rewind it to a guessed release baseline.
Shipped source is identified by immutable release tags and artifact records,
not by a branch name or an `app.json` version alone.

## Before changing files

- Inspect status, branch, upstream, base SHA and registered worktrees.
- Confirm the task owns its worktree and no other session is editing it.
- Create a separate task branch/worktree from the explicit integration base.
  Design and planning changes belong to that task too.
- Do not write directly on `main`, `develop` or the shared integration branch.
  An approved integration operation is separate from task implementation.
- Do not switch, reset, pull or rebase another session's checkout. Unexpected
  changes or conflicting ownership mean stop and ask, not discard or relocate.
- Give any subagent the same rules, exact task worktree and bounded ownership.
  Do not launch agents, competing hardware clients or heavy parallel test runs
  merely because the work could be split.

## Checkpoints and handoff

Commit coherent checkpoints without secrets, generated native directories,
dependency trees or scratch files. Push authorized task branches when possible.
A failed or unauthorized push must be reported as local-only work, never as a
successful backup.

At handoff record the worktree path, branch, exact commit/base SHA, clean/dirty
state, push state, pending work, verification evidence and hardware gaps.
Preserve uncommitted work before leaving or removing its worktree. A stash or
session note alone is not a durable remote backup.

At session startup and final handoff, fetch `origin --no-prune` and run
`npm run worktrees:check`. Human-merged PRs must be accounted for too.
For finished integrated task worktrees, obtain exact-path/head cleanup approval,
verify preservation and owner-idle status, and remove them before final handoff.
If a worktree must remain, state its owner, pending work and preservation pointer.
Do not leave completed worktrees as an unexplained backlog.

## Integration and releases

- Require explicit user permission to create a PR, merge a PR, promote a release,
  build/submit a production artifact, deploy, force-push or delete remote refs.
- Integrate completed work serially using merge commits. Never squash
  `develop` into `main`, or rebase/force-push shared integration/release history.
- Use at most one automated Copilot review round per PR. Count automatic
  ruleset reviews too; a new push or migration is not a reason to request another.
- A merge requires relevant checks and the existing CI gates. Release promotion
  also requires the release ledger's physical-device and external-app gates.
  Simulators/scripted transports do not prove NFC or BLE hardware safety.
- Hotfixes start from approved `main` and are merged back into `develop`.
  Undo releases with fix/revert commits, never rewritten tags.
- Keep ordinary task branches short-lived. A temporary release freeze branch
  is an explicitly approved exception, not a permanent version branch.
- Git branch names do not select EAS channels. Do not add deployment automation
  or change production settings as an incidental workflow improvement.

## Cleanup

Destructive local cleanup requires explicit approval too. Before proposing it,
verify a restorable Git backup and separate snapshots of valuable loose files,
including ignored work. Preserve ambiguous history, reflog-only work and
post-merge local edits.

For every deletion, require content/PR evidence and an approved manifest of
exact refs, full tip SHAs and worktree paths. Immediately recheck ownership,
worktree contents, live tips and PR state. Changed tips or new work invalidate
approval for that row. Never delete by age, a gone upstream or merged-PR status
alone; squash/rebase merges can hide ancestry.

GitHub automatically deletes merged PR head branches, including PRs merged by
the user. Merge commits preserve their integrated history. Automatic remote
deletion does not remove local worktrees or preserve uncommitted follow-ups:
the session's mandatory local audit and approved cleanup still apply.

Use exact-path `git worktree remove` without force and `git branch -d` where
ancestry permits. A refusal does not authorize force. Any exceptional local
force deletion or expected-tip remote deletion needs its own approved row.
Do not delete parent directories, prune tags, rewrite archive refs or run
garbage collection as a cleanup shortcut.

These instructions bind task execution but are not an access-control system.
GitHub CI/protection rules enforce remote gates where configured; report missing
permissions or enforcement rather than claiming instructions prevent every
possible bypass.
