#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand as runProcessCommand } from "../resources/skills/kamiflow-core/scripts/lib-process.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const defaults = {
  remote: "origin",
  sourceBranch: "codex/full-pivot-skill-first",
  cleanBranch: "codex/main-skill-clean",
  targetMain: "main",
  legacyBranch: "codex/legacy-kfc-main",
  legacyTag: "legacy-kfc-main-2026-03-23",
  legacyCommit: "4276917c70a91b56333fc2429a4bd5fb672ed6eb",
  commitMessage: "refactor(repo): publish standalone kamiflow-core on main"
};

const args = parseCliArgs(process.argv.slice(2));
const execute = Boolean(args.execute);
const updateLocalMain = Boolean(args["update-local-main"]);
const pushCleanBranch = Boolean(args["push-clean-branch"]);
const pushMain = Boolean(args["push-main"]);
const sourceBranch = String(args["source-branch"] || defaults.sourceBranch);
const sourceCommit = String(args["source-commit"] || (await revParse("HEAD")));
const cleanBranch = String(args["clean-branch"] || defaults.cleanBranch);
const targetMain = String(args["target-main"] || defaults.targetMain);
const remote = String(args.remote || defaults.remote);
const legacyBranch = String(args["legacy-branch"] || defaults.legacyBranch);
const legacyTag = String(args["legacy-tag"] || defaults.legacyTag);
const legacyCommit = String(args["legacy-commit"] || defaults.legacyCommit);
const expectedLocalMain = String(args["expected-local-main"] || "");
const expectedRemoteMain = String(args["expected-remote-main"] || "");
const fullRunId = String(args["full-run-id"] || "");
const commitMessage = String(args.message || defaults.commitMessage);

const currentBranch = await revParse("--abbrev-ref", "HEAD");
const headCommit = await revParse("HEAD");
const localMainCommit = await revParse(targetMain);
const remoteMainCommit = await revParse(`${remote}/${targetMain}`);

const summary = {
  mode: execute ? "execute" : "dry-run",
  current_branch: currentBranch,
  head_commit: headCommit,
  source_branch: sourceBranch,
  source_commit: sourceCommit,
  target_main: targetMain,
  local_main_commit: localMainCommit,
  remote_main_commit: remoteMainCommit,
  legacy_branch: legacyBranch,
  legacy_tag: legacyTag,
  legacy_commit: legacyCommit,
  clean_branch: cleanBranch,
  remote
};

const findings = [];

if (await worktreeDirty()) {
  findings.push("Worktree is not clean. Commit or stash changes before cutover.");
}

await verifyLegacyRef("local branch", legacyBranch, legacyCommit, findings);
await verifyLegacyRef("local tag", legacyTag, legacyCommit, findings, true);
await verifyRemoteLegacyRef(`${remote}/${legacyBranch}`, remote, `refs/heads/${legacyBranch}`, legacyCommit, findings);
await verifyRemoteLegacyRef(`${remote} tag ${legacyTag}`, remote, `refs/tags/${legacyTag}^{}`, legacyCommit, findings);

const fullRun = fullRunId ? await readFullRun(fullRunId) : null;
if (!fullRunId) {
  findings.push("Missing --full-run-id. Run `npm run forward-test -- --mode full` after the Codex quota reset and pass the resulting run id.");
} else if (!fullRun.ok) {
  findings.push(fullRun.reason);
}

const exactCommand = buildExecuteCommand({
  sourceCommit,
  expectedLocalMain: localMainCommit,
  expectedRemoteMain: remoteMainCommit,
  fullRunId: fullRunId || "<run-id>"
});

if (!execute) {
  printDryRun({ summary, findings, fullRun, exactCommand });
  process.exit(findings.length === 0 ? 0 : 1);
}

if (!expectedLocalMain) {
  findings.push("Missing --expected-local-main in execute mode.");
}
if (!expectedRemoteMain) {
  findings.push("Missing --expected-remote-main in execute mode.");
}
if (expectedLocalMain && expectedLocalMain !== localMainCommit) {
  findings.push(`Local ${targetMain} moved. Expected ${expectedLocalMain} but found ${localMainCommit}.`);
}
if (expectedRemoteMain && expectedRemoteMain !== remoteMainCommit) {
  findings.push(`Remote ${remote}/${targetMain} moved. Expected ${expectedRemoteMain} but found ${remoteMainCommit}.`);
}

if (findings.length > 0) {
  printDryRun({ summary, findings, fullRun, exactCommand });
  process.exit(1);
}

