import path from "node:path";
import {
  donePlanDirRelative,
  ensureProjectDir,
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
    repoContractPath,
    repoContractCreated,
    repoContractExcluded,
    repoContractKind,
    projectBriefPath,
    projectBriefCreated,
    projectBriefAsset
  } = await syncSkillToProject(projectDir);

  const action = hadExistingInstall ? "Refreshed" : "Installed";
  const repoContractStatus = role === REPO_ROLE_CLIENT
    ? `${repoContractPath}${repoContractCreated ? " (created local-only)" : " (preserved)"}${repoContractExcluded ? " [git-excluded]" : ""}`
    : `${repoContractPath} (tracked source preserved)`;
  const projectBriefStatus = `${projectBriefPath}${projectBriefCreated ? " (created)" : " (preserved)"}`;
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
    `Repo Role: ${role}`,
    `Skill: ${targetSkillDir}`,
    `Repo Contract: ${repoContractStatus}`,
    `Repo Contract Kind: ${repoContractKind}`,
    `Bootstrapped: ${path.join(projectDir, planDirRelative)}`,
    `Done Plans: ${path.join(projectDir, donePlanDirRelative)}`,
    `Project Brief: ${projectBriefStatus}`,
    `Project Brief Template: ${projectBriefAsset}`,
    "Next:",
    ...nextLines,
    "  If Codex is already open in this repo, start a new session or reload the workspace so the skill list refreshes."
  ].join("\n"));
}
