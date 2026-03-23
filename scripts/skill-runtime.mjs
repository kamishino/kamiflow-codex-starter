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
export const skillPackagePrefix = "resources/skills/kamiflow-core/";
export const installMetaRelativePath = "install-meta.json";
export const installMetaSchemaVersion = 1;
export const RUNTIME_PROFILE_CLIENT = "client-runtime";
export const RUNTIME_PROFILE_DOGFOOD = "dogfood-source-sync";
export { REPO_ROLE_CLIENT, REPO_ROLE_DOGFOOD, detectRepoRole, projectBriefAssetRelativeForRole };

const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

export const packageVersion = String(packageJson.version || "0.0.0");
export const publishedPackageFiles = Object.freeze(
  normalizeRelativePathList(Array.isArray(packageJson.files) ? packageJson.files : [])
);
export const clientRuntimeRequiredFiles = Object.freeze(
  publishedPackageFiles
    .filter((relativePath) => relativePath.startsWith(skillPackagePrefix))
    .map((relativePath) => normalizeRelativePath(relativePath.slice(skillPackagePrefix.length)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
);

export const sourceOnlyRequiredFiles = [
  "assets/project-brief-dogfood.md",
  "assets/forward-tests/scenarios.json"
];

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

export function normalizeRelativePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
}

export function normalizeRelativePathList(values) {
  return [...new Set(values.map((value) => normalizeRelativePath(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function runtimeProfileForRole(role) {
  return role === REPO_ROLE_DOGFOOD ? RUNTIME_PROFILE_DOGFOOD : RUNTIME_PROFILE_CLIENT;
}

export async function getExpectedRuntimeFilesForProfile(runtimeProfile) {
  if (runtimeProfile === RUNTIME_PROFILE_DOGFOOD) {
    return normalizeRelativePathList([
      ...await collectRelativeFilePaths(skillSourceDir),
      installMetaRelativePath
    ]);
  }

  return normalizeRelativePathList([
    ...clientRuntimeRequiredFiles,
    installMetaRelativePath
  ]);
}

export function getComparisonFilesForProfile(runtimeProfile) {
  if (runtimeProfile === RUNTIME_PROFILE_DOGFOOD) {
    return null;
  }
  return clientRuntimeRequiredFiles;
}

export async function buildInstallMeta(role) {
  return {
    schema_version: installMetaSchemaVersion,
    package_version: packageVersion,
    repo_role: role,
    runtime_profile: runtimeProfileForRole(role),
    project_brief_asset: projectBriefAssetRelativeForRole(role).replaceAll("\\", "/"),
    installed_at: new Date().toISOString()
  };
}

export async function writeInstallMeta(skillDir, role) {
  const metadata = await buildInstallMeta(role);
  const metadataPath = path.join(skillDir, installMetaRelativePath);
  await fsp.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return {
    path: metadataPath,
    metadata
  };
}

export async function readInstallMeta(skillDir) {
  const metadataPath = path.join(skillDir, installMetaRelativePath);
  if (!fs.existsSync(metadataPath)) {
    return {
      exists: false,
      valid: false,
      path: metadataPath,
      reason: "missing"
    };
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
    const schemaVersion = Number(parsed?.schema_version);
    const repoRole = String(parsed?.repo_role || "").trim();
    const runtimeProfile = String(parsed?.runtime_profile || "").trim();
    const projectBriefAsset = normalizeRelativePath(parsed?.project_brief_asset || "");
    const installedAt = String(parsed?.installed_at || "").trim();
    const requiredFieldsPresent = schemaVersion === installMetaSchemaVersion
      && (repoRole === REPO_ROLE_CLIENT || repoRole === REPO_ROLE_DOGFOOD)
      && (runtimeProfile === RUNTIME_PROFILE_CLIENT || runtimeProfile === RUNTIME_PROFILE_DOGFOOD)
      && Boolean(projectBriefAsset)
      && Boolean(installedAt);

    if (!requiredFieldsPresent) {
      return {
        exists: true,
        valid: false,
        path: metadataPath,
        reason: "invalid install metadata fields"
      };
    }

    return {
      exists: true,
      valid: true,
      path: metadataPath,
      metadata: {
        schema_version: schemaVersion,
        package_version: String(parsed?.package_version || "").trim(),
        repo_role: repoRole,
        runtime_profile: runtimeProfile,
        project_brief_asset: projectBriefAsset,
        installed_at: installedAt
      }
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      path: metadataPath,
      reason: `invalid JSON: ${error.message}`
    };
  }
}

export async function syncSkillToProject(projectDir) {
  const targetSkillDir = path.join(projectDir, installedSkillDirRelative);
  const hadExistingInstall = await pathExists(targetSkillDir);

  await fsp.rm(targetSkillDir, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(targetSkillDir), { recursive: true });
  await fsp.cp(skillSourceDir, targetSkillDir, { recursive: true, force: true });

  const runtimeState = await ensureRepoRuntimeState(projectDir);
  const installMeta = await writeInstallMeta(targetSkillDir, runtimeState.role);
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
    projectBriefAsset: projectBriefAssetRelativeForRole(runtimeState.role),
    installMetaPath: installMeta.path,
    installMetaProfile: installMeta.metadata.runtime_profile
  };
}

export function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n");
}
