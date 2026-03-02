import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXPECTED_HOOKS_PATH = ".githooks";
const gitConfigPath = resolveGitConfigPath(ROOT_DIR);

const configText = fs.readFileSync(gitConfigPath, "utf8");
const hooksPathValue = readHooksPath(configText);

if (!hooksPathValue) {
  fail(
    `core.hooksPath is not set in ${gitConfigPath}. Run "npm run hooks:enable" to configure local hooks.`
  );
}

if (normalizePathValue(hooksPathValue) !== normalizePathValue(EXPECTED_HOOKS_PATH)) {
  fail(
    `core.hooksPath is "${hooksPathValue}" (expected "${EXPECTED_HOOKS_PATH}"). Run "npm run hooks:enable".`
  );
}

console.log(`[hooks] OK: core.hooksPath=${hooksPathValue}`);

function resolveGitConfigPath(rootDir) {
  const gitEntryPath = path.join(rootDir, ".git");

  if (!fs.existsSync(gitEntryPath)) {
    throw new Error(`Missing .git entry in ${rootDir}`);
  }

  const stat = fs.statSync(gitEntryPath);
  if (stat.isDirectory()) {
    return path.join(gitEntryPath, "config");
  }

  const raw = fs.readFileSync(gitEntryPath, "utf8").trim();
  const prefix = "gitdir:";
  if (!raw.toLowerCase().startsWith(prefix)) {
    throw new Error(`Unsupported .git file format at ${gitEntryPath}`);
  }

  const gitDirValue = raw.slice(prefix.length).trim();
  const gitDir = path.resolve(rootDir, gitDirValue);
  return path.join(gitDir, "config");
}

function readHooksPath(configText) {
  const lines = configText.split(/\r?\n/);
  const sectionHeaderPattern = /^\s*\[[^\]]+\]\s*$/;
  let coreStart = -1;
  let coreEnd = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\[core\]\s*$/i.test(lines[i])) {
      coreStart = i;
      break;
    }
  }

  if (coreStart === -1) {
    return "";
  }

  for (let i = coreStart + 1; i < lines.length; i += 1) {
    if (sectionHeaderPattern.test(lines[i])) {
      coreEnd = i;
      break;
    }
  }

  for (let i = coreStart + 1; i < coreEnd; i += 1) {
    const match = lines[i].match(/^\s*hookspath\s*=\s*(.+?)\s*$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function normalizePathValue(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").trim();
}

function fail(message) {
  console.error(`[hooks] ${message}`);
  process.exit(1);
}
