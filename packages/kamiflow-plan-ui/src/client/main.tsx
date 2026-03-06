import { effect } from "@preact/signals";
import { render } from "preact";
import { fetchPlanDetail, fetchPlans, fetchProjects } from "./api";
import { ActivityJournal } from "./components/ActivityJournal";
import { EmptyPanelCard } from "./components/EmptyPanelCard";
import { ImplementationFlowPanel } from "./components/PlanFlowDiagram";
import { PlanSnapshot } from "./components/PlanSnapshot";
import { WorkflowTimeline } from "./components/WorkflowTimeline";
import { activityFilter, activityItems, detail, emptyPanelState, route, selectedProjectId, statusMessage } from "./state";
import type { ActivityItem, ActivityMeta, PlanSummary } from "./types";
import { activityTone, deriveStage, formatEventLabel, nowIso, parseRoute } from "./utils";

const projectEl = document.querySelector<HTMLSelectElement>("#project-filter");
const filterEl = document.querySelector<HTMLSelectElement>("#plan-filter");
const planSearchInputEl = document.querySelector<HTMLInputElement>("#plan-search-input");
const planSelectionHelpEl = document.querySelector<HTMLElement>("#plan-selection-help");
const planSearchResultsEl = document.querySelector<HTMLElement>("#plan-search-results");
const planPickerWrapEl = document.querySelector<HTMLElement>("#plan-picker-wrap");
const activityFilterEl = document.querySelector<HTMLSelectElement>("#activity-filter");

const statusEl = document.querySelector<HTMLElement>("#status");
const workflowEl = document.querySelector<HTMLElement>("#workflow-rail");
const workEl = document.querySelector<HTMLElement>("#work-surface");
const activityEl = document.querySelector<HTMLElement>("#activity-feed");
const connectionBadgeEl = document.querySelector<HTMLElement>("#connection-badge");
const connectionAlertEl = document.querySelector<HTMLElement>("#connection-alert");
const connectionAlertTitleEl = document.querySelector<HTMLElement>("#connection-alert-title");
const connectionAlertDescriptionEl = document.querySelector<HTMLElement>("#connection-alert-description");

if (
  !projectEl ||
  !filterEl ||
  !planSearchInputEl ||
  !planSelectionHelpEl ||
  !planSearchResultsEl ||
  !planPickerWrapEl ||
  !activityFilterEl ||
  !statusEl ||
  !workflowEl ||
  !workEl ||
  !activityEl ||
  !connectionBadgeEl ||
  !connectionAlertEl ||
  !connectionAlertTitleEl ||
  !connectionAlertDescriptionEl
) {
  throw new Error("KFP UI bootstrap failed: required DOM nodes are missing.");
}

const ACTIVITY_STORAGE_PREFIX = "kfp.activity.v2";
const ACTIVITY_MAX_ITEMS = 120;
const PLAN_PICKER_MAX_RESULTS = 50;

let currentStream: EventSource | null = null;
let currentStreamScope = "";
let lastHeartbeatTs = 0;
let staleTimer: number | null = null;
let pollTimer: number | null = null;
let liveRefreshTimer: number | null = null;
let liveRefreshBusy = false;
let currentPlans: PlanSummary[] = [];
let projectDirById = new Map<string, string>();
let planSearchQuery = "";
let projectsLoaded = false;
let suppressHashChange = false;
let lastKnownPhase = "";
let connectionState: "connected" | "stale" | "offline" | "disconnected" = "disconnected";
let lastLiveSignalTs = 0;

function parseUpdatedAtMs(value: string): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPlansByRecency(plans: PlanSummary[]): PlanSummary[] {
  return [...plans].sort((a, b) => {
    const diff = parseUpdatedAtMs(b.updated_at) - parseUpdatedAtMs(a.updated_at);
    if (diff !== 0) {
      return diff;
    }
    return String(a.plan_id || "").localeCompare(String(b.plan_id || ""));
  });
}

function selectedPlanDisplayLabel(summary: Partial<PlanSummary> | null | undefined): string {
  if (!summary?.plan_id) {
    return "";
  }
  const title = summary.title ? ` - ${summary.title}` : "";
  return `${summary.plan_id}${title}`;
}

