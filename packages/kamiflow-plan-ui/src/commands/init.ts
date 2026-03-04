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

function toIsoNow(): string {
  return new Date().toISOString();
}

function humanizeSlug(slug: string, fallback = "Plan"): string {
  const value = String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim();
  return value || fallback;
}

function parsePlanFileIdentity(targetPath: string, topic: string, route: string): {
  date: string;
  seq: string;
  title: string;
} {
  const fallbackDate = toLocalDateStamp();
  const baseName = path.basename(targetPath, ".md");
  const match = baseName.match(/^(?<date>\d{4}-\d{2}-\d{2})(?:-(?<seq>\d{3}))?(?:-(?<slug>.+))?$/i);
  const date = match?.groups?.date || fallbackDate;
  const seq = match?.groups?.seq || "001";
  const slug = String(match?.groups?.slug || "").trim();
  const slugParts = slug.split("-").filter(Boolean);
  const normalizedRoute = slugifySegment(slugParts[0] || route || "plan", "plan");
  const topicSlug = slugParts.length > 1
    ? slugifySegment(slugParts.slice(1).join("-"), "")
    : slugifySegment(topic || "", "");
  const rawTopic = String(topic || "").trim();
  const title = rawTopic || humanizeSlug(topicSlug, `${humanizeSlug(normalizedRoute)} Plan`);
  return { date, seq, title };
}

function updateFrontmatterField(markdown: string, key: string, value: string): string {
  const text = String(markdown || "");
  if (!text.startsWith("---")) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return text;
  }

  const targetPrefix = `${key}:`;
  let found = false;
  for (let i = 1; i < endIdx; i += 1) {
    if (lines[i].trim().startsWith(targetPrefix)) {
      lines[i] = `${key}: ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.splice(endIdx, 0, `${key}: ${value}`);
  }
  return lines.join("\n");
}

function materializeTemplate(template: string, targetPath: string, topic: string, route: string): string {
  const identity = parsePlanFileIdentity(targetPath, topic, route);
  const planId = `PLAN-${identity.date}-${identity.seq}`;
  let next = String(template || "");
  next = updateFrontmatterField(next, "plan_id", planId);
  next = updateFrontmatterField(next, "title", identity.title);
  next = updateFrontmatterField(next, "updated_at", toIsoNow());
  return next;
}

function buildDefaultPlanFileName(topic: string, route: string) {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(topic, route);
  return `${date}-${slugBase}.md`;
}

async function resolveUniqueNewPlanPath(plansDir: string, topic: string, route: string): Promise<string> {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(topic, route);
  const usedSequenceNumbers = new Set<number>();
  const pattern = new RegExp(`^${date}-(\\d{3})(?:-.+)?\\.md$`, "i");

  try {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const match = entry.name.match(pattern);
      if (!match) {
        continue;
      }
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 999) {
        usedSequenceNumbers.add(parsed);
      }
    }
  } catch {
    // plansDir is created before this call; fall back to collision checks below.
  }

  for (let i = 1; i <= 999; i += 1) {
    if (usedSequenceNumbers.has(i)) {
      continue;
    }
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
    const materialized = materializeTemplate(template, targetPath, topic, route);
    await fs.writeFile(targetPath, materialized, "utf8");
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
    const materialized = materializeTemplate(template, targetPath, topic, route);
    await fs.writeFile(targetPath, materialized, "utf8");
    console.log(`[kfp] Created template: ${targetPath}`);
  } else {
    console.log(`[kfp] Template already exists: ${targetPath}`);
  }

  console.log(`[kfp] Plans directory ready: ${plansDir}`);
  return 0;
}
