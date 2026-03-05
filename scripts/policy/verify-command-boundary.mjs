import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const TARGET_FILES = [
  "README.md",
  "QUICKSTART.md",
  "CLIENT_KICKOFF_PROMPT.md",
  "resources/docs/QUICKSTART.md",
  "resources/docs/CLIENT_KICKOFF_PROMPT.md",
  "resources/docs/CLIENT_A2Z_PLAYBOOK.md",
  "resources/docs/PORTABILITY_RUNBOOK.md",
  "resources/docs/CODEX_KFP_RUNBOOK.md",
  "resources/docs/CODEX_RULES_RUNBOOK.md"
];

const LIFECYCLE_CONTRACTS = [
  {
    file: "AGENTS.md",
    required: [
      "Every top-level user request must touch the active plan twice",
      "A valid touch means updating `updated_at` and appending a timestamped `WIP Log` entry",
      "On `check` PASS with all Acceptance Criteria and Go/No-Go items checked, archive the plan to `.local/plans/done/`.",
      "If completion is below 100% (remaining checklist items), do not archive"
    ]
  },
  {
    file: "resources/skills/kamiflow-core/SKILL.md",
    required: [
      "Touch active plan at route start (`updated_at` + WIP line).",
      "Touch active plan again before final output to persist actual results from this turn.",
      "If completion is below 100%, amend remaining tasks/criteria and continue `build/fix -> check` loop instead of forcing done."
    ]
  },
  {
    file: "resources/skills/kamiflow-core/references/check.md",
    required: [
      "Apply archive gate:",
      "if result is `PASS` and completion is 100% (Implementation Tasks + Acceptance Criteria fully checked):",
      "if result is `BLOCK` or completion is below 100%",
      "if archive fails, do not report done; keep active recovery path (`fix` or `plan`)"
    ]
  },
  {
    file: "resources/docs/CODEX_ANTI_PATTERNS.md",
    required: ["AP-012", "AP-013"]
  }
];

const REPO_HEADING_RE = /^#{1,6}\s+Run in KFC Repo\b/i;
const CLIENT_HEADING_RE = /^#{1,6}\s+Run in Client Project\b/i;
const NPM_RUN_RE = /\bnpm\s+run\b/i;

function verifyFile(relPath) {
  const absPath = path.join(ROOT_DIR, relPath);
  const raw = fs.readFileSync(absPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const violations = [];

  let context = "unknown";
  let sawRepo = false;
  let sawClient = false;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
    }
    if (REPO_HEADING_RE.test(line)) {
      context = "repo";
      sawRepo = true;
      continue;
    }
    if (CLIENT_HEADING_RE.test(line)) {
      context = "client";
      sawClient = true;
      continue;
    }
    if (context === "client" && inCodeFence && NPM_RUN_RE.test(line)) {
      violations.push({
        line: i + 1,
        text: line.trim()
      });
    }
  }

  return {
    relPath,
    sawRepo,
    sawClient,
    violations
  };
}

function verifyLifecycleContracts() {
  const issues = [];
  for (const rule of LIFECYCLE_CONTRACTS) {
    const absPath = path.join(ROOT_DIR, rule.file);
    const content = fs.readFileSync(absPath, "utf8");
    for (const token of rule.required) {
      if (!content.includes(token)) {
        issues.push(
          `[command-boundary] ${rule.file}: missing lifecycle/archive invariant token -> ${token}`
        );
      }
    }
  }
  return issues;
}

try {
  const reports = TARGET_FILES.map((file) => verifyFile(file));
  let failed = false;

  for (const report of reports) {
    if (!report.sawRepo || !report.sawClient) {
      failed = true;
      console.error(
        `[command-boundary] ${report.relPath}: missing required headings. Expected both "Run in KFC Repo" and "Run in Client Project".`
      );
    }
    for (const issue of report.violations) {
      failed = true;
      console.error(
        `[command-boundary] ${report.relPath}:${issue.line} uses npm run in client section: ${issue.text}`
      );
    }
  }

  const lifecycleIssues = verifyLifecycleContracts();
  for (const issue of lifecycleIssues) {
    failed = true;
    console.error(issue);
  }

  if (failed) {
    process.exit(1);
  }

  console.log("[command-boundary] OK");
} catch (err) {
  console.error(
    `[command-boundary] ERROR: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}
