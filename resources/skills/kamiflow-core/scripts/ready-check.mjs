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
if (!validationCommands || /Unknown/i.test(validationCommands)) {
  findings.push("Validation Commands is missing runnable commands");
}
if (openDecisionCounts.total > openDecisionCounts.checked) {
  findings.push("Open Decisions still has unchecked items");
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
