import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

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
    "Every top-level user request must resolve one active non-done plan",
    "Every top-level user request must touch the active plan twice",
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
    "$kamiflow-core plan"
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
    "AP-011"
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
    "Build/Fix phase focuses on `Implementation Tasks`; Check phase evaluates `Acceptance Criteria`.",
    "Every top-level user request must resolve one active non-done plan",
    "run check validations and report `Check: PASS|BLOCK` before final response",
    "after each completed task/subtask, immediately mutate the active plan file",
    "completion is below 100%, amend remaining tasks/criteria and continue `build/fix -> check` loop",
    "If evidence is unavailable, mark status as `Unknown`",
    "kfc flow ensure-plan --project .",
    "Prefer direct plan-file mutation as primary lifecycle path",
    "$kamiflow-core plan",
    "git commit --no-verify"
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
    "## Phase Scope",
    "## Plan Touch Cadence",
    "## Chat-Only Execution",
    "## Compact Response Shape",
    "## Auto Check Gate",
    "## Evidence Rule",
    "## Completion Safety",
    "## Recovery Shortcuts",
    "## Readability Style",
    "Touch active plan at route start",
    "Touch active plan again before final response",
    "after each completed task/subtask, immediately update checklist state",
    "Build/Fix phase: execute and update `Implementation Tasks`.",
    "Check phase: validate/test `Acceptance Criteria` and decide `PASS|BLOCK`.",
    "Check: PASS",
    "Emoji is allowed for human-facing markdown cues",
    "Do not treat plan as done if archive fails."
  ]) {
    assertIncludes(smoothGuide, smoothGuideFile, token, errors);
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
