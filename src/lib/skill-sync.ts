import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getRepoRootDir } from "./rules.js";

export const GENERATED_SKILLS_DIR = path.join(".agents", "skills");

export function getSkillsSourceDir(rootDir = getRepoRootDir()) {
  return path.join(rootDir, "resources", "skills");
}

export function getRepoSkillsTargetDir(rootDir = getRepoRootDir()) {
  return path.join(rootDir, GENERATED_SKILLS_DIR);
}

export function getProjectSkillsTargetDir(projectDir) {
  return path.join(projectDir, GENERATED_SKILLS_DIR);
}

export function resolveSkillArtifactPath(targetDir, skillName) {
  return path.join(targetDir, skillName, "SKILL.md");
}

function shouldSkipSkillAsset(name) {
  return name === ".gitkeep" || name === "README.md";
}

function isEperm(err) {
  return Boolean(err && typeof err === "object" && err.code === "EPERM");
}

function toPermissionError(err, targetPath) {
  if (isEperm(err)) {
    return new Error(`Permission denied writing ${targetPath}. Run this command in an elevated terminal.`);
  }
  return err;
}

async function ensureDir(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err) {
    throw toPermissionError(err, dirPath);
  }
}

async function filesAreIdentical(leftPath, rightPath) {
  try {
    const [leftStat, rightStat] = await Promise.all([fsp.stat(leftPath), fsp.stat(rightPath)]);
    if (leftStat.size !== rightStat.size) {
      return false;
    }
    const [left, right] = await Promise.all([fsp.readFile(leftPath), fsp.readFile(rightPath)]);
    return left.equals(right);
  } catch {
    return false;
  }
}

async function copySkillTree(fromDir, toDir, stats, force) {
  await ensureDir(toDir);
  const entries = await fsp.readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipSkillAsset(entry.name)) {
      continue;
    }

    const fromPath = path.join(fromDir, entry.name);
    const toPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      await copySkillTree(fromPath, toPath, stats, force);
      continue;
    }

    if (force && fs.existsSync(toPath) && (await filesAreIdentical(fromPath, toPath))) {
      stats.skipped += 1;
      continue;
    }

    if (fs.existsSync(toPath) && !force) {
      stats.skipped += 1;
      continue;
    }

    await ensureDir(path.dirname(toPath));
    try {
      await fsp.copyFile(fromPath, toPath);
    } catch (err) {
      if (isEperm(err) && fs.existsSync(toPath) && (await filesAreIdentical(fromPath, toPath))) {
        stats.skipped += 1;
        stats.protected_skips += 1;
        continue;
      }

      if (isEperm(err) && force && fs.existsSync(toPath)) {
        try {
          await fsp.chmod(toPath, 0o666);
          await fsp.copyFile(fromPath, toPath);
          stats.copied += 1;
          continue;
        } catch (retryErr) {
          throw toPermissionError(retryErr, toPath);
        }
      }

      throw toPermissionError(err, toPath);
    }

    stats.copied += 1;
  }
}

export async function syncSkillsArtifacts({
  sourceDir = getSkillsSourceDir(),
  targetDir = getRepoSkillsTargetDir(),
  includeSkills = [],
  force = false
} = {}) {
  if (!fs.existsSync(sourceDir)) {
    return {
      copied: 0,
      skipped: 0,
      protected_skips: 0,
      missing_source: true,
      synced_skills: []
    };
  }

  const includeSet = new Set((includeSkills || []).filter(Boolean));
  const requestedSkills = [...includeSet];
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const syncedSkills = includeSet.size > 0
    ? skillDirs.filter((name) => includeSet.has(name))
    : skillDirs;

  const missingSkills = requestedSkills.filter((name) => !skillDirs.includes(name));
  if (missingSkills.length > 0) {
    throw new Error(
      `Missing skill source directories: ${missingSkills.map((name) => path.join(sourceDir, name)).join(", ")}`
    );
  }

  const stats = {
    copied: 0,
    skipped: 0,
    protected_skips: 0,
    missing_source: false,
    synced_skills: syncedSkills
  };

  for (const skillName of syncedSkills) {
    await copySkillTree(path.join(sourceDir, skillName), path.join(targetDir, skillName), stats, force);
  }

  return stats;
}
