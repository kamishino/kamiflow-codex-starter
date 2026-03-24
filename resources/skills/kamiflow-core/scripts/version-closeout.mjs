#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  parseCliArgs,
  readReleasePolicy,
  resolveProjectDir
} from "./lib-plan-workspace.mjs";
import { resolveReleaseWindow } from "./lib-release-window.mjs";
import { isGitWorktree, readGitStatus as readGitStatusSync } from "./lib-process.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const requestedPlan = String(args.plan || "").trim();
const releasePolicy = await readReleasePolicy(projectDir);
const releaseWindow = await resolveReleaseWindow(projectDir, {
  requestedPlanRef: requestedPlan
});
const requestedPlanSummary = releaseWindow.requested_plan;

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

if (requestedPlan && !requestedPlanSummary) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: No PASS plan matched the requested reference.");
  console.error("Recovery: Resolve or archive the target PASS plan, then rerun version-closeout.");
  process.exit(1);
}

if (requestedPlanSummary?.error) {
  console.error("SemVer Closeout: BLOCK");
  console.error(`Reason: ${requestedPlanSummary.error}`);
  console.error("Recovery: Pass a PASS plan that is still inside the current unreleased release window.");
  process.exit(1);
}

if (releaseWindow.invalid_impact_plans.length > 0) {
  const invalidPlans = releaseWindow.invalid_impact_plans
    .map((plan) => `${plan.plan_id || path.basename(plan.path)} (${plan.release_impact_errors[0] || "invalid Release Impact"})`)
    .join(" | ");
  console.error("SemVer Closeout: BLOCK");
  console.error(`Reason: Release window contains PASS plans with unresolved Release Impact: ${invalidPlans}`);
  console.error("Recovery: Resolve every PASS plan in the current unreleased window before rerunning version-closeout.");
  process.exit(1);
}

if (!releasePolicy.version_files.includes("package.json")) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: This first slice requires package.json in Release Policy Version Files.");
  process.exit(1);
}

if (!isGitWorktree(projectDir)) {
  console.error("SemVer Closeout: BLOCK");
  console.error("Reason: SemVer closeout requires a Git worktree so release-only commits and tags can be created.");
  console.error("Recovery: Run this helper inside a Git repo after the functional changes are committed.");
  process.exit(1);
}

if (releaseWindow.aggregated_impact) {
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

const nextVersion = bumpVersion(currentVersion, releaseWindow.aggregated_impact);
const updatedFiles = [];
const skippedFiles = [];

if (releaseWindow.aggregated_impact) {
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

const status = releaseWindow.aggregated_impact ? "READY" : "NOOP";
const changedFiles = releaseWindow.aggregated_impact
  ? readGitStatus(projectDir)
  : [];
const commitCommand = releaseWindow.aggregated_impact
  ? buildCommitCommand(nextVersion, releaseWindow.aggregated_impact, releaseWindow.primary_plan?.title || "", updatedFiles)
  : "";
const tagCommand = releaseWindow.aggregated_impact
  ? buildTagCommand(nextVersion)
  : "";
const includedPlans = releaseWindow.candidate_plans
  .map((plan) => formatReleasePlanLine(plan))
  .join("\n");

console.log([
  `SemVer Closeout: ${status}`,
  `Project: ${projectDir}`,
  `Requested Plan: ${requestedPlanSummary?.path || "none"}`,
  `Baseline Tag: ${releaseWindow.baseline.tag || "none"}`,
  `Baseline Version: ${releaseWindow.baseline.version || "none"}`,
  `Baseline Committed At: ${releaseWindow.baseline.committed_at || "none"}`,
  `Aggregated Impact: ${releaseWindow.aggregated_impact || "none"}`,
  `Included Plans:`,
  ...(includedPlans ? includedPlans.split("\n") : ["  none"]),
  `Current Version: ${currentVersion}`,
  `Next Version: ${nextVersion}`,
  `Updated: ${updatedFiles.length > 0 ? updatedFiles.join(" | ") : "none"}`,
  `Skipped: ${skippedFiles.length > 0 ? skippedFiles.join(" | ") : "none"}`,
  `Changed Files: ${changedFiles.length > 0 ? changedFiles.join(" | ") : "none"}`,
  releaseWindow.aggregated_impact
    ? "Release Commit Command:"
    : "Commit Guidance: No release-version commit is required because the unreleased window has no patch/minor/major impact.",
  ...(releaseWindow.aggregated_impact ? [`  ${commitCommand}`, "Tag Command:", `  ${tagCommand}`] : [])
].join("\n"));

function bumpVersion(version, impact) {
  if (!impact) {
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
  const escapedPlan = shellEscape(`Plan: ${planTitle || "release window"}`);
  return `git add ${addTarget} && git commit -m ${escapedVersion} -m ${escapedImpact} -m ${escapedPlan}`;
}

function buildTagCommand(nextVersionValue) {
  return `git tag v${nextVersionValue}`;
}

function formatReleasePlanLine(plan) {
  const impactLabel = plan.release_impact_valid ? plan.release_impact : "invalid";
  const reasonLabel = plan.release_reason || (plan.release_impact_errors[0] || "no reason");
  return `  - ${plan.plan_id || path.basename(plan.path)} | ${impactLabel} | ${plan.timestamp_source}=${plan.timestamp} | ${reasonLabel}`;
}

function shellEscape(value) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function readGitStatus(projectDir) {
  return readGitStatusSync(projectDir);
}
