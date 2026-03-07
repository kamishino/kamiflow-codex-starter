import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { bindCodexSession } from "../../packages/kfc-chat/src/chat-state.js";
import { createKfcChatServer } from "../../packages/kfc-chat/src/server.js";

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-chat-smoke-"));
  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), timeoutMs);
    ws.addEventListener("message", function handler(event) {
      let payload;
      try {
        payload = JSON.parse(String(event.data || "{}"));
      } catch {
        return;
      }
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      ws.removeEventListener("message", handler);
      resolve(payload);
    });
  });
}

await withTempDir(async (tempDir) => {
  const projectDir = path.join(tempDir, "project");
  const sessionsRoot = path.join(tempDir, "sessions");
  const sessionId = "019-chat-smoke";
  const sessionPath = path.join(sessionsRoot, "2026", "03", "08", `${sessionId}.jsonl`);

  await fs.mkdir(path.join(projectDir, ".kfc"), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, ".kfc", "session.json"),
    JSON.stringify(
      {
        generatedAt: "2026-03-08T00:00:00.000Z",
        profile: "client",
        planId: "PLAN-2026-03-08-001",
        planPath: path.join(projectDir, ".local", "plans", "2026-03-08-001-build-kfc-chat-web-only-bound-session-chat.md")
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(
    sessionPath,
    JSON.stringify({ role: "assistant", text: "Smoke baseline.", updated_at: "2026-03-08T00:00:30.000Z" }) + "\n",
    "utf8"
  );
  await bindCodexSession(projectDir, sessionId, sessionsRoot);

  const server = await createKfcChatServer({
    projectDir,
    sessionsRoot,
    host: "127.0.0.1",
    port: 0,
    token: "smoke-token",
    executePrompt: async ({ prompt }) => ({
      status: "completed",
      command: `codex exec resume ${sessionId} ${JSON.stringify(prompt)}`,
      stdout_tail: `Smoke handled: ${prompt}`,
      stderr_tail: "",
      exit_code: 0,
      run_id: "run_smoke_chat"
    })
  });
  await server.ready();
  const listener = await server.listen();

  const health = await fetch(`${listener.url}/api/chat/health`);
  assert.equal(health.status, 200);

  const html = await fetch(`${listener.url}/`);
  const htmlText = await html.text();
  assert.match(htmlText, /Bound Codex Session Chat/);
  assert.match(htmlText, /Bound Session Timeline/);

  const ws = new WebSocket(`ws://127.0.0.1:${listener.port}/ws?token=smoke-token`);
  const bootstrap = await waitForMessage(ws, (message) => message.type === "bootstrap");
  assert.equal(bootstrap.payload.session.bound_session.session_id, sessionId);
  ws.close();
  await server.close();

  console.log(`[kfc-chat:smoke] PASS ${listener.url}`);
});
