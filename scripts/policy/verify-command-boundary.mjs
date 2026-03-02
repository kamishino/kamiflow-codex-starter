import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const TARGET_FILES = [
  "README.md",
  "QUICKSTART.md",
  "resources/docs/QUICKSTART.md",
  "resources/docs/PORTABILITY_RUNBOOK.md",
  "resources/docs/CODEX_KFP_RUNBOOK.md",
  "resources/docs/CODEX_RULES_RUNBOOK.md"
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
