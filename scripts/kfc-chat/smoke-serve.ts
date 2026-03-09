import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

const { bindCodexSession } = await import("../../packages/kfc-chat/dist/lib/chat-state.js");
const { createKfcChatServer } = await import("../../packages/kfc-chat/dist/server/create-server.js");

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

function isBootstrapMessage(message: unknown): message is {
  type: "bootstrap";
  payload: {
    session: { bound_session: { session_id: string } };
    transcript: Array<{ type: string; role?: string }>;
  };
} {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as {
    type?: unknown;
    payload?: {
      session?: { bound_session?: { session_id?: unknown } };
      transcript?: unknown;
    };
  };
  return (
    candidate.type === "bootstrap" &&
    typeof candidate.payload?.session?.bound_session?.session_id === "string" &&
    Array.isArray(candidate.payload?.transcript)
  );
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
    JSON.stringify({ timestamp: "2026-03-08T00:00:30.000Z", type: "event_msg", payload: { type: "agent_message", message: "Smoke baseline." } }) + "\n" +
    JSON.stringify({ timestamp: "2026-03-08T00:00:45.000Z", type: "event_msg", payload: { type: "agent_reasoning", message: "Smoke reasoning note." } }) + "\n" +
    JSON.stringify({ timestamp: "2026-03-08T00:00:50.000Z", type: "event_msg", payload: { type: "token_count", total_tokens: 42 } }) + "\n" +
    JSON.stringify({ timestamp: "2026-03-08T00:01:00.000Z", type: "response_item", payload: { type: "function_call_output", output: "Smoke tool output." } }) + "\n",
    "utf8"
  );
  await bindCodexSession(projectDir, sessionId, sessionsRoot);

  const server = await createKfcChatServer({
    projectDir,
    sessionsRoot,
    host: "127.0.0.1",
    port: 0,
    token: "smoke-token",
    revealTarget: async ({ binding, target }) => ({
      target,
      path: target === "folder" ? path.dirname(binding.session_path) : binding.session_path
    }),
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
  assert.match(htmlText, /KFC Chat/);
  assert.match(htmlText, /id=\"app-root\"/);
  assert.match(htmlText, /assets\/kfc-chat\.js/);
  assert.match(htmlText, /assets\/kfc-chat\.css/);

  const styles = await fetch(`${listener.url}/assets/kfc-chat.css`);
  const stylesText = await styles.text();
  assert.match(stylesText, /\.message-group \{ display: grid; gap: 6px; width: 100%; justify-self: stretch; \}/);
  assert.match(stylesText, /\.message-bubble \{ width: calc\(100% - 24px\); max-width: calc\(100% - 24px\);/);
  assert.doesNotMatch(stylesText, /max-width: min\(72ch, 100%\)/);

  const transcript = await fetch(`${listener.url}/api/chat/transcript`, {
    headers: { Authorization: "Bearer smoke-token" }
  });
  const transcriptPayload = await transcript.json();
  assert.equal(transcriptPayload.items[0].type, "event_row");
  assert.equal(transcriptPayload.items[0].label, "Tool Output");
  assert.ok(transcriptPayload.items.some((item) => item.type === "event_row" && item.label === "Reasoning"));
  assert.ok(transcriptPayload.items.some((item) => item.type === "message_group" && item.role === "assistant"));
  assert.equal(transcriptPayload.items.some((item) => item.text?.includes?.("token_count") || item.items?.some?.((entry) => entry.text.includes("token_count"))), false);

  const reveal = await fetch(`${listener.url}/api/chat/reveal`, {
    method: "POST",
    headers: {
      Authorization: "Bearer smoke-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ target: "folder" })
  });
  assert.equal(reveal.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${listener.port}/ws?token=smoke-token`);
  const bootstrap = await waitForMessage(ws, (message) => message.type === "bootstrap");
  assert.ok(isBootstrapMessage(bootstrap));
  assert.equal(bootstrap.payload.session.bound_session.session_id, sessionId);
  assert.equal(bootstrap.payload.transcript[0].type, "event_row");
  assert.ok(bootstrap.payload.transcript.some((item) => item.type === "message_group" && item.role === "assistant"));
  ws.close();
  await server.close();

  console.log(`[kfc-chat:smoke] PASS ${listener.url}`);
});
