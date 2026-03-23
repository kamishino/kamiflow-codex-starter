#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  countCheckboxes,
  DONE_PLAN_DIR,
  extractSection,
  parseReleaseImpact,
  readReleasePolicy,
  nowIso,
  parseCliArgs,
  printJson,
  pruneDonePlans,
  resolvePlanRef,
  resolveProjectDir,
  serializeFrontmatter,
  splitFrontmatter
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

if (releasePolicy.enabled) {
  if (!releasePolicy.valid) {
    printJson({
      ok: false,
      archived: false,
      plan_id: plan.frontmatter.plan_id || "",
      plan_path: plan.path,
      reason: `Archive gate failed because AGENTS.md Release Policy is invalid: ${releasePolicy.errors[0]}`,
      recovery: "Fix the Release Policy block in AGENTS.md before archiving a PASS plan."
    });
    process.exit(1);
  }

  const releaseImpact = parseReleaseImpact(plan.content);
  if (!releaseImpact.valid) {
    printJson({
      ok: false,
      archived: false,
      plan_id: plan.frontmatter.plan_id || "",
      plan_path: plan.path,
      reason: `Archive gate failed because Release Impact is missing or unresolved: ${releaseImpact.errors[0]}`,
      recovery: "Resolve the Release Impact section with none, patch, minor, or major plus a short reason before archiving."
    });
    process.exit(1);
  }
}

const implementationCounts = countCheckboxes(extractSection(plan.content, "Implementation Tasks"));
const acceptanceCounts = countCheckboxes(extractSection(plan.content, "Acceptance Criteria"));
const goNoGoCounts = countCheckboxes(extractSection(plan.content, "Go/No-Go Checklist"));
const complete = implementationCounts.total > 0 && acceptanceCounts.total > 0 && goNoGoCounts.total > 0
  && implementationCounts.total === implementationCounts.checked
  && acceptanceCounts.total === acceptanceCounts.checked
  && goNoGoCounts.total === goNoGoCounts.checked;

if (!complete) {
  printJson({
    ok: false,
    archived: false,
    plan_id: plan.frontmatter.plan_id || "",
    plan_path: plan.path,
    reason: "Archive gate failed because not all checklist items are checked.",
    recovery: "Complete Implementation Tasks, Acceptance Criteria, and Go/No-Go Checklist before archiving."
  });
  process.exit(1);
}

const { body } = splitFrontmatter(plan.content);
const archivedAt = nowIso();
const nextFrontmatter = {
  ...plan.frontmatter,
  status: "done",
  decision: "PASS",
  selected_mode: "Plan",
  next_command: "done",
  next_mode: "done",
  lifecycle_phase: "done",
  updated_at: archivedAt,
  archived_at: archivedAt
};
const archiveWipLines = [
  `- ${archivedAt} - Status: Archived after PASS closeout.`,
  `- ${archivedAt} - Blockers: None.`,
  `- ${archivedAt} - Next step: Done.`
].join("\n");
const trimmedBody = body.trimEnd();
const nextBody = /^## WIP Log\s*$/m.test(trimmedBody)
  ? trimmedBody.replace(/^## WIP Log\s*$/m, `## WIP Log\n${archiveWipLines}`)
  : `${trimmedBody}\n\n## WIP Log\n${archiveWipLines}`;
const nextContent = `${serializeFrontmatter(nextFrontmatter)}\n${nextBody}\n`;
const targetPath = path.join(projectDir, DONE_PLAN_DIR, path.basename(plan.path));
if (fs.existsSync(targetPath)) {
  printJson({
    ok: false,
    archived: false,
    reason: `Done plan already exists at ${targetPath}`,
    recovery: "Remove or rename the conflicting done plan before retrying archive."
  });
  process.exit(1);
}

await fsp.mkdir(path.dirname(targetPath), { recursive: true });
await fsp.writeFile(plan.path, nextContent, "utf8");
await fsp.rename(plan.path, targetPath);
const pruned = await pruneDonePlans(projectDir, 20);
printJson({
  ok: true,
  archived: true,
  plan_id: nextFrontmatter.plan_id || "",
  archived_at: archivedAt,
  archived_path: targetPath,
  pruned
});
