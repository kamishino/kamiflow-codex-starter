import fs from "node:fs/promises";
import path from "node:path";
import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";

const PUBLIC_DIR = resolvePublicDir();

async function readPublicFile(fileName) {
  return await fs.readFile(path.join(PUBLIC_DIR, fileName), "utf8");
}

export function registerUiRoutes(fastify, options = {}) {
  fastify.get("/assets/kfc-session.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(await readPublicFile("kfc-session.js"));
  });

  fastify.get("/assets/kfc-session.css", async (_request, reply) => {
    return reply.type("text/css; charset=utf-8").send(await readPublicFile("kfc-session.css"));
  });

  fastify.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(
      await renderView("index", {
        title: "KFC Session",
        apiBase: "/api/sessions",
        sessionsRootLabel: options.sessionsRoot || "",
        scriptHrefs: ["/assets/kfc-session.js"],
        styleHrefs: ["/assets/kfc-session.css"]
      })
    );
  });
}
