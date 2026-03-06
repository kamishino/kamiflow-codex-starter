import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertReadableDirectory,
  defaultConfig,
  getConfigPath,
  readRawConfig,
  resolveResourcesDir,
  validateConfig
} from "../lib/config.js";
import {
  CLIENT_ONBOARDING_CODES,
  CLIENT_ONBOARDING_STAGES,
  buildClientOnboardingProgressPayload,
  buildClientOnboardingPassPayload,
  classifyClientOnboardingFailure,
  createClientOnboardingError
} from "../lib/client-onboarding-recovery.js";
import {
  DEFAULT_RULES_PROFILE,
  RULES_FILE_NAME,
  VALID_RULES_PROFILES,
  buildManagedRulesContent,
  composeRulesForProfile,
  getRepoRootDir,
  normalizeManagedRulesContent,
  validateRulesProfile
} from "../lib/rules.js";
import { error, info, warn } from "../lib/logger.js";
import { runDoctor } from "./doctor.js";
import { runFlow } from "./flow.js";
import { runPlan } from "./plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const PACKAGE_JSON_PATH = path.join(PACKAGE_ROOT, "package.json");
const KFC_BIN = path.join(PACKAGE_ROOT, "bin", "kamiflow.js");
const REPO_KFP_BIN = path.join(PACKAGE_ROOT, "packages", "kamiflow-plan-ui", "bin", "kfp.js");
const PLAN_UI_PACKAGE = "@kamishino/kamiflow-plan-ui";
const DEFAULT_PORT = 4310;
const DEFAULT_HEALTH_TIMEOUT_MS = 15000;
const DEFAULT_HEALTH_POLL_MS = 500;
const QUICKSTART_FILE = path.join("resources", "docs", "QUICKSTART.md");
const CLIENT_KICKOFF_PROMPT_FILE = path.join("resources", "docs", "CLIENT_KICKOFF_PROMPT.md");
const CLIENT_READY_FILE = path.join(".kfc", "CODEX_READY.md");
const CLIENT_SESSION_FILE = path.join(".kfc", "session.json");

function usage() {
  info("Usage: kfc client [options]");
  info("Usage: kfc client <bootstrap|doctor|done> [options]");
  info("Boundary: run `kfc` commands in client projects; use `npm run` only in the KFC source repo.");
  info("Client docs are packaged at: ./node_modules/@kamishino/kamiflow-codex/resources/docs/QUICKSTART.md");
  info("Client kickoff prompt: ./node_modules/@kamishino/kamiflow-codex/resources/docs/CLIENT_KICKOFF_PROMPT.md");
  info("Examples:");
  info("  kfc client");
  info("  kfc client --goal \"Implement X with tests\"");
  info("  kfc client done");
  info("  kfc client bootstrap --project .");
  info("  kfc client bootstrap --project . --profile client --port 4310");
  info("  kfc client doctor --project .");
  info("  kfc client doctor --project . --fix");
  info("Note: `kfc client` and `kfc client bootstrap` include one smart-recovery cycle by default.");
}

function parseMajorVersion(version) {
  const parsed = Number.parseInt(String(version || "0").split(".")[0], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseArgs(baseCwd, args) {
  let subcommand = "start";
  let rest = args;
  if (args.length > 0 && !String(args[0]).startsWith("-")) {
    subcommand = args[0];
    rest = args.slice(1);
  }

  const parsed = {
    subcommand,
    project: baseCwd,
    profile: "client",
    port: DEFAULT_PORT,
    force: false,
    fix: false,
    skipServeCheck: false,
    goal: ""
  };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--project") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --project.");
      }
      parsed.project = path.resolve(baseCwd, value);
      i += 1;
      continue;
    }
    if (token === "--profile") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --profile.");
      }
      parsed.profile = validateRulesProfile(value, "--profile");
      i += 1;
      continue;
    }
    if (token === "--port") {
      const value = Number(rest[i + 1] || "");
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        throw new Error("Invalid --port value. Use an integer between 1 and 65535.");
      }
      parsed.port = value;
      i += 1;
      continue;
    }
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (token === "--fix") {
      parsed.fix = true;
      continue;
    }
    if (token === "--skip-serve-check") {
      parsed.skipServeCheck = true;
      continue;
    }
    if (token === "--goal") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --goal.");
      }
      parsed.goal = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.subcommand = "help";
      return parsed;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

