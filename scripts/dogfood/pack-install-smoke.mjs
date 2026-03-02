import fs from "node:fs";
import path from "node:path";
import { FIXTURES, ROOT_DIR, fixturePath, readPackageName, run } from "./utils.mjs";

const packageName = readPackageName();

function readPackageVersion() {
  const packageJsonPath = path.join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return pkg.version;
}

function expectedTarballName(name, version) {
  const normalizedName = name.startsWith("@")
    ? name.slice(1).replace("/", "-")
    : name;
  return `${normalizedName}-${version}.tgz`;
}

function createPackFile() {
  const version = readPackageVersion();
  const tarballName = expectedTarballName(packageName, version);
  const tarballPath = path.join(ROOT_DIR, tarballName);

  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }

  run("npm", ["pack", "--silent"], ROOT_DIR);

  if (!fs.existsSync(tarballPath)) {
    throw new Error(`npm pack succeeded but tarball was not found: ${tarballPath}`);
  }

  return tarballPath;
}

const tarballPath = createPackFile();
console.log(`[dogfood] Packed tarball: ${tarballPath}`);

try {
  for (const fixture of FIXTURES) {
    const cwd = fixturePath(fixture);
    console.log(`[dogfood] Installing tarball into ${fixture}`);
    run("npm", ["install", "--no-save", tarballPath], cwd);
    run("npx", ["--no-install", "kfc", "doctor"], cwd);
    run("npx", ["--no-install", "kfc", "flow", "ensure-plan", "--project", "."], cwd);
    run("npx", ["--no-install", "kfc", "plan", "init", "--project", ".", "--new"], cwd);
    run("npx", ["--no-install", "kfc", "plan", "validate", "--project", "."], cwd);
    run("npx", ["--no-install", "kfc", "run"], cwd);
    run("npm", ["uninstall", "--no-save", packageName], cwd, true);
  }
} finally {
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }
}

console.log("[dogfood] Tarball install smoke tests passed.");
