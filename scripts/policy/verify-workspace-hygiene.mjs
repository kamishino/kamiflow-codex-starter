import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const FORBIDDEN_PATHS = [
  "packages/kamiflow-plan-ui",
  "packages/kamiflow-plan-desktop",
  "packages/kfcs",
  "packages/kfcp"
];

const CONTENT_CHECKS = [
  {
    file: "README.md",
    forbidden: ["npm run ui:desktop", "packages/kamiflow-plan-ui", "@kamishino/kamiflow-plan-ui"]
  },
  {
    file: "package.json",
    forbidden: ["@kamishino/kamiflow-plan-ui", "\"ui:desktop\""]
  },
  {
    file: "AGENTS.md",
    forbidden: ["packages/kamiflow-plan-ui/", "packages/kamiflow-plan-ui"]
  },
  {
    file: "resources/docs/CODEX_KFC_PLAN_RUNBOOK.md",
    forbidden: ["packages/kamiflow-plan-ui", "@kamishino/kamiflow-plan-ui"]
  }
];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

try {
  const errors = [];

  for (const relPath of FORBIDDEN_PATHS) {
    if (fs.existsSync(path.join(ROOT_DIR, relPath))) {
      errors.push(`[workspace-hygiene] stale path still exists -> ${relPath}`);
    }
  }

  for (const check of CONTENT_CHECKS) {
    const content = read(check.file);
    for (const token of check.forbidden) {
      if (content.includes(token)) {
        errors.push(`[workspace-hygiene] ${check.file}: forbidden stale token -> ${token}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log("[workspace-hygiene] OK");
} catch (err) {
  console.error(`[workspace-hygiene] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
