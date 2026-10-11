import {execFileSync, spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {pathToFileURL} from "node:url";

export function auditWorktrees(cwd) {
  const git = (...args) => execFileSync("git", args, {cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]});
  const primary = dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir").trim());
  const targets = git("for-each-ref", "--format=%(refname)", "refs/heads/main",
    "refs/heads/develop", "refs/remotes/origin/main", "refs/remotes/origin/develop")
    .trim().split("\n").filter(Boolean);
  if (!targets.length) throw new Error("No main/develop integration refs found. Fetch the intended remote first.");
  const worktrees = [];
  for (const field of git("worktree", "list", "--porcelain", "-z").split("\0")) {
    if (field.startsWith("worktree ")) worktrees.push({path: field.slice(9)});
    else if (field.startsWith("HEAD ")) worktrees.at(-1).head = field.slice(5);
    else if (field.startsWith("branch ")) worktrees.at(-1).branch = field.slice(7).replace(/^refs\/heads\//, "");
    else if (field === "locked" || field.startsWith("locked ")) worktrees.at(-1).locked = true;
    else if (field === "prunable" || field.startsWith("prunable ")) worktrees.at(-1).prunable = true;
  }
  return worktrees.map(row => {
    if (row.path === primary || ["main", "develop"].includes(row.branch))
      return {...row, status: "protected", integratedInto: []};
    if (row.locked) return {...row, status: "locked-keep", integratedInto: []};
    if (row.prunable || !existsSync(row.path))
      return {...row, status: "unavailable-keep", integratedInto: []};
    if (!row.branch) return {...row, status: "detached-keep", integratedInto: []};
    const integratedInto = targets.filter(target => {
      const result = spawnSync("git", ["merge-base", "--is-ancestor", row.head, target],
        {cwd, encoding: "utf8"});
      if (result.error) throw result.error;
      if (result.status !== 0 && result.status !== 1)
        throw new Error(`Cannot check ${target}: ${result.stderr}`);
      return result.status === 0;
    });
    const dirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"],
      {cwd: row.path, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]}).length > 0;
    const ignored = execFileSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"],
      {cwd: row.path, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]})
      .split("\0").filter(Boolean).length;
    const status = dirty ? "dirty" : !integratedInto.length ? "unmerged" :
      ignored ? "merged-preserve-ignored" : "merged-clean";
    return {...row, status, ignoredEntries: ignored, integratedInto};
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rows = auditWorktrees(process.cwd());
  console.log(JSON.stringify(rows, null, 2));
  console.log("Read-only audit. Fetch origin --no-prune first for recent human merges. No worktree is deleted.");
  console.log("Merged rows require owner-idle confirmation, verified backup and exact path/head approval before removal.");
}
