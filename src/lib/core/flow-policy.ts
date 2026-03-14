const VALID_ROUTES = Object.freeze(["start", "plan", "build", "check", "fix", "research", "done"]);
const VALID_GUARDRAILS = Object.freeze([
  "route_selection",
  "completion_gate",
  "mode_guard",
  "readiness_gate",
  "route_alignment",
  "transition_guard",
  "execution",
  "loop_guard"
]);
const DEFAULT_GUARDRAIL = "transition_guard";

type PlanFrontmatter = Record<string, string>;

type PlanRecord = {
  frontmatter?: PlanFrontmatter;
};

export type FlowPolicyPreflight = {
  ok: boolean;
  error_code: string;
  route_confidence: number;
  fallback_route: string;
  guardrail: (typeof VALID_GUARDRAILS)[number];
  reason: string;
  recovery: string;
};

export type FlowPlanMutations = {
  frontmatter: Record<string, string>;
  wip: {
    status: string;
    blockers: string;
    next_step: string;
  };
};

function normalizeRoute(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_ROUTES.includes(normalized) ? normalized : "";
}

function normalizeMode(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "build") {
    return "build";
  }
  if (normalized === "plan") {
    return "plan";
  }
  return normalized;
}

function routeModeFor(route: string) {
  const normalized = normalizeRoute(route);
  if (normalized === "build" || normalized === "fix") {
    return "build";
  }
  if (normalized === "done") {
    return "done";
  }
  return "plan";
}

function fallbackRouteFromNext(nextCommand: string) {
  if (!nextCommand || nextCommand === "done") {
    return "plan";
  }
  if (nextCommand === "build" || nextCommand === "fix") {
    return "plan";
  }
  if (nextCommand === "check") {
    return "fix";
  }
  return "plan";
}

