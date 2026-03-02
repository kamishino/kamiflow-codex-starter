import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const RULES_FILE_NAME = "kamiflow.rules";
const DEFAULT_RULES_PROFILE = "client";
const VALID_RULES_PROFILES = ["dogfood", "client"];
const SKILLS_SOURCE = path.join(ROOT_DIR, "resources", "skills");
const SKILLS_TARGET = path.join(ROOT_DIR, ".agents", "skills");
const BASE_RULES_SOURCE = path.join(ROOT_DIR, "resources", "rules", "base.rules");
const PROFILE_RULES_DIR = path.join(ROOT_DIR, "resources", "rules", "profiles");

const args = process.argv.slice(2);
const force = process.argv.includes("--force");
const only = readFlag("--only", "all");
const scope = readFlag("--scope", "all");
const projectArg = readFlag("--project", "");
const profileArg = readFlag("--profile", "");
const shouldSyncRules = only === "all" || only === "rules";
const rulesProfile = shouldSyncRules ? resolveRulesProfile() : "n/a";
const total = { copied: 0, skipped: 0 };
const stats = {
  skills: { copied: 0, skipped: 0 },
  rules: { copied: 0, skipped: 0 }
};

if (!["all", "skills", "rules"].includes(only)) {
  throw new Error(`Invalid --only value: ${only}. Use one of: all, skills, rules.`);
}

if (!["all", "repo", "project", "home"].includes(scope)) {
  throw new Error(`Invalid --scope value: ${scope}. Use one of: all, repo, project, home.`);
}

console.log(
  `[codex-sync] Starting sync (only=${only}, scope=${scope}, profile=${rulesProfile}, force=${force ? "on" : "off"})`
);

if (only === "all" || only === "skills") {
  syncSkills();
}

if (only === "all" || only === "rules") {
  syncRules();
}

console.log(`[codex-sync] Skills copied: ${stats.skills.copied}`);
console.log(`[codex-sync] Skills skipped: ${stats.skills.skipped}`);
console.log(`[codex-sync] Rules copied: ${stats.rules.copied}`);
console.log(`[codex-sync] Rules skipped: ${stats.rules.skipped}`);
console.log(`[codex-sync] Copied files: ${total.copied}`);
console.log(`[codex-sync] Skipped files: ${total.skipped}`);

function readFlag(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return fallback;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function validateProfileName(name, source) {
  if (!VALID_RULES_PROFILES.includes(name)) {
    throw new Error(
      `Invalid rules profile from ${source}: ${name}. Use one of: ${VALID_RULES_PROFILES.join(", ")}.`
    );
  }
  return name;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (err) {
      throw onEperm(err, dirPath);
    }
  }
}

function shouldSkipFile(name) {
  return name === ".gitkeep" || name === "README.md";
}

function copyRecursiveSkills(fromDir, toDir) {
  ensureDir(toDir);
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipFile(entry.name)) {
      continue;
    }

    const fromPath = path.join(fromDir, entry.name);
    const toPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyRecursiveSkills(fromPath, toPath);
      continue;
    }

    if (fs.existsSync(toPath) && !force) {
      total.skipped += 1;
      stats.skills.skipped += 1;
      continue;
    }

    ensureDir(path.dirname(toPath));
    try {
      fs.copyFileSync(fromPath, toPath);
    } catch (err) {
      throw onEperm(err, toPath);
    }
    total.copied += 1;
    stats.skills.copied += 1;
  }
}

function syncSkills() {
  if (!fs.existsSync(SKILLS_SOURCE)) {
    console.log(`[codex-sync] Skip missing source: ${SKILLS_SOURCE}`);
    return;
  }

  copyRecursiveSkills(SKILLS_SOURCE, SKILLS_TARGET);
}

function resolveCodexHome() {
  if (process.env.CODEX_HOME && process.env.CODEX_HOME.trim().length > 0) {
    return path.resolve(process.env.CODEX_HOME.trim());
  }
  return path.join(os.homedir(), ".codex");
}

function resolveProjectDir() {
  const projectDir = projectArg ? path.resolve(process.cwd(), projectArg) : process.cwd();
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    throw new Error(`Project directory does not exist or is not a directory: ${projectDir}`);
  }
  return projectDir;
}

function readConfigProfile(projectDir) {
  const configPath = path.join(projectDir, "kamiflow.config.json");
  if (!fs.existsSync(configPath)) {
    return "";
  }

  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw onEperm(err, configPath);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const profile = parsed?.codex?.rulesProfile;
  if (profile === undefined) {
    return "";
  }
  if (typeof profile !== "string" || profile.trim().length === 0) {
    throw new Error(`Invalid codex.rulesProfile in ${configPath}: expected non-empty string.`);
  }

  return validateProfileName(profile.trim(), configPath);
}

function resolveRulesProfile() {
  if (profileArg) {
    return validateProfileName(profileArg, "--profile");
  }

  const configProfile = readConfigProfile(resolveProjectDir());
  if (configProfile) {
    return configProfile;
  }

  return DEFAULT_RULES_PROFILE;
}

