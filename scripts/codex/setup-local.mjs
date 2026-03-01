import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CODEX_DIR = path.join(ROOT_DIR, ".codex");
const EXAMPLE_CONFIG = path.join(CODEX_DIR, "config.example.toml");
const LOCAL_CONFIG = path.join(CODEX_DIR, "config.toml");

const force = process.argv.includes("--force");

if (!fs.existsSync(CODEX_DIR)) {
  fs.mkdirSync(CODEX_DIR, { recursive: true });
}

if (!fs.existsSync(EXAMPLE_CONFIG)) {
  throw new Error(`Missing template config: ${EXAMPLE_CONFIG}`);
}

if (fs.existsSync(LOCAL_CONFIG) && !force) {
  console.log(`[codex] Local config already exists: ${LOCAL_CONFIG}`);
  console.log("[codex] Use --force to overwrite.");
  process.exit(0);
}

try {
  fs.copyFileSync(EXAMPLE_CONFIG, LOCAL_CONFIG);
} catch (err) {
  if (err && typeof err === "object" && err.code === "EPERM") {
    throw new Error(
      `Permission denied writing ${LOCAL_CONFIG}. Run this command in an elevated terminal.`
    );
  }
  throw err;
}
console.log(`[codex] Wrote local config: ${LOCAL_CONFIG}`);
