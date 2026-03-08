import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { runCodexResumeAction } from "../../../../src/lib/codex-runner.js";
import { resolveRevealTargetPath, revealPath as sharedRevealPath } from "../../../../src/lib/session-actions.js";
import {
  appendTranscriptEntry,
  bindCodexSession,
  buildTranscriptDisplayBlocks,
  describeCodexResult,
  ensureChatRuntimeSession,
  hydrateTranscriptFromCodex,
  loadChatSession,
  readTranscript,
  resolveBoundSession,
  saveChatSession
} from "../lib/chat-state.js";
import { registerApiRoutes } from "./routes/api-routes.js";
import { registerUiRoutes } from "./routes/ui-routes.js";

function nowIso() {
  return new Date().toISOString();
}

function createPromptId() {
  return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactText(value: unknown, max = 4000) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingPathError(err: any) {
  return Boolean(err) && (err.code === "ENOENT" || err.code === "ENOTDIR");
}

async function defaultExecutePrompt({ projectDir, prompt, planId, sessionId, timeoutMs }: any) {
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

export async function createKfcChatServer(options: Record<string, any> = {}) {
  const projectDir = options.projectDir;
  const host = String(options.host || "127.0.0.1");
  const port = Number.isInteger(options.port) && options.port >= 0 ? Number(options.port) : 4322;
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5 * 60 * 1000;
  const projectName = String(options.projectName || projectDir.split(/[\\/]/).filter(Boolean).pop() || "KFC Chat");
  const sessionsRoot = options.sessionsRoot;
  const fastify = Fastify({ logger: false });
  const promptQueue: Array<{ id: string; prompt: string; created_at: string }> = [];
  const transcriptCache = await readTranscript(projectDir, 300);
  let chatSession = await ensureChatRuntimeSession(projectDir, { host, port, token: options.token || "" });
  let boundSession: any = await resolveBoundSession(projectDir, sessionsRoot);
  const wsClients = new Set<any>();
  let processing = false;
  let shuttingDown = false;

  const wss = new WebSocketServer({ noServer: true });
  const revealTarget = options.revealTarget || (async ({ binding, target }: any) => {
    const resolved = resolveRevealTargetPath(binding, target);
    await sharedRevealPath(resolved.path, { target: resolved.target });
    return resolved;
  });
  const bindSession = options.bindSession || (async ({ projectDir: nextProjectDir, sessionId, sessionsRoot: nextSessionsRoot }: any) =>
    await bindCodexSession(nextProjectDir, sessionId, nextSessionsRoot));

  function buildSessionPayload() {
    return {
      ...chatSession,
      bound_session: boundSession,
      queue_depth: promptQueue.length,
      busy: processing || promptQueue.length > 0,
      manual_resume_command: boundSession.bound ? boundSession.manual_resume_command : ""
    };
  }

  function buildTranscriptPayload() {
    return { items: buildTranscriptDisplayBlocks(transcriptCache.slice(-300)) };
  }

  function broadcast(type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload });
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  async function persistSession() {
    if (shuttingDown) {
      return;
    }
    chatSession = {
      ...chatSession,
      updated_at: nowIso(),
      queue_depth: promptQueue.length,
      busy: processing || promptQueue.length > 0,
      connection_count: wsClients.size
    };
    try {
      await saveChatSession(projectDir, chatSession);
    } catch (err: any) {
      if (isMissingPathError(err)) {
        shuttingDown = true;
        return;
      }
      throw err;
    }
    broadcast("session_updated", buildSessionPayload());
  }

  async function refreshBoundSession() {
    boundSession = await resolveBoundSession(projectDir, sessionsRoot);
  }

  async function appendEntry(entry: any) {
    const persisted = await appendTranscriptEntry(projectDir, entry);
    transcriptCache.push(persisted);
    while (transcriptCache.length > 300) transcriptCache.shift();
    broadcast("transcript_updated", buildTranscriptPayload());
    return persisted;
  }

  async function syncFromCodexTail() {
    if (!boundSession.bound) return;
    const result = await hydrateTranscriptFromCodex(projectDir, boundSession.session_path);
    if (result.appended.length === 0) return;
    for (const entry of result.appended) {
      transcriptCache.push(entry);
      while (transcriptCache.length > 300) transcriptCache.shift();
    }
    broadcast("transcript_updated", buildTranscriptPayload());
  }

  async function processQueue() {
    if (processing) return;
    const next = promptQueue[0];
    if (!next) {
      chatSession = { ...chatSession, status: chatSession.status === "blocked" ? "blocked" : "idle", current_prompt_id: null, queue_depth: 0, busy: false };
      await persistSession();
      return;
    }
    processing = true;
    chatSession = { ...chatSession, busy: true, status: "working", current_prompt_id: next.id, queue_depth: promptQueue.length, last_prompt_at: next.created_at };
    await persistSession();
    broadcast("prompt_started", { prompt_id: next.id });
    try {
      await refreshBoundSession();
      if (!boundSession.bound) throw new Error(boundSession.reason || "No Codex session bound.");
      const executePrompt = options.executePrompt || defaultExecutePrompt;
      const result = await executePrompt({ projectDir, prompt: next.prompt, planId: boundSession.plan_id, sessionId: boundSession.session_id, timeoutMs, promptId: next.id });
      const summary = describeCodexResult(result);
      await appendEntry({ role: "assistant", kind: "codex_result", text: summary.text, status: summary.state, fingerprint: `result:${next.id}`, meta: { prompt_id: next.id, result_status: result.status || "failed", error_code: result.error_code || null } });
      await syncFromCodexTail();
      chatSession = { ...chatSession, status: summary.state === "completed" ? "done" : "blocked", last_result: summary };
      broadcast("prompt_completed", { prompt_id: next.id, result: summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const summary = { state: "blocked", text: compactText(message, 3000) };
      await appendEntry({ role: "system", kind: "prompt_error", text: summary.text, status: "blocked", fingerprint: `error:${next.id}`, meta: { prompt_id: next.id } });
      chatSession = { ...chatSession, status: "blocked", last_result: summary };
      broadcast("prompt_failed", { prompt_id: next.id, error: message });
    } finally {
      promptQueue.shift();
      processing = false;
      chatSession = { ...chatSession, busy: false, current_prompt_id: null, queue_depth: promptQueue.length };
      await persistSession();
      if (promptQueue.length > 0) queueMicrotask(() => { void processQueue(); });
    }
  }

  function verifyToken(token: unknown) {
    return String(token || "").trim() === String(chatSession.token || "").trim();
  }

  function tokenFromRequest(request: any) {
    return String(request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() || String(request.query?.token || request.body?.token || "").trim();
  }

  async function requireAuth(request: any, reply: any) {
    if (!verifyToken(tokenFromRequest(request))) {
      reply.code(401);
      return reply.send({ error: "Unauthorized. Provide a valid chat token.", error_code: "KFC_CHAT_AUTH_REQUIRED" });
    }
    return null;
  }

  registerUiRoutes(fastify, { projectName, projectDir });
  registerApiRoutes(fastify, {
    health: async () => ({ ok: true, websocket: true, bound_session: boundSession.bound }),
    verifyToken: async (request: any, reply: any) => {
      if (!verifyToken(tokenFromRequest(request))) {
        reply.code(401);
        return { error: "Unauthorized. Provide a valid chat token.", error_code: "KFC_CHAT_AUTH_REQUIRED" };
      }
      return { ok: true };
    },
    session: async (request: any, reply: any) => {
      const denied = await requireAuth(request, reply);
      if (denied) return denied;
      await refreshBoundSession();
      return buildSessionPayload();
    },
    transcript: async (request: any, reply: any) => {
      const denied = await requireAuth(request, reply);
      if (denied) return denied;
      await syncFromCodexTail();
      return buildTranscriptPayload();
    },
    reveal: async (request: any, reply: any) => {
      const denied = await requireAuth(request, reply);
      if (denied) return denied;
      await refreshBoundSession();
      if (!boundSession.bound) {
        reply.code(409);
        return { error: boundSession.reason || "No Codex session bound.", error_code: "KFC_CHAT_NOT_BOUND" };
      }
      try {
        const target = String(request.body?.target || "file").trim() || "file";
        const result = await revealTarget({ binding: boundSession, target });
        return { ok: true, target: result.target, path: result.path };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err), error_code: "KFC_CHAT_REVEAL_FAILED" };
      }
    },
    bind: async (request: any, reply: any) => {
      const denied = await requireAuth(request, reply);
      if (denied) return denied;
      const sessionId = String(request.body?.session_id || "").trim();
      if (!sessionId) {
        reply.code(400);
        return { error: "Missing `session_id` for bind.", error_code: "KFC_CHAT_BIND_ID_REQUIRED" };
      }
      try {
        await bindSession({ projectDir, sessionId, sessionsRoot });
        await refreshBoundSession();
        await persistSession();
        return { ok: true, session: buildSessionPayload() };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(message.includes(".kfc/session.json") ? 409 : 400);
        return { error: message, error_code: message.includes(".kfc/session.json") ? "KFC_CHAT_CLIENT_SESSION_MISSING" : "KFC_CHAT_BIND_FAILED" };
      }
    }
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
    ws.send(JSON.stringify({ type: "bootstrap", payload: { session: buildSessionPayload(), transcript: buildTranscriptPayload().items } }));

    ws.on("message", async (raw) => {
      let payload: any;
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
      await appendEntry({ id: promptId, created_at: createdAt, role: "user", kind: "prompt", text: prompt, status: "queued", fingerprint: `prompt:${promptId}`, meta: { prompt_id: promptId } });
      promptQueue.push({ id: promptId, prompt, created_at: createdAt });
      chatSession = { ...chatSession, queue_depth: promptQueue.length, status: processing ? "working" : "queued" };
      await persistSession();
      ws.send(JSON.stringify({ type: "queued", payload: { prompt_id: promptId, queue_depth: promptQueue.length } }));
      queueMicrotask(() => { void processQueue(); });
    });

    ws.on("close", async () => {
      wsClients.delete(ws);
      if (!shuttingDown) {
        await persistSession();
      }
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
      const address = fastify.server.address() as any;
      const actualPort = address && typeof address === "object" && "port" in address ? Number(address.port) : port;
      chatSession = { ...((await loadChatSession(projectDir)) || {}), port: actualPort, host, updated_at: nowIso(), connection_count: wsClients.size } as any;
      await saveChatSession(projectDir, chatSession);
      return { port: actualPort, url: `http://${host}:${actualPort}`, token: chatSession.token };
    },
    async close() {
      shuttingDown = true;
      for (let attempt = 0; attempt < 100 && processing; attempt += 1) {
        await sleep(10);
      }
      for (const client of wsClients) {
        try { client.close(); } catch {}
      }
      wss.close();
      await fastify.close();
    }
  };
}
