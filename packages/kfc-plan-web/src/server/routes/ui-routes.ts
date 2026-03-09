import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/dist/ui-routes.js";
import { buildPlanPageModel } from "../page-config.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { uiMode?: "observer" | "operator" } = {}): void {
  const uiMode = options.uiMode === "operator" ? "operator" : "observer";
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return await renderView("index", buildPlanPageModel({ uiMode }));
  });
}

