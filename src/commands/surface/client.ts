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
  readConfigOrDefault,
  readRawConfig,
  resolveBundledResourcesDir,
  resolveResourcesDir,
  validateConfig
} from "../../lib/core/config.js";
import {
  CLIENT_ONBOARDING_CODES,
  CLIENT_ONBOARDING_STAGES,
  buildClientOnboardingProgressPayload,
  buildClientOnboardingPassPayload,
  classifyClientOnboardingFailure,
  createClientOnboardingError
} from "../../lib/client-onboarding-recovery.js";
import {
  DEFAULT_RULES_PROFILE,
  RULES_FILE_NAME,
  VALID_RULES_PROFILES,
  buildManagedRulesContent,
  composeRulesForProfile,
  getRepoRootDir,
  normalizeManagedRulesContent,
  validateRulesProfile
} from "../../lib/core/rules.js";
import {
  getProjectSkillsTargetDir,
  getSkillsSourceDir,
  resolveSkillArtifactPath,
  syncSkillsArtifacts
} from "../../lib/core/skill-sync.js";
import { error, info, warn } from "../../lib/core/logger.js";
import {
  createPlanWorkspace,
  isDonePlan,
  selectActivePlan
} from "@kamishino/kfc-runtime/plan-workspace";
import { evaluateBuildReadiness } from "../../lib/plan/plan-lifecycle.js";
import type { FrontmatterRecord } from "../../lib/plan/plan-frontmatter.js";
import { parsePlanFrontmatter, serializePlanFrontmatter, splitPlanFrontmatter } from "../../lib/plan/plan-frontmatter.js";
import { buildCodexExecManualCommand, runCodexAction } from "@kamishino/kfc-runtime/codex-runner";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";
import { runDoctor } from "./doctor.js";
import { runFlow } from "./flow.js";
import { runPlan } from "./plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(PACKAGE_ROOT, "package.json");
const KFC_BIN = path.join(PACKAGE_ROOT, "bin", "kamiflow.js");
const REPO_KFC_PLAN_BIN = path.join(PACKAGE_ROOT, "packages", "kfc-plan-web", "bin", "kfc-plan.js");
const PLAN_UI_PACKAGE = "@kamishino/kfc-plan-web";
const DEFAULT_PORT = 4310;
const DEFAULT_HEALTH_TIMEOUT_MS = 15000;
const DEFAULT_HEALTH_POLL_MS = 500;
const QUICKSTART_FILE = path.join("docs", "QUICKSTART.md");
const CLIENT_KICKOFF_PROMPT_FILE = path.join("docs", "CLIENT_KICKOFF_PROMPT.md");
const CLIENT_AGENTS_FILE = "AGENTS.md";
const CLIENT_READY_FILE = path.join(".kfc", "CODEX_READY.md");
const CLIENT_SESSION_FILE = path.join(".kfc", "session.json");
const CLIENT_LESSONS_FILE = path.join(".kfc", "LESSONS.md");
const CLIENT_RAW_LESSONS_DIR = path.join(".local", "kfc-lessons");
const CLIENT_CODEX_CONFIG_FILE = path.join(".codex", "config.toml");
const CLIENT_CODEX_CONFIG_TEMPLATE = 'sandbox_mode = "workspace-write"\n';
const CLIENT_CODEX_LAUNCH_PROMPT = "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.";
const CLIENT_DEFAULT_MISSION = "Define the mission for this client project before implementation.";
const CLIENT_GOAL_GUIDANCE_COMMAND = 'kfc client --goal "<goal>"';
const CLIENT_CODEX_SKIP_TRUST_CHECK_OPTION = "--skip-git-repo-check";
const CLIENT_RUNTIME_SKILL = "kamiflow-core";
const CLIENT_AGENTS_SHARED_CONTRACT_FILE = path.join("templates", "client-agents-shared-contract.md");
const CLIENT_GITIGNORE_ENTRIES = Object.freeze([".kfc/", ".local/", ".agents/", ".codex/config.toml"]);
const VALID_CLIENT_LESSON_TYPES = Object.freeze(["incident", "decision"]);
const CLIENT_AGENTS_MANAGED_BEGIN = "<!-- KFC:BEGIN MANAGED -->";
const CLIENT_AGENTS_MANAGED_END = "<!-- KFC:END MANAGED -->";
const CLIENT_CODEX_FULL_AUTO_OPTION_PATTERNS = [
  "unexpected argument '--full-auto'",
  "unknown option '--full-auto'",
  "unknown option: --full-auto",
  "invalid value for '--full-auto'",
  "unexpected argument '--skip-git-repo-check'",
  "unknown option '--skip-git-repo-check'",
  "unknown option: --skip-git-repo-check"
];

type MarkdownSections = Record<string, string>;
type ClientBootstrapRuntime = {
  suppressSuccessHints?: boolean;
  printPass?: boolean;
};
type ClientInspectionStatus = "PASS" | "BLOCK";
type ClientRepoShape = "empty_new_repo" | "ready" | "needs_minor_fixes" | "risky";
type ClientApplyMode = "auto" | "blocked";
type ClientInspectionSummary = {
  inspectionStatus: ClientInspectionStatus;
  repoShape: ClientRepoShape;
  applyMode: ClientApplyMode;
  reason: string;
  recovery: string;
  next: string;
  plannedChanges: string[];
  plannedChangesSummary: string;
  onboardingPath: string;
};
type ClientPlanStateKind = "draft_plan" | "build_ready" | "blocked_plan";
type ClientPlanStateSummary = {
  kind: ClientPlanStateKind;
  planId: string;
  planPath: string;
  status: string;
  decision: string;
  nextCommand: string;
  nextMode: string;
  buildReady: boolean;
  readinessFindings: string[];
  summary: string;
  next: string;
  nextSteps: string[];
};
type ClientStatusPlanState = ClientPlanStateKind | "no_active_plan" | "unknown";
type ClientStatusInstallSource = "link" | "git" | "file_or_tarball" | "unknown";
type ClientStatusSummary = {
  status: ClientInspectionStatus;
  repoShape: ClientRepoShape;
  planState: ClientStatusPlanState;
  readyBrief: "present" | "absent";
  installSource: ClientStatusInstallSource;
  installed: boolean;
  reason: string;
  next: string;
  recovery: string;
  nextSteps: string[];
};
type ClientOperationalStatus = {
  operationallyInstalled: boolean;
  runtimeIssues: string[];
};
type ClientSetupCompletionKind = "ready_for_work" | "ready_for_cleanup" | "incomplete";
type ClientSetupCompletionResult = {
  complete: boolean;
  completion: ClientSetupCompletionKind;
  reason: string;
  recovery: string;
  planPath: string;
  planState?: ClientPlanStateSummary;
  nextAction?: string;
  nextSteps?: string[];
};
type ClientBootstrapOutcome = {
  autoInitializedPackageJson: boolean;
  inspection: ClientInspectionSummary;
  planState: ClientPlanStateSummary;
};

const BENIGN_EMPTY_PROJECT_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini"
]);

function getErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code || "");
  }
  return "";
}

function usage() {
  info("Usage: kfc client [options]");
  info("Usage: kfc client <bootstrap|doctor|done|update|upgrade|lessons> [options]");
  info("Boundary: run `kfc` commands in client projects; use `npm run` only in the KFC source repo.");
  const docsHint = resolveClientResourcesHint(process.cwd());
  const docsRoot = path.join(docsHint, "docs");
  info(`Client docs are packaged at: ${path.join(docsRoot, "QUICKSTART.md")}`);
  info(`Client kickoff prompt: ${path.join(docsRoot, "CLIENT_KICKOFF_PROMPT.md")}`);
  info("Project-local runtime skill path: .agents/skills/kamiflow-core/SKILL.md");
  info("Examples:");
  info("  kfc client");
  info("  kfc client --goal \"Implement X with tests\"");
  info("  kfc client --no-launch-codex");
  info("  kfc client --skip-git-repo-check");
  info("  kfc client done");
  info("  kfc client bootstrap");
  info("  kfc client bootstrap --profile client --port 4310 --no-launch-codex");
  info("  kfc client doctor");
  info("  kfc client doctor --fix");
  info("  kfc client status");
  info("  kfc client update");
  info("  kfc client update --apply");
  info("  kfc client update --from <git-url|folder|tgz> --apply");
  info("  kfc client lessons capture --type incident --title \"Broken setup\" --lesson \"Remember X\" --context \"While bootstrapping\"");
  info("  kfc client lessons pending");
  info("  kfc client lessons show --id LESSON-20260307-001");
  info("  kfc client lessons promote --id LESSON-20260307-001 --summary \"Use X before Y\"");
  info("  kfc client lessons list");
  info("  kfc client status --project <path>");
  info("Note: `kfc client` and `kfc client bootstrap` include one smart-recovery cycle and auto-launch Codex when a real mission is available.");
  info("Note: `kfc client update` defaults to preview; use --apply to execute the update and refresh flow.");
}

async function resolveProjectDir(baseCwd, args) {
  const idx = args.indexOf("--project");
  if (idx === -1) {
    return await detectProjectRoot(baseCwd);
  }
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for --project.");
  }
  return path.resolve(baseCwd, value);
}

function parseMajorVersion(version) {
  const parsed = Number.parseInt(String(version || "0").split(".")[0], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function parseArgs(baseCwd, args) {
  let subcommand = "start";
  let rest = args;
  if (args.length > 0 && !String(args[0]).startsWith("-")) {
    subcommand = args[0];
    rest = args.slice(1);
  }

  let action = "";
  if (subcommand === "lessons" && rest.length > 0 && !String(rest[0]).startsWith("-")) {
    action = String(rest[0]).trim();
    rest = rest.slice(1);
  }

  const projectDir = await resolveProjectDir(baseCwd, rest);

  const parsed = {
    subcommand,
    action,
    project: projectDir,
    profile: "client",
    port: DEFAULT_PORT,
    force: false,
    fix: false,
    skipServeCheck: false,
    noLaunchCodex: false,
    skipGitRepoCheck: false,
    goal: "",
    apply: false,
    from: "",
    type: "",
    title: "",
    lesson: "",
    context: "",
    id: "",
    summary: ""
  };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--project") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --project.");
      }
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
    if (token === "--no-launch-codex") {
      parsed.noLaunchCodex = true;
      continue;
    }
    if (token === "--skip-git-repo-check") {
      parsed.skipGitRepoCheck = true;
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
    if (token === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (token === "--from") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --from.");
      }
      parsed.from = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.subcommand = "help";
      return parsed;
    }
    if (token === "--type") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --type.");
      }
      parsed.type = String(value).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (token === "--title") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --title.");
      }
      parsed.title = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--lesson") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --lesson.");
      }
      parsed.lesson = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--context") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --context.");
      }
      parsed.context = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--id") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --id.");
      }
      parsed.id = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--summary") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --summary.");
      }
      parsed.summary = String(value).trim();
      i += 1;
      continue;
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

function runNodeNpmNoThrow(args, cwd) {
  return runNodeNpm(args, cwd);
}

function quoteForCmd(arg) {
  if (!/[ \t"&<>|^]/.test(arg)) {
    return arg;
  }
  return `"${String(arg).replace(/"/g, "\"\"")}"`;
}

function shellEscapeLiteral(value) {
  if (/^[a-zA-Z0-9_./:@+-]+$/.test(String(value || ""))) {
    return String(value || "");
  }
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function checkCommandInPath(commandCandidates, args, label) {
  for (const candidate of commandCandidates) {
    const useCmdWrapper = process.platform === "win32" && String(candidate).toLowerCase().endsWith(".cmd");
    const result = useCmdWrapper
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `${candidate} ${args.map(quoteForCmd).join(" ")}`], {
          encoding: "utf8"
        })
      : spawnSync(candidate, args, { encoding: "utf8" });
    if (result.error && getErrorCode(result.error) === "EPERM") {
      warn(`${label} check skipped: command spawn is restricted in this environment.`);
      return true;
    }
    if (result.status === 0) {
      return true;
    }
    if (result.error && getErrorCode(result.error) === "ENOENT") {
      continue;
    }
  }
  error(`${label} is not available in PATH.`);
  return false;
}

function slugifyProjectPackageName(projectDir) {
  const basename = path.basename(path.resolve(projectDir)) || "kfc-client-project";
  const slug = basename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
  return slug || "kfc-client-project";
}

function isBenignEmptyProjectEntry(entry) {
  return BENIGN_EMPTY_PROJECT_ENTRIES.has(String(entry?.name || ""));
}

function buildAutoInitPackageJson(projectDir) {
  return {
    name: slugifyProjectPackageName(projectDir),
    version: "1.0.0",
    private: true
  };
}

function projectJsonPath(projectDir) {
  return path.join(projectDir, "package.json");
}

