import { effect } from "@preact/signals";
import { render } from "preact";
import { fetchPlanDetail, fetchPlans, fetchProjects } from "./api";
import { ActivityJournal } from "./components/ActivityJournal";
import { EmptyPanelCard } from "./components/EmptyPanelCard";
import { NextStepCard } from "./components/NextStepCard";
import { PlanHealth } from "./components/PlanHealth";
import { PlanSnapshot } from "./components/PlanSnapshot";
import { WorkflowTimeline } from "./components/WorkflowTimeline";
import { activityFilter, activityItems, detail, emptyPanelState, route, selectedProjectId, statusMessage } from "./state";
import type { ActivityItem, PlanSummary } from "./types";
import { activityTone, formatEventLabel, nowIso, parseRoute } from "./utils";

const projectEl = document.querySelector<HTMLSelectElement>("#project-filter");
const planListEl = document.querySelector<HTMLUListElement>("#plan-list");
const filterEl = document.querySelector<HTMLSelectElement>("#plan-filter");
const activityFilterEl = document.querySelector<HTMLSelectElement>("#activity-filter");

const statusEl = document.querySelector<HTMLElement>("#status");
const workflowEl = document.querySelector<HTMLElement>("#workflow-rail");
const healthEl = document.querySelector<HTMLElement>("#plan-health");
const nextStepEl = document.querySelector<HTMLElement>("#next-step-card");
const workEl = document.querySelector<HTMLElement>("#work-surface");
const activityEl = document.querySelector<HTMLElement>("#activity-feed");
const workspaceBadgeEl = document.querySelector<HTMLElement>("#workspace-badge");
const projectBadgeEl = document.querySelector<HTMLElement>("#project-badge");
const connectionBadgeEl = document.querySelector<HTMLElement>("#connection-badge");

if (
  !projectEl ||
  !planListEl ||
  !filterEl ||
  !activityFilterEl ||
  !statusEl ||
  !workflowEl ||
  !healthEl ||
  !nextStepEl ||
  !workEl ||
  !activityEl ||
  !workspaceBadgeEl ||
  !projectBadgeEl ||
  !connectionBadgeEl
) {
  throw new Error("KFP UI bootstrap failed: required DOM nodes are missing.");
}

const UI_MODE = (document.body?.dataset?.uiMode || "observer").toLowerCase() === "operator" ? "operator" : "observer";
const ACTIVITY_STORAGE_PREFIX = "kfp.activity.v2";
const ACTIVITY_MAX_ITEMS = 120;

let currentStream: EventSource | null = null;
let lastHeartbeatTs = 0;
let staleTimer: number | null = null;
let pollTimer: number | null = null;
let currentPlans: PlanSummary[] = [];

function currentPlanFilter(): string {
  return filterEl.value || "active";
}

function currentProjectId(): string {
  return projectEl.value || "";
}

