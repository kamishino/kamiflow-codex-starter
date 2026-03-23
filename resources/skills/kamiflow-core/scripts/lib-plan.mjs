import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLAN_DIR = path.join(".local", "plans");
export const DONE_PLAN_DIR = path.join(PLAN_DIR, "done");
export const PROJECT_BRIEF_PATH = path.join(".local", "project.md");
export const ROOT_AGENTS_PATH = "AGENTS.md";
export const REPO_ROLE_CLIENT = "client";
export const REPO_ROLE_DOGFOOD = "dogfood";
export const RELEASE_POLICY_SECTION = "Release Policy";
export const RELEASE_IMPACT_SECTION = "Release Impact";
export const RELEASE_IMPACT_VALUES = Object.freeze(["none", "patch", "minor", "major"]);

const DEFAULT_VERSION_FILES = Object.freeze(["package.json", "package-lock.json"]);
const ALLOWED_VERSION_FILES = new Set(DEFAULT_VERSION_FILES);
const ALLOWED_RELEASE_HISTORY = new Set(["separate-release-commit-and-tag"]);

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientAgentsTemplatePath = path.join(skillRoot, "assets", "client-agents.md");
const clientProjectBriefTemplatePath = path.join(skillRoot, "assets", "project-brief-client.md");
const dogfoodProjectBriefTemplatePath = path.join(skillRoot, "assets", "project-brief-dogfood.md");

const FRONTMATTER_KEYS = [
  "plan_id",
  "title",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "diagram_mode",
  "updated_at",
  "lifecycle_phase",
  "request_id",
  "parent_plan_id",
  "archived_at"
];

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

  return score >= 2 ? REPO_ROLE_DOGFOOD : REPO_ROLE_CLIENT;
}

export function projectBriefAssetRelativeForRole(role) {
  return role === REPO_ROLE_DOGFOOD
    ? path.join("assets", "project-brief-dogfood.md")
    : path.join("assets", "project-brief-client.md");
}