async function ensureProjectPackageJsonForBootstrap(projectDir) {
  const manifestPath = projectJsonPath(projectDir);
  if (fs.existsSync(manifestPath)) {
    info(`package.json found: ${manifestPath}`);
    return { created: false, packageJsonPath: manifestPath };
  }

  const entries = await fsp.readdir(projectDir, { withFileTypes: true });
  const meaningfulEntries = entries.filter((entry) => !isBenignEmptyProjectEntry(entry));
  if (meaningfulEntries.length > 0) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING,
      `Missing package.json in project: ${manifestPath}. This folder is not a Node project yet.`,
      "npm init -y",
      {
        next: "kfc client --force",
        stage: CLIENT_ONBOARDING_STAGES.BOOTSTRAP
      }
    );
  }

  await fsp.writeFile(manifestPath, JSON.stringify(buildAutoInitPackageJson(projectDir), null, 2) + "\n", "utf8");
  info(`Auto-initialized minimal package.json: ${manifestPath}`);
  return { created: true, packageJsonPath: manifestPath };
}

async function inspectClientProject(projectDir, options: { force?: boolean } = {}): Promise<ClientInspectionSummary> {
  const manifestPath = projectJsonPath(projectDir);
  const entries = await fsp.readdir(projectDir, { withFileTypes: true });
  const meaningfulEntries = entries.filter((entry) => !isBenignEmptyProjectEntry(entry));
  const hasPackageJson = fs.existsSync(manifestPath);
  const gitignorePath = path.join(projectDir, ".gitignore");
  const gitignoreText = fs.existsSync(gitignorePath) ? await fsp.readFile(gitignorePath, "utf8") : "";
  const hasAllGitignoreEntries = CLIENT_GITIGNORE_ENTRIES.every((entry) => gitignoreText.includes(entry));
  const rulesPath = path.join(projectDir, ".codex", "rules", RULES_FILE_NAME);
  const codexConfigPath = path.join(projectDir, CLIENT_CODEX_CONFIG_FILE);
  const skillPath = resolveClientSkillArtifactPath(projectDir);
  const agentsPath = resolveClientAgentsPath(projectDir);
  const agentsText = fs.existsSync(agentsPath) ? await fsp.readFile(agentsPath, "utf8") : "";
  const hasManagedAgentsBlock = hasClientAgentsManagedBlock(agentsText);
  const lessonsPath = resolveClientLessonsPath(projectDir);
  const rawLessons = resolveClientRawLessonPaths(projectDir);
  const readyPath = resolveClientReadyPath(projectDir);

  if (!hasPackageJson && meaningfulEntries.length === 0) {
    const plannedChanges = [
      "create minimal package.json",
      "create root AGENTS.md",
      "activate client-local Codex rules under .codex/",
      "sync .agents/skills/kamiflow-core/SKILL.md",
      "scaffold .kfc/LESSONS.md and .local/kfc-lessons/",
      "prepend private .gitignore entries",
      "create active plan plus .kfc/CODEX_READY.md"
    ];
    return {
      inspectionStatus: "PASS",
      repoShape: "empty_new_repo",
      applyMode: "auto",
      reason: "Empty writable folder detected. KFC can safely initialize and bootstrap this project.",
      recovery: "None",
      next: "Bootstrap will continue automatically.",
      plannedChanges,
      plannedChangesSummary: summarizeInspectionPlannedChanges(plannedChanges),
      onboardingPath: "auto_init_bootstrap"
    };
  }

  if (!hasPackageJson) {
    const plannedChanges = ["No mutation until you initialize the project manifest."];
    return {
      inspectionStatus: "BLOCK",
      repoShape: "risky",
      applyMode: "blocked",
      reason: "Non-empty folder without package.json detected. KFC will not guess how to bootstrap this repo.",
      recovery: "npm init -y",
      next: "kfc client --force",
      plannedChanges,
      plannedChangesSummary: summarizeInspectionPlannedChanges(plannedChanges),
      onboardingPath: "blocked_missing_manifest"
    };
  }

  const missingSafeArtifacts: string[] = [];
  const refreshManagedChanges: string[] = [];
  if (!fs.existsSync(agentsPath) || !hasManagedAgentsBlock) {
    missingSafeArtifacts.push("sync root AGENTS.md");
  }
  if (!fs.existsSync(rulesPath) || !fs.existsSync(codexConfigPath)) {
    missingSafeArtifacts.push("activate client-local Codex rules under .codex/");
  }
  if (!fs.existsSync(skillPath)) {
    missingSafeArtifacts.push("sync .agents/skills/kamiflow-core/SKILL.md");
  }
  if (!fs.existsSync(lessonsPath) || !fs.existsSync(rawLessons.incidentsDir) || !fs.existsSync(rawLessons.decisionsDir)) {
    missingSafeArtifacts.push("scaffold private lessons under .kfc/ and .local/kfc-lessons/");
  }
  if (!hasAllGitignoreEntries) {
    missingSafeArtifacts.push("prepend private .gitignore entries");
  }
  if (!fs.existsSync(readyPath)) {
    missingSafeArtifacts.push("create .kfc/CODEX_READY.md");
  } else if (options.force) {
    refreshManagedChanges.push("refresh .kfc/CODEX_READY.md");
  }
  if (fs.existsSync(agentsPath) && hasManagedAgentsBlock && options.force) {
    refreshManagedChanges.push("refresh root AGENTS.md");
  }

  if (missingSafeArtifacts.length > 0) {
    const plannedChanges = [
      ...missingSafeArtifacts,
      "ensure active plan exists and validates"
    ];
    return {
      inspectionStatus: "PASS",
      repoShape: "needs_minor_fixes",
      applyMode: "auto",
      reason: "Existing Node repo detected. KFC can apply only deterministic bootstrap fixes.",
      recovery: "None",
      next: "Bootstrap will continue automatically.",
      plannedChanges,
      plannedChangesSummary: summarizeInspectionPlannedChanges(plannedChanges),
      onboardingPath: "safe_bootstrap_fixes"
    };
  }

  const plannedChanges = options.force
    ? [
        "refresh managed rules and runtime skill",
        ...refreshManagedChanges,
        "refresh session metadata",
        "verify plan, health, and private scaffolding"
      ]
    : [
        "verify plan, health, and private scaffolding",
        "reuse existing managed onboarding artifacts"
      ];

  return {
    inspectionStatus: "PASS",
    repoShape: "ready",
    applyMode: "auto",
    reason: "Client repo already contains the managed onboarding scaffold. KFC will verify and reuse it.",
    recovery: "None",
    next: options.force ? "Managed artifacts will be refreshed automatically." : "Verification will continue automatically.",
    plannedChanges,
    plannedChangesSummary: summarizeInspectionPlannedChanges(plannedChanges),
    onboardingPath: options.force ? "forced_refresh" : "verify_existing_repo"
  };
}
async function assertProjectPreflight(projectDir, options: { requirePackageJson?: boolean } = {}) {
  const requirePackageJson = options.requirePackageJson !== false;
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

  if (requirePackageJson) {
    const manifestPath = projectJsonPath(projectDir);
    if (!fs.existsSync(manifestPath)) {
      error(`Missing package.json in project: ${manifestPath}`);
      ok = false;
    } else {
      info(`package.json found: ${manifestPath}`);
    }
  }

  const npmCheck = runNodeNpm(["--version"], projectDir);
  if (npmCheck.error && getErrorCode(npmCheck.error) === "EPERM") {
    warn("npm check skipped: command spawn is restricted in this environment.");
  } else if (!npmCheck.ok) {
    error("npm is not available.");
    ok = false;
  } else {
    info(`npm available: ${npmCheck.stdout.trim()}`);
  }

  const hasCodex = process.platform === "win32"
    ? checkCommandInPath(["codex", "codex.exe", "codex.cmd"], ["--version"], "Codex CLI")
    : checkCommandInPath(["codex"], ["--version"], "Codex CLI");
  ok = ok && hasCodex;

  return ok;
}

function loadPackageName() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  return pkg.name;
}

function packagedClientResourcesDir(projectDir) {
  const packageName = loadPackageName();
  return path.join(projectDir, "node_modules", packageName, "resources");
}

function bundledResourcesDirAbsolute() {
  return path.join(PACKAGE_ROOT, "resources");
}

