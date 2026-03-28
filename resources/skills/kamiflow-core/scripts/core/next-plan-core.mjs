import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  analyzePlanCleanup,
  buildPlanHygieneSummary,
  buildSetupSummary,
  extractSection,
  parseCliArgs,
  PROJECT_BRIEF_PATH,
  readReleasePolicy,
  resolveActivePlan,
  resolveLatestDonePlan,
  resolveProjectDir
} from "../lib-plan.mjs";
import { resolveReleaseWindow } from "../lib-release-window.mjs";

export const NEXT_PLAN_FORMATS = new Set(["text", "markdown", "json"]);

export async function buildNextPlanSuggestions(projectDir) {
  const activePlan = await resolveActivePlan(projectDir);
  const latestDonePlan = await resolveLatestDonePlan(projectDir);
  const releasePolicy = await readReleasePolicy(projectDir);
  const releaseWindow = await resolveReleaseWindow(projectDir);
  const hygiene = buildPlanHygieneSummary(await analyzePlanCleanup(projectDir));
  const setup = await buildSetupSummary(projectDir, { releasePolicy, hygiene, allowCreate: false });
  const projectBrief = await readProjectBrief(projectDir, setup.project_brief.path);

  if (activePlan) {
    return {
      ok: true,
      project: projectDir,
      has_active_plan: true,
      active_plan: summarizePlan(activePlan),
      latest_done_plan: latestDonePlan ? summarizePlan(latestDonePlan) : null,
      setup,
      hygiene,
      suggestions: [],
      reason: "An active non-done plan already exists, so no new next-plan suggestion is needed yet."
    };
  }

  const suggestions = [];

  if (releasePolicy.enabled && releaseWindow.aggregated_impact) {
    suggestions.push({
      route: "fast path",
      follow_up_type: "operational",
      title: `Close out pending ${releaseWindow.aggregated_impact} release work`,
      topic: buildTopicSlug(`release-${releaseWindow.aggregated_impact}-closeout`),
      reason: `Unreleased PASS plans remain after ${releaseWindow.baseline.tag || "the current baseline"}, so release closeout is still pending.`,
      confidence: "high",
      recommended_action: "Run finish-status.mjs first, then follow version-closeout.mjs only if finish-status says release-only is ready."
    });
  }

  if (hygiene.has_warnings) {
    suggestions.push({
      route: "fast path",
      follow_up_type: "operational",
      title: "Repair plan hygiene before starting a new slice",
      topic: "repair-plan-hygiene",
      reason: buildShortIssueReason(hygiene.issue_types, "Plan hygiene warnings"),
      confidence: "high",
      recommended_action: "Inspect cleanup-plans.mjs or plan-snapshot.mjs first, then clean up stale or conflicting plan state before creating a new plan."
    });
  }

  if (setup.project_brief.needs_attention) {
    suggestions.push({
      route: "start",
      follow_up_type: "planning",
      title: "Curate project memory before the next slice",
      topic: "curate-project-brief",
      reason: buildShortIssueReason(setup.project_brief.issue_types, "Project brief setup warnings"),
      confidence: "low",
      recommended_action: "Replace placeholder or missing sections in .local/project.md so later planning suggestions can stay evidence-backed."
    });
  }

  const firstOpenQuestion = projectBrief.openQuestions[0] || "";
  if (firstOpenQuestion) {
    suggestions.push({
      route: "research",
      follow_up_type: "research",
      title: trimTitle(firstOpenQuestion),
      topic: buildTopicSlug(firstOpenQuestion),
      reason: "The project brief still lists an unresolved open question that looks substantive enough to research before implementation.",
      confidence: "medium",
      recommended_action: "Start a research slice focused on this question and capture the conclusion back into .local/project.md or the next plan."
    });
  }

  const firstPriority = projectBrief.priorities[0] || "";
  if (firstPriority) {
    suggestions.push({
      route: "plan",
      follow_up_type: "planning",
      title: `Plan the next slice for: ${trimTitle(firstPriority)}`,
      topic: buildTopicSlug(firstPriority),
      reason: "The project brief already names a concrete current priority and there is no active plan competing with it.",
      confidence: "medium",
      recommended_action: "Create a focused plan tied to this priority if the work is implementation-ready."
    });
  }

  if (suggestions.length === 0 && latestDonePlan) {
    suggestions.push({
      route: "start",
      follow_up_type: "planning",
      title: `Decide the follow-up after ${latestDonePlan.frontmatter.title || latestDonePlan.frontmatter.plan_id || "the latest PASS slice"}`,
      topic: buildTopicSlug(latestDonePlan.frontmatter.title || latestDonePlan.frontmatter.plan_id || "next-slice"),
      reason: "There is prior completed work, but the current repo evidence is still too weak to recommend a stronger next step automatically.",
      confidence: "low",
      recommended_action: "Review .local/project.md and the latest PASS plan, then shape the next slice with start instead of guessing."
    });
  }

  return {
    ok: true,
    project: projectDir,
    has_active_plan: false,
    active_plan: null,
    latest_done_plan: latestDonePlan ? summarizePlan(latestDonePlan) : null,
    setup,
    hygiene,
    suggestions: dedupeSuggestions(suggestions).slice(0, 3),
    reason: suggestions.length > 0
      ? "Suggestions were derived from current repo memory, release state, and plan hygiene."
      : "No strong next-plan suggestion is available from current repo evidence."
  };
}

export function formatNextPlanSuggestions(result, format = "text") {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  if (format === "markdown") {
    return formatNextPlanSuggestionsMarkdown(result);
  }
  return formatNextPlanSuggestionsText(result);
}

