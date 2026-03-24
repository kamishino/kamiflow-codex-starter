#!/usr/bin/env node
import {
  archivePassPlan,
  assessPlanCloseout,
  readReleasePolicy,
  parseCliArgs,
  printJson,
  resolvePlanRef,
  resolveProjectDir
} from "./lib-plan.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(args.project || ".");
const requestedPlan = String(args.plan || "").trim();
const plan = await resolvePlanRef(projectDir, requestedPlan);
const releasePolicy = await readReleasePolicy(projectDir);

if (!plan) {
  printJson({
    ok: false,
    archived: false,
    reason: "No active plan matched the requested reference.",
    recovery: "node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project ."
  });
  process.exit(1);
}

const closeout = assessPlanCloseout(plan, releasePolicy);
if (!closeout.ok) {
  printJson({
    ok: false,
    archived: false,
    plan_id: plan.frontmatter.plan_id || "",
    plan_path: plan.path,
    reason: `Archive gate failed: ${closeout.findings[0]}`,
    recovery: "Resolve checklist, validation, and Release Impact gates before archiving."
  });
  process.exit(1);
}
let archived;
try {
  archived = await archivePassPlan(projectDir, plan);
} catch (error) {
  printJson({
    ok: false,
    archived: false,
    plan_id: plan.frontmatter.plan_id || "",
    plan_path: plan.path,
    reason: error.message,
    recovery: "Remove or rename the conflicting done plan before retrying archive."
  });
  process.exit(1);
}

printJson({
  ok: true,
  archived: true,
  plan_id: plan.frontmatter.plan_id || "",
  archived_at: archived.archived_at,
  archived_path: archived.archived_path,
  rolled_over: archived.rolled_over
});
