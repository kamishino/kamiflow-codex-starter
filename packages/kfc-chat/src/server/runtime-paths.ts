import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_SERVER_DIR = __dirname;

export function resolvePublicDir() {
  return path.join(DIST_SERVER_DIR, "public");
}

export function resolveViewsDir() {
  return path.join(DIST_SERVER_DIR, "views");
}
