import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const MAPPINGS = [
  {
    from: path.join(ROOT_DIR, "resources", "prompts"),
    to: path.join(ROOT_DIR, ".codex", "prompts")
  },
  {
    from: path.join(ROOT_DIR, "resources", "skills"),
    to: path.join(ROOT_DIR, ".codex", "skills")
  }
];

const force = process.argv.includes("--force");
let copied = 0;
let skipped = 0;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function shouldSkipFile(name) {
  return name === ".gitkeep" || name === "README.md";
}

function copyRecursive(fromDir, toDir) {
  ensureDir(toDir);
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipFile(entry.name)) {
      continue;
    }

    const fromPath = path.join(fromDir, entry.name);
    const toPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(fromPath, toPath);
      continue;
    }

    if (fs.existsSync(toPath) && !force) {
      skipped += 1;
      continue;
    }

    ensureDir(path.dirname(toPath));
    try {
      fs.copyFileSync(fromPath, toPath);
    } catch (err) {
      if (err && typeof err === "object" && err.code === "EPERM") {
        throw new Error(
          `Permission denied writing ${toPath}. Run this command in an elevated terminal.`
        );
      }
      throw err;
    }
    copied += 1;
  }
}

for (const mapping of MAPPINGS) {
  if (!fs.existsSync(mapping.from)) {
    console.log(`[codex-sync] Skip missing source: ${mapping.from}`);
    continue;
  }
  copyRecursive(mapping.from, mapping.to);
}

console.log(`[codex-sync] Copied files: ${copied}`);
console.log(`[codex-sync] Skipped files: ${skipped}`);
