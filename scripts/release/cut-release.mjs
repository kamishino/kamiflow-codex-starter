import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeSemver, bumpVersion } from "./semver-from-commits.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const VALID_BUMPS = new Set(["major", "minor", "patch"]);

function usage() {
  console.log(
    [
      "Usage: node scripts/release/cut-release.mjs --bump <major|minor|patch> [--dry-run]",
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

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function writePackageVersion(nextVersion) {
  const pkg = readPackageJson();
  pkg.version = nextVersion;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");
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

  writePackageVersion(targetVersion);
  run("git", ["add", "package.json"], { inherit: true });
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
