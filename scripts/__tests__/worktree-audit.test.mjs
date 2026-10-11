import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";

const moduleUrl = new URL("../worktree-audit.mjs", import.meta.url);

test("detects locally merged worktrees after a human merge without deleting them", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "xbrw-worktree-audit-")));
  const repo = join(parent, "repo");
  const task = join(parent, "task with spaces");
  const git = (...args) => execFileSync("git", args, {cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]});
  try {
    execFileSync("git", ["init", "-q", "-b", "develop", repo]);
    git("config", "user.name", "Worktree test");
    git("config", "user.email", "worktree-test@example.invalid");
    writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
    git("add", ".gitignore");
    git("commit", "-qm", "baseline");
    git("branch", "main");
    git("worktree", "add", "-b", "fix/test", task);
    writeFileSync(join(task, "work.txt"), "finished task\n");
    execFileSync("git", ["add", "work.txt"], {cwd: task});
    execFileSync("git", ["commit", "-qm", "task"], {cwd: task});
    const audit = await import(moduleUrl);
    let report = audit.auditWorktrees(repo);
    assert.equal(report.find(row => row.path === task).status, "unmerged");
    git("merge", "--no-ff", "fix/test", "-m", "human merge");
    report = audit.auditWorktrees(repo);
    assert.equal(report.find(row => row.path === repo).status, "protected");
    assert.equal(report.find(row => row.path === task).status, "merged-clean");
    writeFileSync(join(task, "ignored.txt"), "valuable draft");
    assert.equal(audit.auditWorktrees(repo).find(row => row.path === task).status, "merged-preserve-ignored");
    writeFileSync(join(task, "work.txt"), "unfinished follow-up");
    assert.equal(audit.auditWorktrees(repo).find(row => row.path === task).status, "dirty");
    assert.equal(git("worktree", "list", "--porcelain").includes(task), true);
  } finally {
    rmSync(parent, {recursive: true, force: true});
  }
});