function runNodeNpm(args, cwd) {
  const result = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error
  };
}

function checkCommandInPath(commandCandidates, args, label) {
  for (const candidate of commandCandidates) {
    const result = spawnSync(candidate, args, { encoding: "utf8" });
    if (result.error && result.error.code === "EPERM") {
      warn(`${label} check skipped: command spawn is restricted in this environment.`);
      return true;
    }
    if (result.status === 0) {
      return true;
    }
    if (result.error && result.error.code === "ENOENT") {
      continue;
    }
  }
  error(`${label} is not available in PATH.`);
  return false;
}

async function assertProjectPreflight(projectDir) {
  let ok = true;
  const nodeMajor = parseMajorVersion(process.versions.node);
  if (nodeMajor < 20) {
    error(`Node.js >= 20 is required. Current: ${process.versions.node}`);
    ok = false;
  } else {
    info(`Node.js version OK: ${process.versions.node}`);
  }

  try {
    const stat = await fsp.stat(projectDir);
    if (!stat.isDirectory()) {
      error(`Project path is not a directory: ${projectDir}`);
      ok = false;
    }
  } catch {
    error(`Project directory does not exist: ${projectDir}`);
    ok = false;
  }

  try {
    await fsp.access(projectDir, fsConstants.W_OK);
  } catch {
    error(`Project directory is not writable: ${projectDir}`);
    ok = false;
  }

  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    error(`Missing package.json in project: ${projectJsonPath(projectDir)}`);
    ok = false;
  } else {
    info(`package.json found: ${packageJsonPath}`);
  }

  const npmCheck = runNodeNpm(["--version"], projectDir);
  if (npmCheck.error && npmCheck.error.code === "EPERM") {
    warn("npm check skipped: command spawn is restricted in this environment.");
  } else if (!npmCheck.ok) {
    error("npm is not available.");
    ok = false;
  } else {
    info(`npm available: ${npmCheck.stdout.trim()}`);
  }

  const hasCodex = process.platform === "win32"
    ? checkCommandInPath(["codex.cmd", "codex.exe", "codex"], ["--version"], "Codex CLI")
    : checkCommandInPath(["codex"], ["--version"], "Codex CLI");
  ok = ok && hasCodex;

  return ok;
}

function projectJsonPath(projectDir) {
  return path.join(projectDir, "package.json");
}

function loadPackageName() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  return pkg.name;
}

function packagedClientResourcesDir() {
  const packageName = loadPackageName();
  return `./node_modules/${packageName}/resources`;
}

function bundledResourcesDirAbsolute() {
  return path.join(PACKAGE_ROOT, "resources");
}

function resolveClientResourcesHint(projectDir) {
  const packageName = loadPackageName();
  const packagedPath = path.join(projectDir, "node_modules", packageName, "resources");
  if (fs.existsSync(packagedPath)) {
    return packagedClientResourcesDir();
  }
  const bundledPath = bundledResourcesDirAbsolute();
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  return packagedClientResourcesDir();
}

function resolveClientQuickstartPath(projectDir) {
  return path.join(projectDir, "node_modules", loadPackageName(), QUICKSTART_FILE);
}

function resolveClientKickoffPromptPath(projectDir) {
  return path.join(projectDir, "node_modules", loadPackageName(), CLIENT_KICKOFF_PROMPT_FILE);
}

function printClientDocsHints(projectDir) {
  const quickstartPath = resolveClientQuickstartPath(projectDir);
  if (fs.existsSync(quickstartPath)) {
    info(`Quickstart: ${quickstartPath}`);
  } else {
    info(`Quickstart path (after install/link): ${quickstartPath}`);
  }

  const kickoffPath = resolveClientKickoffPromptPath(projectDir);
  if (fs.existsSync(kickoffPath)) {
    info(`Client kickoff prompt: ${kickoffPath}`);
  } else {
    info(`Client kickoff prompt path (after install/link): ${kickoffPath}`);
  }
}

