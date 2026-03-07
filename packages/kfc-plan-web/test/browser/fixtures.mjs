import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../../dist/server/create-server.js";

function planMarkdown(definition) {
  return `---
plan_id: ${definition.planId}
title: ${definition.title}
status: ${definition.status ?? "in_progress"}
decision: ${definition.decision ?? "GO"}
selected_mode: ${definition.selectedMode ?? "Build"}
next_mode: ${definition.nextMode ?? "Check"}
next_command: ${definition.nextCommand ?? "check"}
updated_at: ${definition.updatedAt}
lifecycle_phase: ${definition.lifecyclePhase ?? "build"}
diagram_mode: required
---

## Start Summary
- Required: no
- Reason: Browser smoke fixture for KFC Plan.
- Selected Idea: Stable seeded plan.
- Alternatives Considered: none
- Pre-mortem Risk: low
- Handoff Confidence: 5

## Goal
- Verify the browser UI against deterministic fixture data.

## Scope (In/Out)
- In: browser smoke coverage
- Out: unrelated changes

## Constraints
- Browser tests only.

## Assumptions
- Fixture data stays deterministic.

## Open Decisions
- [x] Browser fixture is stable
- Remaining Count: 0

## Technical Solution Diagram
\`\`\`mermaid
flowchart LR
  A[fixture plan] --> B[KFC Plan browser smoke]
  B --> C[plan picker]
  B --> D[theme]
  B --> E[phase timeline]
\`\`\`

## Implementation Tasks
- [x] Seed plan data
- [ ] Render browser smoke

## Acceptance Criteria
- [x] Fixture plan loads
- [ ] Browser assertions pass

## Validation Commands
- [ ] npm run test:browser

## Risks & Rollback
- Risk: fixture drift
- Mitigation: keep markdown deterministic
- Rollback: replace fixture with simpler seeded plan

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Feasibility is validated
- [x] Acceptance criteria are testable
- [x] Tasks are implementation-ready
- [x] Risks and rollback are defined
- [x] Validation commands are concrete
- [x] Dependencies/access are ready
- [x] First build step is explicit

## WIP Log
- ${definition.updatedAt} - Status: ${definition.wipStatus ?? "Seeded browser fixture"}.
- ${definition.updatedAt} - Blockers: None.
- ${definition.updatedAt} - Next step: ${definition.wipNext ?? "Open KFC Plan browser smoke."}
`;
}

async function createProjectFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-plan-browser-"));
  const plansDir = path.join(tempDir, ".local", "plans");
  await fs.mkdir(plansDir, { recursive: true });
  const plans = options.plans ?? [];
  for (const plan of plans) {
    const fileName = `${plan.updatedAt.slice(0, 10)}-${plan.fileStem}.md`;
    await fs.writeFile(path.join(plansDir, fileName), planMarkdown(plan), "utf8");
  }
  return tempDir;
}

export function seededPlans() {
  return [
    {
      planId: "PLAN-2026-03-07-101",
      fileStem: "101-build-browser-primary",
      title: "Primary browser plan",
      updatedAt: "2026-03-07T10:50:00+07:00",
      wipStatus: "Primary plan selected for browser verification.",
      wipNext: "Review the progress overview and execution rail."
    },
    {
      planId: "PLAN-2026-03-07-102",
      fileStem: "102-build-browser-secondary",
      title: "Secondary browser plan",
      updatedAt: "2026-03-07T10:40:00+07:00",
      wipStatus: "Secondary plan ready for picker verification.",
      wipNext: "Use the plan picker to switch into this plan."
    }
  ];
}

export async function withKfpServer(options, fn) {
  const projectDir = await createProjectFixture({ plans: options.plans ?? [] });
  const server = await createServer({
    projectDir,
    withWatcher: false,
    uiMode: "observer"
  });

  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn({ baseUrl, projectDir });
  } finally {
    await server.close();
    await fs.rm(projectDir, { recursive: true, force: true });
  }
}
