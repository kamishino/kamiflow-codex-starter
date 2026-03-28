import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  countCheckboxes,
  extractSection,
  PROJECT_BRIEF_PATH,
  resolveActivePlan,
  resolveLatestDonePlan
} from "../lib-plan.mjs";
import {
  analyzePlanCleanup,
  buildPlanHygieneLines,
  buildPlanHygieneSummary
} from "../lib-plan-cleanup.mjs";

export const SNAPSHOT_FORMATS = new Set(["text", "markdown", "json"]);

const DERIVED_STATE_MAP = new Map([
  ["start", "Plan-Lite"],
  ["plan", "Planning"],
  ["build", "Building"],
  ["fix", "Fixing"],
  ["check", "Checking"],
  ["done", "Done"]
]);

const EMPTY_PROGRESS = Object.freeze({
  implementation: { checked: 0, total: 0 },
  acceptance: { checked: 0, total: 0 },
  go_no_go: { checked: 0, total: 0 }
});

export async function buildPlanSnapshot(projectDir) {
  const activePlan = await resolveActivePlan(projectDir);
  const projectBriefSummary = await readProjectBriefSummary(projectDir);
  const hygiene = buildPlanHygieneSummary(await analyzePlanCleanup(projectDir));

  if (!activePlan) {
    const latestDonePlan = await resolveLatestDonePlan(projectDir);
    return {
      has_active_plan: false,
      plan_id: "",
      title: "No Active Plan",
      derived_state: "No Active Plan",
      status: "none",
      decision: "",
      lifecycle_phase: "",
      next_command: "",
      next_mode: "",
      updated_at: String(latestDonePlan?.frontmatter?.archived_at || latestDonePlan?.frontmatter?.updated_at || "").trim(),
      release_impact: "",
      open_decisions_remaining: 0,
      progress: cloneProgress(EMPTY_PROGRESS),
      latest_status: "No active plan is currently open.",
      latest_blockers: "None.",
      latest_next_step: "Run ensure-plan.mjs or start a new planning slice when new work begins.",
      project_fit: projectBriefSummary || "No active plan.",
      plan_path: "",
      hygiene
    };
  }

  const lifecyclePhase = String(activePlan.frontmatter.lifecycle_phase || "").trim().toLowerCase();
  const decision = String(activePlan.frontmatter.decision || "").trim();
  const nextCommand = String(activePlan.frontmatter.next_command || "").trim();
  const releaseImpactSection = extractSection(activePlan.content, "Release Impact");
  const openDecisionsSection = extractSection(activePlan.content, "Open Decisions");
  const projectFitSection = extractSection(activePlan.content, "Project Fit");
  const wipLogSection = extractSection(activePlan.content, "WIP Log");

  return {
    has_active_plan: true,
    plan_id: String(activePlan.frontmatter.plan_id || "").trim(),
    title: String(activePlan.frontmatter.title || path.basename(activePlan.path)).trim(),
    derived_state: derivePlanState(lifecyclePhase, decision, nextCommand, String(activePlan.frontmatter.status || "").trim()),
    status: String(activePlan.frontmatter.status || "").trim(),
    decision,
    lifecycle_phase: lifecyclePhase,
    next_command: nextCommand,
    next_mode: String(activePlan.frontmatter.next_mode || "").trim(),
    updated_at: String(activePlan.frontmatter.updated_at || "").trim(),
    release_impact: readSectionValue(releaseImpactSection, "Impact"),
    open_decisions_remaining: readRemainingCount(openDecisionsSection),
    progress: {
      implementation: countCheckboxes(extractSection(activePlan.content, "Implementation Tasks")),
      acceptance: countCheckboxes(extractSection(activePlan.content, "Acceptance Criteria")),
      go_no_go: countCheckboxes(extractSection(activePlan.content, "Go/No-Go Checklist"))
    },
    latest_status: extractLatestWipValue(wipLogSection, "Status") || "No current status line.",
    latest_blockers: extractLatestWipValue(wipLogSection, "Blockers") || "None.",
    latest_next_step: extractLatestWipValue(wipLogSection, "Next step") || "No next step recorded.",
    project_fit: summarizeSection(projectFitSection) || projectBriefSummary || "No project-fit summary available.",
    plan_path: activePlan.path,
    hygiene
  };
}

export function formatPlanSnapshot(snapshot, format = "text") {
  if (format === "json") {
    return JSON.stringify(snapshot, null, 2);
  }
  if (format === "markdown") {
    return formatPlanSnapshotMarkdown(snapshot);
  }
  return formatPlanSnapshotText(snapshot);
}

