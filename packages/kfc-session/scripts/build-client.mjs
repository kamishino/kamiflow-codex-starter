import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, removePathRobust, syncViews } from "../../kfc-web-runtime/src/build-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");

const clientEntry = path.join(packageDir, "src", "client", "main.js");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");
const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientFile = path.join(distPublicDir, "kfc-session.js");
const distStylesFile = path.join(distPublicDir, "kfc-session.css");

await removePathRobust(distPublicDir);
await ensureDir(distPublicDir);
await ensureDir(distViewsDir);

await fs.copyFile(clientEntry, distClientFile);
await fs.copyFile(sourceStyles, distStylesFile);
await syncViews(sourceViewsDir, distViewsDir);

console.log(`[kfc-session] Copied browser script: ${distClientFile}`);
console.log(`[kfc-session] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-session] Synced views: ${distViewsDir}`);
