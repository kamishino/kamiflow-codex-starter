import fs from "node:fs";
import path from "node:path";

export const REQUIRED_HOOKS = [
  { name: "commit-msg", modulePath: "dist/scripts/git-hooks/commit-msg.js" },
  { name: "post-merge", modulePath: "dist/scripts/git-hooks/post-merge-auto.js" }
];

export function getHookNodeShebang() {
  if (process.platform === "win32") {
    return `#!${process.execPath.replace(/\\/g, "/")}`;
  }
  return "#!/usr/bin/env node";
}

export function renderHookLauncher(modulePath) {
  const normalizedModulePath = modulePath.replace(/\\/g, "/");
  return `${getHookNodeShebang()}
await import(new URL("../${normalizedModulePath}", import.meta.url));
`;
}

export function writeHookLauncher(rootDir, hookName, modulePath) {
  const hooksDir = path.join(rootDir, ".githooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, hookName);
  fs.writeFileSync(hookPath, renderHookLauncher(modulePath), "utf8");
  ensureExecutableBit(hookPath);
  return hookPath;
}

export function writeRequiredHookLaunchers(rootDir) {
  return REQUIRED_HOOKS.map((hook) => writeHookLauncher(rootDir, hook.name, hook.modulePath));
}

function ensureExecutableBit(filePath) {
  if (process.platform === "win32") {
    return;
  }
  fs.chmodSync(filePath, 0o755);
}
