import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = process.cwd();
const { runCli } = await import(pathToFileURL(path.join(packageDir, "dist/cli.js")).href);
const { createKfcSessionServer } = await import(pathToFileURL(path.join(packageDir, "dist/server.js")).href);
const { listSessions, writeFixtureSession } = await import(
  pathToFileURL(path.join(packageDir, "dist/session-store.js")).href
);

let failed = 0;

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[kfc-session:test] PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[kfc-session:test] FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-session-"));
  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedSessions(sessionsRoot) {
  await writeFixtureSession(sessionsRoot, "2026/03/07", "019-session-alpha", [
    {
      role: "user",
      text: "Investigate the issue",
      updated_at: "2026-03-07T01:00:00.000Z"
    },
    {
      role: "assistant",
      text: "I found the root cause.",
      updated_at: "2026-03-07T01:05:00.000Z"
    }
  ]);
  await writeFixtureSession(sessionsRoot, "2026/03/06", "019-session-beta", [
    {
      role: "user",
      text: "Plan the next feature",
      updated_at: "2026-03-06T08:00:00.000Z"
    }
  ]);
}

await runCase("listSessions sorts latest-first and filters by query", async () => {
  await withTempDir(async (tempDir) => {
    await seedSessions(tempDir);
    const all = await listSessions(tempDir);
    assert.equal(all.length, 2);
    assert.equal(all[0].session_id, "019-session-beta");

    const filtered = await listSessions(tempDir, { query: "next feature" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].session_id, "019-session-beta");
  });
});

await runCase("server exposes health, list, detail, export, import, and restore", async () => {
  await withTempDir(async (tempDir) => {
    const exportDir = path.join(tempDir, "exported");
    const importDir = path.join(tempDir, "import-source");
    await seedSessions(tempDir);
    const server = await createKfcSessionServer({ sessionsRoot: tempDir, host: "127.0.0.1", port: 0 });
    await server.ready();

    const health = await server.fastify.inject({ method: "GET", url: "/api/health" });
    assert.equal(health.statusCode, 200);

    const index = await server.fastify.inject({ method: "GET", url: "/api/sessions?query=investigate" });
    assert.equal(index.statusCode, 200);
    const indexPayload = JSON.parse(index.payload);
    assert.equal(indexPayload.items.length, 1);
    assert.equal(indexPayload.summary.total_sessions, 2);

    const detail = await server.fastify.inject({ method: "GET", url: "/api/sessions/019-session-alpha" });
    assert.equal(detail.statusCode, 200);
    const detailPayload = JSON.parse(detail.payload);
    assert.equal(detailPayload.item.session_id, "019-session-alpha");
    assert.ok(detailPayload.item.tail_text.includes("Investigate"));

    const exportResult = await server.fastify.inject({
      method: "POST",
      url: "/api/sessions/export",
      payload: { id: "019-session-alpha", to: exportDir }
    });
    assert.equal(exportResult.statusCode, 200);

    await writeFixtureSession(importDir, "2026/03/05", "019-session-imported", [
      {
        role: "assistant",
        text: "Imported session",
        updated_at: "2026-03-05T02:00:00.000Z"
      }
    ]);
    const importResult = await server.fastify.inject({
      method: "POST",
      url: "/api/sessions/import",
      payload: { from: importDir }
    });
    assert.equal(importResult.statusCode, 200);

    const restoreResult = await server.fastify.inject({
      method: "POST",
      url: "/api/sessions/restore",
      payload: { id: "019-session-imported" }
    });
    assert.equal(restoreResult.statusCode, 200);
    const restorePayload = JSON.parse(restoreResult.payload);
    assert.ok(restorePayload.message.includes("Resume it manually"));
    assert.equal(restorePayload.manual_resume_command, 'codex resume "019-session-imported"');

    const html = await server.fastify.inject({ method: "GET", url: "/" });
    assert.equal(html.statusCode, 200);
    assert.ok(html.payload.includes('id="app-root"'));
    assert.ok(html.payload.includes('data-api-base="/api/sessions"'));
    assert.ok(html.payload.includes('/assets/kfc-session.js'));
    assert.ok(html.payload.includes('/assets/kfc-session.css'));

    const script = await server.fastify.inject({ method: "GET", url: "/assets/kfc-session.js" });
    assert.equal(script.statusCode, 200);
    assert.ok(script.payload.includes('import "./client/main.js";'));

    const clientScript = await server.fastify.inject({ method: "GET", url: "/assets/client/main.js" });
    assert.equal(clientScript.statusCode, 200);
    assert.ok(clientScript.payload.includes("copy-id-button"));
    assert.ok(clientScript.payload.includes("apiBaseRaw"));
    assert.ok(clientScript.payload.includes("KFC Session Manager"));

    const styles = await server.fastify.inject({ method: "GET", url: "/assets/kfc-session.css" });
    assert.equal(styles.statusCode, 200);
    assert.ok(styles.payload.includes(".session-item"));
    assert.ok(styles.payload.includes(".detail-grid"));

    await server.close();
  });
});

await runCase("CLI commands work against a custom sessions root", async () => {
  await withTempDir(async (tempDir) => {
    const exportDir = path.join(tempDir, "out");
    await seedSessions(tempDir);

    assert.equal(await runCli(["index", "--sessions-root", tempDir]), 0);
    assert.equal(await runCli(["find", "--sessions-root", tempDir, "--id", "019-session-alpha"]), 0);
    assert.equal(await runCli(["export", "--sessions-root", tempDir, "--id", "019-session-alpha", "--to", exportDir]), 0);
    assert.equal(await runCli(["restore", "--sessions-root", tempDir, "--id", "019-session-alpha"]), 0);
  });
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[kfc-session:test] ${failed} test(s) failed.`);
} else {
  console.log("[kfc-session:test] all tests passed.");
}
