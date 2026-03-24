#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  extractSection,
  isPassPlanRecord,
  listPlanRecords,
  parseCliArgs,
  printJson,
  PROJECT_BRIEF_PATH,
  resolveActivePlan,
  resolveProjectDir
} from "./lib-plan.mjs";

const MAX_ARCHIVED_PLANS = 20;
const MAX_RESULTS = 5;
const SECTION_WEIGHTS = new Map([
  ["Title", 6],
  ["Goal", 5],
  ["Current Priorities", 5],
  ["Product Summary", 4],
  ["Project Fit", 4],
  ["Architecture Guardrails", 4],
  ["Acceptance Criteria", 3],
  ["Recent Decisions", 3],
  ["Open Questions", 2],
  ["Implementation Tasks", 2],
  ["Release Impact", 2]
]);
const SOURCE_PRIORITY = new Map([
  ["active-plan", 0],
  ["project-brief", 1],
  ["archived-plan", 2]
]);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "with"
]);

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const query = String(args.query || "").trim();

if (!query) {
  printJson({
    ok: false,
    query,
    results: [],
    reason: "Query is required.",
    recovery: "node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query \"release flow\""
  });
  process.exit(1);
}

const queryTokens = tokenize(query);
if (queryTokens.length === 0) {
  printJson({
    ok: true,
    query,
    results: []
  });
  process.exit(0);
}

const candidates = await collectCandidates(projectDir);
const scoredResults = candidates
  .map((candidate) => scoreCandidate(candidate, query, queryTokens))
  .filter((candidate) => candidate.score > 0)
  .sort(compareResults)
  .slice(0, MAX_RESULTS)
  .map(serializeResult);

printJson({
  ok: true,
  query,
  results: scoredResults
});

async function collectCandidates(projectDir) {
  const candidates = [];
  const projectBriefPath = path.join(projectDir, PROJECT_BRIEF_PATH);
  if (fs.existsSync(projectBriefPath)) {
    const content = await fsp.readFile(projectBriefPath, "utf8");
    const stat = await fsp.stat(projectBriefPath);
    candidates.push({
      sourceType: "project-brief",
      path: projectBriefPath,
      planId: "",
      title: "Project Brief",
      mtimeMs: stat.mtimeMs,
      sections: [
        { name: "Product Summary", text: extractSection(content, "Product Summary") },
        { name: "Current Priorities", text: extractSection(content, "Current Priorities") },
        { name: "Architecture Guardrails", text: extractSection(content, "Architecture Guardrails") },
        { name: "Open Questions", text: extractSection(content, "Open Questions") },
        { name: "Recent Decisions", text: extractSection(content, "Recent Decisions") }
      ]
    });
  }

  const activePlan = await resolveActivePlan(projectDir);
  if (activePlan) {
    candidates.push(buildPlanCandidate(activePlan, "active-plan"));
  }

  const allPlans = await listPlanRecords(projectDir, true);
  const archivedPlans = allPlans
    .filter((plan) => String(plan.frontmatter.status || "").toLowerCase() === "done")
    .filter((plan) => isPassPlanRecord(plan))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
    .slice(0, MAX_ARCHIVED_PLANS);

  for (const plan of archivedPlans) {
    candidates.push(buildPlanCandidate(plan, "archived-plan"));
  }

  return candidates;
}

function buildPlanCandidate(plan, sourceType) {
  return {
    sourceType,
    path: plan.path,
    planId: String(plan.frontmatter.plan_id || "").trim(),
    title: String(plan.frontmatter.title || path.basename(plan.path)).trim(),
    mtimeMs: plan.stat.mtimeMs,
    sections: [
      { name: "Goal", text: extractSection(plan.content, "Goal") },
      { name: "Project Fit", text: extractSection(plan.content, "Project Fit") },
      { name: "Implementation Tasks", text: extractSection(plan.content, "Implementation Tasks") },
      { name: "Acceptance Criteria", text: extractSection(plan.content, "Acceptance Criteria") },
      { name: "Release Impact", text: extractSection(plan.content, "Release Impact") }
    ]
  };
}

function scoreCandidate(candidate, query, queryTokens) {
  let score = 0;
  const matchedSections = [];
  const snippets = [];

  const titleScore = scoreText(candidate.title, query, queryTokens, "Title");
  if (titleScore.score > 0) {
    score += titleScore.score;
    matchedSections.push("Title");
    snippets.push(buildSnippet("Title", candidate.title, query, queryTokens));
  }

  for (const section of candidate.sections) {
    const sectionScore = scoreText(section.text, query, queryTokens, section.name);
    if (sectionScore.score === 0) {
      continue;
    }
    score += sectionScore.score;
    matchedSections.push(section.name);
    snippets.push(buildSnippet(section.name, section.text, query, queryTokens));
  }

  return {
    ...candidate,
    score,
    matchedSections,
    snippets: snippets.filter(Boolean).slice(0, 3)
  };
}

function scoreText(text, query, queryTokens, sectionName) {
  const normalizedText = normalizeForSearch(text);
  if (!normalizedText) {
    return {
      score: 0
    };
  }

  const matchedTokens = queryTokens.filter((token) => normalizedText.includes(token));
  if (matchedTokens.length === 0) {
    return {
      score: 0
    };
  }

  const sectionWeight = SECTION_WEIGHTS.get(sectionName) || 1;
  let score = matchedTokens.length * sectionWeight;
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
    score += sectionWeight;
  }

  return {
    score
  };
}

function buildSnippet(sectionName, text, query, queryTokens) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }

  const normalizedQuery = normalizeForSearch(query);
  const matchedLine = lines.find((line) => {
    const normalizedLine = normalizeForSearch(line);
    return (normalizedQuery && normalizedLine.includes(normalizedQuery))
      || queryTokens.some((token) => normalizedLine.includes(token));
  }) || lines[0];

  return `${sectionName}: ${truncateSnippet(matchedLine)}`;
}

function truncateSnippet(text) {
  const normalized = String(text || "").replace(/^\-\s+/, "").trim();
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

function tokenize(text) {
  return [...new Set(
    normalizeForSearch(text)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !STOP_WORDS.has(token))
  )];
}

function normalizeForSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compareResults(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const sourcePriorityDiff = (SOURCE_PRIORITY.get(left.sourceType) ?? 99) - (SOURCE_PRIORITY.get(right.sourceType) ?? 99);
  if (sourcePriorityDiff !== 0) {
    return sourcePriorityDiff;
  }

  if (right.mtimeMs !== left.mtimeMs) {
    return right.mtimeMs - left.mtimeMs;
  }

  return left.path.localeCompare(right.path);
}

function serializeResult(result) {
  return {
    source_type: result.sourceType,
    path: result.path,
    ...(result.planId ? { plan_id: result.planId } : {}),
    score: result.score,
    matched_sections: result.matchedSections,
    snippets: result.snippets
  };
}
