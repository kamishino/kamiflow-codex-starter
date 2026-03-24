import path from "node:path";
import {
  isPassPlanRecord,
  listPlanRecords,
  resolvePlanRef
} from "./lib-plan-records.mjs";
import { parseReleaseImpact } from "./lib-plan-closeout.mjs";
import {
  isGitWorktree,
  runGitCommandSync
} from "./lib-process.mjs";

const SEMVER_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_IMPACT_RANK = Object.freeze({
  none: 0,
  patch: 1,
  minor: 2,
  major: 3
});

export async function resolveReleaseWindow(projectDir, { requestedPlanRef = "" } = {}) {
  const baseline = readLatestReleaseBaseline(projectDir);
  const requestedPlan = requestedPlanRef ? await resolvePlanRef(projectDir, requestedPlanRef) : null;
  const allPlans = await listPlanRecords(projectDir, true);
  const candidatePlans = [];

  for (const plan of allPlans) {
    if (!isPassPlanRecord(plan)) {
      continue;
    }

    const timestamp = resolvePlanTimestamp(plan);
    if (!timestamp.valid) {
      continue;
    }

    if (baseline.exists && timestamp.ms <= baseline.committed_at_ms) {
      continue;
    }

    const releaseImpact = parseReleaseImpact(plan.content);
    candidatePlans.push({
      path: plan.path,
      name: plan.name,
      plan_id: plan.frontmatter.plan_id || "",
      title: plan.frontmatter.title || path.basename(plan.path, ".md"),
      source: String(plan.frontmatter.status || "").toLowerCase() === "done" ? "archived-pass" : "active-pass",
      status: plan.frontmatter.status || "",
      decision: plan.frontmatter.decision || "",
      lifecycle_phase: plan.frontmatter.lifecycle_phase || "",
      timestamp: timestamp.iso,
      timestamp_source: timestamp.source,
      release_impact: releaseImpact.valid ? releaseImpact.impact : "",
      release_reason: releaseImpact.reason || "",
      release_impact_valid: releaseImpact.valid,
      release_impact_errors: [...releaseImpact.errors],
      impact_rank: impactRank(releaseImpact.impact)
    });
  }

  candidatePlans.sort(compareWindowPlans);

  const invalidImpactPlans = candidatePlans.filter((plan) => !plan.release_impact_valid);
  const releasablePlans = candidatePlans.filter((plan) => plan.release_impact_valid && plan.release_impact !== "none");
  const aggregatedImpact = releasablePlans.reduce((current, plan) => {
    return impactRank(plan.release_impact) > impactRank(current) ? plan.release_impact : current;
  }, "");
  const primaryPlan = aggregatedImpact
    ? [...releasablePlans]
      .filter((plan) => plan.release_impact === aggregatedImpact)
      .sort(compareWindowPlans)
      .slice(-1)[0] || null
    : null;

  return {
    baseline,
    candidate_plans: candidatePlans,
    invalid_impact_plans: invalidImpactPlans,
    releasable_plans: releasablePlans,
    aggregated_impact: aggregatedImpact,
    primary_plan: primaryPlan,
    requested_plan: summarizeRequestedPlan(requestedPlan, baseline, candidatePlans)
  };
}

export function buildReleaseWindowSummary(releaseWindow) {
  return {
    baseline_tag: releaseWindow.baseline.tag || "",
    baseline_version: releaseWindow.baseline.version || "",
    baseline_committed_at: releaseWindow.baseline.committed_at || "",
    aggregated_impact: releaseWindow.aggregated_impact || "",
    candidate_plans: releaseWindow.candidate_plans.map(summarizeWindowPlan),
    releasable_plans: releaseWindow.releasable_plans.map(summarizeWindowPlan),
    invalid_impact_plans: releaseWindow.invalid_impact_plans.map(summarizeWindowPlan),
    primary_plan: releaseWindow.primary_plan ? summarizeWindowPlan(releaseWindow.primary_plan) : null,
    requested_plan: releaseWindow.requested_plan
  };
}

export function summarizeWindowPlan(plan) {
  return {
    path: plan.path,
    plan_id: plan.plan_id,
    title: plan.title,
    source: plan.source,
    status: plan.status,
    decision: plan.decision,
    lifecycle_phase: plan.lifecycle_phase,
    timestamp: plan.timestamp,
    timestamp_source: plan.timestamp_source,
    release_impact: plan.release_impact,
    release_reason: plan.release_reason,
    release_impact_valid: plan.release_impact_valid,
    release_impact_errors: [...(plan.release_impact_errors || [])]
  };
}

