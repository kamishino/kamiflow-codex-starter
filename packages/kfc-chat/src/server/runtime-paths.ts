import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackageRuntimePathResolver } from "../../../kfc-web-runtime/dist/runtime-paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_DIR = path.resolve(__dirname, "..", "..");
const resolver = createPackageRuntimePathResolver(PACKAGE_DIR);

export function resolvePublicDir() {
  return resolver.resolvePublicDir();
}

export function resolveViewsDir() {
  return resolver.resolveViewsDir();
}