function resolveClientResourcesHint(projectDir) {
  const configPath = getConfigPath(projectDir);
  const configRaw = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf8")
    : "";
  if (configRaw.length > 0) {
    try {
      const config = JSON.parse(configRaw);
      const resourcesHint = config?.paths?.resourcesDir;
      if (typeof resourcesHint === "string" && resourcesHint.trim().length > 0) {
        const resolved = path.resolve(projectDir, resourcesHint);
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    } catch {
      // config not parseable yet; fallback to probing package and package-root resources.
    }
  }

  const packaged = packagedClientResourcesDir(projectDir);
  if (fs.existsSync(packaged)) {
    return packaged;
  }

  return bundledResourcesDirAbsolute();
}

function resolveClientQuickstartPath(projectDir) {
  return path.join(resolveClientResourcesHint(projectDir), QUICKSTART_FILE);
}

function resolveClientKickoffPromptPath(projectDir) {
  return path.join(resolveClientResourcesHint(projectDir), CLIENT_KICKOFF_PROMPT_FILE);
}

function resolveClientAgentsSharedContractPath(projectDir) {
  return path.join(resolveClientResourcesHint(projectDir), CLIENT_AGENTS_SHARED_CONTRACT_FILE);
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

  const lessonsPath = resolveClientLessonsPath(projectDir);
  if (fs.existsSync(lessonsPath)) {
    info(`Client lessons: ${lessonsPath}`);
  } else {
    info(`Client lessons path: ${lessonsPath}`);
  }
}

function printClientNextCommandHints(planState: ClientPlanStateSummary) {
  info(`Next: ${planState.next}`);
  for (const step of planState.nextSteps.slice(1)) {
    info(`Then: ${step}`);
  }
}

function isMissingActivePlanError(err: unknown) {
  return err instanceof Error && err.message.includes("Cannot find an active plan in .local/plans.");
}

function normalizeClientStatusInstallSource(sourceType: unknown): ClientStatusInstallSource {
  const normalized = String(sourceType || "").trim();
  if (normalized === "link" || normalized === "git" || normalized === "file_or_tarball") {
    return normalized;
  }
  return "unknown";
}

function evaluateClientOperationalStatus({
  inspectionStatus,
  packageJsonExists,
  hasManagedAgentsBlock,
  rulesPath,
  codexConfigPath,
  skillPath,
  lessonsPath,
  rawLessons
}: {
  inspectionStatus: ClientInspectionStatus;
  packageJsonExists: boolean;
  hasManagedAgentsBlock: boolean;
  rulesPath: string;
  codexConfigPath: string;
  skillPath: string;
  lessonsPath: string;
  rawLessons: { incidentsDir: string; decisionsDir: string };
}): ClientOperationalStatus {
  const runtimeIssues: string[] = [];
  if (!packageJsonExists) {
    runtimeIssues.push("package.json is missing");
  }
  if (!hasManagedAgentsBlock) {
    runtimeIssues.push("client AGENTS managed block is missing");
  }
  if (!fs.existsSync(rulesPath)) {
    runtimeIssues.push("project rules file is missing");
  }
  if (!fs.existsSync(codexConfigPath)) {
    runtimeIssues.push("client-local Codex binding is missing");
  }
  if (!fs.existsSync(skillPath)) {
    runtimeIssues.push("project-local KFC skill is missing");
  }
  if (!fs.existsSync(lessonsPath)) {
    runtimeIssues.push("client lessons file is missing");
  }
  if (!fs.existsSync(rawLessons.incidentsDir) || !fs.existsSync(rawLessons.decisionsDir)) {
    runtimeIssues.push("raw lesson directories are missing");
  }

  return {
    operationallyInstalled: inspectionStatus !== "BLOCK" && runtimeIssues.length === 0,
    runtimeIssues
  };
}
function printClientStatusSummary(summary: ClientStatusSummary) {
  const writer = summary.status === "BLOCK" ? error : info;
  writer(`Client Status: ${summary.status}`);
  writer(`Repo Shape: ${summary.repoShape}`);
  writer(`Plan State: ${summary.planState}`);
  writer(`Ready Brief: ${summary.readyBrief}`);
  writer(`Install Source: ${summary.installSource}`);
  writer(`Installed: ${summary.installed ? "yes" : "no"}`);
  writer(`Status Reason: ${summary.reason}`);
  writer(`Next: ${summary.next}`);
  for (const step of summary.nextSteps.slice(1)) {
    writer(`Then: ${step}`);
  }
  if (summary.status === "BLOCK" && summary.recovery) {
    writer(`Recovery: ${summary.recovery}`);
  }
}

function summarizeInspectionPlannedChanges(changes: string[]) {
  const compact = changes.map((item) => String(item || "").trim()).filter(Boolean);
  if (compact.length === 0) {
    return "None.";
  }
  return compact.join(" | ");
}

function printClientInspectionSummary(summary: ClientInspectionSummary, asError = false) {
  const writer = asError ? error : info;
  writer(`Inspection Status: ${summary.inspectionStatus}`);
  writer(`Repo Shape: ${summary.repoShape}`);
  writer(`Apply Mode: ${summary.applyMode}`);
  writer(`Planned Changes: ${summary.plannedChangesSummary}`);
  writer(`Inspection Reason: ${summary.reason}`);
}

function buildClientCodexLaunchPrompt() {
  return CLIENT_CODEX_LAUNCH_PROMPT;
}

type CodexLaunchAttempt = {
  fullAuto: boolean;
  skipGitRepoCheck: boolean;
};

function buildClientCodexManualCommand({ skipGitRepoCheck, fullAuto = true } = {}) {
  return buildCodexExecManualCommand({
    prompt: buildClientCodexLaunchPrompt(),
    full_auto: fullAuto,
    skip_gitrepo_check: Boolean(skipGitRepoCheck)
  });
}

function isPlaceholderClientMission(value) {
  return String(value || "").trim() === CLIENT_DEFAULT_MISSION;
}

function hasRealClientMission(value) {
  const mission = String(value || "").trim();
  return mission.length > 0 && !isPlaceholderClientMission(mission);
}

function buildClientCodexLaunchAttempts() {
  return [
    { fullAuto: true, skipGitRepoCheck: false },
    { fullAuto: true, skipGitRepoCheck: true },
    { fullAuto: false, skipGitRepoCheck: false },
    { fullAuto: false, skipGitRepoCheck: true }
  ];
}

function buildClientCodexLaunchAttemptsForRun(explicitSkipGitRepoCheck = false) {
  if (explicitSkipGitRepoCheck) {
    return [
      { fullAuto: true, skipGitRepoCheck: true },
      { fullAuto: false, skipGitRepoCheck: true }
    ];
  }
  return buildClientCodexLaunchAttempts();
}

function isCodexOptionCompatibilityFailure(result) {
  const text = String(
    result?.stderr_tail ||
    result?.stdout_tail ||
    result?.failure_signature ||
    ""
  ).toLowerCase();
  return CLIENT_CODEX_FULL_AUTO_OPTION_PATTERNS.some((pattern) => text.includes(pattern));
}

function shouldRetryCodexLaunch(result, attempt: CodexLaunchAttempt) {
  if (!result) {
    return false;
  }
  if (attempt.fullAuto && isCodexOptionCompatibilityFailure(result)) {
    return true;
  }
  if (isTrustDirectoryFailure(result) && !attempt.skipGitRepoCheck) {
    return true;
  }
  return false;
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
    const inspectionStatus = String(payload?.inspection_status || "");
    const repoShape = String(payload?.repo_shape || "");
    const plannedChanges = String(payload?.planned_changes || "");
    const applyMode = String(payload?.apply_mode || "");
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
      inspection_status: inspectionStatus || undefined,
      repo_shape: repoShape || undefined,
      planned_changes: plannedChanges || undefined,
      apply_mode: applyMode || undefined,
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
  // Contract verifier token: Onboarding Status: BLOCK
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

function printClientOnboardingBlock(errorLike, context = {}) {
  const payload = classifyClientOnboardingFailure(errorLike, context);
  printClientOnboardingPayload(payload, true);
}

function buildProjectTargetArgs(projectDir) {
  const normalized = String(projectDir || "").trim();
  return normalized ? ["--project", normalized] : [];
}

function resolveClientReadyPath(projectDir) {
  return path.join(projectDir, CLIENT_READY_FILE);
}

function resolveClientAgentsPath(projectDir) {
  return path.join(projectDir, CLIENT_AGENTS_FILE);
}

function resolveClientSessionPath(projectDir) {
  return path.join(projectDir, CLIENT_SESSION_FILE);
}

function resolveClientLessonsPath(projectDir) {
  return path.join(projectDir, CLIENT_LESSONS_FILE);
}

function resolveClientRawLessonsDir(projectDir) {
  return path.join(projectDir, CLIENT_RAW_LESSONS_DIR);
}

function resolveClientRawLessonPaths(projectDir) {
  const baseDir = resolveClientRawLessonsDir(projectDir);
  return {
    baseDir,
    incidentsDir: path.join(baseDir, "incidents"),
    decisionsDir: path.join(baseDir, "decisions")
  };
}

function resolveClientSkillArtifactPath(projectDir, skillName = CLIENT_RUNTIME_SKILL) {
  return resolveSkillArtifactPath(getProjectSkillsTargetDir(projectDir), skillName);
}

function buildClientLessonsTemplate() {
  return [
    "# Client Lessons",
    "",
    "Use this file for durable project-specific lessons that Codex should remember in future sessions.",
    "",
    "## What Belongs Here",
    "- repeated failure guardrails",
    "- anti-hallucination facts about this project/domain",
    "- stable workflow constraints that are easy to forget",
    "",
    "## What Does Not Belong Here",
    "- one-off debugging notes",
    "- temporary task progress already tracked in plans",
    "- noisy historical logs",
    "",
    "## Promotion Rule",
    "- keep raw lesson history under `.local/kfc-lessons/`",
    "- promote only durable lessons after user confirmation",
    "",
    "## Active Lessons",
    "- None yet.",
    ""
  ].join("\n");
}

function hasClientAgentsManagedBlock(content) {
  return String(content || "").includes(CLIENT_AGENTS_MANAGED_BEGIN) && String(content || "").includes(CLIENT_AGENTS_MANAGED_END);
}

export async function buildClientAgentsManagedBlock(projectDir) {
  if (!projectDir || String(projectDir).trim().length === 0) {
    throw new Error("buildClientAgentsManagedBlock(projectDir) requires a project directory.");
  }
  const sharedContractPath = resolveClientAgentsSharedContractPath(projectDir);
  const sharedContract = (await fsp.readFile(sharedContractPath, "utf8")).replace(/\r\n/g, "\n").trim();

  return [
    CLIENT_AGENTS_MANAGED_BEGIN,
    "# KFC Client Contract",
    "",
    "Read this file first in every session. It is the stable KFC operating contract for this client repository.",
    "KFC owns and refreshes the managed block below as this project's `/init`-equivalent contract.",
    "",
    "## Startup Order",
    "1. Read `AGENTS.md`.",
    "2. If `.kfc/CODEX_READY.md` exists, read it for the current mission and active-plan handoff.",
    "3. Read `.kfc/LESSONS.md` when present for curated durable project memory.",
    "4. If no active non-done plan exists, recover it immediately with `kfc flow ensure-plan --project .` before implementation and continue from the recovered plan plus lessons.",
    "",
    "## Ownership",
    "- KFC refreshes this managed block during `kfc client` and `kfc client update`.",
    "- Keep custom project notes outside this managed block so KFC can preserve them.",
    "",
    "## Command Boundary",
    "- Use only `kfc ...` commands in this client project.",
    "- Do not use maintainer-only `npm run ...` commands from the KFC source repo here.",
    "- These workflow commands are available here because KFC is installed in this client repository.",
    "",
    "## Workflow Commands",
    "- `kfc client`: reusable setup, handoff refresh, and normal startup entrypoint.",
    "- `kfc client status`: calm repo status plus automatic active-plan recovery when the scaffold is missing.",
    "- `kfc plan validate`: validate the active plan file when plan state looks suspicious.",
    "- `kfc flow ensure-plan`: recover a missing or inconsistent active plan scaffold.",
    "- `kfc flow ready`: verify readiness only after the active plan is already build-ready.",
    "- `kfc client doctor --fix`: recover onboarding or flow drift when the normal route breaks.",
    "- `kfc client done`: manual cleanup fallback after the mission is complete.",
    "- Add `--project <path>` only when you intentionally target a project from outside its tree.",
    "",
    "## Runtime Artifacts",
    "- `.kfc/CODEX_READY.md`: current mission and onboarding handoff.",
    "- `.kfc/LESSONS.md`: curated durable project memory.",
    "- `.local/plans/*.md`: live execution state and next-action source of truth.",
    "- `.agents/skills/kamiflow-core/SKILL.md`: project-local runtime skill artifact.",
    "- `.codex/rules/kamiflow.rules`: generated KFC execution-policy rules for this repo.",
    "- `.codex/config.toml`: private project-local Codex binding managed by KFC.",
    "",
    sharedContract,
    "",
    "## Cleanup",
    "- `Check: PASS` alone is not enough; the active onboarding plan must archive successfully before the task is done.",
    "- If PASS is reported but archive fails, keep recovery active instead of treating cleanup as completion.",
    "- `kfc client` auto-removes `.kfc/CODEX_READY.md` only after the active onboarding plan reaches archived done state.",
    "- `kfc client done` remains the manual cleanup fallback; it is cleanup only, not proof of mission completion, and keeps `.kfc/LESSONS.md` for future sessions.",
    CLIENT_AGENTS_MANAGED_END
  ].join("\n");
}
function mergeClientAgentsContent(existingContent, managedBlock) {
  const existing = String(existingContent || "").replace(/\r\n/g, "\n");
  const block = String(managedBlock || "").trim();
  if (!block) {
    return existing;
  }

  const escapedBegin = CLIENT_AGENTS_MANAGED_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = CLIENT_AGENTS_MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const managedPattern = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, "m");
  if (managedPattern.test(existing)) {
    return `${existing.replace(managedPattern, block).replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }
  if (!existing.trim()) {
    return `${block}\n`;
  }
  return `${block}\n\n${existing.replace(/^\n+/, "")}`.replace(/\n{3,}/g, "\n\n");
}

async function ensureClientAgentsContract(projectDir) {
  const agentsPath = resolveClientAgentsPath(projectDir);
  const existing = fs.existsSync(agentsPath) ? await fsp.readFile(agentsPath, "utf8") : "";
  const hadManagedBlock = hasClientAgentsManagedBlock(existing);
  const next = mergeClientAgentsContent(existing, await buildClientAgentsManagedBlock(projectDir));
  if (next === existing) {
    info(`Client AGENTS.md already current: ${agentsPath}`);
    return { changed: false, agentsPath, hadManagedBlock };
  }

  await fsp.writeFile(agentsPath, next, "utf8");
  if (!existing) {
    info(`Client AGENTS.md scaffolded: ${agentsPath}`);
  } else if (hadManagedBlock) {
    info(`Client AGENTS.md managed block refreshed: ${agentsPath}`);
  } else {
    info(`Client AGENTS.md managed block inserted: ${agentsPath}`);
  }
  return { changed: true, agentsPath, hadManagedBlock };
}

async function ensureClientGitignoreEntries(projectDir) {
  const gitignorePath = path.join(projectDir, ".gitignore");
  const existing = fs.existsSync(gitignorePath) ? await fsp.readFile(gitignorePath, "utf8") : "";
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const normalized = new Set(lines.map((line) => line.trim()));
  const missing = CLIENT_GITIGNORE_ENTRIES.filter((entry) => !normalized.has(entry));
  if (missing.length === 0) {
    info(`Private ignore entries already present: ${gitignorePath}`);
    return { changed: false, gitignorePath, added: [] };
  }

  const prefix = [...missing, ""].join("\n");
  const next = existing.length > 0 ? `${prefix}${existing}` : `${missing.join("\n")}\n`;
  await fsp.writeFile(gitignorePath, next, "utf8");
  info(`Prepended private ignore entries: ${gitignorePath}`);
  return { changed: true, gitignorePath, added: missing };
}

function getClientCodexConfigPath(projectDir) {
  return path.join(projectDir, CLIENT_CODEX_CONFIG_FILE);
}

function hasClientRulesActivation(projectDir) {
  return (
    fs.existsSync(path.join(projectDir, ".codex", "rules", RULES_FILE_NAME)) &&
    fs.existsSync(getClientCodexConfigPath(projectDir))
  );
}

function buildClientCodexConfigContent() {
  return [
    "# Managed by kfc client bootstrap",
    "# Private project-local Codex runtime settings for this client repo.",
    "# KFC keeps the matching project policy in .codex/rules/kamiflow.rules.",
    String(CLIENT_CODEX_CONFIG_TEMPLATE).trimEnd(),
    ""
  ].join("\n");
}

async function ensureClientCodexBinding(projectDir) {
  const configPath = getClientCodexConfigPath(projectDir);
  await fsp.mkdir(path.dirname(configPath), { recursive: true });

  if (fs.existsSync(configPath)) {
    info(`Client Codex binding preserved: ${configPath}`);
    return { changed: false, configPath };
  }

  await fsp.writeFile(configPath, buildClientCodexConfigContent(), "utf8");
  info(`Client Codex binding scaffolded: ${configPath}`);
  return { changed: true, configPath };
}

async function ensureClientActivePlan(projectDir) {
  const ensurePlanCode = await runFlow({
    cwd: projectDir,
    args: ["ensure-plan", "--project", projectDir]
  });
  if (ensurePlanCode !== 0) {
    throw new Error("`kfc flow ensure-plan` failed.");
  }

  const validateCode = await runPlan({
    cwd: projectDir,
    args: ["validate", "--project", projectDir]
  });
  if (validateCode !== 0) {
    throw new Error("`kfc plan validate` failed.");
  }

  return await describeClientPlanState(projectDir);
}
async function ensureClientLessonsScaffold(projectDir) {
  const lessonsPath = resolveClientLessonsPath(projectDir);
  const raw = resolveClientRawLessonPaths(projectDir);
  await fsp.mkdir(path.dirname(lessonsPath), { recursive: true });
  await fsp.mkdir(raw.incidentsDir, { recursive: true });
  await fsp.mkdir(raw.decisionsDir, { recursive: true });

  let lessonsCreated = false;
  if (!fs.existsSync(lessonsPath)) {
    await fsp.writeFile(lessonsPath, buildClientLessonsTemplate(), "utf8");
    lessonsCreated = true;
    info(`Client lessons scaffolded: ${lessonsPath}`);
  } else {
    info(`Client lessons preserved: ${lessonsPath}`);
  }

  return {
    changed: lessonsCreated,
    lessonsPath,
    rawLessonsDir: raw.baseDir,
    incidentsDir: raw.incidentsDir,
    decisionsDir: raw.decisionsDir
  };
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugifyLessonTitle(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "lesson";
}

function formatLessonDateParts(date = new Date()) {
  const iso = new Date(date).toISOString();
  return {
    iso,
    compactDate: iso.slice(0, 10).replaceAll("-", ""),
    dashedDate: iso.slice(0, 10)
  };
}

function formatLessonSequence(value) {
  return String(value).padStart(3, "0");
}

function parseMarkdownSections(markdown: string): MarkdownSections {
  const sections: MarkdownSections = {};
  const source = String(markdown || "").trim();
  if (!source) {
    return sections;
  }
  const matches = source.matchAll(/^##\s+(.+)\r?\n([\s\S]*?)(?=^##\s+|\Z)/gm);
  for (const match of matches) {
    const heading = String(match[1] || "").trim().toLowerCase();
    sections[heading] = String(match[2] || "").trim();
  }
  return sections;
}

function buildRawLessonMarkdown(entry) {
  const frontmatter = `${serializePlanFrontmatter({
    lesson_id: entry.lessonId,
    type: entry.type,
    status: entry.status,
    title: entry.title,
    created_at: entry.createdAt,
    promoted_at: entry.promotedAt || ""
  }, "fenced")}\n`;
  return [
    frontmatter,
    "## Context",
    entry.context || "None provided.",
    "",
    "## Lesson",
    entry.lesson,
    "",
    "## Proposed Durable Summary",
    entry.proposedSummary || "",
    ""
  ].join("\n");
}

function buildCuratedLessonEntry(entry) {
  return [
    `### [${entry.lessonId}] ${entry.title}`,
    `- Type: ${entry.type}`,
    `- Summary: ${entry.summary}`,
    `- Promoted: ${entry.promotedAt}`,
    `- Source: \`${entry.relativePath}\``,
    ""
  ].join("\n");
}

function parseCuratedLessons(markdown) {
  const source = String(markdown || "");
  const entries = [];
  const matches = source.matchAll(
    /^### \[(.+?)\] (.+)\r?\n- Type: (.+)\r?\n- Summary: ([\s\S]*?)\r?\n- Promoted: (.+)\r?\n- Source: `(.+)`\r?$/gm
  );
  for (const match of matches) {
    entries.push({
      lessonId: String(match[1] || "").trim(),
      title: String(match[2] || "").trim(),
      type: String(match[3] || "").trim(),
      summary: normalizeWhitespace(match[4] || ""),
      promotedAt: String(match[5] || "").trim(),
      relativePath: String(match[6] || "").trim()
    });
  }
  return entries;
}

function validateClientLessonType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (!VALID_CLIENT_LESSON_TYPES.includes(normalized)) {
    throw new Error(`Invalid --type value. Use one of: ${VALID_CLIENT_LESSON_TYPES.join(", ")}.`);
  }
  return normalized;
}