export function impactRank(impact) {
  return RELEASE_IMPACT_RANK[String(impact || "").toLowerCase()] || 0;
}

function summarizeRequestedPlan(requestedPlan, baseline, candidatePlans) {
  if (!requestedPlan) {
    return null;
  }

  const releaseImpact = parseReleaseImpact(requestedPlan.content);
  const timestamp = resolvePlanTimestamp(requestedPlan);
  const inWindow = candidatePlans.some((plan) => plan.path === requestedPlan.path);

  let error = "";
  if (!isPassPlanRecord(requestedPlan)) {
    error = "Requested plan is not PASS yet.";
  } else if (!timestamp.valid) {
    error = "Requested plan is missing a valid release-window timestamp.";
  } else if (baseline.exists && timestamp.ms <= baseline.committed_at_ms) {
    error = `Requested plan is outside the current unreleased window since ${baseline.tag}.`;
  }

  return {
    path: requestedPlan.path,
    plan_id: requestedPlan.frontmatter.plan_id || "",
    title: requestedPlan.frontmatter.title || path.basename(requestedPlan.path, ".md"),
    in_window: inWindow,
    release_impact: releaseImpact.valid ? releaseImpact.impact : "",
    release_reason: releaseImpact.reason || "",
    release_impact_valid: releaseImpact.valid,
    release_impact_errors: [...releaseImpact.errors],
    error
  };
}

function readLatestReleaseBaseline(projectDir) {
  if (!isGitWorktree(projectDir)) {
    return {
      exists: false,
      tag: "",
      version: "",
      commit: "",
      committed_at: "",
      committed_at_ms: Number.NEGATIVE_INFINITY
    };
  }

  const describeResult = runGitCommandSync(projectDir, [
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    "v[0-9]*.[0-9]*.[0-9]*",
    "HEAD"
  ]);
  const tag = describeResult.code === 0 ? describeResult.stdout.trim() : "";
  const tagMatch = tag.match(SEMVER_TAG_PATTERN);
  if (!tagMatch) {
    return {
      exists: false,
      tag: "",
      version: "",
      commit: "",
      committed_at: "",
      committed_at_ms: Number.NEGATIVE_INFINITY
    };
  }

  const infoResult = runGitCommandSync(projectDir, ["log", "-1", "--format=%H%n%cI", tag]);
  const [commit = "", committedAt = ""] = infoResult.stdout.split(/\r?\n/);
  const committedAtMs = parseTimestamp(committedAt);

  return {
    exists: true,
    tag,
    version: tag.slice(1),
    commit: commit.trim(),
    committed_at: committedAt.trim(),
    committed_at_ms: Number.isFinite(committedAtMs) ? committedAtMs : Number.NEGATIVE_INFINITY
  };
}

function resolvePlanTimestamp(plan) {
  const donePlan = String(plan.frontmatter.status || "").toLowerCase() === "done";
  const archivedAt = String(plan.frontmatter.archived_at || "").trim();
  const updatedAt = String(plan.frontmatter.updated_at || "").trim();

  if (donePlan && archivedAt) {
    const archivedMs = parseTimestamp(archivedAt);
    if (Number.isFinite(archivedMs)) {
      return {
        valid: true,
        iso: archivedAt,
        ms: archivedMs,
        source: "archived_at"
      };
    }
  }

  if (updatedAt) {
    const updatedMs = parseTimestamp(updatedAt);
    if (Number.isFinite(updatedMs)) {
      return {
        valid: true,
        iso: updatedAt,
        ms: updatedMs,
        source: "updated_at"
      };
    }
  }

  if (plan.stat?.mtimeMs) {
    return {
      valid: true,
      iso: new Date(plan.stat.mtimeMs).toISOString(),
      ms: plan.stat.mtimeMs,
      source: "mtime"
    };
  }

  return {
    valid: false,
    iso: "",
    ms: Number.NaN,
    source: ""
  };
}

function parseTimestamp(value) {
  const ms = Date.parse(String(value || "").trim());
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function compareWindowPlans(left, right) {
  if (left.timestamp === right.timestamp) {
    return left.path.localeCompare(right.path);
  }
  return left.timestamp.localeCompare(right.timestamp);
}
