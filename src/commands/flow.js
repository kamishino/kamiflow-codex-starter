import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { error, info } from "../lib/logger.js";
import { createLocalPlanTemplate } from "../lib/plan-bootstrap.js";
import {
  applyLifecycleMutation,
  buildPhaseDigest,
  evaluateArchiveGate,
  evaluateBuildReadiness as evaluateBuildReadinessFromLifecycle,
  normalizeBlockers as normalizeBlockersFromLifecycle,
  toIsoTimestamp as toIsoTimestampFromLifecycle,
  toNextAction as toNextActionFromLifecycle
} from "../lib/plan-lifecycle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const KFC_BIN = path.join(REPO_ROOT, "bin", "kamiflow.js");
const DEFAULT_BASE_URL = "http://127.0.0.1:4310";

function usage() {
  info("Usage: kfc flow <ensure-plan|ready|apply|next> [options]");
  info("Examples:");
  info("  kfc flow ensure-plan --project .");
  info("  kfc flow ready --project .");
  info("  kfc flow ready --project . --no-sync-block");
  info("  kfc flow apply --project . --plan PLAN-YYYY-MM-DD-001 --route build --result progress");
  info("  kfc flow next --project . --plan PLAN-YYYY-MM-DD-001 --style narrative");
}

function readFlag(args, flag) {
  return args.includes(flag);
}

function readOption(args, flag, fallback = "") {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return fallback;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function resolveProjectDir(defaultCwd, args) {
  const value = readOption(args, "--project", "");
  return value ? path.resolve(value) : defaultCwd;
}

function resolveBaseUrl(args) {
  const fromArg = readOption(args, "--base-url", "");
  if (fromArg) {
    return fromArg.replace(/\/+$/, "");
  }
  const fromEnv = process.env.KFP_BASE_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, "");
  }
  return DEFAULT_BASE_URL;
}

function resolvePlansDir(projectDir) {
  return path.join(projectDir, ".local", "plans");
}

function parseSimpleFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    return {};
  }
  const lines = markdown.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return {};
  }

  const out = {};
  const blockLines = lines.slice(1, endIdx);
  for (const line of blockLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    const rawValue = trimmed.slice(sep + 1).trim();
    out[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function toTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

async function readPlanRecord(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const fm = parseSimpleFrontmatter(raw);
  return {
    filePath,
    fileName: path.basename(filePath),
    frontmatter: fm,
    planId: fm.plan_id || path.basename(filePath, path.extname(filePath)),
    status: fm.status || "unknown",
    updatedAt: fm.updated_at || "",
    updatedAtMs: toTimestamp(fm.updated_at, stat.mtimeMs),
    mtimeMs: stat.mtimeMs,
    raw
  };
}

async function listPlanFiles(projectDir, includeDone = false) {
  const plansDir = resolvePlansDir(projectDir);
  const files = [];
  const enqueueMarkdownFrom = async (dirPath) => {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return;
      }
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(full);
      }
    }
  };

  await enqueueMarkdownFrom(plansDir);
  if (includeDone) {
    await enqueueMarkdownFrom(path.join(plansDir, "done"));
  }
  return files;
}

async function loadPlans(projectDir, includeDone = false) {
  const files = await listPlanFiles(projectDir, includeDone);
  const plans = [];
  for (const filePath of files) {
    try {
      plans.push(await readPlanRecord(filePath));
    } catch {
      // Ignore unreadable/invalid files for deterministic selection.
    }
  }
  return plans;
}

async function resolvePlanByRef(projectDir, planRef, includeDone = true) {
  const refPath = path.resolve(projectDir, planRef);
  try {
    const stat = await fs.stat(refPath);
    if (stat.isFile()) {
      return await readPlanRecord(refPath);
    }
  } catch {
    // Not a path; continue lookup by plan_id.
  }

  const plans = await loadPlans(projectDir, includeDone);
  return plans.find((item) => item.planId === planRef || item.fileName === planRef) || null;
}

function selectActivePlan(plans) {
  const active = plans.filter((item) => String(item.status || "").toLowerCase() !== "done");
  active.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return active[0] || null;
}

