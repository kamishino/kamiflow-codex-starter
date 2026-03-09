import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeSemver, bumpVersion } from "./semver-from-commits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const ROOT_LOCKFILE_PATH = path.join(ROOT_DIR, "package-lock.json");
const VERSIONED_PACKAGE_JSON_PATHS = [
  path.join(ROOT_DIR, "package.json"),
  path.join(ROOT_DIR, "packages", "kfc-plan-web", "package.json")
];
const VALID_BUMPS = new Set(["major", "minor", "patch"]);

function usage() {
  console.log(
    [
      "Usage: node dist/scripts/release/cut-release.js --bump <major|minor|patch> [--dry-run]",
      "",
      "Cuts a release commit and semver tag without publishing to npm."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = { bump: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--bump") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --bump.");
      }
      out.bump = value;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }
  if (!VALID_BUMPS.has(out.bump)) {
    throw new Error("Invalid or missing --bump. Use one of: major, minor, patch.");
  }
  return out;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.inherit ? "inherit" : undefined
  });

  if (result.error) {
    if (result.error.code === "EPERM") {
      throw new Error(
        `Cannot spawn ${command} in this restricted environment (EPERM). Run release commands in a normal local terminal.`
      );
    }
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    if (options.inherit) {
      throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
    }
    throw new Error(
      `${command} ${args.join(" ")} failed: ${String(result.stderr || "").trim() || "<empty>"}`
    );
  }

  return String(result.stdout || "").trim();
}

function readPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function writePackageVersions(nextVersion) {
  for (const packageJsonPath of VERSIONED_PACKAGE_JSON_PATHS) {
    const pkg = readPackageJson(packageJsonPath);
    pkg.version = nextVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  }
}

function refreshRootLockfileIfPresent() {
  if (!fs.existsSync(ROOT_LOCKFILE_PATH)) {
    return;
  }
  run("npm", ["install", "--package-lock-only"], { inherit: true });
}

function addReleaseFiles() {
  const relativePaths = VERSIONED_PACKAGE_JSON_PATHS.map((packageJsonPath) =>
    path.relative(ROOT_DIR, packageJsonPath).replace(/\\/g, "/")
  );
  if (fs.existsSync(ROOT_LOCKFILE_PATH)) {
    relativePaths.push(path.relative(ROOT_DIR, ROOT_LOCKFILE_PATH).replace(/\\/g, "/"));
  }
  run("git", ["add", ...relativePaths], { inherit: true });
}

function ensureTagMissing(tagName) {
  const existing = run("git", ["tag", "--list", tagName]);
  if (existing) {
    throw new Error(`Tag already exists: ${tagName}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const summary = analyzeSemver();
  const targetVersion = bumpVersion(summary.currentVersion, args.bump);
  const targetTag = `v${targetVersion}`;

  ensureTagMissing(targetTag);

  console.log(`[release-cut] Current version: ${summary.currentVersion}`);
  console.log(`[release-cut] Suggested bump: ${summary.suggestedBump}`);
  console.log(`[release-cut] Selected bump: ${args.bump}`);
  console.log(`[release-cut] Target version: ${targetVersion}`);

  if (args.dryRun) {
    console.log("[release-cut] Dry-run only. No files changed.");
    process.exit(0);
  }

  writePackageVersions(targetVersion);
  refreshRootLockfileIfPresent();
  addReleaseFiles();
  run("npm", ["run", "commit:codex", "--", "--message", `chore(release): ${targetTag}`], {
    inherit: true
  });
  run("git", ["tag", "-a", targetTag, "-m", targetTag], { inherit: true });

  console.log(`[release-cut] Created release commit and tag: ${targetTag}`);
  console.log("[release-cut] Next steps:");
  console.log("  git push");
  console.log("  git push --tags");
} catch (err) {
  console.error(`[release-cut] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
