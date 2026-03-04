import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const REQUIRED_PATTERNS = [
  { label: "start command", regex: /\bkfc client\b/ },
  { label: "ready file", regex: /\.kfc\/CODEX_READY\.md/ },
  { label: "cleanup command", regex: /\bkfc client done\b/ },
  { label: "autonomous flow execution", regex: /\bautonom(?:ous|ously)\b/i }
];

const FILE_SPECIFIC_PATTERNS = {
  "resources/docs/QUICKSTART.md": [
    { label: "no reminder loop guidance", regex: /no user reminder loop/i }
  ],
  "resources/docs/CLIENT_KICKOFF_PROMPT.md": [
    { label: "plan touch cadence", regex: /Touch active plan markdown twice per request/i }
  ],
  "resources/docs/CLIENT_A2Z_PLAYBOOK.md": [
    { label: "plan touch cadence", regex: /Touch active plan markdown at route start and before final response/i }
  ]
};

const TARGET_FILES = [
  "README.md",
  "resources/docs/QUICKSTART.md",
  "resources/docs/CLIENT_KICKOFF_PROMPT.md",
  "resources/docs/CLIENT_A2Z_PLAYBOOK.md"
];

function verifyFile(relPath) {
  const absPath = path.join(ROOT_DIR, relPath);
  const content = fs.readFileSync(absPath, "utf8");
  const required = [
    ...REQUIRED_PATTERNS,
    ...(FILE_SPECIFIC_PATTERNS[relPath] || [])
  ];
  const missing = required.filter((rule) => !rule.regex.test(content));
  return { relPath, missing };
}

try {
  const reports = TARGET_FILES.map((relPath) => verifyFile(relPath));
  let failed = false;

  for (const report of reports) {
    if (report.missing.length === 0) {
      continue;
    }
    failed = true;
    for (const miss of report.missing) {
      console.error(
        `[codex-client-contract] ${report.relPath}: missing required text for ${miss.label}`
      );
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("[codex-client-contract] OK");
} catch (err) {
  console.error(
    `[codex-client-contract] ERROR: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}
