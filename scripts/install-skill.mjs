import path from "node:path";
import {
  donePlanDirRelative,
  ensureProjectDir,
  installMetaRelativePath,
  parseCliArgs,
  planDirRelative,
  REPO_ROLE_CLIENT,
  syncSkillToProject
} from "./skill-runtime.mjs";

export function printUsage() {
  console.log([
    "Usage:",
    "  kamiflow-core install [--project <path>] [--force]",
    "",
    "Primary install command:",
    "  npx --package @kamishino/kamiflow-core kamiflow-core install --project ."
  ].join("\n"));
}

export async function installSkill(argv = []) {
  const args = parseCliArgs(argv);
  const projectDir = path.resolve(process.cwd(), String(args.project || "."));
  await ensureProjectDir(projectDir);
  const {
    role,
    targetSkillDir,
    hadExistingInstall,
    installMetaPath,
    installMetaProfile,
    repoContractPath,
    repoContractCreated,
    repoContractExcluded,
    repoContractKind,
    projectBriefPath,
    projectBriefCreated,
    projectBriefAsset
  } = await syncSkillToProject(projectDir);

  const action = hadExistingInstall ? "Refreshed" : "Installed";
  const roleLabel = role === REPO_ROLE_CLIENT
    ? "client (default target)"
    : "dogfood (source-repo exception)";
  const repoContractStatus = role === REPO_ROLE_CLIENT
    ? `${repoContractPath}${repoContractCreated ? " (created local-only)" : " (preserved existing)"}${repoContractExcluded ? " [git-excluded]" : ""}`
    : `${repoContractPath} (tracked source preserved)`;
  const projectBriefStatus = `${projectBriefPath}${projectBriefCreated ? " (created)" : " (preserved)"}`;
  const created = [];
  const preserved = [];

  if (!hadExistingInstall) {
    created.push(targetSkillDir);
  }

  if (repoContractCreated) {
    created.push(repoContractPath);
  } else {
    preserved.push(repoContractPath);
  }

  if (projectBriefCreated) {
    created.push(projectBriefPath);
  } else {
    preserved.push(projectBriefPath);
  }

  const nextLines = role === REPO_ROLE_CLIENT
    ? [
        "  Review AGENTS.md first for repo behavior, then keep .local/project.md current as the human-facing product brief.",
        "  node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .",
        "  node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project ."
      ]
    : [
        "  This source repo keeps its tracked root AGENTS.md; only runtime state is generated locally.",
        "  Review .local/project.md as the dogfood project brief for kamiflow-core.",
        "  node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .",
        "  node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project ."
      ];

  console.log([
    `${action} kamiflow-core skill.`,
    `Project: ${projectDir}`,
    `Repo Role: ${roleLabel}`,
    `Runtime Profile: ${installMetaProfile}`,
    `Skill Runtime: ${targetSkillDir}`,
    `Runtime Metadata: ${installMetaPath} (written as ${installMetaRelativePath})`,
    `Repo Contract: ${repoContractStatus}`,
    `Repo Contract Kind: ${repoContractKind}`,
    `Project Brief: ${projectBriefStatus}`,
    `Plan Workspace: ${path.join(projectDir, planDirRelative)} and ${path.join(projectDir, donePlanDirRelative)} (bootstrapped)`,
    `Created: ${created.length > 0 ? created.join(" | ") : "none"}`,
    `Preserved: ${preserved.length > 0 ? preserved.join(" | ") : "none"}`,
    `Project Brief Template: ${projectBriefAsset}`,
    `Skill Refresh: ${hadExistingInstall ? "existing runtime replaced with current source" : "fresh runtime installed"}`,
    "Next:",
    ...nextLines,
    "  If Codex is already open in this repo, start a new session or reload the workspace so the skill list refreshes."
  ].join("\n"));
}