function printClientNextCommandHints() {
  info("Next: kfc flow ensure-plan --project .");
  info("Then: kfc flow ready --project .");
  info("Then: kfc flow next --project . --plan <plan-id> --style narrative");
}

function resolveRunsDir(projectDir) {
  return path.join(projectDir, ".local", "runs");
}

function onboardingRunState(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PASS") return "SUCCESS";
  if (normalized === "BLOCK") return "FAIL";
  return "RUNNING";
}

function onboardingPhase(stage) {
  const normalized = String(stage || "").toLowerCase();
  if (normalized === CLIENT_ONBOARDING_STAGES.PLAN_READY || normalized === CLIENT_ONBOARDING_STAGES.EXECUTION_READY) {
    return "Plan";
  }
  if (normalized === CLIENT_ONBOARDING_STAGES.READY_BRIEF) {
    return "Build";
  }
  return "Start";
}

async function emitClientOnboardingEvent(projectDir, payload) {
  try {
    const activePlan = await resolveActivePlan(projectDir);
    if (!activePlan?.planId) {
      return;
    }
    const runsDir = resolveRunsDir(projectDir);
    await fsp.mkdir(runsDir, { recursive: true });
    const runFile = path.join(runsDir, `${activePlan.planId}.jsonl`);
    const stage = String(payload?.stage || "bootstrap");
    const status = String(payload?.status || "RUNNING");
    const recovery = String(payload?.recovery || "None");
    const next = String(payload?.next || "");
    const reason = String(payload?.reason || "Client onboarding update.");
    const errorCode = String(payload?.error_code || "CLIENT_ONBOARDING_PROGRESS");
    const entry = {
      event_type: "runlog_updated",
      source: "client_onboarding",
      plan_id: activePlan.planId,
      action_type: "onboarding",
      status,
      run_state: onboardingRunState(status),
      phase: onboardingPhase(stage),
      message: `${status} ONBOARDING ${stage}`.trim(),
      detail: reason,
      evidence: `${errorCode} | stage=${stage}`.trim(),
      onboarding_status: status,
      onboarding_stage: stage,
      onboarding_error_code: errorCode,
      onboarding_recovery: recovery,
      onboarding_next: next,
      recovery_step: recovery === "None" ? undefined : recovery,
      updated_at: new Date().toISOString()
    };
    await fsp.appendFile(runFile, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    warn(`Skipped onboarding activity emit: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function printClientOnboardingPayload(payload, asError = false) {
  const writer = asError ? error : info;
  writer(`Onboarding Status: ${payload.status}`);
  writer(`Stage: ${payload.stage || CLIENT_ONBOARDING_STAGES.BOOTSTRAP}`);
  writer(`Error Code: ${payload.error_code}`);
  writer(`Reason: ${payload.reason}`);
  writer(`Recovery: ${payload.recovery}`);
  writer(`Next: ${payload.next || payload.recovery}`);
}

function printClientOnboardingPass(payload) {
  printClientOnboardingPayload(payload, false);
  const steps = Array.isArray(payload.next_steps) ? payload.next_steps.slice(1) : [];
  for (const step of steps) {
    info(`Then: ${step}`);
  }
}

function printClientOnboardingBlock(errorLike) {
  const payload = classifyClientOnboardingFailure(errorLike);
  printClientOnboardingPayload(payload, true);
}

function resolveClientReadyPath(projectDir) {
  return path.join(projectDir, CLIENT_READY_FILE);
}

function resolveClientSessionPath(projectDir) {
  return path.join(projectDir, CLIENT_SESSION_FILE);
}

function parseSimpleFrontmatter(markdown) {
  if (!String(markdown).startsWith("---")) {
    return {};
  }
  const lines = String(markdown).split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return {};
  }
  const frontmatter = {};
  for (const line of lines.slice(1, endIdx)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    frontmatter[key] = value;
  }
  return frontmatter;
}

function toTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function resolveActivePlan(projectDir) {
  const plansDir = path.join(projectDir, ".local", "plans");
  let entries = [];
  try {
    entries = await fsp.readdir(plansDir, { withFileTypes: true });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }

  const planCandidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const filePath = path.join(plansDir, entry.name);
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      const stat = await fsp.stat(filePath);
      const fm = parseSimpleFrontmatter(raw);
      planCandidates.push({
        filePath,
        planId: fm.plan_id || path.basename(entry.name, ".md"),
        status: fm.status || "",
        updatedAtMs: toTimestamp(fm.updated_at, stat.mtimeMs)
      });
    } catch {
      // Ignore unreadable files.
    }
  }

  if (planCandidates.length === 0) {
    return null;
  }

  const active = planCandidates.filter((item) => item.status === "draft" || item.status === "ready");
  const source = active.length > 0 ? active : planCandidates;
  source.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return source[0];
}

function buildReadyFileContent({ goal, planId, planPath }) {
  const mission = goal && goal.trim().length > 0
    ? goal.trim()
    : "Define the mission for this client project before implementation.";

  return [
    "# CODEX READY",
    "",
    "## Mission",
    `- ${mission}`,
    "",
    "## Active Plan",
    `- plan_id: ${planId}`,
    `- plan_path: ${planPath}`,
    "",
    "## First-Run Sequence",
    "1. Read this file and `AGENTS.md` before implementation.",
    "2. Ensure plan + readiness: `kfc flow ensure-plan --project .` then `kfc flow ready --project .`.",
    "3. Execute exactly one route and mutate the active plan markdown (`updated_at` + `WIP Log`).",
    "4. After build/fix work, run checks and report `Check: PASS|BLOCK` with evidence.",
    "5. If blocked, return exact `Recovery: <command>` and stop until recovered.",
    "",
    "## Session Bootstrap (Every Session)",
    "1. Read `AGENTS.md` first, then re-read this file before implementation.",
    "2. Resolve one active non-done plan in `.local/plans/` before route output.",
    "3. Touch the active plan at route start and again before final response (`updated_at` + timestamped `WIP Log` line).",
    "",
    "## Autonomous Execution Contract",
    "1. Use only `kfc ...` commands in this client project.",
    "2. Keep changes scoped to mission and acceptance criteria.",
    "3. Execute routine flow commands yourself; do not ask the user to run normal `kfc` commands.",
    "4. Ask the user only when execution is impossible from agent context (permissions/auth/out-of-workspace).",
    "5. Before `build`/`fix`, run `kfc flow ensure-plan --project .` then `kfc flow ready --project .`.",
    "6. If readiness or flow behavior fails, run `kfc client doctor --project . --fix` and return BLOCK with exact recovery.",
    "7. After completing implementation in a turn, run check validations and report `Check: PASS|BLOCK` before final response.",
    "",
    "## Blocker Contract",
    "- Return exactly:",
    "  - `Status: BLOCK`",
    "  - `Reason: <single concrete cause>`",
    "  - `Recovery: <exact command>`",
    "",
    "## Finish Checklist (Required)",
    "1. Run: `kfc client done`",
    "2. Confirm `.kfc/CODEX_READY.md` is removed.",
    "3. Do not mark task complete until cleanup command succeeds.",
    ""
  ].join("\n");
}

async function createClientReadyArtifacts({ projectDir, force, goal, profileName }) {
  const plan = await resolveActivePlan(projectDir);
  if (!plan) {
    throw new Error("Cannot find an active plan in .local/plans. Run `kfc flow ensure-plan --project .` first.");
  }

  const readyPath = resolveClientReadyPath(projectDir);
  if (fs.existsSync(readyPath) && !force) {
    throw new Error(
      `Ready file already exists: ${readyPath}. Use --force to regenerate or run \`kfc client done --project .\` first.`
    );
  }

  await fsp.mkdir(path.dirname(readyPath), { recursive: true });
  await fsp.writeFile(
    readyPath,
    buildReadyFileContent({
      goal,
      planId: plan.planId,
      planPath: plan.filePath
    }),
    "utf8"
  );

  const sessionPath = resolveClientSessionPath(projectDir);
  await fsp.writeFile(
    sessionPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profile: profileName,
        planId: plan.planId,
        planPath: plan.filePath
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return { readyPath, sessionPath, planId: plan.planId };
}

async function removeIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  await fsp.rm(filePath, { force: true });
  return true;
}

async function writeConfigFile(configPath, configData) {
  const content = JSON.stringify(configData, null, 2) + "\n";
  await fsp.writeFile(configPath, content, "utf8");
}

function determineProfile(explicitProfile, configData) {
  if (explicitProfile) {
    return explicitProfile;
  }
  const fromConfig = configData?.codex?.rulesProfile;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return validateRulesProfile(fromConfig, "kamiflow.config.json");
  }
  return DEFAULT_RULES_PROFILE;
}

