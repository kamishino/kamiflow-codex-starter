import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type Rule = {
  id: string;
  description: string;
  triggers: string[];
  requiredDocs: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const REQUIRED_PRIVATE_IGNORES = [".kfc/", ".local/", ".agents/"];

const RULES: Rule[] = [
  {
    id: "workflow-governance",
    description: "Workflow/rules/skill changes must refresh tracked governance docs or contracts.",
    triggers: [
      "resources/skills/",
      "resources/rules/",
      "src/commands/flow.ts",
      "src/commands/run.ts",
      "src/lib/flow-policy.ts",
      "src/lib/plan-lifecycle.ts"
    ],
    requiredDocs: [
      "AGENTS.md",
      "resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md",
      "resources/docs/ROUTE_PROMPTS.md",
      "resources/docs/CODEX_ANTI_PATTERNS.md",
      "resources/docs/CODEX_INCIDENT_LEDGER.md",
      "resources/skills/kamiflow-core/SKILL.md",
      "resources/skills/kamiflow-core/references/check.md"
    ]
  },
  {
    id: "client-onboarding",
    description: "Client bootstrap/onboarding changes must refresh onboarding docs and generated mirrors.",
    triggers: [
      "src/commands/client.ts",
      "src/lib/skill-sync.ts",
      "resources/docs/QUICKSTART.md",
      "resources/docs/CLIENT_KICKOFF_PROMPT.md",
      "resources/docs/CLIENT_A2Z_PLAYBOOK.md"
    ],
    requiredDocs: [
      "resources/docs/QUICKSTART.md",
      "resources/docs/CLIENT_KICKOFF_PROMPT.md",
      "resources/docs/CLIENT_A2Z_PLAYBOOK.md",
      "QUICKSTART.md",
      "CLIENT_KICKOFF_PROMPT.md"
    ]
  },
  {
    id: "decision-log",
    description: "Durable user-facing capability changes should be recorded in the tracked decision log.",
    triggers: [
      "README.md",
      "src/commands/client.ts",
      "src/commands/remote.ts",
      "src/commands/run.ts",
      "src/commands/session.ts",
      "src/commands/web.ts",
      "packages/kfc-chat/src/",
      "packages/kfc-plan-web/src/",
      "packages/kfc-session/src/",
      "packages/kfc-web/src/"
    ],
    requiredDocs: ["resources/docs/CHANGELOG.md", "CHANGELOG.md"]
  }
];

function normalizePath(value: string) {
  return String(value || "").replace(/\\/g, "/").trim();
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8"
  });

  if (result.error) {
    const code = result.error && typeof result.error === "object" && "code" in result.error
      ? String((result.error as { code?: unknown }).code || "")
      : "";
    if (code === "ENOENT") {
      throw new Error("Git is not available in PATH for docs freshness verification.");
    }
    if (code === "EPERM") {
      throw new Error("Git execution is blocked in this environment for docs freshness verification.");
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr || result.stdout || "").trim() || "<empty>"}`
    );
  }

  return String(result.stdout || "");
}

function collectChangedPaths() {
  const output = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  const paths = new Set<string>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    const entry = normalizePath(line.slice(3));
    if (!entry) {
      continue;
    }
    const resolved = entry.includes(" -> ") ? entry.split(" -> ").pop() || entry : entry;
    if (
      resolved.startsWith(".local/") ||
      resolved.startsWith(".kfc/") ||
      resolved.startsWith(".agents/")
    ) {
      continue;
    }
    paths.add(resolved);
  }

  return [...paths];
}

function pathMatches(candidate: string, pattern: string) {
  return candidate === pattern || candidate.startsWith(pattern);
}

function read(relPath: string) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

try {
  const errors: string[] = [];
  const changedPaths = collectChangedPaths();
  const changedSet = new Set(changedPaths);

  const gitignore = read(".gitignore");
  for (const token of REQUIRED_PRIVATE_IGNORES) {
    if (!gitignore.includes(token)) {
      errors.push(`[docs-freshness] .gitignore: missing private ignore token -> ${token}`);
    }
  }

  for (const rule of RULES) {
    const triggered = changedPaths.some((candidate) =>
      rule.triggers.some((pattern) => pathMatches(candidate, pattern))
    );
    if (!triggered) {
      continue;
    }

    const satisfied = rule.requiredDocs.some((docPath) => changedSet.has(docPath));
    if (!satisfied) {
      errors.push(
        `[docs-freshness] ${rule.id}: ${rule.description} Required one of: ${rule.requiredDocs.join(", ")}`
      );
    }
  }

  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log("[docs-freshness] OK");
} catch (err) {
  console.error(`[docs-freshness] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
