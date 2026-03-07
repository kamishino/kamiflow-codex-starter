import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createKfcSessionServer } from "../../packages/kfc-session/src/server.js";
import { writeFixtureSession } from "../../packages/kfc-session/src/session-store.js";

const TEMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-session-smoke-"));

async function main() {
  const sessionsRoot = path.join(TEMP_DIR, "sessions");
  const exportRoot = path.join(TEMP_DIR, "export");
  const importSource = path.join(TEMP_DIR, "import-source");

  await writeFixtureSession(sessionsRoot, "2026/03/07", "019-smoke-alpha", [
    {
      role: "user",
      text: "Smoke session one",
      updated_at: "2026-03-07T03:00:00.000Z"
    },
    {
      role: "assistant",
      text: "Smoke session response",
      updated_at: "2026-03-07T03:02:00.000Z"
    }
  ]);

  await writeFixtureSession(importSource, "2026/03/05", "019-smoke-imported", [
    {
      role: "assistant",
      text: "Imported smoke session",
      updated_at: "2026-03-05T04:00:00.000Z"
    }
  ]);

  const server = await createKfcSessionServer({
    sessionsRoot,
    host: "127.0.0.1",
    port: 0
  });
  await server.ready();
  const listener = await server.listen();
  const baseUrl = listener.url.replace(/\/$/, "");

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);

    const list = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(list.status, 200);
    const listPayload = await list.json();
    assert.equal(listPayload.items.length, 1);

    const detail = await fetch(`${baseUrl}/api/sessions/019-smoke-alpha`);
    assert.equal(detail.status, 200);

    const exportResult = await fetch(`${baseUrl}/api/sessions/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "019-smoke-alpha", to: exportRoot })
    });
    assert.equal(exportResult.status, 200);

    const importResult = await fetch(`${baseUrl}/api/sessions/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: importSource })
    });
    assert.equal(importResult.status, 200);

    const restoreResult = await fetch(`${baseUrl}/api/sessions/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "019-smoke-imported" })
    });
    assert.equal(restoreResult.status, 200);

    const page = await fetch(baseUrl);
    const pageText = await page.text();
    assert.ok(pageText.includes("KFC Session Manager"));
    assert.ok(pageText.includes("Export Session"));

    console.log("[kfc-session-smoke] PASS");
  } finally {
    await server.close();
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  }
}

await main();
