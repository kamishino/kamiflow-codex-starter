import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  CLEANUP_STALE_AFTER_DAYS,
  DONE_PLAN_DIR,
  DONE_PLAN_KEEP_LATEST,
  extractSection
} from "./lib-plan-workspace.mjs";
import {
  comparePlanRecordsByLogicalTimeDesc,
  listDonePlanRecords,
  listPlanRecords,
  resolvePlanRecordTimestampInfo,
  summarizeDonePlanBuckets
} from "./lib-plan-records.mjs";

const ACTIVE_PLAN_REQUIRED_FRONTMATTER_KEYS = Object.freeze([
  "plan_id",
  "title",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "updated_at",
  "lifecycle_phase"
]);
const ACTIVE_PLAN_REQUIRED_SECTIONS = Object.freeze([
  "Goal",
  "Scope (In/Out)",
  "Constraints",
  "Project Fit",
  "Implementation Tasks",
  "Acceptance Criteria",
  "Validation Commands",
  "Go/No-Go Checklist"
]);

export function resolveStaleThresholdMs(days = CLEANUP_STALE_AFTER_DAYS) {
  const normalizedDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : CLEANUP_STALE_AFTER_DAYS;
  return normalizedDays * 24 * 60 * 60 * 1000;
}

export function listMissingPlanFrontmatterKeys(plan) {
  return ACTIVE_PLAN_REQUIRED_FRONTMATTER_KEYS
    .filter((key) => !String(plan?.frontmatter?.[key] || "").trim());
}

export function listMissingActivePlanSections(plan) {
  return ACTIVE_PLAN_REQUIRED_SECTIONS
    .filter((sectionTitle) => !extractSection(plan?.content || "", sectionTitle));
}

export function summarizePlanRecordForCleanup(projectDir, plan) {
  const timestampInfo = resolvePlanRecordTimestampInfo(plan);
  const relativePath = path.relative(projectDir, plan.path).replace(/\\/g, "/");
  return {
    path: plan.path,
    relative_path: relativePath,
    plan_id: String(plan.frontmatter.plan_id || "").trim(),
    title: String(plan.frontmatter.title || "").trim(),
    status: String(plan.frontmatter.status || "").trim(),
    decision: String(plan.frontmatter.decision || "").trim(),
    lifecycle_phase: String(plan.frontmatter.lifecycle_phase || "").trim(),
    updated_at: String(plan.frontmatter.updated_at || "").trim(),
    timestamp_source: timestampInfo.source || "",
    timestamp: timestampInfo.iso || ""
  };
}

