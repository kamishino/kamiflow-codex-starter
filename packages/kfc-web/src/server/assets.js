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

export function devAssetSet(vitePort, entryName) {
  return {
    scripts: [`http://127.0.0.1:${vitePort}/@vite/client`, `http://127.0.0.1:${vitePort}/src/entries/${entryName}.ts`],
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
