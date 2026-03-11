import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const NODE = process.execPath;
const KFC_BIN = path.join(ROOT_DIR, "bin", "kamiflow.js");

type CaseSpec = {
  key: string;
  title: string;
  seed(projectDir: string): void;
  expect(projectDir: string, stdout: string, stderr: string, code: number): string[];
};

function usage() {
  console.log(
    [
      "Usage: npm run portability:matrix [-- --out <path>]",
      "",
      "Runs a deterministic portability matrix across seeded local repo shapes:",
      "  - blank_new_repo",
      "  - existing_node_repo",
      "  - partial_kfc_repo",
      "  - risky_non_node_repo"
    ].join("\n")
  );
}

function parseArgs(argv: string[]) {
  const out = { out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--out") {
      out.out = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
  }
  return out;
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeText(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function runClient(projectDir: string) {
  const result = spawnSync(
    NODE,
    [KFC_BIN, "client", "--project", projectDir, "--force", "--no-launch-codex", "--skip-serve-check"],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      shell: false
    }
  );
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    output: `${String(result.stdout || "")}\n${String(result.stderr || "")}`.trim()
  };
}

function assertContains(text: string, pattern: string, label: string, errors: string[]) {
  if (!text.includes(pattern)) {
    errors.push(`Missing ${label}: ${pattern}`);
  }
}

function assertPathExists(targetPath: string, label: string, errors: string[]) {
  if (!fs.existsSync(targetPath)) {
    errors.push(`Missing ${label}: ${targetPath}`);
  }
}

const CASES: CaseSpec[] = [
  {
    key: "blank_new_repo",
    title: "Blank New Repo",
    seed(projectDir) {
      ensureDir(projectDir);
    },
    expect(projectDir, stdout, stderr, code) {
      const errors: string[] = [];
      const output = `${stdout}\n${stderr}`;
      if (code !== 0) {
        errors.push(`Expected PASS but exit code was ${code}.`);
      }
      assertContains(output, "Inspection Status: PASS", "inspection status", errors);
      assertContains(output, "Repo Shape: empty_new_repo", "repo shape", errors);
      assertContains(output, "Apply Mode: auto", "apply mode", errors);
      assertPathExists(path.join(projectDir, "package.json"), "package.json", errors);
      assertPathExists(path.join(projectDir, "AGENTS.md"), "root AGENTS.md", errors);
      assertPathExists(path.join(projectDir, ".kfc", "CODEX_READY.md"), "ready file", errors);
      const agents = fs.existsSync(path.join(projectDir, "AGENTS.md"))
        ? fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf8")
        : "";
      assertContains(agents, "<!-- KFC:BEGIN MANAGED -->", "managed AGENTS block", errors);
      assertContains(agents, "If `.kfc/CODEX_READY.md` exists", "evergreen AGENTS startup order", errors);
      assertContains(agents, "## Evidence Gate", "evidence gate section", errors);
      assertContains(agents, "## Docs and Closeout", "docs and closeout section", errors);
      const ready = fs.existsSync(path.join(projectDir, ".kfc", "CODEX_READY.md"))
        ? fs.readFileSync(path.join(projectDir, ".kfc", "CODEX_READY.md"), "utf8")
        : "";
      assertContains(ready, "repo_shape: empty_new_repo", "ready repo context", errors);
      return errors;
    }
  },
  {
    key: "existing_node_repo",
    title: "Existing Node Repo",
    seed(projectDir) {
      ensureDir(projectDir);
      writeJson(path.join(projectDir, "package.json"), {
        name: "existing-node-repo",
        version: "1.0.0",
        private: true
      });
      writeText(path.join(projectDir, "src", "index.js"), "console.log('hello');\n");
    },
    expect(projectDir, stdout, stderr, code) {
      const errors: string[] = [];
      const output = `${stdout}\n${stderr}`;
      if (code !== 0) {
        errors.push(`Expected PASS but exit code was ${code}.`);
      }
      assertContains(output, "Inspection Status: PASS", "inspection status", errors);
      assertContains(output, "Repo Shape: needs_minor_fixes", "repo shape", errors);
      assertContains(output, "Apply Mode: auto", "apply mode", errors);
      assertPathExists(path.join(projectDir, "AGENTS.md"), "root AGENTS.md", errors);
      assertPathExists(path.join(projectDir, ".kfc", "CODEX_READY.md"), "ready file", errors);
      const agents = fs.existsSync(path.join(projectDir, "AGENTS.md"))
        ? fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf8")
        : "";
      assertContains(agents, "If `.kfc/CODEX_READY.md` exists", "evergreen AGENTS startup order", errors);
      assertContains(agents, "## Evidence Gate", "evidence gate section", errors);
      return errors;
    }
  },
  {
    key: "partial_kfc_repo",
    title: "Partial KFC Repo",
    seed(projectDir) {
      ensureDir(projectDir);
      writeJson(path.join(projectDir, "package.json"), {
        name: "partial-kfc-repo",
        version: "1.0.0",
        private: true
      });
      writeJson(path.join(projectDir, "kamiflow.config.json"), {
        version: "1",
        workflow: {
          defaultProvider: "codex",
          profile: "client"
        },
        codex: { rulesProfile: "client" },
        paths: {
          resourcesDir: path.join(ROOT_DIR, "resources")
        }
      });
      writeText(path.join(projectDir, ".gitignore"), ".kfc/\n.local/\n");
      writeText(path.join(projectDir, "AGENTS.md"), "# Team Notes\n\n- Preserve this note.\n");
      writeText(path.join(projectDir, ".kfc", "LESSONS.md"), "# Client Lessons\n");
    },
    expect(projectDir, stdout, stderr, code) {
      const errors: string[] = [];
      const output = `${stdout}\n${stderr}`;
      if (code !== 0) {
        errors.push(`Expected PASS but exit code was ${code}.`);
      }
      assertContains(output, "Inspection Status: PASS", "inspection status", errors);
      assertContains(output, "Repo Shape: needs_minor_fixes", "repo shape", errors);
      assertContains(output, "Apply Mode: auto", "apply mode", errors);
      assertPathExists(path.join(projectDir, "AGENTS.md"), "root AGENTS.md", errors);
      assertPathExists(path.join(projectDir, ".agents", "skills", "kamiflow-core", "SKILL.md"), "project-local skill", errors);
      const agents = fs.existsSync(path.join(projectDir, "AGENTS.md"))
        ? fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf8")
        : "";
      assertContains(agents, "<!-- KFC:BEGIN MANAGED -->", "managed AGENTS block", errors);
      assertContains(agents, "If `.kfc/CODEX_READY.md` exists", "evergreen AGENTS startup order", errors);
      assertContains(agents, "## Docs and Closeout", "docs and closeout section", errors);
      assertContains(agents, "Preserve this note.", "preserved custom AGENTS content", errors);
      return errors;
    }
  },
  {
    key: "risky_non_node_repo",
    title: "Risky Non-Node Repo",
    seed(projectDir) {
      ensureDir(projectDir);
      writeText(path.join(projectDir, "README.md"), "# risky repo\n");
    },
    expect(projectDir, stdout, stderr, code) {
      const errors: string[] = [];
      const output = `${stdout}\n${stderr}`;
      if (code === 0) {
        errors.push("Expected BLOCK but exit code was 0.");
      }
      assertContains(output, "Inspection Status: BLOCK", "inspection status", errors);
      assertContains(output, "Repo Shape: risky", "repo shape", errors);
      assertContains(output, "Apply Mode: blocked", "apply mode", errors);
      assertContains(output, "Onboarding Status: BLOCK", "onboarding block", errors);
      assertContains(output, "Recovery: npm init -y", "recovery command", errors);
      if (fs.existsSync(path.join(projectDir, ".kfc"))) {
        errors.push("Risky repo mutated before block (.kfc exists).");
      }
      return errors;
    }
  }
];

