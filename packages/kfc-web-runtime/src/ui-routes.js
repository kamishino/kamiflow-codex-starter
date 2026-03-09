import fs from "node:fs/promises";
import path from "node:path";

function resolveAssetPath(publicDir, assetPath) {
  const normalized = path.posix.normalize(`/${assetPath}`).replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, normalized);
  if (!resolved.startsWith(publicDir)) {
    throw new Error("Invalid asset path.");
  }
  return resolved;
}

function contentType(fileName) {
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

export function registerPublicAssetRoutes(fastify, options) {
  const publicDir = options.publicDir;
  const routePattern = options.routePattern || "/assets/*";

  fastify.get(routePattern, async (request, reply) => {
    const assetPath = String(request.params["*"] || "");
    reply.type(contentType(assetPath));
    return await fs.readFile(resolveAssetPath(publicDir, assetPath));
  });
}
