import Fastify from "fastify";
import { EventEmitter } from "node:events";
import {
  appendTranscriptEntry,
  ensureRemoteAuth,
  ensureRemoteScaffold,
  loadRemoteSession,
  readTranscript,
  resolveBoundSession,
  resolveRemotePaths,
  saveRemoteSession,
  summarizeRemoteResult
} from "./remote-state.js";
import { buildRemoteHtml, REMOTE_UI_CSS, REMOTE_UI_JS } from "./remote-ui.js";
import { runCodexAction } from "./codex-runner.js";

function nowIso() {
  return new Date().toISOString();
}

function createEventHub(limit = 200) {
  const emitter = new EventEmitter();
  const replay = [];
  let nextId = 1;
  return {
    publish(eventType, payload) {
      const event = { id: nextId++, eventType, payload };
      replay.push(event);
      if (replay.length > limit) {
        replay.shift();
      }
      emitter.emit("event", event);
      return event;
    },
    replaySince(lastId = 0) {
      return replay.filter((item) => item.id > lastId);
    },
    subscribe(listener) {
      emitter.on("event", listener);
      return () => emitter.off("event", listener);
    }
  };
}

function createPromptId() {
  return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeToken(input) {
  return String(input || "").trim();
}

function compactText(value, max = 3000) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function defaultExecutePrompt({ projectDir, prompt, planId, timeoutMs }) {
  return await runCodexAction({
    plan_id: planId,
    action_type: "remote_prompt",
    prompt,
    full_auto: true,
    cwd: projectDir,
    timeout_ms: timeoutMs
  });
}

function buildInitialSession({ projectDir, host, port, boundSession, previous }) {
  return {
    generated_at: previous?.generated_at || nowIso(),
    updated_at: nowIso(),
    server_pid: process.pid,
    project_dir: projectDir,
    host,
    port,
    status: previous?.status || "idle",
    busy: false,
    queue_depth: 0,
    current_prompt_id: null,
    last_prompt_at: previous?.last_prompt_at || "",
    last_result: previous?.last_result || null,
    bound_session: boundSession
  };
}

export async function createRemoteServer(options) {
  const projectDir = options.projectDir;
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4320);
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5 * 60 * 1000;
  const projectName = String(options.projectName || projectDir.split(/[\\/]/).filter(Boolean).pop() || "Kami Flow");
  const auth = await ensureRemoteAuth(projectDir, options.token || "", false);
  await ensureRemoteScaffold(projectDir);
  const eventHub = createEventHub();
  const fastify = Fastify({ logger: false });
  const promptQueue = [];
  const transcriptCache = await readTranscript(projectDir, 200);
  const previousSession = await loadRemoteSession(projectDir);
  let boundSession = await resolveBoundSession(projectDir);
  let session = buildInitialSession({ projectDir, host, port, boundSession, previous: previousSession });
  let processing = false;

  async function persistSession() {
    session = {
      ...session,
      updated_at: nowIso()
    };
    await saveRemoteSession(projectDir, session);
    eventHub.publish("session_updated", {
      event_type: "session_updated",
      session
    });
  }

  async function refreshBoundSession() {
    boundSession = await resolveBoundSession(projectDir);
    session = {
      ...session,
      bound_session: boundSession
    };
  }

  function isAuthorized(request) {
    const tokenFromHeader = String(request.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const tokenFromQuery = normalizeToken(request.query?.token);
    const tokenFromBody = normalizeToken(request.body?.token);
    const candidate = tokenFromHeader || tokenFromQuery || tokenFromBody;
    return candidate.length > 0 && candidate === auth.token;
  }

  async function requireAuth(request, reply) {
    if (!isAuthorized(request)) {
      reply.code(401);
      return reply.send({ error: "Unauthorized. Provide a valid remote token.", error_code: "REMOTE_AUTH_REQUIRED" });
    }
    return null;
  }

  async function appendEntry(entry) {
    const persisted = await appendTranscriptEntry(projectDir, entry);
    transcriptCache.push(persisted);
    while (transcriptCache.length > 200) {
      transcriptCache.shift();
    }
    eventHub.publish("transcript_appended", {
      event_type: "transcript_appended",
      entry: persisted
    });
    return persisted;
  }

  async function processQueue() {
    if (processing) {
      return;
    }
    const next = promptQueue[0];
    if (!next) {
      session = { ...session, busy: false, current_prompt_id: null, queue_depth: 0, status: session.status === "blocked" ? "blocked" : "idle" };
      await persistSession();
      return;
    }

    processing = true;
    session = {
      ...session,
      busy: true,
      status: "working",
      queue_depth: promptQueue.length,
      current_prompt_id: next.id,
      last_prompt_at: next.created_at
    };
    await persistSession();
    eventHub.publish("prompt_started", {
      event_type: "prompt_started",
      prompt_id: next.id
    });

    try {
      await refreshBoundSession();
      if (!boundSession.bound) {
        throw new Error(boundSession.reason || "No bound session.");
      }
      const executePrompt = options.executePrompt || defaultExecutePrompt;
      const result = await executePrompt({
        projectDir,
        prompt: next.prompt,
        planId: boundSession.plan_id,
        timeoutMs,
        promptId: next.id
      });
      const summary = summarizeRemoteResult(result);
      await appendEntry({
        role: "assistant",
        kind: "codex_result",
        text: summary.text,
        status: summary.state,
        meta: {
          prompt_id: next.id,
          result_status: result.status || "failed",
          error_code: result.error_code || null
        }
      });
      session = {
        ...session,
        status: summary.state === "completed" ? "done" : "blocked",
        last_result: summary
      };
      eventHub.publish("prompt_completed", {
        event_type: "prompt_completed",
        prompt_id: next.id,
        result: summary
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const summary = { state: "blocked", text: compactText(message) };
      await appendEntry({
        role: "system",
        kind: "prompt_error",
        text: summary.text,
        status: "blocked",
        meta: {
          prompt_id: next.id
        }
      });
      session = {
        ...session,
        status: "blocked",
        last_result: summary
      };
      eventHub.publish("prompt_failed", {
        event_type: "prompt_failed",
        prompt_id: next.id,
        error: message
      });
    } finally {
      promptQueue.shift();
      session = {
        ...session,
        busy: false,
        current_prompt_id: null,
        queue_depth: promptQueue.length
      };
      processing = false;
      await persistSession();
      if (promptQueue.length > 0) {
        queueMicrotask(() => {
          void processQueue();
        });
      }
    }
  }

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return buildRemoteHtml({ projectName });
  });

  fastify.get("/assets/remote.css", async (_request, reply) => {
    reply.type("text/css; charset=utf-8");
    return REMOTE_UI_CSS;
  });

  fastify.get("/assets/remote.js", async (_request, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return REMOTE_UI_JS;
  });

  fastify.get("/api/remote/health", async () => ({
    ok: true,
    auth_configured: true,
    bound_session: boundSession.bound
  }));

  fastify.post("/api/remote/token/verify", async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.code(401);
      return { error: "Unauthorized. Provide a valid remote token.", error_code: "REMOTE_AUTH_REQUIRED" };
    }
    return { ok: true };
  });

  fastify.get("/api/remote/session", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    await refreshBoundSession();
    session = { ...session, bound_session: boundSession, queue_depth: promptQueue.length, busy: processing || promptQueue.length > 0 };
    return session;
  });

  fastify.get("/api/remote/transcript", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    return { items: transcriptCache.slice(-200) };
  });

  fastify.post("/api/remote/prompt", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    await refreshBoundSession();
    if (!boundSession.bound) {
      reply.code(409);
      return {
        error: boundSession.reason,
        error_code: "REMOTE_SESSION_NOT_BOUND"
      };
    }
    const prompt = compactText(request.body?.prompt || "", 4000);
    if (!prompt) {
      reply.code(400);
      return { error: "Missing prompt.", error_code: "REMOTE_PROMPT_REQUIRED" };
    }
    const item = {
      id: createPromptId(),
      prompt,
      created_at: nowIso()
    };
    promptQueue.push(item);
    await appendEntry({
      role: "user",
      kind: "prompt",
      text: prompt,
      status: promptQueue.length === 1 && !processing ? "running" : "queued",
      meta: {
        prompt_id: item.id
      }
    });
    session = {
      ...session,
      status: processing ? "working" : session.status,
      queue_depth: promptQueue.length
    };
    await persistSession();
    queueMicrotask(() => {
      void processQueue();
    });
    return {
      ok: true,
      prompt_id: item.id,
      queue_depth: promptQueue.length,
      accepted_state: processing ? "queued" : "running"
    };
  });

  fastify.get("/api/remote/events", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.raw.write("\n");
    const lastEventId = Number(request.headers["last-event-id"] || 0);

    const writeEvent = (event) => {
      reply.raw.write(`id: ${event.id}\n`);
      reply.raw.write(`event: ${event.eventType}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    };

    for (const event of eventHub.replaySince(lastEventId)) {
      writeEvent(event);
    }

    writeEvent(
      eventHub.publish("connected", {
        event_type: "connected",
        session
      })
    );

    const unsubscribe = eventHub.subscribe(writeEvent);
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return reply;
  });

  fastify.addHook("onClose", async () => {
    eventHub.publish("server_closed", {
      event_type: "server_closed",
      updated_at: nowIso()
    });
  });

  await persistSession();

  return {
    fastify,
    authToken: auth.token,
    authPath: resolveRemotePaths(projectDir).authPath,
    getSession: () => session,
    getTranscript: () => transcriptCache.slice(),
    async listen() {
      const address = await fastify.listen({ host, port });
      try {
        const parsed = new URL(String(address));
        session = {
          ...session,
          host: parsed.hostname,
          port: Number(parsed.port || session.port || 0)
        };
        await persistSession();
      } catch {
        // Ignore address parsing failure; keep configured host/port.
      }
      return {
        url: String(address),
        token: auth.token
      };
    }
  };
}
