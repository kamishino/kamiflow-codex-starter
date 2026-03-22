import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

type RegexAnchor = {
  label: string;
  pattern: RegExp;
};

type MarkdownContractSpec = {
  headings?: string[];
  anchors?: string[];
  regexAnchors?: RegexAnchor[];
};

type VerificationResult = {
  ok: boolean;
  errors: string[];
};

const DOC_SPECS: Array<{ relPath: string; spec: MarkdownContractSpec }> = [
  {
    relPath: "AGENTS.md",
    spec: {
      headings: [
        "Instruction Topology",
        "Context Resolver",
        "Session Bootstrap Contract",
        "Plan Lifecycle Contract",
        "Evidence Gate",
        "Smooth Flow Protocol",
        "Chat-Only Operation Contract",
        "Markdown Readability Policy",
        "Anti-Pattern Router",
        "Learning Loop Contract",
        "Documentation Freshness Contract"
      ],
      anchors: [
        "active non-done plan",
        "no-plan fast path",
        "active-plan workflow",
        "touch the active plan twice",
        "`updated_at`",
        "timestamped `WIP Log`",
        "Do not require the user to run `kfc`/`npm` commands",
        "`Check: PASS|BLOCK`",
        "`Implementation Tasks` only",
        "`Acceptance Criteria`",
        "completion is below 100%",
        "$kamiflow-core plan",
        "resources/docs/CHANGELOG.md",
        "npm run docs:sync",
        "npm run verify:governance"
      ],
      regexAnchors: [
        {
          label: "plan persistence requirement",
          pattern: /persist plan(?:-state)? updates/i
        }
      ]
    }
  },
  {
    relPath: "resources/docs/CODEX_ANTI_PATTERNS.md",
    spec: {
      anchors: [
        "| ID | Scope | Bad Pattern | Detection Signal | Corrective Command | Rule Target | Skill Target |",
        "AP-001",
        "AP-002",
        "AP-003",
        "AP-004",
        "AP-005",
        "AP-006",
        "AP-007",
        "AP-008",
        "AP-009",
        "AP-010",
        "AP-011",
        "AP-012",
        "AP-013",
        "AP-014",
        "AP-015",
        "AP-016",
        "AP-017",
        "AP-018",
        "AP-019",
        "AP-020"
      ]
    }
  },
  {
    relPath: "resources/docs/CODEX_INCIDENT_LEDGER.md",
    spec: {
      headings: ["Entry Template"],
      anchors: [
        "- Date:",
        "- Environment:",
        "- Failure Signature:",
        "- Root Cause:",
        "- Permanent Guardrail Added:",
        "- Files Changed:",
        "- Verification Command:"
      ]
    }
  },
  {
    relPath: "resources/rules/base.rules",
    spec: {
      anchors: ["AP-003", "AP-005", "AP-006"]
    }
  },
  {
    relPath: "resources/rules/profiles/client.rules",
    spec: {
      anchors: ["AP-001", "AP-002"]
    }
  },
  {
    relPath: "resources/skills/kamiflow-core/SKILL.md",
    spec: {
      headings: ["Smooth Flow Checklist", "Failure Recovery", "Route Confidence Gate", "Command Boundary Quick Rules"],
      anchors: [
        "Chat-first operation",
        "Emoji is allowed",
        "persists plan-state changes directly in markdown",
        "curated durable project memory",
        "`Implementation Tasks`",
        "`Acceptance Criteria`",
        "Route Confidence",
        "no-plan fast path",
        "`Check: PASS|BLOCK`",
        "completion is below 100%",
        "mark status as `Unknown`",
        "kfc flow ensure-plan --project .",
        "Prefer direct plan-file mutation as primary lifecycle path",
        "$kamiflow-core plan",
        "git commit --no-verify",
        "workflow, onboarding, and durable user-facing changes",
        "Keep private project memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`",
        "In KFC repo, prefer `npm run ...` maintainer commands.",
        "In client projects, prefer `kfc ...` or `npx --no-install kfc ...`.",
        "npx --package @kamishino/kamiflow-codex kfc client install",
        "npm run codex:sync:skills -- --force"
      ]
    }
  },
  {
    relPath: "resources/skills/kamiflow-core/references/build.md",
    spec: {
      headings: ["Command Recipe"],
      anchors: [
        "build-ready criteria",
        "Status: BLOCK",
        "Recovery: update plan via `$kamiflow-core plan` and rerun build",
        "direct markdown mutation",
        "timestamped WIP evidence",
        "`Implementation Tasks` only",
        "`Check: PASS|BLOCK`",
        "`Unknown`"
      ]
    }
  },
  {
    relPath: "resources/skills/kamiflow-core/references/fix.md",
    spec: {
      headings: ["Command Recipe"],
      anchors: [
        "build-ready criteria",
        "Status: BLOCK",
        "Recovery: update plan via `$kamiflow-core plan` and rerun fix",
        "direct markdown mutation",
        "timestamped WIP evidence",
        "`Check: PASS|BLOCK`",
        "`Unknown`"
      ]
    }
  },
  {
    relPath: "resources/skills/kamiflow-core/references/command-map.md",
    spec: {
      headings: ["Confidence Gate (Mandatory)", "Context Lock", "First Run / Bootstrap", "Common Client Commands", "Common Repo Commands", "Recovery Shortcuts"],
      anchors: [
        "Route Confidence",
        "Status: REROUTE",
        "Fallback Route: <start|plan|research>",
        "Reason: <single concrete cause>",
        "npx --package @kamishino/kamiflow-codex kfc client install",
        "npx --no-install kfc client status",
        "npm run codex:sync:skills -- --force"
      ]
    }
  },
  {
    relPath: "resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md",
    spec: {
      headings: [
        "Core Sequence",
        "Route Confidence Gate",
        "Route-to-Profile Matrix",
        "Deterministic Fallback Order",
        "Phase Scope",
        "No-Plan Fast Path",
        "Plan Touch Cadence",
        "Chat-Only Execution",
        "Compact Response Shape",
        "Auto Check Gate",
        "Docs Freshness Gate",
        "Evidence Rule",
        "Completion Safety",
        "Recovery Shortcuts",
        "Readability Style",
        "Multi-Agent Orchestration"
      ],
      anchors: [
        "touch active plan at route start",
        "touch active plan again before final response",
        "| `start` | `plan` |",
        "| `build` | `executor` |",
        "| `check` | `review` |",
        "use this exact order",
        "Route Confidence",
        "fast-path boundary",
        "after each completed task/subtask",
        "`Implementation Tasks`",
        "`Acceptance Criteria`",
        "Check: PASS",
        "Emoji is allowed",
        "Do not treat plan as done if archive fails.",
        "Lead -> Explorer(s) -> Worker(s) -> Reviewer -> Lead",
        "tracked docs source of truth"
      ]
    }
  },
  {
    relPath: "resources/docs/CODEX_MULTI_AGENT_ORCHESTRATION.md",
    spec: {
      headings: ["When To Use Multi-Agent", "Role Pattern", "Orchestration Loop", "Tool Mapping"],
      anchors: ["spawn_agent", "send_input", "wait", "close_agent", "one route per response", "State/Doing/Next"]
    }
  },
  {
    relPath: "resources/docs/ROUTE_PROMPTS.md",
    spec: {
      headings: ["Route Profile Matrix", "Command Boundary Quick Rules", "Route Confidence Gate"],
      anchors: [
        "Fallback order for all routes:",
        "| `start` | `plan` |",
        "| `plan` | `plan` |",
        "| `build` | `executor` |",
        "| `fix` | `executor` |",
        "| `check` | `review` |",
        "| `research` | `plan` |",
        "profile: `plan`",
        "profile: `executor`",
        "profile: `review`",
        "Recover missing plan via `kfc flow ensure-plan --project .`.",
        "In KFC repo, use `npm run ...` maintainer commands.",
        "In client projects, use `kfc ...` or `npx --no-install kfc ...`.",
        "npx --package @kamishino/kamiflow-codex kfc client install",
        "Status: REROUTE",
        "Route Confidence: <1-5>",
        "Fallback Route: <start|plan|research>",
        "`IDEATION_CONTEXT`",
        "run ideation preset:",
        "tracked docs impact"
      ]
    }
  },
  {
    relPath: "resources/skills/kamiflow-core/references/check.md",
    spec: {
      anchors: [
        "workflow, onboarding, and durable user-facing changes",
        "tracked docs source of truth",
        "Docs impact is reviewed before commit-safe completion."
      ]
    }
  }
];

