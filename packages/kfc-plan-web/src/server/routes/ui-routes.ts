import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildBrowserPageModel
} from "../../../../kfc-web-runtime/src/browser-entry.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { uiMode?: "observer" | "operator" } = {}): void {
  const uiMode = options.uiMode === "operator" ? "operator" : "observer";
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return await renderView(
      "index",
      buildBrowserPageModel({
        title: "KamiFlow Plan UI",
        apiBase: "/api",
        fallbackStyleHref: "/assets/styles.css",
        fallbackScriptHref: "/assets/app.js",
        importMapOptions: {
          preact: true,
          preactHooks: true,
          jsxRuntime: true,
          signals: true,
          webUi: true,
          lucide: true
        },
        extra: { uiMode }
      })
    );
  });
}
