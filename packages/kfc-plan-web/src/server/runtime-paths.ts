import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_SERVER_DIR = __dirname;
const SOURCE_SERVER_DIR = path.resolve(__dirname, "../../src/server");

function firstExisting(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return paths[0];
}

export function resolveViewsDir(): string {
  return firstExisting([
    path.join(DIST_SERVER_DIR, "views"),
    path.join(SOURCE_SERVER_DIR, "views")
  ]);
}

export function resolvePublicDir(): string {
  return firstExisting([
    path.join(DIST_SERVER_DIR, "public"),
    path.join(SOURCE_SERVER_DIR, "public")
  ]);
}

