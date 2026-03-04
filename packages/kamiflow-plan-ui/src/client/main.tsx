import { effect } from "@preact/signals";
import { render } from "preact";
import { fetchPlanDetail, fetchPlans, fetchProjects } from "./api";
import { ActivityJournal } from "./components/ActivityJournal";
import { EmptyPanelCard } from "./components/EmptyPanelCard";
import { PlanSnapshot } from "./components/PlanSnapshot";
import { WorkflowTimeline } from "./components/WorkflowTimeline";
import { activityFilter, activityItems, detail, emptyPanelState, route, selectedProjectId, statusMessage } from "./state";
import type { ActivityItem, PlanSummary } from "./types";
import { activityTone, formatEventLabel, nowIso, parseRoute } from "./utils";

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
  !connectionBadgeEl
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

function currentPlanFilter(): string {
  return filterEl.value || "active";
}

function currentProjectId(): string {
  return projectEl.value || "";
}

function setStatus(message: string): void {
  statusMessage.value = message;
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
  if (!selectedPlanId) {
    planSelectionHelpEl.textContent = "Selected plan: none.";
    return;
  }

  const fromList = currentPlans.find((item) => item.plan_id === selectedPlanId);
  const fromDetail = detail.value?.summary?.plan_id === selectedPlanId ? detail.value.summary : null;
  const selected = fromList || fromDetail;
  const title = selected?.title ? ` - ${selected.title}` : "";
  planSelectionHelpEl.textContent = `Selected plan: ${selectedPlanId}${title}`;
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
  connectionBadgeEl.className = "chip";
  if (state === "connected") {
    connectionBadgeEl.classList.add("chip-ok");
    connectionBadgeEl.textContent = "connected";
    return;
  }
  if (state === "stale") {
    connectionBadgeEl.classList.add("chip-warn");
    connectionBadgeEl.textContent = "stale";
    return;
  }
  if (state === "offline") {
    connectionBadgeEl.classList.add("chip-danger");
    connectionBadgeEl.textContent = "offline";
    return;
  }
  connectionBadgeEl.classList.add("chip-muted");
  connectionBadgeEl.textContent = "disconnected";
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

function addActivity(eventType: string, message: string, detailText = ""): void {
  const entry: ActivityItem = {
    eventType,
    eventLabel: formatEventLabel(eventType),
    tone: activityTone(eventType),
    message,
    detail: detailText,
    ts: nowIso()
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

function firstVisiblePlanId(plans: PlanSummary[]): string | null {
  const visiblePlans = filterPlansByMode(plans, currentPlanFilter());
  return visiblePlans.length ? visiblePlans[0].plan_id : null;
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

  planSearchResultsEl.innerHTML = filtered
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

  const includeDone = currentPlanFilter() !== "active";
  currentPlans = await fetchPlans(projectId, includeDone);
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
  emptyPanelState.value = null;
  renderPlanSearchResults();
  syncPlanSelectionHelp();
  attachStream(currentProjectId(), routeFromHash.planId);
}

async function refreshFromRoute(): Promise<void> {
  await loadList();
  const routeFromHash = parseRoute(location.hash || "");
  const projectId = currentProjectId();
  const visiblePlanId = firstVisiblePlanId(currentPlans);

  if (!projectId) {
    navigateToPlan("", null, "replace");
    await loadDetail();
    return;
  }

  if (!routeFromHash || routeFromHash.projectId !== projectId) {
    if (visiblePlanId) {
      navigateToPlan(projectId, visiblePlanId, "replace");
    } else {
      navigateToPlan("", null, "replace");
    }
  } else {
    const exists = currentPlans.some((item) => item.plan_id === routeFromHash.planId);
    if (!exists) {
      if (visiblePlanId) {
        navigateToPlan(projectId, visiblePlanId, "replace");
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
    lastHeartbeatTs = Date.now();
    stopPollingFallback();
  });

  currentStream.addEventListener("heartbeat", () => {
    lastHeartbeatTs = Date.now();
  });

  currentStream.addEventListener("resync_required", () => {
    setStatus("Stream replay unavailable. Full resync.");
    addActivity("resync_required", "SSE replay unavailable", "full resync triggered");
    void refreshFromRoute();
  });

  for (const eventType of ["plan_updated", "plan_deleted", "plan_invalid", "plan_archived"]) {
    currentStream.addEventListener(eventType, (evt) => {
      const payload = (evt as MessageEvent).data || "";
      addActivity(eventType, "Plan event received", payload);
      setStatus("Live update received: " + eventType);
      void refreshFromRoute();
    });
  }

  for (const eventType of ["codex_run_started", "codex_run_completed", "codex_run_failed"]) {
    currentStream.addEventListener(eventType, (evt) => {
      const payloadText = (evt as MessageEvent).data || "{}";
      let payload: { action_type?: string; status?: string; stdout_tail?: string; stderr_tail?: string };
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = {};
      }
      const summary = summarizeCodexRunEvent(eventType, payload);
      addActivity(eventType, summary.message, summary.detail || payloadText);
      setStatus("Codex run event: " + summary.message);
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
    <PlanSnapshot
      detail={activeDetail}
      projectDir={projectDirById.get(activeDetail.summary.project_id || currentProjectId()) || ""}
    />,
    workEl
  );
});

effect(() => {
  render(<ActivityJournal items={activityItems.value} filter={activityFilter.value} />, activityEl);
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
