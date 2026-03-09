import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createRemoteServer } from "../../dist/lib/remote-server.js";

const PROJECT_DIR = path.resolve("temp/remote-smoke");
const PLAN_ID = "PLAN-REMOTE-SMOKE-001";
const TOKEN = "test-token";

async function ensureFixture() {
  await fs.rm(PROJECT_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(PROJECT_DIR, ".kfc"), { recursive: true });
  await fs.mkdir(path.join(PROJECT_DIR, ".local", "runs"), { recursive: true });
  await fs.writeFile(
    path.join(PROJECT_DIR, "package.json"),
    JSON.stringify({ name: "remote-smoke", version: "0.0.0", private: true }, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(PROJECT_DIR, ".kfc", "session.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profile: "client",
        planId: PLAN_ID,
        planPath: `.local/plans/${PLAN_ID}.md`
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(PROJECT_DIR, ".local", "runs", `${PLAN_ID}.jsonl`),
    JSON.stringify({
      event_type: "runlog_updated",
      run_state: "IDLE",
      phase: "Build",
      message: "Remote smoke ready.",
      updated_at: new Date().toISOString()
    }) + "\n",
    "utf8"
  );
}

function createAuthedFetch(baseUrl) {
  return async function authed(
    pathname,
    options: RequestInit & { headers?: Record<string, string> } = {}
  ) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${TOKEN}`
    };
    return await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  };
}

function startEventCapture(baseUrl) {
  const controller = new AbortController();
  const events = [];
  const ready = (async () => {
    const response = await fetch(`${baseUrl}/api/remote/events?token=${encodeURIComponent(TOKEN)}`, {
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const typeMatch = rawEvent.match(/^event:\s*(.+)$/m);
        const dataMatch = rawEvent.match(/^data:\s*(.+)$/m);
        if (typeMatch && dataMatch) {
          try {
            events.push({
              eventType: typeMatch[1].trim(),
              payload: JSON.parse(dataMatch[1])
            });
          } catch {
            // Ignore malformed event payload.
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  })().catch((err) => {
    if (err?.name !== "AbortError") {
      throw err;
    }
  });
  return {
    events,
    stop() {
      controller.abort();
      return ready;
    }
  };
}

async function poll(check, timeoutMs = 5000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error("Timed out while waiting for condition.");
}

await ensureFixture();

const server = await createRemoteServer({
  projectDir: PROJECT_DIR,
  host: "127.0.0.1",
  port: 0,
  token: TOKEN,
  executePrompt: async ({ prompt }) => {
    await sleep(120);
    return {
      status: "completed",
      stdout_tail: `Handled prompt: ${prompt}`,
      stderr_tail: "",
      exit_code: 0,
      run_id: `run_${Date.now()}`
    };
  }
});

const listener = await server.listen();
const baseUrl = listener.url.replace(/\/$/, "");
const authed = createAuthedFetch(baseUrl);
const capture = startEventCapture(baseUrl);

try {
  const health = await fetch(`${baseUrl}/api/remote/health`);
  assert.equal(health.status, 200);

  const unauthorized = await fetch(`${baseUrl}/api/remote/session`);
  assert.equal(unauthorized.status, 401);

  const verify = await fetch(`${baseUrl}/api/remote/token/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: TOKEN })
  });
  assert.equal(verify.status, 200);

  const first = await authed("/api/remote/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "First remote prompt" })
  });
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  assert.equal(firstPayload.accepted_state, "running");

  const second = await authed("/api/remote/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Second remote prompt" })
  });
  assert.equal(second.status, 200);
  const secondPayload = await second.json();
  assert.equal(secondPayload.accepted_state, "queued");

  await poll(async () => {
    const response = await authed("/api/remote/session");
    const payload = await response.json();
    if (!payload.busy && Number(payload.queue_depth || 0) === 0 && payload.last_result?.state === "completed") {
      return payload;
    }
    return null;
  }, 7000, 150);

  const transcriptResponse = await authed("/api/remote/transcript");
  const transcriptPayload = await transcriptResponse.json();
  assert.ok(Array.isArray(transcriptPayload.items));
  assert.equal(transcriptPayload.items.length, 4);
  assert.ok(transcriptPayload.items.some((item) => String(item.text || "").includes("Handled prompt: First remote prompt")));
  assert.ok(transcriptPayload.items.some((item) => String(item.text || "").includes("Handled prompt: Second remote prompt")));

  await poll(async () => {
    const eventTypes = new Set(capture.events.map((item) => item.eventType));
    if (eventTypes.has("connected") && eventTypes.has("session_updated") && eventTypes.has("transcript_appended") && eventTypes.has("prompt_completed")) {
      return true;
    }
    return false;
  }, 7000, 100);

  console.log("[remote-smoke] PASS");
} finally {
  await capture.stop();
  await server.fastify.close();
}
