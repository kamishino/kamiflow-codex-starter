import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "../..");
export const DOGFOOD_DIR = path.join(ROOT_DIR, "dogfood");
export const FIXTURES = [
  "minimal-js",
  "minimal-ts",
  "realistic-workflow"
];

export function readPackageName() {
  const packageJsonPath = path.join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return pkg.name;
}

export function run(command, args, cwd, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}), exit code ${result.status}`
    );
  }

  return result.status ?? 1;
}

export function fixturePath(name) {
  return path.join(DOGFOOD_DIR, name);
}
