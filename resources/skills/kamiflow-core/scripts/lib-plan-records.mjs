import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  DONE_PLAN_DIR,
  PLAN_DIR
} from "./lib-plan-workspace.mjs";

const FRONTMATTER_KEYS = [
  "plan_id",
  "title",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "diagram_mode",
  "updated_at",
  "lifecycle_phase",
  "request_id",
  "parent_plan_id",
  "archived_at"
];

export function splitFrontmatter(markdown) {
  const text = String(markdown || "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text, hasFrontmatter: false };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: text, hasFrontmatter: false };
  }

  const rawFrontmatter = match[1];
  const body = text.slice(match[0].length);
  return {
    frontmatter: parseFrontmatter(rawFrontmatter),
    body,
    hasFrontmatter: true
  };
}

export function parseFrontmatter(rawText) {
  const result = {};
  for (const line of String(rawText || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

export function serializeFrontmatter(frontmatter) {
  const orderedKeys = [...FRONTMATTER_KEYS, ...Object.keys(frontmatter).filter((key) => !FRONTMATTER_KEYS.includes(key))];
  const seen = new Set();
  const lines = [];

  for (const key of orderedKeys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (!(key in frontmatter)) {
      continue;
    }
    lines.push(`${key}: ${formatFrontmatterValue(frontmatter[key])}`);
  }

  return `---\n${lines.join("\n")}\n---\n`;
}

export async function readPlanRecord(planPath) {
  const content = await fsp.readFile(planPath, "utf8");
  const stat = await fsp.stat(planPath);
  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(content);
  return {
    path: planPath,
    name: path.basename(planPath),
    content,
    body,
    frontmatter,
    has_frontmatter: hasFrontmatter,
    stat
  };
}

export async function listPlanRecords(projectDir, includeDone = false) {
  const records = [];
  const activeDir = path.join(projectDir, PLAN_DIR);
  if (fs.existsSync(activeDir)) {
    const activeEntries = await fsp.readdir(activeDir, { withFileTypes: true });
    for (const entry of activeEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      records.push(await readPlanRecord(path.join(activeDir, entry.name)));
    }
  }

  if (includeDone) {
    records.push(...await listDonePlanRecords(projectDir, true));
  }

  return records;
}

export async function resolveActivePlan(projectDir) {
  const plans = await listPlanRecords(projectDir, false);
  const active = plans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() !== "done")
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
  return active[0] || null;
}

export async function resolveLatestDonePlan(projectDir) {
  const plans = await listDonePlanRecords(projectDir, true);
  const done = plans
    .filter((record) => String(record.frontmatter.status || "").toLowerCase() === "done")
    .sort(comparePlanRecordsByLogicalTimeDesc);
  return done[0] || null;
}

export async function summarizeDonePlanBuckets(projectDir) {
  const flatDone = await listDonePlanRecords(projectDir, false);
  const allDone = await listDonePlanRecords(projectDir, true);
  const doneRoot = path.join(projectDir, DONE_PLAN_DIR);
  const weeklyBucketCounts = new Map();

  for (const record of allDone) {
    const relativePath = path.relative(doneRoot, record.path);
    const parts = relativePath.split(path.sep).filter(Boolean);
    if (parts.length >= 3 && /^\d{4}$/.test(parts[0]) && /^W\d{2}$/.test(parts[1])) {
      const bucket = `${parts[0]}/${parts[1]}`;
      weeklyBucketCounts.set(bucket, (weeklyBucketCounts.get(bucket) || 0) + 1);
    }
  }

  return {
    recent_done_count: flatDone.length,
    archived_done_count: allDone.length,
    weekly_buckets: [...weeklyBucketCounts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([bucket, count]) => ({ bucket, count }))
  };
}

export function isPassPlanRecord(plan) {
  return String(plan?.frontmatter?.decision || "").toUpperCase() === "PASS";
}

export async function resolvePlanRef(projectDir, ref = "") {
  const trimmed = String(ref || "").trim();
  if (!trimmed) {
    return await resolveActivePlan(projectDir);
  }

  const absoluteCandidate = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(projectDir, trimmed);
  if (fs.existsSync(absoluteCandidate)) {
    return await readPlanRecord(absoluteCandidate);
  }

  const allPlans = await listPlanRecords(projectDir, true);
  return allPlans.find((record) => String(record.frontmatter.plan_id || "") === trimmed) || null;
}

export async function listDonePlanRecords(projectDir, recursive = true) {
  const doneDir = path.join(projectDir, DONE_PLAN_DIR);
  if (!fs.existsSync(doneDir)) {
    return [];
  }

  return recursive
    ? await listMarkdownRecordsRecursive(doneDir)
    : await listMarkdownRecordsShallow(doneDir);
}

export function resolvePlanRecordTimestampInfo(plan) {
  const donePlan = String(plan?.frontmatter?.status || "").toLowerCase() === "done";
  const archivedAt = String(plan?.frontmatter?.archived_at || "").trim();
  const updatedAt = String(plan?.frontmatter?.updated_at || "").trim();

  if (donePlan && archivedAt) {
    const archivedMs = parseTimestamp(archivedAt);
    if (Number.isFinite(archivedMs)) {
      return {
        valid: true,
        iso: archivedAt,
        ms: archivedMs,
        source: "archived_at"
      };
    }
  }

  if (updatedAt) {
    const updatedMs = parseTimestamp(updatedAt);
    if (Number.isFinite(updatedMs)) {
      return {
        valid: true,
        iso: updatedAt,
        ms: updatedMs,
        source: "updated_at"
      };
    }
  }

  if (plan?.stat?.mtimeMs) {
    return {
      valid: true,
      iso: new Date(plan.stat.mtimeMs).toISOString(),
      ms: plan.stat.mtimeMs,
      source: "mtime"
    };
  }

  return {
    valid: false,
    iso: "",
    ms: Number.NaN,
    source: ""
  };
}

export function comparePlanRecordsByLogicalTimeDesc(left, right) {
  const leftInfo = resolvePlanRecordTimestampInfo(left);
  const rightInfo = resolvePlanRecordTimestampInfo(right);
  const leftMs = Number.isFinite(leftInfo.ms) ? leftInfo.ms : Number.NEGATIVE_INFINITY;
  const rightMs = Number.isFinite(rightInfo.ms) ? rightInfo.ms : Number.NEGATIVE_INFINITY;
  if (rightMs !== leftMs) {
    return rightMs - leftMs;
  }
  return left.path.localeCompare(right.path);
}

export async function nextPlanSequence(projectDir, dateStamp) {
  const allPlans = await listPlanRecords(projectDir, true);
  const prefix = `${dateStamp}-`;
  let maxSeq = 0;
  for (const record of allPlans) {
    if (!record.name.startsWith(prefix)) {
      continue;
    }
    const match = record.name.match(/^\d{4}-\d{2}-\d{2}-(\d{3})-/);
    const seq = Number.parseInt(match?.[1] || "0", 10);
    if (!Number.isNaN(seq)) {
      maxSeq = Math.max(maxSeq, seq);
    }
  }
  return maxSeq + 1;
}

function formatFrontmatterValue(value) {
  if (value === null || value === undefined || value === "") {
    return "null";
  }
  const text = String(value);
  if (/^[A-Za-z0-9_.:-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

async function listMarkdownRecordsShallow(rootDir) {
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    records.push(await readPlanRecord(path.join(rootDir, entry.name)));
  }
  return records;
}

async function listMarkdownRecordsRecursive(rootDir) {
  const records = [];
  const pendingDirs = [rootDir];
  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      records.push(await readPlanRecord(entryPath));
    }
  }
  return records;
}

function parseTimestamp(value) {
  const ms = Date.parse(String(value || "").trim());
  return Number.isFinite(ms) ? ms : Number.NaN;
}