function currentPlanFilter(): string {
  return filterEl.value || "active";
}

function currentProjectId(): string {
  return projectEl.value || "";
}

function setStatus(message: string): void {
  statusMessage.value = message;
}

function formatElapsedDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function liveUpdateAgeLabel(): string {
  if (!lastLiveSignalTs) {
    return "unknown";
  }
  return formatElapsedDuration(Date.now() - lastLiveSignalTs);
}

function syncConnectionAlert(): void {
  if (connectionState === "connected" || connectionState === "disconnected") {
    connectionAlertEl.hidden = true;
    return;
  }

  const age = liveUpdateAgeLabel();
  if (connectionState === "stale") {
    connectionAlertEl.className = "topbar-connection-alert ui-alert ui-alert-warning";
    connectionAlertTitleEl.textContent = "Connection stale";
    connectionAlertDescriptionEl.textContent = `Last live update ${age} ago. Auto-resync in progress.`;
  } else {
    connectionAlertEl.className = "topbar-connection-alert ui-alert ui-alert-danger";
    connectionAlertTitleEl.textContent = "Connection offline";
    connectionAlertDescriptionEl.textContent = `Last live update ${age} ago. Waiting for stream reconnect.`;
  }
  connectionAlertEl.hidden = false;
}

function markLiveSignal(): void {
  const now = Date.now();
  lastHeartbeatTs = now;
  lastLiveSignalTs = now;
  syncConnectionAlert();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function filterPlansByMode(plans: PlanSummary[], mode: string): PlanSummary[] {
  return plans.filter((item) => {
    if (mode === "done") {
      return Boolean(item.is_done || item.is_archived);
    }
    if (mode === "active") {
      return !item.is_done && !item.is_archived;
    }
    return true;
  });
}

function filterPlansByQuery(plans: PlanSummary[], query: string): PlanSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return plans;
  }
  return plans.filter((item) => {
    return item.plan_id.toLowerCase().includes(normalized) || item.title.toLowerCase().includes(normalized);
  });
}

function selectedRoutePlanId(): string {
  return route.value?.planId || parseRoute(location.hash || "")?.planId || "";
}

function syncPlanSelectionHelp(): void {
  const routeFromHash = parseRoute(location.hash || "");
  const selectedPlanId = routeFromHash?.planId || "";
  const canSyncInput = planSearchResultsEl.hidden && document.activeElement !== planSearchInputEl;
  if (!selectedPlanId) {
    planSelectionHelpEl.textContent = "Selected plan: none. Use Plan Picker to choose one.";
    if (canSyncInput) {
      planSearchQuery = "";
      planSearchInputEl.value = "";
    }
    return;
  }

  const fromList = currentPlans.find((item) => item.plan_id === selectedPlanId);
  const fromDetail = detail.value?.summary?.plan_id === selectedPlanId ? detail.value.summary : null;
  const selected = fromList || fromDetail;
  const displayLabel = selectedPlanDisplayLabel(selected);
  const title = selected?.title ? ` - ${selected.title}` : "";
  const status = selected?.status ? ` | ${selected.status}` : "";
  const nextCommand = selected?.next_command ? ` | next: ${selected.next_command}` : "";
  planSelectionHelpEl.textContent = `Selected plan: ${selectedPlanId}${title}${status}${nextCommand}`;
  if (canSyncInput) {
    planSearchQuery = "";
    planSearchInputEl.value = displayLabel;
  }
}

function openPlanPicker(): void {
  planSearchResultsEl.hidden = false;
  renderPlanSearchResults();
}

function closePlanPicker(): void {
  planSearchResultsEl.hidden = true;
}

function isInsidePlanPicker(target: EventTarget | null): boolean {
  return target instanceof Node && planPickerWrapEl.contains(target);
}

function navigateToPlan(projectId: string, planId: string | null, mode: "push" | "replace"): void {
  const nextHash =
    planId && projectId
      ? "#/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(planId)
      : "";
  if (location.hash === nextHash) {
    return;
  }
  suppressHashChange = true;
  if (mode === "replace") {
    history.replaceState(null, "", nextHash || location.pathname + location.search);
  } else {
    location.hash = nextHash;
  }
  window.setTimeout(() => {
    suppressHashChange = false;
  }, 0);
}