console.log("Running local cutover gates...");
await runChecked("npm", ["run", "validate"]);
await runChecked("npm", ["run", "skill:sync"]);
await runChecked("npm", ["run", "skill:doctor"]);
await runChecked("npm", ["run", "forward-test"]);
await runPackSmoke();

const cleanRootCommit = await createRootCommit({ sourceCommit, cleanBranch, commitMessage });

if (updateLocalMain) {
  await runChecked("git", ["update-ref", `refs/heads/${targetMain}`, cleanRootCommit, expectedLocalMain]);
}
if (pushCleanBranch) {
  await runChecked("git", ["push", remote, `refs/heads/${cleanBranch}:refs/heads/${cleanBranch}`]);
}
if (pushMain) {
  await runChecked("git", [
    "push",
    `--force-with-lease=refs/heads/${targetMain}:${expectedRemoteMain}`,
    remote,
    `refs/heads/${cleanBranch}:refs/heads/${targetMain}`
  ]);
}

console.log([
  "Cutover complete.",
  `Clean root commit: ${cleanRootCommit}`,
  `Local ${targetMain}: ${updateLocalMain ? "updated" : "unchanged"}`,
  `Remote ${cleanBranch}: ${pushCleanBranch ? "pushed" : "unchanged"}`,
  `Remote ${targetMain}: ${pushMain ? "updated" : "unchanged"}`
].join("\n"));

async function verifyLegacyRef(label, refName, expectedCommit, findingsList, isTag = false) {
  try {
    const commit = isTag
      ? await revList(refName)
      : await revParse(refName);
    if (commit !== expectedCommit) {
      findingsList.push(`${label} ${refName} points to ${commit}, expected ${expectedCommit}.`);
    }
  } catch {
    findingsList.push(`Missing ${label} ${refName}.`);
  }
}

async function verifyRemoteLegacyRef(label, remoteName, refName, expectedCommit, findingsList) {
  let commit = "";
  if (refName.startsWith("refs/tags/")) {
    const pattern = refName.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, "") + "*";
    const result = await runCommand("git", ["ls-remote", "--tags", remoteName, pattern], { cwd: repoRoot });
    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const dereferenced = lines.find((line) => line.endsWith(`${refName}`));
    commit = (dereferenced || lines[0] || "").split(/\s+/)[0] || "";
  } else {
    const result = await runCommand("git", ["ls-remote", remoteName, refName], { cwd: repoRoot });
    commit = result.stdout.trim().split(/\s+/)[0] || "";
  }
  if (!commit) {
    findingsList.push(`Missing ${label}.`);
    return;
  }
  if (commit !== expectedCommit) {
    findingsList.push(`${label} points to ${commit}, expected ${expectedCommit}.`);
  }
}