function runNode(commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function createPlanViaInit(projectDir, cwd) {
  try {
    const result = await runNode([KFC_BIN, "plan", "init", "--project", projectDir, "--new"], cwd);
    if (result.code === 0) {
      const match = result.stdout.match(/\[kfp\] Created template:\s*(.+)/);
      if (match) {
        return path.resolve(match[1].trim());
      }
      info(
        `kfc plan init output did not include created template path. Falling back to local bootstrap.\nstdout:\n${result.stdout || "<empty>"}`
      );
    } else {
      info(
        `kfc plan init failed with exit code ${result.code}. Falling back to local bootstrap.\nstdout:\n${result.stdout || "<empty>"}\nstderr:\n${result.stderr || "<empty>"}`
      );
    }
  } catch (err) {
    info(`kfc plan init invocation failed. Falling back to local bootstrap: ${err instanceof Error ? err.message : String(err)}`);
  }
  return await createLocalPlanTemplate(projectDir, { forceNew: true, log: info });
}

function ensureRoute(route) {
  if (!["start", "plan", "build", "check", "fix", "research"].includes(route)) {
    throw new Error(`Invalid --route value: ${route}.`);
  }
}

function ensureResult(result) {
  if (!["go", "progress", "pass", "block"].includes(result)) {
    throw new Error(`Invalid --result value: ${result}.`);
  }
}

function blockMessage(projectDir, baseUrl, reason) {
  return [
    "Status: BLOCK",
    `Reason: ${reason}`,
    `Recovery: kfc plan serve --project ${projectDir} --port 4310`,
    `Expected: GET ${baseUrl}/api/health returns {"ok":true}`
  ].join("\n");
}

function toNextAction(summary) {
  const next = summary?.next_command || "plan";
  if (next === "build") {
    return "Implement the next scoped task and record validation outcomes in the plan.";
  }
  if (next === "check") {
    return "Verify acceptance criteria, list findings by severity, and decide PASS or BLOCK.";
  }
  if (next === "fix") {
    return "Address the highest-severity finding, rerun validations, then run check again.";
  }
  if (next === "done") {
    return "Finalize the task handoff and archive the completed plan.";
  }
  if (next === "plan") {
    return "Refine plan scope, tasks, and acceptance criteria until decision is GO.";
  }
  return "Continue the workflow using the plan's next command.";
}

function parseBulletLines(sectionMarkdown) {
  return String(sectionMarkdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseChecklistItems(sectionMarkdown) {
  return String(sectionMarkdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^- \[(?<state>[ xX])\]\s*(?<text>.+)$/))
    .filter(Boolean)
    .map((match) => ({
      checked: String(match.groups?.state || " ").toLowerCase() === "x",
      text: String(match.groups?.text || "").trim()
    }));
}

function markdownEscapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(markdown, heading) {
  const escaped = markdownEscapeRegExp(heading);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  const match = String(markdown || "").match(re);
  return match ? match[2].trim() : "";
}

function parseStartSummary(sectionMarkdown) {
  const summary = {};
  for (const line of String(sectionMarkdown || "").split(/\r?\n/)) {
    const match = line.trim().match(/^- (?<key>[^:]+):\s*(?<value>.*)$/);
    if (!match) {
      continue;
    }
    const key = String(match.groups?.key || "").trim().toLowerCase();
    const value = String(match.groups?.value || "").trim();
    summary[key] = value;
  }
  return summary;
}

function isPlaceholder(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return true;
  }
  if (/^(tbd|todo|n\/a|na|unknown|none)$/i.test(normalized)) {
    return true;
  }
  if (/^(task|criterion|command)\s+\d+$/i.test(normalized)) {
    return true;
  }
  return false;
}

function hasFileLevelHint(text) {
  const value = String(text || "");
  return (
    /[a-zA-Z]:\\|\/|\\/.test(value) ||
    /\.[a-z0-9]{1,8}\b/i.test(value) ||
    /`[^`]+\.[a-z0-9]{1,8}`/i.test(value)
  );
}

function looksRunnableCommand(text) {
  const value = String(text || "").trim();
  if (!value || isPlaceholder(value)) {
    return false;
  }
  return /^(npm|npx|node|kfc|kf|git|pnpm|yarn|python|pytest|cargo|go)\b/i.test(value);
}

function evaluateBuildReadiness(planRecord) {
  const findings = [];
  const fm = planRecord.frontmatter || {};
  const markdown = planRecord.raw || "";

  if (String(fm.decision || "").toUpperCase() !== "GO") {
    findings.push("decision must be GO.");
  }
  if (String(fm.next_command || "").toLowerCase() !== "build") {
    findings.push("next_command must be build.");
  }
  if (String(fm.next_mode || "") !== "Build") {
    findings.push("next_mode must be Build.");
  }

  const startSummarySection = extractSection(markdown, "Start Summary");
  if (!startSummarySection) {
    findings.push("Start Summary section is missing.");
  } else {
    const startSummary = parseStartSummary(startSummarySection);
    const required = String(startSummary.required || "").toLowerCase();
    const reason = startSummary.reason || "";
    if (required !== "yes" && required !== "no") {
      findings.push("Start Summary Required must be yes|no.");
    }
    if (isPlaceholder(reason)) {
      findings.push("Start Summary Reason is placeholder.");
    }
    if (required === "yes") {
      if (isPlaceholder(startSummary["selected idea"] || "")) {
        findings.push("Start Summary Selected Idea is placeholder.");
      }
      if (isPlaceholder(startSummary["handoff confidence"] || "")) {
        findings.push("Start Summary Handoff Confidence is placeholder.");
      }
    }
  }

  const openDecisionsSection = extractSection(markdown, "Open Decisions");
  if (!openDecisionsSection) {
    findings.push("Open Decisions section is missing.");
  } else {
    const unresolvedItems = parseChecklistItems(openDecisionsSection).filter((item) => !item.checked);
    const remainingCountMatch = openDecisionsSection.match(/Remaining Count:\s*(\d+)/i);
    const remainingCount = remainingCountMatch ? Number(remainingCountMatch[1]) : unresolvedItems.length;
    if (remainingCount > 0 || unresolvedItems.length > 0) {
      findings.push("Open Decisions has unresolved items.");
    }
  }

  const tasksSection = extractSection(markdown, "Implementation Tasks");
  const taskItems = parseChecklistItems(tasksSection);
  if (taskItems.length === 0) {
    findings.push("Implementation Tasks must contain checklist items.");
  } else {
    const invalidTasks = taskItems.filter(
      (item) => isPlaceholder(item.text) || !hasFileLevelHint(item.text)
    );
    if (invalidTasks.length > 0) {
      findings.push("Implementation Tasks must be concrete and file-level.");
    }
  }

  const acSection = extractSection(markdown, "Acceptance Criteria");
  const acItems = parseChecklistItems(acSection);
  if (acItems.length === 0) {
    findings.push("Acceptance Criteria must contain checklist items.");
  } else if (acItems.some((item) => isPlaceholder(item.text))) {
    findings.push("Acceptance Criteria includes placeholder entries.");
  }

  const validationSection = extractSection(markdown, "Validation Commands");
  const validationCommands = parseBulletLines(validationSection);
  if (validationCommands.length === 0) {
    findings.push("Validation Commands section is empty.");
  } else if (validationCommands.some((command) => !looksRunnableCommand(command))) {
    findings.push("Validation Commands must be runnable commands in this repo.");
  }

  return {
    ready: findings.length === 0,
    findings
  };
}

function printReadinessBlock(projectDir, reason, extraFindings = []) {
  const lines = [
    "Status: BLOCK",
    `Reason: ${reason}`,
    `Recovery: kfc flow ensure-plan --project ${projectDir}`,
    'Expected: {"ok":true,"plan_path":"<absolute-path>",...}'
  ];
  for (const finding of extraFindings) {
    lines.push(`- ${finding}`);
  }
  console.error(lines.join("\n"));
}

function updateFrontmatterField(markdown, key, value) {
  const text = String(markdown || "");
  if (!text.startsWith("---")) {
    return text;
  }
  const lines = text.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return text;
  }

  const targetPrefix = `${key}:`;
  let found = false;
  for (let i = 1; i < endIdx; i += 1) {
    if (lines[i].trim().startsWith(targetPrefix)) {
      lines[i] = `${key}: ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.splice(endIdx, 0, `${key}: ${value}`);
  }
  return lines.join("\n");
}

