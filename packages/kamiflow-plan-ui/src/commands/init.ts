import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlansDir, resolveProjectDir } from "../lib/paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/plan-template.md");

function buildDefaultPlanFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}-new-plan.md`;
}

export async function runInit(args) {
  const projectDir = resolveProjectDir(args);
  const plansDir = resolvePlansDir(projectDir);
  await fs.mkdir(plansDir, { recursive: true });

  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const fileName = buildDefaultPlanFileName();
  const targetPath = path.join(plansDir, fileName);

  let exists = false;
  try {
    await fs.access(targetPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    await fs.writeFile(targetPath, template, "utf8");
    console.log(`[kfp] Created template: ${targetPath}`);
  } else {
    console.log(`[kfp] Template already exists: ${targetPath}`);
  }

  console.log(`[kfp] Plans directory ready: ${plansDir}`);
  return 0;
}
