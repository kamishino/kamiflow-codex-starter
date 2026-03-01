import fs from "node:fs/promises";
import path from "node:path";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { resolvePlansDir } from "./paths.js";
import type { ParsedPlan, PlanRecord, PlanSummary } from "../types.js";

function toSummary(parsed: ParsedPlan, errors: string[]): PlanSummary {
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
    duplicate_plan_id: false
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

export async function loadPlans(projectDir) {
  const plansDir = resolvePlansDir(projectDir);
  const files = await listMarkdownFiles(plansDir);
  const plans: PlanRecord[] = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    try {
      const parsed = parsePlanFileContent(raw, filePath);
      const errors = validateParsedPlan(parsed);
      const summary = toSummary(parsed, errors);
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
          duplicate_plan_id: false
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

  plans.sort((a, b) => a.summary.plan_id.localeCompare(b.summary.plan_id));
  return plans;
}

export async function loadPlanById(projectDir, planId) {
  const plans = await loadPlans(projectDir);
  return plans.find((item) => item.summary.plan_id === planId) ?? null;
}

export async function loadPlanByFilePath(projectDir, filePath) {
  const plans = await loadPlans(projectDir);
  const normalizedPath = path.resolve(filePath);
  return plans.find((item) => path.resolve(item.summary.file_path) === normalizedPath) ?? null;
}
