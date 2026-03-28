import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLAN_DIR = path.join(".local", "plans");
export const DONE_PLAN_DIR = path.join(PLAN_DIR, "done");
export const PROJECT_BRIEF_PATH = path.join(".local", "project.md");
export const ROOT_AGENTS_PATH = "AGENTS.md";
export const REPO_ROLE_CLIENT = "client";
export const REPO_ROLE_SOURCE = "dog" + "food";
export const RELEASE_POLICY_SECTION = "Release Policy";
export const RELEASE_IMPACT_SECTION = "Release Impact";
export const RELEASE_IMPACT_VALUES = Object.freeze(["none", "patch", "minor", "major"]);
export const DONE_PLAN_KEEP_LATEST = 20;
export const CLEANUP_STALE_AFTER_DAYS = 14;

const DEFAULT_VERSION_FILES = Object.freeze(["package.json", "package-lock.json"]);
const ALLOWED_VERSION_FILES = new Set(DEFAULT_VERSION_FILES);
const ALLOWED_RELEASE_HISTORY = new Set(["separate-release-commit-and-tag"]);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientAgentsTemplatePath = path.join(skillRoot, "assets", "client-agents.md");
const clientProjectBriefTemplatePath = path.join(skillRoot, "assets", "project-brief-client.md");
const sourceProjectBriefTemplatePath = path.join(skillRoot, "assets", "project-brief-" + "dog" + "food.md");
const CLIENT_REPO_CONTRACT_HEADINGS = Object.freeze([
  "# Repo Contract",
  "## Ownership",
  "## Command Boundary",
  "## Release Policy",
  "## Working Rules",
  "## Safety"
]);
const PROJECT_BRIEF_HEADINGS = Object.freeze([
  "# Project Brief",
  "## Product Summary",
  "## Current Priorities",
  "## Architecture Guardrails",
  "## Open Questions",
  "## Recent Decisions"
]);

export async function ensureSkillWorkspace(projectDir) {
  const dirs = [
    path.join(projectDir, PLAN_DIR),
    path.join(projectDir, DONE_PLAN_DIR)
  ];
  for (const dirPath of dirs) {
    await fsp.mkdir(dirPath, { recursive: true });
  }
  return dirs;
}

export async function detectRepoRole(projectDir) {
  let score = 0;
  const packageJsonPath = path.join(projectDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, "utf8"));
      if (packageJson?.name === "@kamishino/kamiflow-core") {
        score += 1;
      }
    } catch {
      // Ignore malformed package.json files for role detection and fall back to other markers.
    }
  }

  if (fs.existsSync(path.join(projectDir, "resources", "skills", "kamiflow-core", "SKILL.md"))) {
    score += 1;
  }

  if (fs.existsSync(path.join(projectDir, "scripts", "skill-doctor.mjs")) && fs.existsSync(path.join(projectDir, "bin", "kamiflow-core.js"))) {
    score += 1;
  }

  return score >= 2 ? REPO_ROLE_SOURCE : REPO_ROLE_CLIENT;
}

export function projectBriefAssetRelativeForRole(role) {
  return role === REPO_ROLE_SOURCE
    ? path.join("assets", "project-brief-" + "dog" + "food.md")
    : path.join("assets", "project-brief-client.md");
}

export function repoContractKindForRole(role) {
  return role === REPO_ROLE_SOURCE ? "tracked-source" : "generated-local";
}

export async function ensureRepoRuntimeState(projectDir) {
  await ensureSkillWorkspace(projectDir);
  const role = await detectRepoRole(projectDir);
  const repoContract = await ensureRepoContract(projectDir, role);
  const projectBrief = await ensureProjectBrief(projectDir, role);
  return {
    role,
    repoContract,
    projectBrief
  };
}

export async function ensureRepoContract(projectDir, role = null) {
  const resolvedRole = role || await detectRepoRole(projectDir);
  const repoContractPath = path.join(projectDir, ROOT_AGENTS_PATH);

  if (resolvedRole === REPO_ROLE_SOURCE) {
    return {
      path: repoContractPath,
      created: false,
      preserved: fs.existsSync(repoContractPath),
      excluded: false,
      kind: repoContractKindForRole(resolvedRole)
    };
  }

  await fsp.mkdir(path.dirname(repoContractPath), { recursive: true });
  const alreadyExists = fs.existsSync(repoContractPath);
  if (!alreadyExists) {
    const template = await fsp.readFile(clientAgentsTemplatePath, "utf8");
    await fsp.writeFile(repoContractPath, normalizeText(template), "utf8");
  }

  const excluded = !alreadyExists ? await ensureGitExcludeEntry(projectDir, ROOT_AGENTS_PATH) : false;
  return {
    path: repoContractPath,
    created: !alreadyExists,
    preserved: alreadyExists,
    excluded,
    kind: repoContractKindForRole(resolvedRole)
  };
}

