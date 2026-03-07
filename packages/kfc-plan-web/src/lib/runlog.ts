import fs from "node:fs/promises";
import path from "node:path";

export type RunlogState = "RUNNING" | "SUCCESS" | "FAIL" | "IDLE";

export interface RunlogSignal {
  plan_id: string;
  event_type: "runlog_started" | "runlog_completed" | "runlog_failed" | "runlog_updated";
  run_state: RunlogState;
  action_type?: string;
  status?: string;
  run_id?: string;
  phase?: string;
  source: string;
  message: string;
  detail: string;
  evidence?: string;
  guardrail?: string;
  route_confidence?: number;
  fallback_route?: string;
  selected_route?: string;
  recovery_step?: string;
  onboarding_status?: string;
  onboarding_stage?: string;
  onboarding_error_code?: string;
  onboarding_recovery?: string;
  onboarding_next?: string;
}

function compactLine(value: string, max = 200): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function lastNonEmptyLine(value: string): string {
  const lines = String(value || "").split(/\r?\n/);
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const line = lines[idx]?.trim();
    if (line) {
      return line;
    }
  }
  return "";
}

function parseLastJsonLine(value: string): Record<string, any> | null {
  const lines = String(value || "").split(/\r?\n/);
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const line = lines[idx]?.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, any>;
      }
    } catch {
      // keep scanning previous lines
    }
  }
  return null;
}

function mapActionToPhase(actionType: string | undefined): string | undefined {
  const normalized = String(actionType || "").toLowerCase();
  if (normalized === "start") return "Brainstorm";
  if (normalized === "plan" || normalized === "research") return "Plan";
  if (normalized === "build" || normalized === "fix") return "Build";
  if (normalized === "check") return "Check";
  return undefined;
}

function deriveRunState(entry: Record<string, any>): RunlogState {
  const eventType = String(entry.event_type || "").toLowerCase();
  if (eventType.includes("started")) {
    return "RUNNING";
  }
  if (eventType.includes("completed")) {
    return "SUCCESS";
  }
  if (eventType.includes("failed")) {
    return "FAIL";
  }

  const status = String(entry.status || "").toLowerCase();
  if (status.includes("start") || status.includes("run") || status.includes("progress")) {
    return "RUNNING";
  }
  if (status.includes("pass") || status.includes("success") || status.includes("complete") || status === "done") {
    return "SUCCESS";
  }
  if (status.includes("fail") || status.includes("error") || status.includes("block") || status.includes("timeout")) {
    return "FAIL";
  }

  const exitCode = Number(entry.exit_code);
  if (Number.isInteger(exitCode)) {
    if (exitCode === 0) {
      return "SUCCESS";
    }
    return "FAIL";
  }
  return "IDLE";
}

function deriveEventType(runState: RunlogState): RunlogSignal["event_type"] {
  if (runState === "RUNNING") {
    return "runlog_started";
  }
  if (runState === "SUCCESS") {
    return "runlog_completed";
  }
  if (runState === "FAIL") {
    return "runlog_failed";
  }
  return "runlog_updated";
}

export function derivePlanIdFromRunlogPath(filePath: string): string {
  return path.basename(String(filePath || ""), path.extname(String(filePath || "")));
}

export async function readRunlogSignal(filePath: string): Promise<RunlogSignal | null> {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.trim()) {
    return null;
  }

  const entry = parseLastJsonLine(raw);
  const fallbackLine = lastNonEmptyLine(raw);
  const planId = String(entry?.plan_id || derivePlanIdFromRunlogPath(filePath) || "").trim();
  if (!planId) {
    return null;
  }

  const actionType = entry?.action_type ? String(entry.action_type) : undefined;
  const status = entry?.status ? String(entry.status) : undefined;
  const explicitPhase = entry?.phase ? String(entry.phase) : undefined;
  const runState = deriveRunState(entry || {});
  const eventType = deriveEventType(runState);

  const derivedMessage = (() => {
    const action = String(actionType || "task").toUpperCase();
    if (runState === "RUNNING") {
      return `RUNNING ${action}`;
    }
    if (runState === "SUCCESS") {
      return `SUCCESS ${action}`;
    }
    if (runState === "FAIL") {
      return `FAIL ${action}`;
    }
    return compactLine(String(status || "Runtime update").toUpperCase(), 80) || "Runtime update";
  })();

  const detail = compactLine(
    String(entry?.stderr_tail || entry?.stdout_tail || entry?.message || entry?.command || fallbackLine || "run log updated"),
    600
  );
  const evidence = compactLine(String(entry?.stderr_tail || entry?.stdout_tail || detail || ""), 240);

  return {
    plan_id: planId,
    event_type: eventType,
    run_state: runState,
    action_type: actionType,
    status,
    run_id: entry?.run_id ? String(entry.run_id) : undefined,
    phase: explicitPhase || mapActionToPhase(actionType),
    source: entry?.source ? String(entry.source) : "runlog",
    message: derivedMessage,
    detail,
    evidence: evidence || undefined,
    guardrail: entry?.guardrail ? String(entry.guardrail) : undefined,
    route_confidence: Number.isFinite(Number(entry?.route_confidence)) ? Number(entry.route_confidence) : undefined,
    fallback_route: entry?.fallback_route ? String(entry.fallback_route) : undefined,
    selected_route: entry?.selected_route ? String(entry.selected_route) : undefined,
    recovery_step: entry?.recovery_step ? compactLine(String(entry.recovery_step), 300) : undefined,
    onboarding_status: entry?.onboarding_status ? String(entry.onboarding_status) : undefined,
    onboarding_stage: entry?.onboarding_stage ? String(entry.onboarding_stage) : undefined,
    onboarding_error_code: entry?.onboarding_error_code ? String(entry.onboarding_error_code) : undefined,
    onboarding_recovery: entry?.onboarding_recovery ? compactLine(String(entry.onboarding_recovery), 300) : undefined,
    onboarding_next: entry?.onboarding_next ? compactLine(String(entry.onboarding_next), 300) : undefined
  };
}