function normalizeBlockers(reason: string, findings: string[] = []) {
  const parts = [reason, ...findings]
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

function toIsoTimestamp() {
  return new Date().toISOString();
}

function isPlanDone(planRecord: PlanRecord | null | undefined) {
  const fm = planRecord?.frontmatter || {};
  return (
    String(fm.decision || "").toLowerCase() === "done" ||
    String(fm.status || "").toLowerCase() === "done" ||
    String(fm.next_command || "").toLowerCase() === "done" ||
    String(fm.next_mode || "").toLowerCase() === "done" ||
    String(fm.lifecycle_phase || "").toLowerCase() === "done"
  );
}

export function evaluateRouteTransition(planRecord: PlanRecord | null | undefined, route: string): FlowPolicyPreflight {
  const fm = planRecord?.frontmatter || {};
  const selectedMode = normalizeMode(fm.selected_mode);
  const nextCommand = normalizeRoute(fm.next_command);
  const lifecyclePhase = normalizeRoute(fm.lifecycle_phase);
  const targetRoute = normalizeRoute(route);
  const fallbackRoute = fallbackRouteFromNext(nextCommand || targetRoute);
  const done = targetRoute === "done" || nextCommand === "done" || lifecyclePhase === "done" || isPlanDone(planRecord);

  if (!targetRoute) {
    return {
      ok: false,
      error_code: "ROUTE_INVALID",
      route_confidence: 1,
      fallback_route: fallbackRoute,
      guardrail: "route_selection",
      reason: "Route is missing or invalid.",
      recovery: "Set a valid next route in plan frontmatter and rerun."
    };
  }

  if (done && targetRoute !== "done") {
    return {
      ok: false,
      error_code: "PLAN_ALREADY_DONE",
      route_confidence: 1,
      fallback_route: "done",
      guardrail: "completion_gate",
      reason: "Plan is already done and should not execute additional routes.",
      recovery: "Create or select a non-done active plan."
    };
  }

  const routeMode = routeModeFor(targetRoute);
  if (selectedMode && routeMode && selectedMode !== routeMode && selectedMode !== "done") {
    return {
      ok: false,
      error_code: "MODE_MISMATCH",
      route_confidence: 2,
      fallback_route: "plan",
      guardrail: "mode_guard",
      reason: `selected_mode=${selectedMode} is incompatible with route=${targetRoute}.`,
      recovery: "Switch mode/route handoff in plan frontmatter before execution."
    };
  }

  if ((targetRoute === "build" || targetRoute === "fix") && nextCommand === "build") {
    return {
      ok: false,
      route_confidence: 2,
      error_code: "BUILD_NOT_READY",
      fallback_route: "plan",
      guardrail: "readiness_gate",
      reason: "Build route requested while plan readiness was not validated. Check build gate requirements.",
      recovery: "Run planning route to satisfy decision/readiness gates before build/fix."
    };
  }

  if (!nextCommand || nextCommand === targetRoute) {
    return {
      ok: true,
      error_code: "",
      route_confidence: 5,
      fallback_route: "",
      guardrail: "route_alignment",
      reason: "Route aligns with plan handoff.",
      recovery: ""
    };
  }

  if (targetRoute === "check" && (nextCommand === "fix" || nextCommand === "done")) {
    return {
      ok: true,
      error_code: "",
      route_confidence: 4,
      fallback_route: "",
      guardrail: "route_alignment",
      reason: "Check rerun is allowed for verification continuity.",
      recovery: ""
    };
  }

  return {
    ok: false,
    error_code: "FLOW_TRANSITION_BLOCKED",
    route_confidence: 3,
    fallback_route: fallbackRoute,
    guardrail: "transition_guard",
    reason: `Route ${targetRoute} does not match expected next_command ${nextCommand || "unknown"}.`,
    recovery: `Run the expected route \`${nextCommand || fallbackRoute}\` or update plan handoff fields first.`
  };
}

export function buildPlanContinuityMutation({
  route,
  decision,
  status,
  blockers,
  nextStep,
  overrides
}: {
  route: string;
  decision: FlowPolicyPreflight;
  status: string;
  blockers?: string;
  nextStep?: string;
  overrides?: {
    selected_mode?: string;
    lifecycle_phase?: string;
    next_command?: string;
    next_mode?: string;
    route_confidence?: number;
    flow_guardrail?: string;
  };
}): FlowPlanMutations {
  const targetRoute = normalizeRoute(route);
  const effectiveMode = overrides?.selected_mode || (targetRoute === "build" || targetRoute === "fix" ? "Build" : "Plan");
  const effectivePhase =
    overrides?.lifecycle_phase ||
    (targetRoute === "build" || targetRoute === "fix" ? "build" : targetRoute === "check" ? "check" : targetRoute === "done" ? "done" : "plan");
  const confidence = overrides?.route_confidence ?? decision.route_confidence;
  const guardrail = overrides?.flow_guardrail || decision.guardrail || DEFAULT_GUARDRAIL;

  return {
    frontmatter: {
      updated_at: toIsoTimestamp(),
      route_confidence: String(confidence),
      flow_guardrail: String(guardrail),
      selected_mode: effectiveMode,
      lifecycle_phase: effectivePhase,
      ...(typeof overrides?.next_mode === "string" ? { next_mode: overrides.next_mode } : {}),
      ...(typeof overrides?.next_command === "string" ? { next_command: overrides.next_command } : {})
    },
    wip: {
      status,
      blockers: blockers || "None",
      next_step: nextStep || `Expected route: ${decision.fallback_route || "plan"}`
    }
  };
}

export function buildReadinessBlockPayload(reason: string, findings: string[] = []) {
  return {
    frontmatter: {
      decision: "NO_GO",
      status: "in_progress",
      lifecycle_phase: "build",
      selected_mode: "Build",
      next_command: "plan",
      next_mode: "Plan",
      route_confidence: "2",
      flow_guardrail: "readiness_gate"
    },
    wip: {
      status: "Blocked at build-readiness gate",
      blockers: normalizeBlockers(`Flow ready check blocked: ${reason}`, findings),
      next_step: "Run $kamiflow-core plan to resolve blockers, then rerun $kamiflow-core build."
    }
  };
}

export function buildReadinessReadyPayload() {
  return {
    frontmatter: {
      lifecycle_phase: "build",
      selected_mode: "Build",
      route_confidence: "5",
      flow_guardrail: "readiness_pass"
    },
    wip: {
      status: "Build-readiness gate passed",
      blockers: "None",
      next_step: "Run $kamiflow-core build and execute one concrete task slice."
    }
  };
}

export function buildPreflightFailureContinuity(route: string, decision: FlowPolicyPreflight, options?: { nextStep?: string }) {
  const routeConfident = decision.route_confidence;
  const blockers = normalizeBlockers("Flow guardrail blocked", [decision.reason || "", decision.recovery || ""]);
  return buildPlanContinuityMutation({
    route,
    decision,
    status: routeConfident < 4 ? "Reroute needed" : "Blocked by guardrail",
    blockers,
    nextStep:
      options?.nextStep ||
      `Run expected route: ${decision.fallback_route || "plan"} or update handoff in plan frontmatter.`,
    overrides: {
      selected_mode: routeModeFor(route) === "build" ? "Build" : "Plan",
      lifecycle_phase: route === "done" ? "done" : route === "check" ? "check" : route === "build" || route === "fix" ? "build" : "plan",
      route_confidence: routeConfident,
      flow_guardrail: decision.guardrail || DEFAULT_GUARDRAIL
    }
  });
}
