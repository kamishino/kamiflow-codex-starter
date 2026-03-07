import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTechnicalSolutionDiagramSection } from "./technical-solution-diagram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const REPO_KFC_PLAN_TEMPLATE = path.join(
  REPO_ROOT,
  "packages",
  "kfc-plan-web",
  "templates",
  "plan-template.md"
);

const FALLBACK_PLAN_TEMPLATE = `---
plan_id: PLAN-YYYY-MM-DD-001
title: New Plan
status: draft
decision: NO_GO
selected_mode: Plan
next_mode: Plan
next_command: plan
diagram_mode: auto
updated_at: 2026-03-01
---

## Start Summary
- Required: yes
- Reason: Missing core planning inputs.
- Selected Idea: Initial candidate
- Alternatives Considered: Option A | Option B
- Pre-mortem Risk: TBD
- Handoff Confidence: 1

## Goal
- One-sentence target outcome.

## Scope (In/Out)
- In: Core work items.
- Out: Non-goals.

## Constraints
- Key constraints: Time, risk, compatibility.

## Assumptions
- A1: Primary assumption.

## Open Decisions
- [ ] D1: One unresolved decision.
- Remaining Count: 1

## Technical Solution Diagram
\`\`\`mermaid
flowchart LR
  IDEA["Selected Solution"] --> PLAN["Implementation Plan"] --> BUILD["Build Slice"] --> CHECK["Check Acceptance"]
\`\`\`
- Notes: Keep this diagram updated as implementation decisions evolve.

## Implementation Tasks
- [ ] \`path/to/file\`: implement scoped change.

## Acceptance Criteria
- [ ] Core behavior is correct.
- [ ] Validation commands pass.

## Validation Commands
- npm test

## Risks & Rollback
- Risk: Main failure mode.
- Mitigation: Primary mitigation.
- Rollback: Revert strategy.

## Go/No-Go Checklist
- [ ] Goal is explicit
- [ ] Scope in/out is explicit
- [ ] No unresolved high-impact decisions
- [ ] Tasks and validation commands are implementation-ready

## WIP Log
- Status: Not started
- Blockers: None
- Next step: Plan first concrete task slice
`;

export function resolvePlansDir(projectDir) {
  return path.join(projectDir, ".local", "plans");
}

function slugifySegment(value, fallback = "") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    return fallback;
  }
  return slug;
}

function buildSlugBase(options = {}) {
  const route = slugifySegment(options.route || "plan", "plan");
  const topic = slugifySegment(options.topic || options.slug || "", "");
  const combined = topic ? `${route}-${topic}` : route;
  return combined.slice(0, 64).replace(/-+$/g, "") || "plan";
}

function toIsoNow() {
  return new Date().toISOString();
}

function toLocalDateStamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function humanizeSlug(slug, fallback = "Plan") {
  const value = String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim();
  return value || fallback;
}

function parsePlanFileIdentity(filePath, options = {}) {
  const fallbackDate = toLocalDateStamp();
  const baseName = path.basename(filePath, ".md");
  const match = baseName.match(/^(?<date>\d{4}-\d{2}-\d{2})(?:-(?<seq>\d{3}))?(?:-(?<slug>.+))?$/i);
  const date = match?.groups?.date || fallbackDate;
  const seq = match?.groups?.seq || "001";
  const slug = String(match?.groups?.slug || "").trim();
  const slugParts = slug.split("-").filter(Boolean);
  const route = slugifySegment(slugParts[0] || options.route || "plan", "plan");
  const topicSlug = slugParts.length > 1
    ? slugifySegment(slugParts.slice(1).join("-"), "")
    : slugifySegment(options.topic || options.slug || "", "");
  const rawTopic = String(options.topic || "").trim();
  const title = rawTopic || humanizeSlug(topicSlug, `${humanizeSlug(route)} Plan`);
  return {
    date,
    seq,
    route,
    topicSlug,
    title
  };
}

