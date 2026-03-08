import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_DIR = path.resolve(__dirname, "..", "..");
const DIST_SERVER_DIR = path.join(PACKAGE_DIR, "dist", "server");
const SOURCE_SERVER_DIR = __dirname;

function resolveServerDir() {
  return fs.existsSync(DIST_SERVER_DIR) ? DIST_SERVER_DIR : SOURCE_SERVER_DIR;
}

export function resolvePublicDir() {
  return path.join(resolveServerDir(), "public");
}

export function resolveViewsDir() {
  return path.join(resolveServerDir(), "views");
}
