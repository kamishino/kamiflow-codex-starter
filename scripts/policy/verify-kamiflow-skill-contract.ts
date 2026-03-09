import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const RULES = [
  {
    file: "resources/skills/kamiflow-core/SKILL.md",
    required: [
      "Status: MODE_MISMATCH",
      "Required Mode: Plan|Build",
      "Current Mode: Plan|Build",
      "Reason: <one line>",
      "Instruction: Switch mode and rerun the same command.",
      "## Trigger Contract",
      "## Boundaries Contract",
      "## Route Confidence Gate",
      "Assign `Route Confidence` (`1-5`)",
      "If route confidence is below `4`, reroute to `start`, `plan`, or `research`.",
      "Status: REROUTE",
      "## Route Output Contract",
      "## Evidence Contract",
      "All non-trivial route responses must use compact sections:",
      "Must not:",
      "Chat-first operation: run workflow commands directly instead of asking the user to run routine flow commands.",
      "In client projects, if `.kfc/LESSONS.md` exists, read it as curated durable project memory before implementation.",
      "Emoji is allowed in human-facing markdown summaries/docs when it improves readability.",
      "## Smooth Flow Checklist",
      "If request is trivial and low-risk operational, do not force this skill; use the no-plan fast path instead.",
      "allow the no-plan fast path only for low-risk operational requests that do not need acceptance criteria, phase/archive tracking, or multi-step workflow state.",
      "use the no-plan fast path for implementation-bearing work.",
      "Record `Route Confidence` (`1-5`) and reroute when score is below `4`.",
      "Touch active plan at route start (`updated_at` + WIP line).",
      "Touch active plan again before final output to persist actual results from this turn.",
      "run check validations and report `Check: PASS|BLOCK` before final response",
      "after each completed task/subtask, immediately mutate the active plan file",
      "Build/Fix phase focuses on `Implementation Tasks`; Check phase evaluates `Acceptance Criteria`.",
      "After user clarifies answers in Brainstorm/Plan, decide whether a technical diagram is needed",
      "Mermaid safety standard: avoid raw `|` in node labels",
      "YYYY-MM-DD-<seq>-<route>-<topic-slug>.md",
      "## Response Handoff Contract"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/command-map.md",
    required: [
      "## Confidence Gate (Mandatory)",
      "assign `Route Confidence` (`1-5`)",
      "Status: REROUTE",
      "Route Confidence: <1-5>",
      "Fallback Route: <start|plan|research>",
      "Reason: <single concrete cause>"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/start.md",
    required: [
      "## Route Output Contract",
      "## Evidence Contract",
      "START_CONTEXT",
      "END_START_CONTEXT",
      "If `IDEATION_CONTEXT` is present from prior `research`, consume it directly and skip duplicate discovery questions.",
      "Run next:",
      "YYYY-MM-DD-<seq>-start.md",
      "Required: yes|no",
      "Technical Solution Diagram",
      "write `Technical Solution Diagram` section with mermaid content",
      "Run Diagram Need Decision immediately after user answers",
      "First turn contains only questions with options when `IDEATION_CONTEXT` is absent.",
      "Route confidence for `start` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/plan.md",
    required: [
      "## Route Output Contract",
      "## Evidence Contract",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-plan.md from template",
      "Expected: plan markdown exists and is writable",
      "decision: GO",
      "next_command: build",
      "next_mode: Build",
      "Persist plan phase/handoff update by direct markdown mutation",
      "lifecycle_phase: plan",
      "active non-done plan",
      "Final response should use compact guidance shape",
      "Set and enforce `diagram_mode` policy in frontmatter",
      "allowed values: `required|auto|hidden`",
      "Run Diagram Need Decision after planning details are clear",
      "Technical Solution Diagram section exists with Mermaid content",
      "Mermaid safety: avoid raw `|` in node labels",
      "Route confidence for `plan` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/build.md",
    required: [
      "## Route Output Contract",
      "## Evidence Contract",
      "active non-done plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-build.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist build phase/progress via direct markdown mutation",
      "after each completed task/subtask update checklist + timestamped WIP evidence",
      "Build/Fix scope is `Implementation Tasks` only.",
      "report `Check: PASS|BLOCK` with evidence",
      "mark the claim as `Unknown`",
      "Resolve next-step narrative from mutated frontmatter and remaining checklist state.",
      "do not require verbose response footer fields",
      "Final response should use compact guidance shape",
      "Follow `diagram_mode` before implementing",
      "keep `Technical Solution Diagram` synchronized when `diagram_mode: required`",
      "Route confidence for `build` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/check.md",
    required: [
      "## Route Output Contract",
      "## Evidence Contract",
      "Persist check decision by direct markdown mutation",
      "Apply archive gate:",
      "Check scope is Acceptance Criteria validation/testing from current build output.",
      "completion is 100% (Implementation Tasks + Acceptance Criteria fully checked)",
      "if result is `BLOCK` or completion is below 100%",
      "move file to `.local/plans/done/<same-file>.md`",
      "keep only latest 20 files in `.local/plans/done/`",
      "if archive fails, do not report done",
      "Resolve next-step narrative from mutated state (`fix` or `done`).",
      "do not require verbose response footer fields",
      "Final response should use compact guidance shape",
      "Route confidence for `check` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/research.md",
    required: [
      "Persist handoff phase by direct markdown mutation",
      "Mark unknown claims as `Unknown` when evidence is insufficient; do not guess.",
      "Resolve next-step narrative from mutated state.",
      "do not require verbose response footer fields",
      "Optional ideation preset",
      "IDEATION_CONTEXT",
      "END_IDEATION_CONTEXT",
      "Idea Categories (3-5)",
      "Top Shortlist (Quick Win, Balanced, Ambitious)",
      "Route confidence for `research` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/fix.md",
    required: [
      "## Route Output Contract",
      "## Evidence Contract",
      "active non-done plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-fix.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist fix/build progress via direct markdown mutation",
      "after each completed task/subtask update checklist + timestamped WIP evidence",
      "amend `Implementation Tasks` and `Acceptance Criteria` with concrete subtasks",
      "report `Check: PASS|BLOCK` with evidence",
      "mark the claim as `Unknown`",
      "Resolve next-step narrative from mutated frontmatter and remaining checklist state.",
      "do not require verbose response footer fields",
      "Route confidence for `fix` must be `>=4` before execution."
    ]
  },
  {
    file: "resources/docs/ROUTE_PROMPTS.md",
    required: [
      "## Route Confidence Gate",
      "Status: REROUTE",
      "Route Confidence: <1-5>",
      "Fallback Route: <start|plan|research>",
      "route confidence `>=4` for selected route (otherwise reroute)"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/start-report.md",
    required: [
      "START_CONTEXT",
      "END_START_CONTEXT",
      "Run next:",
      "Plan lifecycle mutation:",
      "## Optional Response Handoff (Compact)",
      "Next step: <one line>"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/plan-spec.md",
    required: [
      "Next command: build",
      "## Plan Lifecycle Mutation",
      "Mermaid safety: avoid raw `|` in node labels",
      "## Optional Response Handoff (Compact)",
      "Next step: <one line>"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/check-report.md",
    required: [
      "Result: PASS | BLOCK",
      "Required next command: fix | done",
      "Archive gate: archive only when PASS and completion is 100% (Implementation Tasks + Acceptance Criteria checked).",
      "If completion <100% or result is BLOCK, amend tasks/criteria and continue Build/Fix -> Check.",
      "## Optional Response Handoff (Compact)",
      "Next step: <one line>"
    ]
  }
];

let failed = false;

for (const rule of RULES) {
  const filePath = path.join(ROOT_DIR, rule.file);
  const content = fs.readFileSync(filePath, "utf8");
  for (const token of rule.required) {
    if (!content.includes(token)) {
      failed = true;
      console.error(`[skill-contract] ${rule.file}: missing required token -> ${token}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("[skill-contract] OK");
