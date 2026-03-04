import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlansDir, resolveProjectDir } from "../lib/paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/plan-template.md");

function readOption(args: string[], flag: string, fallback = ""): string {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return fallback;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    return fallback;
  }
  return value;
}

function slugifySegment(value: string, fallback = ""): string {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    return fallback;
  }
  return slug;
}

function buildSlugBase(topic: string, route: string): string {
  const safeRoute = slugifySegment(route || "plan", "plan");
  const safeTopic = slugifySegment(topic || "", "");
  const combined = safeTopic ? `${safeRoute}-${safeTopic}` : safeRoute;
  return combined.slice(0, 64).replace(/-+$/g, "") || "plan";
}

function toLocalDateStamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultPlanFileName(topic: string, route: string) {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(topic, route);
  return `${date}-${slugBase}.md`;
}

async function resolveUniqueNewPlanPath(plansDir: string, topic: string, route: string): Promise<string> {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(topic, route);
  for (let i = 1; i <= 999; i += 1) {
    const suffix = String(i).padStart(3, "0");
    const candidate = path.join(plansDir, `${date}-${suffix}-${slugBase}.md`);
    try {
      await fs.access(candidate);
      continue;
    } catch {
      return candidate;
    }
  }
  throw new Error("Unable to allocate new plan filename. Too many plans for today.");
}

export async function runInit(args) {
  const projectDir = resolveProjectDir(args);
  const plansDir = resolvePlansDir(projectDir);
  await fs.mkdir(plansDir, { recursive: true });
  const forceNew = args.includes("--new");
  const topic = readOption(args, "--topic", readOption(args, "--slug", ""));
  const route = readOption(args, "--route", "plan");

  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  if (forceNew) {
    const targetPath = await resolveUniqueNewPlanPath(plansDir, topic, route);
    await fs.writeFile(targetPath, template, "utf8");
    console.log(`[kfp] Created template: ${targetPath}`);
    console.log(`[kfp] Plans directory ready: ${plansDir}`);
    return 0;
  }

  const targetPath = path.join(plansDir, buildDefaultPlanFileName(topic, route));

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