function setConnectionState(state: "connected" | "stale" | "offline" | "disconnected"): void {
  connectionState = state;
  connectionBadgeEl.className = "chip";
  if (state === "connected") {
    connectionBadgeEl.classList.add("chip-ok");
    connectionBadgeEl.textContent = "connected";
    syncConnectionAlert();
    return;
  }
  if (state === "stale") {
    connectionBadgeEl.classList.add("chip-warn");
    connectionBadgeEl.textContent = "stale";
    syncConnectionAlert();
    return;
  }
  if (state === "offline") {
    connectionBadgeEl.classList.add("chip-danger");
    connectionBadgeEl.textContent = "offline";
    syncConnectionAlert();
    return;
  }
  connectionBadgeEl.classList.add("chip-muted");
  connectionBadgeEl.textContent = "disconnected";
  syncConnectionAlert();
}

function currentActivityStorageKey(): string {
  const activeRoute = route.value;
  if (!activeRoute) {
    return "";
  }
  return ACTIVITY_STORAGE_PREFIX + ":" + activeRoute.projectId + ":" + activeRoute.planId;
}

function persistActivity(): void {
  const key = currentActivityStorageKey();
  if (!key) {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(activityItems.value.slice(0, ACTIVITY_MAX_ITEMS)));
  } catch {
    // Ignore storage errors.
  }
}

function loadPersistedActivity(): void {
  const key = currentActivityStorageKey();
  if (!key) {
    activityItems.value = [];
    return;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      activityItems.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    activityItems.value = Array.isArray(parsed) ? parsed.slice(0, ACTIVITY_MAX_ITEMS) : [];
  } catch {
    activityItems.value = [];
  }
}

function summarizeEvidence(text: string): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return "";
  }
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) || trimmed;
  return firstLine.length > 180 ? firstLine.slice(0, 177) + "..." : firstLine;
}

function phaseFromActionType(actionType: string | undefined): string {
  const normalized = String(actionType || "").toLowerCase();
  if (normalized === "start") return "Brainstorm";
  if (normalized === "plan" || normalized === "research") return "Plan";
  if (normalized === "build" || normalized === "fix") return "Build";
  if (normalized === "check") return "Check";
  return "";
}

function phaseFromPlanEventPayload(payload: any): string {
  const summary = payload?.summary;
  if (!summary || !detail.value) {
    return "";
  }
  try {
    const phase = deriveStage(summary, detail.value);
    return String(phase || "");
  } catch {
    return "";
  }
}

function parseJsonPayload(payloadText: string): any {
  try {
    return JSON.parse(payloadText || "{}");
  } catch {
    return null;
  }
}

function addActivity(eventType: string, message: string, detailText = "", meta?: ActivityMeta): void {
  const entry: ActivityItem = {
    eventType,
    eventLabel: formatEventLabel(eventType),
    tone: activityTone(eventType),
    message,
    detail: detailText,
    ts: nowIso(),
    meta
  };
  activityItems.value = [entry, ...activityItems.value].slice(0, ACTIVITY_MAX_ITEMS);
  persistActivity();
}

function summarizeCodexRunEvent(
  eventType: string,
  payload: { action_type?: string; status?: string; stdout_tail?: string; stderr_tail?: string }
): { message: string; detail: string } {
  const action = String(payload.action_type || "task").toUpperCase();
  if (eventType === "codex_run_started") {
    return {
      message: `RUNNING ${action}`,
      detail: payload.stdout_tail || payload.stderr_tail || ""
    };
  }
  if (eventType === "codex_run_completed") {
    return {
      message: `SUCCESS ${action}`,
      detail: payload.stdout_tail || payload.stderr_tail || "Task completed."
    };
  }
  if (eventType === "codex_run_failed") {
    return {
      message: `FAIL ${action}`,
      detail: payload.stderr_tail || payload.stdout_tail || "Task failed."
    };
  }
  return {
    message: `${action} ${String(payload.status || eventType).toUpperCase()}`,
    detail: payload.stdout_tail || payload.stderr_tail || ""
  };
}