function resolveClientRawLessonTypeDir(projectDir, type) {
  const raw = resolveClientRawLessonPaths(projectDir);
  return type === "incident" ? raw.incidentsDir : raw.decisionsDir;
}

async function listClientRawLessons(projectDir) {
  const raw = resolveClientRawLessonPaths(projectDir);
  const records = [];

  for (const type of VALID_CLIENT_LESSON_TYPES) {
    const dirPath = resolveClientRawLessonTypeDir(projectDir, type);
    let entries = [];
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        continue;
      }
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }
      const filePath = path.join(dirPath, entry.name);
      const rawMarkdown = await fsp.readFile(filePath, "utf8");
      const { frontmatter, body } = splitPlanFrontmatter(rawMarkdown);
      const sections = parseMarkdownSections(body);
      records.push({
        lessonId: String(frontmatter.lesson_id || "").trim(),
        type: String(frontmatter.type || type).trim().toLowerCase(),
        status: String(frontmatter.status || "pending").trim().toLowerCase(),
        title: String(frontmatter.title || path.basename(entry.name, ".md")).trim(),
        createdAt: String(frontmatter.created_at || "").trim(),
        promotedAt: String(frontmatter.promoted_at || "").trim(),
        context: String(sections.context || "").trim(),
        lesson: String(sections.lesson || "").trim(),
        proposedSummary: String(sections["proposed durable summary"] || "").trim(),
        filePath,
        relativePath: path.relative(projectDir, filePath).replaceAll("\\", "/"),
        filename: entry.name
      });
    }
  }

  records.sort((left, right) => {
    return toTimestamp(right.createdAt, 0) - toTimestamp(left.createdAt, 0);
  });

  return records;
}

async function findClientRawLessonById(projectDir, lessonId) {
  const normalizedId = String(lessonId || "").trim().toUpperCase();
  const lessons = await listClientRawLessons(projectDir);
  return lessons.find((entry) => entry.lessonId.toUpperCase() === normalizedId) || null;
}

async function allocateClientLessonIdentity(projectDir, title) {
  const allLessons = await listClientRawLessons(projectDir);
  const { compactDate, dashedDate, iso } = formatLessonDateParts();
  let maxSeq = 0;
  for (const lesson of allLessons) {
    const match = lesson.lessonId.match(/^LESSON-(\d{8})-(\d{3})$/);
    if (!match || match[1] !== compactDate) {
      continue;
    }
    maxSeq = Math.max(maxSeq, Number.parseInt(match[2], 10) || 0);
  }
  const nextSeq = maxSeq + 1;
  const seqToken = formatLessonSequence(nextSeq);
  return {
    lessonId: `LESSON-${compactDate}-${seqToken}`,
    filename: `${dashedDate}-${seqToken}-${slugifyLessonTitle(title)}.md`,
    createdAt: iso
  };
}

async function appendCuratedClientLesson(projectDir, entry) {
  const lessonsPath = resolveClientLessonsPath(projectDir);
  const existing = fs.existsSync(lessonsPath)
    ? await fsp.readFile(lessonsPath, "utf8")
    : buildClientLessonsTemplate();
  const marker = `### [${entry.lessonId}] `;
  if (existing.includes(marker)) {
    return { changed: false, lessonsPath };
  }

  const cleaned = existing.replace(/\r\n/g, "\n");
  const withoutPlaceholder = cleaned.replace(/^## Active Lessons\s+- None yet\.\s*/m, "## Active Lessons\n\n");
  const base = withoutPlaceholder.endsWith("\n") ? withoutPlaceholder : `${withoutPlaceholder}\n`;
  const nextContent = `${base}${base.endsWith("\n\n") ? "" : "\n"}${buildCuratedLessonEntry(entry)}`;
  await fsp.writeFile(lessonsPath, nextContent, "utf8");
  return { changed: true, lessonsPath };
}

async function writeRawClientLesson(projectDir, entry) {
  const dirPath = resolveClientRawLessonTypeDir(projectDir, entry.type);
  await fsp.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, entry.filename);
  await fsp.writeFile(filePath, buildRawLessonMarkdown(entry), "utf8");
  return filePath;
}

function printClientLessonRecord(entry) {
  info(`Lesson ID: ${entry.lessonId}`);
  info(`Type: ${entry.type}`);
  info(`Status: ${entry.status}`);
  info(`Title: ${entry.title}`);
  info(`Created: ${entry.createdAt || "Unknown"}`);
  info(`Promoted: ${entry.promotedAt || "-"}`);
  info(`Path: ${entry.relativePath || entry.filePath}`);
  console.log("");
  console.log("## Context");
  console.log(entry.context || "None provided.");
  console.log("");
  console.log("## Lesson");
  console.log(entry.lesson || "<empty>");
  if (entry.proposedSummary) {
    console.log("");
    console.log("## Proposed Durable Summary");
    console.log(entry.proposedSummary);
  }
}

async function runClientLessons(options) {
  await ensureClientLessonsScaffold(options.project);

  if (!options.action) {
    throw new Error("Missing lessons action. Use one of: capture, pending, show, promote, list.");
  }

  if (options.action === "capture") {
    const type = validateClientLessonType(options.type);
    const title = String(options.title || "").trim();
    const lesson = String(options.lesson || "").trim();
    const context = String(options.context || "").trim();
    if (!title) {
      throw new Error("Missing required --title for `kfc client lessons capture`.");
    }
    if (!lesson) {
      throw new Error("Missing required --lesson for `kfc client lessons capture`.");
    }

    const identity = await allocateClientLessonIdentity(options.project, title);
    const filePath = await writeRawClientLesson(options.project, {
      lessonId: identity.lessonId,
      filename: identity.filename,
      type,
      status: "pending",
      title,
      createdAt: identity.createdAt,
      promotedAt: "",
      context,
      lesson,
      proposedSummary: ""
    });
    info("Lesson captured.");
    info(`Lesson ID: ${identity.lessonId}`);
    info(`Path: ${filePath}`);
    return 0;
  }

  if (options.action === "pending") {
    const lessons = await listClientRawLessons(options.project);
    const filtered = lessons.filter((entry) => {
      if (entry.status === "promoted") {
        return false;
      }
      if (!options.type) {
        return true;
      }
      return entry.type === validateClientLessonType(options.type);
    });
    if (filtered.length === 0) {
      info("No pending lessons.");
      return 0;
    }
    for (const entry of filtered) {
      info(`[${entry.lessonId}] (${entry.type}) ${entry.title}`);
    }
    return 0;
  }

  if (options.action === "show") {
    if (!options.id) {
      throw new Error("Missing required --id for `kfc client lessons show`.");
    }
    const entry = await findClientRawLessonById(options.project, options.id);
    if (!entry) {
      throw new Error(`Unknown lesson id: ${options.id}`);
    }
    printClientLessonRecord(entry);
    return 0;
  }

  if (options.action === "promote") {
    if (!options.id) {
      throw new Error("Missing required --id for `kfc client lessons promote`.");
    }
    const entry = await findClientRawLessonById(options.project, options.id);
    if (!entry) {
      throw new Error(`Unknown lesson id: ${options.id}`);
    }
    const summary = normalizeWhitespace(options.summary || entry.proposedSummary || entry.lesson);
    if (!summary) {
      throw new Error("Cannot promote a lesson without a durable summary. Provide --summary.");
    }
    const promotedAt = new Date().toISOString();
    const curatedEntry = {
      lessonId: entry.lessonId,
      type: entry.type,
      title: entry.title,
      summary,
      promotedAt,
      relativePath: entry.relativePath
    };
    const appendResult = await appendCuratedClientLesson(options.project, curatedEntry);
    await fsp.writeFile(
      entry.filePath,
      buildRawLessonMarkdown({
        lessonId: entry.lessonId,
        filename: entry.filename,
        type: entry.type,
        status: "promoted",
        title: entry.title,
        createdAt: entry.createdAt,
        promotedAt,
        context: entry.context,
        lesson: entry.lesson,
        proposedSummary: summary
      }),
      "utf8"
    );
    info(appendResult.changed ? "Lesson promoted." : "Lesson already existed in curated lessons; raw status refreshed.");
    info(`Lesson ID: ${entry.lessonId}`);
    info(`Curated file: ${resolveClientLessonsPath(options.project)}`);
    return 0;
  }

  if (options.action === "list") {
    const lessonsPath = resolveClientLessonsPath(options.project);
    const content = fs.existsSync(lessonsPath) ? await fsp.readFile(lessonsPath, "utf8") : "";
    const entries = parseCuratedLessons(content);
    if (entries.length === 0) {
      info("No curated lessons.");
      return 0;
    }
    for (const entry of entries) {
      info(`[${entry.lessonId}] (${entry.type}) ${entry.title}`);
      info(`  Summary: ${entry.summary}`);
    }
    return 0;
  }

  throw new Error(`Unknown lessons action: ${options.action}`);
}

function toTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function resolveActivePlan(projectDir) {
  const workspace = createPlanWorkspace(projectDir, parsePlanFrontmatter);
  const plans = await workspace.getPlanRecords(false);
  const activeCandidates = plans.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return status === "draft" || status === "ready";
  });
  if (activeCandidates.length > 0) {
    activeCandidates.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
    return activeCandidates[0];
  }
  return selectActivePlan(plans);
}

