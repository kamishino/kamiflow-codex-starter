import type {
  ActivityFilter,
  ActivityTone,
  PlanDetail,
  PlanSummary,
  RouteInfo,
  StartGateResult,
  TimelineStepState
} from "./types";

export const WORKFLOW_STAGES = ["Start", "Plan", "Build", "Check", "Done"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour12: false });
}

export function parseRoute(hash: string): RouteInfo | null {
  const match = hash.match(/^#\/projects\/([^/]+)\/plans\/(.+)$/);
  if (!match) {
    return null;
  }
  return {
    projectId: decodeURIComponent(match[1]),
    planId: decodeURIComponent(match[2])
  };
}

export function formatEventLabel(eventType: string): string {
  return String(eventType || "event")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function activityTone(eventType: string): ActivityTone {
  const key = String(eventType || "").toLowerCase();
  if (key.includes("failed") || key.includes("error") || key.includes("invalid") || key.includes("block")) {
    return "error";
  }
  if (key.includes("warn") || key.includes("stale") || key.includes("resync") || key.includes("deleted")) {
    return "warn";
  }
  if (
    key.includes("completed") ||
    key.includes("applied") ||
    key.includes("saved") ||
    key.includes("archived") ||
    key.includes("updated") ||
    key.includes("connected")
  ) {
    return "ok";
  }
  return "info";
}

export function activityCategory(eventType: string): ActivityFilter | "unknown" {
  const key = String(eventType || "").toLowerCase();
  if (key.includes("codex")) {
    return "codex";
  }
  if (key.startsWith("plan_") || key.includes("plan")) {
    return "plan";
  }
  if (key.includes("ui_") || key.includes("connected") || key.includes("resync")) {
    return "system";
  }
  return "unknown";
}

export function activityMatchesFilter(eventType: string, filterValue: ActivityFilter): boolean {
  if (filterValue === "all") {
    return true;
  }
  return activityCategory(eventType) === filterValue;
}

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

export function parseChecklist(sectionText: string): ChecklistItem[] {
  const lines = String(sectionText || "").split(/\r?\n/);
  const items: ChecklistItem[] = [];
  for (const line of lines) {
    const match = line.match(/^- \[( |x|X)\]\s*(.+)$/);
    if (!match) {
      continue;
    }
    items.push({
      checked: match[1].toLowerCase() === "x",
      text: match[2]
    });
  }
  return items;
}

export function parseSummarySection(sectionText: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(sectionText || "").split(/\r?\n/)) {
    const match = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    out[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return out;
}

export function isPlaceholder(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "n/a" || normalized === "-";
}

export function evaluateStartGate(detail: PlanDetail): StartGateResult {
  const start = parseSummarySection(detail.sections["Start Summary"] || "");
  const required = (start.required || "").toLowerCase();
  if (required !== "yes" && required !== "no") {
    return { ok: false, required: "yes", reason: "Start Summary.Required must be yes or no." };
  }
  if (isPlaceholder(start.reason || "")) {
    return { ok: false, required, reason: "Start Summary.Reason must be non-placeholder." };
  }
  if (required === "yes" && isPlaceholder(start["selected idea"] || "")) {
    return { ok: false, required, reason: "Start required: Selected Idea must be set." };
  }
  if (required === "yes" && isPlaceholder(start["handoff confidence"] || "")) {
    return { ok: false, required, reason: "Start required: Handoff Confidence must be set." };
  }
  return { ok: true, required, reason: "ok" };
}

export function deriveStage(summary: PlanSummary, detail: PlanDetail): string {
  const startGate = evaluateStartGate(detail);
  if (!startGate.ok) {
    return "Start";
  }
  if (summary.is_archived || summary.status === "done" || summary.next_command === "done") {
    return "Done";
  }
  if (summary.next_command === "check") {
    return "Check";
  }
  if (summary.next_command === "build" || summary.next_command === "fix" || summary.next_mode === "Build") {
    return "Build";
  }
  return "Plan";
}

function normalizeStage(stage: string): WorkflowStage {
  if (WORKFLOW_STAGES.includes(stage as WorkflowStage)) {
    return stage as WorkflowStage;
  }
  return "Plan";
}

export function buildTimelineStepStates(currentStage: string): TimelineStepState[] {
  const normalizedStage = normalizeStage(currentStage);
  if (normalizedStage === "Done") {
    return WORKFLOW_STAGES.map(() => "done");
  }
  const currentIndex = WORKFLOW_STAGES.findIndex((item) => item === normalizedStage);
  return WORKFLOW_STAGES.map((_, index) => {
    if (index < currentIndex) {
      return "done";
    }
    if (index === currentIndex) {
      return "current";
    }
    return "upcoming";
  });
}
