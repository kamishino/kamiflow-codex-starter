import fs from "node:fs/promises";
import path from "node:path";
import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";

const PUBLIC_DIR = resolvePublicDir();

function resolveAssetPath(assetPath: string) {
  const normalized = path.posix.normalize(`/${assetPath}`).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, normalized);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    throw new Error("Invalid asset path.");
  }
  return resolved;
}

async function readPublicFile(fileName: string) {
  return await fs.readFile(resolveAssetPath(fileName));
}

function contentType(fileName: string) {
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

export function registerUiRoutes(fastify: any, options: { projectName: string; projectDir: string }) {
  fastify.get("/assets/*", async (request: any, reply: any) => {
    const assetPath = String(request.params["*"] || "");
    reply.type(contentType(assetPath));
    return await readPublicFile(assetPath);
  });

  fastify.get("/", async (_request: any, reply: any) => {
    reply.type("text/html; charset=utf-8");
    return await renderView("index", {
      title: "KFC Chat",
      projectName: options.projectName,
      projectDir: options.projectDir,
      apiBase: "/api/chat",
      wsPath: "/ws"
    });
  });
}
