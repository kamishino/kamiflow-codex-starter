import fs from "node:fs/promises";
import path from "node:path";
import {
  createPlanWorkspace,
  isDonePlan,
  resolveRunsDir,
  selectActivePlan
} from "@kamishino/kfc-runtime/plan-workspace";
import {
  assertReadableDirectory,
  readConfigOrDefault,
  resolveResourcesDir,
  validateConfig
} from "../../lib/core/config.js";
import { runCodexAction } from "@kamishino/kfc-runtime/codex-runner";
import { error, info } from "../../lib/core/logger.js";
import {
  applyLifecycleMutation,
  normalizeBlockers,
  toIsoTimestamp
} from "../../lib/plan/plan-lifecycle.js";
import { buildPreflightFailureContinuity, evaluateRouteTransition } from "../../lib/flow-policy.js";
import { runFlow } from "./flow.js";
import { parsePlanFrontmatter } from "../../lib/plan/plan-frontmatter.js";

const VALID_ROUTES = new Set(["start", "plan", "build", "check", "fix", "research"]);
const DEFAULT_MAX_STEPS = 6;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
type RunArgs = {
  project: string;
  skipReady: boolean;
  route: string;
  maxSteps: number;
  timeoutMs: number;
  help?: boolean;
};

function usage() {
  info("Usage: kfc run [--project <path>] [--skip-ready] [--route <route>] [--max-steps <n>] [--timeout-ms <n>]");
  info("Examples:");
  info("  kfc run");
  info("  kfc run --project .");
  info("  kfc run --project . --skip-ready");
  info("  kfc run --project . --route build --max-steps 4");
}

