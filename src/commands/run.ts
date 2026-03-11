import fs from "node:fs/promises";
import path from "node:path";
import {
  assertReadableDirectory,
  readRawConfig,
  resolveResourcesDir,
  validateConfig
} from "../lib/config.js";
import { runCodexAction } from "@kamishino/kfc-runtime/codex-runner";
import { error, info } from "../lib/logger.js";
import {
  applyLifecycleMutation,
  normalizeBlockers,
  toIsoTimestamp
} from "../lib/plan-lifecycle.js";
import { buildPreflightFailureContinuity, evaluateRouteTransition } from "../lib/flow-policy.js";
import { runFlow } from "./flow.js";
import type { FrontmatterRecord } from "../lib/plan-frontmatter.js";
import { parsePlanFrontmatter } from "../lib/plan-frontmatter.js";

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

function resolvePlansDir(projectDir) {
  return path.join(projectDir, ".local", "plans");
}

function resolveRunsDir(projectDir) {
  return path.join(projectDir, ".local", "runs");
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

function toTimestamp(value, fallback = 0) {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function readPlanRecord(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const frontmatter = parsePlanFrontmatter(raw);
  return {
    filePath,
    raw,
    frontmatter,
    planId: frontmatter.plan_id || path.basename(filePath, path.extname(filePath)),
    status: frontmatter.status || "unknown",
    updatedAt: frontmatter.updated_at || "",
    updatedAtMs: toTimestamp(frontmatter.updated_at, stat.mtimeMs)
  };
}

async function listPlanRecords(projectDir, includeDone = false) {
  const plansDir = resolvePlansDir(projectDir);
  const files = [];
  const collect = async (dirPath) => {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return;
      }
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }
      files.push(path.join(dirPath, entry.name));
    }
  };

  await collect(plansDir);
  if (includeDone) {
    await collect(path.join(plansDir, "done"));
  }

  const plans = [];
  for (const filePath of files) {
    try {
      plans.push(await readPlanRecord(filePath));
    } catch {
      // Skip unreadable plan.
    }
  }
  return plans;
}

function isDonePlan(plan) {
  const fm = plan?.frontmatter || {};
  return (
    String(fm.status || "").toLowerCase() === "done" ||
    String(fm.next_command || "").toLowerCase() === "done" ||
    String(fm.next_mode || "").toLowerCase() === "done" ||
    String(fm.lifecycle_phase || "").toLowerCase() === "done"
  );
}