async function describeClientPlanState(projectDir): Promise<ClientPlanStateSummary> {
  const plan = await resolveActivePlan(projectDir);
  if (!plan) {
    throw new Error("Cannot find an active plan in .local/plans.");
  }

  const readiness = evaluateBuildReadiness(plan);
  const frontmatter = plan.frontmatter;
  const status = String(frontmatter.status || "draft").trim() || "draft";
  const decision = String(frontmatter.decision || "Unknown").trim() || "Unknown";
  const nextCommand = String(frontmatter.next_command || "plan").trim() || "plan";
  const nextMode = String(frontmatter.next_mode || "Plan").trim() || "Plan";
  const blocked =
    String(status).toLowerCase() === "blocked" ||
    String(nextCommand).toLowerCase() === "fix" ||
    String(nextMode).toLowerCase() === "fix";

  if (readiness.ready) {
    return {
      kind: "build_ready",
      planId: plan.planId,
      planPath: plan.filePath,
      status,
      decision,
      nextCommand,
      nextMode,
      buildReady: true,
      readinessFindings: [],
      summary: "Active plan is build-ready. Codex can verify readiness and start the next build slice.",
      next: "kfc flow ready",
      nextSteps: [
        "kfc flow ready",
        "kfc flow next --plan <plan-id> --style narrative"
      ]
    };
  }

  const readinessHints = readiness.findings.slice(0, 2);
  if (blocked) {
    return {
      kind: "blocked_plan",
      planId: plan.planId,
      planPath: plan.filePath,
      status,
      decision,
      nextCommand,
      nextMode,
      buildReady: false,
      readinessFindings: readiness.findings,
      summary: readinessHints.length > 0
        ? `Active plan is blocked. ${readinessHints.join(" ")}`
        : "Active plan is blocked and needs planning/fix before build.",
      next: "Resolve the active plan blocker before any build route.",
      nextSteps: [
        "Resolve the active plan blocker before any build route.",
        "kfc client doctor --fix"
      ]
    };
  }

  return {
    kind: "draft_plan",
    planId: plan.planId,
    planPath: plan.filePath,
    status,
    decision,
    nextCommand,
    nextMode,
    buildReady: false,
    readinessFindings: readiness.findings,
    summary: readinessHints.length > 0
      ? `Active plan is still a draft. ${readinessHints.join(" ")}`
      : "Active plan is still a draft. Complete Brainstorm/Plan before build.",
    next: "Complete Brainstorm/Plan in the active plan before any build route.",
    nextSteps: [
      "Complete Brainstorm/Plan in the active plan before any build route.",
      "After the plan is GO + build-ready, run `kfc flow ready`."
    ]
  };
}

function buildReadyFileContent({ goal, planState, inspection }) {
  const mission = hasRealClientMission(goal)
    ? String(goal).trim()
    : CLIENT_DEFAULT_MISSION;
  const stateRouteLine = planState.kind === "build_ready"
    ? "3. Verify the active plan is ready with `kfc flow ready`, then begin the next build slice."
    : planState.kind === "blocked_plan"
      ? "3. Resolve the active plan blocker first. Do not start build work until the blocker is cleared."
      : "3. The active plan is still a draft. Finish Brainstorm/Plan work first; do not start build work yet.";
  const stateFollowupLine = planState.kind === "build_ready"
    ? "4. Execute exactly one route and mutate the active plan markdown (`updated_at` + `WIP Log`)."
    : planState.kind === "blocked_plan"
      ? "4. Use planning/fix work to clear the blocker, then re-check readiness before build."
      : "4. Update the active plan until `decision=GO`, `next_command=build`, `next_mode=Build`, and Open Decisions are resolved.";
  const readinessPolicyLine = planState.kind === "build_ready"
    ? "5. After each build/fix slice, run checks and report `Check: PASS|BLOCK` with evidence."
    : "5. Only run `kfc flow ready` after the plan is actually build-ready.";

  return [
    "# CODEX READY",
    "",
    "## Mission",
    `- ${mission}`,
    "",
    "## Active Plan",
    `- plan_id: ${planState.planId}`,
    `- plan_path: ${planState.planPath}`,
    "",
    "## Active Plan State",
    `- state: ${planState.kind}`,
    `- status: ${planState.status}`,
    `- decision: ${planState.decision}`,
    `- next_command: ${planState.nextCommand}`,
    `- next_mode: ${planState.nextMode}`,
    `- build_ready: ${planState.buildReady ? "yes" : "no"}`,
    `- note: ${planState.summary}`,
    "",
    "## Repo Context",
    `- repo_shape: ${inspection.repoShape}`,
    `- inspection_status: ${inspection.inspectionStatus}`,
    `- apply_mode: ${inspection.applyMode}`,
    `- onboarding_path: ${inspection.onboardingPath}`,
    `- planned_changes: ${inspection.plannedChangesSummary}`,
    "",
    "## First-Run Sequence",
    "1. Read `AGENTS.md` first, then read this file before implementation.",
    "2. If `.kfc/LESSONS.md` exists, read it as curated project memory before implementation.",
    stateRouteLine,
    stateFollowupLine,
    readinessPolicyLine,
    "6. If blocked, return exact `Recovery: <command>` and stop until recovered.",
    "",
    "## Session Bootstrap (Every Session)",
    "1. Read `AGENTS.md` first. If this file still exists, re-read it before implementation.",
    "2. Use `AGENTS.md` for the stable workflow command map; this file stays mission- and plan-specific.",
    "3. Read `.kfc/LESSONS.md` when present; it is the curated durable memory for this client project.",
    "4. Resolve one active non-done plan in `.local/plans/` before route output.",
    "5. Touch the active plan at route start and again before final response (`updated_at` + timestamped `WIP Log` line).",
    "",
    "## Autonomous Execution Contract",
    "1. Use only `kfc ...` commands in this client project.",
    "2. Keep changes scoped to mission and acceptance criteria.",
    "3. Execute routine flow commands yourself; do not ask the user to run normal `kfc` commands.",
    "4. Ask the user only when execution is impossible from agent context (permissions/auth/out-of-workspace).",
    "5. Before `build`/`fix`, ensure the active plan is truly build-ready. Fresh draft plans stay in Brainstorm/Plan first.",
    "6. If readiness or flow behavior fails, run `kfc client doctor --fix` and return BLOCK with exact recovery.",
    "7. After completing implementation in a turn, run check validations and report `Check: PASS|BLOCK` before final response.",
    "",
    "## Blocker Contract",
    "- Return exactly:",
    "  - `Status: BLOCK`",
    "  - `Reason: <single concrete cause>`",
    "  - `Recovery: <exact command>`",
    "",
    "## Finish Checklist (Required)",
    "1. Treat completion as valid only after `Check: PASS` and successful archive of the active onboarding plan.",
    "2. `kfc client` will auto-clean this file only after the active onboarding plan is archived done.",
    "3. If PASS is reported but archive fails, keep recovery active instead of treating the task as done.",
    "4. If manual recovery is needed, run `kfc client done` for cleanup only; it is not proof of completion.",
    "5. Do not mark task complete until `.kfc/CODEX_READY.md` is removed.",
    ""
  ].join("\n");
}

function extractExistingReadyMission(readyMarkdown) {
  const match = String(readyMarkdown || "").match(/## Mission\s*\r?\n-\s*(.+?)(?:\r?\n|$)/i);
  return match ? String(match[1] || "").trim() : "";
}

function resolveClientMission(goal, existingReadyMarkdown) {
  const explicitGoal = String(goal || "").trim();
  if (explicitGoal.length > 0) {
    return explicitGoal;
  }
  return extractExistingReadyMission(existingReadyMarkdown);
}

async function findDonePlanById(projectDir, planId) {
  const workspace = createPlanWorkspace(projectDir, parsePlanFrontmatter);
  const planRecord = await workspace.getPlanByRef(planId, true);
  if (!planRecord || !isDonePlan(planRecord)) {
    return null;
  }
  return {
    filePath: planRecord.filePath,
    raw: planRecord.raw,
    frontmatter: planRecord.frontmatter
  };
}

export async function evaluateClientSetupCompletion(projectDir, planId): Promise<ClientSetupCompletionResult> {
  const donePlan = await findDonePlanById(projectDir, planId);
  if (donePlan) {
    const status = String(donePlan.frontmatter.status || "").trim().toLowerCase();
    const decision = String(donePlan.frontmatter.decision || "").trim().toUpperCase();
    if (status === "done" && decision === "PASS") {
      return {
        complete: true,
        completion: "ready_for_cleanup",
        reason: `Active onboarding plan archived successfully: ${donePlan.filePath}`,
        recovery: "None",
        planPath: donePlan.filePath,
        nextAction: "kfc client done"
      };
    }
  }

  const activePlan = await resolveActivePlan(projectDir);
  if (activePlan && String(activePlan.planId || "").trim() === String(planId || "").trim()) {
    const planState = await describeClientPlanState(projectDir);
    if (planState.kind === "build_ready") {
      return {
        complete: true,
        completion: "ready_for_work",
        reason: `Setup handoff is ready for execution. ${planState.summary}`,
        recovery: "None",
        planPath: activePlan.filePath,
        planState,
        nextAction: planState.next,
        nextSteps: planState.nextSteps
      };
    }

    return {
      complete: false,
      completion: "incomplete",
      reason: `Setup completion is still incomplete. ${planState.summary}`,
      recovery: "kfc client",
      planPath: activePlan.filePath,
      planState
    };
  }

  return {
    complete: false,
    completion: "incomplete",
    reason: "Setup completion is still incomplete. KFC could not confirm that the onboarding plan reached archived done state.",
    recovery: "kfc client",
    planPath: ""
  };
}

export async function createClientReadyArtifacts({ projectDir, force, goal, profileName, inspection }) {
  const planState = await describeClientPlanState(projectDir);

  const readyPath = resolveClientReadyPath(projectDir);
  const readyExists = fs.existsSync(readyPath);
  const existingReady = readyExists ? await fsp.readFile(readyPath, "utf8") : "";
  const effectiveGoal = resolveClientMission(goal, existingReady);
  const realMissionAvailable = hasRealClientMission(effectiveGoal);

  await fsp.mkdir(path.dirname(readyPath), { recursive: true });
  await fsp.writeFile(
    readyPath,
    buildReadyFileContent({
      goal: effectiveGoal,
      planState,
      inspection
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
        planId: planState.planId,
        planPath: planState.planPath,
        planState: planState.kind,
        buildReady: planState.buildReady,
        repoShape: inspection.repoShape,
        onboardingPath: inspection.onboardingPath
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return {
    readyPath,
    sessionPath,
    planId: planState.planId,
    planState,
    inspection,
    reusedExisting: readyExists && !force,
    effectiveGoal: realMissionAvailable ? effectiveGoal.trim() : CLIENT_DEFAULT_MISSION,
    hasRealMission: realMissionAvailable
  };
}

async function runClientCodexLaunch({ projectDir, planId, skipGitRepoCheck = false }) {
  const attempts: CodexLaunchAttempt[] = buildClientCodexLaunchAttemptsForRun(Boolean(skipGitRepoCheck));
  let latestResult = null;
  let manualCommand = buildClientCodexManualCommand({ skipGitRepoCheck });

  for (const attempt of attempts) {
    manualCommand = buildClientCodexManualCommand({
      fullAuto: attempt.fullAuto,
      skipGitRepoCheck: attempt.skipGitRepoCheck
    });

    latestResult = await runCodexAction({
      plan_id: planId,
      action_type: "start",
      prompt: buildClientCodexLaunchPrompt(),
      full_auto: attempt.fullAuto,
      cwd: projectDir,
      skip_gitrepo_check: attempt.skipGitRepoCheck
    });

    if (latestResult?.status === "completed") {
      return {
        result: latestResult,
        manualCommand
      };
    }

    if (!shouldRetryCodexLaunch(latestResult, attempt)) {
      return {
        result: latestResult,
        manualCommand
      };
    }
  }

  return {
    result: latestResult,
    manualCommand
  };
}

function isTrustDirectoryFailure(result) {
  const text = String(
    result?.failure_signature ||
    result?.stderr_tail ||
    result?.stdout_tail ||
    result?.recovery_hint ||
    ""
  ).toLowerCase();
  return text.includes("not inside a trusted directory") || text.includes("skip-git-repo-check");
}

function printClientCodexLaunchOutcome(result, manualCommand) {
  if (result?.status === "completed") {
    info("Codex auto-run finished.");
    return;
  }
  const reason =
    result?.failure_signature ||
    result?.stderr_tail ||
    result?.recovery_hint ||
    "Codex auto-launch failed.";
  warn(`Codex auto-launch failed: ${reason}`);
  info(`Manual fallback: ${manualCommand}`);
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

function loadProjectPackageJson(projectDir) {
  const packageJsonPath = projectJsonPath(projectDir);
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  return {
    packageJsonPath,
    data: JSON.parse(raw)
  };
}

function dependencyReference(pkg, packageName) {
  const buckets = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const bucket of buckets) {
    const value = pkg?.[bucket]?.[packageName];
    if (typeof value === "string" && value.trim().length > 0) {
      return { bucket, spec: value.trim() };
    }
  }
  return null;
}

function isGitSpec(spec) {
  const value = String(spec || "").trim().toLowerCase();
  return (
    value.startsWith("git+") ||
    value.startsWith("git://") ||
    value.startsWith("github:") ||
    value.startsWith("gitlab:") ||
    value.startsWith("bitbucket:") ||
    value.includes("github.com") ||
    value.includes("gitlab.com") ||
    value.includes("bitbucket.org") ||
    value.endsWith(".git")
  );
}

function isFileLikeSpec(spec) {
  const value = String(spec || "").trim();
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("file:")) {
    return true;
  }
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) {
    return true;
  }
  if (value.startsWith(".") || value.startsWith("..") || path.isAbsolute(value)) {
    return true;
  }
  return false;
}

function normalizeInstallSource(raw, projectDir) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("file:")) {
    return value;
  }
  if (isGitSpec(value)) {
    return value;
  }
  if (isFileLikeSpec(value)) {
    const absolute = path.isAbsolute(value) ? value : path.resolve(projectDir, value);
    const relative = path.relative(projectDir, absolute).replace(/\\/g, "/");
    const normalizedRelative = relative.startsWith(".") ? relative : `./${relative}`;
    return `file:${normalizedRelative}`;
  }
  return value;
}