export async function ensureProjectBrief(projectDir, role = null) {
  const resolvedRole = role || await detectRepoRole(projectDir);
  const projectBriefPath = path.join(projectDir, PROJECT_BRIEF_PATH);
  await fsp.mkdir(path.dirname(projectBriefPath), { recursive: true });
  if (fs.existsSync(projectBriefPath)) {
    return {
      path: projectBriefPath,
      created: false,
      asset_relative_path: projectBriefAssetRelativeForRole(resolvedRole)
    };
  }

  const template = await fsp.readFile(resolveProjectBriefTemplatePath(resolvedRole), "utf8");
  await fsp.writeFile(projectBriefPath, normalizeText(template), "utf8");
  return {
    path: projectBriefPath,
    created: true,
    asset_relative_path: projectBriefAssetRelativeForRole(resolvedRole)
  };
}

export async function buildSetupSummary(projectDir, options = {}) {
  const role = options.role || await detectRepoRole(projectDir);
  const releasePolicy = options.releasePolicy || await readReleasePolicy(projectDir);
  const allowCreate = options.allowCreate !== false;
  const repoContract = options.repoContract
    || await resolveRepoContractRuntimeState(projectDir, role, allowCreate);
  const projectBrief = options.projectBrief
    || await resolveProjectBriefRuntimeState(projectDir, role, allowCreate);
  const hygiene = options.hygiene || null;

  const repoContractSummary = await analyzeRepoContractState(projectDir, {
    role,
    repoContract,
    releasePolicy
  });
  const projectBriefSummary = await analyzeProjectBriefState(projectDir, {
    role,
    projectBrief
  });
  const planWorkspaceSummary = buildPlanWorkspaceSetupState(hygiene);

  const issueTypes = uniqueValues([
    ...repoContractSummary.issue_types,
    ...projectBriefSummary.issue_types,
    ...planWorkspaceSummary.issue_types
  ]);
  const recommendedActions = uniqueValues([
    ...repoContractSummary.recommended_actions,
    ...projectBriefSummary.recommended_actions,
    ...planWorkspaceSummary.recommended_actions
  ]);

  return {
    has_warnings: issueTypes.length > 0,
    issue_types: issueTypes,
    recommended_actions: recommendedActions,
    repo_contract: repoContractSummary,
    project_brief: projectBriefSummary,
    plan_workspace: planWorkspaceSummary
  };
}

function resolveProjectBriefTemplatePath(role) {
  return role === REPO_ROLE_SOURCE ? sourceProjectBriefTemplatePath : clientProjectBriefTemplatePath;
}

async function resolveRepoContractRuntimeState(projectDir, role, allowCreate) {
  if (allowCreate) {
    return await ensureRepoContract(projectDir, role);
  }

  const repoContractPath = path.join(projectDir, ROOT_AGENTS_PATH);
  const exists = fs.existsSync(repoContractPath);
  return {
    path: repoContractPath,
    created: false,
    preserved: exists,
    excluded: false,
    kind: repoContractKindForRole(role),
    missing: !exists
  };
}

async function resolveProjectBriefRuntimeState(projectDir, role, allowCreate) {
  if (allowCreate) {
    return await ensureProjectBrief(projectDir, role);
  }

  const projectBriefPath = path.join(projectDir, PROJECT_BRIEF_PATH);
  const exists = fs.existsSync(projectBriefPath);
  return {
    path: projectBriefPath,
    created: false,
    asset_relative_path: projectBriefAssetRelativeForRole(role),
    missing: !exists
  };
}

