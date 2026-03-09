import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/dist/ui-routes.js";
import { buildChatPageModel } from "../page-config.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { projectName: string; projectDir: string }) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request: any, reply: any) => {
    reply.type("text/html; charset=utf-8");
    return await renderView("index", buildChatPageModel(options));
  });
}

