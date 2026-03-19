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
import { runCodexAction } from "@kamishino/kfc-runtime/codex-runner";

function nowIso() {
  return new Date().toISOString();
}

const MAX_PROMPT_DURATION_SAMPLES = 8;
const PROMPT_REPLAY_TTL_MS = 5 * 60 * 1000;
const PROMPT_TEXT_DEDUPE_TTL_MS = 30_000;

function normalizePromptId(value: unknown) {
  return String(value || "").trim();
}

type PromptQueueStatus = "queued" | "running";

type PromptQueueEntry = {
  id: string;
  prompt: string;
  created_at: string;
  status: PromptQueueStatus;
  estimated_wait_ms?: number;
  started_at?: string;
};

type PromptQueueSnapshotEntry = {
  prompt_id: string;
  status: PromptQueueStatus;
  queue_position: number;
  created_at: string;
  estimated_wait_ms?: number;
};

type PromptReplayState = {
  prompt_id: string;
  status: "running" | "completed" | "blocked" | "cancelled";
  accepted_state: "running" | "completed" | "blocked" | "cancelled";
  queue_depth: number;
  updated_at: number;
};

type PromptSignatureState = {
  prompt_id: string;
  seen_at: number;
};

function averageRunDuration(samples: number[]): number | undefined {
  if (!Array.isArray(samples) || samples.length === 0) {
    return undefined;
  }
  const valid = samples
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(250, Math.round(value)));
  if (!valid.length) {
    return undefined;
  }
  const sum = valid.reduce((total, value) => total + value, 0);
  return Math.max(500, Math.round(sum / valid.length));
}

function buildPromptSignature(prompt: string): string {
  return compactText(prompt, 260).toLowerCase();
}

