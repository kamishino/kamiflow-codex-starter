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
      "Next Command: <start|plan|build|check|research|fix|done>",
      "Next Mode: Plan|Build|done"
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
      "lifecycle_phase: plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/build.md",
    required: [
      "current request-scoped build plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-build.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist build phase/progress via direct markdown mutation",
      "Next Command: check",
      "Next Mode: Plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/check.md",
    required: [
      "Persist check decision by direct markdown mutation",
      "Apply archive gate:",
      "move file to `.local/plans/done/<same-file>.md`",
      "Next Command: fix|done",
      "Next Mode: Build|done"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/research.md",
    required: [
      "Persist handoff phase by direct markdown mutation",
      "Next Command: plan|start",
      "Next Mode: Plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/fix.md",
    required: [
      "current request-scoped fix plan",
      "Status: BLOCK",
      "Recovery: create .local/plans/<date-seq>-fix.md from template",
      "Expected: plan markdown exists and is writable",
      "evaluate build-ready criteria directly from plan markdown",
      "Persist fix/build progress via direct markdown mutation",
      "Next Command: check",
      "Next Mode: Plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/start-report.md",
    required: [
      "START_CONTEXT",
      "END_START_CONTEXT",
      "Run next:",
      "Selected Mode: Plan",
      "Next Action:",
      "Next Command:",
      "Next Mode: Plan | Build"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/plan-spec.md",
    required: [
      "Next command: build",
      "Selected Mode: Plan",
      "Next Action:",
      "Next Command: build",
      "Next Mode: Build"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/templates/check-report.md",
    required: [
      "Result: PASS | BLOCK",
      "Required next command: fix | done",
      "Selected Mode: Plan | Build",
      "Next Action:",
      "Next Command: fix | done",
      "Next Mode: Build | done"
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