function read(rootDir: string, relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), "utf8");
}

function collectMarkdownHeadings(content: string): Set<string> {
  const headings = new Set<string>();
  const matches = String(content || "").matchAll(/^#{2,6}\s+(.+)$/gm);
  for (const match of matches) {
    const heading = String(match[1] || "").trim();
    if (heading) {
      headings.add(heading);
    }
  }
  return headings;
}

function pushError(errors: string[], relPath: string, message: string) {
  errors.push(`[codex-intelligence] ${relPath}: ${message}`);
}

function assertHeadings(content: string, relPath: string, headings: string[], errors: string[]) {
  const availableHeadings = collectMarkdownHeadings(content);
  for (const heading of headings) {
    if (!availableHeadings.has(heading)) {
      pushError(errors, relPath, `missing required heading -> ${heading}`);
    }
  }
}

function assertAnchors(content: string, relPath: string, anchors: string[], errors: string[]) {
  for (const anchor of anchors) {
    if (!content.includes(anchor)) {
      pushError(errors, relPath, `missing required anchor -> ${anchor}`);
    }
  }
}

function assertRegexAnchors(content: string, relPath: string, regexAnchors: RegexAnchor[], errors: string[]) {
  for (const anchor of regexAnchors) {
    if (!anchor.pattern.test(content)) {
      pushError(errors, relPath, `missing required semantic anchor -> ${anchor.label}`);
    }
  }
}

function verifyMarkdownContract(rootDir: string, relPath: string, spec: MarkdownContractSpec, errors: string[]) {
  const content = read(rootDir, relPath);
  if (Array.isArray(spec.headings) && spec.headings.length > 0) {
    assertHeadings(content, relPath, spec.headings, errors);
  }
  if (Array.isArray(spec.anchors) && spec.anchors.length > 0) {
    assertAnchors(content, relPath, spec.anchors, errors);
  }
  if (Array.isArray(spec.regexAnchors) && spec.regexAnchors.length > 0) {
    assertRegexAnchors(content, relPath, spec.regexAnchors, errors);
  }
}

export function verifyCodexIntelligenceContract(options: { rootDir?: string } = {}): VerificationResult {
  const rootDir = path.resolve(options.rootDir || ROOT_DIR);
  const errors: string[] = [];

  for (const entry of DOC_SPECS) {
    verifyMarkdownContract(rootDir, entry.relPath, entry.spec, errors);
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function isDirectExecution(): boolean {
  const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return invokedPath === __filename;
}

if (isDirectExecution()) {
  try {
    const result = verifyCodexIntelligenceContract();
    if (!result.ok) {
      for (const line of result.errors) {
        console.error(line);
      }
      process.exit(1);
    }
    console.log("[codex-intelligence] OK");
  } catch (err) {
    console.error(`[codex-intelligence] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
