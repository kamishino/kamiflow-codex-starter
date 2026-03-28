#!/usr/bin/env node
import fsp from "node:fs/promises";
import path from "node:path";
import {
  analyzePlanCleanup,
  buildPlanHygieneSummary,
  createPlan,
  ensureReleaseImpactSectionContent,
  ensureRepoRuntimeState,
  parseCliArgs,
  printJson,
  readPlanRecord,
  readReleasePolicy,
  resolveActivePlan,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(args.project || ".");
const route = String(args.route || "plan").trim() || "plan";
const topic = String(args.topic || "").trim();
const forceNew = Boolean(args.new);

const runtimeState = await ensureRepoRuntimeState(projectDir);
const releasePolicy = await readReleasePolicy(projectDir);
const hygieneBefore = buildPlanHygieneSummary(await analyzePlanCleanup(projectDir));

const activePlan = forceNew ? null : await resolveActivePlan(projectDir);
if (activePlan) {
  let resolvedPlan = activePlan;
  const nextPlanContent = ensureReleaseImpactSectionContent(activePlan.content, releasePolicy);
  if (nextPlanContent.changed) {
    await fsp.writeFile(activePlan.path, nextPlanContent.content, "utf8");
    resolvedPlan = await readPlanRecord(activePlan.path);
  }
  const hygieneAfter = buildPlanHygieneSummary(await analyzePlanCleanup(projectDir));

  printJson({
    ok: true,
    created: false,
    repo_role: runtimeState.role,
    plan_id: resolvedPlan.frontmatter.plan_id || "",
    plan_path: resolvedPlan.path,
    repo_contract_path: runtimeState.repoContract.path,
    repo_contract_created: runtimeState.repoContract.created,
    project_brief_path: runtimeState.projectBrief.path,
    project_brief_created: runtimeState.projectBrief.created,
    next_command: resolvedPlan.frontmatter.next_command || "plan",
    next_mode: resolvedPlan.frontmatter.next_mode || "Plan",
    hygiene: {
      before: hygieneBefore,
      after: hygieneAfter
    },
    recovery: `node ${path.join(".agents", "skills", "kamiflow-core", "scripts", "ensure-plan.mjs")} --project . --new`
  });
  process.exit(0);
}

const createdPlan = await createPlan(projectDir, { route, topic });
const hygieneAfter = buildPlanHygieneSummary(await analyzePlanCleanup(projectDir));
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
  next_mode: createdPlan.frontmatter.next_mode || "Plan",
  hygiene: {
    before: hygieneBefore,
    after: hygieneAfter
  }
});
