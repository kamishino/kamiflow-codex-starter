#!/usr/bin/env node
import path from "node:path";
import {
  createPlan,
  ensureRepoRuntimeState,
  parseCliArgs,
  printJson,
  resolveActivePlan,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(args.project || ".");
const route = String(args.route || "plan").trim() || "plan";
const topic = String(args.topic || "").trim();
const forceNew = Boolean(args.new);

const runtimeState = await ensureRepoRuntimeState(projectDir);

const activePlan = forceNew ? null : await resolveActivePlan(projectDir);
if (activePlan) {
  printJson({
    ok: true,
    created: false,
    repo_role: runtimeState.role,
    plan_id: activePlan.frontmatter.plan_id || "",
    plan_path: activePlan.path,
    repo_contract_path: runtimeState.repoContract.path,
    repo_contract_created: runtimeState.repoContract.created,
    project_brief_path: runtimeState.projectBrief.path,
    project_brief_created: runtimeState.projectBrief.created,
    next_command: activePlan.frontmatter.next_command || "plan",
    next_mode: activePlan.frontmatter.next_mode || "Plan",
    recovery: `node ${path.join(".agents", "skills", "kamiflow-core", "scripts", "ensure-plan.mjs")} --project . --new`
  });
  process.exit(0);
}

const createdPlan = await createPlan(projectDir, { route, topic });
printJson({
  ok: true,
  created: true,
  repo_role: runtimeState.role,
  plan_id: createdPlan.frontmatter.plan_id || "",
  plan_path: createdPlan.path,
  repo_contract_path: runtimeState.repoContract.path,
  repo_contract_created: runtimeState.repoContract.created,
  project_brief_path: runtimeState.projectBrief.path,
  project_brief_created: runtimeState.projectBrief.created,
  next_command: createdPlan.frontmatter.next_command || "plan",
  next_mode: createdPlan.frontmatter.next_mode || "Plan"
});
