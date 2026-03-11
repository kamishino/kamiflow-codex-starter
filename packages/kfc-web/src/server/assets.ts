import fs from "node:fs/promises";
import path from "node:path";

export async function loadManifest(packageDir) {
  const manifestPath = path.join(packageDir, "dist", "client", ".vite", "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

export function assetSetFromManifest(manifest, entryName) {
  const key = `src/entries/${entryName}.ts`;
  const entry = manifest[key];
  if (!entry) {
    throw new Error(`Missing Vite manifest entry: ${key}`);
  }
  return {
    scripts: [`/assets/${entry.file}`],
    styles: (entry.css || []).map((item) => `/assets/${item}`)
  };
}

function requestProtocol(request) {
  const forwarded = String(request?.headers?.["x-forwarded-proto"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "http";
  }
  return String(request?.protocol || "http").trim() || "http";
}

function requestHostname(request) {
  const forwarded = String(request?.headers?.["x-forwarded-host"] || "").trim();
  const hostHeader = forwarded || String(request?.headers?.host || "").trim();
  const fallback = String(request?.hostname || "127.0.0.1").trim() || "127.0.0.1";
  const hostValue = hostHeader || fallback;
  return hostValue.replace(/:\d+$/, "");
}

export function devAssetSet(vitePort, entryName, request) {
  const origin = `${requestProtocol(request)}://${requestHostname(request)}:${vitePort}`;
  return {
    scripts: [`${origin}/@vite/client`, `${origin}/src/entries/${entryName}.ts`],
    styles: []
  };
}

export async function sendBuiltAsset(reply, packageDir, relPath) {
  const assetPath = path.join(packageDir, "dist", "client", relPath);
  const body = await fs.readFile(assetPath);
  if (relPath.endsWith(".js")) {
    reply.type("application/javascript; charset=utf-8");
  } else if (relPath.endsWith(".css")) {
    reply.type("text/css; charset=utf-8");
  } else {
    reply.type("application/octet-stream");
  }
  return reply.send(body);
}
