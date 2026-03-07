import assert from "node:assert/strict";
import { runCodexAction } from "../dist/lib/codex-runner.js";

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

await runCase("codex runner integration path remains available", async () => {
  const previousExecutables = process.env.KFC_PLAN_CODEX_EXECUTABLES;
  const previousTimeout = process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;
  try {
    delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
    process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = "15000";
    const result = await runCodexAction({
      plan_id: "PLAN-TEST-001-INTEGRATION",
      action_type: "plan",
      prompt: "Integration smoke test."
    });
    assert.equal(typeof result.status, "string");
    assert.equal(typeof result.run_id, "string");
    assert.ok(result.status === "failed" || result.status === "completed");
    if (result.status === "failed") {
      assert.ok(
        result.error_code === "CODEX_NOT_FOUND" ||
          result.error_code === "SPAWN_FAILED" ||
          result.error_code === "TIMEOUT" ||
          result.error_code === "NON_ZERO_EXIT"
      );
    }
  } finally {
    if (previousExecutables === undefined) {
      delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
    } else {
      process.env.KFC_PLAN_CODEX_EXECUTABLES = previousExecutables;
    }
    if (previousTimeout === undefined) {
      delete process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;
    } else {
      process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = previousTimeout;
    }
  }
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[test] ${failed} test(s) failed.`);
} else {
  console.log("[test] all tests passed.");
}