function setStatus(message: string): void {
  statusMessage.value = message;
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

function renderProjectsList(projects: Array<{ project_id: string; project_dir: string }>): void {
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

function renderPlanList(plans: PlanSummary[]): void {
  const mode = currentPlanFilter();
  const filtered = plans.filter((item) => {
    if (mode === "done") {
      return Boolean(item.is_done || item.is_archived);
    }
    if (mode === "active") {
      return !item.is_done && !item.is_archived;
    }
    return true;
  });

  if (!filtered.length) {
    const title =
      mode === "done"
        ? "No completed plans in this project."
        : mode === "active"
          ? "No active plans in this project."
          : "No plans in this project.";
    planListEl.innerHTML =
      '<li class="empty-state"><strong>' +
      title +
      "</strong><small>Next: run <code>kfc plan init --project . --new</code>, then run <code>$kamiflow-core plan</code>.</small></li>";
    return;
  }

  planListEl.innerHTML = filtered
    .map((item) => {
      const invalid = item.is_valid ? "" : " (invalid)";
      const archived = item.is_archived ? " [archived]" : "";
      return `<li><button data-plan-id="${item.plan_id}">${item.plan_id} - ${item.title}${archived}${invalid}</button></li>`;
    })
    .join("");

  for (const button of planListEl.querySelectorAll<HTMLButtonElement>("button[data-plan-id]")) {
    button.addEventListener("click", () => {
      const planId = button.getAttribute("data-plan-id");
      if (!planId) {
        return;
      }
      location.hash = "#/projects/" + encodeURIComponent(currentProjectId()) + "/plans/" + encodeURIComponent(planId);
      void loadDetail();
    });
  }
}

function renderNoSelectionState(reason: string, nextStep: string): void {
  detail.value = null;
  emptyPanelState.value = { reason, nextStep };
}

async function loadList(): Promise<void> {
  const projectId = currentProjectId();
  selectedProjectId.value = projectId;

  if (!projectId) {
    planListEl.innerHTML =
      '<li class="empty-state"><strong>No projects configured.</strong><small>Run <code>kfc plan workspace add &lt;name&gt; --project &lt;path&gt;</code>.</small></li>';
    return;
  }

  const includeDone = currentPlanFilter() !== "active";
  currentPlans = await fetchPlans(projectId, includeDone);
  renderPlanList(currentPlans);

  const routeFromHash = parseRoute(location.hash || "");
  if (!routeFromHash && currentPlans.length > 0) {
    const nextPlan = currentPlans[0];
    location.hash = "#/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(nextPlan.plan_id);
  }
}

async function loadDetail(): Promise<void> {
  const routeFromHash = parseRoute(location.hash || "");
  route.value = routeFromHash;
  loadPersistedActivity();

  if (!routeFromHash) {
    renderNoSelectionState(
      "No plan selected.",
      "Choose a plan from the left list. If none exists, run kfc plan init --project . --new."
    );
    return;
  }

  if (projectEl.value !== routeFromHash.projectId) {
    projectEl.value = routeFromHash.projectId;
  }
  selectedProjectId.value = routeFromHash.projectId;

  const fetchedDetail = await fetchPlanDetail(routeFromHash.projectId, routeFromHash.planId);
  if (!fetchedDetail) {
    setStatus("Plan not found. Select another plan or refresh list.");
    renderNoSelectionState("Selected plan is unavailable.", "Refresh list or pick another plan from sidebar.");
    return;
  }

  detail.value = fetchedDetail;
  emptyPanelState.value = null;
  attachStream(routeFromHash.projectId, routeFromHash.planId);
}

function startPollingFallback(): void {
  if (pollTimer) {
    return;
  }
  pollTimer = window.setInterval(() => {
    void loadDetail();
    void loadList();
  }, 15_000);
}

function stopPollingFallback(): void {
  if (!pollTimer) {
    return;
  }
  window.clearInterval(pollTimer);
  pollTimer = null;
}

function attachStream(projectId: string, planId: string): void {
  if (currentStream) {
    currentStream.close();
    currentStream = null;
  }

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
      void loadDetail();
      void loadList();
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
    void loadDetail();
    void loadList();
  });

  for (const eventType of ["plan_updated", "plan_deleted", "plan_invalid", "plan_archived"]) {
    currentStream.addEventListener(eventType, (evt) => {
      const payload = (evt as MessageEvent).data || "";
      addActivity(eventType, "Plan event received", payload);
      setStatus("Live update received: " + eventType);
      void loadDetail();
      void loadList();
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
      const summary = payload.action_type ? payload.action_type + " -> " + (payload.status || eventType) : eventType;
      addActivity(eventType, summary, payload.stdout_tail || payload.stderr_tail || payloadText);
      setStatus("Codex run event: " + summary);
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
  void loadList();
  void loadDetail();
});

filterEl.addEventListener("change", () => {
  void loadList();
  void loadDetail();
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
  void loadDetail();
});

effect(() => {
  statusEl.textContent = statusMessage.value;
});

effect(() => {
  projectBadgeEl.textContent = "project: " + (selectedProjectId.value || "-");
});

effect(() => {
  const state = emptyPanelState.value;
  const activeDetail = detail.value;
  if (state) {
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, workflowEl);
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, healthEl);
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, nextStepEl);
    render(<EmptyPanelCard reason={state.reason} nextStep={state.nextStep} />, workEl);
    return;
  }
  if (!activeDetail) {
    return;
  }

  render(<WorkflowTimeline detail={activeDetail} />, workflowEl);
  render(<PlanHealth detail={activeDetail} />, healthEl);
  render(<NextStepCard detail={activeDetail} uiMode={UI_MODE} />, nextStepEl);
  render(<PlanSnapshot detail={activeDetail} />, workEl);
});

effect(() => {
  render(<ActivityJournal items={activityItems.value} filter={activityFilter.value} />, activityEl);
});

setConnectionState("disconnected");
fetchProjects()
  .then(({ workspace, projects }) => {
    workspaceBadgeEl.textContent = "workspace: " + workspace;
    renderProjectsList(projects);
    return loadList();
  })
  .then(() => loadDetail())
  .catch((err) => {
    setStatus("Failed to initialize UI: " + (err?.message || String(err)));
    addActivity("ui_error", "Initialization failure", err?.stack || String(err));
  });
