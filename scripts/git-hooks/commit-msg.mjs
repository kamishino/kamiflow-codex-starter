import fs from "node:fs";

const ALLOWED_TYPES = new Set([
  "feat",
  "fix",
  "docs",
  "refactor",
  "test",
  "chore",
  "build",
  "ci",
  "perf",
  "style"
]);

const BYPASS_PATTERNS = [/^Merge\b/, /^Revert\b/, /^(fixup|squash)! /];
const CONVENTIONAL_PATTERN = /^(?<type>[a-z]+)\((?<scope>[a-z0-9][a-z0-9._/-]*)\)(?<breaking>!)?: (?<summary>.+)$/;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

let rawMessage = "";
const source = args[0];

if (source === "--stdin") {
  rawMessage = fs.readFileSync(0, "utf8");
} else if (source === "--message") {
  const message = args[1];
  if (!message) {
    fail("Missing value for --message.");
  }
  rawMessage = message;
} else if (source && !source.startsWith("--")) {
  rawMessage = readMessageFile(source);
} else {
  printHelp();
  process.exit(1);
}

const subject = extractSubject(rawMessage);
validateSubject(subject);

console.log(`[commit-msg] OK: ${subject}`);

function readMessageFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Cannot read commit message file "${filePath}": ${message}`);
  }
}

function extractSubject(messageText) {
  const lines = messageText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return trimmed;
  }

  fail("Commit message cannot be empty.");
}

function validateSubject(subject) {
  for (const pattern of BYPASS_PATTERNS) {
    if (pattern.test(subject)) {
      return;
    }
  }

  const match = subject.match(CONVENTIONAL_PATTERN);
  if (!match?.groups) {
    fail('Use format: "type(scope): summary" (optional breaking marker: "type(scope)!: summary").');
  }

  const { type, summary } = match.groups;

  if (!ALLOWED_TYPES.has(type)) {
    fail(`Invalid type "${type}". Allowed: ${[...ALLOWED_TYPES].join(", ")}.`);
  }

  if (!summary || summary.trim().length === 0) {
    fail("Summary cannot be empty.");
  }

  if (summary.length > 100) {
    fail("Summary is too long (max 100 characters after \": \").");
  }
}

function fail(message) {
  console.error(`[commit-msg] ${message}`);
  console.error('[commit-msg] Example: feat(codex): add clean commit hook');
  process.exit(1);
}

function printHelp() {
  console.log("Validate a commit message subject.");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/git-hooks/commit-msg.mjs <commit-message-file>");
  console.log("  node scripts/git-hooks/commit-msg.mjs --stdin");
  console.log("  node scripts/git-hooks/commit-msg.mjs --message \"feat(scope): summary\"");
}
