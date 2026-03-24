#!/usr/bin/env node
import {
  CLEANUP_STALE_AFTER_DAYS,
  parseCliArgs,
  printJson,
  resolveProjectDir
} from "./lib-plan-workspace.mjs";
import { analyzePlanCleanup } from "./lib-plan-cleanup.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const format = String(args.format || "json").trim().toLowerCase();
const staleAfterDays = normalizeStaleAfterDays(args["stale-after-days"]);

const summary = await analyzePlanCleanup(projectDir, {
  staleAfterDays
});

if (format === "text") {
  console.log(renderText(summary));
  process.exit(0);
}

if (format !== "json") {
  printJson({
    ok: false,
    reason: `Unsupported format: ${format}`,
    recovery: "Use --format json or --format text."
  });
  process.exit(1);
}

printJson({
  ok: true,
  project: projectDir,
  ...summary
});

function normalizeStaleAfterDays(value) {
  if (value === undefined) {
    return CLEANUP_STALE_AFTER_DAYS;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CLEANUP_STALE_AFTER_DAYS;
}

function renderText(summary) {
  const lines = [
    "Plan Cleanup",
    `Stale Threshold: ${summary.stale_after_days} days`,
    `Active Plans: ${summary.active_plan_count}`,
    `Stale Active Plans: ${summary.stale_active_count}`,
    `Orphan Plans: ${summary.orphan_count}`,
    `Recent Done Plans: ${summary.recent_done_count}`
  ];

  if (summary.weekly_buckets.length > 0) {
    lines.push("Weekly Buckets:");
    for (const bucket of summary.weekly_buckets) {
      lines.push(`- ${bucket.bucket}: ${bucket.count}`);
    }
  } else {
    lines.push("Weekly Buckets: none");
  }

  if (summary.stale_active_plans.length > 0) {
    lines.push("Stale Active Plans:");
    for (const plan of summary.stale_active_plans) {
      lines.push(`- ${plan.relative_path} (${plan.plan_id || "no plan_id"})`);
    }
  }

  if (summary.orphan_issues.length > 0) {
    lines.push("Orphan Issues:");
    for (const issue of summary.orphan_issues) {
      lines.push(`- ${issue.type}: ${issue.plan.relative_path}`);
    }
  }

  lines.push("Recommended Actions:");
  for (const action of summary.recommended_actions) {
    lines.push(`- ${action}`);
  }

  return lines.join("\n");
}
