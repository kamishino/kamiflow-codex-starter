import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeRequiredHookLaunchers } from "./hook-launchers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const HOOKS_PATH_VALUE = ".githooks";
const REQUIRED_HOOK_FILES = writeRequiredHookLaunchers(ROOT_DIR);
const gitConfigPath = resolveGitConfigPath(ROOT_DIR);

const existingConfig = fs.readFileSync(gitConfigPath, "utf8");
const updatedConfig = setHooksPath(existingConfig, HOOKS_PATH_VALUE);

if (updatedConfig !== existingConfig) {
  fs.writeFileSync(gitConfigPath, updatedConfig, "utf8");
}

for (const hookFile of REQUIRED_HOOK_FILES) {
  ensureExecutableBit(hookFile);
}

console.log("[hooks] Enabled local hooksPath: .githooks");
console.log("[hooks] Required hooks: commit-msg, post-merge");
console.log("[hooks] commit-msg format: type(scope): summary");

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

function setHooksPath(configText, hooksPathValue) {
  const eol = configText.includes("\r\n") ? "\r\n" : "\n";
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
    const base = configText.replace(/\s*$/, "");
    return `${base}${base ? eol + eol : ""}[core]${eol}\thooksPath = ${hooksPathValue}${eol}`;
  }

  for (let i = coreStart + 1; i < lines.length; i += 1) {
    if (sectionHeaderPattern.test(lines[i])) {
      coreEnd = i;
      break;
    }
  }

  for (let i = coreStart + 1; i < coreEnd; i += 1) {
    if (/^\s*hookspath\s*=/.test(lines[i].toLowerCase())) {
      lines[i] = `\thooksPath = ${hooksPathValue}`;
      return `${lines.join(eol).replace(/\s*$/, "")}${eol}`;
    }
  }

  lines.splice(coreEnd, 0, `\thooksPath = ${hooksPathValue}`);
  return `${lines.join(eol).replace(/\s*$/, "")}${eol}`;
}

function ensureExecutableBit(filePath) {
  if (process.platform === "win32") {
    return;
  }
  fs.chmodSync(filePath, 0o755);
}
