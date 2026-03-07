import Fastify from "fastify";
import {
  defaultSessionsRoot,
  ensureSessionsRoot,
  exportSession,
  getSessionDetail,
  importSessions,
  listSessions,
  restoreSession,
  summarizeSessionsRoot
} from "./session-store.js";
import { buildHtml, KFCS_CSS, KFCS_JS } from "./ui.js";

export async function createKfcsServer(options = {}) {
  const sessionsRoot = await ensureSessionsRoot(options.sessionsRoot || defaultSessionsRoot());
  const fastify = Fastify({ logger: false });

  fastify.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(buildHtml({ sessionsRoot }));
  });

  fastify.get("/assets/kfcs.css", async (_request, reply) => {
    return reply.type("text/css; charset=utf-8").send(KFCS_CSS);
  });

  fastify.get("/assets/kfcs.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(KFCS_JS);
  });

  fastify.get("/api/health", async () => {
    return {
      ok: true,
      sessions_root: sessionsRoot
    };
  });

  fastify.get("/api/sessions", async (request) => {
    const query = request.query || {};
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

  fastify.get("/api/sessions/:id", async (request, reply) => {
    try {
      const item = await getSessionDetail(sessionsRoot, request.params.id);
      return { item };
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post("/api/sessions/export", async (request, reply) => {
    const payload = request.body || {};
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

  fastify.post("/api/sessions/import", async (request, reply) => {
    const payload = request.body || {};
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

  fastify.post("/api/sessions/restore", async (request, reply) => {
    const payload = request.body || {};
    if (!payload.id) {
      return reply.code(400).send({ error: "Missing `id` for restore." });
    }
    try {
      const result = await restoreSession(sessionsRoot, payload.id);
      return {
        message: `${result.session_id} is present in ${sessionsRoot}. Resume it manually from Codex using the session id.`,
        result
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return {
    fastify,
    sessionsRoot,
    async ready() {
      await fastify.ready();
    },
    async listen() {
      await fastify.listen({
        host: options.host || "127.0.0.1",
        port: Number(options.port || 0)
      });
      const address = fastify.server.address();
      const port =
        address && typeof address === "object" && "port" in address ? Number(address.port) : Number(options.port || 0);
      return {
        port,
        url: `http://${options.host || "127.0.0.1"}:${port}`
      };
    },
    async close() {
      await fastify.close();
    }
  };
}