async function ensureProjectConfig({ projectDir, explicitProfile, force }) {
  const configPath = getConfigPath(projectDir);
  const resourceHint = resolveClientResourcesHint(projectDir);

  if (!fs.existsSync(configPath)) {
    const config = defaultConfig();
    const selectedProfile = determineProfile(explicitProfile, config);
    config.codex.rulesProfile = selectedProfile;
    config.paths.resourcesDir = resourceHint;
    await writeConfigFile(configPath, config);
    info(`Created config: ${configPath}`);
    return { configPath, configData: config, selectedProfile, changed: true };
  }

  const raw = await readRawConfig(projectDir);
  const config = raw.data;
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    throw new Error("Config validation failed.");
  }

  const selectedProfile = determineProfile(explicitProfile, config);
  let changed = false;

  if (config.codex?.rulesProfile !== selectedProfile) {
    if (!force) {
      throw new Error(
        `Config codex.rulesProfile is "${config.codex?.rulesProfile}" but bootstrap profile is "${selectedProfile}". Rerun with --force to update.`
      );
    }
    config.codex = config.codex && typeof config.codex === "object" ? config.codex : {};
    config.codex.rulesProfile = selectedProfile;
    changed = true;
  }

  config.paths = config.paths && typeof config.paths === "object" ? config.paths : {};
  if (!config.paths.resourcesDir || String(config.paths.resourcesDir).trim().length === 0) {
    config.paths.resourcesDir = resourceHint;
    changed = true;
  }

  const resolvedResourcesDir = resolveResourcesDir(config, configPath);
  try {
    await assertReadableDirectory(resolvedResourcesDir);
  } catch (err) {
    const fallbackResourceHint = bundledResourcesDirAbsolute();
    const fallbackReadable = fs.existsSync(fallbackResourceHint);
    if (!force && !fallbackReadable) {
      throw new Error(
        `Configured resourcesDir is not readable (${resolvedResourcesDir}). Rerun with --force to set ${resourceHint}.`
      );
    }
    config.paths.resourcesDir = fallbackReadable ? fallbackResourceHint : resourceHint;
    changed = true;
    info(`Using resources fallback: ${config.paths.resourcesDir}`);
  }

  if (changed) {
    await writeConfigFile(configPath, config);
    info(`Updated config: ${configPath}`);
  } else {
    info(`Config already valid: ${configPath}`);
  }

  return { configPath, configData: config, selectedProfile, changed };
}