function runStateFromEventType(eventType: string): "RUNNING" | "SUCCESS" | "FAIL" | "IDLE" {
  if (eventType.endsWith("_started")) {
    return "RUNNING";
  }
  if (eventType.endsWith("_completed")) {
    return "SUCCESS";
  }
  if (eventType.endsWith("_failed")) {
    return "FAIL";
  }
  return "IDLE";
}

function summarizeRunlogEvent(
  eventType: string,
  payload: {
    action_type?: string;
    status?: string;
    run_state?: "RUNNING" | "SUCCESS" | "FAIL" | "IDLE";
    message?: string;
    detail?: string;
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
): { message: string; detail: string; runState: "RUNNING" | "SUCCESS" | "FAIL" | "IDLE" } {
  const action = String(payload.action_type || "task").toUpperCase();
  const runState = payload.run_state || runStateFromEventType(eventType);
  const status = String(payload.status || "").toUpperCase();
  const message =
    payload.message ||
    (runState === "RUNNING"
      ? `RUNNING ${action}`
      : runState === "SUCCESS"
        ? `SUCCESS ${action}`
        : runState === "FAIL"
          ? `FAIL ${action}`
          : `${action} ${status || "UPDATE"}`);
  return {
    message,
    detail: payload.detail || payload.evidence || "",
    runState
  };
}

function renderProjectsList(projects: Array<{ project_id: string; project_dir: string }>): void {
  projectDirById = new Map(projects.map((item) => [item.project_id, item.project_dir]));
  projectEl.innerHTML = projects
    .map((item) => `<option value="${item.project_id}">${item.project_id} - ${item.project_dir}</option>`)
    .join("");

  const routeFromHash = parseRoute(location.hash || "");
  const preferredProjectId = routeFromHash?.projectId || selectedProjectId.value || projects[0]?.project_id || "";
  if (preferredProjectId) {
    projectEl.value = preferredProjectId;
    selectedProjectId.value = preferredProjectId;
  }
}

function firstVisiblePlanId(plans: PlanSummary[], mode: string): string | null {
  const visiblePlans = filterPlansByMode(plans, mode);
  const sorted = sortPlansByRecency(visiblePlans);
  return sorted.length ? sorted[0].plan_id : null;
}

function resolveFallbackSelection(plans: PlanSummary[]): { planId: string | null; filterMode?: "active" | "done" | "all" } {
  const mode = currentPlanFilter();
  const primary = firstVisiblePlanId(plans, mode);
  if (primary) {
    return { planId: primary };
  }
  if (mode === "active") {
    const done = firstVisiblePlanId(plans, "done");
    if (done) {
      return { planId: done, filterMode: "done" };
    }
  }
  const any = firstVisiblePlanId(plans, "all");
  if (any) {
    return { planId: any, filterMode: mode === "active" ? "all" : undefined };
  }
  return { planId: null };
}

function clearPlanSearch(): void {
  planSearchQuery = "";
  planSearchInputEl.value = "";
}

function selectPlan(planId: string): void {
  clearPlanSearch();
  closePlanPicker();
  navigateToPlan(currentProjectId(), planId, "push");
  void refreshFromRoute();
}

function renderPlanSearchResults(): void {
  const projectId = currentProjectId();
  if (!projectId) {
    planSearchResultsEl.innerHTML =
      '<div class="plan-result-empty"><strong>No projects configured.</strong><small>Run <code>kfc plan workspace add &lt;name&gt; --project &lt;path&gt;</code>.</small></div>';
    return;
  }

  const mode = currentPlanFilter();
  const visiblePlans = filterPlansByMode(currentPlans, mode);
  const filtered = filterPlansByQuery(visiblePlans, planSearchQuery);
  const sorted = sortPlansByRecency(filtered);
  const selectedPlanId = selectedRoutePlanId();

  if (!visiblePlans.length) {
    const title =
      mode === "done"
        ? "No completed plans in this project."
        : mode === "active"
          ? "No active plans in this project."
          : "No plans in this project.";
    planSearchResultsEl.innerHTML =
      '<div class="plan-result-empty"><strong>' +
      escapeHtml(title) +
      "</strong><small>Next: run <code>kfc plan init --project . --new</code>, then run <code>$kamiflow-core plan</code>.</small></div>";
    return;
  }

  if (!filtered.length) {
    planSearchResultsEl.innerHTML =
      '<div class="plan-result-empty"><strong>No plans matched your search.</strong><small>Try another keyword or clear the search input.</small></div>';
    return;
  }

  planSearchResultsEl.innerHTML = sorted
    .slice(0, PLAN_PICKER_MAX_RESULTS)
    .map((item) => {
      const archived = item.is_archived ? "[archived]" : "";
      const invalid = item.is_valid ? "" : "(invalid)";
      const selectedClass = item.plan_id === selectedPlanId ? " plan-result-selected" : "";
      return (
        `<button type="button" class="plan-result-item${selectedClass}" data-plan-id="${escapeHtml(item.plan_id)}">` +
        `<strong>${escapeHtml(item.plan_id)}</strong>` +
        `<span>${escapeHtml(item.title)}</span>` +
        `<small class="plan-result-meta">${escapeHtml([archived, invalid].filter(Boolean).join(" "))}</small>` +
        "</button>"
      );
    })
    .join("");
}

function renderNoSelectionState(reason: string, nextStep: string): void {
  detail.value = null;
  emptyPanelState.value = { reason, nextStep };
}

async function loadList(): Promise<void> {
  const projectId = currentProjectId();
  selectedProjectId.value = projectId;

  if (!projectId) {
    currentPlans = [];
    renderPlanSearchResults();
    syncPlanSelectionHelp();
    setStatus("No project selected.");
    return;
  }

  const includeDone = true;
  currentPlans = sortPlansByRecency(await fetchPlans(projectId, includeDone));
  if (currentPlanFilter() === "active" && !filterPlansByMode(currentPlans, "active").length && filterPlansByMode(currentPlans, "done").length) {
    filterEl.value = "done";
  }
  renderPlanSearchResults();
  syncPlanSelectionHelp();
}

async function loadDetail(): Promise<void> {
  const routeFromHash = parseRoute(location.hash || "");
  route.value = routeFromHash;
  loadPersistedActivity();

  if (!routeFromHash) {
    detachStream(true);
    renderNoSelectionState(
      "No plan selected.",
      "Choose a plan from the toolbar plan picker. If none exists, run kfc plan init --project . --new."
    );
    syncPlanSelectionHelp();
    return;
  }

  if (routeFromHash.projectId !== currentProjectId()) {
    if (projectsLoaded) {
      detachStream(true);
      renderNoSelectionState(
        "Selected plan belongs to another project.",
        "Choose a plan from the current project using the toolbar plan picker."
      );
      syncPlanSelectionHelp();
      return;
    }
    projectEl.value = routeFromHash.projectId;
  }

  selectedProjectId.value = currentProjectId();

  const fetchedDetail = await fetchPlanDetail(currentProjectId(), routeFromHash.planId);
  if (!fetchedDetail) {
    detachStream(true);
    setStatus("Plan not found. Select another plan or refresh list.");
    renderNoSelectionState("Selected plan is unavailable.", "Refresh list or pick another plan from the toolbar picker.");
    syncPlanSelectionHelp();
    return;
  }

  detail.value = fetchedDetail;
  lastKnownPhase = deriveStage(fetchedDetail.summary, fetchedDetail);
  emptyPanelState.value = null;
  renderPlanSearchResults();
  syncPlanSelectionHelp();
  attachStream(currentProjectId(), routeFromHash.planId);
}

async function refreshFromRoute(): Promise<void> {
  await loadList();
  const routeFromHash = parseRoute(location.hash || "");
  const projectId = currentProjectId();
  const fallback = resolveFallbackSelection(currentPlans);

  if (!projectId) {
    navigateToPlan("", null, "replace");
    await loadDetail();
    return;
  }

  if (!routeFromHash || routeFromHash.projectId !== projectId) {
    if (fallback.filterMode && filterEl.value !== fallback.filterMode) {
      filterEl.value = fallback.filterMode;
      renderPlanSearchResults();
    }
    if (fallback.planId) {
      navigateToPlan(projectId, fallback.planId, "replace");
    } else {
      navigateToPlan("", null, "replace");
    }
  } else {
    const exists = currentPlans.some((item) => item.plan_id === routeFromHash.planId);
    if (!exists) {
      if (fallback.filterMode && filterEl.value !== fallback.filterMode) {
        filterEl.value = fallback.filterMode;
        renderPlanSearchResults();
      }
      if (fallback.planId) {
        navigateToPlan(projectId, fallback.planId, "replace");
      } else {
        navigateToPlan("", null, "replace");
      }
    }
  }

  await loadDetail();
}

function startPollingFallback(): void {
  if (pollTimer) {
    return;
  }
  pollTimer = window.setInterval(() => {
    void refreshFromRoute();
  }, 15_000);
}

function stopPollingFallback(): void {
  if (!pollTimer) {
    return;
  }
  window.clearInterval(pollTimer);
  pollTimer = null;
}

function detachStream(resetBadge = false): void {
  if (currentStream) {
    currentStream.close();
    currentStream = null;
  }
  currentStreamScope = "";
  if (staleTimer) {
    window.clearInterval(staleTimer);
    staleTimer = null;
  }
  if (resetBadge) {
    setConnectionState("disconnected");
  }
}

async function refreshActivePlanDetail(): Promise<void> {
  if (liveRefreshBusy) {
    return;
  }
  const activeRoute = route.value;
  if (!activeRoute) {
    return;
  }
  liveRefreshBusy = true;
  try {
    const latest = await fetchPlanDetail(activeRoute.projectId, activeRoute.planId);
    if (!latest) {
      return;
    }
    const currentUpdatedAt = detail.value?.summary?.updated_at || "";
    const nextUpdatedAt = latest.summary.updated_at || "";
    if (currentUpdatedAt !== nextUpdatedAt) {
      detail.value = latest;
      emptyPanelState.value = null;
      syncPlanSelectionHelp();
      setStatus("Plan hot-reloaded from file changes.");
      void loadList();
    }
  } finally {
    liveRefreshBusy = false;
  }
}

function startLiveRefreshTimer(): void {
  if (liveRefreshTimer) {
    return;
  }
  liveRefreshTimer = window.setInterval(() => {
    void refreshActivePlanDetail();
  }, 4000);
}

function stopLiveRefreshTimer(): void {
  if (!liveRefreshTimer) {
    return;
  }
  window.clearInterval(liveRefreshTimer);
  liveRefreshTimer = null;
}

function attachStream(projectId: string, planId: string): void {
  const scope = projectId + "::" + planId;
  if (currentStream && currentStreamScope === scope) {
    return;
  }
  detachStream(false);
  currentStreamScope = scope;

  currentStream = new EventSource(
    "/api/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(planId) + "/events"
  );

  if (staleTimer) {
    window.clearInterval(staleTimer);
  }

  staleTimer = window.setInterval(() => {
    syncConnectionAlert();
    if (!lastHeartbeatTs) {
      return;
    }
    if (Date.now() - lastHeartbeatTs > 60_000) {
      setConnectionState("stale");
      setStatus("Connection stale. Resyncing...");
      startPollingFallback();
      void refreshFromRoute();
    }
  }, 5_000);

  currentStream.addEventListener("connected", () => {
    setConnectionState("connected");
    setStatus("Connected.");
    markLiveSignal();
    stopPollingFallback();
  });

  currentStream.addEventListener("heartbeat", () => {
    markLiveSignal();
  });

  currentStream.addEventListener("resync_required", () => {
    markLiveSignal();
    setStatus("Stream replay unavailable. Full resync.");
    addActivity("resync_required", "SSE replay unavailable", "full resync triggered", {
      run_state: "IDLE",
      phase: lastKnownPhase || undefined,
      evidence: "stream replay unavailable",
      source: "system"
    });
    void refreshFromRoute();
  });

  for (const eventType of ["plan_updated", "plan_deleted", "plan_invalid", "plan_archived"]) {
    currentStream.addEventListener(eventType, (evt) => {
      markLiveSignal();
      const payloadText = (evt as MessageEvent).data || "{}";
      const payload = parseJsonPayload(payloadText);
      const derivedPhase = phaseFromPlanEventPayload(payload);
      if (derivedPhase) {
        lastKnownPhase = derivedPhase;
      }
      const message =
        eventType === "plan_updated" && derivedPhase
          ? `PHASE ${derivedPhase}`
          : eventType === "plan_archived"
            ? "Plan archived"
            : eventType === "plan_invalid"
              ? "Plan invalid"
              : "Plan event received";
      const blocker = eventType === "plan_invalid" ? "Plan validation failed." : "";
      const summary = payload?.summary;
      const evidence = summary
        ? summarizeEvidence(`status=${summary.status || "-"} decision=${summary.decision || "-"} next=${summary.next_command || "-"}`)
        : summarizeEvidence(payloadText);
      addActivity(eventType, message, payloadText, {
        run_state: "IDLE",
        phase: derivedPhase || lastKnownPhase || undefined,
        blocker: blocker || undefined,
        evidence: evidence || undefined,
        source: "plan"
      });
      setStatus("Live update received: " + eventType);
      void refreshFromRoute();
    });
  }

  for (const eventType of ["codex_run_started", "codex_run_completed", "codex_run_failed"]) {
    currentStream.addEventListener(eventType, (evt) => {
      markLiveSignal();
      const payloadText = (evt as MessageEvent).data || "{}";
      let payload: { action_type?: string; status?: string; stdout_tail?: string; stderr_tail?: string };
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = {};
      }
      const summary = summarizeCodexRunEvent(eventType, payload);
      const derivedPhase = phaseFromActionType(payload.action_type);
      if (derivedPhase) {
        lastKnownPhase = derivedPhase;
      }
      const runState = eventType === "codex_run_started" ? "RUNNING" : eventType === "codex_run_completed" ? "SUCCESS" : "FAIL";
      const blocker = runState === "FAIL" ? summarizeEvidence(payload.stderr_tail || payload.stdout_tail || "Codex run failed.") : "";
      const evidence = summarizeEvidence(summary.detail || payload.stdout_tail || payload.stderr_tail || payloadText);
      addActivity(eventType, summary.message, summary.detail || payloadText, {
        run_state: runState,
        phase: derivedPhase || lastKnownPhase || undefined,
        blocker: blocker || undefined,
        evidence: evidence || undefined,
        selected_route: payload.action_type ? String(payload.action_type) : undefined,
        source: payload.action_type ? `codex:${payload.action_type}` : "codex"
      });
      setStatus("Codex run event: " + summary.message);
    });
  }

  for (const eventType of ["runlog_started", "runlog_completed", "runlog_failed", "runlog_updated", "runlog_deleted"]) {
    currentStream.addEventListener(eventType, (evt) => {
      markLiveSignal();
      const payloadText = (evt as MessageEvent).data || "{}";
      const payload = parseJsonPayload(payloadText) || {};
      const summary = summarizeRunlogEvent(eventType, payload);
      const derivedPhase = String(payload.phase || "") || phaseFromActionType(payload.action_type);
      if (derivedPhase) {
        lastKnownPhase = derivedPhase;
      }
      const blocker =
        summary.runState === "FAIL"
          ? summarizeEvidence(String(payload.detail || payload.evidence || payload.status || "Runtime task failed."))
          : "";
      const evidence = summarizeEvidence(String(payload.evidence || payload.detail || payloadText));
      addActivity(eventType, summary.message, summary.detail || payloadText, {
        run_state: summary.runState,
        phase: derivedPhase || lastKnownPhase || undefined,
        blocker: blocker || undefined,
        evidence: evidence || undefined,
        guardrail: payload.guardrail ? String(payload.guardrail) : undefined,
        route_confidence: Number.isFinite(Number(payload.route_confidence)) ? Number(payload.route_confidence) : undefined,
        fallback_route: payload.fallback_route ? String(payload.fallback_route) : undefined,
        selected_route: payload.selected_route ? String(payload.selected_route) : payload.action_type ? String(payload.action_type) : undefined,
        recovery_step: payload.recovery_step ? String(payload.recovery_step) : undefined,
        onboarding_status: payload.onboarding_status ? String(payload.onboarding_status) : undefined,
        onboarding_stage: payload.onboarding_stage ? String(payload.onboarding_stage) : undefined,
        onboarding_error_code: payload.onboarding_error_code ? String(payload.onboarding_error_code) : undefined,
        onboarding_recovery: payload.onboarding_recovery ? String(payload.onboarding_recovery) : undefined,
        onboarding_next: payload.onboarding_next ? String(payload.onboarding_next) : undefined,
        source: payload.source || (payload.action_type ? `runlog:${payload.action_type}` : "runlog")
      });
      setStatus("Runtime stream update: " + summary.message);
      void refreshActivePlanDetail();
    });
  }

  currentStream.onerror = () => {
    setConnectionState("offline");
    setStatus("Disconnected. Reconnecting...");
    startPollingFallback();
  };
}

