import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFileExists,
  copyVendorFile,
  copyVendorTree,
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
const libSourceDir = path.join(packageDir, "src", "lib");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");

const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientDir = path.join(distPublicDir, "client");
const distLibDir = path.join(distPublicDir, "lib");
const distVendorDir = path.join(distPublicDir, "vendor");
const distWebUiDir = path.join(distVendorDir, "kfc-web-ui");
const distLucideDir = path.join(distVendorDir, "lucide-preact");
const distClientFile = path.join(distPublicDir, "app.js");
const distStylesFile = path.join(distPublicDir, "styles.css");

await ensureDir(distPublicDir);
await ensureDir(distViewsDir);
await ensureDir(distVendorDir);

await removePathRobust(distClientDir);
await removePathRobust(distLibDir);
await removePathRobust(distWebUiDir);
await removePathRobust(distLucideDir);

await transpileTree(clientSourceDir, distClientDir);
await transpileTree(libSourceDir, distLibDir);
await transpileTree(path.join(webUiDir, "src"), distWebUiDir);

await copyVendorFile(repoRoot, distVendorDir, "preact/dist/preact.mjs", "preact.mjs");
await copyVendorFile(repoRoot, distVendorDir, "preact/hooks/dist/hooks.mjs", "preact-hooks.mjs");
await copyVendorFile(repoRoot, distVendorDir, "preact/jsx-runtime/dist/jsxRuntime.mjs", "preact-jsx-runtime.mjs");
await copyVendorFile(repoRoot, distVendorDir, "@preact/signals/dist/signals.mjs", "preact-signals.mjs");
await copyVendorFile(repoRoot, distVendorDir, "@preact/signals-core/dist/signals-core.mjs", "preact-signals-core.mjs");
await copyVendorTree(repoRoot, distVendorDir, "lucide-preact/dist/esm", "lucide-preact");

await fs.writeFile(distClientFile, 'import "./client/main.js";\n', "utf8");
await fs.copyFile(sourceStyles, distStylesFile);
await syncViews(sourceViewsDir, distViewsDir);

await assertFileExists(path.join(distClientDir, "main.js"), "build output");
await assertFileExists(path.join(distLibDir, "plan-diagram.js"), "build output");
await assertFileExists(path.join(distWebUiDir, "index.js"), "build output");
await assertFileExists(path.join(distLucideDir, "lucide-preact.js"), "build output");

console.log(`[kfc-plan] Built browser modules: ${distClientDir}`);
console.log(`[kfc-plan] Built shared browser lib modules: ${distLibDir}`);
console.log(`[kfc-plan] Wrote entry module: ${distClientFile}`);
console.log(`[kfc-plan] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-plan] Synced views: ${distViewsDir}`);
