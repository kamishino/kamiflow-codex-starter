import { createFeatureServer } from "../../../kfc-web-runtime/src/feature-server.js";
import {
  defaultSessionsRoot,
  ensureSessionsRoot,
  exportSession,
  getSessionDetail,
  importSessions,
  listSessions,
  restoreSession,
  summarizeSessionsRoot
} from "../session-store.js";
import { registerUiRoutes } from "./routes/ui-routes.js";

type SessionFeatureOptions = {
  sessionsRoot?: string;
  mountUi?: boolean;
  mountHealth?: boolean;
  host?: string;
  port?: number;
};

export async function registerKfcSessionFeature(fastify: any, options: SessionFeatureOptions = {}) {
  const sessionsRoot = await ensureSessionsRoot(options.sessionsRoot || defaultSessionsRoot());

  if (options.mountUi !== false) {
    registerUiRoutes(fastify, { sessionsRoot });
  }

  if (options.mountHealth !== false) {
    fastify.get("/api/health", async () => {
      return {
        ok: true,
        sessions_root: sessionsRoot
      };
    });
  }

  fastify.get("/api/sessions", async (request: any) => {
    const query = (request.query || {}) as { query?: string; date?: string };
    const items = await listSessions(sessionsRoot, {
      query: query.query || "",
      date: String(query.date || "").trim().replaceAll("-", "/")
    });
    const summary = await summarizeSessionsRoot(sessionsRoot);
    return {
      items,
      summary
    };
  });

  fastify.get("/api/sessions/:id", async (request: any, reply: any) => {
    try {
      const item = await getSessionDetail(sessionsRoot, request.params.id);
      return { item };
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post("/api/sessions/export", async (request: any, reply: any) => {
    const payload = (request.body || {}) as { id?: string; to?: string };
    if (!payload.id || !payload.to) {
      return reply.code(400).send({ error: "Missing `id` or `to` for export." });
    }
    try {
      const result = await exportSession(sessionsRoot, payload.id, payload.to);
      return {
        message: `Exported ${result.session_id} to ${result.destination_path}.`,
        result
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post("/api/sessions/import", async (request: any, reply: any) => {
    const payload = (request.body || {}) as { from?: string };
    if (!payload.from) {
      return reply.code(400).send({ error: "Missing `from` path for import." });
    }
    try {
      const result = await importSessions(sessionsRoot, payload.from);
      return {
        message: `Imported ${result.length} session file(s) into ${sessionsRoot}.`,
        result
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post("/api/sessions/restore", async (request: any, reply: any) => {
    const payload = (request.body || {}) as { id?: string };
    if (!payload.id) {
      return reply.code(400).send({ error: "Missing `id` for restore." });
    }
    try {
      const result = await restoreSession(sessionsRoot, payload.id);
      return {
        message: result.message,
        manual_resume_command: result.manual_resume_command,
        result
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return {
    sessionsRoot
  };
}

export async function createKfcSessionServer(options: SessionFeatureOptions = {}) {
  return await createFeatureServer({
    host: options.host || "127.0.0.1",
    port: Number(options.port || 0),
    setup: async (fastify) => await registerKfcSessionFeature(fastify, options)
  });
}
