import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildBrowserPageModel
} from "../../../../kfc-web-runtime/src/browser-entry.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify, options = {}) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(
      await renderView(
        "index",
        buildBrowserPageModel({
          title: "KFC Session",
          apiBase: "/api/sessions",
          fallbackStyleHref: "/assets/kfc-session.css",
          fallbackScriptHref: "/assets/kfc-session.js",
          extra: {
            sessionsRootLabel: options.sessionsRoot || ""
          }
        })
      )
    );
  });
}
