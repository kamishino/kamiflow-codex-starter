import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCommitMessageSemver } from "./semver-from-commits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");

function usage() {
  console.log(
    [
      "Usage: node dist/scripts/release/semver-impact-from-message.js --message \"type(scope): summary\" [--json]",
      "",
      "Outputs semantic version impact for a single conventional commit message.",
      "  breaking change => major",
      "  feat           => minor",
      "  fix/perf       => patch",
      "  docs/test/chore/etc. => none"
    ].join("\n")
  );
}

function parseArgs(argv: string[]) {
  let message = "";
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--message") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --message.");
      }
      message = String(value);
      i += 1;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }
  if (!message.trim()) {
    throw new Error("Missing required --message value.");
  }
  return { message, json };
}

function readCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(`package.json version must be x.y.z. Received: ${pkg.version}`);
  }
  return pkg.version;
}

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === __filename;
}

if (isDirectRun()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = analyzeCommitMessageSemver(args.message, readCurrentVersion());
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`[semver] Current version: ${summary.currentVersion}`);
      console.log(`[semver] Commit impact: ${summary.bump}`);
      console.log(`[semver] Suggested next release: ${summary.suggestedNextVersion}`);
      console.log(`[semver] Reason: ${summary.type}${summary.breaking ? "!" : ""}`);
    }
  } catch (err) {
    console.error(`[semver] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
