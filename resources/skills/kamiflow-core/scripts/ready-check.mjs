#!/usr/bin/env node
import {
  countCheckboxes,
  extractSection,
  parseCliArgs,
  printJson,
  resolvePlanRef,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(args.project || ".");
const requestedPlan = String(args.plan || "").trim();
const plan = await resolvePlanRef(projectDir, requestedPlan);

if (!plan) {
  printJson({
    ok: false,
    build_ready: false,
    reason: "No active non-done plan was found.",
    recovery: "node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project ."
  });
  process.exit(1);
}

const findings = [];
const frontmatter = plan.frontmatter;
const goalSection = extractSection(plan.content, "Goal");
const projectFitSection = extractSection(plan.content, "Project Fit");
const implementationTasks = extractSection(plan.content, "Implementation Tasks");
const acceptanceCriteria = extractSection(plan.content, "Acceptance Criteria");
const validationCommands = extractSection(plan.content, "Validation Commands");
const openDecisions = extractSection(plan.content, "Open Decisions");
const implementationCounts = countCheckboxes(implementationTasks);
const acceptanceCounts = countCheckboxes(acceptanceCriteria);
const openDecisionCounts = countCheckboxes(openDecisions);

if (String(frontmatter.decision || "").toUpperCase() !== "GO") {
  findings.push("decision is not GO");
}
if (String(frontmatter.next_command || "").toLowerCase() !== "build") {
  findings.push("next_command is not build");
}
if (String(frontmatter.next_mode || "") !== "Build") {
  findings.push("next_mode is not Build");
}
if (implementationCounts.total === 0) {
  findings.push("Implementation Tasks has no checklist items");
}
if (acceptanceCounts.total === 0) {
  findings.push("Acceptance Criteria has no checklist items");
}
if (openDecisionCounts.total > openDecisionCounts.checked) {
  findings.push("Open Decisions still has unchecked items");
}
if (!isConcreteGoal(goalSection)) {
  findings.push("Goal still contains placeholder content");
}
if (!hasConcreteProjectFit(projectFitSection)) {
  findings.push("Project Fit is missing a concrete priority or guardrail tie-back");
}
if (hasPlaceholderListItem(implementationTasks, [
  /replace with the first concrete implementation step/i,
  /define the first implementation slice/i
])) {
  findings.push("Implementation Tasks still contains placeholder checklist items");
}
if (hasPlaceholderListItem(acceptanceCriteria, [
  /replace with one concrete acceptance check/i,
  /define testable acceptance criteria/i
])) {
  findings.push("Acceptance Criteria still contains placeholder checklist items");
}
const validationCommandCheck = assessValidationCommands(validationCommands);
if (!validationCommandCheck.ok) {
  findings.push(validationCommandCheck.reason);
}

const buildReady = findings.length === 0;
printJson({
  ok: true,
  build_ready: buildReady,
  plan_id: frontmatter.plan_id || "",
  plan_path: plan.path,
  findings,
  recovery: buildReady ? "" : "Update the plan markdown directly, then rerun ready-check.mjs."
});
process.exit(buildReady ? 0 : 1);

function isConcreteGoal(sectionText) {
  if (!sectionText) {
    return false;
  }

  const outcomeValue = extractLabelValue(sectionText, "Outcome");
  if (outcomeValue) {
    return isConcreteValue(outcomeValue, [
      /replace with the concrete implementation outcome/i,
      /capture the concrete goal before implementation/i,
      /\bunknown\b/i,
      /\bpending\b/i,
      /\btbd\b/i
    ]);
  }

  return isConcreteValue(sectionText, [
    /capture the concrete goal before implementation/i,
    /replace with/i,
    /\bunknown\b/i,
    /\bpending clarification\b/i,
    /\btbd\b/i
  ]);
}

function hasConcreteProjectFit(sectionText) {
  if (!sectionText) {
    return false;
  }

  const relevantValues = [
    extractLabelValue(sectionText, "Relevant priority"),
    extractLabelValue(sectionText, "Relevant guardrail")
  ];

  return relevantValues.some((value) => isConcreteValue(value, [
    /replace with/i,
    /one priority from \.local\/project\.md/i,
    /one guardrail from \.local\/project\.md/i,
    /\bunknown\b/i,
    /\bpending\b/i,
    /\btbd\b/i
  ]));
}

function assessValidationCommands(sectionText) {
  if (!sectionText) {
    return {
      ok: false,
      reason: "Validation Commands is missing runnable commands"
    };
  }

  const commandMatches = [...sectionText.matchAll(/`([^`]+)`/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  if (commandMatches.length === 0) {
    return {
      ok: false,
      reason: "Validation Commands is missing runnable commands"
    };
  }

  const hasPlaceholderCommand = commandMatches.some((command) => {
    const normalized = command.toLowerCase();
    return normalized === "unknown"
      || normalized === "command"
      || normalized === "<command>"
      || normalized === "replace-with-runnable-command"
      || normalized.includes("replace-with-runnable-command")
      || normalized.includes("todo")
      || normalized.includes("tbd");
  });
  if (hasPlaceholderCommand) {
    return {
      ok: false,
      reason: "Validation Commands still contains placeholder commands"
    };
  }

  return {
    ok: true,
    reason: ""
  };
}

function hasPlaceholderListItem(sectionText, patterns) {
  const text = String(sectionText || "");
  return patterns.some((pattern) => pattern.test(text));
}

function extractLabelValue(sectionText, label) {
  const match = String(sectionText || "").match(new RegExp(`^-\\s+${escapeRegex(label)}:\\s*(.*)$`, "im"));
  return match?.[1]?.trim() || "";
}

function isConcreteValue(value, placeholderPatterns) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  return !placeholderPatterns.some((pattern) => pattern.test(text));
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
