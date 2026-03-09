import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { uiMode?: "observer" | "operator" } = {}): void {
  const uiMode = options.uiMode === "operator" ? "operator" : "observer";
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return await renderView("index", {
      title: "KamiFlow Plan UI",
      uiMode,
      apiBase: "/api"
    });
  });
}
