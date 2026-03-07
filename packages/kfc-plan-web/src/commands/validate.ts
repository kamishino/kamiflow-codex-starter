import fs from "node:fs/promises";
import path from "node:path";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { resolvePlansDir, resolveProjectDir } from "../lib/paths.js";

async function listMarkdownFiles(dirPath) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name));
}

export async function runValidate(args) {
  const projectDir = resolveProjectDir(args);
  const plansDir = resolvePlansDir(projectDir);
  const files = await listMarkdownFiles(plansDir);

  if (files.length === 0) {
    console.log(`[kfc-plan] No plan files found in: ${plansDir}`);
    return 0;
  }

  let hasErrors = false;
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    let parsed;
    try {
      parsed = parsePlanFileContent(raw, filePath);
    } catch (err) {
      hasErrors = true;
      console.error(`[kfc-plan] INVALID ${filePath}`);
      console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const errors = validateParsedPlan(parsed);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`[kfc-plan] INVALID ${filePath}`);
      for (const message of errors) {
        console.error(`  - ${message}`);
      }
      continue;
    }

    console.log(`[kfc-plan] OK ${filePath}`);
  }

  return hasErrors ? 1 : 0;
}
