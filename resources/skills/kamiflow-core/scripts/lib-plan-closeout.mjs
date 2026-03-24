import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  DONE_PLAN_DIR,
  DONE_PLAN_KEEP_LATEST,
  RELEASE_IMPACT_SECTION,
  RELEASE_IMPACT_VALUES,
  extractSection,
  nowIso
} from "./lib-plan-workspace.mjs";
import {
  resolvePlanRecordTimestampInfo,
  serializeFrontmatter,
  splitFrontmatter
} from "./lib-plan-records.mjs";
import {
  applyDoneRollover,
  planDoneRollover
} from "./lib-plan-cleanup.mjs";

export function parseReleaseImpact(markdown) {
  const section = extractSection(markdown, RELEASE_IMPACT_SECTION);
  if (!section) {
    return {
      section_present: false,
      impact: "",
      reason: "",
      valid: false,
      errors: ["Release Impact section is missing."]
    };
  }

  const impact = extractSectionValue(section, "Impact").toLowerCase();
  const reason = extractSectionValue(section, "Reason");
  const errors = [];

  if (!RELEASE_IMPACT_VALUES.includes(impact)) {
    errors.push(`Impact must be one of ${RELEASE_IMPACT_VALUES.join(", ")}. Received: ${impact || "<missing>"}`);
  }
  if (!reason || /^resolve before/i.test(reason) || /^unknown$/i.test(reason)) {
    errors.push("Reason must be resolved before PASS archive.");
  }

  return {
    section_present: true,
    impact,
    reason,
    valid: errors.length === 0,
    errors
  };
}

export function countCheckboxes(sectionText) {
  const text = String(sectionText || "");
  const total = (text.match(/^\s*- \[(?: |x|X)\]/gm) || []).length;
  const checked = (text.match(/^\s*- \[(?:x|X)\]/gm) || []).length;
  return { total, checked };
}

export function extractValidationCommands(sectionText) {
  return [...String(sectionText || "").matchAll(/`([^`]+)`/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
}

export function assessPlanCloseout(plan, releasePolicy) {
  const findings = [];
  const implementationSection = extractSection(plan?.content, "Implementation Tasks");
  const acceptanceSection = extractSection(plan?.content, "Acceptance Criteria");
  const goNoGoSection = extractSection(plan?.content, "Go/No-Go Checklist");
  const validationCommandsSection = extractSection(plan?.content, "Validation Commands");
  const implementationCounts = countCheckboxes(implementationSection);
  const acceptanceCounts = countCheckboxes(acceptanceSection);
  const goNoGoCounts = countCheckboxes(goNoGoSection);
  const validationCommands = extractValidationCommands(validationCommandsSection);

  if (String(plan?.frontmatter?.status || "").toLowerCase() === "done") {
    findings.push("Plan is already archived as done.");
  }

  if (implementationCounts.total === 0 || implementationCounts.total !== implementationCounts.checked) {
    findings.push("Implementation Tasks is not fully checked.");
  }
  if (acceptanceCounts.total === 0 || acceptanceCounts.total !== acceptanceCounts.checked) {
    findings.push("Acceptance Criteria is not fully checked.");
  }
  if (goNoGoCounts.total === 0 || goNoGoCounts.total !== goNoGoCounts.checked) {
    findings.push("Go/No-Go Checklist is not fully checked.");
  }
  if (validationCommands.length === 0) {
    findings.push("Validation Commands is missing runnable commands.");
  }

  const releaseImpact = releasePolicy?.enabled
    ? parseReleaseImpact(plan?.content || "")
    : {
      section_present: false,
      impact: "",
      reason: "",
      valid: true,
      errors: []
    };

  if (releasePolicy?.enabled) {
    if (!releasePolicy.valid) {
      findings.push(`AGENTS.md Release Policy is invalid: ${releasePolicy.errors[0]}`);
    } else if (!releaseImpact.valid) {
      findings.push(`Release Impact is missing or unresolved: ${releaseImpact.errors[0]}`);
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    implementation_counts: implementationCounts,
    acceptance_counts: acceptanceCounts,
    go_no_go_counts: goNoGoCounts,
    validation_commands: validationCommands,
    release_impact: releaseImpact
  };
}

export async function archivePassPlan(projectDir, plan) {
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
    throw new Error(`Done plan already exists at ${targetPath}`);
  }

  const rolloverPlan = await planDoneRollover(projectDir, {
    keep: DONE_PLAN_KEEP_LATEST,
    pendingRecord: {
      ...plan,
      path: targetPath,
      name: path.basename(targetPath),
      frontmatter: nextFrontmatter,
      stat: {
        mtimeMs: resolvePlanRecordTimestampInfo({
          ...plan,
          frontmatter: nextFrontmatter,
          stat: {
            mtimeMs: Date.now()
          }
        }).ms || Date.now()
      }
    }
  });

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(plan.path, nextContent, "utf8");
  await fsp.rename(plan.path, targetPath);
  const rolledOver = await applyDoneRollover(rolloverPlan);
  return {
    archived_at: archivedAt,
    archived_path: targetPath,
    rolled_over: rolledOver
  };
}

function extractSectionValue(sectionText, label) {
  const match = String(sectionText || "").match(new RegExp(`^-\\s+${escapeRegex(label)}:\\s*(.*)$`, "im"));
  return match?.[1]?.trim() || "";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
