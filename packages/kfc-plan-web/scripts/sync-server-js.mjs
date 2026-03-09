import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");

async function syncFile(relativePath) {
  const sourcePath = path.join(PACKAGE_ROOT, "src", "server", relativePath);
  const targetPath = path.join(PACKAGE_ROOT, "dist", "server", relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

await syncFile("page-config.js");
