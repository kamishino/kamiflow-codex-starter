import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../dist/cli.js";
import { parsePlanFileContent } from "../dist/parser/plan-parser.js";
import { validateParsedPlan } from "../dist/schema/validate-plan.js";
import { SSEStream } from "../dist/server/sse-stream.js";
import { detectProjectRoot } from "../dist/lib/project-detect.js";
import { runCodexAction } from "../dist/lib/codex-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let failed = 0;

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[test] PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[test] FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function withTempDir(fn) {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "kfp-"));
  try {
    await fn(tempBase);
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }
}

await runCase("parse and validate template plan", async () => {
  const templatePath = path.resolve(__dirname, "../templates/plan-template.md");
  const markdown = await fs.readFile(templatePath, "utf8");
  const parsed = parsePlanFileContent(markdown, templatePath);
  const errors = validateParsedPlan(parsed);
  assert.equal(parsed.frontmatter.plan_id, "PLAN-YYYY-MM-DD-001");
  assert.equal(errors.length, 0);
});

await runCase("validate fails when Start Summary required fields are placeholder", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-02-001
title: Invalid Start Summary
status: draft
decision: NO_GO
selected_mode: Plan
next_mode: Plan
next_command: plan
updated_at: 2026-03-02
---

## Start Summary
- Required: yes
- Reason: TBD
- Selected Idea: TBD
- Alternatives Considered: TBD
- Pre-mortem Risk: TBD
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
  const parsed = parsePlanFileContent(markdown, "<memory>");
  const errors = validateParsedPlan(parsed);
  assert.ok(errors.some((item) => item.includes("Start Summary")));
});

await runCase("init creates plan template", async () => {
  await withTempDir(async (tempDir) => {
    const exitCode = await runCli(["init", "--project", tempDir]);
    assert.equal(exitCode, 0);
    const plansDir = path.join(tempDir, ".local", "plans");
    const files = await fs.readdir(plansDir);
    assert.ok(files.some((name) => name.endsWith(".md")));
  });
});

await runCase("init --new creates unique incremented plan files", async () => {
  await withTempDir(async (tempDir) => {
    const first = await runCli(["init", "--project", tempDir, "--new"]);
    assert.equal(first, 0);
    const second = await runCli(["init", "--project", tempDir, "--new"]);
    assert.equal(second, 0);

    const plansDir = path.join(tempDir, ".local", "plans");
    const files = (await fs.readdir(plansDir)).filter((name) => name.endsWith(".md")).sort();
    assert.equal(files.length, 2);
    assert.ok(/-\d{3}-new-plan\.md$/i.test(files[0]));
    assert.ok(/-\d{3}-new-plan\.md$/i.test(files[1]));
    assert.notEqual(files[0], files[1]);
  });
});

await runCase("validate succeeds for generated template", async () => {
  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);
    const validateExit = await runCli(["validate", "--project", tempDir]);
    assert.equal(validateExit, 0);
  });
});

await runCase("detectProjectRoot prefers git root then package then cwd", async () => {
  await withTempDir(async (tempDir) => {
    const gitRoot = path.join(tempDir, "git-root");
    const gitNested = path.join(gitRoot, "a", "b");
    await fs.mkdir(path.join(gitRoot, ".git"), { recursive: true });
    await fs.mkdir(gitNested, { recursive: true });
    const detectedGit = await detectProjectRoot(gitNested);
    assert.equal(detectedGit, gitRoot);

    const pkgRoot = path.join(tempDir, "pkg-root");
    const pkgNested = path.join(pkgRoot, "x", "y");
    await fs.mkdir(pkgNested, { recursive: true });
    await fs.writeFile(path.join(pkgRoot, "package.json"), "{}", "utf8");
    const detectedPkg = await detectProjectRoot(pkgNested);
    assert.equal(detectedPkg, pkgRoot);

    const plainRoot = path.join(tempDir, "plain");
    const plainNested = path.join(plainRoot, "m", "n");
    await fs.mkdir(plainNested, { recursive: true });
    const detectedPlain = await detectProjectRoot(plainNested);
    assert.equal(detectedPlain, plainNested);
  });
});