function buildRuleTargets() {
  const scopes = scope === "all" ? ["repo", "project", "home"] : [scope];
  const targets = new Set();

  for (const selectedScope of scopes) {
    if (selectedScope === "repo") {
      targets.add(path.join(ROOT_DIR, ".codex", "rules", RULES_FILE_NAME));
      continue;
    }

    if (selectedScope === "project") {
      targets.add(path.join(resolveProjectDir(), ".codex", "rules", RULES_FILE_NAME));
      continue;
    }

    if (selectedScope === "home") {
      targets.add(path.join(resolveCodexHome(), "rules", RULES_FILE_NAME));
      continue;
    }
  }

  return [...targets];
}

function buildManagedRulesContent(sourceText) {
  const sources = [
    path.relative(ROOT_DIR, BASE_RULES_SOURCE).split(path.sep).join("/"),
    path.join("resources", "rules", "profiles", `${rulesProfile}.rules`).split(path.sep).join("/")
  ];

  const header = [
    "# Generated by scripts/codex/sync-resources-to-agents.mjs",
    `# Profile: ${rulesProfile}`,
    `# Source: ${sources.join(" + ")}`,
    `# Generated at (UTC): ${new Date().toISOString()}`,
    "# DO NOT EDIT THIS FILE DIRECTLY.",
    "# Edit resources/rules/base.rules and resources/rules/profiles/*.rules, then run npm run codex:sync -- --only rules --force.",
    ""
  ].join("\n");

  return `${header}\n${sourceText.replace(/^\uFEFF/, "")}`;
}

function profileRulesSource(profileName) {
  return path.join(PROFILE_RULES_DIR, `${profileName}.rules`);
}

function composeRules() {
  if (!fs.existsSync(BASE_RULES_SOURCE)) {
    throw new Error(`Missing base rules file: ${BASE_RULES_SOURCE}`);
  }

  const overlayPath = profileRulesSource(rulesProfile);
  if (!fs.existsSync(overlayPath)) {
    throw new Error(`Missing profile rules file: ${overlayPath}`);
  }

  const baseText = fs.readFileSync(BASE_RULES_SOURCE, "utf8").replace(/^\uFEFF/, "").trimEnd();
  const overlayText = fs.readFileSync(overlayPath, "utf8").replace(/^\uFEFF/, "").trimEnd();

  return [baseText, overlayText].filter(Boolean).join("\n\n") + "\n";
}

function parseDecision(outputText) {
  const match = String(outputText).match(/"decision":"([^"]+)"/);
  return match ? match[1] : "";
}

function runPolicyCheck(tempRulesPath, commandTokens, expectedDecision) {
  const result = spawnSync("codex", ["execpolicy", "check", "--rules", tempRulesPath, ...commandTokens], {
    shell: process.platform === "win32",
    encoding: "utf8"
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        "Cannot run `codex execpolicy check` for rules validation. Ensure Codex CLI is installed and in PATH."
      );
    }
    if (result.error.code === "EPERM") {
      throw new Error(
        "Permission denied running `codex execpolicy check` for rules validation. Run this command in an elevated terminal."
      );
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Rules validation failed for command: ${commandTokens.join(" ")}`,
        `stdout: ${String(result.stdout || "").trim() || "<empty>"}`,
        `stderr: ${String(result.stderr || "").trim() || "<empty>"}`
      ].join("\n")
    );
  }

  const decision = parseDecision(result.stdout);
  if (decision !== expectedDecision) {
    throw new Error(
      [
        `Rules validation decision mismatch for command: ${commandTokens.join(" ")}`,
        `Expected: ${expectedDecision}`,
        `Actual: ${decision || "<unknown>"}`,
        `stdout: ${String(result.stdout || "").trim() || "<empty>"}`,
        `stderr: ${String(result.stderr || "").trim() || "<empty>"}`
      ].join("\n")
    );
  }
}

function validateComposedRules(rulesText) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kamiflow-rules-"));
  const tempRulesPath = path.join(tempDir, RULES_FILE_NAME);

  try {
    fs.writeFileSync(tempRulesPath, rulesText, "utf8");

    runPolicyCheck(tempRulesPath, ["git", "reset", "--hard"], "forbidden");
    runPolicyCheck(
      tempRulesPath,
      ["npm", "run", "dogfood:smoke"],
      rulesProfile === "dogfood" ? "allow" : "prompt"
    );
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function copyManagedRules(toPath, managedRulesContent) {
  if (fs.existsSync(toPath) && !force) {
    total.skipped += 1;
    stats.rules.skipped += 1;
    return;
  }

  const output = buildManagedRulesContent(managedRulesContent);
  ensureDir(path.dirname(toPath));

  try {
    fs.writeFileSync(toPath, output, "utf8");
  } catch (err) {
    throw onEperm(err, toPath);
  }

  total.copied += 1;
  stats.rules.copied += 1;
}

function syncRules() {
  const composedRules = composeRules();
  validateComposedRules(composedRules);

  for (const target of buildRuleTargets()) {
    copyManagedRules(target, composedRules);
  }
}

function onEperm(err, targetPath) {
  if (err && typeof err === "object" && err.code === "EPERM") {
    return new Error(
      `Permission denied writing ${targetPath}. Run this command in an elevated terminal.`
    );
  }
  return err;
}
