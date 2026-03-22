import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const PACKAGE_NAME = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")).name;
const CLIENT_ARTIFACTS = Object.freeze([
  "AGENTS.md",
  ".kfc/CODEX_READY.md",
  ".kfc/LESSONS.md",
  ".agents/skills/kamiflow-core/SKILL.md",
  ".codex/rules/kamiflow.rules",
  ".codex/config.toml",
  ".local/plans",
  ".local/kfc-lessons"
]);

type ParsedArgs = {
  project: string;
  profile: string;
  port: string;
  force: boolean;
  skipServeCheck: boolean;
  launchCodex: boolean;
};

type CommandResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  error?: Error;
};

function usage() {
  console.log(
    [
      "Usage: npm run client:link-bootstrap -- [options]",
      "",
      "Primary purpose:",
      "  Interactive global-link setup from this repo into a client project.",
      "",
      "Options:",
      "  --project <path>         Target client project directory. Prompts when omitted.",
      "  --profile <name>         KFC rules profile for bootstrap (default: client).",
      "  --port <n>               Forwarded KFC bootstrap port.",
      "  --force                  Force bootstrap (default: on).",
      "  --no-force               Disable force bootstrap.",
      "  --skip-serve-check       Skip bootstrap serve-health checks.",
      "  --launch-codex           Allow Codex auto-launch after bootstrap.",
      "  --help, -h               Show this help.",
      "",
      "Examples:",
      "  npm run client:link-bootstrap -- --project ../my-client",
      "  npm run client:link-bootstrap -- --project ../my-client --profile dogfood",
      "  npm run client:link-bootstrap -- --project ../my-client --launch-codex"
    ].join("\n")
  );
}

function resolveNpmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  throw new Error("Cannot resolve npm-cli.js. Ensure npm is installed with Node.js.");
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    project: "",
    profile: "client",
    port: "",
    force: true,
    skipServeCheck: false,
    launchCodex: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--project") {
      out.project = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--profile") {
      out.profile = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--port") {
      out.port = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--force") {
      out.force = true;
      continue;
    }
    if (token === "--no-force") {
      out.force = false;
      continue;
    }
    if (token === "--skip-serve-check") {
      out.skipServeCheck = true;
      continue;
    }
    if (token === "--launch-codex") {
      out.launchCodex = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return out;
}