export function formatPlanSnapshotText(snapshot) {
  const progress = snapshot.progress || cloneProgress(EMPTY_PROGRESS);
  return [
    `Title: ${snapshot.title || "No Active Plan"}`,
    `State: ${snapshot.derived_state || "No Active Plan"}`,
    `Decision: ${snapshot.decision || "None"}`,
    `Next: ${snapshot.next_command || "None"} / ${snapshot.next_mode || "None"}`,
    `Release Impact: ${snapshot.release_impact || "none"}`,
    `Open Decisions: ${snapshot.open_decisions_remaining || 0}`,
    `Progress: Tasks ${progress.implementation.checked}/${progress.implementation.total} | Acceptance ${progress.acceptance.checked}/${progress.acceptance.total} | Go/No-Go ${progress.go_no_go.checked}/${progress.go_no_go.total}`,
    `Status: ${snapshot.latest_status || "No current status line."}`,
    `Blockers: ${snapshot.latest_blockers || "None."}`,
    `Next Step: ${snapshot.latest_next_step || "No next step recorded."}`,
    `Project Fit: ${snapshot.project_fit || "No project-fit summary available."}`,
    `Updated: ${snapshot.updated_at || "Unknown"}`,
    `Plan Path: ${snapshot.plan_path || "No active plan path."}`,
    ...buildPlanHygieneLines(snapshot.hygiene, "text")
  ].join("\n");
}

export function formatPlanSnapshotMarkdown(snapshot) {
  const progress = snapshot.progress || cloneProgress(EMPTY_PROGRESS);
  return [
    `# ${snapshot.title || "No Active Plan"}`,
    "",
    `- State: ${snapshot.derived_state || "No Active Plan"}`,
    `- Decision: ${snapshot.decision || "None"}`,
    `- Next: ${snapshot.next_command || "None"} / ${snapshot.next_mode || "None"}`,
    `- Release Impact: ${snapshot.release_impact || "none"}`,
    `- Open Decisions: ${snapshot.open_decisions_remaining || 0}`,
    `- Progress: Tasks ${progress.implementation.checked}/${progress.implementation.total}; Acceptance ${progress.acceptance.checked}/${progress.acceptance.total}; Go/No-Go ${progress.go_no_go.checked}/${progress.go_no_go.total}`,
    "",
    "## Current State",
    `- Status: ${snapshot.latest_status || "No current status line."}`,
    `- Blockers: ${snapshot.latest_blockers || "None."}`,
    `- Next Step: ${snapshot.latest_next_step || "No next step recorded."}`,
    "",
    "## Context",
    `- Project Fit: ${snapshot.project_fit || "No project-fit summary available."}`,
    `- Updated: ${snapshot.updated_at || "Unknown"}`,
    `- Plan Path: ${snapshot.plan_path || "No active plan path."}`,
    ...buildPlanHygieneLines(snapshot.hygiene, "markdown")
  ].join("\n");
}

function derivePlanState(lifecyclePhase, decision, nextCommand, status) {
  if (String(status || "").trim().toLowerCase() === "done" || lifecyclePhase === "done") {
    return "Done";
  }
  if (lifecyclePhase === "start") {
    return "Plan-Lite";
  }
  if (lifecyclePhase === "plan") {
    if (String(decision || "").trim().toUpperCase() === "GO" && String(nextCommand || "").trim().toLowerCase() === "build") {
      return "Build Ready";
    }
    return "Planning";
  }
  return DERIVED_STATE_MAP.get(lifecyclePhase) || "Planning";
}

async function readProjectBriefSummary(projectDir) {
  const projectBriefPath = path.join(projectDir, PROJECT_BRIEF_PATH);
  if (!fs.existsSync(projectBriefPath)) {
    return "";
  }
  const content = await fsp.readFile(projectBriefPath, "utf8");
  return summarizeSection(extractSection(content, "Current Priorities"))
    || summarizeSection(extractSection(content, "Product Summary"))
    || "";
}

function summarizeSection(sectionText) {
  const lines = String(sectionText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s+/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  const summary = lines.slice(0, 2).join(" | ");
  return summary.length <= 220 ? summary : `${summary.slice(0, 217).trimEnd()}...`;
}

function readSectionValue(sectionText, label) {
  const match = String(sectionText || "").match(new RegExp(`^-\\s+${escapeRegex(label)}:\\s*(.*)$`, "im"));
  return match?.[1]?.trim() || "";
}

function readRemainingCount(sectionText) {
  const explicit = String(sectionText || "").match(/-\s+Remaining Count:\s*(\d+)/i);
  if (explicit?.[1]) {
    return Number(explicit[1]);
  }
  const unchecked = (String(sectionText || "").match(/^\s*-\s+\[\s\]/gm) || []).length;
  return unchecked;
}

function extractLatestWipValue(sectionText, label) {
  const lines = String(sectionText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pattern = new RegExp(`^[-*]\\s+.+?\\s+-\\s+${escapeRegex(label)}:\\s*(.*)$`, "i");
  let latest = "";
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]) {
      latest = match[1].trim();
    }
  }
  return latest;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneProgress(progress) {
  return {
    implementation: { ...progress.implementation },
    acceptance: { ...progress.acceptance },
    go_no_go: { ...progress.go_no_go }
  };
}
