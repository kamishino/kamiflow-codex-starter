#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  clientRuntimeRequiredFiles,
  collectRelativeFilePaths,
  computeTreeDigest,
  detectRepoRole,
  donePlanDirRelative,
  getExpectedRuntimeFilesForProfile,
  installMetaRelativePath,
  installedSkillDirRelative,
  parseCliArgs,
  pathExists,
  planDirRelative,
  projectBriefAssetRelativeForRole,
  projectBriefRelative,
  readInstallMeta,
  REPO_ROLE_CLIENT,
  repoRoot,
  rootAgentsRelative,
  runtimeProfileForRole,
  skillSourceDir
} from "./skill-runtime.mjs";
import {
  hasGitExcludeEntry,
  repoContractKindForRole,
  resolveGitExcludePath
} from "../resources/skills/kamiflow-core/scripts/lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = path.resolve(process.cwd(), String(args.project || "."));
const runtimeSkillDir = path.join(projectDir, installedSkillDirRelative);
const planDir = path.join(projectDir, planDirRelative);
const donePlanDir = path.join(projectDir, donePlanDirRelative);
const projectBriefPath = path.join(projectDir, projectBriefRelative);
const repoContractPath = path.join(projectDir, rootAgentsRelative);
const findings = [];
const heuristicRole = await detectRepoRole(projectDir);
const recovery = heuristicRole === REPO_ROLE_CLIENT
  ? "npx --package @kamishino/kamiflow-core kamiflow-core install --project ."
  : "npm run skill:sync";
const runtimeSkillDirExists = await pathExists(runtimeSkillDir);
const gitExcludePath = await resolveGitExcludePath(projectDir);
const repoContractText = fs.existsSync(repoContractPath) ? await fs.promises.readFile(repoContractPath, "utf8") : "";
const installMeta = runtimeSkillDirExists ? await readInstallMeta(runtimeSkillDir) : {
  exists: false,
  valid: false,
  path: path.join(runtimeSkillDir, installMetaRelativePath),
  reason: "missing"
};
const role = installMeta.valid ? installMeta.metadata.repo_role : heuristicRole;
const runtimeProfile = installMeta.valid ? installMeta.metadata.runtime_profile : runtimeProfileForRole(heuristicRole);
const roleSource = installMeta.valid ? "install-meta" : "heuristic fallback";
const expectedProjectBriefAsset = projectBriefAssetRelativeForRole(role).replaceAll("\\", "/");

for (const requiredDir of [runtimeSkillDir, planDir, donePlanDir]) {
  if (!(await pathExists(requiredDir))) {
    findings.push(`Missing required directory: ${path.relative(projectDir, requiredDir).replaceAll("\\", "/")}`);
  }
}

if (!(await pathExists(projectBriefPath))) {
  findings.push(`Missing runtime file: ${projectBriefRelative.replaceAll("\\", "/")}`);
}

if (!(await pathExists(repoContractPath))) {
  findings.push(`Missing repo contract: ${rootAgentsRelative}`);
}

if (role === REPO_ROLE_CLIENT && gitExcludePath && /generated local repo contract for a client project/i.test(repoContractText)) {
  const excluded = await hasGitExcludeEntry(projectDir, rootAgentsRelative);
  if (!excluded) {
    findings.push(`Generated repo contract is not excluded in ${path.relative(projectDir, gitExcludePath).replaceAll("\\", "/")}`);
  }
}

if (runtimeSkillDirExists) {
  if (!installMeta.valid) {
    const metadataReason = installMeta.exists
      ? `Runtime metadata is invalid at ${path.relative(projectDir, installMeta.path).replaceAll("\\", "/")}: ${installMeta.reason}.`
      : `Runtime metadata is missing at ${path.relative(projectDir, installMeta.path).replaceAll("\\", "/")}; reinstall to mark this ${heuristicRole} runtime.`;
    findings.push(metadataReason);
  } else {
    if (installMeta.metadata.project_brief_asset !== expectedProjectBriefAsset) {
      findings.push(`Install metadata project brief asset does not match repo role ${role}.`);
    }
    if (installMeta.metadata.repo_role !== heuristicRole) {
      findings.push(`Install metadata repo role ${installMeta.metadata.repo_role} does not match detected repo role ${heuristicRole}.`);
    }
  }

  const runtimeFiles = await collectRelativeFilePaths(runtimeSkillDir);
  const runtimeFilesWithoutMeta = runtimeFiles.filter((relativePath) => relativePath !== installMetaRelativePath);
  const expectedRuntimeFiles = await getExpectedRuntimeFilesForProfile(runtimeProfile);
  const expectedFilesWithoutMeta = expectedRuntimeFiles.filter((relativePath) => relativePath !== installMetaRelativePath);
  const runtimeFileList = runtimeFilesWithoutMeta.join("\n");
  const expectedFileList = expectedFilesWithoutMeta.join("\n");

  if (runtimeFileList !== expectedFileList) {
    findings.push(
      runtimeProfile === "dogfood-source-sync"
        ? "Dogfood runtime file set does not match the SSOT source tree."
        : "Client runtime file set does not match the published package manifest."
    );
  } else if (expectedFilesWithoutMeta.length > 0) {
    const sourceDigestPaths = runtimeProfile === "dogfood-source-sync"
      ? expectedFilesWithoutMeta
      : clientRuntimeRequiredFiles;
    const sourceDigest = await computeTreeDigest(skillSourceDir, sourceDigestPaths);
    const runtimeDigest = await computeTreeDigest(runtimeSkillDir, sourceDigestPaths);
    if (sourceDigest !== runtimeDigest) {
      findings.push(
        runtimeProfile === "dogfood-source-sync"
          ? "Dogfood runtime contents are stale relative to the SSOT source."
          : "Client runtime contents are stale relative to the published package manifest."
      );
    }
  }
}

const ok = findings.length === 0;
const metadataStatus = installMeta.valid
  ? "present"
  : installMeta.exists
    ? `invalid (${installMeta.reason})`
    : runtimeSkillDirExists
      ? "missing (legacy runtime)"
      : "missing";

console.log([
  `Repo Skill Status: ${ok ? "PASS" : "BLOCK"}`,
  `Project: ${projectDir}`,
  `Repo Role: ${role} (${roleSource})`,
  `Runtime Profile: ${runtimeProfile}`,
  `Runtime Metadata: ${path.relative(projectDir, installMeta.path).replaceAll("\\", "/")} (${metadataStatus})`,
  `Repo Contract: ${path.relative(projectDir, repoContractPath).replaceAll("\\", "/")} (${repoContractKindForRole(role)})`,
  `Project Brief: ${path.relative(projectDir, projectBriefPath).replaceAll("\\", "/")} (${expectedProjectBriefAsset})`,
  `Source Skill: ${path.relative(repoRoot, skillSourceDir).replaceAll("\\", "/")}`,
  `Runtime Skill: ${path.relative(projectDir, runtimeSkillDir).replaceAll("\\", "/")}`,
  `Codex Visibility Smoke: ${ok ? "PASS" : "BLOCK"}`,
  ok
    ? "Reason: Repo contract, project brief, plan workspace, runtime profile, and runtime contents are present and current for this repo role."
    : `Reason: ${findings[0]}`,
  `Recovery: ${recovery}`
].join("\n"));

if (!ok && findings.length > 1) {
  for (const finding of findings.slice(1)) {
    console.log(`Finding: ${finding}`);
  }
}

if (!ok) {
  process.exit(1);
}