export async function analyzePlanCleanup(projectDir, { staleAfterDays = CLEANUP_STALE_AFTER_DAYS } = {}) {
  const allActiveDirPlans = await listPlanRecords(projectDir, false);
  const nonDonePlans = allActiveDirPlans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() !== "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  const donePlansInActiveDir = allActiveDirPlans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() === "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  const staleThresholdMs = resolveStaleThresholdMs(staleAfterDays);
  const staleCutoffMs = Date.now() - staleThresholdMs;

  const stalePlans = nonDonePlans.filter((record) => {
    const timestampInfo = resolvePlanRecordTimestampInfo(record);
    return Number.isFinite(timestampInfo.ms) && timestampInfo.ms <= staleCutoffMs;
  });

  const orphanIssues = [];
  if (nonDonePlans.length > 1) {
    const primaryPath = nonDonePlans[0]?.path || "";
    for (const record of nonDonePlans) {
      if (record.path === primaryPath) {
        continue;
      }
      orphanIssues.push({
        type: "orphan-active-plan",
        reason: "Multiple non-done plans exist; older plans should be resolved manually before further build or release work.",
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }
  }

  for (const record of nonDonePlans) {
    const missingFrontmatterKeys = listMissingPlanFrontmatterKeys(record);
    if (!record.has_frontmatter || missingFrontmatterKeys.length > 0) {
      orphanIssues.push({
        type: "malformed-active-plan",
        reason: record.has_frontmatter
          ? "Required frontmatter keys are missing."
          : "Frontmatter block is missing.",
        missing_frontmatter_keys: missingFrontmatterKeys,
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }

    const missingSections = listMissingActivePlanSections(record);
    if (missingSections.length > 0) {
      orphanIssues.push({
        type: "incomplete-active-plan",
        reason: "Required plan sections are missing for a non-fast-path active plan.",
        missing_sections: missingSections,
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }
  }

  for (const record of donePlansInActiveDir) {
    orphanIssues.push({
      type: "done-plan-in-active-dir",
      reason: "Done plans should live under .local/plans/done/**, not .local/plans/.",
      plan: summarizePlanRecordForCleanup(projectDir, record)
    });
  }

  const affectedOrphanPaths = new Set(orphanIssues.map((issue) => issue.plan.path));
  const doneSummary = await summarizeDonePlanBuckets(projectDir);
  return {
    stale_after_days: Number(staleAfterDays),
    stale_cutoff: new Date(staleCutoffMs).toISOString(),
    active_plan_count: nonDonePlans.length,
    stale_active_count: stalePlans.length,
    orphan_count: affectedOrphanPaths.size,
    recent_done_count: doneSummary.recent_done_count,
    weekly_buckets: doneSummary.weekly_buckets,
    stale_active_plans: stalePlans.map((record) => summarizePlanRecordForCleanup(projectDir, record)),
    orphan_issues: orphanIssues,
    recommended_actions: buildCleanupRecommendedActions({
      nonDonePlans,
      stalePlans,
      orphanIssues
    })
  };
}

export function buildPlanHygieneSummary(cleanupSummary = {}) {
  const staleActiveCount = Number(cleanupSummary.stale_active_count || 0);
  const orphanCount = Number(cleanupSummary.orphan_count || 0);
  const orphanIssues = Array.isArray(cleanupSummary.orphan_issues) ? cleanupSummary.orphan_issues : [];
  const issueTypes = [...new Set([
    ...(staleActiveCount > 0 ? ["stale-active-plan"] : []),
    ...orphanIssues
      .map((issue) => String(issue?.type || "").trim())
      .filter(Boolean)
  ])];
  const recommendedActions = Array.isArray(cleanupSummary.recommended_actions)
    ? cleanupSummary.recommended_actions
    : [];

  return {
    has_warnings: staleActiveCount > 0 || orphanCount > 0,
    active_plan_count: Number(cleanupSummary.active_plan_count || 0),
    stale_active_count: staleActiveCount,
    orphan_count: orphanCount,
    recent_done_count: Number(cleanupSummary.recent_done_count || 0),
    issue_types: issueTypes,
    recommended_actions: recommendedActions
  };
}

export function buildPlanHygieneNotice(hygieneSummary = {}) {
  if (!hygieneSummary?.has_warnings) {
    return "";
  }

  const parts = [];
  if (Number(hygieneSummary.orphan_count || 0) > 0) {
    parts.push(`${hygieneSummary.orphan_count} orphan plan issue${Number(hygieneSummary.orphan_count) === 1 ? "" : "s"}`);
  }
  if (Number(hygieneSummary.stale_active_count || 0) > 0) {
    parts.push(`${hygieneSummary.stale_active_count} stale active plan${Number(hygieneSummary.stale_active_count) === 1 ? "" : "s"}`);
  }

  const issueTypes = Array.isArray(hygieneSummary.issue_types) && hygieneSummary.issue_types.length > 0
    ? ` [${hygieneSummary.issue_types.join(", ")}]`
    : "";

  return `Plan hygiene warning: ${parts.join("; ")}${issueTypes}.`;
}

export function buildPlanHygieneLines(hygieneSummary = {}, format = "text") {
  if (!hygieneSummary?.has_warnings) {
    return [];
  }

  const recommendedAction = Array.isArray(hygieneSummary.recommended_actions)
    ? hygieneSummary.recommended_actions[0]
    : "";
  const issueTypes = Array.isArray(hygieneSummary.issue_types) && hygieneSummary.issue_types.length > 0
    ? hygieneSummary.issue_types.join(", ")
    : "unknown";

  if (format === "markdown") {
    return [
      "",
      "## Hygiene Warnings",
      `- Counts: stale ${Number(hygieneSummary.stale_active_count || 0)}; orphan ${Number(hygieneSummary.orphan_count || 0)}`,
      `- Issue Types: ${issueTypes}`,
      ...(recommendedAction ? [`- Recommended Action: ${recommendedAction}`] : [])
    ];
  }

  return [
    "Hygiene Warnings:",
    `- Counts: stale ${Number(hygieneSummary.stale_active_count || 0)} | orphan ${Number(hygieneSummary.orphan_count || 0)}`,
    `- Issue Types: ${issueTypes}`,
    ...(recommendedAction ? [`- Recommended Action: ${recommendedAction}`] : [])
  ];
}

export async function planDoneRollover(projectDir, { keep = DONE_PLAN_KEEP_LATEST, pendingRecord = null } = {}) {
  const flatDoneRecords = await listDonePlanRecords(projectDir, false);
  const candidates = [...flatDoneRecords];
  if (pendingRecord) {
    candidates.push(pendingRecord);
  }

  const overflow = candidates
    .sort(comparePlanRecordsByLogicalTimeDesc)
    .slice(keep)
    .filter((record) => record.path !== pendingRecord?.path);

  const moves = [];
  const reservedTargets = new Set();
  for (const record of overflow) {
    const bucket = resolveDoneArchiveBucket(record);
    if (!bucket.valid) {
      continue;
    }

    const targetPath = path.join(projectDir, DONE_PLAN_DIR, bucket.year, bucket.week, record.name);
    if (targetPath === record.path) {
      continue;
    }
    if (fs.existsSync(targetPath)) {
      throw new Error(`Weekly done-plan archive collision at ${targetPath}`);
    }
    if (reservedTargets.has(targetPath)) {
      throw new Error(`Weekly done-plan archive collision planned twice for ${targetPath}`);
    }

    reservedTargets.add(targetPath);
    moves.push({
      from: record.path,
      to: targetPath
    });
  }

  return moves;
}

export async function applyDoneRollover(moves) {
  const movedPaths = [];
  for (const move of moves) {
    await fsp.mkdir(path.dirname(move.to), { recursive: true });
    await fsp.rename(move.from, move.to);
    movedPaths.push(move.to);
  }
  return movedPaths;
}

function buildCleanupRecommendedActions({ nonDonePlans, stalePlans, orphanIssues }) {
  const actions = [];
  if (nonDonePlans.length === 0) {
    actions.push("No active non-done plan exists. Run ensure-plan.mjs only when you are starting a new non-fast-path slice.");
  }

  if (stalePlans.length === 1 && nonDonePlans.length === 1) {
    actions.push("One stale active plan exists. Resume it if the scope is still current, close it intentionally if the slice is complete, or create a new plan only if the scope truly changed.");
  } else if (stalePlans.length > 1) {
    actions.push("Multiple stale active plans exist. Resolve the older plans manually before further build, finish, or release work.");
  }

  if (orphanIssues.some((issue) => issue.type === "orphan-active-plan")) {
    actions.push("Resolve multiple non-done plans manually and keep only one active non-done plan by default.");
  }
  if (orphanIssues.some((issue) => issue.type === "malformed-active-plan")) {
    actions.push("Repair malformed active-plan frontmatter before relying on readiness, finish, or release helpers.");
  }
  if (orphanIssues.some((issue) => issue.type === "incomplete-active-plan")) {
    actions.push("Fill the missing required sections before treating the active plan as implementation-ready.");
  }
  if (orphanIssues.some((issue) => issue.type === "done-plan-in-active-dir")) {
    actions.push("Move done plans through archive-plan.mjs instead of leaving them in .local/plans/.");
  }

  if (actions.length === 0) {
    actions.push("No cleanup action required. Plan hygiene looks current.");
  }

  return actions;
}

function resolveDoneArchiveBucket(plan) {
  const timestampInfo = resolvePlanRecordTimestampInfo(plan);
  if (!timestampInfo.valid) {
    return {
      valid: false,
      year: "",
      week: ""
    };
  }

  const weekInfo = isoWeekParts(timestampInfo.ms);
  return {
    valid: true,
    year: String(weekInfo.year),
    week: `W${String(weekInfo.week).padStart(2, "0")}`
  };
}

function isoWeekParts(timestampMs) {
  const date = new Date(timestampMs);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return {
    year: isoYear,
    week
  };
}
