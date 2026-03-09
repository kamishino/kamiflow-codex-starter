import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const CONVENTIONAL_SUBJECT_RE = /^(?<type>[a-z]+)(\([^)]+\))?(?<breaking>!)?: /;

function usage() {
  console.log(
    [
      "Usage: node dist/scripts/release/semver-from-commits.js [--json] [--from-tag <tag>]",
      "",
      "Outputs semver bump suggestion inferred from commit history:",
      "  breaking change => major",
      "  feat           => minor",
      "  otherwise      => patch"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = { json: false, fromTag: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      out.json = true;
      continue;
    }
    if (token === "--from-tag") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --from-tag.");
      }
      out.fromTag = value;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return out;
}

function getErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code || "");
  }
  return "";
}

function runGit(args, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.error) {
    if (getErrorCode(result.error) === "EPERM") {
      throw new Error(
        "Cannot spawn git in this restricted environment (EPERM). Run release commands in a normal local terminal."
      );
    }
    throw new Error(`git ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || "").trim() || "<empty>"}`);
  }
  return String(result.stdout || "").trim();
}

function readCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(`package.json version must be x.y.z. Received: ${pkg.version}`);
  }
  return pkg.version;
}

function detectLastSemverTag() {
  const output = runGit(["tag", "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-creatordate"], true);
  if (!output) {
    return "";
  }
  return output.split(/\r?\n/)[0]?.trim() || "";
}

function parseCommitLog(output) {
  if (!output) {
    return [];
  }
  const entries = output
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return entries.map((entry) => {
    const [hash = "", subject = "", body = ""] = entry.split("\x1f");
    return {
      hash: hash.trim(),
      shortHash: hash.trim().slice(0, 7),
      subject: subject.trim(),
      body: body.trim()
    };
  });
}

function readCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const pretty = "%H%x1f%s%x1f%b%x1e";
  const output = runGit(["log", range, `--pretty=format:${pretty}`], true);
  return parseCommitLog(output);
}

function classifyCommit(commit) {
  const match = commit.subject.match(CONVENTIONAL_SUBJECT_RE);
  const type = match?.groups?.type || "other";
  const breakingBySubject = Boolean(match?.groups?.breaking);
  const breakingByBody = /BREAKING CHANGE:/i.test(commit.body);
  const breaking = breakingBySubject || breakingByBody;
  return { type, breaking };
}

function nextBump(current, candidate) {
  const order = { none: 0, patch: 1, minor: 2, major: 3 };
  return order[candidate] > order[current] ? candidate : current;
}

export function bumpVersion(version, bump) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else if (bump === "patch") {
    patch += 1;
  } else {
    throw new Error(`Invalid bump kind: ${bump}`);
  }

  return `${major}.${minor}.${patch}`;
}

export function analyzeSemver({ fromTag = "" } = {}) {
  const currentVersion = readCurrentVersion();
  const lastTag = fromTag || detectLastSemverTag();
  const commits = readCommitsSinceTag(lastTag);
  const byType = {};
  let suggestedBump = "none";

  for (const commit of commits) {
    const classified = classifyCommit(commit);
    byType[classified.type] = (byType[classified.type] || 0) + 1;

    if (classified.breaking) {
      suggestedBump = nextBump(suggestedBump, "major");
      continue;
    }
    if (classified.type === "feat") {
      suggestedBump = nextBump(suggestedBump, "minor");
      continue;
    }
    suggestedBump = nextBump(suggestedBump, "patch");
  }

  const suggestedNextVersion =
    suggestedBump === "none" ? currentVersion : bumpVersion(currentVersion, suggestedBump);

  return {
    currentVersion,
    lastTag: lastTag || "",
    commitCount: commits.length,
    suggestedBump,
    suggestedNextVersion,
    countsByType: byType,
    commits: commits.map((commit) => {
      const classified = classifyCommit(commit);
      return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        subject: commit.subject,
        type: classified.type,
        breaking: classified.breaking
      };
    })
  };
}

function printTextSummary(summary) {
  console.log(`[release] Current version: ${summary.currentVersion}`);
  console.log(`[release] Last semver tag: ${summary.lastTag || "<none>"}`);
  console.log(`[release] Commits analyzed: ${summary.commitCount}`);
  console.log(`[release] Suggested bump: ${summary.suggestedBump}`);
  console.log(`[release] Suggested next version: ${summary.suggestedNextVersion}`);

  const typeRows = Object.entries(summary.countsByType).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (typeRows.length > 0) {
    console.log("[release] Commit counts:");
    for (const [type, count] of typeRows) {
      console.log(`  - ${type}: ${count}`);
    }
  }
}

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === __filename;
}

if (isDirectRun()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = analyzeSemver({ fromTag: args.fromTag });
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printTextSummary(summary);
    }
  } catch (err) {
    console.error(`[release] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