function parseArgs(baseCwd: string, args: string[]): RunArgs {
  const parsed: RunArgs = {
    project: baseCwd,
    skipReady: false,
    route: "",
    maxSteps: DEFAULT_MAX_STEPS,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--project") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --project.");
      }
      parsed.project = path.resolve(baseCwd, value);
      i += 1;
      continue;
    }
    if (token === "--skip-ready") {
      parsed.skipReady = true;
      continue;
    }
    if (token === "--route") {
      const value = String(args[i + 1] || "").toLowerCase();
      if (!value) {
        throw new Error("Missing value for --route.");
      }
      if (!VALID_ROUTES.has(value)) {
        throw new Error(`Invalid --route value: ${value}.`);
      }
      parsed.route = value;
      i += 1;
      continue;
    }
    if (token === "--max-steps") {
      const value = Number(args[i + 1] || "");
      if (!Number.isInteger(value) || value <= 0 || value > 20) {
        throw new Error("Invalid --max-steps value. Use integer range 1..20.");
      }
      parsed.maxSteps = value;
      i += 1;
      continue;
    }
    if (token === "--timeout-ms") {
      const value = Number(args[i + 1] || "");
      if (!Number.isInteger(value) || value < 1000 || value > 30 * 60 * 1000) {
        throw new Error("Invalid --timeout-ms value. Use integer range 1000..1800000.");
      }
      parsed.timeoutMs = value;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { ...parsed, help: true };
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

function normalizeRoute(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["start", "plan", "build", "check", "fix", "research", "done"].includes(normalized)
    ? normalized
    : "";
}

function routeModeForPlan(route) {
  const normalized = normalizeRoute(route);
  if (normalized === "build" || normalized === "fix") {
    return "Build";
  }
  return "Plan";
}

function lifecyclePhaseForRoute(route) {
  const normalized = normalizeRoute(route);
  if (!normalized) {
    return "plan";
  }
  if (normalized === "done") {
    return "done";
  }
  if (normalized === "build" || normalized === "fix") {
    return "build";
  }
  if (normalized === "check") {
    return "check";
  }
  if (["research", "start", "plan"].includes(normalized)) {
    return normalized;
  }
  return "plan";
}

function modeHintForRoute(route) {
  if (route === "build" || route === "fix") {
    return "Build";
  }
  return "Plan";
}

async function persistPlanRunContinuity(planRecord, options) {
  if (!planRecord?.filePath) {
    return false;
  }

  const currentRaw = await fs.readFile(planRecord.filePath, "utf8");
  const mutation = {
    frontmatter: {
      updated_at: toIsoTimestamp(),
      route_confidence: String(options.route_confidence ?? ""),
      flow_guardrail: String(options.flow_guardrail || ""),
      selected_mode: options.selected_mode || routeModeForPlan(options.route),
      lifecycle_phase: lifecyclePhaseForRoute(options.route),
      ...(typeof options.next_mode === "string" ? { next_mode: options.next_mode } : {}),
      ...(typeof options.next_command === "string" ? { next_command: options.next_command } : {})
    },
    wip: {
      status: options.wip_status || "",
      blockers: options.wip_blockers || "None",
      next_step: options.next_step || ""
    }
  };
  const next = applyLifecycleMutation(currentRaw, mutation);
  if (next === currentRaw) {
    return false;
  }
  await fs.writeFile(planRecord.filePath, next, "utf8");
  return true;
}

function buildRoutePrompt({ route, planRecord, projectDir, step, maxSteps }) {
  return [
    `$kamiflow-core ${route} using active plan ${planRecord.planId}.`,
    `Project: ${projectDir}`,
    `Plan file: ${planRecord.filePath}`,
    `Run step: ${step}/${maxSteps}`,
    "Follow AGENTS.md and plan lifecycle rules.",
    "Execute only this route and update the plan markdown directly (frontmatter + WIP + checklist evidence).",
    "Return concise State, Doing, Next.",
    "If route is build/fix/check, include: Check: PASS or Check: BLOCK with concrete evidence."
  ].join("\n");
}

function compactText(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeRoutePhase(value, fallbackAction = "") {
  const explicit = String(value || "").trim();
  if (explicit) {
    return explicit;
  }
  const normalizedAction = String(fallbackAction || "").trim().toLowerCase();
  if (normalizedAction === "start") {
    return "Brainstorm";
  }
  if (["plan", "research"].includes(normalizedAction)) {
    return "Plan";
  }
  if (["build", "fix"].includes(normalizedAction)) {
    return "Build";
  }
  if (normalizedAction === "check") {
    return "Check";
  }
  return "Plan";
}

function buildRunSummary({ step, maxSteps, route, responseText }) {
  const text = String(responseText || "").trim();
  const firstLine = compactText(text.split(/\r?\n/).find((line) => line.trim().length > 0) || "No response.");
  return `Step ${step}/${maxSteps} [${route}] ${firstLine}`;
}

function buildJsonlEvent(event) {
  return `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
}

async function appendRunLog(runsDir, planId, event) {
  const filePath = path.join(runsDir, `${planId}.jsonl`);
  await fs.mkdir(runsDir, { recursive: true });
  await fs.appendFile(filePath, buildJsonlEvent(event), "utf8");
  return filePath;
}

async function ensurePlanWorkspace(projectDir) {
  return await createPlanWorkspace(projectDir);
}

async function resolveActivePlan(projectDir) {
  const workspace = await ensurePlanWorkspace(projectDir);
  const planRecord = await selectActivePlan(workspace);
  if (!planRecord) {
    return null;
  }
  if (isDonePlan(planRecord)) {
    return null;
  }
  return planRecord;
}

async function readProjectConfig(projectDir) {
  const raw = await readConfigOrDefault(projectDir);
  const validationErrors = validateConfig(raw.data);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" | "));
  }
  const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
  await assertReadableDirectory(resourcesDir);
  return {
    ...raw,
    resourcesDir
  };
}

async function ensureReady(projectDir) {
  const ensurePlanCode = await runFlow({
    cwd: projectDir,
    args: ["ensure-plan", "--project", projectDir]
  });
  if (ensurePlanCode !== 0) {
    error("Run guardrail failed: `kfc flow ensure-plan` did not succeed.");
    return false;
  }
  return true;
}

function buildRouteCommand(route, projectDir) {
  return route
    ? `kfc run --project ${projectDir} --route ${route}`
    : `kfc run --project ${projectDir}`;
}

async function readPlanStatus(planPath) {
  const raw = await fs.readFile(planPath, "utf8");
  const frontmatter = parsePlanFrontmatter(raw);
  return {
    status: String(frontmatter.status || "").trim().toLowerCase(),
    decision: String(frontmatter.decision || "").trim().toUpperCase(),
    next_command: String(frontmatter.next_command || "").trim(),
    next_mode: String(frontmatter.next_mode || "").trim(),
    route_confidence: String(frontmatter.route_confidence || "").trim(),
    flow_guardrail: String(frontmatter.flow_guardrail || "").trim(),
    frontmatter
  };
}

async function markPostRunProgress(planRecord, route, responseText) {
  const raw = await fs.readFile(planRecord.filePath, "utf8");
  const frontmatter = parsePlanFrontmatter(raw);
  const normalizedRoute = normalizeRoute(route || frontmatter.next_command || "");
  const continuity = evaluateRouteTransition({
    requestedRoute: normalizedRoute || "plan",
    routeConfidence: 5,
    readiness: { buildReady: true, reasons: [] },
    mode: modeHintForRoute(normalizedRoute || "plan")
  });

  await persistPlanRunContinuity(planRecord, {
    route: normalizedRoute || "plan",
    route_confidence: continuity.routeConfidence,
    flow_guardrail: continuity.guardrail,
    next_mode: frontmatter.next_mode || modeHintForRoute(normalizedRoute || "plan"),
    next_command: frontmatter.next_command || normalizedRoute || "plan",
    wip_status: buildRunSummary({
      step: 1,
      maxSteps: 1,
      route: normalizedRoute || "plan",
      responseText
    }),
    wip_blockers: normalizeBlockers([]),
    next_step: frontmatter.next_command || "Run check validations before closing the slice."
  });
}

export async function runWorkflow(options) {
  let parsed;
  try {
    parsed = parseArgs(options.cwd, options.args);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    usage();
    return 1;
  }

  if (parsed.help) {
    usage();
    return 0;
  }

  let raw;
  try {
    raw = await readConfigOrDefault(parsed.project);
  } catch (readErr) {
    error(`Cannot resolve project config: ${readErr.message}`);
    return 1;
  }

  const validationErrors = validateConfig(raw.data);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    return 1;
  }

  try {
    const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
    await assertReadableDirectory(resourcesDir);
  } catch (err) {
    error(`Resources directory check failed: ${err.message}`);
    return 1;
  }

  if (!parsed.skipReady) {
    const ready = await ensureReady(parsed.project);
    if (!ready) {
      return 1;
    }
  }

  const planRecord = await resolveActivePlan(parsed.project);
  if (!planRecord) {
    error("No active plan found after guardrails. Run `kfc flow ensure-plan`.");
    return 1;
  }

  const planStatus = await readPlanStatus(planRecord.filePath);
  const route = parsed.route || normalizeRoute(planStatus.next_command) || "plan";
  const mode = modeHintForRoute(route);
  const readiness = evaluateRouteTransition({
    requestedRoute: route,
    routeConfidence: 5,
    readiness: { buildReady: true, reasons: [] },
    mode
  });

  if (!readiness.allowed) {
    const continuity = buildPreflightFailureContinuity({
      route,
      routeConfidence: 5,
      buildReadinessReasons: readiness.reasons,
      fallbackRoute: readiness.fallbackRoute || "plan"
    });
    await persistPlanRunContinuity(planRecord, {
      route,
      route_confidence: continuity.routeConfidence,
      flow_guardrail: continuity.guardrail,
      next_mode: continuity.nextMode,
      next_command: continuity.nextCommand,
      wip_status: "Run blocked by flow guardrails.",
      wip_blockers: normalizeBlockers(readiness.reasons),
      next_step: "Run `kfc flow ensure-plan` then `kfc flow ready` before rerun."
    });
    error(`Route ${route} is not allowed: ${readiness.reason}`);
    error("Recovery: Run `kfc flow ensure-plan` then `kfc flow ready` before rerun.");
    return 1;
  }

  const runsDir = resolveRunsDir(parsed.project);
  const logPath = await appendRunLog(runsDir, planRecord.planId, {
    event_type: "run_started",
    action_type: "workflow",
    route,
    mode,
    max_steps: parsed.maxSteps,
    timeout_ms: parsed.timeoutMs,
    plan_id: planRecord.planId,
    plan_path: planRecord.filePath,
    summary: `Starting ${route} route`
  });
  info(`Run log: ${logPath}`);

  const prompt = buildRoutePrompt({
    route,
    planRecord,
    projectDir: parsed.project,
    step: 1,
    maxSteps: parsed.maxSteps
  });

  const result = await runCodexAction({
    cwd: parsed.project,
    prompt,
    fullAuto: false,
    timeoutMs: parsed.timeoutMs,
    additionalWritableRoots: []
  });

  const responseText = String(result?.stdout || result?.message || "").trim();
  await appendRunLog(runsDir, planRecord.planId, {
    event_type: "run_completed",
    action_type: "workflow",
    route,
    mode,
    plan_id: planRecord.planId,
    plan_path: planRecord.filePath,
    exit_code: result?.exitCode ?? 0,
    summary: buildRunSummary({ step: 1, maxSteps: parsed.maxSteps, route, responseText }),
    response_preview: compactText(responseText, 600)
  });

  await markPostRunProgress(planRecord, route, responseText);

  if (result?.exitCode && result.exitCode !== 0) {
    error(`Run failed with exit code ${result.exitCode}.`);
    return result.exitCode;
  }

  info(responseText || `Completed route ${route}.`);
  return 0;
}
