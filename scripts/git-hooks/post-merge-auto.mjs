import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const SKIP_FLAG = "KFC_POST_MERGE_SKIP";
const MANIFEST_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^packages\/[^/]+\/package\.json$/,
];
const RESOURCE_PATTERNS = [/^resources\/skills\//, /^resources\/rules\//];

main();

function main() {
  if (process.env[SKIP_FLAG] === "1") {
    info(`${SKIP_FLAG}=1; skipping post-merge automation.`);
    return;
  }

  const diffResult = resolveChangedFiles();
  if (!diffResult.available) {
    info("No merge diff range available; skipping post-merge actions.");
    return;
  }

  const changedFiles = diffResult.files;
  if (changedFiles.length === 0) {
    info("No changed files detected from merge range; skipping actions.");
    return;
  }

  const shouldInstall = changedFiles.some((file) => MANIFEST_PATTERNS.some((pattern) => pattern.test(file)));
  const shouldSync = changedFiles.some((file) => RESOURCE_PATTERNS.some((pattern) => pattern.test(file)));

  if (!shouldInstall && !shouldSync) {
    info("No manifest or resources/skills|rules updates detected; no post-merge actions needed.");
    return;
  }

  if (shouldInstall) {
    runWarnOnly(npmBin(), ["install"], "npm install");
  } else {
    info("Manifest changes not detected; skipping npm install.");
  }

  if (shouldSync) {
    runWarnOnly(npmBin(), ["run", "codex:sync", "--", "--scope", "repo", "--force"], "npm run codex:sync");
  } else {
    info("resources/skills|rules changes not detected; skipping codex:sync.");
  }
}

function resolveChangedFiles() {
  const ranges = buildCandidateRanges();
  if (ranges.length === 0) {
    return { available: false, files: [] };
  }

  for (const range of ranges) {
    const result = runGit(["diff", "--name-only", range]);
    if (result.ok) {
      const files = parseLines(result.stdout);
      info(`Detected ${files.length} changed file(s) from range ${range}.`);
      return { available: true, files };
    }
    warn(`Unable to read changed files from ${range}: ${result.stderr || "unknown error"}`);
  }

  warn("Unable to resolve post-merge diff range. Skipping post-merge actions.");
  return { available: false, files: [] };
}

function buildCandidateRanges() {
  const envRange = process.env.KFC_POST_MERGE_RANGE?.trim();
  const ranges = [];

  if (envRange) {
    ranges.push(envRange);
  }
  if (gitRefExists("ORIG_HEAD")) {
    ranges.push("ORIG_HEAD..HEAD");
  }
  if (gitRefExists("HEAD@{1}")) {
    ranges.push("HEAD@{1}..HEAD");
  }
  return [...new Set(ranges)];
}

function gitRefExists(ref) {
  const result = runGit(["rev-parse", "--verify", ref]);
  return result.ok;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message };
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function runWarnOnly(command, args, label) {
  info(`Running ${label}...`);
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    warn(`${label} failed to start: ${result.error.message}`);
    return;
  }

  if (result.stdout?.trim()) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr?.trim()) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    warn(`${label} exited with code ${result.status}. Continuing without blocking merge.`);
    return;
  }

  info(`${label} completed.`);
}

function parseLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function info(message) {
  console.log(`[post-merge] ${message}`);
}

function warn(message) {
  console.warn(`[post-merge] WARN: ${message}`);
}
