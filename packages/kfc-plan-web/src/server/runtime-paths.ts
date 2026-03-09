import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackageRuntimePathResolver } from "../../../kfc-web-runtime/src/runtime-paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_DIR = path.resolve(__dirname, "..", "..");
const resolver = createPackageRuntimePathResolver(PACKAGE_DIR);

export function resolveViewsDir(): string {
  return resolver.resolveViewsDir();
}

export function resolvePublicDir(): string {
  return resolver.resolvePublicDir();
}