function selectActivePlan(plans) {
  const active = plans.filter((item) => !isDonePlan(item));
  active.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return active[0] || null;
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

type RunCounterMap = Record<string, number>;

function incrementCounter(map: RunCounterMap, key: string) {
  const normalized = String(key || "unknown");
  map[normalized] = (map[normalized] || 0) + 1;
}

async function appendRunEvent(
  projectDir: string,
  planId: string,
  actionType: string,
  runId: string,
  routeCounters: RunCounterMap,
  guardrailCounters: RunCounterMap,
  event: Record<string, unknown>
) {
  const normalized = {
    event_type: String(event.event_type || "codex_run_event"),
    status: String(event.status || "unknown"),
    run_id: String(runId),
    plan_id: String(planId),
    action_type: String(event.action_type || actionType || "unknown"),
    source: String(event.source || "kfc-run"),
    guardrail: String(event.guardrail || "execution"),
    route_confidence: Number(event.route_confidence ?? 0),
    fallback_route: String(event.fallback_route || ""),
    selected_route: String(event.selected_route || actionType || event.action_type || "unknown"),
    recovery_step: String(event.recovery_step || ""),
    message: String(event.message || event.detail || `Route event for ${actionType}`),
    detail: String(event.detail || ""),
    updated_at: String(event.updated_at || new Date().toISOString()),
    ...(event.command ? { command: String(event.command) } : {}),
    ...(event.exit_code !== undefined ? { exit_code: Number(event.exit_code) } : {}),
    ...(event.error_code ? { error_code: String(event.error_code) } : {}),
    ...(event.error_class ? { error_class: String(event.error_class) } : {}),
    ...(event.stdout_tail ? { stdout_tail: String(event.stdout_tail) } : {}),
    ...(event.stderr_tail ? { stderr_tail: String(event.stderr_tail) } : {})
  };

  incrementCounter(routeCounters, normalized.event_type);
  incrementCounter(guardrailCounters, normalized.guardrail);

  await appendRunlog(projectDir, planId, normalized);
}

function summarizeRouteOutcome(route, planRecord) {
  const fm = planRecord?.frontmatter || {};
  const next = normalizeRoute(fm.next_command);
  const status = String(fm.status || "").toLowerCase();
  if (isDonePlan(planRecord)) {
    return { state: "SUCCESS", message: `Route ${route} completed plan.` };
  }
  if (route === "check" && next === "fix") {
    return { state: "FAIL", message: "Check returned BLOCK and moved flow to fix." };
  }
  if (route === "check" && next === "done") {
    return { state: "SUCCESS", message: "Check passed and moved flow to done." };
  }
  if (route === "build" || route === "fix") {
    if (next === "check") {
      return { state: "SUCCESS", message: "Build/Fix slice completed and moved flow to check." };
    }
  }
  if (status === "in_progress") {
    return { state: "SUCCESS", message: `Route ${route} updated plan state.` };
  }
  return { state: "IDLE", message: `Route ${route} completed without explicit handoff change.` };
}

function buildPlanSignature(planRecord) {
  const fm = planRecord?.frontmatter || {};
  return [
    String(planRecord?.updatedAt || ""),
    String(fm.lifecycle_phase || ""),
    String(fm.status || ""),
    String(fm.decision || ""),
    String(fm.next_command || ""),
    String(fm.next_mode || "")
  ].join("|");
}

async function appendRunlog(projectDir, planId, entry) {
  const runsDir = resolveRunsDir(projectDir);
  await fs.mkdir(runsDir, { recursive: true });
  const target = path.join(runsDir, `${planId}.jsonl`);
  await fs.appendFile(target, `${JSON.stringify(entry)}\n`, "utf8");
}

function formatCounterSummary(counter: RunCounterMap) {
  return Object.entries(counter)
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");
}

async function resolvePlanById(projectDir, planId, includeDone = true) {
  const plans = await listPlanRecords(projectDir, includeDone);
  return plans.find((item) => item.planId === planId) || null;
}

export async function runWorkflow(options) {
  const parsed = parseArgs(options.cwd, options.args);
  if (parsed.help) {
    usage();
    return 0;
  }

  let raw;
  try {
    raw = await readRawConfig(parsed.project);
  } catch (readErr) {
    error(`Cannot read config: ${readErr.message}`);
    error("Run `kfc init` first.");
    return 1;
  }

  const validationErrors = validateConfig(raw.data);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    return 1;
  }

  const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
  try {
    await assertReadableDirectory(resourcesDir);
  } catch (dirErr) {
    error(`Resources directory is not usable: ${dirErr.message}`);
    return 1;
  }

  const ensurePlanCode = await runFlow({
    cwd: parsed.project,
    args: ["ensure-plan", "--project", parsed.project]
  });
  if (ensurePlanCode !== 0) {
    error("Run guardrail failed: `kfc flow ensure-plan` did not succeed.");
    return ensurePlanCode;
  }

  if (!parsed.skipReady) {
    const readyCode = await runFlow({
      cwd: parsed.project,
      args: ["ready", "--project", parsed.project]
    });
    if (readyCode !== 0) {
      error("Run guardrail failed: plan is not build-ready. Fix the plan before running implementation.");
      return readyCode;
    }
  } else {
    info("Skipping build-readiness gate (--skip-ready).");
  }

  info("Run guardrails passed.");
  info(`Provider: ${raw.data.workflow.defaultProvider}`);
  info(`Profile: ${raw.data.workflow.profile ?? "default"}`);
  info(`Resources: ${resourcesDir}`);

  const activePlans = await listPlanRecords(parsed.project, false);
  let activePlan = selectActivePlan(activePlans);
  if (!activePlan) {
    error("No active plan found after guardrails. Run `kfc flow ensure-plan --project .`.");
    return 1;
  }

  const routeEventCounts: RunCounterMap = {};
  const guardrailCounts: RunCounterMap = {};
  let completedSteps = 0;
  const emitRouteHealthSummary = async (finalStatus: string, finalMessage = "") => {
    runOutcome = finalStatus;
    outcomeMessage = finalMessage || runOutcome;
    const summary = {
      event_type: "route_health_summary",
      status: runOutcome,
      action_type: "run",
      source: "kfc-run",
      guardrail: "route_health",
      route_confidence: 5,
      selected_route: currentRoute || "unknown",
      fallback_route: normalizeRoute(activePlan?.frontmatter?.next_command) || "",
      recovery_step: "",
      message: outcomeMessage,
      detail: compactText(
        [
          `plan_id=${activePlan?.planId || "unknown"}`,
          `events=[${formatCounterSummary(routeEventCounts) || "none"}]`,
          `guards=[${formatCounterSummary(guardrailCounts) || "none"}]`,
          `runtime_steps=${completedSteps}`,
          `next_route=${normalizeRoute(activePlan?.frontmatter?.next_command) || "unknown"}`
        ].join(" | "),
        1200
      )
    };

    await appendRunEvent(
      parsed.project,
      activePlan.planId,
      "run",
      runId,
      routeEventCounts,
      guardrailCounts,
      summary
    );
  };

  const runId = `run_${Date.now()}`;
  let currentRoute = parsed.route || normalizeRoute(activePlan.frontmatter.next_command) || "plan";
  let previousPlanSignature = buildPlanSignature(activePlan);
  let lastOutcomeMessage = "";
  let runOutcome = "unknown";
  let outcomeMessage = "";

  info(`Run orchestrator started: plan=${activePlan.planId}, route=${currentRoute}, max_steps=${parsed.maxSteps}`);
  for (let step = 1; step <= parsed.maxSteps; step += 1) {
    if (currentRoute === "done") {
      info("Plan already resolved to done.");
      await emitRouteHealthSummary("completed", "plan already done");
      return 0;
    }
    completedSteps = step;

    const preflight = evaluateRouteTransition(activePlan, currentRoute);
    if (!preflight.ok) {
      const failureContinuity = buildPreflightFailureContinuity(currentRoute, preflight, {
        nextStep: preflight.fallback_route
          ? `Expected route: ${preflight.fallback_route}`
          : "Align plan handoff in plan frontmatter then rerun."
      });
      await persistPlanRunContinuity(activePlan, {
        route: currentRoute,
        route_confidence: Number(failureContinuity.frontmatter.route_confidence),
        flow_guardrail: failureContinuity.frontmatter.flow_guardrail,
        selected_mode: failureContinuity.frontmatter.selected_mode,
        lifecycle_phase: failureContinuity.frontmatter.lifecycle_phase,
        next_mode: failureContinuity.frontmatter.next_mode,
        next_command: failureContinuity.frontmatter.next_command,
        wip_status: failureContinuity.wip.status,
        wip_blockers: failureContinuity.wip.blockers,
        next_step: failureContinuity.wip.next_step
      });

      if (preflight.route_confidence < 4 && preflight.fallback_route && preflight.fallback_route !== currentRoute) {
        await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
          event_type: "runlog_updated",
          status: "reroute",
          action_type: currentRoute,
          source: "kfc-run",
          guardrail: preflight.guardrail || "transition_guard",
          route_confidence: preflight.route_confidence,
          fallback_route: preflight.fallback_route,
          selected_route: currentRoute,
          recovery_step: preflight.recovery || "",
          message: `REROUTE ${currentRoute.toUpperCase()} -> ${String(preflight.fallback_route).toUpperCase()}`,
          detail: compactText(preflight.reason || "Route confidence below threshold.", 500),
          updated_at: new Date().toISOString()
        });
        currentRoute = normalizeRoute(preflight.fallback_route) || "plan";
        continue;
      }

      await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
        event_type: "codex_run_failed",
        status: "blocked",
        action_type: currentRoute,
        source: "kfc-run",
        error_code: preflight.error_code || "FLOW_GUARD_BLOCKED",
        guardrail: preflight.guardrail || "transition_guard",
        route_confidence: preflight.route_confidence,
        fallback_route: preflight.fallback_route || "",
        selected_route: currentRoute,
        recovery_step: preflight.recovery || "",
        message: compactText(preflight.reason || "Flow guardrail blocked route execution.", 140),
        detail: compactText(preflight.recovery || preflight.reason || "", 600),
        updated_at: new Date().toISOString()
      });
      error(`Flow guardrail blocked route ${currentRoute} (${preflight.error_code || "FLOW_GUARD_BLOCKED"}).`);
      if (preflight.recovery) {
        error(`Recovery: ${preflight.recovery}`);
      }
      await emitRouteHealthSummary("blocked", `Flow guardrail blocked: ${preflight.error_code || "FLOW_GUARD_BLOCKED"}`);
      return 1;
    }

    await persistPlanRunContinuity(activePlan, {
      route: currentRoute,
      route_confidence: preflight.route_confidence,
      flow_guardrail: preflight.guardrail || "route_alignment",
      wip_status: "Running",
      wip_blockers: "None",
      next_step: "Observe Codex output, then review plan handoff in next step."
    });

    await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
      event_type: "codex_run_started",
      status: "started",
      action_type: currentRoute,
      source: "kfc-run",
      guardrail: preflight.guardrail || "route_alignment",
      route_confidence: preflight.route_confidence,
      fallback_route: preflight.fallback_route || "",
      selected_route: currentRoute,
      recovery_step: "",
      message: `RUNNING ${currentRoute.toUpperCase()}`,
      detail: `step ${step}/${parsed.maxSteps}`,
      updated_at: new Date().toISOString()
    });

    const prompt = buildRoutePrompt({
      route: currentRoute,
      planRecord: activePlan,
      projectDir: parsed.project,
      step,
      maxSteps: parsed.maxSteps
    });

    const actionResult = await runCodexAction({
      plan_id: activePlan.planId,
      action_type: currentRoute,
      mode_hint: modeHintForRoute(currentRoute),
      prompt,
      run_id: runId,
      timeout_ms: parsed.timeoutMs
    });

    if (actionResult.status !== "completed") {
      await persistPlanRunContinuity(activePlan, {
        route: currentRoute,
        route_confidence: preflight.route_confidence,
        flow_guardrail: preflight.guardrail || "execution",
        wip_status: "Route execution failed",
        wip_blockers: normalizeBlockers(actionResult.failure_signature || `Route ${currentRoute} failed`, [
          actionResult.error_code || "unknown",
          actionResult.recovery_hint || ""
        ]),
        next_step: actionResult.recovery_hint ? `Run: ${actionResult.recovery_hint}` : "Retry route with corrected context."
      });

      await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
        event_type: "codex_run_failed",
        status: "failed",
        action_type: currentRoute,
        source: "kfc-run",
        command: actionResult.command,
        exit_code: actionResult.exit_code,
        error_code: actionResult.error_code,
        error_class: actionResult.error_class || "unknown",
        recovery_hint: actionResult.recovery_hint || "",
        guardrail: preflight.guardrail || "execution",
        route_confidence: preflight.route_confidence,
        fallback_route: preflight.fallback_route || "",
        selected_route: currentRoute,
        recovery_step: actionResult.recovery_hint || "",
        stderr_tail: actionResult.stderr_tail || "",
        stdout_tail: actionResult.stdout_tail || "",
        message: compactText(actionResult.failure_signature || `${currentRoute} failed`, 120),
        detail: compactText(actionResult.stderr_tail || actionResult.stdout_tail || "", 600),
        updated_at: new Date().toISOString()
      });
      error(`Route ${currentRoute} failed (${actionResult.error_code || "UNKNOWN"}).`);
      if (actionResult.recovery_hint) {
        error(`Recovery: ${actionResult.recovery_hint}`);
      }
      await emitRouteHealthSummary("blocked", `Route ${currentRoute} failed.`);
      return 1;
    }

    const refreshed = await resolvePlanById(parsed.project, activePlan.planId, true);
    if (refreshed) {
      activePlan = refreshed;
    }
    const outcome = summarizeRouteOutcome(currentRoute, activePlan);
    lastOutcomeMessage = outcome.message;
    await persistPlanRunContinuity(activePlan, {
      route: currentRoute,
      route_confidence: preflight.route_confidence,
      flow_guardrail: preflight.guardrail || "route_alignment",
      wip_status: outcome.state === "FAIL" ? "Route completed with findings" : `Route ${currentRoute} completed`,
      wip_blockers: outcome.state === "FAIL" ? "Known issues detected." : "None",
      next_step: `Next route: ${normalizeRoute(activePlan?.frontmatter?.next_command) || "plan"}`
    });

    await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
      event_type: outcome.state === "FAIL" ? "codex_run_failed" : "codex_run_completed",
      status: outcome.state === "FAIL" ? "blocked" : "completed",
      action_type: currentRoute,
      source: "kfc-run",
      command: actionResult.command,
      exit_code: actionResult.exit_code,
      guardrail: preflight.guardrail || "route_alignment",
      route_confidence: preflight.route_confidence,
      fallback_route: preflight.fallback_route || "",
      selected_route: currentRoute,
      recovery_step: "",
      stderr_tail: actionResult.stderr_tail || "",
      stdout_tail: actionResult.stdout_tail || "",
      message: outcome.message,
      detail: compactText(actionResult.stdout_tail || actionResult.stderr_tail || "", 600),
      updated_at: new Date().toISOString()
    });

    info(`Step ${step}/${parsed.maxSteps}: ${currentRoute} -> ${outcome.message}`);
    if (isDonePlan(activePlan)) {
      info(`Run completed: ${activePlan.planId} is done.`);
      await emitRouteHealthSummary("done", `Run completed plan ${activePlan.planId}.`);
      return 0;
    }

    const nextRoute = normalizeRoute(activePlan.frontmatter.next_command) || "plan";
    if (currentRoute === "check" && nextRoute === "fix") {
      error("Check route returned BLOCK. Stop run loop and continue with fix.");
      await emitRouteHealthSummary("blocked", "Check route returned BLOCK and moved flow to fix.");
      return 2;
    }

    const signature = buildPlanSignature(activePlan);
    if (signature === previousPlanSignature) {
      await persistPlanRunContinuity(activePlan, {
        route: currentRoute,
        route_confidence: 2,
        flow_guardrail: "loop_guard",
        wip_status: "Flow stalled",
        wip_blockers: normalizeBlockers("Plan state did not advance after route execution.", [
          `route=${currentRoute}`,
          `next=${nextRoute || "unknown"}`,
          "signal=FLOW_STALLED_NO_ADVANCE"
        ]),
        next_step: "Run `kfc flow ensure-plan --project .` then `kfc flow ready --project .` before rerun."
      });

      const failureMessage = normalizeBlockers("Plan state did not advance after route execution.", [
        `route=${currentRoute}`,
        `next=${nextRoute || "unknown"}`,
        "signal=FLOW_STALLED_NO_ADVANCE"
      ]);
      await appendRunEvent(parsed.project, activePlan.planId, currentRoute, runId, routeEventCounts, guardrailCounts, {
        event_type: "codex_run_failed",
        status: "blocked",
        action_type: currentRoute,
        source: "kfc-run",
        error_code: "FLOW_STALLED_NO_ADVANCE",
        guardrail: "loop_guard",
        route_confidence: 2,
        fallback_route: nextRoute || "plan",
        selected_route: currentRoute,
        recovery_step: "Run `kfc flow ensure-plan --project .` then `kfc flow ready --project .` before rerun.",
        message: "Flow stalled: no plan-state advance",
        detail: compactText(failureMessage, 600),
        updated_at: new Date().toISOString()
      });
      error("Plan state did not advance after route execution. Stopping to avoid loop.");
      error("Recovery: Run `kfc flow ensure-plan --project .` then `kfc flow ready --project .` before rerun.");
      await emitRouteHealthSummary("blocked", "Plan state stalled without advancement.");
      return 1;
    }

    previousPlanSignature = signature;
    currentRoute = nextRoute;
  }

  error(`Reached max steps (${parsed.maxSteps}) before completion.`);
  if (lastOutcomeMessage) {
    error(`Last outcome: ${lastOutcomeMessage}`);
  }
  info(`Next command from plan: ${activePlan.frontmatter.next_command || "plan"}`);
  await emitRouteHealthSummary("blocked", `Reached max steps (${parsed.maxSteps}) before completion.`);
  return 1;
}
