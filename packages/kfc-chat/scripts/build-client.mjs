import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyVendorFile,
  ensureDir,
  removePathRobust,
  syncViews,
  transpileTree
} from "../../kfc-web-runtime/src/build-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const webUiDir = path.join(repoRoot, "packages", "kfc-web-ui");

const clientSourceDir = path.join(packageDir, "src", "client");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");

const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientDir = path.join(distPublicDir, "client");
const distVendorDir = path.join(distPublicDir, "vendor");
const distWebUiDir = path.join(distVendorDir, "kfc-web-ui");
const distStylesFile = path.join(distPublicDir, "kfc-chat.css");
const distEntryFile = path.join(distPublicDir, "kfc-chat.js");

await removePathRobust(distPublicDir);
await ensureDir(distPublicDir);
await ensureDir(distViewsDir);

await transpileTree(clientSourceDir, distClientDir);
await transpileTree(path.join(webUiDir, "src"), distWebUiDir);

await copyVendorFile(repoRoot, distVendorDir, "preact/dist/preact.mjs", "preact.mjs");
await copyVendorFile(repoRoot, distVendorDir, "preact/jsx-runtime/dist/jsxRuntime.mjs", "preact-jsx-runtime.mjs");
await copyVendorFile(repoRoot, distVendorDir, "@preact/signals/dist/signals.mjs", "preact-signals.mjs");
await copyVendorFile(repoRoot, distVendorDir, "@preact/signals-core/dist/signals-core.mjs", "preact-signals-core.mjs");

await fs.writeFile(distEntryFile, 'import "./client/main.js";\n', "utf8");
await fs.copyFile(sourceStyles, distStylesFile);
await syncViews(sourceViewsDir, distViewsDir);

console.log(`[kfc-chat] Built browser modules: ${distClientDir}`);
console.log(`[kfc-chat] Wrote entry module: ${distEntryFile}`);
console.log(`[kfc-chat] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-chat] Synced views: ${distViewsDir}`);
