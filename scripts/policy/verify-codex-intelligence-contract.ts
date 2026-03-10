import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

function assertIncludes(content, relPath, token, errors) {
  if (!content.includes(token)) {
    errors.push(`[codex-intelligence] ${relPath}: missing required token -> ${token}`);
  }
}

try {
  const errors = [];

  const agentsFile = "AGENTS.md";
  const agents = read(agentsFile);
  for (const token of [
    "## Instruction Topology",
    "## Context Resolver",
    "## Session Bootstrap Contract",
    "## Plan Lifecycle Contract",
    "## Evidence Gate",
    "## Smooth Flow Protocol",
    "## Chat-Only Operation Contract",
    "## Markdown Readability Policy",
    "## Anti-Pattern Router",
    "## Learning Loop Contract",
    "## Documentation Freshness Contract",
    "Every top-level implementation or workflow request must resolve one active non-done plan",
    "Low-risk operational requests may use a no-plan fast path",
    "Allowed no-plan fast-path categories: commit/amend/reword, git status/diff/log, explain/summarize current state, sync generated docs/rules/skills, and narrow maintenance chores with low workflow risk.",
    "If a low-risk operational request expands into implementation-bearing work, switch back to the active-plan workflow before continuing.",
    "Every top-level implementation or workflow request must touch the active plan twice",
    "A valid touch means updating `updated_at` and appending a timestamped `WIP Log` entry",
    "Every route call must persist plan updates",
    "Do not require the user to run `kfc`/`npm` commands for normal route execution",
    ".local/` is git-ignored; do not use `git status` as proof that plan files were touched",
    "run check validations before final response and report `Check: PASS|BLOCK` with evidence",
    "after each completed task/subtask, immediately mutate the active plan file",
    "Build/Fix route scope: mutate and complete `Implementation Tasks` only",
    "Check route scope: verify/test `Acceptance Criteria` and decide PASS/BLOCK from evidence.",
    "If completion is below 100% (remaining checklist items), do not archive",
    "State`, `Doing`, and `Next`",
    "$kamiflow-core plan",
    "resources/docs/CHANGELOG.md",
    "Before commit-safe completion, run `npm run docs:sync` and `npm run verify:governance`"
  ]) {
    assertIncludes(agents, agentsFile, token, errors);
  }

  const antiPatternsFile = "resources/docs/CODEX_ANTI_PATTERNS.md";
  const antiPatterns = read(antiPatternsFile);
  for (const token of [
    "| ID | Scope | Bad Pattern | Detection Signal | Corrective Command | Rule Target | Skill Target |",
    "AP-001",
    "AP-002",
    "AP-003",
    "AP-004",
    "AP-005",
    "AP-006",
    "AP-007",
    "AP-008",
    "AP-009",
    "AP-010",
    "AP-011",
    "AP-012",
    "AP-013",
    "AP-014",
    "AP-015",
    "AP-016",
    "AP-018"
  ]) {
    assertIncludes(antiPatterns, antiPatternsFile, token, errors);
  }

  const incidentFile = "resources/docs/CODEX_INCIDENT_LEDGER.md";
  const incident = read(incidentFile);
  for (const token of [
    "## Entry Template",
    "- Date:",
    "- Environment:",
    "- Failure Signature:",
    "- Root Cause:",
    "- Permanent Guardrail Added:",
    "- Files Changed:",
    "- Verification Command:"
  ]) {
    assertIncludes(incident, incidentFile, token, errors);
  }

  const baseRulesFile = "resources/rules/base.rules";
  const baseRules = read(baseRulesFile);
  for (const token of ["AP-003", "AP-005", "AP-006"]) {
    assertIncludes(baseRules, baseRulesFile, token, errors);
  }

  const clientRulesFile = "resources/rules/profiles/client.rules";
  const clientRules = read(clientRulesFile);
  for (const token of ["AP-001", "AP-002"]) {
    assertIncludes(clientRules, clientRulesFile, token, errors);
  }

  const skillFile = "resources/skills/kamiflow-core/SKILL.md";
  const skill = read(skillFile);
  for (const token of [
    "## Smooth Flow Checklist",
    "## Failure Recovery",
    "Chat-first operation: run workflow commands directly instead of asking the user to run routine flow commands.",
    "Emoji is allowed in human-facing markdown summaries/docs when it improves readability.",
    "Every route invocation persists plan-state changes directly in markdown",
    "In client projects, if `.kfc/LESSONS.md` exists, read it as curated durable project memory before implementation.",
    "Build/Fix phase focuses on `Implementation Tasks`; Check phase evaluates `Acceptance Criteria`.",
    "## Route Confidence Gate",
    "Assign `Route Confidence` (`1-5`)",
    "If route confidence is below `4`, reroute instead of forcing the selected route.",
    "Route Confidence: <1-5>",
    "Every top-level implementation or workflow request must resolve one active non-done plan",
    "Low-risk operational requests may use the no-plan fast path",
    "Allowed no-plan fast-path categories: commit/amend/reword, git status/diff/log, explain/summarize current state, sync generated docs/rules/skills, and narrow maintenance chores with low workflow risk.",
    "run check validations and report `Check: PASS|BLOCK` before final response",
    "after each completed task/subtask, immediately mutate the active plan file",
    "completion is below 100%, amend remaining tasks/criteria and continue `build/fix -> check` loop",
    "If evidence is unavailable, mark status as `Unknown`",
    "kfc flow ensure-plan --project .",
    "Prefer direct plan-file mutation as primary lifecycle path",
    "$kamiflow-core plan",
    "git commit --no-verify",
    "review docs impact for workflow, onboarding, and durable user-facing changes",
    "Keep private project memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`"
  ]) {
    assertIncludes(skill, skillFile, token, errors);
  }

  const buildRefFile = "resources/skills/kamiflow-core/references/build.md";
  const buildRef = read(buildRefFile);
  for (const token of [
    "evaluate build-ready criteria directly from plan markdown",
    "Status: BLOCK",
    "Recovery: update plan via `$kamiflow-core plan` and rerun build",
    "Persist build phase/progress via direct markdown mutation",
    "after each completed task/subtask update checklist + timestamped WIP evidence",
    "Build/Fix scope is `Implementation Tasks` only.",
    "report `Check: PASS|BLOCK`",
    "mark the claim as `Unknown`"
  ]) {
    assertIncludes(buildRef, buildRefFile, token, errors);
  }

  const commandMapFile = "resources/skills/kamiflow-core/references/command-map.md";
  const commandMap = read(commandMapFile);
  for (const token of [
    "## Confidence Gate (Mandatory)",
    "assign `Route Confidence` (`1-5`)",
    "Status: REROUTE",
    "Fallback Route: <start|plan|research>",
    "Reason: <single concrete cause>"
  ]) {
    assertIncludes(commandMap, commandMapFile, token, errors);
  }

  const fixRefFile = "resources/skills/kamiflow-core/references/fix.md";
  const fixRef = read(fixRefFile);
  for (const token of [
    "evaluate build-ready criteria directly from plan markdown",
    "Status: BLOCK",
    "Recovery: update plan via `$kamiflow-core plan` and rerun fix",
    "Persist fix/build progress via direct markdown mutation",
    "after each completed task/subtask update checklist + timestamped WIP evidence",
    "report `Check: PASS|BLOCK`",
    "mark the claim as `Unknown`"
  ]) {
    assertIncludes(fixRef, fixRefFile, token, errors);
  }

  const smoothGuideFile = "resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md";
  const smoothGuide = read(smoothGuideFile);
  for (const token of [
    "## Core Sequence",
    "## Route Confidence Gate",
    "## Route-to-Profile Matrix",
    "## Deterministic Fallback Order",
    "## Phase Scope",
    "## No-Plan Fast Path",
    "## Plan Touch Cadence",
    "## Chat-Only Execution",
    "## Compact Response Shape",
    "## Auto Check Gate",
    "## Docs Freshness Gate",
    "## Evidence Rule",
    "## Completion Safety",
    "## Recovery Shortcuts",
    "## Readability Style",
    "## Multi-Agent Orchestration",
    "For implementation/workflow routes, touch active plan at route start",
    "For implementation/workflow routes, touch active plan again before final response",
    "| `start` | `plan` |",
    "| `build` | `executor` |",
    "| `check` | `review` |",
    "When route execution fails or context is incomplete, use this exact order:",
    "Assign `Route Confidence` (`1-5`) and reroute when confidence is below `4`.",
    "Route Confidence: <1-5>",
    "If scope expands beyond the fast-path boundary, stop and return to the active-plan workflow.",
    "after each completed task/subtask, immediately update checklist state",
    "Build/Fix phase: execute and update `Implementation Tasks`.",
    "Check phase: validate/test `Acceptance Criteria` and decide `PASS|BLOCK`.",
    "Check: PASS",
    "Emoji is allowed for human-facing markdown cues",
    "Do not treat plan as done if archive fails.",
    "Lead -> Explorer(s) -> Worker(s) -> Reviewer -> Lead",
    "review docs impact, sync generated doc artifacts"
  ]) {
    assertIncludes(smoothGuide, smoothGuideFile, token, errors);
  }

  const orchestrationFile = "resources/docs/CODEX_MULTI_AGENT_ORCHESTRATION.md";
  const orchestration = read(orchestrationFile);
  for (const token of [
    "## When To Use Multi-Agent",
    "## Role Pattern",
    "## Orchestration Loop",
    "## Tool Mapping",
    "spawn_agent",
    "send_input",
    "wait",
    "close_agent",
    "one route per response",
    "State/Doing/Next"
  ]) {
    assertIncludes(orchestration, orchestrationFile, token, errors);
  }

  const routePromptsFile = "resources/docs/ROUTE_PROMPTS.md";
  const routePrompts = read(routePromptsFile);
  for (const token of [
    "## Route Profile Matrix",
    "Fallback order for all routes:",
    "| `start` | `plan` |",
    "| `plan` | `plan` |",
    "| `build` | `executor` |",
    "| `fix` | `executor` |",
    "| `check` | `review` |",
    "| `research` | `plan` |",
    "profile: `plan`",
    "profile: `executor`",
    "profile: `review`",
    "Recover missing plan via `kfc flow ensure-plan --project .`.",
    "## Route Confidence Gate",
    "Status: REROUTE",
    "Route Confidence: <1-5>",
    "Fallback Route: <start|plan|research>",
    "if `IDEATION_CONTEXT` exists, consume it first and skip duplicate baseline questions",
    "run ideation preset:",
    "check closeout also reviews tracked docs impact"
  ]) {
    assertIncludes(routePrompts, routePromptsFile, token, errors);
  }

  const checkRefFile = "resources/skills/kamiflow-core/references/check.md";
  const checkRef = read(checkRefFile);
  for (const token of [
    "Review docs impact for workflow, onboarding, and durable user-facing changes.",
    "generated root mirrors should be refreshed through the docs sync path",
    "Docs impact is reviewed before commit-safe completion."
  ]) {
    assertIncludes(checkRef, checkRefFile, token, errors);
  }

  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log("[codex-intelligence] OK");
} catch (err) {
  console.error(`[codex-intelligence] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
