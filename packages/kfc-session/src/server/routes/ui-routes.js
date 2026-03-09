import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildFontLinks,
  normalizeScriptHrefs,
  normalizeStyleHrefs
} from "../../../../kfc-web-runtime/src/browser-entry.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify, options = {}) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(
      await renderView("index", {
        title: "KFC Session",
        apiBase: "/api/sessions",
        sessionsRootLabel: options.sessionsRoot || "",
        fontLinks: buildFontLinks(true),
        scriptHrefsNormalized: normalizeScriptHrefs(undefined, "/assets/kfc-session.js"),
        styleHrefsNormalized: normalizeStyleHrefs(undefined, "/assets/kfc-session.css")
      })
    );
  });
}
