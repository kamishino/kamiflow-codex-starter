import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePlanFileIdentity,
  resolvePlanFilePath
} from "@kamishino/kfc-runtime/plan-workspace";
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

function toIsoNow(): string {
  return new Date().toISOString();
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
  const identity = parsePlanFileIdentity(targetPath, { topic, route });
  const planId = `PLAN-${identity.date}-${identity.seq}`;
  let next = String(template || "");
  next = updateFrontmatterField(next, "plan_id", planId);
  next = updateFrontmatterField(next, "title", identity.title);
  next = updateFrontmatterField(next, "updated_at", toIsoNow());
  return next;
}

export async function runInit(args) {
  const projectDir = resolveProjectDir(args);
  const plansDir = resolvePlansDir(projectDir);
  await fs.mkdir(plansDir, { recursive: true });
  const forceNew = args.includes("--new");
  const topic = readOption(args, "--topic", readOption(args, "--slug", ""));
  const route = readOption(args, "--route", "plan");

  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const targetPath = await resolvePlanFilePath(plansDir, { topic, route }, { forceNew });

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
    console.log(`[kfc-plan] Created template: ${targetPath}`);
  } else {
    console.log(`[kfc-plan] Template already exists: ${targetPath}`);
  }

  console.log(`[kfc-plan] Plans directory ready: ${plansDir}`);
  return 0;
}