async function analyzeRepoContractState(projectDir, { role, repoContract, releasePolicy }) {
  const repoContractPath = repoContract.path || path.join(projectDir, ROOT_AGENTS_PATH);
  const content = fs.existsSync(repoContractPath) ? await fsp.readFile(repoContractPath, "utf8") : "";
  const missingSections = role === REPO_ROLE_SOURCE
    ? []
    : collectMissingHeadings(content, CLIENT_REPO_CONTRACT_HEADINGS);
  const issueTypes = [];
  const recommendedActions = [];

  if (repoContract.missing) {
    issueTypes.push("repo-contract-missing");
    recommendedActions.push(`Create ${ROOT_AGENTS_PATH} with install or ensure-plan before depending on repo-contract automation.`);
  }

  if (missingSections.length > 0) {
    issueTypes.push("repo-contract-missing-sections");
    recommendedActions.push(`Review ${ROOT_AGENTS_PATH} and add the missing sections needed for the client repo contract.`);
  }

  if (releasePolicy?.section_present && !releasePolicy.valid) {
    issueTypes.push("repo-contract-malformed-release-policy");
    recommendedActions.push(`Fix the Release Policy block in ${ROOT_AGENTS_PATH} so SemVer helpers can trust the repo contract.`);
  }

  return {
    path: repoContractPath,
    kind: repoContract.kind || repoContractKindForRole(role),
    state: repoContract.created ? "created" : repoContract.missing ? "missing" : "preserved",
    needs_attention: issueTypes.length > 0,
    issue_types: issueTypes,
    missing_sections: missingSections,
    release_policy_valid: Boolean(releasePolicy?.valid),
    recommended_actions: recommendedActions
  };
}

async function analyzeProjectBriefState(projectDir, { role, projectBrief }) {
  const projectBriefPath = projectBrief.path || path.join(projectDir, PROJECT_BRIEF_PATH);
  const content = fs.existsSync(projectBriefPath) ? await fsp.readFile(projectBriefPath, "utf8") : "";
  const templateContent = await fsp.readFile(resolveProjectBriefTemplatePath(role), "utf8");
  const missingSections = collectMissingHeadings(content, PROJECT_BRIEF_HEADINGS);
  const templateLineMatches = countTemplateLineMatches(content, templateContent);
  const issueTypes = [];
  const recommendedActions = [];

  if (projectBrief.missing) {
    issueTypes.push("project-brief-missing");
    recommendedActions.push(`Create ${PROJECT_BRIEF_PATH} with install or ensure-plan before relying on project-memory suggestions.`);
  }

  if (missingSections.length > 0) {
    issueTypes.push("project-brief-missing-sections");
    recommendedActions.push(`Fill in the missing sections in ${PROJECT_BRIEF_PATH} so project memory stays structurally usable.`);
  }

  if (templateLineMatches >= 3) {
    issueTypes.push("project-brief-placeholder-heavy");
    recommendedActions.push(`Replace placeholder lines in ${PROJECT_BRIEF_PATH} with repo-specific priorities, guardrails, questions, and decisions.`);
  }

  return {
    path: projectBriefPath,
    state: projectBrief.created ? "created" : projectBrief.missing ? "missing" : "preserved",
    needs_attention: issueTypes.length > 0,
    issue_types: issueTypes,
    missing_sections: missingSections,
    placeholder_line_count: templateLineMatches,
    recommended_actions: recommendedActions
  };
}

function buildPlanWorkspaceSetupState(hygiene) {
  if (!hygiene) {
    return {
      state: "current",
      needs_attention: false,
      issue_types: [],
      recommended_actions: []
    };
  }

  return {
    state: hygiene.has_warnings ? "attention-needed" : "current",
    needs_attention: hygiene.has_warnings,
    issue_types: Array.isArray(hygiene.issue_types) ? [...hygiene.issue_types] : [],
    recommended_actions: Array.isArray(hygiene.recommended_actions) ? [...hygiene.recommended_actions] : []
  };
}

export async function resolveGitExcludePath(projectDir) {
  const gitMarkerPath = path.join(projectDir, ".git");
  if (!fs.existsSync(gitMarkerPath)) {
    return "";
  }

  const stat = await fsp.stat(gitMarkerPath);
  let gitDir = "";
  if (stat.isDirectory()) {
    gitDir = gitMarkerPath;
  } else if (stat.isFile()) {
    const gitPointer = await fsp.readFile(gitMarkerPath, "utf8");
    const match = gitPointer.match(/^gitdir:\s*(.+)$/im);
    if (match?.[1]) {
      gitDir = path.resolve(projectDir, match[1].trim());
    }
  }

  return gitDir ? path.join(gitDir, "info", "exclude") : "";
}

export async function ensureGitExcludeEntry(projectDir, entry) {
  const excludePath = await resolveGitExcludePath(projectDir);
  if (!excludePath) {
    return false;
  }

  await fsp.mkdir(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? normalizeText(await fsp.readFile(excludePath, "utf8")) : "";
  const lines = existing.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.includes(entry)) {
    const nextContent = `${existing.replace(/\s+$/g, "")}${existing.trim() ? "\n" : ""}${entry}\n`;
    await fsp.writeFile(excludePath, nextContent, "utf8");
  }
  return true;
}

