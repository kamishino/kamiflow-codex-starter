import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

function assertIncludes(content, relPath, token, errors) {
  if (!content.includes(token)) {
    errors.push(`[codex-intelligence] ${relPath}: missing required token -> ${token}`);
  }
}

try {
  const errors = [];

  const agentsFile = "AGENTS.md";
  const agents = read(agentsFile);
  for (const token of [
    "## Instruction Topology",
    "## Context Resolver",
    "## Session Bootstrap Contract",
    "## Anti-Pattern Router",
    "## Learning Loop Contract",
    "kfc flow ensure-plan --project .",
    "kfc flow ready --project .",
    "$kamiflow-core plan"
  ]) {
    assertIncludes(agents, agentsFile, token, errors);
  }

  const antiPatternsFile = "resources/docs/CODEX_ANTI_PATTERNS.md";
  const antiPatterns = read(antiPatternsFile);
  for (const token of [
    "| ID | Scope | Bad Pattern | Detection Signal | Corrective Command | Rule Target | Skill Target |",
    "AP-001",
    "AP-002",
    "AP-003",
    "AP-004",
    "AP-005",
    "AP-006",
    "AP-007"
  ]) {
    assertIncludes(antiPatterns, antiPatternsFile, token, errors);
  }

  const incidentFile = "resources/docs/CODEX_INCIDENT_LEDGER.md";
  const incident = read(incidentFile);
  for (const token of [
    "## Entry Template",
    "- Date:",
    "- Environment:",
    "- Failure Signature:",
    "- Root Cause:",
    "- Permanent Guardrail Added:",
    "- Files Changed:",
    "- Verification Command:"
  ]) {
    assertIncludes(incident, incidentFile, token, errors);
  }

  const baseRulesFile = "resources/rules/base.rules";
  const baseRules = read(baseRulesFile);
  for (const token of ["AP-003", "AP-005", "AP-006"]) {
    assertIncludes(baseRules, baseRulesFile, token, errors);
  }

  const clientRulesFile = "resources/rules/profiles/client.rules";
  const clientRules = read(clientRulesFile);
  for (const token of ["AP-001", "AP-002"]) {
    assertIncludes(clientRules, clientRulesFile, token, errors);
  }

  const skillFile = "resources/skills/kamiflow-core/SKILL.md";
  const skill = read(skillFile);
  for (const token of [
    "## Failure Recovery",
    "kfc flow ensure-plan --project .",
    "kfc flow ready --project .",
    "$kamiflow-core plan",
    "git commit --no-verify"
  ]) {
    assertIncludes(skill, skillFile, token, errors);
  }

  const buildRefFile = "resources/skills/kamiflow-core/references/build.md";
  const buildRef = read(buildRefFile);
  for (const token of [
    "kfc flow ready --project <path>",
    "Status: BLOCK",
    "Recovery: kfc flow ready --project <path>",
    'Expected: {"ok":true,"ready":true,...}'
  ]) {
    assertIncludes(buildRef, buildRefFile, token, errors);
  }

  const fixRefFile = "resources/skills/kamiflow-core/references/fix.md";
  const fixRef = read(fixRefFile);
  for (const token of [
    "kfc flow ready --project <path>",
    "Status: BLOCK",
    "Recovery: kfc flow ready --project <path>",
    'Expected: {"ok":true,"ready":true,...}'
  ]) {
    assertIncludes(fixRef, fixRefFile, token, errors);
  }

  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log("[codex-intelligence] OK");
} catch (err) {
  console.error(`[codex-intelligence] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