async function readFullRun(runId) {
  const summaryPath = path.join(repoRoot, ".local", "forward-tests", runId, "summary.json");
  if (!fs.existsSync(summaryPath)) {
    return {
      ok: false,
      reason: `Missing full forward-test artifact: ${summaryPath}`
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(summaryPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to parse ${summaryPath}: ${error.message}`
    };
  }

  if (String(parsed.mode || "").toLowerCase() !== "full") {
    return {
      ok: false,
      reason: `Forward-test run ${runId} is mode=${parsed.mode || "<missing>"}, expected full.`
    };
  }
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `Forward-test run ${runId} is BLOCK.`
    };
  }
  if (parsed.repo_head && parsed.repo_head !== sourceCommit) {
    return {
      ok: false,
      reason: `Forward-test run ${runId} was recorded for ${parsed.repo_head}, expected ${sourceCommit}.`
    };
  }

  return {
    ok: true,
    path: summaryPath
  };
}

function printDryRun({ summary: info, findings: issues, fullRun: full, exactCommand: command }) {
  const lines = [
    `Mode: ${info.mode}`,
    `Current Branch: ${info.current_branch}`,
    `HEAD: ${info.head_commit}`,
    `Source Branch: ${info.source_branch}`,
    `Source Commit: ${info.source_commit}`,
    `Local ${info.target_main}: ${info.local_main_commit}`,
    `Remote ${info.remote}/${info.target_main}: ${info.remote_main_commit}`,
    `Legacy Branch: ${info.legacy_branch} -> ${info.legacy_commit}`,
    `Legacy Tag: ${info.legacy_tag} -> ${info.legacy_commit}`,
    `Clean Branch: ${info.clean_branch}`,
    `Full Forward-Test: ${full?.ok ? full.path : "BLOCK"}`,
    `Readiness: ${issues.length === 0 ? "PASS" : "BLOCK"}`,
    "Next:"
  ];

  if (issues.length === 0) {
    lines.push(`  ${command}`);
  } else {
    for (const issue of issues) {
      lines.push(`  BLOCK: ${issue}`);
    }
    lines.push("  Retry after the full live gate passes, then run:");
    lines.push(`  ${command}`);
  }

  console.log(lines.join("\n"));
}

function buildExecuteCommand({ sourceCommit: commit, expectedLocalMain: localMain, expectedRemoteMain: remoteMain, fullRunId: runId }) {
  return [
    "node scripts/cutover-main.mjs",
    "--execute",
    `--source-commit ${commit}`,
    `--expected-local-main ${localMain}`,
    `--expected-remote-main ${remoteMain}`,
    `--full-run-id ${runId}`,
    "--update-local-main",
    "--push-clean-branch",
    "--push-main"
  ].join(" ");
}

async function runPackSmoke() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "kamiflow-core-cutover-"));
  try {
    const packResult = await runCommand("npm", ["pack", "--json"], { cwd: repoRoot });
    if (packResult.code !== 0) {
      throw new Error(packResult.stderr || packResult.stdout || "npm pack failed");
    }

    const parsed = JSON.parse(packResult.stdout.trim());
    const tarballName = parsed?.[0]?.filename;
    if (!tarballName) {
      throw new Error("npm pack --json did not report a tarball filename.");
    }

    const tarballPath = path.join(repoRoot, tarballName);
    const clientRepo = path.join(tempRoot, "client");
    await fsp.mkdir(clientRepo, { recursive: true });
    await runChecked("git", ["init", "-q"], { cwd: clientRepo });
    await runChecked("npx", ["--yes", "--package", tarballPath, "kamiflow-core", "install", "--project", clientRepo]);

    await requirePath(path.join(clientRepo, "AGENTS.md"));
    await requirePath(path.join(clientRepo, ".local", "project.md"));
    await requirePath(path.join(clientRepo, ".local", "plans"));
    await requirePath(path.join(clientRepo, ".local", "plans", "done"));

    const excludePath = path.join(clientRepo, ".git", "info", "exclude");
    const excludeText = await fsp.readFile(excludePath, "utf8");
    if (!excludeText.split(/\r?\n/).includes("AGENTS.md")) {
      throw new Error("Pack smoke failed: .git/info/exclude is missing AGENTS.md");
    }

    await fsp.rm(tarballPath, { force: true });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

async function requirePath(targetPath) {
  const stat = await fsp.stat(targetPath).catch(() => null);
  if (!stat) {
    throw new Error(`Pack smoke failed: missing ${targetPath}`);
  }
}

async function createRootCommit({ sourceCommit: commit, cleanBranch: branch, commitMessage: message }) {
  const tree = await showTree(commit);
  const commitResult = await runCommand("git", ["commit-tree", tree, "-m", message], { cwd: repoRoot });
  if (commitResult.code !== 0) {
    throw new Error(commitResult.stderr || commitResult.stdout || "git commit-tree failed");
  }
  const newCommit = commitResult.stdout.trim();
  await runChecked("git", ["update-ref", `refs/heads/${branch}`, newCommit]);
  return newCommit;
}

async function worktreeDirty() {
  const result = await runCommand("git", ["status", "--porcelain"], { cwd: repoRoot });
  return result.stdout.trim().length > 0;
}

async function revList(refName) {
  const result = await runCommand("git", ["rev-list", "-n", "1", refName], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `git rev-list ${refName} failed`);
  }
  return result.stdout.trim();
}

async function showTree(refName) {
  const result = await runCommand("git", ["show", "-s", "--format=%T", refName], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `git show --format=%T ${refName} failed`);
  }
  return result.stdout.trim();
}

async function revParse(...argsList) {
  const result = await runCommand("git", ["rev-parse", ...argsList], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `git rev-parse ${argsList.join(" ")} failed`);
  }
  return result.stdout.trim();
}

async function runChecked(command, commandArgs, options = {}) {
  const result = await runCommand(command, commandArgs, options);
  if (result.code !== 0) {
    throw new Error([
      `${command} ${commandArgs.join(" ")} failed`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result;
}

function parseCliArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

async function runCommand(command, commandArgs, options = {}) {
  return await runProcessCommand(command, commandArgs, {
    ...options,
    cwd: options.cwd || repoRoot
  });
}