projectEl.addEventListener("change", () => {
  selectedProjectId.value = projectEl.value || "";
  clearPlanSearch();
  closePlanPicker();
  void refreshFromRoute();
});

filterEl.addEventListener("change", () => {
  clearPlanSearch();
  closePlanPicker();
  void refreshFromRoute();
});

planSearchInputEl.addEventListener("focus", () => {
  openPlanPicker();
});

planSearchInputEl.addEventListener("click", () => {
  openPlanPicker();
});

planSearchInputEl.addEventListener("input", () => {
  planSearchQuery = planSearchInputEl.value || "";
  openPlanPicker();
});

planSearchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePlanPicker();
    return;
  }
  if (event.key === "Enter") {
    const first = planSearchResultsEl.querySelector<HTMLButtonElement>("button[data-plan-id]");
    if (!first) {
      return;
    }
    const planId = first.getAttribute("data-plan-id");
    if (planId) {
      event.preventDefault();
      selectPlan(planId);
    }
  }
});

planSearchResultsEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>("button[data-plan-id]");
  const planId = button?.getAttribute("data-plan-id");
  if (!planId) {
    return;
  }
  selectPlan(planId);
});

document.addEventListener(
  "pointerdown",
  (event) => {
    if (isInsidePlanPicker(event.target)) {
      return;
    }
    closePlanPicker();
  },
  true
);

