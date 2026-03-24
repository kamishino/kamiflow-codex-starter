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
export const DONE_PLAN_KEEP_LATEST = 20;
export const CLEANUP_STALE_AFTER_DAYS = 14;

const DEFAULT_VERSION_FILES = Object.freeze(["package.json", "package-lock.json"]);
const ALLOWED_VERSION_FILES = new Set(DEFAULT_VERSION_FILES);
const ALLOWED_RELEASE_HISTORY = new Set(["separate-release-commit-and-tag"]);
const ACTIVE_PLAN_REQUIRED_FRONTMATTER_KEYS = Object.freeze([
  "plan_id",
  "title",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "updated_at",
  "lifecycle_phase"
]);
const ACTIVE_PLAN_REQUIRED_SECTIONS = Object.freeze([
  "Goal",
  "Scope (In/Out)",
  "Constraints",
  "Project Fit",
  "Implementation Tasks",
  "Acceptance Criteria",
  "Validation Commands",
  "Go/No-Go Checklist"
]);

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

  const goalLines = topic
    ? [
      `- Outcome: ${topic}`,
      "- Out of scope: Replace with the explicit non-goal for this slice."
    ]
    : [
      "- Outcome: Replace with the concrete implementation outcome for this slice.",
      "- Out of scope: Replace with the explicit non-goal for this slice."
    ];
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
    ...goalLines,
    "",
    "## Scope (In/Out)",
    "- In: Replace with the concrete implementation slice for this plan.",
    "- Out: Replace with the explicit non-goals for this slice.",
    "",
    "## Constraints",
    "- Technical: Replace with the real technical constraints for this slice.",
    "- Risk: Replace with the main execution risk for this slice.",
    "",
    "## Project Fit",
    "- Relevant priority: Replace with one priority from .local/project.md.",
    "- Relevant guardrail: Replace with one guardrail from .local/project.md.",
    "",
    "## Assumptions",
    "- [ ] Replace with validated assumptions or remove this placeholder.",
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
    "- [ ] Replace with the first concrete implementation step.",
    "",
    "## Acceptance Criteria",
    "- [ ] Replace with one concrete acceptance check.",
    "",
    "## Validation Commands",
    "- `replace-with-runnable-command`",
    "",
    "## Risks & Rollback",
    "- Risk: Replace with the main risk for this slice.",
    "- Mitigation: Replace with the concrete mitigation for that risk.",
    "- Rollback: Replace with the scoped rollback path if the slice fails.",
    "",
    "## Go/No-Go Checklist",
    "- [ ] Goal is explicit",
    "- [ ] Scope in/out is explicit",
    "- [ ] No unresolved high-impact decisions",
    "- [ ] Tasks and validation commands are implementation-ready",
    "",
    "## Handoff",
    `- Next command: ${nextCommand}`,
    `- Next mode: ${nextMode}`,
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
  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(content);
  return {
    path: planPath,
    name: path.basename(planPath),
    content,
    body,
    frontmatter,
    has_frontmatter: hasFrontmatter,
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
    records.push(...await listDonePlanRecords(projectDir, true));
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

export async function resolveLatestDonePlan(projectDir) {
  const plans = await listDonePlanRecords(projectDir, true);
  const done = plans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() === "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  return done[0] || null;
}

export async function summarizeDonePlanBuckets(projectDir) {
  const flatDone = await listDonePlanRecords(projectDir, false);
  const allDone = await listDonePlanRecords(projectDir, true);
  const doneRoot = path.join(projectDir, DONE_PLAN_DIR);
  const weeklyBucketCounts = new Map();

  for (const record of allDone) {
    const relativePath = path.relative(doneRoot, record.path);
    const parts = relativePath.split(path.sep).filter(Boolean);
    if (parts.length >= 3 && /^\d{4}$/.test(parts[0]) && /^W\d{2}$/.test(parts[1])) {
      const bucket = `${parts[0]}/${parts[1]}`;
      weeklyBucketCounts.set(bucket, (weeklyBucketCounts.get(bucket) || 0) + 1);
    }
  }

  return {
    recent_done_count: flatDone.length,
    archived_done_count: allDone.length,
    weekly_buckets: [...weeklyBucketCounts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([bucket, count]) => ({ bucket, count }))
  };
}

export function isPassPlanRecord(plan) {
  return String(plan?.frontmatter?.decision || "").toUpperCase() === "PASS";
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

export async function listDonePlanRecords(projectDir, recursive = true) {
  const doneDir = path.join(projectDir, DONE_PLAN_DIR);
  if (!fs.existsSync(doneDir)) {
    return [];
  }

  return recursive
    ? await listMarkdownRecordsRecursive(doneDir)
    : await listMarkdownRecordsShallow(doneDir);
}

export function resolvePlanRecordTimestampInfo(plan) {
  const donePlan = String(plan?.frontmatter?.status || "").toLowerCase() === "done";
  const archivedAt = String(plan?.frontmatter?.archived_at || "").trim();
  const updatedAt = String(plan?.frontmatter?.updated_at || "").trim();

  if (donePlan && archivedAt) {
    const archivedMs = parseTimestamp(archivedAt);
    if (Number.isFinite(archivedMs)) {
      return {
        valid: true,
        iso: archivedAt,
        ms: archivedMs,
        source: "archived_at"
      };
    }
  }

  if (updatedAt) {
    const updatedMs = parseTimestamp(updatedAt);
    if (Number.isFinite(updatedMs)) {
      return {
        valid: true,
        iso: updatedAt,
        ms: updatedMs,
        source: "updated_at"
      };
    }
  }

  if (plan?.stat?.mtimeMs) {
    return {
      valid: true,
      iso: new Date(plan.stat.mtimeMs).toISOString(),
      ms: plan.stat.mtimeMs,
      source: "mtime"
    };
  }

  return {
    valid: false,
    iso: "",
    ms: Number.NaN,
    source: ""
  };
}

export function comparePlanRecordsByLogicalTimeDesc(left, right) {
  const leftInfo = resolvePlanRecordTimestampInfo(left);
  const rightInfo = resolvePlanRecordTimestampInfo(right);
  const leftMs = Number.isFinite(leftInfo.ms) ? leftInfo.ms : Number.NEGATIVE_INFINITY;
  const rightMs = Number.isFinite(rightInfo.ms) ? rightInfo.ms : Number.NEGATIVE_INFINITY;
  if (rightMs !== leftMs) {
    return rightMs - leftMs;
  }
  return left.path.localeCompare(right.path);
}

export function resolveStaleThresholdMs(days = CLEANUP_STALE_AFTER_DAYS) {
  const normalizedDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : CLEANUP_STALE_AFTER_DAYS;
  return normalizedDays * 24 * 60 * 60 * 1000;
}

export function listMissingPlanFrontmatterKeys(plan) {
  return ACTIVE_PLAN_REQUIRED_FRONTMATTER_KEYS
    .filter((key) => !String(plan?.frontmatter?.[key] || "").trim());
}

export function listMissingActivePlanSections(plan) {
  return ACTIVE_PLAN_REQUIRED_SECTIONS
    .filter((sectionTitle) => !extractSection(plan?.content || "", sectionTitle));
}

export function summarizePlanRecordForCleanup(projectDir, plan) {
  const timestampInfo = resolvePlanRecordTimestampInfo(plan);
  const relativePath = path.relative(projectDir, plan.path).replace(/\\/g, "/");
  return {
    path: plan.path,
    relative_path: relativePath,
    plan_id: String(plan.frontmatter.plan_id || "").trim(),
    title: String(plan.frontmatter.title || "").trim(),
    status: String(plan.frontmatter.status || "").trim(),
    decision: String(plan.frontmatter.decision || "").trim(),
    lifecycle_phase: String(plan.frontmatter.lifecycle_phase || "").trim(),
    updated_at: String(plan.frontmatter.updated_at || "").trim(),
    timestamp_source: timestampInfo.source || "",
    timestamp: timestampInfo.iso || ""
  };
}

export async function analyzePlanCleanup(projectDir, { staleAfterDays = CLEANUP_STALE_AFTER_DAYS } = {}) {
  const allActiveDirPlans = await listPlanRecords(projectDir, false);
  const nonDonePlans = allActiveDirPlans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() !== "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  const donePlansInActiveDir = allActiveDirPlans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() === "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  const staleThresholdMs = resolveStaleThresholdMs(staleAfterDays);
  const staleCutoffMs = Date.now() - staleThresholdMs;

  const stalePlans = nonDonePlans.filter((record) => {
    const timestampInfo = resolvePlanRecordTimestampInfo(record);
    return Number.isFinite(timestampInfo.ms) && timestampInfo.ms <= staleCutoffMs;
  });

  const orphanIssues = [];
  if (nonDonePlans.length > 1) {
    const primaryPath = nonDonePlans[0]?.path || "";
    for (const record of nonDonePlans) {
      if (record.path === primaryPath) {
        continue;
      }
      orphanIssues.push({
        type: "orphan-active-plan",
        reason: "Multiple non-done plans exist; older plans should be resolved manually before further build or release work.",
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }
  }

  for (const record of nonDonePlans) {
    const missingFrontmatterKeys = listMissingPlanFrontmatterKeys(record);
    if (!record.has_frontmatter || missingFrontmatterKeys.length > 0) {
      orphanIssues.push({
        type: "malformed-active-plan",
        reason: record.has_frontmatter
          ? "Required frontmatter keys are missing."
          : "Frontmatter block is missing.",
        missing_frontmatter_keys: missingFrontmatterKeys,
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }

    const missingSections = listMissingActivePlanSections(record);
    if (missingSections.length > 0) {
      orphanIssues.push({
        type: "incomplete-active-plan",
        reason: "Required plan sections are missing for a non-fast-path active plan.",
        missing_sections: missingSections,
        plan: summarizePlanRecordForCleanup(projectDir, record)
      });
    }
  }

  for (const record of donePlansInActiveDir) {
    orphanIssues.push({
      type: "done-plan-in-active-dir",
      reason: "Done plans should live under .local/plans/done/**, not .local/plans/.",
      plan: summarizePlanRecordForCleanup(projectDir, record)
    });
  }

  const affectedOrphanPaths = new Set(orphanIssues.map((issue) => issue.plan.path));
  const doneSummary = await summarizeDonePlanBuckets(projectDir);
  return {
    stale_after_days: Number(staleAfterDays),
    stale_cutoff: new Date(staleCutoffMs).toISOString(),
    active_plan_count: nonDonePlans.length,
    stale_active_count: stalePlans.length,
    orphan_count: affectedOrphanPaths.size,
    recent_done_count: doneSummary.recent_done_count,
    weekly_buckets: doneSummary.weekly_buckets,
    stale_active_plans: stalePlans.map((record) => summarizePlanRecordForCleanup(projectDir, record)),
    orphan_issues: orphanIssues,
    recommended_actions: buildCleanupRecommendedActions({
      nonDonePlans,
      stalePlans,
      orphanIssues
    })
  };
}

function buildCleanupRecommendedActions({ nonDonePlans, stalePlans, orphanIssues }) {
  const actions = [];
  if (nonDonePlans.length === 0) {
    actions.push("No active non-done plan exists. Run ensure-plan.mjs only when you are starting a new non-fast-path slice.");
  }

  if (stalePlans.length === 1 && nonDonePlans.length === 1) {
    actions.push("One stale active plan exists. Resume it if the scope is still current, close it intentionally if the slice is complete, or create a new plan only if the scope truly changed.");
  } else if (stalePlans.length > 1) {
    actions.push("Multiple stale active plans exist. Resolve the older plans manually before further build, finish, or release work.");
  }

  if (orphanIssues.some((issue) => issue.type === "orphan-active-plan")) {
    actions.push("Resolve multiple non-done plans manually and keep only one active non-done plan by default.");
  }
  if (orphanIssues.some((issue) => issue.type === "malformed-active-plan")) {
    actions.push("Repair malformed active-plan frontmatter before relying on readiness, finish, or release helpers.");
  }
  if (orphanIssues.some((issue) => issue.type === "incomplete-active-plan")) {
    actions.push("Fill the missing required sections before treating the active plan as implementation-ready.");
  }
  if (orphanIssues.some((issue) => issue.type === "done-plan-in-active-dir")) {
    actions.push("Move done plans through archive-plan.mjs instead of leaving them in .local/plans/.");
  }

  if (actions.length === 0) {
    actions.push("No cleanup action required. Plan hygiene looks current.");
  }

  return actions;
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

export function extractValidationCommands(sectionText) {
  return [...String(sectionText || "").matchAll(/`([^`]+)`/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
}

export function assessPlanCloseout(plan, releasePolicy) {
  const findings = [];
  const implementationSection = extractSection(plan?.content, "Implementation Tasks");
  const acceptanceSection = extractSection(plan?.content, "Acceptance Criteria");
  const goNoGoSection = extractSection(plan?.content, "Go/No-Go Checklist");
  const validationCommandsSection = extractSection(plan?.content, "Validation Commands");
  const implementationCounts = countCheckboxes(implementationSection);
  const acceptanceCounts = countCheckboxes(acceptanceSection);
  const goNoGoCounts = countCheckboxes(goNoGoSection);
  const validationCommands = extractValidationCommands(validationCommandsSection);

  if (String(plan?.frontmatter?.status || "").toLowerCase() === "done") {
    findings.push("Plan is already archived as done.");
  }

  if (implementationCounts.total === 0 || implementationCounts.total !== implementationCounts.checked) {
    findings.push("Implementation Tasks is not fully checked.");
  }
  if (acceptanceCounts.total === 0 || acceptanceCounts.total !== acceptanceCounts.checked) {
    findings.push("Acceptance Criteria is not fully checked.");
  }
  if (goNoGoCounts.total === 0 || goNoGoCounts.total !== goNoGoCounts.checked) {
    findings.push("Go/No-Go Checklist is not fully checked.");
  }

  if (validationCommands.length === 0) {
    findings.push("Validation Commands is missing runnable commands.");
  }

  const releaseImpact = releasePolicy?.enabled
    ? parseReleaseImpact(plan?.content || "")
    : {
        section_present: false,
        impact: "",
        reason: "",
        valid: true,
        errors: []
      };

  if (releasePolicy?.enabled) {
    if (!releasePolicy.valid) {
      findings.push(`AGENTS.md Release Policy is invalid: ${releasePolicy.errors[0]}`);
    } else if (!releaseImpact.valid) {
      findings.push(`Release Impact is missing or unresolved: ${releaseImpact.errors[0]}`);
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    implementation_counts: implementationCounts,
    acceptance_counts: acceptanceCounts,
    go_no_go_counts: goNoGoCounts,
    validation_commands: validationCommands,
    release_impact: releaseImpact
  };
}

export async function archivePassPlan(projectDir, plan) {
  const { body } = splitFrontmatter(plan.content);
  const archivedAt = nowIso();
  const nextFrontmatter = {
    ...plan.frontmatter,
    status: "done",
    decision: "PASS",
    selected_mode: "Plan",
    next_command: "done",
    next_mode: "done",
    lifecycle_phase: "done",
    updated_at: archivedAt,
    archived_at: archivedAt
  };
  const archiveWipLines = [
    `- ${archivedAt} - Status: Archived after PASS closeout.`,
    `- ${archivedAt} - Blockers: None.`,
    `- ${archivedAt} - Next step: Done.`
  ].join("\n");
  const trimmedBody = body.trimEnd();
  const nextBody = /^## WIP Log\s*$/m.test(trimmedBody)
    ? trimmedBody.replace(/^## WIP Log\s*$/m, `## WIP Log\n${archiveWipLines}`)
    : `${trimmedBody}\n\n## WIP Log\n${archiveWipLines}`;
  const nextContent = `${serializeFrontmatter(nextFrontmatter)}\n${nextBody}\n`;
  const targetPath = path.join(projectDir, DONE_PLAN_DIR, path.basename(plan.path));
  if (fs.existsSync(targetPath)) {
    throw new Error(`Done plan already exists at ${targetPath}`);
  }

  const rolloverPlan = await planDoneRollover(projectDir, {
    keep: DONE_PLAN_KEEP_LATEST,
    pendingRecord: {
      ...plan,
      path: targetPath,
      name: path.basename(targetPath),
      frontmatter: nextFrontmatter,
      stat: {
        mtimeMs: resolvePlanRecordTimestampInfo({
          ...plan,
          frontmatter: nextFrontmatter,
          stat: {
            mtimeMs: Date.now()
          }
        }).ms || Date.now()
      }
    }
  });

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(plan.path, nextContent, "utf8");
  await fsp.rename(plan.path, targetPath);
  const rolledOver = await applyDoneRollover(rolloverPlan);
  return {
    archived_at: archivedAt,
    archived_path: targetPath,
    rolled_over: rolledOver
  };
}

export async function planDoneRollover(projectDir, { keep = DONE_PLAN_KEEP_LATEST, pendingRecord = null } = {}) {
  const flatDoneRecords = await listDonePlanRecords(projectDir, false);
  const candidates = [...flatDoneRecords];
  if (pendingRecord) {
    candidates.push(pendingRecord);
  }

  const overflow = candidates
    .sort(comparePlanRecordsByLogicalTimeDesc)
    .slice(keep)
    .filter((record) => record.path !== pendingRecord?.path);

  const moves = [];
  const reservedTargets = new Set();
  for (const record of overflow) {
    const bucket = resolveDoneArchiveBucket(record);
    if (!bucket.valid) {
      continue;
    }

    const targetPath = path.join(projectDir, DONE_PLAN_DIR, bucket.year, bucket.week, record.name);
    if (targetPath === record.path) {
      continue;
    }
    if (fs.existsSync(targetPath)) {
      throw new Error(`Weekly done-plan archive collision at ${targetPath}`);
    }
    if (reservedTargets.has(targetPath)) {
      throw new Error(`Weekly done-plan archive collision planned twice for ${targetPath}`);
    }

    reservedTargets.add(targetPath);
    moves.push({
      from: record.path,
      to: targetPath
    });
  }

  return moves;
}

export async function applyDoneRollover(moves) {
  const movedPaths = [];
  for (const move of moves) {
    await fsp.mkdir(path.dirname(move.to), { recursive: true });
    await fsp.rename(move.from, move.to);
    movedPaths.push(move.to);
  }
  return movedPaths;
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

async function listMarkdownRecordsShallow(rootDir) {
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    records.push(await readPlanRecord(path.join(rootDir, entry.name)));
  }
  return records;
}

async function listMarkdownRecordsRecursive(rootDir) {
  const records = [];
  const pendingDirs = [rootDir];
  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      records.push(await readPlanRecord(entryPath));
    }
  }
  return records;
}

function resolveDoneArchiveBucket(plan) {
  const timestampInfo = resolvePlanRecordTimestampInfo(plan);
  if (!timestampInfo.valid) {
    return {
      valid: false,
      year: "",
      week: ""
    };
  }

  const weekInfo = isoWeekParts(timestampInfo.ms);
  return {
    valid: true,
    year: String(weekInfo.year),
    week: `W${String(weekInfo.week).padStart(2, "0")}`
  };
}

function isoWeekParts(timestampMs) {
  const date = new Date(timestampMs);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return {
    year: isoYear,
    week
  };
}

function parseTimestamp(value) {
  const ms = Date.parse(String(value || "").trim());
  return Number.isFinite(ms) ? ms : Number.NaN;
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
