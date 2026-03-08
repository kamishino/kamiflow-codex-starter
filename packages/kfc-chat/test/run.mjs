import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import {
  bindCodexSession,
  buildTranscriptDisplayBlocks,
  hydrateTranscriptFromCodex,
  readTranscript,
  resolveBoundSession,
  unbindCodexSession
} from "../src/chat-state.js";
import { runCli } from "../src/cli.js";
import { createKfcChatServer } from "../src/server.js";

let failed = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 9) {
          throw err;
        }
        await sleep(25);
      }
    }
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

async function captureCli(argv, deps = {}) {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const exitCode = await runCli(argv, deps);
    return { exitCode, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
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

    const cliShow = await captureCli(["show", "--project", projectDir, "--sessions-root", sessionsRoot]);
    assert.equal(cliShow.exitCode, 0);
    assert.ok(cliShow.logs.some((line) => line.includes("Session ID: 019-chat-alpha")));

    let copiedText = "";
    const cliCopy = await captureCli(
      ["copy", "--project", projectDir, "--sessions-root", sessionsRoot, "--field", "session-path"],
      {
        copyTextToClipboard: async (text) => {
          copiedText = text;
        }
      }
    );
    assert.equal(cliCopy.exitCode, 0);
    assert.equal(copiedText, sessionPath);

    let revealed = null;
    const cliReveal = await captureCli(
      ["reveal", "--project", projectDir, "--sessions-root", sessionsRoot, "--target", "folder"],
      {
        revealPath: async (targetPath, options = {}) => {
          revealed = { targetPath, options };
        }
      }
    );
    assert.equal(cliReveal.exitCode, 0);
    assert.equal(revealed.targetPath, path.dirname(sessionPath));
    assert.equal(revealed.options.target, "folder");

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
    { id: "e1", role: "system", kind: "function_call_output", text: "Tool output", created_at: "2026-03-08T00:04:00.000Z", status: "synced" }
  ]);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, "event_row");
  assert.equal(blocks[0].label, "Tool Output");
  assert.equal(blocks[1].type, "message_group");
  assert.equal(blocks[1].role, "user");
  assert.equal(blocks[2].type, "message_group");
  assert.equal(blocks[2].role, "assistant");
  assert.equal(blocks[2].items.length, 2);
});

await runCase("event_msg transcript records become human-readable bubbles or notes", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    const sessionPath = await writeSessionFile(sessionsRoot, "019-chat-event-msg", [
      { timestamp: "2026-03-08T00:01:00.000Z", type: "event_msg", payload: { type: "task_started", message: "Started check run." } },
      { timestamp: "2026-03-08T00:02:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Please review the trace." } },
      { timestamp: "2026-03-08T00:03:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "I found the regression." } },
      { timestamp: "2026-03-08T00:04:00.000Z", type: "event_msg", payload: { type: "agent_reasoning", message: "Comparing the latest parser branch." } },
      { timestamp: "2026-03-08T00:05:00.000Z", type: "event_msg", payload: { type: "token_count", total_tokens: 1234 } },
      { timestamp: "2026-03-08T00:06:00.000Z", type: "event_msg", payload: { type: "custom_signal" } },
      { timestamp: "2026-03-08T00:07:00.000Z", type: "event_msg", payload: { type: "task_complete", message: "Check run completed." } }
    ]);

    const hydration = await hydrateTranscriptFromCodex(projectDir, sessionPath);
    assert.equal(hydration.appended.length, 6);

    const transcriptItems = await readTranscript(projectDir, 20);
    assert.equal(transcriptItems.some((item) => item.kind === "token_count"), false);

    const blocks = buildTranscriptDisplayBlocks(transcriptItems);
    assert.ok(blocks.some((item) => item.type === "message_group" && item.role === "user" && item.items.some((entry) => entry.text.includes("Please review the trace"))));
    assert.ok(blocks.some((item) => item.type === "message_group" && item.role === "assistant" && item.items.some((entry) => entry.text.includes("I found the regression"))));
    assert.ok(blocks.some((item) => item.type === "event_row" && item.label === "Task Started" && item.text.includes("Started check run")));
    assert.ok(blocks.some((item) => item.type === "event_row" && item.label === "Reasoning" && item.text.includes("Comparing the latest parser branch")));
    assert.ok(blocks.some((item) => item.type === "event_row" && item.label === "Custom Signal" && item.text === "Custom Signal."));
    assert.ok(blocks.some((item) => item.type === "event_row" && item.label === "Task Complete" && item.text.includes("Check run completed")));
  });
});

