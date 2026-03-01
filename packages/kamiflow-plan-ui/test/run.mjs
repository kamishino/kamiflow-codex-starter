import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../dist/cli.js";
import { parsePlanFileContent } from "../dist/parser/plan-parser.js";
import { validateParsedPlan } from "../dist/schema/validate-plan.js";
import { SSEStream } from "../dist/server/sse-stream.js";

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

await runCase("init creates plan template", async () => {
  await withTempDir(async (tempDir) => {
    const exitCode = await runCli(["init", "--project", tempDir]);
    assert.equal(exitCode, 0);
    const plansDir = path.join(tempDir, ".local", "plans");
    const files = await fs.readdir(plansDir);
    assert.ok(files.some((name) => name.endsWith(".md")));
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
