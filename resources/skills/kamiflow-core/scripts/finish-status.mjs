#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  parseCliArgs,
  printJson,
  readReleasePolicy,
  resolveProjectDir
} from "./lib-plan-workspace.mjs";
import {
  isPassPlanRecord,
  resolveActivePlan,
  resolveLatestDonePlan
} from "./lib-plan-records.mjs";
import {
  buildReleaseWindowSummary,
  resolveReleaseWindow
} from "./lib-release-window.mjs";
import { readGitState } from "./lib-process.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const releasePolicy = await readReleasePolicy(projectDir);
const activePlan = await resolveActivePlan(projectDir);
const latestDonePlan = await resolveLatestDonePlan(projectDir);
const gitState = readGitState(projectDir);
const packageVersion = await readPackageVersion(projectDir);
const currentVersionTag = packageVersion ? `v${packageVersion}` : "";
const releaseWindow = await resolveReleaseWindow(projectDir);
const releaseAlreadyApplied = Boolean(currentVersionTag)
  && releaseWindow.candidate_plans.length === 0
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
  releaseAlreadyApplied,
  releaseWindow
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
  release_window: buildReleaseWindowSummary(releaseWindow),
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
  releaseAlreadyApplied: releaseAlreadyAppliedForCurrentVersion,
  releaseWindow
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

  if (activePlanRecord && !isPassPlanRecord(activePlanRecord)) {
    releaseBlockers.push("Active plan is not PASS yet, so release stays blocked until closeout is complete.");
  }

  if (releaseWindow.invalid_impact_plans.length > 0) {
    const impactedPlans = releaseWindow.invalid_impact_plans
      .map((plan) => `${plan.plan_id || path.basename(plan.path)} (${plan.release_impact_errors[0] || "invalid Release Impact"})`)
      .join(" | ");
    releaseBlockers.push(`Release window contains PASS plans with unresolved Release Impact: ${impactedPlans}`);
  }

  const aggregatedImpact = releaseWindow.aggregated_impact;
  const releasePlan = releaseWindow.primary_plan
    ? buildReleasePlanSummary(releaseWindow.primary_plan, "release-window-primary")
    : null;

  if (releasePolicyRecord.enabled && releasePolicyRecord.valid) {
    if (aggregatedImpact && !currentVersion) {
      releaseBlockers.push("package.json version is missing or unreadable, so release closeout cannot determine the current version.");
    } else if (releaseAlreadyAppliedForCurrentVersion) {
      releaseBlockers.push(`Release closeout already appears applied at HEAD for ${currentVersionTagValue}.`);
    }
  }

  if (aggregatedImpact && hasDirtyWorktree) {
    releaseBlockers.push("Git worktree is not clean; commit the functional changes before release closeout.");
  }

  if (semverReady && aggregatedImpact && !releaseAlreadyAppliedForCurrentVersion && releaseWindow.invalid_impact_plans.length === 0) {
    if (hasDirtyWorktree) {
      return {
        recommendedAction: "commit-and-release",
        reason: buildPendingReleaseReason(releaseWindow),
        releaseReady: false,
        releaseBlockers,
        releasePlan
      };
    }

    if (gitStateRecord.insideWorktree) {
      return {
        recommendedAction: "release-only",
        reason: buildPendingReleaseReason(releaseWindow),
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
      latestDonePlan: latestDonePlanRecord,
      releaseWindow,
      releasePlan,
      aggregatedImpact,
      releaseAlreadyApplied: releaseAlreadyAppliedForCurrentVersion
    }),
    releaseReady: false,
    releaseBlockers,
    releasePlan
  };
}

function buildCommitOnlyReason({
  hasDirtyWorktree,
  releasePolicy,
  activePlan,
  latestDonePlan,
  releaseWindow,
  releasePlan,
  aggregatedImpact,
  releaseAlreadyApplied
}) {
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

  if (!activePlan && !latestDonePlan) {
    return hasDirtyWorktree
      ? "Functional changes are pending, but there is no PASS plan ready for release closeout."
      : "No releasable PASS plan is available, so only normal commit flow applies.";
  }

  if (releaseWindow.invalid_impact_plans.length > 0) {
    return "Release closeout is blocked until every PASS plan in the current unreleased window has a valid Release Impact.";
  }

  if (releaseWindow.candidate_plans.length === 0) {
    if (releaseAlreadyApplied) {
      return hasDirtyWorktree
        ? "The current version already looks released at HEAD; commit the remaining functional changes only."
        : `No unreleased PASS plans remain after ${releaseWindow.baseline.tag || "the current release baseline"}, so no release closeout is pending.`;
    }
    return hasDirtyWorktree
      ? "Functional changes are pending, but there is no unreleased PASS plan after the latest release tag."
      : `No unreleased PASS plans remain after ${releaseWindow.baseline.tag || "the current release baseline"}, so no release closeout is pending.`;
  }

  if (!aggregatedImpact) {
    return hasDirtyWorktree
      ? "All unreleased PASS plans in the current window are none-impact, so only a functional commit is expected."
      : `All unreleased PASS plans since ${releaseWindow.baseline.tag || "the start of history"} are none-impact, so there is no release closeout to run.`;
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

function buildPendingReleaseReason(releaseWindow) {
  const baselineLabel = releaseWindow.baseline.tag || "the start of history";
  const planLabels = releaseWindow.releasable_plans
    .map((plan) => `${plan.plan_id || path.basename(plan.path)}:${plan.release_impact}`)
    .join(" | ");
  return `Release closeout is pending from ${baselineLabel}. Aggregated impact is ${releaseWindow.aggregated_impact} across ${planLabels}.`;
}

function buildReleasePlanSummary(plan, source) {
  return {
    path: plan.path,
    source,
    plan_id: plan.plan_id || "",
    status: plan.status || "",
    decision: plan.decision || "",
    lifecycle_phase: plan.lifecycle_phase || "",
    release_impact: plan.release_impact || "",
    release_reason: plan.release_reason || "",
    timestamp: plan.timestamp || ""
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
