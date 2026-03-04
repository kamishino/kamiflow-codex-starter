import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const REPO_KFP_TEMPLATE = path.join(
  REPO_ROOT,
  "packages",
  "kamiflow-plan-ui",
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

function buildDefaultPlanFileName(options = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const slugBase = buildSlugBase(options);
  return `${date}-${slugBase}.md`;
}

async function resolveUniqueNewPlanPath(plansDir, options = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const slugBase = buildSlugBase(options);
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
  throw new Error("Unable to allocate new plan filename in .local/plans.");
}

async function readPlanTemplate() {
  try {
    return await fs.readFile(REPO_KFP_TEMPLATE, "utf8");
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
      if (log) {
        log(`Plan bootstrap fallback used: ${targetPath}`);
      }
      console.log(`[kfp] Template already exists: ${targetPath}`);
      console.log(`[kfp] Plans directory ready: ${plansDir}`);
      return targetPath;
    } catch {
      // Continue and create template.
    }
  }

  await fs.writeFile(targetPath, template, "utf8");
  if (log) {
    log(`Plan bootstrap fallback used: ${targetPath}`);
  }
  console.log(`[kfp] Created template: ${targetPath}`);
  console.log(`[kfp] Plans directory ready: ${plansDir}`);
  return targetPath;
}