await runCase("server exposes onboarding when the client session file is missing", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await fs.mkdir(projectDir, { recursive: true });

    const server = await createKfcChatServer({
      projectDir,
      sessionsRoot,
      host: "127.0.0.1",
      port: 0,
      token: "chat-token"
    });
    await server.ready();
    const listener = await server.listen();

    const session = await fetch(`${listener.url}/api/chat/session`, {
      headers: { Authorization: "Bearer chat-token" }
    });
    const sessionPayload = await session.json();
    assert.equal(sessionPayload.bound_session.bound, false);
    assert.equal(sessionPayload.bound_session.state, "client_session_missing");
    assert.equal(sessionPayload.bound_session.can_bind, false);
    assert.equal(sessionPayload.bound_session.onboarding_command, "kfc client --force --no-launch-codex");

    const bindResult = await fetch(`${listener.url}/api/chat/bind`, {
      method: "POST",
      headers: {
        Authorization: "Bearer chat-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session_id: "019-chat-missing" })
    });
    assert.equal(bindResult.status, 409);

    await server.close();
  });
});

await runCase("server binds an unbound project runtime from the browser", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    const sessionPath = await writeSessionFile(sessionsRoot, "019-chat-delta", [
      { role: "assistant", text: "Ready to bind.", updated_at: "2026-03-08T00:05:00.000Z" }
    ]);

    const server = await createKfcChatServer({
      projectDir,
      sessionsRoot,
      host: "127.0.0.1",
      port: 0,
      token: "chat-token"
    });
    await server.ready();
    const listener = await server.listen();

    const session = await fetch(`${listener.url}/api/chat/session`, {
      headers: { Authorization: "Bearer chat-token" }
    });
    const sessionPayload = await session.json();
    assert.equal(sessionPayload.bound_session.bound, false);
    assert.equal(sessionPayload.bound_session.state, "session_unbound");
    assert.equal(sessionPayload.bound_session.can_bind, true);

    const bindResult = await fetch(`${listener.url}/api/chat/bind`, {
      method: "POST",
      headers: {
        Authorization: "Bearer chat-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session_id: "019-chat-delta" })
    });
    assert.equal(bindResult.status, 200);
    const bindPayload = await bindResult.json();
    assert.equal(bindPayload.session.bound_session.bound, true);
    assert.equal(bindPayload.session.bound_session.session_id, "019-chat-delta");
    assert.equal(bindPayload.session.bound_session.session_path, sessionPath);

    await server.close();
  });
});

