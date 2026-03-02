import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");

function usage() {
  console.log(
    [
      "Usage: node scripts/release/pack-commit.mjs",
      "",
      "Creates npm pack artifact named with commit trace suffix:",
      "  <normalized-name>-<version>-dev.<shortsha>.tgz"
    ].join("\n")
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  if (result.error) {
    if (result.error.code === "EPERM") {
      throw new Error(
        `Cannot spawn ${command} in this restricted environment (EPERM). Run pack:commit in a normal local terminal.`
      );
    }
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${String(result.stderr || "").trim() || "<empty>"}`
    );
  }
  return String(result.stdout || "").trim();
}

function readPackageInfo() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  if (!pkg.name || !pkg.version) {
    throw new Error("package.json must include name and version.");
  }
  return { name: pkg.name, version: pkg.version };
}

function normalizePackageName(name) {
  return name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
}

function resolvePackedFile(outputText, packageName, version) {
  const lines = outputText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].toLowerCase().endsWith(".tgz")) {
    return lines[lines.length - 1];
  }
  return `${normalizePackageName(packageName)}-${version}.tgz`;
}

try {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  const info = readPackageInfo();
  const sha = run("git", ["rev-parse", "--short", "HEAD"]);
  const packOutput = run("npm", ["pack", "--silent"]);
  const packedFile = resolvePackedFile(packOutput, info.name, info.version);
  const sourcePath = path.join(ROOT_DIR, packedFile);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Packed tarball not found: ${sourcePath}`);
  }

  const targetFileName = `${normalizePackageName(info.name)}-${info.version}-dev.${sha}.tgz`;
  const targetPath = path.join(ROOT_DIR, targetFileName);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  fs.renameSync(sourcePath, targetPath);

  console.log(`[pack-commit] Created: ${targetPath}`);
} catch (err) {
  console.error(`[pack-commit] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
