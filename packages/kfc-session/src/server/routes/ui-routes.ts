import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/dist/ui-routes.js";
import { buildSessionPageModel } from "../page-config.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { sessionsRoot?: string } = {}) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request: any, reply: any) => {
    return reply.type("text/html; charset=utf-8").send(await renderView("index", buildSessionPageModel({
      sessionsRootLabel: options.sessionsRoot || ""
    })));
  });
}

