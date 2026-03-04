import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const RULES = [
  {
    file: "resources/skills/kamiflow-core/SKILL.md",
    required: [
      "Status: MODE_MISMATCH",
      "Required Mode: Plan|Build",
      "Current Mode: Plan|Build",
      "Reason: <one line>",
      "Instruction: Switch mode and rerun the same command.",
      "Chat-first operation: run workflow commands directly instead of asking the user to run routine flow commands.",
      "Emoji is allowed in human-facing markdown summaries/docs when it improves readability.",
      "## Smooth Flow Checklist",
      "## Response Handoff Contract"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/start.md",
    required: [
      "START_CONTEXT",
      "END_START_CONTEXT",
      "Run next:",
      "YYYY-MM-DD-<seq>-start.md",
      "Required: yes|no"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/plan.md",
    required: [
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-plan.md from template",
      "Expected: plan markdown exists and is writable",
      "decision: GO",
      "next_command: build",
      "next_mode: Build",
      "Persist plan phase/handoff update by direct markdown mutation",
      "lifecycle_phase: plan",
      "active non-done plan",
      "Final response should use compact guidance shape"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/build.md",
    required: [
      "active non-done plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-build.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist build phase/progress via direct markdown mutation",
      "mark the claim as `Unknown`",
      "Resolve next-step narrative from mutated frontmatter and remaining checklist state.",
      "do not require verbose response footer fields",
      "Final response should use compact guidance shape"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/check.md",
    required: [
      "Persist check decision by direct markdown mutation",
      "Apply archive gate:",
      "move file to `.local/plans/done/<same-file>.md`",
      "keep only latest 20 files in `.local/plans/done/`",
      "if archive fails, do not report done",
      "Resolve next-step narrative from mutated state (`fix` or `done`).",
      "do not require verbose response footer fields",
      "Final response should use compact guidance shape"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/research.md",
    required: [
      "Persist handoff phase by direct markdown mutation",
      "Mark unknown claims as `Unknown` when evidence is insufficient; do not guess.",
      "Resolve next-step narrative from mutated state.",
      "do not require verbose response footer fields"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/fix.md",
    required: [
      "active non-done plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-fix.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist fix/build progress via direct markdown mutation",
      "mark the claim as `Unknown`",
      "Resolve next-step narrative from mutated frontmatter and remaining checklist state.",
      "do not require verbose response footer fields"
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
      "## Optional Response Handoff (Compact)",
      "Next step: <one line>"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/check-report.md",
    required: [
      "Result: PASS | BLOCK",
      "Required next command: fix | done",
      "Archive gate: archive only when PASS and all Acceptance Criteria + Go/No-Go checklist items are checked.",
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
