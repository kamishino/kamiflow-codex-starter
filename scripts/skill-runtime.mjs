import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectRepoRole,
  ensureRepoRuntimeState,
  projectBriefAssetRelativeForRole,
  REPO_ROLE_CLIENT,
  REPO_ROLE_DOGFOOD,
  ROOT_AGENTS_PATH
} from "../resources/skills/kamiflow-core/scripts/lib-plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "..");
export const skillSourceDir = path.join(repoRoot, "resources", "skills", "kamiflow-core");
export const installedSkillDirRelative = path.join(".agents", "skills", "kamiflow-core");
export const planDirRelative = path.join(".local", "plans");
export const donePlanDirRelative = path.join(planDirRelative, "done");
export const projectBriefRelative = path.join(".local", "project.md");
export const rootAgentsRelative = ROOT_AGENTS_PATH;
export { REPO_ROLE_CLIENT, REPO_ROLE_DOGFOOD, detectRepoRole, projectBriefAssetRelativeForRole };

export const clientRuntimeRequiredFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/command-map.md",
  "references/route-intent.md",
  "references/start.md",
  "references/plan.md",
  "references/build.md",
  "references/check.md",
  "references/research.md",
  "references/fix.md",
  "scripts/lib-plan.mjs",
  "scripts/ensure-plan.mjs",
  "scripts/ready-check.mjs",
  "scripts/archive-plan.mjs",
  "assets/client-agents.md",
  "assets/project-brief-client.md",
  "assets/start-report.md",
  "assets/plan-spec.md",
  "assets/check-report.md",
];

export const sourceOnlyRequiredFiles = [
  "assets/project-brief-dogfood.md",
  "assets/forward-tests/scenarios.json"
];

export const runtimeRequiredFiles = clientRuntimeRequiredFiles;
export const sourceRequiredFiles = [...clientRuntimeRequiredFiles, ...sourceOnlyRequiredFiles];

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

export async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureProjectDir(projectDir) {
  const existing = await fsp.stat(projectDir).catch(() => null);
  if (existing && !existing.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectDir}`);
  }
  if (!existing) {
    await fsp.mkdir(projectDir, { recursive: true });
  }
}

export async function collectRelativeFilePaths(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const collected = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      collected.push(path.relative(rootDir, fullPath).replaceAll("\\", "/"));
    }
  }

  return collected.sort((left, right) => left.localeCompare(right));
}

export async function computeTreeDigest(rootDir, relativePaths) {
  const hash = crypto.createHash("sha256");
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    const content = await fsp.readFile(absolutePath, "utf8");
    hash.update(`${relativePath}\n`, "utf8");
    hash.update(normalizeText(content), "utf8");
    hash.update("\n---\n", "utf8");
  }
  return hash.digest("hex");
}

export async function syncSkillToProject(projectDir) {
  const targetSkillDir = path.join(projectDir, installedSkillDirRelative);
  const hadExistingInstall = await pathExists(targetSkillDir);

  await fsp.rm(targetSkillDir, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(targetSkillDir), { recursive: true });
  await fsp.cp(skillSourceDir, targetSkillDir, { recursive: true, force: true });

  const runtimeState = await ensureRepoRuntimeState(projectDir);
  return {
    role: runtimeState.role,
    targetSkillDir,
    hadExistingInstall,
    repoContractPath: runtimeState.repoContract.path,
    repoContractCreated: runtimeState.repoContract.created,
    repoContractExcluded: runtimeState.repoContract.excluded,
    repoContractKind: runtimeState.repoContract.kind,
    projectBriefPath: runtimeState.projectBrief.path,
    projectBriefCreated: runtimeState.projectBrief.created,
    projectBriefAsset: projectBriefAssetRelativeForRole(runtimeState.role)
  };
}

export function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n");
}