function nowMs() {
  return Date.now();
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
      if (lastId <= 0 || replay.length === 0) {
        return replay.slice();
      }
      const oldestId = replay[0]?.id || 0;
      if (oldestId && lastId < oldestId) {
        return null;
      }
      return replay.filter((item) => item.id > lastId);
    },
    earliestEventId() {
      if (replay.length === 0) {
        return null;
      }
      return replay[0]?.id || null;
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

function readPromptFromBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  return compactText((body as { prompt?: unknown }).prompt || "", 4000);
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
    queue_snapshot: [],
    queue_eta_ms: 0,
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
  const promptQueue: PromptQueueEntry[] = [];
  const promptReplay = new Map<string, PromptReplayState>();
  const promptTextReplay = new Map<string, PromptSignatureState>();
  const promptRunDurations: number[] = [];
  const transcriptCache = await readTranscript(projectDir, 200);
  const previousSession = await loadRemoteSession(projectDir);
  let boundSession = await resolveBoundSession(projectDir);
  let session = buildInitialSession({ projectDir, host, port, boundSession, previous: previousSession });
  let processing = false;

  function cleanupReplayState(now = nowMs()) {
    for (const [key, state] of promptReplay.entries()) {
      if (now - state.updated_at > PROMPT_REPLAY_TTL_MS) {
        promptReplay.delete(key);
      }
    }
    for (const [signature, state] of promptTextReplay.entries()) {
      if (now - state.seen_at > PROMPT_TEXT_DEDUPE_TTL_MS) {
        promptTextReplay.delete(signature);
      }
    }
  }

  function rememberPromptReplay(promptId: string, status: PromptReplayState["status"], acceptedState: PromptReplayState["accepted_state"], queueDepth: number) {
    promptReplay.set(promptId, {
      prompt_id: promptId,
      status,
      accepted_state: acceptedState,
      queue_depth: queueDepth,
      updated_at: nowMs()
    });
  }

  function rememberPromptSignature(prompt: string, promptId: string) {
    const signature = buildPromptSignature(prompt);
    if (!signature) {
      return;
    }
    promptTextReplay.set(signature, {
      prompt_id: promptId,
      seen_at: nowMs()
    });
  }

  function resolvePromptReplayState(promptId: string) {
    return promptReplay.get(promptId) || null;
  }

  function resolvePromptQueueState(promptId: string) {
    const index = promptQueue.findIndex((item) => item.id === promptId);
    if (index === -1) {
      if (processing && session.current_prompt_id === promptId) {
        return {
          status: "running" as const,
          accepted_state: "running" as const,
          queue_depth: promptQueue.length
        };
      }
      return null;
    }
    const status = index === 0 && processing ? "running" : "queued";
    return {
      status,
      accepted_state: status,
      queue_depth: promptQueue.length
    };
  }

  function estimateQueueWait(position: number): number | undefined {
    const avgMs = averageRunDuration(promptRunDurations);
    if (!avgMs || !position || position <= 0) {
      return position <= 0 ? 0 : undefined;
    }
    return avgMs * position;
  }

  function buildQueueSnapshot(): PromptQueueSnapshotEntry[] {
    return promptQueue.map((item, index) => ({
      prompt_id: item.id,
      status: item.status,
      queue_position: index + 1,
      created_at: item.created_at,
      estimated_wait_ms: index === 0 ? 0 : estimateQueueWait(index)
    }));
  }

  function refreshSessionQueueSnapshot() {
    const snapshot = buildQueueSnapshot();
    const remaining = snapshot.length > 0 ? snapshot[snapshot.length - 1].estimated_wait_ms || 0 : 0;
    session = {
      ...session,
      queue_depth: promptQueue.length,
      queue_snapshot: snapshot,
      queue_eta_ms: remaining,
      busy: processing || promptQueue.length > 0
    };
  }

  async function persistSession() {
    refreshSessionQueueSnapshot();
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
      session = {
        ...session,
        busy: false,
        current_prompt_id: null,
        queue_depth: 0,
        status: session.status === "blocked" ? "blocked" : "idle"
      };
      await persistSession();
      return;
    }

    processing = true;
    next.status = "running";
    next.started_at = nowIso();
    rememberPromptReplay(next.id, "running", "running", promptQueue.length);
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

    let summary = null;
    let errorMessage = "";

    try {
      await refreshBoundSession();
      if (!boundSession.bound) {
        throw new Error(boundSession.reason || "No bound session.");
      }
      const executePrompt = options.executePrompt || defaultExecutePrompt;
      summary = await executePrompt({
        projectDir,
        prompt: next.prompt,
        planId: boundSession.plan_id,
        timeoutMs,
        promptId: next.id
      });
      const derivedSummary = summarizeRemoteResult(summary);
      await appendEntry({
        role: "assistant",
        kind: "codex_result",
        text: derivedSummary.text,
        status: derivedSummary.state,
        meta: {
          prompt_id: next.id,
          result_status: summary.status || "failed",
          error_code: summary.error_code || null
        }
      });
      session = {
        ...session,
        status: derivedSummary.state === "completed" ? "done" : "blocked",
        last_result: derivedSummary
      };
      if (next.started_at) {
        const startedAt = Date.parse(next.started_at);
        if (Number.isFinite(startedAt) && derivedSummary.state === "completed") {
          const elapsed = Math.max(250, nowMs() - startedAt);
          promptRunDurations.push(elapsed);
          if (promptRunDurations.length > MAX_PROMPT_DURATION_SAMPLES) {
            promptRunDurations.shift();
          }
        }
      }
      eventHub.publish("prompt_completed", {
        event_type: "prompt_completed",
        prompt_id: next.id,
        result: derivedSummary
      });
      rememberPromptReplay(next.id, derivedSummary.state === "completed" ? "completed" : "blocked", derivedSummary.state === "completed" ? "completed" : "blocked", promptQueue.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorMessage = compactText(message);
      const compactError = compactText(message);
      const summaryOnError = { state: "blocked", text: compactError || "Prompt failed." };
      await appendEntry({
        role: "system",
        kind: "prompt_error",
        text: summaryOnError.text,
        status: "blocked",
        meta: {
          prompt_id: next.id
        }
      });
      session = {
        ...session,
        status: "blocked",
        last_result: summaryOnError
      };
      eventHub.publish("prompt_failed", {
        event_type: "prompt_failed",
        prompt_id: next.id,
        error: message
      });
      rememberPromptReplay(next.id, "blocked", "blocked", promptQueue.length);
    }

    try {
      promptQueue.shift();
      session = {
        ...session,
        busy: false,
        current_prompt_id: null,
        queue_depth: promptQueue.length,
        last_prompt_at: (next as PromptQueueEntry).created_at
      };
      if (summary) {
        await persistSession();
      } else {
        await appendEntry({
          role: "system",
          kind: "remote_error",
          text: errorMessage || "Prompt processing error.",
          status: "blocked",
          meta: {
            prompt_id: next.id
          }
        });
        await persistSession();
      }
    } finally {
      processing = false;
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
    refreshSessionQueueSnapshot();
    session = { ...session, bound_session: boundSession };
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

    const prompt = readPromptFromBody(request.body);
    if (!prompt) {
      reply.code(400);
      return { error: "Missing prompt.", error_code: "REMOTE_PROMPT_REQUIRED" };
    }

    const now = nowMs();
    cleanupReplayState(now);

    const requestedId = normalizePromptId((request.body as { prompt_id?: unknown })?.prompt_id);
    if (requestedId) {
      const live = resolvePromptQueueState(requestedId);
      if (live) {
        return {
          ok: true,
          prompt_id: requestedId,
          queue_depth: live.queue_depth,
          accepted_state: live.accepted_state
        };
      }
      const replay = resolvePromptReplayState(requestedId);
      if (replay && now - replay.updated_at <= PROMPT_REPLAY_TTL_MS) {
        return {
          ok: true,
          prompt_id: replay.prompt_id,
          queue_depth: replay.queue_depth,
          accepted_state: replay.accepted_state
        };
      }
    }

    const signature = buildPromptSignature(prompt);
    if (!requestedId && signature) {
      const replay = promptTextReplay.get(signature);
      if (replay) {
        const live = resolvePromptReplayState(replay.prompt_id) || resolvePromptQueueState(replay.prompt_id);
        if (live && now - replay.seen_at <= PROMPT_TEXT_DEDUPE_TTL_MS) {
          return {
            ok: true,
            prompt_id: replay.prompt_id,
            queue_depth: live.queue_depth,
            accepted_state: live.accepted_state
          };
        }
      }
    }

    const item: PromptQueueEntry = {
      id: requestedId || createPromptId(),
      prompt,
      created_at: nowIso(),
      status: "queued"
    };

    promptQueue.push(item);
    rememberPromptSignature(prompt, item.id);
    rememberPromptReplay(item.id, "queued", processing ? "running" : "queued", promptQueue.length);
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

  fastify.delete("/api/remote/prompt/:prompt_id", async (request, reply) => {
    const denied = await requireAuth(request, reply);
    if (denied) {
      return denied;
    }

    const promptId = normalizePromptId(request.params?.prompt_id);
    if (!promptId) {
      reply.code(400);
      return { error: "Missing prompt id.", error_code: "REMOTE_PROMPT_ID_REQUIRED" };
    }

    const index = promptQueue.findIndex((item) => item.id === promptId);
    if (index === -1) {
      reply.code(404);
      return { error: "Prompt not found in queue.", error_code: "REMOTE_PROMPT_NOT_FOUND" };
    }
    if (index === 0 && processing && session.current_prompt_id === promptId) {
      reply.code(409);
      return {
        error: "Cannot cancel a running prompt.",
        error_code: "REMOTE_PROMPT_ALREADY_RUNNING"
      };
    }

    promptQueue.splice(index, 1);
    rememberPromptReplay(promptId, "cancelled", "cancelled", promptQueue.length);
    await appendEntry({
      role: "system",
      kind: "prompt_cancelled",
      text: `Prompt ${promptId} canceled from queue.`,
      status: "blocked",
      meta: {
        prompt_id: promptId
      }
    });
    session = {
      ...session,
      current_prompt_id: session.current_prompt_id === promptId ? null : session.current_prompt_id,
      queue_depth: promptQueue.length
    };
    await persistSession();
    eventHub.publish("prompt_cancelled", {
      event_type: "prompt_cancelled",
      prompt_id: promptId
    });
    return {
      ok: true,
      prompt_id: promptId,
      queue_depth: promptQueue.length,
      accepted_state: "cancelled"
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

    const writeTransient = (eventType, payload) => {
      reply.raw.write(`event: ${eventType}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const replay = eventHub.replaySince(lastEventId);
    if (replay === null) {
      writeTransient("resync_required", {
        event_type: "resync_required",
        reason: "replay_window_exhausted",
        earliest_event_id: eventHub.earliestEventId()
      });
    } else {
      for (const event of replay) {
        writeEvent(event);
      }
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
