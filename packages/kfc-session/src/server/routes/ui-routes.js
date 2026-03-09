import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify, options = {}) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

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
