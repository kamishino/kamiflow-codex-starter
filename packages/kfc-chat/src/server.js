import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { runCodexResumeAction } from "../../../src/lib/codex-runner.js";
import {
  appendTranscriptEntry,
  describeCodexResult,
  ensureChatRuntimeSession,
  hydrateTranscriptFromCodex,
  loadChatSession,
  readTranscript,
  resolveBoundSession,
  saveChatSession
} from "./chat-state.js";
import { buildChatHtml, KFC_CHAT_CSS, KFC_CHAT_JS } from "./ui.js";

function nowIso() {
  return new Date().toISOString();
}

function createPromptId() {
  return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactText(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function defaultExecutePrompt({ projectDir, prompt, planId, sessionId, timeoutMs }) {
  return await runCodexResumeAction({
    plan_id: planId,
    action_type: "chat",
    session_id: sessionId,
    prompt,
    full_auto: true,
    cwd: projectDir,
    timeout_ms: timeoutMs
  });
}

export async function createKfcChatServer(options = {}) {
  const projectDir = options.projectDir;
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4322);
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5 * 60 * 1000;
  const projectName = String(options.projectName || projectDir.split(/[\\/]/).filter(Boolean).pop() || "KFC Chat");
  const sessionsRoot = options.sessionsRoot;
  const fastify = Fastify({ logger: false });
  const promptQueue = [];
  const transcriptCache = await readTranscript(projectDir, 300);
  let chatSession = await ensureChatRuntimeSession(projectDir, {
    host,
    port,
    token: options.token || ""
  });
  let boundSession = await resolveBoundSession(projectDir, sessionsRoot);
  const wsClients = new Set();
  let processing = false;

  const wss = new WebSocketServer({ noServer: true });

  function buildSessionPayload() {
    return {
      ...chatSession,
      bound_session: boundSession,
      queue_depth: promptQueue.length,
      busy: processing || promptQueue.length > 0,
      manual_resume_command: boundSession.bound ? boundSession.manual_resume_command : ""
    };
  }

  function broadcast(type, payload) {
    const message = JSON.stringify({ type, payload });
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  async function persistSession() {
    chatSession = {
      ...chatSession,
      updated_at: nowIso(),
      queue_depth: promptQueue.length,
      busy: processing || promptQueue.length > 0,
      connection_count: wsClients.size
    };
    await saveChatSession(projectDir, chatSession);
    broadcast("session_updated", buildSessionPayload());
  }

  async function refreshBoundSession() {
    boundSession = await resolveBoundSession(projectDir, sessionsRoot);
  }

  async function appendEntry(entry) {
    const persisted = await appendTranscriptEntry(projectDir, entry);
    transcriptCache.push(persisted);
    while (transcriptCache.length > 300) {
      transcriptCache.shift();
    }
    broadcast("transcript_appended", persisted);
    return persisted;
  }

  async function syncFromCodexTail() {
    if (!boundSession.bound) {
      return;
    }
    const result = await hydrateTranscriptFromCodex(projectDir, boundSession.session_path);
    for (const entry of result.appended) {
      transcriptCache.push(entry);
      while (transcriptCache.length > 300) {
        transcriptCache.shift();
      }
      broadcast("transcript_appended", entry);
    }
  }

  async function processQueue() {
    if (processing) {
      return;
    }
    const next = promptQueue[0];
    if (!next) {
      chatSession = {
        ...chatSession,
        status: chatSession.status === "blocked" ? "blocked" : "idle",
        current_prompt_id: null,
        queue_depth: 0,
        busy: false
      };
      await persistSession();
      return;
    }

    processing = true;
    chatSession = {
      ...chatSession,
      busy: true,
      status: "working",
      current_prompt_id: next.id,
      queue_depth: promptQueue.length,
      last_prompt_at: next.created_at
    };
    await persistSession();
    broadcast("prompt_started", { prompt_id: next.id });

    try {
      await refreshBoundSession();
      if (!boundSession.bound) {
        throw new Error(boundSession.reason || "No Codex session bound.");
      }
      const executePrompt = options.executePrompt || defaultExecutePrompt;
      const result = await executePrompt({
        projectDir,
        prompt: next.prompt,
        planId: boundSession.plan_id,
        sessionId: boundSession.session_id,
        timeoutMs,
        promptId: next.id
      });
      const summary = describeCodexResult(result);
      await appendEntry({
        role: "assistant",
        kind: "codex_result",
        text: summary.text,
        status: summary.state,
        fingerprint: `result:${next.id}`,
        meta: {
          prompt_id: next.id,
          result_status: result.status || "failed",
          error_code: result.error_code || null
        }
      });
      await syncFromCodexTail();
      chatSession = {
        ...chatSession,
        status: summary.state === "completed" ? "done" : "blocked",
        last_result: summary
      };
      broadcast("prompt_completed", {
        prompt_id: next.id,
        result: summary
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const summary = { state: "blocked", text: compactText(message, 3000) };
      await appendEntry({
        role: "system",
        kind: "prompt_error",
        text: summary.text,
        status: "blocked",
        fingerprint: `error:${next.id}`,
        meta: {
          prompt_id: next.id
        }
      });
      chatSession = {
        ...chatSession,
        status: "blocked",
        last_result: summary
      };
      broadcast("prompt_failed", {
        prompt_id: next.id,
        error: message
      });
    } finally {
      promptQueue.shift();
      processing = false;
      chatSession = {
        ...chatSession,
        busy: false,
        current_prompt_id: null,
        queue_depth: promptQueue.length
      };
      await persistSession();
      if (promptQueue.length > 0) {
        queueMicrotask(() => {
          void processQueue();
        });
      }
    }
  }

  function verifyToken(token) {
    return String(token || "").trim() === String(chatSession.token || "").trim();
  }

  function tokenFromRequest(request) {
    return String(request.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim() || String(request.query?.token || request.body?.token || "").trim();
  }

  async function requireAuth(request, reply) {
    if (!verifyToken(tokenFromRequest(request))) {
      reply.code(401);
      return reply.send({ error: "Unauthorized. Provide a valid chat token.", error_code: "KFC_CHAT_AUTH_REQUIRED" });
    }
    return null;
  }

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return buildChatHtml({ projectName, projectDir });
  });

  fastify.get("/assets/kfc-chat.css", async (_request, reply) => {
    reply.type("text/css; charset=utf-8");
    return KFC_CHAT_CSS;
  });

  fastify.get("/assets/kfc-chat.js", async (_request, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return KFC_CHAT_JS;
  });

  fastify.get("/api/chat/health", async () => ({
    ok: true,
    websocket: true,
    bound_session: boundSession.bound
  }));

  fastify.post("/api/chat/token/verify", async (request, reply) => {
    if (!verifyToken(tokenFromRequest(request))) {
      reply.code(401);
      return { error: "Unauthorized. Provide a valid chat token.", error_code: "KFC_CHAT_AUTH_REQUIRED" };
    }
    return { ok: true };
  });

  fastify.get("/api/chat/session", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    await refreshBoundSession();
    return buildSessionPayload();
  });

  fastify.get("/api/chat/transcript", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    await syncFromCodexTail();
    return { items: transcriptCache.slice(-300) };
  });

  fastify.server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      if (!verifyToken(url.searchParams.get("token") || "")) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws) => {
    wsClients.add(ws);
    await refreshBoundSession();
    await persistSession();
    await syncFromCodexTail();
    ws.send(JSON.stringify({
      type: "bootstrap",
      payload: {
        session: buildSessionPayload(),
        transcript: transcriptCache.slice(-300)
      }
    }));

    ws.on("message", async (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw || ""));
      } catch {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid WebSocket payload." } }));
        return;
      }

      if (payload.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", payload: { at: nowIso() } }));
        return;
      }

      if (payload.type !== "submit_prompt") {
        ws.send(JSON.stringify({ type: "error", payload: { message: `Unsupported message type: ${payload.type}` } }));
        return;
      }

      const prompt = compactText(payload.prompt || "", 4000);
      if (!prompt) {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Prompt cannot be empty." } }));
        return;
      }

      await refreshBoundSession();
      if (!boundSession.bound) {
        ws.send(JSON.stringify({ type: "blocked", payload: { message: boundSession.reason } }));
        return;
      }

      const promptId = createPromptId();
      const createdAt = nowIso();
      await appendEntry({
        id: promptId,
        created_at: createdAt,
        role: "user",
        kind: "prompt",
        text: prompt,
        status: "queued",
        fingerprint: `prompt:${promptId}`,
        meta: {
          prompt_id: promptId
        }
      });
      promptQueue.push({ id: promptId, prompt, created_at: createdAt });
      chatSession = {
        ...chatSession,
        queue_depth: promptQueue.length,
        status: processing ? "working" : "queued"
      };
      await persistSession();
      ws.send(JSON.stringify({ type: "queued", payload: { prompt_id: promptId, queue_depth: promptQueue.length } }));
      queueMicrotask(() => {
        void processQueue();
      });
    });

    ws.on("close", async () => {
      wsClients.delete(ws);
      await persistSession();
    });
  });

  return {
    fastify,
    wss,
    projectDir,
    async ready() {
      await fastify.ready();
    },
    async listen() {
      await fastify.listen({ host, port });
      const address = fastify.server.address();
      const actualPort = address && typeof address === "object" && "port" in address ? Number(address.port) : port;
      chatSession = {
        ...(await loadChatSession(projectDir)),
        port: actualPort,
        host,
        updated_at: nowIso(),
        connection_count: wsClients.size
      };
      await saveChatSession(projectDir, chatSession);
      return {
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        token: chatSession.token
      };
    },
    async close() {
      wss.close();
      await fastify.close();
    }
  };
}
