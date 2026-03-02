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

function usage() {
  info("Usage: kfc client <bootstrap|doctor> [options]");
  info("Boundary: run `kfc` commands in client projects; use `npm run` only in the KFC source repo.");
  info("Client docs are packaged at: ./node_modules/@kamishino/kamiflow-codex/resources/docs/QUICKSTART.md");
  info("Client kickoff prompt: ./node_modules/@kamishino/kamiflow-codex/resources/docs/CLIENT_KICKOFF_PROMPT.md");
  info("Examples:");
  info("  kfc client bootstrap --project .");
  info("  kfc client bootstrap --project . --profile client --port 4310");
  info("  kfc client doctor --project .");
}

function parseMajorVersion(version) {
  const parsed = Number.parseInt(String(version || "0").split(".")[0], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseArgs(baseCwd, args) {
  const [subcommand, ...rest] = args;
  const parsed = {
    subcommand: subcommand || "",
    project: baseCwd,
    profile: "",
    port: DEFAULT_PORT,
    force: false,
    skipServeCheck: false
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
    if (token === "--skip-serve-check") {
      parsed.skipServeCheck = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.subcommand = "";
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

function defaultClientResourcesDir() {
  const packageName = loadPackageName();
  return `./node_modules/${packageName}/resources`;
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
  info("Then: kfc flow next --project . --plan <plan-id> --style narrative");
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
  const resourceHint = defaultClientResourcesDir();

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
    if (!force) {
      throw new Error(
        `Configured resourcesDir is not readable (${resolvedResourcesDir}). Rerun with --force to set ${resourceHint}.`
      );
    }
    config.paths.resourcesDir = resourceHint;
    changed = true;
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

async function runBootstrap(options) {
  const preflightOk = await assertProjectPreflight(options.project);
  if (!preflightOk) {
    return 1;
  }

  const configResult = await ensureProjectConfig({
    projectDir: options.project,
    explicitProfile: options.profile,
    force: options.force
  });

  await ensurePlanUi(options.project);
  await ensureProjectRules({
    projectDir: options.project,
    profileName: configResult.selectedProfile,
    force: options.force
  });

  const doctorCode = await runDoctor({ cwd: options.project, args: [] });
  if (doctorCode !== 0) {
    throw new Error("`kfc doctor` failed.");
  }

  const ensurePlanCode = await runFlow({
    cwd: options.project,
    args: ["ensure-plan", "--project", options.project]
  });
  if (ensurePlanCode !== 0) {
    throw new Error("`kfc flow ensure-plan` failed.");
  }

  const validateCode = await runPlan({
    cwd: options.project,
    args: ["validate", "--project", options.project]
  });
  if (validateCode !== 0) {
    throw new Error("`kfc plan validate` failed.");
  }

  if (options.skipServeCheck) {
    warn("Skipped serve health check (--skip-serve-check). Verification is partial.");
  } else {
    await runServeHealthCheck(options.project, options.port);
    info(`Health check OK: http://127.0.0.1:${options.port}/api/health`);
  }

  info("Client bootstrap completed successfully.");
  printClientDocsHints(options.project);
  printClientNextCommandHints();
  info("Next steps in this client repo should use `kfc ...` commands.");
  return 0;
}

async function runClientDoctorOnly(options) {
  let ok = await assertProjectPreflight(options.project);
  if (!ok) {
    return 1;
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
    info("Client diagnostics completed. Continue using `kfc ...` commands in this project.");
  }

  return ok ? 0 : 1;
}

export async function runClient(options) {
  const parsed = parseArgs(options.cwd, options.args);

  if (
    !parsed.subcommand ||
    parsed.subcommand === "help" ||
    parsed.subcommand === "--help" ||
    parsed.subcommand === "-h"
  ) {
    usage();
    return 0;
  }

  if (parsed.subcommand === "doctor") {
    return await runClientDoctorOnly(parsed);
  }

  if (parsed.subcommand === "bootstrap") {
    try {
      return await runBootstrap(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  error(`Unknown client subcommand: ${parsed.subcommand}`);
  usage();
  return 1;
}
