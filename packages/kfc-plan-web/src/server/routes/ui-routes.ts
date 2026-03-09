import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";
import { registerPublicAssetRoutes } from "../../../../kfc-web-runtime/src/ui-routes.js";
import {
  buildFontLinks,
  buildImportMap,
  normalizeScriptHrefs,
  normalizeStyleHrefs,
  stringifyImportMap
} from "../../../../kfc-web-runtime/src/browser-entry.js";

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
      ,
      fontLinks: buildFontLinks(true),
      styleHrefsNormalized: normalizeStyleHrefs(undefined, "/assets/styles.css"),
      scriptHrefsNormalized: normalizeScriptHrefs(undefined, "/assets/app.js"),
      importMapJson: stringifyImportMap(
        buildImportMap({
          preact: true,
          preactHooks: true,
          jsxRuntime: true,
          signals: true,
          webUi: true,
          lucide: true
        })
      )
    });
  });
}
