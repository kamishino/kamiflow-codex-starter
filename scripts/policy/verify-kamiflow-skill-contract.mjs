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
      "kfc flow ensure-plan --project <path>",
      "Required: yes|no"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/plan.md",
    required: [
      "Status: BLOCK",
      "Recovery: kfc flow ensure-plan --project <path>",
      "Expected: {\"ok\":true,\"plan_path\":\"<absolute-path>\",...}",
      "decision: GO",
      "next_command: build",
      "next_mode: Build",
      "kfc flow apply --project <path> --plan <plan_id> --route plan --result go",
      "kfc flow next --project <path> --plan <plan_id> --style narrative"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/build.md",
    required: [
      "kfc flow ensure-plan --project <path>",
      "Status: BLOCK",
      "Recovery: kfc flow ensure-plan --project <path>",
      "Expected: {\"ok\":true,\"plan_path\":\"<absolute-path>\",...}",
      "kfc flow apply --project <path> --plan <plan_id> --route build --result progress",
      "Next Command: check",
      "Next Mode: Plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/check.md",
    required: [
      "kfc flow apply --project <path> --plan <plan_id> --route check --result pass",
      "kfc flow apply --project <path> --plan <plan_id> --route check --result block",
      "Next Command: fix|done",
      "Next Mode: Build|done"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/research.md",
    required: [
      "kfc flow apply --project <path> --plan <plan_id> --route research --result progress",
      "Next Command: plan|start",
      "Next Mode: Plan"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/fix.md",
    required: [
      "kfc flow ensure-plan --project <path>",
      "Status: BLOCK",
      "Recovery: kfc flow ensure-plan --project <path>",
      "Expected: {\"ok\":true,\"plan_path\":\"<absolute-path>\",...}",
      "kfc flow apply --project <path> --plan <plan_id> --route fix --result progress",
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
