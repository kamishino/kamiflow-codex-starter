import fs from "node:fs/promises";
import path from "node:path";
import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";

const PUBLIC_DIR = resolvePublicDir();

function resolveAssetPath(assetPath: string): string {
  const normalized = path.posix.normalize(`/${assetPath}`).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, normalized);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    throw new Error("Invalid asset path.");
  }
  return resolved;
}

async function readPublicFile(fileName: string): Promise<Buffer> {
  return await fs.readFile(resolveAssetPath(fileName));
}

function contentType(fileName: string): string {
  if (fileName.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (fileName.endsWith(".js") || fileName.endsWith(".mjs")) {
    return "application/javascript; charset=utf-8";
  }
  if (fileName.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

export function registerUiRoutes(fastify: any, options: { uiMode?: "observer" | "operator" } = {}): void {
  const uiMode = options.uiMode === "operator" ? "operator" : "observer";
  fastify.get("/assets/*", async (request, reply) => {
    const assetPath = String(request.params["*"] || "");
    reply.type(contentType(assetPath));
    return await readPublicFile(assetPath);
  });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return await renderView("index", {
      title: "KamiFlow Plan UI",
      uiMode,
      apiBase: "/api"
    });
  });
}