function updateFrontmatterField(markdown, key, value) {
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

function materializeTemplate(template, targetPath, options = {}) {
  const identity = parsePlanFileIdentity(targetPath, options);
  const planId = `PLAN-${identity.date}-${identity.seq}`;
  let next = String(template || "");
  next = updateFrontmatterField(next, "plan_id", planId);
  next = updateFrontmatterField(next, "title", identity.title);
  next = updateFrontmatterField(next, "diagram_mode", "auto");
  next = updateFrontmatterField(next, "updated_at", toIsoNow());
  next = ensureTechnicalSolutionDiagramSection(next, { title: identity.title }).markdown;
  return next;
}

function buildDefaultPlanFileName(options = {}) {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(options);
  return `${date}-${slugBase}.md`;
}

async function resolveUniqueNewPlanPath(plansDir, options = {}) {
  const date = toLocalDateStamp();
  const slugBase = buildSlugBase(options);
  const usedSequenceNumbers = new Set();
  const pattern = new RegExp(`^${date}-(\\d{3})(?:-.+)?\\.md$`, "i");
  let highestSequence = 0;

  async function collectUsedSequences(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
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
          highestSequence = Math.max(highestSequence, parsed);
        }
      }
    } catch {
      // Ignore missing directories.
    }
  }

  await collectUsedSequences(plansDir);
  await collectUsedSequences(path.join(plansDir, "done"));

  if (highestSequence >= 999) {
    throw new Error("Unable to allocate new plan filename in .local/plans.");
  }

  for (let i = highestSequence + 1; i <= 999; i += 1) {
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
  throw new Error("Unable to allocate new plan filename in .local/plans.");
}

async function readPlanTemplate() {
  try {
    return await fs.readFile(REPO_KFC_PLAN_TEMPLATE, "utf8");
  } catch {
    return FALLBACK_PLAN_TEMPLATE;
  }
}

export async function createLocalPlanTemplate(projectDir, options = {}) {
  const forceNew = Boolean(options.forceNew);
  const log = typeof options.log === "function" ? options.log : null;
  const naming = {
    topic: options.topic || options.slug || "",
    route: options.route || "plan"
  };
  const plansDir = resolvePlansDir(projectDir);
  await fs.mkdir(plansDir, { recursive: true });

  const template = await readPlanTemplate();
  const targetPath = forceNew
    ? await resolveUniqueNewPlanPath(plansDir, naming)
    : path.join(plansDir, buildDefaultPlanFileName(naming));

  if (!forceNew) {
    try {
      await fs.access(targetPath);
      const normalized = await ensurePlanFileTechnicalSolutionDiagram(targetPath, { title: options.topic || options.slug || "" });
      if (normalized.changed && log) {
        log(`Technical Solution Diagram backfilled: ${targetPath}`);
      }
      if (log) {
        log(`Plan bootstrap fallback used: ${targetPath}`);
      }
      console.log(`[kfc-plan] Template already exists: ${targetPath}`);
      console.log(`[kfc-plan] Plans directory ready: ${plansDir}`);
      return targetPath;
    } catch {
      // Continue and create template.
    }
  }

  const materialized = materializeTemplate(template, targetPath, naming);
  await fs.writeFile(targetPath, materialized, "utf8");
  if (log) {
    log(`Plan bootstrap fallback used: ${targetPath}`);
  }
  console.log(`[kfc-plan] Created template: ${targetPath}`);
  console.log(`[kfc-plan] Plans directory ready: ${plansDir}`);
  return targetPath;
}

export async function ensurePlanFileTechnicalSolutionDiagram(filePath, options = {}) {
  const raw = await fs.readFile(filePath, "utf8");
  const normalized = ensureTechnicalSolutionDiagramSection(raw, { title: options.title || "" });
  if (!normalized.changed) {
    return { changed: false, filePath };
  }
  await fs.writeFile(filePath, normalized.markdown, "utf8");
  return { changed: true, filePath };
}