async function ensurePlanUi(projectDir) {
  const kfpBin = path.join(
    projectDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kfp.cmd" : "kfp"
  );
  if (fs.existsSync(kfpBin)) {
    info("Plan UI dependency already available.");
    return;
  }

  if (fs.existsSync(REPO_KFP_BIN)) {
    info("Using bundled plan UI fallback from linked KFC repository.");
    return;
  }

  info(`Installing ${PLAN_UI_PACKAGE} in target project...`);
  const install = runNodeNpm(["install", "-D", PLAN_UI_PACKAGE], projectDir);
  if (!install.ok) {
    throw new Error(
      `Failed to install ${PLAN_UI_PACKAGE}. stdout: ${install.stdout.trim() || "<empty>"} stderr: ${install.stderr.trim() || "<empty>"}`
    );
  }
}

async function ensureProjectRules({ projectDir, profileName, force }) {
  const rulesText = composeRulesForProfile(profileName, getRepoRootDir());
  const managed = buildManagedRulesContent({
    profileName,
    sourceRulesText: rulesText,
    generatedBy: "kfc client bootstrap",
    rootDir: getRepoRootDir()
  });

  const targetPath = path.join(projectDir, ".codex", "rules", RULES_FILE_NAME);
  if (fs.existsSync(targetPath)) {
    const current = await fsp.readFile(targetPath, "utf8");
    const same = normalizeManagedRulesContent(current) === normalizeManagedRulesContent(managed);
    if (same) {
      info(`Rules already synced: ${targetPath}`);
      return { changed: false, targetPath };
    }
    if (!force) {
      throw new Error(`Rules file differs at ${targetPath}. Rerun with --force to overwrite.`);
    }
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, managed, "utf8");
  info(`Rules synced (${profileName}): ${targetPath}`);
  return { changed: true, targetPath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runServeHealthCheck(projectDir, port) {
  const child = spawn(process.execPath, [KFC_BIN, "plan", "serve", "--project", projectDir, "--port", String(port)], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const deadline = Date.now() + DEFAULT_HEALTH_TIMEOUT_MS;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  let healthy = false;

  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        break;
      }
      try {
        const response = await fetch(healthUrl);
        const body = await response.text();
        if (response.ok && body.includes("\"ok\":true")) {
          healthy = true;
          break;
        }
      } catch {
        // Keep polling until timeout.
      }
      await sleep(DEFAULT_HEALTH_POLL_MS);
    }
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await sleep(250);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
  }

  if (!healthy) {
    throw new Error(
      `KFP health check failed at ${healthUrl}. stdout: ${stdout.trim() || "<empty>"} stderr: ${stderr.trim() || "<empty>"}`
    );
  }
}

