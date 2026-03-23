#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  isPassPlanRecord,
  parseCliArgs,
  parseReleaseImpact,
  printJson,
  readReleasePolicy,
  resolveActivePlan,
  resolveLatestDonePlan,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const releasePolicy = await readReleasePolicy(projectDir);
const activePlan = await resolveActivePlan(projectDir);
const latestDonePlan = await resolveLatestDonePlan(projectDir);
const gitState = readGitState(projectDir);
const packageVersion = await readPackageVersion(projectDir);
const currentVersionTag = packageVersion ? `v${packageVersion}` : "";
const releaseAlreadyApplied = Boolean(currentVersionTag)
  && (
    gitState.headSubject === `release: ${currentVersionTag}`
    || gitState.tagsAtHead.includes(currentVersionTag)
  );

const finishContext = resolveFinishContext({
  activePlan,
  latestDonePlan,
  releasePolicy,
  gitState,
  packageVersion,
  currentVersionTag,
  releaseAlreadyApplied
});

printJson({
  ok: true,
  project: projectDir,
  semver_enabled: releasePolicy.enabled,
  release_policy_valid: releasePolicy.valid,
  recommended_action: finishContext.recommendedAction,
  reason: finishContext.reason,
  release_ready: finishContext.releaseReady,
  release_blockers: finishContext.releaseBlockers,
  release_plan: finishContext.releasePlan,
  active_plan: summarizePlan(activePlan),
  latest_done_plan: summarizePlan(latestDonePlan),
  git: {
    inside_worktree: gitState.insideWorktree,
    dirty_paths: gitState.dirtyPaths,
    head_subject: gitState.headSubject,
    tags_at_head: gitState.tagsAtHead
  },
  version: {
    current: packageVersion,
    current_tag: currentVersionTag,
    release_closeout_applied: releaseAlreadyApplied
  }
});

function resolveFinishContext({
  activePlan: activePlanRecord,
  latestDonePlan: latestDonePlanRecord,
  releasePolicy: releasePolicyRecord,
  gitState: gitStateRecord,
  packageVersion: currentVersion,
  currentVersionTag: currentVersionTagValue,
  releaseAlreadyApplied: releaseAlreadyAppliedForCurrentVersion
}) {
  const releaseBlockers = [];
  const hasDirtyWorktree = gitStateRecord.dirtyPaths.length > 0;
  const semverReady = releasePolicyRecord.enabled && releasePolicyRecord.valid;

  if (!gitStateRecord.insideWorktree) {
    releaseBlockers.push("Git worktree is unavailable, so release closeout cannot be evaluated or completed.");
  }

  if (!releasePolicyRecord.enabled) {
    releaseBlockers.push("SemVer workflow is disabled in AGENTS.md.");
  } else if (!releasePolicyRecord.valid) {
    releaseBlockers.push(`Release Policy is invalid: ${releasePolicyRecord.errors[0]}`);
  }

  let releasePlan = null;
  let releaseImpact = null;

  if (activePlanRecord) {
    if (!isPassPlanRecord(activePlanRecord)) {
      releaseBlockers.push("Active plan is not PASS yet, so release stays blocked until closeout is complete.");
    } else {
      releasePlan = buildReleasePlanSummary(activePlanRecord, "active-pass");
      releaseImpact = parseReleaseImpact(activePlanRecord.content);
    }
  } else if (latestDonePlanRecord && isPassPlanRecord(latestDonePlanRecord)) {
    releasePlan = buildReleasePlanSummary(latestDonePlanRecord, "latest-done-pass");
    releaseImpact = parseReleaseImpact(latestDonePlanRecord.content);
  } else {
    releaseBlockers.push("No active or archived PASS plan is available for release evaluation.");
  }

  if (releasePlan && releaseImpact) {
    releasePlan.release_impact = releaseImpact.valid ? releaseImpact.impact : "";
    releasePlan.release_reason = releaseImpact.reason || "";
  }

  if (releasePlan && releasePolicyRecord.enabled && releasePolicyRecord.valid) {
    if (!releaseImpact?.valid) {
      releaseBlockers.push(`Release Impact is missing or unresolved: ${releaseImpact?.errors?.[0] || "unknown error"}`);
    } else if (releaseImpact.impact === "none") {
      releaseBlockers.push("Release Impact is none, so this slice should not cut a release.");
    } else if (!currentVersion) {
      releaseBlockers.push("package.json version is missing or unreadable, so release closeout cannot determine the current version.");
    } else if (releaseAlreadyAppliedForCurrentVersion) {
      releaseBlockers.push(`Release closeout already appears applied at HEAD for ${currentVersionTagValue}.`);
    }
  }

  if (releasePlan && releaseImpact?.valid && releaseImpact.impact !== "none" && hasDirtyWorktree) {
    releaseBlockers.push("Git worktree is not clean; commit the functional changes before release closeout.");
  }

  if (semverReady && releasePlan && releaseImpact?.valid && releaseImpact.impact !== "none" && !releaseAlreadyAppliedForCurrentVersion) {
    if (hasDirtyWorktree) {
      return {
        recommendedAction: "commit-and-release",
        reason: "The slice is releasable, but functional changes are still uncommitted. Commit first, then run release closeout.",
        releaseReady: false,
        releaseBlockers,
        releasePlan
      };
    }

    if (gitStateRecord.insideWorktree) {
      return {
        recommendedAction: "release-only",
        reason: "The functional work is already committed and the current PASS slice is releasable. Release closeout is the next step.",
        releaseReady: true,
        releaseBlockers: [],
        releasePlan
      };
    }
  }

  return {
    recommendedAction: "commit-only",
    reason: buildCommitOnlyReason({
      hasDirtyWorktree,
      releasePolicy: releasePolicyRecord,
      activePlan: activePlanRecord,
      releasePlan,
      releaseImpact,
      releaseAlreadyApplied: releaseAlreadyAppliedForCurrentVersion
    }),
    releaseReady: false,
    releaseBlockers,
    releasePlan
  };
}