await runCase("server exposes health/session/transcript and streams prompt updates over WebSocket", async () => {
  await withTempDir(async (tempDir) => {
    const projectDir = path.join(tempDir, "project");
    const sessionsRoot = path.join(tempDir, "sessions");
    await seedProject(projectDir);
    const sessionPath = await writeSessionFile(sessionsRoot, "019-chat-bravo", [
      { timestamp: "2026-03-08T00:01:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Existing Codex reply." } }
    ]);
    await bindCodexSession(projectDir, "019-chat-bravo", sessionsRoot);

    const executePrompt = async ({ prompt }) => {
      await fs.appendFile(
        sessionPath,
        JSON.stringify({ timestamp: "2026-03-08T00:02:00.000Z", type: "event_msg", payload: { type: "agent_message", message: `Codex handled: ${prompt}` } }) + "\n" +
        JSON.stringify({ timestamp: "2026-03-08T00:02:15.000Z", type: "event_msg", payload: { type: "agent_reasoning", message: `Investigating: ${prompt}` } }) + "\n" +
        JSON.stringify({ timestamp: "2026-03-08T00:02:20.000Z", type: "event_msg", payload: { type: "token_count", total_tokens: 77 } }) + "\n" +
        JSON.stringify({ timestamp: "2026-03-08T00:02:30.000Z", type: "response_item", payload: { type: "function_call_output", output: `Tool output for: ${prompt}` } }) + "\n",
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

    let revealed = null;
    const server = await createKfcChatServer({
      projectDir,
      sessionsRoot,
      host: "127.0.0.1",
      port: 0,
      token: "chat-token",
      executePrompt,
      revealTarget: async ({ binding, target }) => {
        revealed = { binding, target };
        return {
          target,
          path: target === "folder" ? path.dirname(binding.session_path) : binding.session_path
        };
      }
    });
    await server.ready();
    const listener = await server.listen();

    const health = await fetch(`${listener.url}/api/chat/health`);
    assert.equal(health.status, 200);

    const html = await fetch(`${listener.url}/`);
    const htmlText = await html.text();
    assert.match(htmlText, /Bound Session Timeline/);
    assert.match(htmlText, /conversation-summary/);
    assert.match(htmlText, /bind-session-button/);
    assert.match(htmlText, /copy-session-id-button/);
    assert.match(htmlText, /reveal-session-file-button/);

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

    const revealResult = await fetch(`${listener.url}/api/chat/reveal`, {
      method: "POST",
      headers: {
        Authorization: "Bearer chat-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ target: "folder" })
    });
    assert.equal(revealResult.status, 200);
    const revealPayload = await revealResult.json();
    assert.equal(revealPayload.target, "folder");
    assert.equal(revealPayload.path, path.dirname(sessionPath));
    assert.equal(revealed.binding.session_id, "019-chat-bravo");
    assert.equal(revealed.target, "folder");

    const ws = new WebSocket(`ws://127.0.0.1:${listener.port}/ws?token=chat-token`);
    const bootstrap = await waitForMessage(ws, (message) => message.type === "bootstrap");
    assert.equal(Array.isArray(bootstrap.payload.transcript), true);
    assert.equal(bootstrap.payload.transcript[0].type, "message_group");

    ws.send(JSON.stringify({ type: "submit_prompt", prompt: "Continue the investigation" }));

    const transcriptUpdated = await waitForMessage(ws, (message) => message.type === "transcript_updated");
    assert.ok(Array.isArray(transcriptUpdated.payload.items));
    assert.ok(transcriptUpdated.payload.items.some((item) => item.type === "message_group"));

    const completed = await waitForMessage(ws, (message) => message.type === "prompt_completed");
    assert.match(completed.payload.result.text, /Handled prompt/);

    const settled = await waitForMessage(ws, (message) =>
      message.type === "session_updated" &&
      message.payload?.busy === false &&
      Number(message.payload?.queue_depth || 0) === 0 &&
      message.payload?.status === "done" &&
      String(message.payload?.last_result?.text || "").includes("Handled prompt")
    );
    assert.equal(settled.payload.busy, false);

    const finalTranscript = await fetch(`${listener.url}/api/chat/transcript`, {
      headers: { Authorization: "Bearer chat-token" }
    });
    const finalTranscriptPayload = await finalTranscript.json();
    assert.ok(finalTranscriptPayload.items.some((item) => item.type === "event_row" && item.label === "Tool Output"));
    assert.ok(finalTranscriptPayload.items.some((item) => item.type === "event_row" && item.label === "Reasoning"));
    assert.ok(finalTranscriptPayload.items.some((item) => item.type === "message_group" && item.role === "user"));
    assert.ok(finalTranscriptPayload.items.some((item) => item.type === "message_group" && item.label === "Codex"));
    assert.equal(finalTranscriptPayload.items.some((item) => item.text?.includes?.("token_count") || item.items?.some?.((entry) => entry.text.includes("token_count"))), false);

    const transcriptItems = await readTranscript(projectDir, 50);
    assert.ok(transcriptItems.some((item) => item.kind === "prompt" && item.text.includes("Continue the investigation")));
    assert.ok(transcriptItems.some((item) => item.kind === "agent_message" && item.text.includes("Codex handled: Continue the investigation")));
    assert.equal(transcriptItems.some((item) => item.kind === "token_count"), false);

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