function renderReport(results: Array<{ spec: CaseSpec; projectDir: string; code: number; output: string; errors: string[] }>) {
  const rows = results
    .map((item, index) => {
      const result = item.errors.length === 0 ? "PASS" : "BLOCK";
      return `| ${index + 1} | ${item.spec.key} | ${result} | ${item.code} |`;
    })
    .join("\n");

  const sections = results
    .map((item, index) => {
      const result = item.errors.length === 0 ? "PASS" : "BLOCK";
      const errors = item.errors.length === 0 ? "- None" : item.errors.map((err) => `- ${err}`).join("\n");
      return [
        `## ${index + 1}. ${item.spec.title}`,
        `- Repo Shape Key: \`${item.spec.key}\``,
        `- Result: ${result}`,
        `- Exit Code: ${item.code}`,
        `- Project Dir: \`${item.projectDir}\``,
        "",
        "### Verification",
        errors,
        "",
        "### Output",
        "```text",
        item.output.trim() || "<empty>",
        "```",
        ""
      ].join("\n");
    })
    .join("\n");

  return [
    "# Portability Matrix Smoke Log",
    "",
    `- Date (UTC): ${new Date().toISOString()}`,
    `- Tool Repo: \`${ROOT_DIR}\``,
    `- Cases: ${results.length}`,
    "",
    "## Summary",
    "| # | Case | Result | Exit Code |",
    "|---|------|--------|-----------|",
    rows,
    "",
    sections
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "kfc-portability-matrix-"));
  const results: Array<{ spec: CaseSpec; projectDir: string; code: number; output: string; errors: string[] }> = [];

  for (const spec of CASES) {
    const projectDir = path.join(baseDir, spec.key);
    spec.seed(projectDir);
    const run = runClient(projectDir);
    const errors = spec.expect(projectDir, run.stdout, run.stderr, run.code);
    results.push({
      spec,
      projectDir,
      code: run.code,
      output: run.output,
      errors
    });
  }

  const report = renderReport(results);
  const defaultOut = path.join(ROOT_DIR, "artifacts", "portability", `matrix-${Date.now()}.md`);
  const outPath = args.out ? path.resolve(process.cwd(), args.out) : defaultOut;
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, report, "utf8");

  const blocked = results.filter((item) => item.errors.length > 0);
  console.log(`[portability-matrix] Report: ${outPath}`);
  if (blocked.length > 0) {
    for (const item of blocked) {
      console.error(`[portability-matrix] ${item.spec.key}: ${item.errors.join(" | ")}`);
    }
    process.exit(1);
  }
  console.log("[portability-matrix] PASS");
}

main().catch((err) => {
  console.error(`[portability-matrix] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
