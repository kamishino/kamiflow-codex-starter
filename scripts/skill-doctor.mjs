#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  collectRelativeFilePaths,
  computeTreeDigest,
  detectRepoRole,
  donePlanDirRelative,
  installedSkillDirRelative,
  parseCliArgs,
  pathExists,
  planDirRelative,
  projectBriefAssetRelativeForRole,
  projectBriefRelative,
  REPO_ROLE_CLIENT,
  repoRoot,
  rootAgentsRelative,
  runtimeRequiredFiles,
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
const role = await detectRepoRole(projectDir);
const recovery = role === REPO_ROLE_CLIENT
  ? "npx --package @kamishino/kamiflow-core kamiflow-core install --project ."
  : "npm run skill:sync";
const runtimeSkillDirExists = await pathExists(runtimeSkillDir);
const gitExcludePath = await resolveGitExcludePath(projectDir);
const repoContractText = fs.existsSync(repoContractPath) ? await fs.promises.readFile(repoContractPath, "utf8") : "";

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
  for (const relativePath of runtimeRequiredFiles) {
    const absolutePath = path.join(runtimeSkillDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      findings.push(`Missing runtime file: ${path.join(installedSkillDirRelative, relativePath).replaceAll("\\", "/")}`);
    }
  }
}

const sourceFiles = await collectRelativeFilePaths(skillSourceDir);
const runtimeFiles = runtimeSkillDirExists ? await collectRelativeFilePaths(runtimeSkillDir) : [];
if (sourceFiles.length === 0) {
  findings.push("Skill source tree is empty.");
}

if (sourceFiles.length > 0 && runtimeFiles.length > 0) {
  const sourceDigest = await computeTreeDigest(skillSourceDir, sourceFiles);
  const runtimeDigest = await computeTreeDigest(runtimeSkillDir, runtimeFiles);
  const sourceFileList = sourceFiles.join("\n");
  const runtimeFileList = runtimeFiles.join("\n");

  if (sourceFileList !== runtimeFileList) {
    findings.push("Runtime file set does not match the SSOT skill tree.");
  } else if (sourceDigest !== runtimeDigest) {
    findings.push("Runtime skill contents are stale relative to the SSOT source.");
  }
}

const ok = findings.length === 0;
console.log([
  `Repo Skill Status: ${ok ? "PASS" : "BLOCK"}`,
  `Project: ${projectDir}`,
  `Repo Role: ${role}`,
  `Repo Contract: ${path.relative(projectDir, repoContractPath).replaceAll("\\", "/")} (${repoContractKindForRole(role)})`,
  `Project Brief: ${path.relative(projectDir, projectBriefPath).replaceAll("\\", "/")} (${projectBriefAssetRelativeForRole(role).replaceAll("\\", "/")})`,
  `Source Skill: ${path.relative(repoRoot, skillSourceDir).replaceAll("\\", "/")}`,
  `Runtime Skill: ${path.relative(projectDir, runtimeSkillDir).replaceAll("\\", "/")}`,
  `Codex Visibility Smoke: ${ok ? "PASS" : "BLOCK"}`,
  ok
    ? "Reason: Repo contract, project brief, plan workspace, and runtime skill are present and current for this repo role."
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