async function runBootstrapOnce(options) {
  const preflightOk = await assertProjectPreflight(options.project);
  if (!preflightOk) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED,
      "Client preflight checks failed.",
      "kfc client doctor --project . --fix"
    );
  }

  let configResult;
  try {
    configResult = await ensureProjectConfig({
      projectDir: options.project,
      explicitProfile: options.profile,
      force: options.force
    });
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.CONFIG_INVALID,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --project . --force"
    );
  }

  try {
    await ensurePlanUi(options.project);
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --project . --force"
    );
  }

  try {
    await ensureProjectRules({
      projectDir: options.project,
      profileName: configResult.selectedProfile,
      force: options.force
    });
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.RULES_SYNC_FAILED,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --project . --force"
    );
  }

  const doctorCode = await runDoctor({ cwd: options.project, args: [] });
  if (doctorCode !== 0) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.DOCTOR_FAILED,
      "`kfc doctor` failed.",
      "kfc client doctor --project . --fix"
    );
  }

  const ensurePlanCode = await runFlow({
    cwd: options.project,
    args: ["ensure-plan", "--project", options.project]
  });
  if (ensurePlanCode !== 0) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED,
      "`kfc flow ensure-plan` failed.",
      "kfc flow ensure-plan --project ."
    );
  }

  const validateCode = await runPlan({
    cwd: options.project,
    args: ["validate", "--project", options.project]
  });
  if (validateCode !== 0) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED,
      "`kfc plan validate` failed.",
      "kfc plan validate --project ."
    );
  }

  if (options.skipServeCheck) {
    warn("Skipped serve health check (--skip-serve-check). Verification is partial.");
  } else {
    try {
      await runServeHealthCheck(options.project, options.port);
    } catch (err) {
      throw createClientOnboardingError(
        CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED,
        err instanceof Error ? err.message : String(err),
        "kfc client bootstrap --project . --force --skip-serve-check"
      );
    }
    info(`Health check OK: http://127.0.0.1:${options.port}/api/health`);
  }

  info("Client bootstrap completed successfully.");
  printClientDocsHints(options.project);
  printClientNextCommandHints();
  info("Cleanup command after completion: kfc client done");
  info("Next steps in this client repo should use `kfc ...` commands.");
}