await runCase("codex runner does not throw on spawn failures", async () => {
  const result = await runCodexAction({
    plan_id: "PLAN-TEST-001",
    action_type: "plan",
    prompt: "invalid\u0000prompt"
  });
  assert.equal(typeof result.status, "string");
  assert.equal(typeof result.run_id, "string");
  assert.equal(result.status, "failed");
  assert.ok(result.error_code === "SPAWN_FAILED" || result.error_code === "CODEX_NOT_FOUND");
});

await runCase("api returns plan list (when server deps are installed)", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP server test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false,
      uiMode: "operator",
      runCodexAction: async () => ({
        status: "completed",
        command: "codex exec \"test\"",
        stdout_tail: "ok",
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test"
      })
    });
    await server.ready();
    const health = await server.inject({
      method: "GET",
      url: "/api/health"
    });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(JSON.parse(health.payload), { ok: true });

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/plans"
    });
    assert.equal(listResponse.statusCode, 200);
    const payload = JSON.parse(listResponse.payload);
    assert.ok(Array.isArray(payload.plans));
    assert.ok(payload.plans.length >= 1);
    assert.equal(payload.plans[0].is_archived, false);

    const projectsResponse = await server.inject({
      method: "GET",
      url: "/api/projects"
    });
    assert.equal(projectsResponse.statusCode, 200);
    const projectsPayload = JSON.parse(projectsResponse.payload);
    assert.ok(Array.isArray(projectsPayload.projects));
    assert.equal(projectsPayload.projects[0].project_id, "default");

    const scopedListResponse = await server.inject({
      method: "GET",
      url: "/api/projects/default/plans"
    });
    assert.equal(scopedListResponse.statusCode, 200);
    const scopedListPayload = JSON.parse(scopedListResponse.payload);
    assert.ok(Array.isArray(scopedListPayload.plans));

    const planId = payload.plans[0].plan_id;
    const detailResponse = await server.inject({
      method: "GET",
      url: `/api/plans/${encodeURIComponent(planId)}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = JSON.parse(detailResponse.payload);
    assert.equal(detail.summary.plan_id, planId);

    const missingResponse = await server.inject({
      method: "GET",
      url: "/api/plans/DOES_NOT_EXIST"
    });
    assert.equal(missingResponse.statusCode, 404);
    const missing = JSON.parse(missingResponse.payload);
    assert.equal(missing.error_code, "PLAN_NOT_FOUND");

    const badPlanPath = path.join(tempDir, ".local", "plans", "bad-plan.md");
    await fs.writeFile(
      badPlanPath,
      `---
plan_id: BAD-PLAN
title: bad
status: draft
decision: GO
selected_mode: Plan
next_mode: Build
next_command: build
updated_at: 2026-03-01
---

## Goal
- only one section
`,
      "utf8"
    );

    const listAfterBad = await server.inject({
      method: "GET",
      url: "/api/plans"
    });
    assert.equal(listAfterBad.statusCode, 200);
    const payloadAfterBad = JSON.parse(listAfterBad.payload);
    const badSummary = payloadAfterBad.plans.find((item) => item.plan_id === "BAD-PLAN");
    assert.ok(badSummary);
    assert.equal(badSummary.is_valid, false);
    assert.ok(badSummary.error_count > 0);

    const patchStatus = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/status`,
      payload: { status: "active", expected_updated_at: detail.summary.updated_at }
    });
    assert.equal(patchStatus.statusCode, 200);
    const patchStatusPayload = JSON.parse(patchStatus.payload);
    assert.equal(patchStatusPayload.summary.status, "active");

    const patchDecision = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/decision`,
      payload: { decision: "GO", expected_updated_at: patchStatusPayload.summary.updated_at }
    });
    assert.equal(patchDecision.statusCode, 200);
    const patchDecisionPayload = JSON.parse(patchDecision.payload);
    assert.equal(patchDecisionPayload.summary.decision, "GO");

    const patchTask = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/task`,
      payload: { task_index: 0, checked: true, expected_updated_at: patchDecisionPayload.summary.updated_at }
    });
    assert.equal(patchTask.statusCode, 200);

    const patchGate = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/gate`,
      payload: { gate_index: 0, checked: true, expected_updated_at: patchDecisionPayload.summary.updated_at }
    });
    assert.equal(patchGate.statusCode, 200);

    const progress = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/progress`,
      payload: {
        ac_updates: [
          { index: 0, checked: true },
          { index: 1, checked: true }
        ],
        wip: {
          status: "validated",
          blockers: "none",
          next_step: "archive"
        },
        handoff: {
          status: "done",
          next_command: "done",
          next_mode: "done"
        }
      }
    });
    assert.equal(progress.statusCode, 200);

    const complete = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/complete`,
      payload: { check_passed: true }
    });
    assert.equal(complete.statusCode, 200);
    const completePayload = JSON.parse(complete.payload);
    assert.equal(typeof completePayload.archived_path, "string");

    const listAfterArchive = await server.inject({
      method: "GET",
      url: "/api/plans?include_done=true"
    });
    assert.equal(listAfterArchive.statusCode, 200);
    const archivePayload = JSON.parse(listAfterArchive.payload);
    const archivedItem = archivePayload.plans.find((item) => item.plan_id === planId);
    assert.ok(archivedItem);
    assert.equal(archivedItem.is_archived, true);

    const codexAction = await server.inject({
      method: "POST",
      url: "/api/codex/action",
      payload: { plan_id: planId, action_type: "plan", mode_hint: "Plan" }
    });
    assert.equal(codexAction.statusCode, 200);
    const codexPayload = JSON.parse(codexAction.payload);
    assert.equal(codexPayload.status, "completed");
    assert.equal(codexPayload.action_type, "plan");
    assert.equal(codexPayload.plan_id, planId);
    assert.equal(codexPayload.project_id, "default");
    assert.equal(typeof codexPayload.started_at, "string");
    assert.equal(typeof codexPayload.ended_at, "string");

    const indexResponse = await server.inject({
      method: "GET",
      url: "/"
    });
    assert.equal(indexResponse.statusCode, 200);
    assert.ok(indexResponse.payload.includes("Phase Timeline"));
    assert.ok(indexResponse.payload.includes("Next Step"));
    assert.ok(indexResponse.payload.includes("Plan Snapshot"));
    assert.ok(indexResponse.payload.includes("Activity"));

    const appJsResponse = await server.inject({
      method: "GET",
      url: "/assets/app.js"
    });
    assert.equal(appJsResponse.statusCode, 200);
    assert.ok(appJsResponse.payload.includes("Observer Mode"));
    assert.ok(appJsResponse.payload.includes("Terminal Commands"));
    assert.ok(appJsResponse.payload.includes("This UI is read-only for safety"));
    assert.ok(appJsResponse.payload.includes("No plan selected."));
    assert.ok(appJsResponse.payload.includes("activity-tag"));

    const stylesResponse = await server.inject({
      method: "GET",
      url: "/assets/styles.css"
    });
    assert.equal(stylesResponse.statusCode, 200);
    assert.ok(stylesResponse.payload.includes(".journal-header"));
    assert.ok(stylesResponse.payload.includes(".empty-state"));
    assert.ok(stylesResponse.payload.includes(".activity-tag-error"));

    await server.close();
  });
});

await runCase("automation apply updates transitions and archives on PASS", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP automation test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false,
      uiMode: "operator",
      runCodexAction: async () => ({
        status: "completed",
        command: "codex exec \"test\"",
        stdout_tail: "ok",
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test"
      })
    });
    await server.ready();

    const listResponse = await server.inject({ method: "GET", url: "/api/plans" });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = JSON.parse(listResponse.payload);
    const planId = listPayload.plans[0].plan_id;

    const badAction = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: { action_type: "unknown_action" }
    });
    assert.equal(badAction.statusCode, 400);

    const buildApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "build_result",
        task_updates: [{ index: 0, checked: true }],
        wip: {
          status: "in_progress",
          blockers: "none",
          next_step: "run check",
          evidence: ["cmd:npm run plan-ui:test -> pass"]
        }
      }
    });
    assert.equal(buildApply.statusCode, 200);
    const buildPayload = JSON.parse(buildApply.payload);
    assert.equal(buildPayload.summary.next_command, "check");
    assert.equal(buildPayload.summary.next_mode, "Plan");
    assert.equal(buildPayload.archive.archived, false);

    const blockApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        check: {
          result: "BLOCK",
          findings: ["missing acceptance criteria coverage"]
        },
        wip: {
          next_step: "apply fix"
        }
      }
    });
    assert.equal(blockApply.statusCode, 200);
    const blockPayload = JSON.parse(blockApply.payload);
    assert.equal(blockPayload.summary.decision, "NO_GO");
    assert.equal(blockPayload.summary.next_command, "fix");
    assert.equal(blockPayload.summary.next_mode, "Build");
    assert.equal(blockPayload.archive.archived, false);

    const passApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        ac_updates: [
          { index: 0, checked: true },
          { index: 1, checked: true }
        ],
        check: {
          result: "PASS",
          findings: []
        },
        wip: {
          status: "done",
          blockers: "none",
          next_step: "archive complete",
          evidence: ["check:PASS"]
        }
      }
    });
    assert.equal(passApply.statusCode, 200);
    const passPayload = JSON.parse(passApply.payload);
    assert.equal(passPayload.archive.archived, true);
    assert.equal(typeof passPayload.archive.archived_path, "string");

    const listAfter = await server.inject({ method: "GET", url: "/api/plans?include_done=true" });
    assert.equal(listAfter.statusCode, 200);
    const listAfterPayload = JSON.parse(listAfter.payload);
    const archivedPlan = listAfterPayload.plans.find((item) => item.plan_id === planId);
    assert.ok(archivedPlan);
    assert.equal(archivedPlan.is_archived, true);

    await server.close();
  });
});

await runCase("observer mode blocks mutation and codex action APIs", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP observer lock test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false
    });
    await server.ready();

    const listResponse = await server.inject({ method: "GET", url: "/api/plans" });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = JSON.parse(listResponse.payload);
    const planId = listPayload.plans[0].plan_id;

    const statusPatch = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/status`,
      payload: { status: "in_progress" }
    });
    assert.equal(statusPatch.statusCode, 403);
    const statusPayload = JSON.parse(statusPatch.payload);
    assert.equal(statusPayload.error_code, "READ_ONLY_MODE");

    const codexAction = await server.inject({
      method: "POST",
      url: "/api/codex/action",
      payload: { plan_id: planId, action_type: "plan", mode_hint: "Plan" }
    });
    assert.equal(codexAction.statusCode, 403);
    const codexPayload = JSON.parse(codexAction.payload);
    assert.equal(codexPayload.error_code, "READ_ONLY_MODE");

    await server.close();
  });
});

await runCase("sse stream supports replay and heartbeat", async () => {
  const writes = [];
  const reply = {
    raw: {
      write(chunk) {
        writes.push(chunk);
      }
    }
  };

  const stream = new SSEStream(3);
  const firstId = stream.publish("plan_updated", { n: 1 }, "P1");
  stream.publish("plan_updated", { n: 2 }, "P1");
  stream.publish("plan_updated", { n: 3 }, "P1");

  stream.subscribe("P1", reply, String(firstId));
  stream.sendHeartbeat();

  const payload = writes.join("");
  assert.ok(payload.includes("event: connected"));
  assert.ok(payload.includes("event: plan_updated"));
  assert.ok(payload.includes("event: heartbeat"));
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[test] ${failed} test(s) failed.`);
} else {
  console.log("[test] all tests passed.");
}
