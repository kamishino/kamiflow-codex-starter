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
- Reason: Missing 2+ core planning fields.
- Selected Idea: Initial draft candidate
- Alternatives Considered: Safe option | Dark horse option
- Pre-mortem Risk: Weak clarity can cause rework.
- Handoff Confidence: 1

## Goal
- Define the desired outcome.

## Scope (In/Out)
- In:
- Out:

## Constraints
- Technical:
- Time:
- Risk:

## Assumptions
- A1:
- A2:

## Open Decisions
- [ ] D1:
- Remaining Count: 1

## Implementation Tasks
- [ ] Task 1
- [ ] Task 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Validation Commands
- command 1
- command 2

## Risks & Rollback
- Risk:
- Mitigation:
- Rollback:

## Go/No-Go Checklist
- [ ] Goal is explicit
- [ ] Scope in/out is explicit
- [ ] No unresolved high-impact decisions
- [ ] Feasibility is validated
- [ ] Acceptance criteria are testable
- [ ] Tasks are implementation-ready
- [ ] Risks and rollback are defined
- [ ] Validation commands are concrete
- [ ] Dependencies/access are ready
- [ ] First build step is explicit

## WIP Log
- Status:
- Blockers:
- Next step:
`;

export function resolvePlansDir(projectDir) {
  return path.join(projectDir, ".local", "plans");
}

function buildDefaultPlanFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}-new-plan.md`;
}

async function resolveUniqueNewPlanPath(plansDir) {
  const date = new Date().toISOString().slice(0, 10);
  for (let i = 1; i <= 999; i += 1) {
    const suffix = String(i).padStart(3, "0");
    const candidate = path.join(plansDir, `${date}-${suffix}-new-plan.md`);
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
  const plansDir = resolvePlansDir(projectDir);
  await fs.mkdir(plansDir, { recursive: true });

  const template = await readPlanTemplate();
  const targetPath = forceNew
    ? await resolveUniqueNewPlanPath(plansDir)
    : path.join(plansDir, buildDefaultPlanFileName());

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