export function repoContractKindForRole(role) {
  return role === REPO_ROLE_DOGFOOD ? "tracked-source" : "generated-local";
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

  if (resolvedRole === REPO_ROLE_DOGFOOD) {
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

function resolveProjectBriefTemplatePath(role) {
  return role === REPO_ROLE_DOGFOOD ? dogfoodProjectBriefTemplatePath : clientProjectBriefTemplatePath;
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

export function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "workflow";
}

export function routeToMode(route = "plan") {
  return route === "build" || route === "fix" ? "Build" : "Plan";
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

export function parseReleaseImpact(markdown) {
  const section = extractSection(markdown, RELEASE_IMPACT_SECTION);
  if (!section) {
    return {
      section_present: false,
      impact: "",
      reason: "",
      valid: false,
      errors: ["Release Impact section is missing."]
    };
  }

  const impact = extractSectionValue(section, "Impact").toLowerCase();
  const reason = extractSectionValue(section, "Reason");
  const errors = [];

  if (!RELEASE_IMPACT_VALUES.includes(impact)) {
    errors.push(`Impact must be one of ${RELEASE_IMPACT_VALUES.join(", ")}. Received: ${impact || "<missing>"}`);
  }
  if (!reason || /^resolve before/i.test(reason) || /^unknown$/i.test(reason)) {
    errors.push("Reason must be resolved before PASS archive.");
  }

  return {
    section_present: true,
    impact,
    reason,
    valid: errors.length === 0,
    errors
  };
}

export function ensureReleaseImpactSectionContent(markdown, releasePolicy) {
  if (!releasePolicy?.enabled) {
    return {
      changed: false,
      content: markdown
    };
  }

  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(markdown);
  if (extractSection(body, RELEASE_IMPACT_SECTION)) {
    return {
      changed: false,
      content: markdown
    };
  }

  const sectionBlock = [
    `## ${RELEASE_IMPACT_SECTION}`,
    "- Impact: Unknown",
    "- Reason: Resolve before PASS archive in this SemVer-enabled repo."
  ].join("\n");

  const insertionMarker = /^## Implementation Tasks\s*$/m;
  const nextBody = insertionMarker.test(body)
    ? body.replace(insertionMarker, `${sectionBlock}\n\n## Implementation Tasks`)
    : `${body.trimEnd()}\n\n${sectionBlock}\n`;
  const serialized = hasFrontmatter
    ? `${serializeFrontmatter(frontmatter)}\n${nextBody.trimEnd()}\n`
    : `${nextBody.trimEnd()}\n`;

  return {
    changed: true,
    content: serialized
  };
}

export function splitFrontmatter(markdown) {
  const text = String(markdown || "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text, hasFrontmatter: false };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: text, hasFrontmatter: false };
  }

  const rawFrontmatter = match[1];
  const body = text.slice(match[0].length);
  return {
    frontmatter: parseFrontmatter(rawFrontmatter),
    body,
    hasFrontmatter: true
  };
}

export function parseFrontmatter(rawText) {
  const result = {};
  for (const line of String(rawText || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

export function serializeFrontmatter(frontmatter) {
  const orderedKeys = [...FRONTMATTER_KEYS, ...Object.keys(frontmatter).filter((key) => !FRONTMATTER_KEYS.includes(key))];
  const seen = new Set();
  const lines = [];

  for (const key of orderedKeys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (!(key in frontmatter)) {
      continue;
    }
    lines.push(`${key}: ${formatFrontmatterValue(frontmatter[key])}`);
  }

  return `---\n${lines.join("\n")}\n---\n`;
}

function formatFrontmatterValue(value) {
  if (value === null || value === undefined || value === "") {
    return "null";
  }
  const text = String(value);
  if (/^[A-Za-z0-9_.:-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

export function buildPlanTemplate({ planId, title, route, topic, parentPlanId = "null", releasePolicy = null }) {
  const createdAt = nowIso();
  const selectedMode = routeToMode(route);
  const nextCommand = route === "start" || route === "research" ? "plan" : route === "plan" ? "build" : route;
  const nextMode = route === "build" || route === "fix" ? "Plan" : route === "plan" ? "Build" : "Plan";
  const frontmatter = {
    plan_id: planId,
    title,
    status: "draft",
    decision: "PENDING",
    selected_mode: selectedMode,
    next_mode: nextMode,
    next_command: nextCommand,
    diagram_mode: "auto",
    updated_at: createdAt,
    lifecycle_phase: route,
    request_id: `kamiflow-core-${planId.toLowerCase()}`,
    parent_plan_id: parentPlanId,
    archived_at: null
  };

  const goal = topic ? `- ${topic}` : "- Capture the concrete goal before implementation.";
  const body = [
    "## Start Summary",
    "- Required: no",
    "- Reason: Kami Flow Core created this plan because no active non-done plan was available.",
    "- Selected Idea: Pending clarification.",
    "- Alternatives Considered: None yet.",
    "- Pre-mortem Risk: Unknown until scope is clarified.",
    "- Handoff Confidence: 3",
    "",
    "## Goal",
    goal,
    "",
    "## Scope (In/Out)",
    "- In: Define the concrete implementation slice.",
    "- Out: Anything not explicitly approved in this plan.",
    "",
    "## Constraints",
    "- Keep evidence-backed claims only.",
    "- Keep changes scoped to the selected route.",
    "",
    "## Project Fit",
    "- Relevant priority: Replace with one priority from .local/project.md.",
    "- Relevant guardrail: Replace with one guardrail from .local/project.md.",
    "",
    "## Assumptions",
    "- [ ] Replace with validated assumptions.",
    "",
    "## Open Decisions",
    "- [ ] Replace with decision-complete answers before build.",
    "- Remaining Count: 1",
    "",
    ...(releasePolicy?.enabled ? [
      `## ${RELEASE_IMPACT_SECTION}`,
      "- Impact: Unknown",
      "- Reason: Resolve before PASS archive in this SemVer-enabled repo.",
      ""
    ] : []),
    "## Implementation Tasks",
    "- [ ] Define the first implementation slice.",
    "",
    "## Acceptance Criteria",
    "- [ ] Define testable acceptance criteria.",
    "",
    "## Validation Commands",
    "- `Unknown`",
    "",
    "## Risks & Rollback",
    "- Risk: Unknown until scope is clarified.",
    "- Mitigation: Plan before build.",
    "- Rollback: Revert the scoped slice only if needed.",
    "",
    "## Go/No-Go Checklist",
    "- [ ] Goal is explicit",
    "- [ ] Scope in/out is explicit",
    "- [ ] No unresolved high-impact decisions",
    "- [ ] Tasks and validation commands are implementation-ready",
    "",
    "## WIP Log",
    `- ${createdAt} - Status: Plan created by Kami Flow Core.`,
    `- ${createdAt} - Blockers: Clarify scope and replace placeholder sections.`,
    `- ${createdAt} - Next step: Run the appropriate route and update this plan directly.`
  ].join("\n");

  return `${serializeFrontmatter(frontmatter)}\n${body}\n`;
}

export async function readPlanRecord(planPath) {
  const content = await fsp.readFile(planPath, "utf8");
  const stat = await fsp.stat(planPath);
  const { frontmatter, body } = splitFrontmatter(content);
  return {
    path: planPath,
    name: path.basename(planPath),
    content,
    body,
    frontmatter,
    stat
  };
}

export async function listPlanRecords(projectDir, includeDone = false) {
  const records = [];
  const activeDir = path.join(projectDir, PLAN_DIR);
  if (fs.existsSync(activeDir)) {
    const activeEntries = await fsp.readdir(activeDir, { withFileTypes: true });
    for (const entry of activeEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      records.push(await readPlanRecord(path.join(activeDir, entry.name)));
    }
  }

  if (includeDone) {
    const doneDir = path.join(projectDir, DONE_PLAN_DIR);
    if (fs.existsSync(doneDir)) {
      const doneEntries = await fsp.readdir(doneDir, { withFileTypes: true });
      for (const entry of doneEntries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) {
          continue;
        }
        records.push(await readPlanRecord(path.join(doneDir, entry.name)));
      }
    }
  }

  return records;
}

export async function resolveActivePlan(projectDir) {
  const plans = await listPlanRecords(projectDir, false);
  const active = plans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() !== "done")
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
  return active[0] || null;
}

export async function resolvePlanRef(projectDir, ref = "") {
  const trimmed = String(ref || "").trim();
  if (!trimmed) {
    return await resolveActivePlan(projectDir);
  }

  const absoluteCandidate = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(projectDir, trimmed);
  if (fs.existsSync(absoluteCandidate)) {
    return await readPlanRecord(absoluteCandidate);
  }

  const allPlans = await listPlanRecords(projectDir, true);
  return allPlans.find((record) => String(record.frontmatter.plan_id || "") === trimmed) || null;
}

export async function nextPlanSequence(projectDir, dateStamp) {
  const allPlans = await listPlanRecords(projectDir, true);
  const prefix = `${dateStamp}-`;
  let maxSeq = 0;
  for (const record of allPlans) {
    if (!record.name.startsWith(prefix)) {
      continue;
    }
    const match = record.name.match(/^\d{4}-\d{2}-\d{2}-(\d{3})-/);
    const seq = Number.parseInt(match?.[1] || "0", 10);
    if (!Number.isNaN(seq)) {
      maxSeq = Math.max(maxSeq, seq);
    }
  }
  return maxSeq + 1;
}

export async function createPlan(projectDir, { route = "plan", topic = "" } = {}) {
  await ensureRepoRuntimeState(projectDir);
  const releasePolicy = await readReleasePolicy(projectDir);
  const dateStamp = localDateStamp();
  const seq = await nextPlanSequence(projectDir, dateStamp);
  const topicSlug = topic ? `-${slugify(topic)}` : "";
  const fileName = `${dateStamp}-${String(seq).padStart(3, "0")}-${route}${topicSlug}.md`;
  const planPath = path.join(projectDir, PLAN_DIR, fileName);
  const planId = `PLAN-${dateStamp}-${String(seq).padStart(3, "0")}`;
  const title = `${route}${topic ? `-${slugify(topic)}` : "-workflow"}`;
  const content = buildPlanTemplate({ planId, title, route, topic, releasePolicy });
  await fsp.writeFile(planPath, content, "utf8");
  return await readPlanRecord(planPath);
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

export function countCheckboxes(sectionText) {
  const text = String(sectionText || "");
  const total = (text.match(/^\s*- \[(?: |x|X)\]/gm) || []).length;
  const checked = (text.match(/^\s*- \[(?:x|X)\]/gm) || []).length;
  return { total, checked };
}

export async function pruneDonePlans(projectDir, keep = 20) {
  const doneDir = path.join(projectDir, DONE_PLAN_DIR);
  if (!fs.existsSync(doneDir)) {
    return [];
  }
  const entries = await fsp.readdir(doneDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const filePath = path.join(doneDir, entry.name);
    const stat = await fsp.stat(filePath);
    files.push({ filePath, mtimeMs: stat.mtimeMs });
  }
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const removals = files.slice(keep);
  for (const item of removals) {
    await fsp.rm(item.filePath, { force: true });
  }
  return removals.map((item) => item.filePath);
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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