async function runBootstrapWithSmartRecovery(options, runtime = {}) {
  const shouldPrintPass = runtime.printPass !== false;
  await emitClientOnboardingEvent(
    options.project,
    buildClientOnboardingProgressPayload(
      CLIENT_ONBOARDING_STAGES.BOOTSTRAP,
      "Running client bootstrap checks.",
      "kfc client doctor --project . --fix"
    )
  );
  try {
    await runBootstrapOnce(options);
    const payload = buildClientOnboardingPassPayload(false);
    await emitClientOnboardingEvent(options.project, payload);
    if (shouldPrintPass) {
      printClientOnboardingPass(payload);
    }
    return { code: 0, recoveryUsed: false };
  } catch (initialErr) {
    const first = classifyClientOnboardingFailure(initialErr);
    await emitClientOnboardingEvent(options.project, first);
    warn(
      `Onboarding bootstrap blocked (${first.error_code}). Running one smart recovery cycle via \`kfc client doctor --project . --fix\`.`
    );
    await emitClientOnboardingEvent(
      options.project,
      buildClientOnboardingProgressPayload(
        CLIENT_ONBOARDING_STAGES.BOOTSTRAP,
        `Running smart recovery after ${first.error_code}.`,
        "kfc client doctor --project . --fix"
      )
    );

    const doctorFixCode = await runClientDoctorOnly({
      ...options,
      fix: true
    });
    if (doctorFixCode !== 0) {
      const blockPayload = classifyClientOnboardingFailure(
        createClientOnboardingError(
          CLIENT_ONBOARDING_CODES.SMART_RECOVERY_FAILED,
          `Smart recovery failed after initial bootstrap error (${first.error_code}).`,
          "kfc client doctor --project . --fix"
        )
      );
      await emitClientOnboardingEvent(options.project, blockPayload);
      printClientOnboardingPayload(blockPayload, true);
      return { code: 1, recoveryUsed: false };
    }

    try {
      await runBootstrapOnce({ ...options, force: true });
      const payload = buildClientOnboardingPassPayload(true);
      await emitClientOnboardingEvent(options.project, payload);
      if (shouldPrintPass) {
        printClientOnboardingPass(payload);
      }
      return { code: 0, recoveryUsed: true };
    } catch (retryErr) {
      const blockPayload = classifyClientOnboardingFailure(retryErr);
      await emitClientOnboardingEvent(options.project, blockPayload);
      printClientOnboardingPayload(blockPayload, true);
      return { code: 1, recoveryUsed: true };
    }
  }
}

async function runClientDoctorOnly(options) {
  const initialOk = await runClientDoctorChecks(options);
  if (initialOk) {
    if (options.fix) {
      info("No remediation needed: client diagnostics already pass.");
    }
    return 0;
  }

  if (!options.fix) {
    return 1;
  }

  warn("Client diagnostics reported failures. Applying `kfc client bootstrap --force` remediation.");
  try {
    await runBootstrapOnce({
      ...options,
      force: true
    });
  } catch (err) {
    printClientOnboardingBlock(err);
    return 1;
  }

  info("Re-running client diagnostics after remediation.");
  const postFixOk = await runClientDoctorChecks(options);
  return postFixOk ? 0 : 1;
}