export function formatNextPlanSuggestionsText(result) {
  const lines = [
    `State: ${result.has_active_plan ? "Active plan present" : "No active plan"}`,
    `Reason: ${result.reason || "No suggestion reason available."}`
  ];
  if (result.suggestions.length === 0) {
    lines.push("Suggestions: none");
    return lines.join("\n");
  }
  lines.push("Suggestions:");
  for (const suggestion of result.suggestions) {
    lines.push(`- ${suggestion.route} | ${suggestion.follow_up_type} | ${suggestion.confidence} | ${suggestion.title}`);
    lines.push(`  Reason: ${suggestion.reason}`);
    lines.push(`  Action: ${suggestion.recommended_action}`);
  }
  return lines.join("\n");
}

export function formatNextPlanSuggestionsMarkdown(result) {
  const lines = [
    "# Next Plan Suggestions",
    "",
    `- State: ${result.has_active_plan ? "Active plan present" : "No active plan"}`,
    `- Reason: ${result.reason || "No suggestion reason available."}`
  ];
  if (result.suggestions.length === 0) {
    lines.push("- Suggestions: none");
    return lines.join("\n");
  }
  lines.push("");
  for (const suggestion of result.suggestions) {
    lines.push(`## ${suggestion.title}`);
    lines.push(`- Route: ${suggestion.route}`);
    lines.push(`- Follow-up Type: ${suggestion.follow_up_type}`);
    lines.push(`- Confidence: ${suggestion.confidence}`);
    lines.push(`- Topic: ${suggestion.topic}`);
    lines.push(`- Reason: ${suggestion.reason}`);
    lines.push(`- Recommended Action: ${suggestion.recommended_action}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function readNextPlanCliInput(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const projectDir = resolveProjectDir(String(args.project || "."));
  const format = String(args.format || "text").trim().toLowerCase();
  return { projectDir, format };
}

async function readProjectBrief(projectDir, projectBriefPath) {
  const fallback = {
    priorities: [],
    openQuestions: [],
    recentDecisions: []
  };
  if (!projectBriefPath || !fs.existsSync(projectBriefPath)) {
    return fallback;
  }

  const content = await fsp.readFile(projectBriefPath, "utf8");
  const template = await fsp.readFile(resolveProjectBriefTemplatePath(projectDir, projectBriefPath), "utf8");
  return {
    priorities: extractMeaningfulSectionValues(extractSection(content, "Current Priorities"), extractSection(template, "Current Priorities")),
    openQuestions: extractMeaningfulSectionValues(extractSection(content, "Open Questions"), extractSection(template, "Open Questions")),
    recentDecisions: extractMeaningfulSectionValues(extractSection(content, "Recent Decisions"), extractSection(template, "Recent Decisions"))
  };
}

function resolveProjectBriefTemplatePath(projectDir, projectBriefPath) {
  const clientTemplatePath = path.join(projectDir, ".agents", "skills", "kamiflow-core", "assets", "project-brief-client.md");
  const sourceTemplatePath = path.join(projectDir, ".agents", "skills", "kamiflow-core", "assets", "project-brief-" + "dog" + "food.md");
  if (fs.existsSync(sourceTemplatePath) && projectBriefPath.includes(path.join(".local", "project.md"))) {
    return sourceTemplatePath;
  }
  return fs.existsSync(clientTemplatePath) ? clientTemplatePath : sourceTemplatePath;
}

function extractMeaningfulSectionValues(sectionText, templateSectionText) {
  const templateValues = new Set(extractSectionBulletValues(templateSectionText).map((value) => normalizeValue(value)));
  return extractSectionBulletValues(sectionText)
    .filter((value) => {
      const normalized = normalizeValue(value);
      return Boolean(normalized) && !templateValues.has(normalized);
    });
}

function extractSectionBulletValues(sectionText) {
  return String(sectionText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-+\s+/, ""))
    .map((line) => {
      const parts = line.split(":");
      if (parts.length >= 2) {
        return parts.slice(1).join(":").trim();
      }
      return line.trim();
    })
    .filter(Boolean);
}

function normalizeValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function summarizePlan(plan) {
  return {
    path: plan.path,
    plan_id: plan.frontmatter.plan_id || "",
    title: plan.frontmatter.title || path.basename(plan.path),
    status: plan.frontmatter.status || "",
    decision: plan.frontmatter.decision || "",
    lifecycle_phase: plan.frontmatter.lifecycle_phase || "",
    next_command: plan.frontmatter.next_command || "",
    next_mode: plan.frontmatter.next_mode || ""
  };
}

function buildShortIssueReason(issueTypes, fallback) {
  const issues = Array.isArray(issueTypes) ? issueTypes.filter(Boolean) : [];
  if (issues.length === 0) {
    return fallback;
  }
  return `${fallback}: ${issues.join(" | ")}`;
}

function trimTitle(value) {
  const text = String(value || "").trim();
  return text.length <= 100 ? text : `${text.slice(0, 97).trimEnd()}...`;
}

function buildTopicSlug(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "next-slice";
}

function dedupeSuggestions(suggestions) {
  const seen = new Set();
  const ordered = [];
  for (const suggestion of suggestions) {
    const key = [
      suggestion.route,
      suggestion.follow_up_type,
      suggestion.topic
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(suggestion);
  }
  return ordered.sort(compareSuggestions);
}

function compareSuggestions(left, right) {
  const confidencePriority = new Map([
    ["high", 0],
    ["medium", 1],
    ["low", 2]
  ]);
  const leftPriority = confidencePriority.get(left.confidence) ?? 99;
  const rightPriority = confidencePriority.get(right.confidence) ?? 99;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return left.title.localeCompare(right.title);
}