document.addEventListener("focusin", (event) => {
  if (isInsidePlanPicker(event.target)) {
    return;
  }
  closePlanPicker();
});

activityFilterEl.addEventListener("change", () => {
  const nextFilter = activityFilterEl.value;
  if (nextFilter === "plan" || nextFilter === "codex" || nextFilter === "system" || nextFilter === "all") {
    activityFilter.value = nextFilter;
  } else {
    activityFilter.value = "all";
  }
});

window.addEventListener("hashchange", () => {
  if (suppressHashChange) {
    return;
  }
  void refreshFromRoute();
});

effect(() => {
  statusEl.textContent = statusMessage.value;
});

effect(() => {
  const state = emptyPanelState.value;
  const activeDetail = detail.value;
  if (state) {
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, workflowEl);
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, workEl);
    return;
  }
  if (!activeDetail) {
    return;
  }

  render(<WorkflowTimeline detail={activeDetail} />, workflowEl);
  render(
    <div class="work-surface-stack">
      <ImplementationFlowPanel detail={activeDetail} />
      <PlanSnapshot
        detail={activeDetail}
        projectDir={projectDirById.get(activeDetail.summary.project_id || currentProjectId()) || ""}
      />
    </div>,
    workEl
  );
});

effect(() => {
  render(<ActivityJournal items={activityItems.value} filter={activityFilter.value} detail={detail.value} />, activityEl);
});

setConnectionState("disconnected");
projectEl.classList.add("ui-select");
filterEl.classList.add("ui-select");
activityFilterEl.classList.add("ui-select");
planSearchInputEl.classList.add("ui-input");
startLiveRefreshTimer();
window.addEventListener("beforeunload", () => {
  stopLiveRefreshTimer();
  stopPollingFallback();
  detachStream(false);
});
fetchProjects()
  .then(({ projects }) => {
    renderProjectsList(projects);
    projectsLoaded = true;
    return refreshFromRoute();
  })
  .catch((err) => {
    setStatus("Failed to initialize UI: " + (err?.message || String(err)));
    addActivity("ui_error", "Initialization failure", err?.stack || String(err));
  });
