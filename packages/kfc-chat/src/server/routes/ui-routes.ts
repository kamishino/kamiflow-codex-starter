import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildBrowserPageModel
} from "../../../../kfc-web-runtime/src/browser-entry.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { projectName: string; projectDir: string }) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request: any, reply: any) => {
    reply.type("text/html; charset=utf-8");
    return await renderView(
      "index",
      buildBrowserPageModel({
        title: "KFC Chat",
        apiBase: "/api/chat",
        fallbackStyleHref: "/assets/kfc-chat.css",
        fallbackScriptHref: "/assets/kfc-chat.js",
        importMapOptions: {
          preact: true,
          jsxRuntime: true,
          signals: true,
          webUi: true
        },
        extra: {
          projectName: options.projectName,
          projectDir: options.projectDir,
          wsPath: "/ws"
        }
      })
    );
  });
}
