import * as esbuild from "esbuild-wasm";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");

const clientEntry = path.join(packageDir, "src", "client", "main.tsx");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");

const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientFile = path.join(distPublicDir, "kfc-chat.js");
const distStylesFile = path.join(distPublicDir, "kfc-chat.css");

await fs.mkdir(distPublicDir, { recursive: true });
await fs.mkdir(distViewsDir, { recursive: true });

await esbuild.build({
  entryPoints: [clientEntry],
  outfile: distClientFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  sourcemap: false,
  minify: false,
  jsx: "automatic",
  jsxImportSource: "preact",
  logLevel: "info"
});

await fs.copyFile(sourceStyles, distStylesFile);
await fs.cp(sourceViewsDir, distViewsDir, { recursive: true });

esbuild.stop();

console.log(`[kfc-chat] Built client bundle: ${distClientFile}`);
console.log(`[kfc-chat] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-chat] Synced views: ${distViewsDir}`);
