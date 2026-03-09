import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildFontLinks,
  buildImportMap,
  normalizeScriptHrefs,
  normalizeStyleHrefs,
  stringifyImportMap
} from "../../../../kfc-web-runtime/src/browser-entry.js";

const PUBLIC_DIR = resolvePublicDir();

export function registerUiRoutes(fastify: any, options: { projectName: string; projectDir: string }) {
  registerPublicAssetRoutes(fastify, { publicDir: PUBLIC_DIR });

  fastify.get("/", async (_request: any, reply: any) => {
    reply.type("text/html; charset=utf-8");
    return await renderView("index", {
      title: "KFC Chat",
      projectName: options.projectName,
      projectDir: options.projectDir,
      apiBase: "/api/chat",
      wsPath: "/ws",
      fontLinks: buildFontLinks(true),
      styleHrefsNormalized: normalizeStyleHrefs(undefined, "/assets/kfc-chat.css"),
      scriptHrefsNormalized: normalizeScriptHrefs(undefined, "/assets/kfc-chat.js"),
      importMapJson: stringifyImportMap(
        buildImportMap({
          preact: true,
          jsxRuntime: true,
          signals: true,
          webUi: true
        })
      )
    });
  });
}