function buildCommitOnlyReason({ hasDirtyWorktree, releasePolicy, activePlan, releasePlan, releaseImpact, releaseAlreadyApplied }) {
  if (!releasePolicy.enabled) {
    return hasDirtyWorktree
      ? "Functional changes are pending and this repo does not use SemVer release closeout."
      : "No release closeout is expected because this repo does not use SemVer release closeout.";
  }

  if (!releasePolicy.valid) {
    return "Release closeout is blocked until the Release Policy block in AGENTS.md is fixed.";
  }

  if (activePlan && !isPassPlanRecord(activePlan)) {
    return hasDirtyWorktree
      ? "Functional changes are still in progress and the active plan is not PASS yet."
      : "Release stays blocked until the active plan reaches PASS closeout.";
  }

  if (!releasePlan) {
    return hasDirtyWorktree
      ? "Functional changes are pending, but there is no PASS plan ready for release closeout."
      : "No releasable PASS plan is available, so only normal commit flow applies.";
  }

  if (!releaseImpact?.valid) {
    return "Release closeout is blocked until Release Impact is resolved in the PASS plan.";
  }

  if (releaseImpact.impact === "none") {
    return hasDirtyWorktree
      ? "Release Impact is none, so only a functional commit is expected for this slice."
      : "Release Impact is none, so there is no release closeout to run.";
  }

  if (releaseAlreadyApplied) {
    return hasDirtyWorktree
      ? "The current version already looks released at HEAD; commit the remaining functional changes only."
      : "The current version already looks released at HEAD, so no release closeout is pending.";
  }

  return hasDirtyWorktree
    ? "Functional changes should be committed first before any release decision."
    : "No release closeout is ready yet.";
}

function buildReleasePlanSummary(plan, source) {
  return {
    path: plan.path,
    source,
    plan_id: plan.frontmatter.plan_id || "",
    status: plan.frontmatter.status || "",
    decision: plan.frontmatter.decision || "",
    lifecycle_phase: plan.frontmatter.lifecycle_phase || ""
  };
}

function summarizePlan(plan) {
  if (!plan) {
    return null;
  }
  return {
    path: plan.path,
    plan_id: plan.frontmatter.plan_id || "",
    status: plan.frontmatter.status || "",
    decision: plan.frontmatter.decision || "",
    lifecycle_phase: plan.frontmatter.lifecycle_phase || "",
    next_command: plan.frontmatter.next_command || "",
    next_mode: plan.frontmatter.next_mode || ""
  };
}

async function readPackageVersion(projectDir) {
  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return "";
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(packageJsonPath, "utf8"));
    const version = String(parsed?.version || "").trim();
    return /^\d+\.\d+\.\d+$/.test(version) ? version : "";
  } catch {
    return "";
  }
}

function readGitState(projectDir) {
  const repoCheck = runGit(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  if (repoCheck.code !== 0 || !/^true$/i.test(repoCheck.stdout.trim())) {
    return {
      insideWorktree: false,
      dirtyPaths: [],
      headSubject: "",
      tagsAtHead: []
    };
  }

  return {
    insideWorktree: true,
    dirtyPaths: readGitStatus(projectDir),
    headSubject: runGit(projectDir, ["log", "-1", "--pretty=%s"]).stdout.trim(),
    tagsAtHead: runGit(projectDir, ["tag", "--points-at", "HEAD"]).stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  };
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
