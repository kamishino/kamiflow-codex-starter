import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const REQUIRED_PATTERNS = [
  { label: "start command", regex: /\bkfc client\b/ },
  { label: "root agents file", regex: /\bAGENTS\.md\b/ },
  { label: "ready file", regex: /\.kfc\/CODEX_READY\.md/ },
  { label: "lessons file", regex: /\.kfc\/LESSONS\.md/ },
  { label: "project-local skill", regex: /\.agents\/skills\/kamiflow-core\/SKILL\.md/ },
  { label: "cleanup command", regex: /\bkfc client done\b/ },
  { label: "autonomous flow execution", regex: /\bautonom(?:ous|ously)\b/i },
  { label: "auto check gate", regex: /Check:\s*PASS\|BLOCK/i }
];

const FILE_SPECIFIC_PATTERNS = {
  "resources/docs/QUICKSTART.md": [
    { label: "root agents guidance", regex: /root `AGENTS\.md`|AGENTS\.md first/i },
    { label: "agents init contract guidance", regex: /\/init` contract|\/init equivalent/i },
    { label: "workflow command map guidance", regex: /workflow command map|`kfc plan validate --project \.`|`kfc flow ensure-plan --project \.`/i },
    { label: "reusable entrypoint guidance", regex: /reusable client-project entrypoint|rerunning plain `kfc client`/i },
    { label: "auto cleanup guidance", regex: /auto-cleans? `.kfc\/CODEX_READY\.md`|archived done/i },
    { label: "no reminder loop guidance", regex: /no user reminder loop/i },
    { label: "smart recovery guidance", regex: /smart-recovery cycle/i },
    { label: "onboarding status guidance", regex: /Onboarding Status:\s*PASS\|BLOCK/i },
    { label: "inspection status guidance", regex: /Inspection Status:\s*PASS\|BLOCK/i }
  ],
  "resources/docs/CLIENT_KICKOFF_PROMPT.md": [
    { label: "agents first guidance", regex: /Read `AGENTS\.md` first/i },
    { label: "agents init contract guidance", regex: /project `\/init` contract|project-specific `\/init` contract/i },
    { label: "workflow command map guidance", regex: /workflow command map|`kfc plan validate --project \.`|`kfc client doctor --project \. --fix`/i },
    { label: "rerun handoff guidance", regex: /reuse or refresh the existing handoff/i },
    { label: "plan touch cadence", regex: /Touch active plan markdown twice per request/i },
    { label: "onboarding error code guidance", regex: /Error Code:\s*CLIENT_/i }
  ],
  "resources/docs/CLIENT_A2Z_PLAYBOOK.md": [
    { label: "stable agents guidance", regex: /stable client-repo operating contract|Read `AGENTS\.md` first/i },
    { label: "agents init contract guidance", regex: /project-specific `\/init` contract|KFC-owned `\/init` equivalent/i },
    { label: "workflow command map guidance", regex: /workflow command map|`kfc flow ensure-plan --project \.`|`kfc client done`/i },
    { label: "auto cleanup guidance", regex: /auto-clean `.kfc\/CODEX_READY\.md`|manual cleanup fallback/i },
    { label: "plan touch cadence", regex: /Touch active plan markdown at route start and before final response/i },
    { label: "smart recovery guidance", regex: /smart-recovery cycle/i }
  ],
  "src/commands/client.ts": [
    { label: "client agents generation", regex: /Client AGENTS\.md scaffolded:|Client AGENTS\.md managed block refreshed:|Client AGENTS\.md managed block inserted:/ },
    { label: "managed agents block", regex: /KFC:BEGIN MANAGED/ },
    { label: "agents init contract wording", regex: /\/init`-equivalent contract/ },
    { label: "workflow commands section", regex: /## Workflow Commands/ },
    { label: "shared client agents contract file", regex: /CLIENT_AGENTS_SHARED_CONTRACT_FILE/ },
    { label: "shared client agents contract path", regex: /resolveClientAgentsSharedContractPath/ },
    { label: "shared client agents contract loader", regex: /buildClientAgentsManagedBlock\(projectDir\)|fsp\.readFile\(sharedContractPath/ },
    { label: "setup completion detection", regex: /evaluateClientSetupCompletion/ },
    { label: "inspection output", regex: /Inspection Status:\s*\$\{summary\.inspectionStatus\}/ },
    { label: "structured onboarding block output", regex: /Onboarding Status:\s*BLOCK/ },
    { label: "structured onboarding error code output", regex: /Error Code:/ },
    { label: "smart recovery execution", regex: /smart recovery cycle/i },
    { label: "project-local skill sync", regex: /Project-local skill synced:/ },
    { label: "client lessons scaffold", regex: /Client lessons scaffolded:|Client lessons preserved:/ },
    { label: "private gitignore prep", regex: /Prepended private ignore entries:|Private ignore entries already present:/ }
  ],
  "resources/templates/client-agents-shared-contract.md": [
    { label: "workflow contract section", regex: /## Workflow Contract/ },
    { label: "plan resolution guidance", regex: /Resolve one active non-done plan before implementation-bearing work\./ },
    { label: "plan touch guidance", regex: /Touch the active plan at route start and before final response/ },
    { label: "compact response guidance", regex: /`State`, `Doing`, and `Next`/ },
    { label: "auto check guidance", regex: /Check:\s*PASS\|BLOCK/ },
    { label: "autonomous execution section", regex: /## Autonomous Execution/ },
    { label: "evidence gate section", regex: /## Evidence Gate/ },
    { label: "unknown guidance", regex: /mark the result `Unknown`/ },
    { label: "docs and closeout section", regex: /## Docs and Closeout/ },
    { label: "agents review guidance", regex: /review `AGENTS\.md` for operating-contract drift/ },
    { label: "blocker contract section", regex: /## Blocker Contract/ },
    { label: "recovery guidance", regex: /`Recovery: <exact command>`/ }
  ]
};

const TARGET_FILES = [
  "README.md",
  "resources/docs/QUICKSTART.md",
  "resources/docs/CLIENT_KICKOFF_PROMPT.md",
  "resources/docs/CLIENT_A2Z_PLAYBOOK.md",
  "src/commands/client.ts",
  "resources/templates/client-agents-shared-contract.md"
];

const FILES_WITHOUT_GLOBAL_PATTERNS = new Set([
  "resources/templates/client-agents-shared-contract.md"
]);

function verifyFile(relPath) {
  const absPath = path.join(ROOT_DIR, relPath);
  const content = fs.readFileSync(absPath, "utf8");
  const required = [
    ...(FILES_WITHOUT_GLOBAL_PATTERNS.has(relPath) ? [] : REQUIRED_PATTERNS),
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