function updateWipField(markdown, key, value) {
  const sectionName = "WIP Log";
  const current = extractSection(markdown, sectionName);
  if (!current) {
    return markdown;
  }
  const lines = current.split(/\r?\n/);
  const prefix = `- ${key}:`;
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith(prefix)) {
      lines[i] = `${prefix} ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${prefix} ${value}`);
  }

  const escaped = markdownEscapeRegExp(sectionName);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  return String(markdown).replace(re, (full, lead) => `${lead}## ${sectionName}\n${lines.join("\n").trimEnd()}\n`);
}

function toIsoTimestamp() {
  return new Date().toISOString();
}

function normalizeBlockers(reason, findings) {
  const parts = [reason, ...(Array.isArray(findings) ? findings : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const compact = [];
  for (const part of parts) {
    if (!compact.includes(part)) {
      compact.push(part);
    }
  }
  const joined = compact.join(" | ");
  if (joined.length <= 600) {
    return joined;
  }
  return `${joined.slice(0, 597)}...`;
}

async function persistReadinessBlock(planRecord, reason, findings = []) {
  const raw = String(planRecord?.raw || "");
  if (!raw) {
    return false;
  }

  const next = applyLifecycleMutation(raw, {
    frontmatter: {
      decision: "NO_GO",
      status: "in_progress",
      selected_mode: "Build",
      next_command: "plan",
      next_mode: "Plan",
      updated_at: toIsoTimestampFromLifecycle()
    },
    wip: {
      status: "Blocked at build-readiness gate",
      blockers: normalizeBlockersFromLifecycle(reason, findings),
      next_step: "Run $kamiflow-core plan to resolve blockers, then rerun $kamiflow-core build."
    }
  });

  if (next === raw) {
    return false;
  }

  await fs.writeFile(planRecord.filePath, next, "utf8");
  return true;
}

async function persistReadinessReady(planRecord) {
  const raw = String(planRecord?.raw || "");
  if (!raw) {
    return false;
  }

  const next = applyLifecycleMutation(raw, {
    frontmatter: {
      selected_mode: "Build",
      updated_at: toIsoTimestampFromLifecycle()
    },
    wip: {
      status: "Build-readiness gate passed",
      blockers: "None",
      next_step: "Run $kamiflow-core build and execute one concrete task slice."
    }
  });

  if (next === raw) {
    return false;
  }

  await fs.writeFile(planRecord.filePath, next, "utf8");
  return true;
}

async function requestJson(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function ensureApiHealth(baseUrl, projectDir) {
  try {
    const res = await requestJson("GET", `${baseUrl}/api/health`);
    if (res.ok && res.json?.ok === true) {
      return;
    }
    throw new Error(`Health returned ${res.status}.`);
  } catch (err) {
    throw new Error(blockMessage(projectDir, baseUrl, err instanceof Error ? err.message : String(err)));
  }
}

function apiRoute(projectId, planId, suffix = "") {
  if (projectId) {
    return `/api/projects/${encodeURIComponent(projectId)}/plans/${encodeURIComponent(planId)}${suffix}`;
  }
  return `/api/plans/${encodeURIComponent(planId)}${suffix}`;
}

function createApplyPayload(route, result, planRecord, extraPayload) {
  if ((route === "build" || route === "fix") && result !== "progress") {
    throw new Error("build/fix route requires --result progress.");
  }
  if (route === "check" && result !== "pass" && result !== "block") {
    throw new Error("check route requires --result pass|block.");
  }
  if (route === "plan" && result !== "go") {
    throw new Error("plan route requires --result go.");
  }
  if ((route === "start" || route === "research") && result !== "progress" && result !== "go") {
    throw new Error("start/research route requires --result progress|go.");
  }

  const base = {
    expected_updated_at: planRecord.updatedAt || undefined
  };

  if (route === "build" || route === "fix") {
    return {
      endpointSuffix: "/automation/apply",
      method: "POST",
      body: {
        ...base,
        action_type: "build_result",
        mode_hint: "Build",
        ...extraPayload
      }
    };
  }

  if (route === "check") {
    const normalized = result === "pass" ? "PASS" : "BLOCK";
    return {
      endpointSuffix: "/automation/apply",
      method: "POST",
      body: {
        ...base,
        action_type: "check_result",
        mode_hint: "Plan",
        check: {
          result: normalized,
          findings: Array.isArray(extraPayload?.check?.findings) ? extraPayload.check.findings : []
        },
        ...extraPayload
      }
    };
  }

  if (route === "plan") {
    return {
      endpointSuffix: "/progress",
      method: "POST",
      body: {
        ...base,
        handoff: {
          selected_mode: "Plan",
          next_command: "build",
          next_mode: "Build",
          ...(extraPayload?.handoff && typeof extraPayload.handoff === "object"
            ? extraPayload.handoff
            : {})
        },
        ...extraPayload
      },
      before: {
        endpointSuffix: "/decision",
        method: "PATCH",
        body: {
          decision: "GO",
          expected_updated_at: base.expected_updated_at
        }
      }
    };
  }

  return {
    endpointSuffix: "/progress",
    method: "POST",
    body: {
      ...base,
      handoff: {
        selected_mode: "Plan",
        next_command: "plan",
        next_mode: "Plan",
        ...(extraPayload?.handoff && typeof extraPayload.handoff === "object"
          ? extraPayload.handoff
          : {})
      },
      ...extraPayload
    }
  };
}

function parsePayloadFile(payloadPath) {
  if (!payloadPath) {
    return {};
  }
  return fs.readFile(payloadPath, "utf8").then((raw) => JSON.parse(raw));
}

export async function runFlow(options) {
  const [subcommand, ...args] = options.args;

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    usage();
    return 0;
  }

  if (subcommand === "ensure-plan") {
    return await runEnsurePlan(options, args);
  }
  if (subcommand === "ready") {
    return await runReady(options, args);
  }
  if (subcommand === "apply") {
    return await runApply(options, args);
  }
  if (subcommand === "next") {
    return await runNext(options, args);
  }

  error(`Unknown flow subcommand: ${subcommand}`);
  usage();
  return 1;
}

async function resolveOrCreatePlan({ projectDir, planRef, forceNew, cwd }) {
  let selected = null;
  let created = false;
  let source = "existing";

  if (planRef) {
    selected = await resolvePlanByRef(projectDir, planRef);
    if (!selected) {
      throw new Error(`Plan not found from --plan reference: ${planRef}`);
    }
    source = "provided";
  } else {
    const plans = await loadPlans(projectDir);
    selected = selectActivePlan(plans);
  }

  if (!selected || forceNew) {
    const createdPath = await createPlanViaInit(projectDir, cwd);
    selected = await readPlanRecord(createdPath);
    created = true;
    source = "created";
  }

  return { selected, created, source };
}

async function runEnsurePlan(options, args) {
  const projectDir = resolveProjectDir(options.cwd, args);
  const planRef = readOption(args, "--plan", "");
  const forceNew = readFlag(args, "--new");
  const resolved = await resolveOrCreatePlan({
    projectDir,
    planRef,
    forceNew,
    cwd: options.cwd
  });

  const payload = {
    ok: true,
    created: resolved.created,
    source: resolved.source,
    project_dir: projectDir,
    plan_path: resolved.selected.filePath,
    plan_id: resolved.selected.planId,
    status: resolved.selected.status,
    updated_at: resolved.selected.updatedAt
  };

  info(`Plan resolved: ${payload.plan_path}`);
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

async function runReady(options, args) {
  const projectDir = resolveProjectDir(options.cwd, args);
  const planRef = readOption(args, "--plan", "");
  const forceNew = readFlag(args, "--new");
  const syncBlock = !readFlag(args, "--no-sync-block");
  const syncReady = !readFlag(args, "--no-sync-ready");
  const resolved = await resolveOrCreatePlan({
    projectDir,
    planRef,
    forceNew,
    cwd: options.cwd
  });

  async function syncBlockToPlan(reason, findings = []) {
    if (!syncBlock) {
      return;
    }
    try {
      const changed = await persistReadinessBlock(resolved.selected, reason, findings);
      if (changed) {
        console.error(`- Plan blocker context synced: ${resolved.selected.filePath}`);
      }
    } catch (err) {
      info(`Failed to sync readiness blocker to plan file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function syncReadyToPlan() {
    if (!syncReady) {
      return;
    }
    try {
      const changed = await persistReadinessReady(resolved.selected);
      if (changed) {
        resolved.selected = await readPlanRecord(resolved.selected.filePath);
        console.error(`- Plan readiness context synced: ${resolved.selected.filePath}`);
      }
    } catch (err) {
      info(`Failed to sync readiness pass to plan file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let validateResult;
  try {
    validateResult = await runNode([KFC_BIN, "plan", "validate", "--project", projectDir], options.cwd);
  } catch (err) {
    await syncBlockToPlan("kfc plan validate failed to run.", [err instanceof Error ? err.message : String(err)]);
    printReadinessBlock(projectDir, "kfc plan validate failed to run.", [
      err instanceof Error ? err.message : String(err)
    ]);
    return 1;
  }
  if (validateResult.code !== 0) {
    await syncBlockToPlan("kfc plan validate failed.", [
      "Run `kfc plan validate --project .` and fix validation errors before build."
    ]);
    printReadinessBlock(projectDir, "kfc plan validate failed.", [
      "Run `kfc plan validate --project .` and fix validation errors before build."
    ]);
    return 1;
  }

  const readiness = evaluateBuildReadinessFromLifecycle(resolved.selected);
  if (!readiness.ready) {
    await syncBlockToPlan("Plan is not build-ready.", readiness.findings);
    printReadinessBlock(projectDir, "Plan is not build-ready.", readiness.findings);
    return 1;
  }

  await syncReadyToPlan();

  const payload = {
    ok: true,
    ready: true,
    project_dir: projectDir,
    plan_path: resolved.selected.filePath,
    plan_id: resolved.selected.planId,
    decision: resolved.selected.frontmatter.decision || "",
    next_command: resolved.selected.frontmatter.next_command || "",
    next_mode: resolved.selected.frontmatter.next_mode || ""
  };
  info(`Build-ready plan confirmed: ${payload.plan_path}`);
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

async function runApply(options, args) {
  const projectDir = resolveProjectDir(options.cwd, args);
  const planRef = readOption(args, "--plan", "");
  const route = readOption(args, "--route", "").toLowerCase();
  const result = readOption(args, "--result", "").toLowerCase();
  const projectId = readOption(args, "--project-id", "");
  const baseUrl = resolveBaseUrl(args);
  const payloadPath = readOption(args, "--payload", "");

  if (!planRef) {
    throw new Error("Missing required --plan.");
  }
  if (!route) {
    throw new Error("Missing required --route.");
  }
  if (!result) {
    throw new Error("Missing required --result.");
  }

  ensureRoute(route);
  ensureResult(result);

  const planRecord = await resolvePlanByRef(projectDir, planRef);
  if (!planRecord) {
    throw new Error(`Plan not found: ${planRef}`);
  }

  await ensureApiHealth(baseUrl, projectDir);
  const extraPayload = await parsePayloadFile(payloadPath);
  const apply = createApplyPayload(route, result, planRecord, extraPayload);
  const planId = planRecord.planId;

  if (apply.before) {
    const preUrl = `${baseUrl}${apiRoute(projectId, planId, apply.before.endpointSuffix)}`;
    const preRes = await requestJson(apply.before.method, preUrl, apply.before.body);
    if (!preRes.ok) {
      const detail = preRes.json?.error || preRes.text || `HTTP ${preRes.status}`;
      throw new Error(blockMessage(projectDir, baseUrl, `Failed pre-update mutation: ${detail}`));
    }
  }

  const url = `${baseUrl}${apiRoute(projectId, planId, apply.endpointSuffix)}`;
  const res = await requestJson(apply.method, url, apply.body);
  if (!res.ok) {
    const detail = res.json?.error || res.text || `HTTP ${res.status}`;
    throw new Error(blockMessage(projectDir, baseUrl, `Failed to apply workflow update: ${detail}`));
  }

  const summary = res.json?.summary || {};
  const output = {
    ok: true,
    plan_id: planId,
    route,
    result,
    applied: res.json?.applied || [],
    next_action_human: toNextActionFromLifecycle(summary),
    next_command: summary.next_command || "unknown",
    next_mode: summary.next_mode || "unknown",
    status: summary.status || "unknown"
  };

  try {
    const refreshed = await resolvePlanByRef(projectDir, planId, true);
    if (refreshed) {
      output.phase_digest = buildPhaseDigest(refreshed);
      output.archive_gate = evaluateArchiveGate(refreshed.raw);
    }
  } catch {
    // Keep output backward-compatible if digest refresh fails.
  }

  info(`Plan updated via ${route}/${result}: ${planId}`);
  console.log(JSON.stringify(output, null, 2));
  return 0;
}

async function runNext(options, args) {
  const projectDir = resolveProjectDir(options.cwd, args);
  const planRef = readOption(args, "--plan", "");
  const style = readOption(args, "--style", "narrative");
  if (!planRef) {
    throw new Error("Missing required --plan.");
  }
  if (style !== "narrative") {
    throw new Error(`Unsupported --style: ${style}. Supported: narrative`);
  }

  const planRecord = await resolvePlanByRef(projectDir, planRef, true);
  if (!planRecord) {
    throw new Error(`Plan not found: ${planRef}`);
  }

  const nextCommand = planRecord.frontmatter.next_command || "plan";
  const nextMode = planRecord.frontmatter.next_mode || "Plan";
  const payload = {
    ok: true,
    plan_id: planRecord.planId,
    plan_path: planRecord.filePath,
    next_action_human: toNextActionFromLifecycle({ next_command: nextCommand }),
    next_command: nextCommand,
    next_mode: nextMode,
    phase_digest: buildPhaseDigest(planRecord),
    archive_gate: evaluateArchiveGate(planRecord.raw)
  };

  console.log(`Next Action: ${payload.next_action_human}`);
  console.log(`Next Command: ${payload.next_command}`);
  console.log(`Next Mode: ${payload.next_mode}`);
  return 0;
}
