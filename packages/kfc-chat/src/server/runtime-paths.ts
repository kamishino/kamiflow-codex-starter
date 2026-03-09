import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_DIR = path.resolve(__dirname, "..", "..");
const DIST_SERVER_DIR = path.join(PACKAGE_DIR, "dist", "server");
const SOURCE_SERVER_DIR = path.join(PACKAGE_DIR, "src", "server");

function firstExisting(paths: string[]) {
  for (const entry of paths) {
    if (fs.existsSync(entry)) {
      return entry;
    }
  }
  return paths[0];
}

export function resolvePublicDir() {
  return firstExisting([path.join(DIST_SERVER_DIR, "public"), path.join(SOURCE_SERVER_DIR, "public")]);
}

export function resolveViewsDir() {
  return firstExisting([path.join(DIST_SERVER_DIR, "views"), path.join(SOURCE_SERVER_DIR, "views")]);
}
