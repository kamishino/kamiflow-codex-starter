import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const TS_FIRST_RULES = [
  {
    area: "src",
    root: "src",
    allow: new Set()
  },
  {
    area: "packages/kfc-plan-web/src",
    root: "packages/kfc-plan-web/src",
    allow: new Set()
  },
  {
    area: "packages/kfc-chat/src",
    root: "packages/kfc-chat/src",
    allow: new Set()
  },
  {
    area: "packages/kfc-web-ui/src",
    root: "packages/kfc-web-ui/src",
    allow: new Set()
  },
  {
    area: "packages/kfc-session/src",
    root: "packages/kfc-session/src",
    allow: new Set()
  }
];

function listFilesRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

try {
  const errors = [];

  for (const rule of TS_FIRST_RULES) {
    const absoluteRoot = path.join(ROOT_DIR, rule.root);
    if (!fs.existsSync(absoluteRoot)) {
      continue;
    }

    const jsFiles = listFilesRecursive(absoluteRoot)
      .filter((filePath) => filePath.endsWith(".js"))
      .map((filePath) => path.relative(absoluteRoot, filePath).replace(/\\/g, "/"));

    for (const relPath of jsFiles) {
      if (!rule.allow.has(relPath)) {
        errors.push(`[typescript-first] ${rule.area}: unexpected .js source -> ${relPath}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log("[typescript-first] OK");
} catch (err) {
  console.error(`[typescript-first] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