export async function hasGitExcludeEntry(projectDir, entry) {
  const excludePath = await resolveGitExcludePath(projectDir);
  if (!excludePath || !fs.existsSync(excludePath)) {
    return false;
  }
  const content = normalizeText(await fsp.readFile(excludePath, "utf8"));
  return content.split("\n").map((line) => line.trim()).includes(entry);
}

export function resolveProjectDir(rawValue = ".") {
  return path.resolve(process.cwd(), rawValue || ".");
}

export function nowIso() {
  return new Date().toISOString();
}

export function localDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function readReleasePolicy(projectDir) {
  const repoContractPath = path.join(projectDir, ROOT_AGENTS_PATH);
  if (!fs.existsSync(repoContractPath)) {
    return {
      path: repoContractPath,
      section_present: false,
      enabled: false,
      version_files: [...DEFAULT_VERSION_FILES],
      pre_1_policy: "strict",
      release_history: "separate-release-commit-and-tag",
      valid: true,
      errors: []
    };
  }

  const repoContractText = await fsp.readFile(repoContractPath, "utf8");
  return {
    path: repoContractPath,
    ...parseReleasePolicy(repoContractText)
  };
}

export function parseReleasePolicy(markdown) {
  const section = extractSection(markdown, RELEASE_POLICY_SECTION);
  if (!section) {
    return {
      section_present: false,
      enabled: false,
      version_files: [...DEFAULT_VERSION_FILES],
      pre_1_policy: "strict",
      release_history: "separate-release-commit-and-tag",
      valid: true,
      errors: []
    };
  }

  const semverWorkflow = extractSectionValue(section, "SemVer Workflow").toLowerCase() || "disabled";
  const versionFiles = normalizeVersionFileList(extractSectionValue(section, "Version Files") || DEFAULT_VERSION_FILES.join(", "));
  const pre1Policy = extractSectionValue(section, "Pre-1.0 Policy").toLowerCase() || "strict";
  const releaseHistory = extractSectionValue(section, "Release History").toLowerCase() || "separate-release-commit-and-tag";
  const errors = [];

  if (!["enabled", "disabled"].includes(semverWorkflow)) {
    errors.push(`SemVer Workflow must be enabled or disabled. Received: ${semverWorkflow || "<missing>"}`);
  }
  if (pre1Policy !== "strict") {
    errors.push(`Pre-1.0 Policy must be strict in this slice. Received: ${pre1Policy || "<missing>"}`);
  }
  if (!ALLOWED_RELEASE_HISTORY.has(releaseHistory)) {
    errors.push(`Release History must be separate-release-commit-and-tag in this slice. Received: ${releaseHistory || "<missing>"}`);
  }
  if (versionFiles.length === 0) {
    errors.push("Version Files must include at least package.json.");
  }
  for (const fileName of versionFiles) {
    if (!ALLOWED_VERSION_FILES.has(fileName)) {
      errors.push(`Version Files contains unsupported entry: ${fileName}`);
    }
  }
  if (semverWorkflow === "enabled" && !versionFiles.includes("package.json")) {
    errors.push("SemVer-enabled repos must include package.json in Version Files.");
  }

  return {
    section_present: true,
    enabled: semverWorkflow === "enabled",
    version_files: versionFiles,
    pre_1_policy: pre1Policy,
    release_history: releaseHistory,
    valid: errors.length === 0,
    errors
  };
}

export function extractSection(markdown, sectionTitle) {
  const text = String(markdown || "");
  const lines = text.split(/\r?\n/);
  const wantedHeading = `## ${sectionTitle}`;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === wantedHeading) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) {
    return "";
  }
  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }
    collected.push(line);
  }
  return collected.join("\n").trim();
}

export function parseCliArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

export function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function collectMissingHeadings(text, expectedHeadings) {
  return expectedHeadings.filter((heading) => !String(text || "").includes(heading));
}

function countTemplateLineMatches(text, template) {
  const templateLines = new Set(extractMeaningfulBulletLines(template));
  if (templateLines.size === 0) {
    return 0;
  }
  return extractMeaningfulBulletLines(text)
    .filter((line) => templateLines.has(line))
    .length;
}

function extractMeaningfulBulletLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/\s+/g, " ").toLowerCase())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function extractSectionValue(sectionText, label) {
  const match = String(sectionText || "").match(new RegExp(`^-\\s+${escapeRegex(label)}:\\s*(.*)$`, "im"));
  return match?.[1]?.trim() || "";
}

function normalizeVersionFileList(value) {
  return [...new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function uniqueValues(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
