import fs from "node:fs/promises";
import path from "node:path";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { resolveDonePlansDir, resolvePlansDir } from "./paths.js";
import type { ParsedPlan, PlanRecord, PlanSummary } from "../types.js";

function toSummary(parsed: ParsedPlan, errors: string[], archivedAt?: string): PlanSummary {
  const normalizedPath = path.normalize(parsed.filePath);
  const archivedMarker = `${path.sep}done${path.sep}`;
  const isArchived = normalizedPath.includes(archivedMarker);
  const isDone = parsed.frontmatter.status === "done" || parsed.frontmatter.next_command === "done";
  return {
    plan_id: parsed.frontmatter.plan_id ?? parsed.fileName,
    title: parsed.frontmatter.title ?? parsed.fileName,
    status: parsed.frontmatter.status ?? "unknown",
    decision: parsed.frontmatter.decision ?? "unknown",
    selected_mode: parsed.frontmatter.selected_mode ?? "unknown",
    next_mode: parsed.frontmatter.next_mode ?? "unknown",
    next_command: parsed.frontmatter.next_command ?? "unknown",
    updated_at: parsed.frontmatter.updated_at ?? "",
    file_path: parsed.filePath,
    is_valid: errors.length === 0,
    error_count: errors.length,
    duplicate_plan_id: false,
    is_done: isDone,
    is_archived: isArchived,
    archived_at: isArchived ? archivedAt : undefined,
    archived_path: isArchived ? parsed.filePath : undefined
  };
}

async function listMarkdownFiles(plansDir) {
  let entries;
  try {
    entries = await fs.readdir(plansDir, { withFileTypes: true });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(plansDir, entry.name));
}

export async function loadPlans(projectDir, options?: { includeDone?: boolean }) {
  const includeDone = options?.includeDone ?? false;
  const plansDir = resolvePlansDir(projectDir);
  const files = await listMarkdownFiles(plansDir);
  let allFiles = files;
  if (includeDone) {
    const doneFiles = await listMarkdownFiles(resolveDonePlansDir(projectDir));
    allFiles = [...files, ...doneFiles];
  }
  const plans: PlanRecord[] = [];

  for (const filePath of allFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    try {
      const parsed = parsePlanFileContent(raw, filePath);
      const errors = validateParsedPlan(parsed);
      const stat = await fs.stat(filePath);
      const summary = toSummary(parsed, errors, stat.mtime.toISOString());
      plans.push({
        summary,
        parsed,
        errors
      });
    } catch (err) {
      plans.push({
        summary: {
          plan_id: path.basename(filePath),
          title: path.basename(filePath),
          status: "invalid",
          decision: "unknown",
          selected_mode: "unknown",
          next_mode: "unknown",
          next_command: "unknown",
          updated_at: "",
          file_path: filePath,
          is_valid: false,
          error_count: 1,
          duplicate_plan_id: false,
          is_done: false,
          is_archived: false,
          archived_at: undefined,
          archived_path: undefined
        },
        parsed: null,
        errors: [err instanceof Error ? err.message : String(err)]
      });
    }
  }

  const idCounts = new Map();
  for (const plan of plans) {
    const id = plan.summary.plan_id;
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const plan of plans) {
    const id = plan.summary.plan_id;
    if ((idCounts.get(id) ?? 0) > 1) {
      plan.errors.push(`Duplicate plan_id detected: ${id}`);
      plan.summary.is_valid = false;
      plan.summary.error_count = plan.errors.length;
      plan.summary.duplicate_plan_id = true;
    }
  }

  plans.sort((a, b) => {
    if (a.summary.plan_id === b.summary.plan_id) {
      if (a.summary.is_archived === b.summary.is_archived) {
        return a.summary.file_path.localeCompare(b.summary.file_path);
      }
      return a.summary.is_archived ? 1 : -1;
    }
    return a.summary.plan_id.localeCompare(b.summary.plan_id);
  });
  return plans;
}

export async function loadPlanById(projectDir, planId, options?: { includeDone?: boolean }) {
  const plans = await loadPlans(projectDir, options);
  return plans.find((item) => item.summary.plan_id === planId) ?? null;
}

export async function loadPlanByFilePath(projectDir, filePath, options?: { includeDone?: boolean }) {
  const plans = await loadPlans(projectDir, options);
  const normalizedPath = path.resolve(filePath);
  return plans.find((item) => path.resolve(item.summary.file_path) === normalizedPath) ?? null;
}