function runNodeNpm(args: string[], cwd: string) {
  const result = spawnSync(process.execPath, [resolveNpmCli(), ...args], {
    cwd,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Command failed: npm ${args.join(" ")} (exit ${result.status ?? 1})`);
  }
}

function runNodeNpmCapture(args: string[], cwd: string): CommandResult {
  const result = spawnSync(process.execPath, [resolveNpmCli(), ...args], {
    cwd,
    encoding: "utf8"
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error as Error | undefined
  };
}

function runCommandCapture(command: string, args: string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error as Error | undefined
  };
}

async function promptForProject(project: string) {
  const normalized = String(project || "").trim();
  if (normalized) {
    return normalized;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Missing --project <path>. Interactive prompting is unavailable in a non-TTY shell.");
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = (await rl.question("Client project path: ")).trim();
    if (!answer) {
      throw new Error("Client project path is required.");
    }
    return answer;
  } finally {
    rl.close();
  }
}

function resolveGlobalBinDir() {
  const result = runNodeNpmCapture(["prefix", "-g"], ROOT_DIR);
  if (!result.ok || !result.stdout) {
    return "";
  }
  const prefix = result.stdout;
  return process.platform === "win32" ? prefix : path.join(prefix, "bin");
}

function printPathRecovery(globalBinDir: string) {
  if (!globalBinDir) {
    return;
  }
  console.warn("[client-link] WARN: `kfc` is not currently visible in PATH after linking.");
  console.warn(`[client-link] Add the npm global bin directory to PATH: ${globalBinDir}`);
  if (process.platform === "win32") {
    console.warn(`[client-link] Current PowerShell session fix: $env:Path = "${globalBinDir};$env:Path"`);
  } else {
    console.warn(`[client-link] Current shell session fix: export PATH="${globalBinDir}:$PATH"`);
  }
}

function assertCommandAvailable(command: string, args: string[], label: string, cwd: string) {
  const result = runCommandCapture(command, args, cwd);
  if (!result.ok) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`;
    throw new Error(`${label} is not available in PATH. ${detail}`);
  }
  const versionLine = result.stdout.split(/\r?\n/).find(Boolean) || result.stderr.split(/\r?\n/).find(Boolean) || "OK";
  console.log(`[client-link] ${label}: ${versionLine}`);
}

function printArtifactReport(projectDir: string) {
  console.log("[client-link] Expected client-repo artifacts:");
  const missing: string[] = [];
  for (const artifact of CLIENT_ARTIFACTS) {
    const fullPath = path.join(projectDir, artifact);
    const exists = fs.existsSync(fullPath);
    console.log(`[client-link]   ${artifact} -> ${exists ? "present" : "missing"}`);
    if (!exists) {
      missing.push(artifact);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Bootstrap completed, but expected client artifacts are missing: ${missing.join(", ")}`);
  }
}

function printNextSteps(projectDir: string, kfcInPath: boolean) {
  const preferred = "kfc client status";
  const fallback = "npm exec --no-install -- kfc client status";
  const normalizedRoot = path.resolve(ROOT_DIR);
  const normalizedProject = path.resolve(projectDir);
  const nestedTarget =
    normalizedProject !== normalizedRoot &&
    normalizedProject.startsWith(`${normalizedRoot}${path.sep}`);

  console.log(`[client-link] Client repo ready: ${projectDir}`);
  console.log(`[client-link] Next (preferred, from the client repo): ${preferred}`);
  if (!kfcInPath) {
    console.log(`[client-link] Next (PATH fallback, from the client repo): ${fallback}`);
  }
  if (nestedTarget) {
    console.log("[client-link] Next (nested repo target, exact project): kfc client status --project .");
  }
}

function verifyPrerequisites() {
  console.log(`[client-link] Node.js: ${process.version}`);
  const npmVersion = runNodeNpmCapture(["--version"], ROOT_DIR);
  if (!npmVersion.ok || !npmVersion.stdout) {
    throw new Error(`npm is not available. ${npmVersion.stderr || npmVersion.error?.message || `exit ${npmVersion.status}`}`);
  }
  console.log(`[client-link] npm: ${npmVersion.stdout}`);
  assertCommandAvailable("codex", ["--version"], "Codex CLI", ROOT_DIR);
}

function runBootstrapInTarget(projectDir: string, parsed: ParsedArgs) {
  const bootstrapArgs = ["exec", "--no-install", "--", "kfc", "client", "--project", "."];
  if (parsed.force) {
    bootstrapArgs.push("--force");
  }
  if (!parsed.launchCodex) {
    bootstrapArgs.push("--no-launch-codex");
  }
  if (parsed.profile) {
    bootstrapArgs.push("--profile", parsed.profile);
  }
  if (parsed.port) {
    bootstrapArgs.push("--port", parsed.port);
  }
  if (parsed.skipServeCheck) {
    bootstrapArgs.push("--skip-serve-check");
  }

  console.log("[client-link] Running KFC client bootstrap in target project");
  runNodeNpm(bootstrapArgs, projectDir);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const projectInput = await promptForProject(parsed.project);
  const projectDir = path.resolve(process.cwd(), projectInput);

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${projectDir}`);
  }

  console.log(`[client-link] Repo root: ${ROOT_DIR}`);
  console.log(`[client-link] Target project: ${projectDir}`);
  verifyPrerequisites();

  console.log(`[client-link] Linking package globally from ${ROOT_DIR}`);
  runNodeNpm(["link"], ROOT_DIR);

  const globalBinDir = resolveGlobalBinDir();
  const kfcPathProbe = runCommandCapture("kfc", ["--help"], ROOT_DIR);
  const kfcInPath = kfcPathProbe.ok;
  if (kfcInPath) {
    console.log("[client-link] Global `kfc` command is visible in PATH.");
  } else {
    printPathRecovery(globalBinDir);
  }

  console.log(`[client-link] Linking ${PACKAGE_NAME} into ${projectDir}`);
  runNodeNpm(["link", PACKAGE_NAME], projectDir);

  runBootstrapInTarget(projectDir, parsed);
  printArtifactReport(projectDir);
  printNextSteps(projectDir, kfcInPath);
  console.log("[client-link] Completed.");
}

main().catch((err) => {
  console.error(`[client-link] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
