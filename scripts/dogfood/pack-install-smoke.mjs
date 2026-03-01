import fs from "node:fs";
import path from "node:path";
import { FIXTURES, ROOT_DIR, fixturePath, readPackageName, run } from "./utils.mjs";
import { spawnSync } from "node:child_process";

const packageName = readPackageName();

function createPackFile() {
  const result = spawnSync("npm", ["pack", "--silent"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "npm pack failed.");
  }

  const filename = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!filename) {
    throw new Error("Unable to detect packed tarball name.");
  }
  return path.join(ROOT_DIR, filename);
}

const tarballPath = createPackFile();
console.log(`[dogfood] Packed tarball: ${tarballPath}`);

try {
  for (const fixture of FIXTURES) {
    const cwd = fixturePath(fixture);
    console.log(`[dogfood] Installing tarball into ${fixture}`);
    run("npm", ["install", "--no-save", tarballPath], cwd);
    run("npx", ["--no-install", "kfc", "doctor"], cwd);
    run("npx", ["--no-install", "kfc", "run"], cwd);
    run("npm", ["uninstall", "--no-save", packageName], cwd, true);
  }
} finally {
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }
}

console.log("[dogfood] Tarball install smoke tests passed.");
