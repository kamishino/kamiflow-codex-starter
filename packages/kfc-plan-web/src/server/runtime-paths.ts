import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    path.join(__dirname, "views"),
    path.join(__dirname, "../../src/server/views"),
    path.join(process.cwd(), "packages/kfc-plan-web/src/server/views"),
    path.join(process.cwd(), "src/server/views")
  ]);
}

export function resolvePublicDir(): string {
  return firstExisting([
    path.join(__dirname, "public"),
    path.join(__dirname, "../../src/server/public"),
    path.join(process.cwd(), "packages/kfc-plan-web/src/server/public"),
    path.join(process.cwd(), "src/server/public")
  ]);
}