async function detectClientInstallSource(projectDir) {
  const packageName = loadPackageName();
  const { packageJsonPath, data } = loadProjectPackageJson(projectDir);
  const dependency = dependencyReference(data, packageName);
  const installedPath = path.join(projectDir, "node_modules", packageName);

  let installed = false;
  let realPath = "";
  let isSymlink = false;
  try {
    const stat = await fsp.lstat(installedPath);
    installed = true;
    isSymlink = stat.isSymbolicLink();
    realPath = await fsp.realpath(installedPath);
  } catch {
    installed = false;
  }

  let sourceType = "registry_or_unknown";
  if (isSymlink) {
    sourceType = "link";
  } else if (dependency?.spec && isGitSpec(dependency.spec)) {
    sourceType = "git";
  } else if (dependency?.spec && isFileLikeSpec(dependency.spec)) {
    sourceType = "file_or_tarball";
  }

  let currentVersion = "";
  if (installed) {
    const installedPackageJson = path.join(installedPath, "package.json");
    if (fs.existsSync(installedPackageJson)) {
      try {
        currentVersion = JSON.parse(await fsp.readFile(installedPackageJson, "utf8")).version || "";
      } catch {
        currentVersion = "";
      }
    }
  }

  return {
    packageName,
    packageJsonPath,
    installed,
    installedPath,
    realPath,
    isSymlink,
    dependencyBucket: dependency?.bucket || "",
    dependencySpec: dependency?.spec || "",
    currentVersion,
    sourceType
  };
}

async function describeClientStatus(projectDir, options = {}): Promise<ClientStatusSummary> {
  const inspection = await inspectClientProject(projectDir, options);
  const packageJsonExists = fs.existsSync(projectJsonPath(projectDir));
  const readyBrief: "present" | "absent" = fs.existsSync(resolveClientReadyPath(projectDir)) ? "present" : "absent";
  const agentsPath = resolveClientAgentsPath(projectDir);
  const agentsText = fs.existsSync(agentsPath) ? await fsp.readFile(agentsPath, "utf8") : "";
  const rulesPath = path.join(projectDir, ".codex", "rules", RULES_FILE_NAME);
  const codexConfigPath = getClientCodexConfigPath(projectDir);
  const skillPath = resolveClientSkillArtifactPath(projectDir);
  const lessonsPath = resolveClientLessonsPath(projectDir);
  const rawLessons = resolveClientRawLessonPaths(projectDir);

  let installSource: ClientStatusInstallSource = "unknown";
  let packageInstalled = false;
  if (packageJsonExists) {
    try {
      const detection = await detectClientInstallSource(projectDir);
      installSource = normalizeClientStatusInstallSource(detection.sourceType);
      packageInstalled = detection.installed;
    } catch {
      installSource = "unknown";
    }
  }

  let planState: ClientStatusPlanState = "unknown";
  let reason = inspection.reason;
  let next = inspection.next || "kfc client";
  let recovery = inspection.recovery === "None" ? "" : inspection.recovery;
  let nextSteps = next ? [next] : [];

  const operational = evaluateClientOperationalStatus({
    inspectionStatus: inspection.inspectionStatus,
    packageJsonExists,
    hasManagedAgentsBlock: hasClientAgentsManagedBlock(agentsText),
    rulesPath,
    codexConfigPath,
    skillPath,
    lessonsPath,
    rawLessons
  });
  const runtimeIssues = [...operational.runtimeIssues];

  try {
    const plan = await describeClientPlanState(projectDir);
    planState = plan.kind;
    reason = plan.summary;
    next = plan.next;
    recovery = "";
    nextSteps = plan.nextSteps;
  } catch (err) {
    if (isMissingActivePlanError(err)) {
      try {
        const recoveredPlan = await ensureClientActivePlan(projectDir);
        planState = recoveredPlan.kind;
        reason = `Recovered missing active plan automatically. ${recoveredPlan.summary}`;
        next = recoveredPlan.next;
        recovery = "";
        nextSteps = recoveredPlan.nextSteps;
      } catch (recoverErr) {
        planState = "no_active_plan";
        reason = readyBrief === "present"
          ? "Ready handoff exists but the active plan is missing and automatic recovery failed."
          : "No active plan is present and automatic recovery failed.";
        next = "kfc flow ensure-plan";
        recovery = "kfc flow ensure-plan";
        nextSteps = [next];
        runtimeIssues.push(
          recoverErr instanceof Error
            ? `active plan recovery failed: ${recoverErr.message}`
            : "active plan recovery failed"
        );
      }
    } else {
      runtimeIssues.push("active plan state could not be read");
      reason = err instanceof Error ? err.message : "Active plan state could not be read.";
      next = "kfc client doctor --fix";
      recovery = "kfc client doctor --fix";
      nextSteps = [next];
    }
  }

  if (inspection.inspectionStatus === "BLOCK") {
    return {
      status: "BLOCK",
      repoShape: inspection.repoShape,
      planState,
      readyBrief,
      installSource,
      installed: operational.operationallyInstalled,
      reason: inspection.reason,
      next: inspection.next || next,
      recovery: inspection.recovery === "None" ? recovery : inspection.recovery,
      nextSteps: [inspection.next || next].filter(Boolean)
    };
  }

  if (runtimeIssues.length > 0) {
    const statusRecovery = runtimeIssues.some((issue) => issue.startsWith("active plan recovery failed"))
      ? "kfc flow ensure-plan"
      : "kfc client --force --no-launch-codex";
    return {
      status: "BLOCK",
      repoShape: inspection.repoShape,
      planState,
      readyBrief,
      installSource,
      installed: false,
      reason: `Client runtime is incomplete. Missing or inconsistent: ${runtimeIssues.join("; ")}.`,
      next: statusRecovery,
      recovery: statusRecovery,
      nextSteps: [statusRecovery]
    };
  }

  return {
    status: "PASS",
    repoShape: inspection.repoShape,
    planState,
    readyBrief,
    installSource,
    installed: operational.operationallyInstalled || packageInstalled,
    reason,
    next,
    recovery,
    nextSteps
  };
}
function buildUpdateManualRecovery(parsed, reason) {
  const projectArgs = buildProjectTargetArgs(parsed.project);
  const updateCommand = ["kfc", "client", "update", ...projectArgs];
  if (parsed.from) {
    return [...updateCommand, "--from", parsed.from, "--apply"].join(" ");
  }
  if (reason === "link") {
    return `npm link ${loadPackageName()} && ${[...updateCommand, "--apply"].join(" ")}`;
  }
  return ["kfc", "client", ...projectArgs, "--force", "--no-launch-codex"].join(" ");
}

function formatDependencyImpact(detection, nextSpec) {
  if (detection.sourceType === "link") {
    return "package.json unchanged";
  }
  if (!detection.dependencyBucket) {
    return nextSpec ? "no saved dependency; apply uses one-off install" : "no saved dependency";
  }
  return nextSpec && nextSpec !== detection.dependencySpec
    ? `${detection.dependencyBucket} will update from ${detection.dependencySpec || "<empty>"} to ${nextSpec}`
    : `${detection.dependencyBucket} unchanged`;
}

function buildClientUpdatePlan(parsed, detection) {
  const overrideSpec = parsed.from ? normalizeInstallSource(parsed.from, parsed.project) : "";
  const targetSpec = overrideSpec || detection.dependencySpec || "";
  const base = {
    sourceType: detection.sourceType,
    targetSpec,
    action: "blocked",
    summary: "",
    dependencyImpact: formatDependencyImpact(detection, targetSpec),
    mutateManifest: false,
    requiresFrom: false
  };

  if (detection.sourceType === "link") {
    return {
      ...base,
      action: "refresh",
      summary: detection.realPath
        ? `Linked install detected at ${detection.realPath}; apply will refresh client artifacts only.`
        : "Linked install detected; apply will refresh client artifacts only."
    };
  }

  if (detection.sourceType === "git") {
    if (!targetSpec) {
      return {
        ...base,
        action: "blocked",
        summary: "Git install detected but no saved source spec is available.",
        requiresFrom: true
      };
    }
    return {
      ...base,
      action: "reinstall",
      summary: `Git install detected; apply will reinstall from ${targetSpec}.`,
      mutateManifest: Boolean(parsed.from && detection.dependencyBucket)
    };
  }

  if (detection.sourceType === "file_or_tarball") {
    if (!overrideSpec) {
      return {
        ...base,
        action: "blocked",
        summary: "File/tarball install detected; provide --from <folder|tgz> to upgrade.",
        requiresFrom: true
      };
    }
    return {
      ...base,
      action: "reinstall",
      summary: `File/tarball override detected; apply will reinstall from ${overrideSpec}.`,
      mutateManifest: Boolean(detection.dependencyBucket)
    };
  }

  return {
    ...base,
    action: "blocked",
    summary: "Unsupported install source. V1 supports link, git, and explicit file/tarball sources."
  };
}

function printClientUpdatePreview(parsed, detection, plan) {
  info("Update Status: PREVIEW");
  info(`Source Type: ${plan.sourceType}`);
  info(`Installed: ${detection.installed ? "yes" : "no"}`);
  if (detection.currentVersion) {
    info(`Current Version: ${detection.currentVersion}`);
  }
  if (detection.dependencySpec) {
    info(`Current Source: ${detection.dependencySpec}`);
  } else if (detection.realPath) {
    info(`Current Source: ${detection.realPath}`);
  }
  info(`Action: ${plan.action}`);
  info(`Summary: ${plan.summary}`);
  info(`Dependency Impact: ${plan.dependencyImpact}`);
  info("Aftercare: rebootstrap + verify without Codex auto-launch");
  const applyParts = ["kfc", "client", "update", ...buildProjectTargetArgs(parsed.project)];
  if (parsed.from) {
    applyParts.push("--from", parsed.from);
  }
  applyParts.push("--apply");
  info(`Apply Command: ${applyParts.map(shellEscapeLiteral).join(" ")}`);
  if (plan.action === "blocked") {
    info(`Recovery: ${buildUpdateManualRecovery(parsed, detection.sourceType === "link" ? "link" : "blocked")}`);
  }
}

async function installClientPackageFromSpec(projectDir, spec, dependencyBucket) {
  const packageName = loadPackageName();
  const installSpec = isGitSpec(spec)
    ? `${packageName}@${spec}`
    : spec;
  const args = ["install"];
  if (!dependencyBucket) {
    args.push("--no-save");
  } else if (dependencyBucket === "devDependencies") {
    args.push("-D");
  } else if (dependencyBucket === "optionalDependencies") {
    args.push("-O");
  }
  args.push(installSpec);
  return runNodeNpmNoThrow(args, projectDir);
}

async function applyClientUpdate(parsed, detection, plan) {
  if (plan.action === "blocked") {
    error(`Update blocked: ${plan.summary}`);
    info(`Recovery: ${buildUpdateManualRecovery(parsed, detection.sourceType === "link" ? "link" : "blocked")}`);
    return 1;
  }

  info(`Source Type: ${plan.sourceType}`);
  info(`Action: ${plan.action}`);

  if (plan.action === "reinstall") {
    const install = await installClientPackageFromSpec(parsed.project, plan.targetSpec, detection.dependencyBucket);
    if (!install.ok) {
      error(`Update install failed. stdout: ${install.stdout.trim() || "<empty>"} stderr: ${install.stderr.trim() || "<empty>"}`);
      info(`Recovery: ${buildUpdateManualRecovery(parsed, "blocked")}`);
      return 1;
    }
  }

  const result = await runBootstrapWithSmartRecovery(
    {
      ...parsed,
      force: true,
      noLaunchCodex: true
    },
    {
      printPass: false,
      suppressSuccessHints: true
    }
  );
  if (result.code !== 0) {
    error("Update rebootstrap failed.");
    info("Recovery: kfc client doctor --fix");
    return result.code;
  }

  info("Update Status: PASS");
  info(`Source Type: ${plan.sourceType}`);
  info(`Action: ${plan.action}`);
  info("Aftercare: bootstrap + verify completed without Codex auto-launch.");
  printClientDocsHints(parsed.project);
  return 0;
}

