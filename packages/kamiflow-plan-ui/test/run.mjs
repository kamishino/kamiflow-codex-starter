import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.js";
import { parsePlanFileContent } from "../src/parser/plan-parser.js";
import { validateParsedPlan } from "../src/schema/validate-plan.js";

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
    ({ createServer } = await import("../src/server/create-server.js"));
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

    const server = await createServer({ projectDir: tempDir, withWatcher: false });
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

    await server.close();
  });
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[test] ${failed} test(s) failed.`);
} else {
  console.log("[test] all tests passed.");
}
