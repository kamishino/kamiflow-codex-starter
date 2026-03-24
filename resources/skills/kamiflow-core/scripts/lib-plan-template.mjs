import fsp from "node:fs/promises";
import path from "node:path";
import {
  PLAN_DIR,
  RELEASE_IMPACT_SECTION,
  ensureRepoRuntimeState,
  extractSection,
  localDateStamp,
  nowIso,
  readReleasePolicy
} from "./lib-plan-workspace.mjs";
import {
  nextPlanSequence,
  readPlanRecord,
  serializeFrontmatter,
  splitFrontmatter
} from "./lib-plan-records.mjs";

export function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "workflow";
}

export function routeToMode(route = "plan") {
  return route === "build" || route === "fix" ? "Build" : "Plan";
}

export function ensureReleaseImpactSectionContent(markdown, releasePolicy) {
  if (!releasePolicy?.enabled) {
    return {
      changed: false,
      content: markdown
    };
  }

  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(markdown);
  if (extractSection(body, RELEASE_IMPACT_SECTION)) {
    return {
      changed: false,
      content: markdown
    };
  }

  const sectionBlock = [
    `## ${RELEASE_IMPACT_SECTION}`,
    "- Impact: Unknown",
    "- Reason: Resolve before PASS archive in this SemVer-enabled repo."
  ].join("\n");

  const insertionMarker = /^## Implementation Tasks\s*$/m;
  const nextBody = insertionMarker.test(body)
    ? body.replace(insertionMarker, `${sectionBlock}\n\n## Implementation Tasks`)
    : `${body.trimEnd()}\n\n${sectionBlock}\n`;
  const serialized = hasFrontmatter
    ? `${serializeFrontmatter(frontmatter)}\n${nextBody.trimEnd()}\n`
    : `${nextBody.trimEnd()}\n`;

  return {
    changed: true,
    content: serialized
  };
}

export function buildPlanTemplate({ planId, title, route, topic, parentPlanId = "null", releasePolicy = null }) {
  const createdAt = nowIso();
  const selectedMode = routeToMode(route);
  const nextCommand = route === "start" || route === "research" ? "plan" : route === "plan" ? "build" : route;
  const nextMode = route === "build" || route === "fix" ? "Plan" : route === "plan" ? "Build" : "Plan";
  const frontmatter = {
    plan_id: planId,
    title,
    status: "draft",
    decision: "PENDING",
    selected_mode: selectedMode,
    next_mode: nextMode,
    next_command: nextCommand,
    diagram_mode: "auto",
    updated_at: createdAt,
    lifecycle_phase: route,
    request_id: `kamiflow-core-${planId.toLowerCase()}`,
    parent_plan_id: parentPlanId,
    archived_at: null
  };

  const goalLines = topic
    ? [
      `- Outcome: ${topic}`,
      "- Out of scope: Replace with the explicit non-goal for this slice."
    ]
    : [
      "- Outcome: Replace with the concrete implementation outcome for this slice.",
      "- Out of scope: Replace with the explicit non-goal for this slice."
    ];
  const body = [
    "## Start Summary",
    "- Required: no",
    "- Reason: Kami Flow Core created this plan because no active non-done plan was available.",
    "- Selected Idea: Pending clarification.",
    "- Alternatives Considered: None yet.",
    "- Pre-mortem Risk: Unknown until scope is clarified.",
    "- Handoff Confidence: 3",
    "",
    "## Goal",
    ...goalLines,
    "",
    "## Scope (In/Out)",
    "- In: Replace with the concrete implementation slice for this plan.",
    "- Out: Replace with the explicit non-goals for this slice.",
    "",
    "## Constraints",
    "- Technical: Replace with the real technical constraints for this slice.",
    "- Risk: Replace with the main execution risk for this slice.",
    "",
    "## Project Fit",
    "- Relevant priority: Replace with one priority from .local/project.md.",
    "- Relevant guardrail: Replace with one guardrail from .local/project.md.",
    "",
    "## Assumptions",
    "- [ ] Replace with validated assumptions or remove this placeholder.",
    "",
    "## Open Decisions",
    "- [ ] Replace with decision-complete answers before build.",
    "- Remaining Count: 1",
    "",
    ...(releasePolicy?.enabled ? [
      `## ${RELEASE_IMPACT_SECTION}`,
      "- Impact: Unknown",
      "- Reason: Resolve before PASS archive in this SemVer-enabled repo.",
      ""
    ] : []),
    "## Implementation Tasks",
    "- [ ] Replace with the first concrete implementation step.",
    "",
    "## Acceptance Criteria",
    "- [ ] Replace with one concrete acceptance check.",
    "",
    "## Validation Commands",
    "- `replace-with-runnable-command`",
    "",
    "## Risks & Rollback",
    "- Risk: Replace with the main risk for this slice.",
    "- Mitigation: Replace with the concrete mitigation for that risk.",
    "- Rollback: Replace with the scoped rollback path if the slice fails.",
    "",
    "## Go/No-Go Checklist",
    "- [ ] Goal is explicit",
    "- [ ] Scope in/out is explicit",
    "- [ ] No unresolved high-impact decisions",
    "- [ ] Tasks and validation commands are implementation-ready",
    "",
    "## Handoff",
    `- Next command: ${nextCommand}`,
    `- Next mode: ${nextMode}`,
    "",
    "## WIP Log",
    `- ${createdAt} - Status: Plan created by Kami Flow Core.`,
    `- ${createdAt} - Blockers: Clarify scope and replace placeholder sections.`,
    `- ${createdAt} - Next step: Run the appropriate route and update this plan directly.`
  ].join("\n");

  return `${serializeFrontmatter(frontmatter)}\n${body}\n`;
}

export async function createPlan(projectDir, { route = "plan", topic = "" } = {}) {
  await ensureRepoRuntimeState(projectDir);
  const releasePolicy = await readReleasePolicy(projectDir);
  const dateStamp = localDateStamp();
  const seq = await nextPlanSequence(projectDir, dateStamp);
  const topicSlug = topic ? `-${slugify(topic)}` : "";
  const fileName = `${dateStamp}-${String(seq).padStart(3, "0")}-${route}${topicSlug}.md`;
  const planPath = path.join(projectDir, PLAN_DIR, fileName);
  const planId = `PLAN-${dateStamp}-${String(seq).padStart(3, "0")}`;
  const title = `${route}${topic ? `-${slugify(topic)}` : "-workflow"}`;
  const content = buildPlanTemplate({ planId, title, route, topic, releasePolicy });
  await fsp.writeFile(planPath, content, "utf8");
  return await readPlanRecord(planPath);
}