async function runClientDoctorChecks(options) {
  let ok = await assertProjectPreflight(options.project);
  if (!ok) {
    return false;
  }

  try {
    const raw = await readRawConfig(options.project);
    const validationErrors = validateConfig(raw.data);
    if (validationErrors.length > 0) {
      for (const msg of validationErrors) {
        error(`Invalid config: ${msg}`);
      }
      ok = false;
    } else {
      info(`Config schema OK: ${raw.configPath}`);
      const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
      await assertReadableDirectory(resourcesDir);
      info(`Resources directory OK: ${resourcesDir}`);
    }
  } catch (err) {
    error(`Config check failed: ${err instanceof Error ? err.message : String(err)}`);
    ok = false;
  }

  const kfpBin = path.join(
    options.project,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kfp.cmd" : "kfp"
  );
  if (!fs.existsSync(kfpBin) && !fs.existsSync(REPO_KFP_BIN)) {
    error(`Missing plan UI binary: ${kfpBin}`);
    ok = false;
  } else {
    info(
      fs.existsSync(kfpBin)
        ? `Plan UI binary OK: ${kfpBin}`
        : `Plan UI fallback OK: ${REPO_KFP_BIN}`
    );
  }

  const rulesPath = path.join(options.project, ".codex", "rules", RULES_FILE_NAME);
  if (!fs.existsSync(rulesPath)) {
    error(`Missing rules file: ${rulesPath}`);
    ok = false;
  } else {
    info(`Rules file found: ${rulesPath}`);
    const content = await fsp.readFile(rulesPath, "utf8");
    const profileMatch = content.match(/^# Profile:\s*(.+)$/m);
    const profile = profileMatch?.[1]?.trim() || "";
    if (profile && VALID_RULES_PROFILES.includes(profile)) {
      info(`Rules profile: ${profile}`);
    } else {
      warn("Rules profile header not found or invalid.");
    }
  }

  if (ok) {
    printClientDocsHints(options.project);
    printClientNextCommandHints();
    info("Cleanup command after completion: kfc client done");
    info("Client diagnostics completed. Continue using `kfc ...` commands in this project.");
  }

  return ok;
}

async function runClientStart(options) {
  const readyPath = resolveClientReadyPath(options.project);
  if (fs.existsSync(readyPath) && !options.force) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS,
      `Ready file already exists: ${readyPath}. Use --force to regenerate or run \`kfc client done --project .\` first.`,
      "kfc client done --project ."
    );
  }

  const bootstrap = await runBootstrapWithSmartRecovery(options, { printPass: false });
  if (bootstrap.code !== 0) {
    return bootstrap.code;
  }

  let ready;
  try {
    ready = await createClientReadyArtifacts({
      projectDir: options.project,
      force: options.force,
      goal: options.goal,
      profileName: options.profile || "client"
    });
  } catch (err) {
    const blockPayload = classifyClientOnboardingFailure(
      createClientOnboardingError(
        CLIENT_ONBOARDING_CODES.READY_ARTIFACT_FAILED,
        err instanceof Error ? err.message : String(err),
        "kfc flow ensure-plan --project ."
      )
    );
    await emitClientOnboardingEvent(options.project, blockPayload);
    printClientOnboardingPayload(blockPayload, true);
    return 1;
  }

  const readyPayload = {
    ...buildClientOnboardingPassPayload(bootstrap.recoveryUsed),
    stage: CLIENT_ONBOARDING_STAGES.READY_BRIEF,
    reason: "Client onboarding handoff artifacts are ready.",
    next: "Read .kfc/CODEX_READY.md and execute the mission.",
    next_steps: ["Read .kfc/CODEX_READY.md and execute the mission."]
  };
  await emitClientOnboardingEvent(options.project, readyPayload);
  printClientOnboardingPass(readyPayload);
  info(`Ready file: ${ready.readyPath}`);
  info("Tell Codex: read .kfc/CODEX_READY.md and execute the mission.");
  info("Finish cleanup: kfc client done");
  return 0;
}

async function runClientDone(options) {
  const readyPath = resolveClientReadyPath(options.project);
  const sessionPath = resolveClientSessionPath(options.project);
  const removedReady = await removeIfExists(readyPath);
  const removedSession = await removeIfExists(sessionPath);

  if (!removedReady && !removedSession) {
    info("Client cleanup complete: nothing to clean.");
    return 0;
  }

  if (removedReady) {
    info(`Removed: ${readyPath}`);
  }
  if (removedSession) {
    info(`Removed: ${sessionPath}`);
  }
  info("Client cleanup complete.");
  return 0;
}

export async function runClient(options) {
  const parsed = parseArgs(options.cwd, options.args);

  if (parsed.subcommand === "help" || parsed.subcommand === "--help" || parsed.subcommand === "-h") {
    usage();
    return 0;
  }

  if (parsed.subcommand === "start") {
    try {
      return await runClientStart(parsed);
    } catch (err) {
      const blockPayload = classifyClientOnboardingFailure(err);
      await emitClientOnboardingEvent(parsed.project, blockPayload);
      printClientOnboardingPayload(blockPayload, true);
      return 1;
    }
  }

  if (parsed.subcommand === "doctor") {
    return await runClientDoctorOnly(parsed);
  }

  if (parsed.subcommand === "bootstrap") {
    const result = await runBootstrapWithSmartRecovery(parsed);
    return result.code;
  }

  if (parsed.subcommand === "done") {
    try {
      return await runClientDone(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  error(`Unknown client subcommand: ${parsed.subcommand}`);
  usage();
  return 1;
}