async function ensureProjectConfig({ projectDir, explicitProfile, force }) {
  const configPath = getConfigPath(projectDir);
  const resourceHint = resolveClientResourcesHint(projectDir);

  if (!fs.existsSync(configPath)) {
    const config = defaultConfig();
    const selectedProfile = determineProfile(explicitProfile, config);
    config.codex.rulesProfile = selectedProfile;
    config.paths.resourcesDir = resourceHint;
    info(`Config optional: using bundled defaults for bootstrap (${configPath} not present).`);
    return { configPath, configData: config, selectedProfile, changed: false, source: "default" };
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
  } catch {
    const fallbackResourceHint = resolveBundledResourcesDir(projectDir);
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

  return { configPath, configData: config, selectedProfile, changed, source: "file" };
}
async function ensurePlanUi(projectDir) {
  const kfcPlanBin = path.join(
    projectDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kfc-plan.cmd" : "kfc-plan"
  );
  if (fs.existsSync(kfcPlanBin)) {
    info("KFC Plan dependency already available.");
    return;
  }

  if (fs.existsSync(REPO_KFC_PLAN_BIN)) {
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

async function ensureProjectSkills({ projectDir }) {
  const targetDir = getProjectSkillsTargetDir(projectDir);
  const artifactPath = resolveClientSkillArtifactPath(projectDir);
  const result = await syncSkillsArtifacts({
    sourceDir: getSkillsSourceDir(getRepoRootDir()),
    targetDir,
    includeSkills: [CLIENT_RUNTIME_SKILL],
    force: true
  });

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Skill sync did not produce runtime artifact: ${artifactPath}`);
  }

  info(`Project-local skill synced: ${artifactPath}`);
  return {
    changed: result.copied > 0,
    targetDir,
    artifactPath
  };
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
      `KFC Plan health check failed at ${healthUrl}. stdout: ${stdout.trim() || "<empty>"} stderr: ${stderr.trim() || "<empty>"}`
    );
  }
}

async function runBootstrapOnce(options, runtime: ClientBootstrapRuntime = {}, inspection?: ClientInspectionSummary) {
  const preflightOk = await assertProjectPreflight(options.project, { requirePackageJson: false });
  if (!preflightOk) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED,
      "Client preflight checks failed.",
      "kfc client doctor --fix"
    );
  }

  const inspectionSummary = inspection || await inspectClientProject(options.project, options);
  const packageJsonResult = await ensureProjectPackageJsonForBootstrap(options.project);
  if (packageJsonResult.created) {
    info("Client project was auto-initialized from an empty folder.");
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
      "kfc client bootstrap --force"
    );
  }

  try {
    await ensurePlanUi(options.project);
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --force"
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
      "kfc client bootstrap --force"
    );
  }

  try {
    await ensureProjectSkills({
      projectDir: options.project
    });
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --force"
    );
  }

  try {
    await ensureClientGitignoreEntries(options.project);
    await ensureClientCodexBinding(options.project);
    await ensureClientAgentsContract(options.project);
    await ensureClientLessonsScaffold(options.project);
  } catch (err) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.PRIVATE_STATE_FAILED,
      err instanceof Error ? err.message : String(err),
      "kfc client bootstrap --force"
    );
  }

  const doctorCode = await runDoctor({ cwd: options.project, args: [] });
  if (doctorCode !== 0) {
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.DOCTOR_FAILED,
      "`kfc doctor` failed.",
      "kfc client doctor --fix"
    );
  }

  let planState;
  try {
    planState = await ensureClientActivePlan(options.project);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("plan validate")) {
      throw createClientOnboardingError(
        CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED,
        message,
        "kfc plan validate"
      );
    }
    throw createClientOnboardingError(
      CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED,
      message,
      "kfc flow ensure-plan"
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
        "kfc client bootstrap --force --skip-serve-check"
      );
    }
    info(`Health check OK: http://127.0.0.1:${options.port}/api/health`);
  }

  info("Client bootstrap completed successfully.");
  if (!runtime.suppressSuccessHints) {
    printClientDocsHints(options.project);
    printClientNextCommandHints(planState);
    info("Manual cleanup fallback: kfc client done");
    info("Next steps in this client repo should use `kfc ...` commands.");
  }

  return {
    autoInitializedPackageJson: packageJsonResult.created,
    inspection: inspectionSummary,
    planState
  } satisfies ClientBootstrapOutcome;
}
async function runBootstrapWithSmartRecovery(options, runtime: ClientBootstrapRuntime = {}) {
  const shouldPrintPass = runtime.printPass !== false;
  const inspection = await inspectClientProject(options.project, options);
  const inspectionPayload = {
    status: inspection.inspectionStatus,
    stage: CLIENT_ONBOARDING_STAGES.INSPECT,
    error_code: inspection.inspectionStatus === "BLOCK" ? CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING : "CLIENT_ONBOARDING_INSPECTED",
    reason: inspection.reason,
    recovery: inspection.recovery,
    next: inspection.next,
    inspection_status: inspection.inspectionStatus,
    repo_shape: inspection.repoShape,
    planned_changes: inspection.plannedChangesSummary,
    apply_mode: inspection.applyMode
  };
  await emitClientOnboardingEvent(options.project, inspectionPayload);
  printClientInspectionSummary(inspection, inspection.inspectionStatus === "BLOCK");
  if (inspection.inspectionStatus === "BLOCK") {
    const blockPayload = classifyClientOnboardingFailure(
      createClientOnboardingError(
        CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING,
        inspection.reason,
        inspection.recovery,
        {
          next: inspection.next,
          stage: CLIENT_ONBOARDING_STAGES.INSPECT
        }
      ),
      { projectDir: options.project }
    );
    await emitClientOnboardingEvent(options.project, {
      ...blockPayload,
      inspection_status: inspection.inspectionStatus,
      repo_shape: inspection.repoShape,
      planned_changes: inspection.plannedChangesSummary,
      apply_mode: inspection.applyMode
    });
    printClientOnboardingPayload(blockPayload, true);
    return { code: 1, recoveryUsed: false };
  }

  await emitClientOnboardingEvent(
    options.project,
    buildClientOnboardingProgressPayload(
      CLIENT_ONBOARDING_STAGES.BOOTSTRAP,
      "Running client bootstrap checks.",
      "kfc client doctor --fix",
      { projectDir: options.project }
    )
  );
  try {
    const bootstrapResult = await runBootstrapOnce(options, runtime, inspection);
    const payload = buildClientOnboardingPassPayload({
      recoveryUsed: false,
      reason: bootstrapResult.planState.summary,
      next: bootstrapResult.planState.next,
      next_steps: bootstrapResult.planState.nextSteps
    }, { projectDir: options.project });
    await emitClientOnboardingEvent(options.project, payload);
    if (shouldPrintPass) {
      printClientOnboardingPass(payload);
    }
    return { code: 0, recoveryUsed: false, inspection: bootstrapResult.inspection, planState: bootstrapResult.planState };
  } catch (initialErr) {
    const first = classifyClientOnboardingFailure(initialErr, { projectDir: options.project });
    await emitClientOnboardingEvent(options.project, first);
    if (first.retry_mode === "manual") {
      printClientOnboardingPayload(first, true);
      return { code: 1, recoveryUsed: false };
    }
    if (
      first.error_code === CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED ||
      first.error_code === CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING
    ) {
      printClientOnboardingPayload(first, true);
      return { code: 1, recoveryUsed: false };
    }
    warn(
      `Onboarding bootstrap blocked (${first.error_code}). Running one smart recovery cycle via \`kfc client doctor --fix\`.`
    );
    await emitClientOnboardingEvent(
      options.project,
      buildClientOnboardingProgressPayload(
        CLIENT_ONBOARDING_STAGES.BOOTSTRAP,
        `Running smart recovery after ${first.error_code}.`,
        "kfc client doctor --fix",
        { projectDir: options.project }
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
          "kfc client doctor --fix"
        ),
        { projectDir: options.project }
      );
      await emitClientOnboardingEvent(options.project, blockPayload);
      printClientOnboardingPayload(blockPayload, true);
      return { code: 1, recoveryUsed: false };
    }

    try {
      const bootstrapResult = await runBootstrapOnce({ ...options, force: true }, runtime, inspection);
      const payload = buildClientOnboardingPassPayload({
        recoveryUsed: true,
        reason: bootstrapResult.planState.summary,
        next: bootstrapResult.planState.next,
        next_steps: bootstrapResult.planState.nextSteps
      }, { projectDir: options.project });
      await emitClientOnboardingEvent(options.project, payload);
      if (shouldPrintPass) {
        printClientOnboardingPass(payload);
      }
      return { code: 0, recoveryUsed: true, inspection: bootstrapResult.inspection, planState: bootstrapResult.planState };
    } catch (retryErr) {
      const blockPayload = classifyClientOnboardingFailure(retryErr, { projectDir: options.project });
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
    printClientOnboardingBlock(err, { projectDir: options.project });
    return 1;
  }

  info("Re-running client diagnostics after remediation.");
  const postFixOk = await runClientDoctorChecks(options);
  return postFixOk ? 0 : 1;
}

async function runClientStatus(options) {
  const summary = await describeClientStatus(options.project, options);
  printClientStatusSummary(summary);
  printClientDocsHints(options.project);
  if (summary.status !== "BLOCK") {
  info("Client status is read-only. Use `kfc client`, `kfc client doctor --fix`, or `kfc client update` only when action is needed.");
  }
  return summary.status === "BLOCK" ? 1 : 0;
}

async function runClientDoctorChecks(options) {
  let ok = await assertProjectPreflight(options.project);
  if (!ok) {
    return false;
  }

  try {
    const raw = await readConfigOrDefault(options.project);
    const validationErrors = validateConfig(raw.data);
    if (validationErrors.length > 0) {
      for (const msg of validationErrors) {
        error(`Invalid config: ${msg}`);
      }
      ok = false;
    } else {
      const configLabel = raw.source === "file"
        ? `Config schema OK: ${raw.configPath}`
        : `Config optional: using bundled defaults (${raw.configPath} not present).`;
      info(configLabel);
      const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
      await assertReadableDirectory(resourcesDir);
      info(`Resources directory OK: ${resourcesDir}`);
    }
  } catch (err) {
    error(`Config check failed: ${err instanceof Error ? err.message : String(err)}`);
    ok = false;
  }

  const kfcPlanBin = path.join(
    options.project,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kfc-plan.cmd" : "kfc-plan"
  );
  if (!fs.existsSync(kfcPlanBin) && !fs.existsSync(REPO_KFC_PLAN_BIN)) {
    error(`Missing KFC Plan binary: ${kfcPlanBin}`);
    ok = false;
  } else {
    info(
      fs.existsSync(kfcPlanBin)
        ? `KFC Plan binary OK: ${kfcPlanBin}`
        : `KFC Plan fallback OK: ${REPO_KFC_PLAN_BIN}`
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

  const codexConfigPath = getClientCodexConfigPath(options.project);
  if (!fs.existsSync(codexConfigPath)) {
    error(`Missing client-local Codex binding: ${codexConfigPath}`);
    ok = false;
  } else {
    info(`Client-local Codex binding OK: ${codexConfigPath}`);
  }
  if (hasClientRulesActivation(options.project)) {
    info(`Client-local KFC rules active: ${rulesPath}`);
  }

  const skillPath = resolveClientSkillArtifactPath(options.project);
  if (!fs.existsSync(skillPath)) {
    error(`Missing project-local KFC skill: ${skillPath}`);
    ok = false;
  } else {
    info(`Project-local KFC skill OK: ${skillPath}`);
  }

  const agentsPath = resolveClientAgentsPath(options.project);
  if (!fs.existsSync(agentsPath)) {
    error(`Missing client AGENTS.md: ${agentsPath}`);
    ok = false;
  } else {
    const agentsText = await fsp.readFile(agentsPath, "utf8");
    if (!hasClientAgentsManagedBlock(agentsText)) {
      error(`Missing managed KFC block in client AGENTS.md: ${agentsPath}`);
      ok = false;
    } else {
      info(`Client AGENTS.md OK: ${agentsPath}`);
    }
  }

  const lessonsPath = resolveClientLessonsPath(options.project);
  if (!fs.existsSync(lessonsPath)) {
    error(`Missing client lessons file: ${lessonsPath}`);
    ok = false;
  } else {
    info(`Client lessons file OK: ${lessonsPath}`);
  }

  const rawLessons = resolveClientRawLessonPaths(options.project);
  if (!fs.existsSync(rawLessons.incidentsDir) || !fs.existsSync(rawLessons.decisionsDir)) {
    error(`Missing raw lesson directories under: ${rawLessons.baseDir}`);
    ok = false;
  } else {
    info(`Raw lesson directories OK: ${rawLessons.baseDir}`);
  }

  const gitignorePath = path.join(options.project, ".gitignore");
  const gitignoreText = fs.existsSync(gitignorePath) ? await fsp.readFile(gitignorePath, "utf8") : "";
  const missingIgnoreEntries = CLIENT_GITIGNORE_ENTRIES.filter((entry) => !gitignoreText.includes(entry));
  if (missingIgnoreEntries.length > 0) {
    error(`Missing private gitignore entries in ${gitignorePath}: ${missingIgnoreEntries.join(", ")}`);
    ok = false;
  } else {
    info(`Private gitignore entries OK: ${gitignorePath}`);
  }

  let planState = null;
  if (ok) {
    try {
      planState = await describeClientPlanState(options.project);
    } catch (err) {
      if (isMissingActivePlanError(err)) {
        try {
          planState = await ensureClientActivePlan(options.project);
          info(`Recovered missing active plan automatically: ${planState.planPath}`);
        } catch (recoverErr) {
          error(`Active plan recovery failed: ${recoverErr instanceof Error ? recoverErr.message : String(recoverErr)}`);
          ok = false;
        }
      } else {
        error(`Plan state check failed: ${err instanceof Error ? err.message : String(err)}`);
        ok = false;
      }
    }
  }

  if (ok && planState) {
    printClientDocsHints(options.project);
    printClientNextCommandHints(planState);
    info("Manual cleanup fallback: kfc client done");
    info("Client diagnostics completed. Continue using `kfc ...` commands in this project.");
  }

  return ok;
}
async function runClientStart(options) {
  const bootstrap = await runBootstrapWithSmartRecovery(options, {
    printPass: false,
    suppressSuccessHints: true
  });
  return await runClientReadyHandoff(options, bootstrap);
}

async function runClientReadyHandoff(options, bootstrap) {
  if (bootstrap.code !== 0) {
    return bootstrap.code;
  }

  let ready;
  try {
    ready = await createClientReadyArtifacts({
      projectDir: options.project,
      force: options.force,
      goal: options.goal,
      profileName: options.profile || "client",
      inspection: bootstrap.planState ? bootstrap.inspection : await inspectClientProject(options.project, options)
    });
  } catch (err) {
    const blockPayload = classifyClientOnboardingFailure(
      createClientOnboardingError(
        CLIENT_ONBOARDING_CODES.READY_ARTIFACT_FAILED,
        err instanceof Error ? err.message : String(err),
        "kfc flow ensure-plan"
      ),
      { projectDir: options.project }
    );
    await emitClientOnboardingEvent(options.project, blockPayload);
    printClientOnboardingPayload(blockPayload, true);
    return 1;
  }

  let manualCommand = buildClientCodexManualCommand({
    skipGitRepoCheck: options.skipGitRepoCheck
  });
  let launchResult = null;
  let completion = null;
  const goalCommand = CLIENT_GOAL_GUIDANCE_COMMAND;

  if (!options.noLaunchCodex && !ready.hasRealMission) {
    const noGoalPayload = buildClientOnboardingPassPayload({
      recoveryUsed: bootstrap.recoveryUsed,
      stage: CLIENT_ONBOARDING_STAGES.READY_BRIEF,
      reason: `Client onboarding handoff artifacts are ready. No mission goal was provided yet, so Codex auto-run was skipped. ${ready.planState.summary}`,
      next: goalCommand,
      next_steps: [
        goalCommand,
        "Or continue planning manually from the active draft plan without rerunning."
      ]
    }, { projectDir: options.project });
    await emitClientOnboardingEvent(options.project, {
      ...noGoalPayload,
      inspection_status: ready.inspection.inspectionStatus,
      repo_shape: ready.inspection.repoShape,
      planned_changes: ready.inspection.plannedChangesSummary,
      apply_mode: ready.inspection.applyMode
    });
    printClientOnboardingPass(noGoalPayload);
    info(`Stable contract: ${path.join(options.project, CLIENT_AGENTS_FILE)}`);
    info(`Ready file: ${ready.readyPath}`);
    info(ready.reusedExisting ? "Reusing existing KFC handoff." : "Prepared a fresh KFC handoff.");
    info("Codex auto-launch skipped because no real mission is available yet.");
    info("Manual cleanup fallback: kfc client done");
    return 0;
  }

  if (!options.noLaunchCodex) {
    await emitClientOnboardingEvent(
      options.project,
      buildClientOnboardingProgressPayload(
        CLIENT_ONBOARDING_STAGES.EXECUTION_READY,
        ready.reusedExisting
          ? "Reusing existing KFC handoff and waiting for Codex completion."
          : "Launching Codex and waiting for setup completion.",
        "Wait for Codex completion.",
        { projectDir: options.project }
      )
    );
    const launchAttempt = await runClientCodexLaunch({
      projectDir: options.project,
      planId: ready.planId,
      skipGitRepoCheck: options.skipGitRepoCheck
    });
    launchResult = launchAttempt.result;
    manualCommand = launchAttempt.manualCommand;

    if (launchResult && launchResult.status !== "completed" && isTrustDirectoryFailure(launchResult)) {
      info(`Trust check requested. Trying skip-git-repo fallback: ${CLIENT_CODEX_SKIP_TRUST_CHECK_OPTION}.`);
    }

    if (launchResult?.status === "completed") {
      completion = await evaluateClientSetupCompletion(options.project, ready.planId);
    }
  }

  const launchSucceeded = launchResult?.status === "completed";
  const planStateSteps = ready.planState.nextSteps;
  const handoffNext = options.noLaunchCodex
    ? manualCommand
    : launchSucceeded
      ? "Follow the plan-state handoff in .kfc/CODEX_READY.md."
      : manualCommand;
  const readyEvent = options.noLaunchCodex
    ? {
        ...buildClientOnboardingPassPayload({
          recoveryUsed: bootstrap.recoveryUsed,
          reason: ready.planState.summary,
          next: handoffNext,
          next_steps: [manualCommand, ...planStateSteps]
        }, { projectDir: options.project }),
        stage: CLIENT_ONBOARDING_STAGES.READY_BRIEF,
        reason: `Client onboarding handoff artifacts are ready. ${ready.planState.summary}`,
        next: handoffNext,
        inspection_status: ready.inspection.inspectionStatus,
        repo_shape: ready.inspection.repoShape,
        planned_changes: ready.inspection.plannedChangesSummary,
        apply_mode: ready.inspection.applyMode
      }
    : {
        ...buildClientOnboardingProgressPayload(
          CLIENT_ONBOARDING_STAGES.READY_BRIEF,
          ready.reusedExisting
            ? `Client onboarding handoff artifacts were refreshed from an existing brief. ${ready.planState.summary}`
            : `Client onboarding handoff artifacts are ready. ${ready.planState.summary}`,
          "Wait for Codex completion.",
          { projectDir: options.project }
        ),
        inspection_status: ready.inspection.inspectionStatus,
        repo_shape: ready.inspection.repoShape,
        planned_changes: ready.inspection.plannedChangesSummary,
        apply_mode: ready.inspection.applyMode
      };
  await emitClientOnboardingEvent(options.project, readyEvent);
  if (options.noLaunchCodex) {
    printClientOnboardingPass(readyEvent);
  } else {
    printClientOnboardingPayload(readyEvent, false);
  }
  info(`Stable contract: ${path.join(options.project, CLIENT_AGENTS_FILE)}`);
  info(`Ready file: ${ready.readyPath}`);
  info(ready.reusedExisting ? "Reusing existing KFC handoff." : "Prepared a fresh KFC handoff.");
  if (options.noLaunchCodex) {
    info("Codex auto-launch skipped (--no-launch-codex).");
    info(`Manual start: ${manualCommand}`);
    info("Manual cleanup fallback: kfc client done");
    return 0;
  }

  printClientCodexLaunchOutcome(launchResult, manualCommand);
  if (!launchSucceeded) {
      const blockPayload = classifyClientOnboardingFailure(
        createClientOnboardingError(
          CLIENT_ONBOARDING_CODES.CODEX_LAUNCH_FAILED,
        `Codex auto-run failed. ${launchResult?.failure_signature || launchResult?.stderr_tail || "No completion evidence."}`,
        manualCommand,
        {
          next: manualCommand,
          stage: CLIENT_ONBOARDING_STAGES.EXECUTION_READY
        }
      ),
      { projectDir: options.project }
    );
    await emitClientOnboardingEvent(options.project, {
      ...blockPayload,
      inspection_status: ready.inspection.inspectionStatus,
      repo_shape: ready.inspection.repoShape,
      planned_changes: ready.inspection.plannedChangesSummary,
      apply_mode: ready.inspection.applyMode
    });
    printClientOnboardingPayload(blockPayload, true);
    info("Ready handoff preserved for recovery.");
    return 1;
  }

  if (!completion?.complete) {
      const blockPayload = classifyClientOnboardingFailure(
        createClientOnboardingError(
          CLIENT_ONBOARDING_CODES.SETUP_INCOMPLETE,
        completion?.reason || "Setup completion is still incomplete. KFC could not confirm archived done state.",
        "kfc client",
        {
          next: "kfc client",
          stage: CLIENT_ONBOARDING_STAGES.EXECUTION_READY
        }
      ),
      { projectDir: options.project }
    );
    await emitClientOnboardingEvent(options.project, {
      ...blockPayload,
      inspection_status: ready.inspection.inspectionStatus,
      repo_shape: ready.inspection.repoShape,
      planned_changes: ready.inspection.plannedChangesSummary,
      apply_mode: ready.inspection.applyMode
    });
    printClientOnboardingPayload(blockPayload, true);
    info("Ready handoff preserved for recovery.");
    return 1;
  }

  if (completion.completion === "ready_for_work") {
    const workPayload = buildClientOnboardingPassPayload({
      recoveryUsed: bootstrap.recoveryUsed,
      stage: CLIENT_ONBOARDING_STAGES.EXECUTION_READY,
      reason: completion.reason,
      next: completion.nextAction || planStateSteps[0] || "kfc flow ready",
      next_steps: Array.isArray(completion.nextSteps) && completion.nextSteps.length > 0
        ? completion.nextSteps
        : planStateSteps
    }, { projectDir: options.project });
    await emitClientOnboardingEvent(options.project, {
      ...workPayload,
      inspection_status: ready.inspection.inspectionStatus,
      repo_shape: ready.inspection.repoShape,
      planned_changes: ready.inspection.plannedChangesSummary,
      apply_mode: ready.inspection.applyMode
    });
    printClientOnboardingPass(workPayload);
    info("Ready handoff preserved for recovery.");
    return 0;
  }

  try {
    await runClientDone(options);
  } catch (err) {
      const blockPayload = classifyClientOnboardingFailure(
        createClientOnboardingError(
          CLIENT_ONBOARDING_CODES.AUTO_CLEANUP_FAILED,
        `Automatic cleanup failed after archived done proof. ${err instanceof Error ? err.message : String(err)}`,
        "kfc client done",
        {
          next: "kfc client done",
          stage: CLIENT_ONBOARDING_STAGES.DONE
        }
      ),
      { projectDir: options.project }
    );
    await emitClientOnboardingEvent(options.project, {
      ...blockPayload,
      inspection_status: ready.inspection.inspectionStatus,
      repo_shape: ready.inspection.repoShape,
      planned_changes: ready.inspection.plannedChangesSummary,
      apply_mode: ready.inspection.applyMode
    });
    printClientOnboardingPayload(blockPayload, true);
    return 1;
  }

  const donePayload = buildClientOnboardingPassPayload({
    recoveryUsed: bootstrap.recoveryUsed,
    stage: CLIENT_ONBOARDING_STAGES.DONE,
    reason: `Client setup completed and cleanup was applied automatically. ${completion.reason}`,
    next: "kfc client",
    next_steps: ["kfc client"]
  }, { projectDir: options.project });
  await emitClientOnboardingEvent(options.project, {
    ...donePayload,
    inspection_status: ready.inspection.inspectionStatus,
    repo_shape: ready.inspection.repoShape,
    planned_changes: ready.inspection.plannedChangesSummary,
    apply_mode: ready.inspection.applyMode
  });
  printClientOnboardingPass(donePayload);
  info("Ready handoff cleaned automatically.");
  return 0;
}

async function runClientDone(options) {
  const readyPath = resolveClientReadyPath(options.project);
  const sessionPath = resolveClientSessionPath(options.project);
  const agentsPath = resolveClientAgentsPath(options.project);
  const removedReady = await removeIfExists(readyPath);
  const removedSession = await removeIfExists(sessionPath);

  if (fs.existsSync(agentsPath) && (removedReady || removedSession)) {
    await ensureClientAgentsContract(options.project);
  }

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

async function runClientUpdate(options) {
  const detection = await detectClientInstallSource(options.project);
  const plan = buildClientUpdatePlan(options, detection);

  if (!options.apply) {
    printClientUpdatePreview(options, detection, plan);
    return 0;
  }

  return await applyClientUpdate(options, detection, plan);
}

export async function runClient(options) {
  const parsed = await parseArgs(options.cwd, options.args);

  if (parsed.subcommand === "help" || parsed.subcommand === "--help" || parsed.subcommand === "-h") {
    usage();
    return 0;
  }

  if (parsed.subcommand === "start") {
    try {
      return await runClientStart(parsed);
    } catch (err) {
      const blockPayload = classifyClientOnboardingFailure(err, { projectDir: parsed.project });
      await emitClientOnboardingEvent(parsed.project, blockPayload);
      printClientOnboardingPayload(blockPayload, true);
      return 1;
    }
  }

  if (parsed.subcommand === "doctor") {
    return await runClientDoctorOnly(parsed);
  }

  if (parsed.subcommand === "status") {
    try {
      return await runClientStatus(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "bootstrap") {
    const result = await runBootstrapWithSmartRecovery(parsed, {
      printPass: false,
      suppressSuccessHints: true
    });
    return await runClientReadyHandoff(parsed, result);
  }

  if (parsed.subcommand === "done") {
    try {
      return await runClientDone(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "update" || parsed.subcommand === "upgrade") {
    try {
      return await runClientUpdate(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "lessons") {
    try {
      return await runClientLessons(parsed);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  error(`Unknown client subcommand: ${parsed.subcommand}`);
  usage();
  return 1;
}






















