#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  isPassPlanRecord,
  parseCliArgs,
  parseReleaseImpact,
  readReleasePolicy,
  resolveLatestDonePlan,
  resolvePlanRef,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const requestedPlan = String(args.plan || "").trim();
const releasePolicy = await readReleasePolicy(projectDir);
const plan = requestedPlan
  ? await resolvePlanRef(projectDir, requestedPlan)
  : await resolveDefaultReleasePlan(projectDir);

if (!plan) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: No active PASS plan or latest archived PASS plan matched the requested reference.");
  console.error("Recovery: Resolve or archive the target PASS plan, then rerun version-closeout.");
  process.exit(1);
}

if (!isPassPlanRecord(plan)) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: The selected plan is not PASS yet. Release closeout is only valid after PASS closeout.");
  console.error("Recovery: Finish validation and archive the PASS plan before rerunning version-closeout, or pass an explicit archived PASS plan with --plan.");
  process.exit(1);
}

if (!releasePolicy.enabled) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: SemVer workflow is not enabled in AGENTS.md.");
  console.error("Recovery: Add a Release Policy block to AGENTS.md or skip version closeout for this repo.");
  process.exit(1);
}

if (!releasePolicy.valid) {
  console.error("SemVer Closeout: BLOCK");
  console.error(`Reason: Release Policy is invalid: ${releasePolicy.errors[0]}`);
  console.error("Recovery: Fix the Release Policy block in AGENTS.md before rerunning version-closeout.");
  process.exit(1);
}

const releaseImpact = parseReleaseImpact(plan.content);
if (!releaseImpact.valid) {
  console.error("SemVer Closeout: BLOCK");
  console.error(`Reason: Release Impact is missing or unresolved: ${releaseImpact.errors[0]}`);
  console.error("Recovery: Resolve the Release Impact section in the active plan before rerunning version-closeout.");
  process.exit(1);
}

if (!releasePolicy.version_files.includes("package.json")) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: This first slice requires package.json in Release Policy Version Files.");
  process.exit(1);
}

const gitRepoCheck = runGit(projectDir, ["rev-parse", "--is-inside-work-tree"]);
if (gitRepoCheck.code !== 0 || !/^true$/i.test(gitRepoCheck.stdout.trim())) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: SemVer closeout requires a Git worktree so release-only commits and tags can be created.");
  console.error("Recovery: Run this helper inside a Git repo after the functional changes are committed.");
  process.exit(1);
}

if (releaseImpact.impact !== "none") {
  const worktreeStatus = readGitStatus(projectDir);
  if (worktreeStatus.length > 0) {
    console.error("SemVer Closeout: BLOCK");
    console.error("Reason: Git worktree is not clean. Commit the functional changes first, then rerun version-closeout.");
    console.error(`Dirty Paths: ${worktreeStatus.join(" | ")}`);
    process.exit(1);
  }
}

const packageJsonPath = path.join(projectDir, "package.json");
if (!fs.existsSync(packageJsonPath)) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: package.json is missing from the project root.");
  process.exit(1);
}

const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, "utf8"));
const currentVersion = String(packageJson.version || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) {
  console.error("SemVer Closeout: BLOCK");
  console.error(`Reason: package.json version is not a simple SemVer value: ${currentVersion || "<missing>"}`);
  process.exit(1);
}

const nextVersion = bumpVersion(currentVersion, releaseImpact.impact);
const updatedFiles = [];
const skippedFiles = [];

if (releaseImpact.impact !== "none") {
  packageJson.version = nextVersion;
  await fsp.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  updatedFiles.push("package.json");

  if (releasePolicy.version_files.includes("package-lock.json")) {
    const packageLockPath = path.join(projectDir, "package-lock.json");
    if (fs.existsSync(packageLockPath)) {
      const packageLock = JSON.parse(await fsp.readFile(packageLockPath, "utf8"));
      packageLock.version = nextVersion;
      if (packageLock.packages && typeof packageLock.packages === "object" && packageLock.packages[""]) {
        packageLock.packages[""].version = nextVersion;
      }
      await fsp.writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
      updatedFiles.push("package-lock.json");
    } else {
      skippedFiles.push("package-lock.json (not present)");
    }
  }
}

const status = releaseImpact.impact === "none" ? "NOOP" : "READY";
const changedFiles = releaseImpact.impact === "none"
  ? []
  : readGitStatus(projectDir);
const commitCommand = releaseImpact.impact === "none"
  ? ""
  : buildCommitCommand(nextVersion, releaseImpact.impact, plan.frontmatter.title || "", updatedFiles);
const tagCommand = releaseImpact.impact === "none"
  ? ""
  : buildTagCommand(nextVersion);

console.log([
  `SemVer Closeout: ${status}`,
  `Project: ${projectDir}`,
  `Plan: ${plan.path}`,
  `Impact: ${releaseImpact.impact}`,
  `Reason: ${releaseImpact.reason}`,
  `Current Version: ${currentVersion}`,
  `Next Version: ${nextVersion}`,
  `Updated: ${updatedFiles.length > 0 ? updatedFiles.join(" | ") : "none"}`,
  `Skipped: ${skippedFiles.length > 0 ? skippedFiles.join(" | ") : "none"}`,
  `Changed Files: ${changedFiles.length > 0 ? changedFiles.join(" | ") : "none"}`,
  releaseImpact.impact === "none"
    ? "Commit Guidance: No release-version commit is required because Release Impact is none."
    : "Release Commit Command:",
  ...(releaseImpact.impact === "none" ? [] : [`  ${commitCommand}`, "Tag Command:", `  ${tagCommand}`])
].join("\n"));

function bumpVersion(version, impact) {
  if (impact === "none") {
    return version;
  }

  const [major, minor, patch] = version.split(".").map((value) => Number.parseInt(value, 10));
  if (impact === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (impact === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major + 1}.0.0`;
}

function buildCommitCommand(nextVersionValue, impact, planTitle, versionFiles) {
  const addTarget = versionFiles.length > 0
    ? versionFiles.map((filePath) => shellEscape(filePath)).join(" ")
    : shellEscape("package.json");
  const escapedVersion = shellEscape(`release: v${nextVersionValue}`);
  const escapedImpact = shellEscape(`Impact: ${impact}`);
  const escapedPlan = shellEscape(`Plan: ${planTitle || "active plan"}`);
  return `git add ${addTarget} && git commit -m ${escapedVersion} -m ${escapedImpact} -m ${escapedPlan}`;
}

function buildTagCommand(nextVersionValue) {
  return `git tag v${nextVersionValue}`;
}

async function resolveDefaultReleasePlan(projectDir) {
  const activePlan = await resolvePlanRef(projectDir, "");
  if (activePlan) {
    return activePlan;
  }

  const latestDonePlan = await resolveLatestDonePlan(projectDir);
  return latestDonePlan || null;
}

function shellEscape(value) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function readGitStatus(projectDir) {
  const statusResult = runGit(projectDir, ["status", "--porcelain"]);
  if (statusResult.code !== 0) {
    return [];
  }
  return statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function runGit(projectDir, args) {
  const result = spawnSync("git", args, {
    cwd: projectDir,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  return {
    code: Number.isInteger(result.status) ? result.status : 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}
