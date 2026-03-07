import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import {
  bindCodexSession,
  buildTranscriptDisplayBlocks,
  readTranscript,
  resolveBoundSession,
  unbindCodexSession
} from "../src/chat-state.js";
import { runCli } from "../src/cli.js";
import { createKfcChatServer } from "../src/server.js";

let failed = 0;

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[kfc-chat:test] PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[kfc-chat:test] FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-chat-"));
  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedProject(projectDir) {
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
}

async function writeSessionFile(sessionsRoot, sessionId, items) {
  const targetPath = path.join(sessionsRoot, "2026", "03", "08", `${sessionId}.jsonl`);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, items.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
  return targetPath;
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message."));
    }, timeoutMs);
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

await runCase("bind/show/unbind manage the canonical client session file", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    const sessionPath = await writeSessionFile(sessionsRoot, "019-chat-alpha", [
      { role: "assistant", text: "Initial transcript line.", updated_at: "2026-03-08T00:01:00.000Z" }
    ]);

    const bindResult = await bindCodexSession(projectDir, "019-chat-alpha", sessionsRoot);
    assert.equal(bindResult.session_path, sessionPath);

    const binding = await resolveBoundSession(projectDir, sessionsRoot);
    assert.equal(binding.bound, true);
    assert.equal(binding.session_id, "019-chat-alpha");

    const cliShow = await runCli(["bind", "show", "--project", projectDir, "--sessions-root", sessionsRoot]);
    assert.equal(cliShow, 0);

    const removed = await unbindCodexSession(projectDir);
    assert.equal(removed, true);
    const unbound = await resolveBoundSession(projectDir, sessionsRoot);
    assert.equal(unbound.bound, false);
  });
});

await runCase("display model groups conversational transcript items for human-first rendering", async () => {
  const blocks = buildTranscriptDisplayBlocks([
    { id: "a1", role: "assistant", kind: "codex_tail", text: "First reply", created_at: "2026-03-08T00:01:00.000Z", status: "synced" },
    { id: "a2", role: "assistant", kind: "codex_result", text: "Second reply", created_at: "2026-03-08T00:02:00.000Z", status: "completed" },
    { id: "u1", role: "user", kind: "prompt", text: "Follow up", created_at: "2026-03-08T00:03:00.000Z", status: "queued" },
    { id: "e1", role: "system", kind: "prompt_error", text: "Blocked", created_at: "2026-03-08T00:04:00.000Z", status: "blocked" }
  ]);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, "message_group");
  assert.equal(blocks[0].role, "assistant");
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[1].type, "message_group");
  assert.equal(blocks[1].role, "user");
  assert.equal(blocks[2].type, "event_row");
  assert.equal(blocks[2].label, "Blocked");
});

await runCase("server exposes health/session/transcript and streams prompt updates over WebSocket", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    const sessionPath = await writeSessionFile(sessionsRoot, "019-chat-bravo", [
      { role: "assistant", text: "Existing Codex reply.", updated_at: "2026-03-08T00:01:00.000Z" }
    ]);
    await bindCodexSession(projectDir, "019-chat-bravo", sessionsRoot);

    const executePrompt = async ({ prompt }) => {
      await fs.appendFile(
        sessionPath,
        JSON.stringify({ role: "assistant", text: `Codex handled: ${prompt}`, updated_at: "2026-03-08T00:02:00.000Z" }) + "\n",
        "utf8"
      );
      return {
        status: "completed",
        command: "codex exec resume 019-chat-bravo \"prompt\"",
        stdout_tail: `Handled prompt: ${prompt}`,
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test_chat"
      };
    };

    const server = await createKfcChatServer({
      projectDir,
      sessionsRoot,
      host: "127.0.0.1",
      port: 0,
      token: "chat-token",
      executePrompt
    });
    await server.ready();
    const listener = await server.listen();

    const health = await fetch(`${listener.url}/api/chat/health`);
    assert.equal(health.status, 200);

    const html = await fetch(`${listener.url}/`);
    const htmlText = await html.text();
    assert.match(htmlText, /Bound Session Timeline/);
    assert.match(htmlText, /conversation-summary/);

    const styles = await fetch(`${listener.url}/assets/kfc-chat.css`);
    const stylesText = await styles.text();
    assert.match(stylesText, /\.message-group/);
    assert.match(stylesText, /\.transcript-event/);

    const script = await fetch(`${listener.url}/assets/kfc-chat.js`);
    const scriptText = await script.text();
    assert.doesNotMatch(scriptText, /groupTranscriptItems/);
    assert.match(scriptText, /message-bubble/);

    const verify = await fetch(`${listener.url}/api/chat/token/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "chat-token" })
    });
    assert.equal(verify.status, 200);

    const session = await fetch(`${listener.url}/api/chat/session`, {
      headers: { Authorization: "Bearer chat-token" }
    });
    const sessionPayload = await session.json();
    assert.equal(sessionPayload.bound_session.session_id, "019-chat-bravo");
    assert.equal(sessionPayload.manual_resume_command, 'codex resume "019-chat-bravo"');

    const transcript = await fetch(`${listener.url}/api/chat/transcript`, {
      headers: { Authorization: "Bearer chat-token" }
    });
    const transcriptPayload = await transcript.json();
    assert.equal(transcriptPayload.items[0].type, "message_group");
    assert.equal(transcriptPayload.items[0].label, "Codex");

    const ws = new WebSocket(`ws://127.0.0.1:${listener.port}/ws?token=chat-token`);
    const bootstrap = await waitForMessage(ws, (message) => message.type === "bootstrap");
    assert.equal(Array.isArray(bootstrap.payload.transcript), true);
    assert.equal(bootstrap.payload.transcript[0].type, "message_group");

    ws.send(JSON.stringify({ type: "submit_prompt", prompt: "Continue the investigation" }));

    const transcriptUpdated = await waitForMessage(ws, (message) => message.type === "transcript_updated");
    assert.ok(transcriptUpdated.payload.items.some((item) => item.type === "message_group"));

    const completed = await waitForMessage(ws, (message) => message.type === "prompt_completed");
    assert.match(completed.payload.result.text, /Handled prompt/);

    const transcriptItems = await readTranscript(projectDir, 50);
    assert.ok(transcriptItems.some((item) => item.kind === "prompt" && item.text.includes("Continue the investigation")));
    assert.ok(transcriptItems.some((item) => item.kind === "codex_tail" && item.text.includes("Codex handled: Continue the investigation")));

    ws.close();
    await server.close();
  });
});

await runCase("CLI bind command validates session ids against the sessions root", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    await writeSessionFile(sessionsRoot, "019-chat-charlie", [
      { role: "assistant", text: "Bind target.", updated_at: "2026-03-08T00:03:00.000Z" }
    ]);

    const exitCode = await runCli(["bind", "--project", projectDir, "--session-id", "019-chat-charlie", "--sessions-root", sessionsRoot]);
    assert.equal(exitCode, 0);
  });
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[kfc-chat:test] ${failed} test(s) failed.`);
} else {
  console.log("[kfc-chat:test] all tests passed.");
}
