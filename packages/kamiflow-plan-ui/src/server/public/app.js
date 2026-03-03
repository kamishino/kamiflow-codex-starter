const projectEl = document.querySelector("#project-filter");
const planListEl = document.querySelector("#plan-list");
const filterEl = document.querySelector("#plan-filter");

const statusEl = document.querySelector("#status");
const workflowEl = document.querySelector("#workflow-rail");
const healthEl = document.querySelector("#plan-health");
const actionEl = document.querySelector("#action-console");
const workEl = document.querySelector("#work-surface");
const activityEl = document.querySelector("#activity-feed");
const workspaceBadgeEl = document.querySelector("#workspace-badge");
const projectBadgeEl = document.querySelector("#project-badge");
const connectionBadgeEl = document.querySelector("#connection-badge");
const UI_MODE = (document.body?.dataset?.uiMode || "observer").toLowerCase() === "operator" ? "operator" : "observer";

const PRIMARY_ACTION_META = {
  "codex-plan": { label: "Run Plan", mode: "Plan" },
  "codex-build": { label: "Run Build", mode: "Build" },
  "codex-check": { label: "Run Check", mode: "Plan" },
  "codex-fix": { label: "Run Fix", mode: "Build" }
};

const PRIMARY_ACTION_ORDER = ["codex-plan", "codex-build", "codex-check", "codex-fix"];
const RECOMMENDED_BY_NEXT_COMMAND = {
  plan: "codex-plan",
  build: "codex-build",
  check: "codex-check",
  fix: "codex-fix"
};

let currentStream;
let lastHeartbeatTs = 0;
let staleTimer = null;
let pollTimer = null;
let currentDetail = null;
let currentPlans = [];
let activityItems = [];
const ACTIVITY_STORAGE_PREFIX = "kfp.activity.v1";
const ACTIVITY_MAX_ITEMS = 120;

function nowIso() {
  return new Date().toISOString();
}

function currentFilter() {
  return filterEl?.value || "active";
}

function currentProjectId() {
  return projectEl?.value || "";
}

function projectApiBase(projectId) {
  return "/api/projects/" + encodeURIComponent(projectId);
}

function setConnectionState(state) {
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

function formatClock(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour12: false });
}

function formatEventLabel(eventType) {
  return String(eventType || "event")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function activityTone(eventType) {
  const key = String(eventType || "").toLowerCase();
  if (
    key.includes("failed") ||
    key.includes("error") ||
    key.includes("invalid") ||
    key.includes("block")
  ) {
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

function addActivity(eventType, message, detail) {
  const tone = activityTone(eventType);
  const entry = {
    eventType,
    eventLabel: formatEventLabel(eventType),
    tone,
    message,
    detail: detail || "",
    ts: nowIso()
  };
  activityItems = [entry, ...activityItems].slice(0, ACTIVITY_MAX_ITEMS);
  persistActivity();
  renderActivity();
}

function renderActivity() {
  activityEl.innerHTML = activityItems
    .map(
      (item) =>
        '<li class="activity-item activity-item-' +
        item.tone +
        '">' +
        '<div class="activity-head">' +
        "<time>" +
        formatClock(item.ts) +
        "</time>" +
        '<span class="activity-tag activity-tag-' +
        item.tone +
        '">' +
        item.eventLabel +
        "</span>" +
        "</div>" +
        '<div class="activity-message">' +
        escapeHtml(item.message) +
        "</div>" +
        (item.detail ? "<pre>" + escapeHtml(item.detail) + "</pre>" : "") +
        "</li>"
    )
    .join("");
}

function currentActivityStorageKey() {
  const route = parseRoute();
  if (!route) {
    return "";
  }
  return ACTIVITY_STORAGE_PREFIX + ":" + route.projectId + ":" + route.planId;
}

function persistActivity() {
  const key = currentActivityStorageKey();
  if (!key) {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(activityItems.slice(0, ACTIVITY_MAX_ITEMS)));
  } catch {
    // Ignore storage issues.
  }
}

function loadPersistedActivity() {
  const key = currentActivityStorageKey();
  if (!key) {
    activityItems = [];
    renderActivity();
    return;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      activityItems = [];
      renderActivity();
      return;
    }
    const parsed = JSON.parse(raw);
    activityItems = Array.isArray(parsed) ? parsed.slice(0, ACTIVITY_MAX_ITEMS) : [];
  } catch {
    activityItems = [];
  }
  renderActivity();
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchProjects() {
  const res = await fetch("/api/projects");
  if (!res.ok) {
    throw new Error("Failed to load projects.");
  }
  const data = await res.json();
  workspaceBadgeEl.textContent = "workspace: " + (data.workspace || "-default-");
  return data.projects ?? [];
}

async function fetchPlans(projectId, includeDone) {
  const res = await fetch(projectApiBase(projectId) + "/plans?include_done=" + (includeDone ? "true" : "false"));
  if (!res.ok) {
    throw new Error("Failed to load plans.");
  }
  const data = await res.json();
  return data.plans ?? [];
}

function renderProjects(projects) {
  projectEl.innerHTML = projects
    .map((p) => '<option value="' + p.project_id + '">' + p.project_id + " - " + p.project_dir + "</option>")
    .join("");
  projectBadgeEl.textContent = "project: " + (currentProjectId() || "-");
}

function renderList(plans) {
  const mode = currentFilter();
  const filtered = plans.filter((p) => {
    if (mode === "done") {
      return !!p.is_done || !!p.is_archived;
    }
    if (mode === "active") {
      return !p.is_done && !p.is_archived;
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
      '<li class="empty-state">' +
      "<strong>" +
      title +
      "</strong>" +
      "<small>Next: run <code>kfc plan init --project . --new</code>, then run <code>$kamiflow-core plan</code>.</small>" +
      "</li>";
    return;
  }

  planListEl.innerHTML = filtered
    .map((p) => {
      const invalid = p.is_valid ? "" : " (invalid)";
      const archived = p.is_archived ? " [archived]" : "";
      return '<li><button data-plan-id="' + p.plan_id + '">' + p.plan_id + " - " + p.title + archived + invalid + "</button></li>";
    })
    .join("");

  for (const button of planListEl.querySelectorAll("button[data-plan-id]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-plan-id");
      const projectId = currentProjectId();
      location.hash = "#/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(id);
      loadDetail();
    });
  }
}

function parseRoute() {
  const hash = location.hash || "";
  const match = hash.match(/^#\/projects\/([^/]+)\/plans\/(.+)$/);
  if (!match) {
    return null;
  }
  return {
    projectId: decodeURIComponent(match[1]),
    planId: decodeURIComponent(match[2])
  };
}

function parseChecklist(sectionText) {
  const lines = String(sectionText || "").split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const match = line.match(/^- \[( |x|X)\]\s*(.+)$/);
    if (!match) {
      continue;
    }
    items.push({
      index: items.length,
      checked: match[1].toLowerCase() === "x",
      text: match[2]
    });
  }
  return items;
}

function collectChecklist(containerSelector) {
  return Array.from(document.querySelectorAll(containerSelector))
    .map((el) => ({
      index: Number(el.getAttribute("data-index")),
      checked: !!el.checked
    }))
    .filter((item) => Number.isInteger(item.index));
}

function parseSummarySection(sectionText) {
  const out = {};
  for (const line of String(sectionText || "").split(/\r?\n/)) {
    const match = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    out[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return out;
}

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "n/a" || normalized === "-";
}

function evaluateStartGate(detail) {
  const start = parseSummarySection(detail.sections["Start Summary"] || "");
  const required = (start.required || "").toLowerCase();
  if (required !== "yes" && required !== "no") {
    return { ok: false, required: "yes", reason: "Start Summary.Required must be yes or no." };
  }
  if (isPlaceholder(start.reason)) {
    return { ok: false, required, reason: "Start Summary.Reason must be non-placeholder." };
  }
  if (required === "yes" && isPlaceholder(start["selected idea"])) {
    return { ok: false, required, reason: "Start required: Selected Idea must be set." };
  }
  if (required === "yes" && isPlaceholder(start["handoff confidence"])) {
    return { ok: false, required, reason: "Start required: Handoff Confidence must be set." };
  }
  return { ok: true, required, reason: "ok" };
}

function deriveStage(summary) {
  if (!summary || !currentDetail) {
    return "Plan";
  }
  const startGate = evaluateStartGate(currentDetail);
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

function buildActionGuardrails(detail) {
  const summary = detail.summary || {};
  const isArchived = !!summary.is_archived;
  const isDone = summary.status === "done" || summary.next_command === "done";
  const startGate = evaluateStartGate(detail);
  const acItems = parseChecklist(detail.sections["Acceptance Criteria"] || "");
  const allAcChecked = acItems.length > 0 && acItems.every((item) => item.checked);

  const flags = {
    codexPlan: false,
    codexBuild: false,
    codexCheck: false,
    codexFix: false,
    applyBuild: false,
    applyCheckBlock: false,
    applyCheckPass: false,
    archive: false
  };
  const blockers = [];
  const addBlocker = (reason, nextStep) => {
    blockers.push({ reason, nextStep });
  };

  if (isArchived) {
    flags.codexPlan = true;
    flags.codexBuild = true;
    flags.codexCheck = true;
    flags.codexFix = true;
    flags.applyBuild = true;
    flags.applyCheckBlock = true;
    flags.applyCheckPass = true;
    flags.archive = true;
    addBlocker("Plan is archived.", "Switch to Done view for history, or start a new plan.");
    return { flags, blockers };
  }

  if (isDone) {
    flags.codexBuild = true;
    flags.codexCheck = true;
    flags.codexFix = true;
    flags.applyBuild = true;
    flags.applyCheckBlock = true;
    flags.applyCheckPass = true;
    addBlocker("Plan is already done.", "Create a new plan for additional implementation work.");
  }

  if (!startGate.ok) {
    flags.codexBuild = true;
    flags.applyBuild = true;
    addBlocker("Start gate: " + startGate.reason, "Open Work Panel and complete Start Summary fields.");
  }

  if (summary.decision !== "GO") {
    flags.codexBuild = true;
    flags.applyBuild = true;
    addBlocker("Build actions require decision GO.", "Run plan phase to resolve decisions and set GO.");
  }

  if (summary.next_mode !== "Build" && summary.next_command !== "build" && !isDone) {
    flags.codexBuild = true;
    addBlocker(
      "Current handoff is not build-ready.",
      "Run the handoff command shown in Plan Health, then return to Build."
    );
  }

  if (!allAcChecked) {
    flags.archive = true;
    addBlocker(
      "Archive requires all Acceptance Criteria checked.",
      "Complete acceptance checklist in Work Panel and apply Check PASS."
    );
  }

  if (!isDone) {
    flags.archive = true;
  }

  return { flags, blockers };
}

function buildPrimaryActionOrder(summary) {
  const recommended = RECOMMENDED_BY_NEXT_COMMAND[summary?.next_command] || "codex-plan";
  return [recommended, ...PRIMARY_ACTION_ORDER.filter((id) => id !== recommended)];
}

function guardForAction(guardrails, actionId) {
  if (actionId === "codex-plan") return guardrails.flags.codexPlan;
  if (actionId === "codex-build") return guardrails.flags.codexBuild;
  if (actionId === "codex-check") return guardrails.flags.codexCheck;
  if (actionId === "codex-fix") return guardrails.flags.codexFix;
  return false;
}

function renderWorkflow(summary) {
  const stages = ["Start", "Plan", "Build", "Check", "Done"];
  const current = deriveStage(summary);
  const index = stages.indexOf(current);
  workflowEl.innerHTML = stages
    .map((stage, i) => {
      const classes = ["stage"];
      if (i < index) {
        classes.push("stage-done");
      }
      if (i === index) {
        classes.push("stage-active");
      }
      const hint =
        stage === "Start"
          ? "clarify and score"
          : stage === "Plan"
          ? "decision complete"
          : stage === "Build"
            ? "execute scoped tasks"
            : stage === "Check"
              ? "evaluate PASS/BLOCK"
              : "archive complete";
      return '<div class="' + classes.join(" ") + '"><strong>' + stage + "</strong><small>" + hint + "</small></div>";
    })
    .join("");
}

function renderHealth(detail) {
  const s = detail.summary;
  healthEl.innerHTML =
    '<div class="keyvals">' +
    '<div class="kv"><span>Plan ID</span><strong>' + s.plan_id + "</strong></div>" +
    '<div class="kv"><span>Status</span><strong>' + s.status + "</strong></div>" +
    '<div class="kv"><span>Decision</span><strong>' + s.decision + "</strong></div>" +
    '<div class="kv"><span>Mode</span><strong>' + s.selected_mode + " -> " + s.next_mode + "</strong></div>" +
    '<div class="kv"><span>Next Command</span><strong>' + s.next_command + "</strong></div>" +
    '<div class="kv"><span>Validation Errors</span><strong>' + String(detail.errors?.length || 0) + "</strong></div>" +
    "</div>";
}

function renderActionConsole(detail) {
  const summary = detail.summary || {};
  const planId = summary.plan_id || "<plan_id>";
  const projectId = summary.project_id || "default";
  const nextCommand = summary.next_command || "plan";
  const nextMode = summary.next_mode || "Plan";
  const recommended = `kfc flow next --project . --plan ${planId} --style narrative`;
  const applyCommand =
    nextCommand === "fix"
      ? `kfc flow apply --project . --plan ${planId} --route check --result block`
      : nextCommand === "done"
        ? `kfc flow apply --project . --plan ${planId} --route check --result pass`
        : `kfc flow apply --project . --plan ${planId} --route build --result progress`;

  actionEl.innerHTML = `
    <div class="guardrail-box">
      <strong>Observer Mode</strong>
      <p class="action-hint">This UI is read-only for safety. Run commands in terminal and use this page to monitor flow.</p>
      <ul class="guardrail-list">
        <li><span class="guardrail-reason">UI Mode:</span><span class="guardrail-next">${escapeHtml(UI_MODE)}</span></li>
        <li><span class="guardrail-reason">Project:</span><span class="guardrail-next">${escapeHtml(projectId)}</span></li>
        <li><span class="guardrail-reason">Plan:</span><span class="guardrail-next">${escapeHtml(planId)}</span></li>
        <li><span class="guardrail-reason">Next Command:</span><span class="guardrail-next">${escapeHtml(nextCommand)}</span></li>
        <li><span class="guardrail-reason">Next Mode:</span><span class="guardrail-next">${escapeHtml(nextMode)}</span></li>
      </ul>
    </div>
    <div class="action-section">
      <h3>Terminal Commands</h3>
      <p class="action-hint">Run these outside UI when you want to persist state changes.</p>
      <label>Apply state</label>
      <pre>${escapeHtml(applyCommand)}</pre>
      <label>Get narrative next step</label>
      <pre>${escapeHtml(recommended)}</pre>
      <label>Enable operator API mode (optional)</label>
      <pre>kfc plan serve --project . --mode operator --port 4310</pre>
    </div>
  `;
}

function renderWorkSurface(detail) {
  const tasks = parseChecklist(detail.sections["Implementation Tasks"]);
  const acs = parseChecklist(detail.sections["Acceptance Criteria"]);
  const wip = detail.sections["WIP Log"] || "";
  const startSummary = parseSummarySection(detail.sections["Start Summary"] || "");

  const wipStatus = (wip.match(/^- Status:\s*(.*)$/m) || ["", ""])[1];
  const wipBlockers = (wip.match(/^- Blockers:\s*(.*)$/m) || ["", ""])[1];
  const wipNext = (wip.match(/^- Next step:\s*(.*)$/m) || ["", ""])[1];
  const wipEvidence = (wip.match(/^- Evidence:\s*(.*)$/m) || ["", ""])[1];

  workEl.innerHTML = `
    <div class="split-2">
      <div>
        <h3>Start Summary</h3>
        <div class="keyvals">
          <div class="kv"><span>Required</span><strong>${escapeHtml(startSummary.required || "-")}</strong></div>
          <div class="kv"><span>Reason</span><strong>${escapeHtml(startSummary.reason || "-")}</strong></div>
          <div class="kv"><span>Selected Idea</span><strong>${escapeHtml(startSummary["selected idea"] || "-")}</strong></div>
          <div class="kv"><span>Alternatives</span><strong>${escapeHtml(startSummary["alternatives considered"] || "-")}</strong></div>
          <div class="kv"><span>Pre-mortem Risk</span><strong>${escapeHtml(startSummary["pre-mortem risk"] || "-")}</strong></div>
          <div class="kv"><span>Handoff Confidence</span><strong>${escapeHtml(startSummary["handoff confidence"] || "-")}</strong></div>
        </div>
      </div>
      <div>
        <h3>WIP Log</h3>
        <div class="keyvals">
          <div class="kv"><span>Status</span><strong>${escapeHtml(wipStatus || "-")}</strong></div>
          <div class="kv"><span>Blockers</span><strong>${escapeHtml(wipBlockers || "-")}</strong></div>
          <div class="kv"><span>Next step</span><strong>${escapeHtml(wipNext || "-")}</strong></div>
          <div class="kv"><span>Evidence</span><strong>${escapeHtml(wipEvidence || "-")}</strong></div>
        </div>
      </div>
    </div>
    <div class="split-2">
      <div>
        <h3>Implementation Tasks</h3>
        <div class="checklist-box" id="task-box">
          ${
            tasks.length
              ? tasks
                  .map(
                    (item) =>
                      '<label><input type="checkbox" disabled ' +
                      (item.checked ? "checked" : "") +
                      " />" +
                      escapeHtml(item.text) +
                      "</label>"
                  )
                  .join("")
              : "<small>No task checklist found.</small>"
          }
        </div>
      </div>
      <div>
        <h3>Acceptance Criteria</h3>
        <div class="checklist-box" id="ac-box">
          ${
            acs.length
              ? acs
                  .map(
                    (item) =>
                      '<label><input type="checkbox" disabled ' +
                      (item.checked ? "checked" : "") +
                      " />" +
                      escapeHtml(item.text) +
                      "</label>"
                  )
                  .join("")
              : "<small>No acceptance checklist found.</small>"
          }
        </div>
      </div>
    </div>
  `;
}

function getSharedWipPayload() {
  const evidenceText = document.querySelector("#evidence-input")?.value || "";
  const inlineEvidence = document.querySelector("#wip-evidence")?.value || "";
  const evidence = [...evidenceText.split(/\r?\n/), ...inlineEvidence.split("|")]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return {
    status: document.querySelector("#wip-status")?.value || "",
    blockers: document.querySelector("#wip-blockers")?.value || "",
    next_step: document.querySelector("#wip-next")?.value || "",
    evidence
  };
}

function getFindings() {
  return (document.querySelector("#findings-input")?.value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function renderNoSelectionState(reason, nextStep) {
  const card =
    '<div class="empty-panel">' +
    "<strong>" +
    escapeHtml(reason) +
    "</strong>" +
    "<small>" +
    escapeHtml(nextStep) +
    "</small>" +
    "</div>";
  workflowEl.innerHTML = card;
  healthEl.innerHTML = card;
  actionEl.innerHTML = card;
  workEl.innerHTML = card;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

function resolveFailureHint(errorCode) {
  if (errorCode === "START_GATE_FAILED") {
    return "Complete Start Summary in Work Panel, then retry Build.";
  }
  if (errorCode === "PLAN_NOT_FOUND") {
    return "Select a valid plan in sidebar and retry.";
  }
  if (errorCode === "VERSION_CONFLICT") {
    return "Reload plan detail and retry action.";
  }
  if (errorCode === "COMPLETION_GATE_FAILED") {
    return "Ensure all Acceptance Criteria are checked before archive.";
  }
  return "Check Action Guards and follow the recommended next step.";
}

async function triggerCodexAction(detail, actionType, modeHint, options = {}) {
  const projectId = detail.summary.project_id;
  const planId = detail.summary.plan_id;
  const isChained = Boolean(options.chained);
  setStatus("Running Codex action: " + actionType + "...");
  addActivity(
    "codex_run_requested",
    (isChained ? "Auto-requested " : "Requested ") + actionType,
    "plan=" + planId
  );
  const res = await postJson(projectApiBase(projectId) + "/codex/action", {
    plan_id: planId,
    action_type: actionType,
    mode_hint: modeHint
  });

  if (!res.ok) {
    const errorCode = res.body.error_code || "";
    setStatus(
      "Codex action failed: " +
        (errorCode || res.body.error || "unknown") +
        ". Next: " +
        resolveFailureHint(errorCode)
    );
    addActivity("codex_run_failed", "Action failed", JSON.stringify(res.body, null, 2));
    return;
  }

  setStatus("Codex action " + actionType + ": " + res.body.status);
  addActivity(
    res.body.status === "completed" ? "codex_run_completed" : "codex_run_failed",
    "Action " + actionType + " -> " + res.body.status,
    (res.body.stdout_tail || "") + (res.body.stderr_tail ? "\n" + res.body.stderr_tail : "")
  );

  if (actionType === "build" && res.body.status === "completed") {
    setStatus("Build completed. Auto-starting check...");
    addActivity("codex_chain", "Auto chain: build -> check", "plan=" + planId);
    await triggerCodexAction(detail, "check", "Plan", { chained: true });
  }
}

function bindActionConsole(detail) {
  document.querySelector("#codex-plan")?.addEventListener("click", () => triggerCodexAction(detail, "plan", "Plan"));
  document.querySelector("#codex-build")?.addEventListener("click", () => triggerCodexAction(detail, "build", "Build"));
  document.querySelector("#codex-check")?.addEventListener("click", () => triggerCodexAction(detail, "check", "Plan"));
  document.querySelector("#codex-fix")?.addEventListener("click", () => triggerCodexAction(detail, "fix", "Build"));

  document.querySelector("#apply-build-result")?.addEventListener("click", async () => {
    const projectId = detail.summary.project_id;
    const planId = detail.summary.plan_id;
    const payload = {
      action_type: "build_result",
      mode_hint: "Build",
      expected_updated_at: detail.summary.updated_at || "",
      task_updates: collectChecklist(".task-item"),
      wip: getSharedWipPayload()
    };
    const res = await postJson(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "/automation/apply", payload);
    if (!res.ok) {
      const errorCode = res.body.error_code || "";
      setStatus(
        "Build apply failed: " +
          (res.body.error || errorCode || "unknown") +
          ". Next: " +
          resolveFailureHint(errorCode)
      );
      return;
    }
    setStatus("Build result applied.");
    addActivity("build_applied", "Build result persisted", JSON.stringify(res.body, null, 2));
    loadDetail();
    loadList();
  });

  document.querySelector("#apply-check-block")?.addEventListener("click", async () => {
    const projectId = detail.summary.project_id;
    const planId = detail.summary.plan_id;
    const payload = {
      action_type: "check_result",
      mode_hint: "Plan",
      expected_updated_at: detail.summary.updated_at || "",
      ac_updates: collectChecklist(".ac-item"),
      wip: getSharedWipPayload(),
      check: {
        result: "BLOCK",
        findings: getFindings()
      }
    };
    const res = await postJson(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "/automation/apply", payload);
    if (!res.ok) {
      const errorCode = res.body.error_code || "";
      setStatus(
        "Check BLOCK apply failed: " +
          (res.body.error || errorCode || "unknown") +
          ". Next: " +
          resolveFailureHint(errorCode)
      );
      return;
    }
    setStatus("Check BLOCK applied.");
    addActivity("check_block_applied", "Check BLOCK persisted", JSON.stringify(res.body, null, 2));
    loadDetail();
    loadList();
  });

  document.querySelector("#apply-check-pass")?.addEventListener("click", async () => {
    const projectId = detail.summary.project_id;
    const planId = detail.summary.plan_id;
    const payload = {
      action_type: "check_result",
      mode_hint: "Plan",
      expected_updated_at: detail.summary.updated_at || "",
      ac_updates: collectChecklist(".ac-item"),
      wip: getSharedWipPayload(),
      check: {
        result: "PASS",
        findings: getFindings()
      }
    };
    const res = await postJson(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "/automation/apply", payload);
    if (!res.ok) {
      const errorCode = res.body.error_code || "";
      setStatus(
        "Check PASS apply failed: " +
          (res.body.error || errorCode || "unknown") +
          ". Next: " +
          resolveFailureHint(errorCode)
      );
      return;
    }
    setStatus("Check PASS applied.");
    addActivity("check_pass_applied", "Check PASS persisted", JSON.stringify(res.body, null, 2));
    loadDetail();
    loadList();
  });

  document.querySelector("#archive-plan")?.addEventListener("click", async () => {
    const projectId = detail.summary.project_id;
    const planId = detail.summary.plan_id;
    const res = await postJson(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "/complete", {
      check_passed: true
    });
    if (!res.ok) {
      const errorCode = res.body.error_code || "";
      setStatus(
        "Archive failed: " +
          (res.body.error || errorCode || "unknown") +
          ". Next: " +
          resolveFailureHint(errorCode)
      );
      return;
    }
    setStatus("Plan archived.");
    addActivity("plan_archived", "Plan archived", JSON.stringify(res.body, null, 2));
    loadDetail();
    loadList();
  });
}

async function loadDetail() {
  const route = parseRoute();
  loadPersistedActivity();
  if (!route) {
    renderNoSelectionState(
      "No plan selected.",
      "Choose a plan from the left list. If none exists, run kfc plan init --project . --new."
    );
    return;
  }

  if (projectEl && projectEl.value !== route.projectId) {
    projectEl.value = route.projectId;
  }
  projectBadgeEl.textContent = "project: " + route.projectId;

  const res = await fetch(projectApiBase(route.projectId) + "/plans/" + encodeURIComponent(route.planId) + "?include_done=true");
  if (!res.ok) {
    setStatus("Plan not found. Select another plan or refresh list.");
    renderNoSelectionState("Selected plan is unavailable.", "Refresh list or pick another plan from sidebar.");
    return;
  }

  const detail = await res.json();
  currentDetail = detail;
  renderWorkflow(detail.summary);
  renderHealth(detail);
  renderActionConsole(detail);
  renderWorkSurface(detail);
  attachStream(route.projectId, route.planId);
}

function startPollingFallback() {
  if (pollTimer) {
    return;
  }
  pollTimer = setInterval(() => {
    loadDetail();
    loadList();
  }, 15000);
}

function stopPollingFallback() {
  if (!pollTimer) {
    return;
  }
  clearInterval(pollTimer);
  pollTimer = null;
}

function attachStream(projectId, planId) {
  if (currentStream) {
    currentStream.close();
  }

  currentStream = new EventSource(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "/events");

  if (staleTimer) {
    clearInterval(staleTimer);
  }

  staleTimer = setInterval(() => {
    if (!lastHeartbeatTs) {
      return;
    }
    if (Date.now() - lastHeartbeatTs > 60000) {
      setConnectionState("stale");
      setStatus("Connection stale. Resyncing...");
      startPollingFallback();
      loadDetail();
      loadList();
    }
  }, 5000);

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
    loadDetail();
    loadList();
  });

  ["plan_updated", "plan_deleted", "plan_invalid", "plan_archived"].forEach((eventType) => {
    currentStream.addEventListener(eventType, (evt) => {
      const payload = evt?.data || "";
      addActivity(eventType, "Plan event received", payload);
      setStatus("Live update received: " + eventType);
      loadDetail();
      loadList();
    });
  });

  ["codex_run_started", "codex_run_completed", "codex_run_failed"].forEach((eventType) => {
    currentStream.addEventListener(eventType, (evt) => {
      const payloadText = evt?.data || "{}";
      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = {};
      }
      const summary = payload.action_type ? payload.action_type + " -> " + (payload.status || eventType) : eventType;
      addActivity(eventType, summary, payload.stdout_tail || payload.stderr_tail || payloadText);
      setStatus("Codex run event: " + summary);
    });
  });

  currentStream.onerror = () => {
    setConnectionState("offline");
    setStatus("Disconnected. Reconnecting...");
    startPollingFallback();
  };
}

async function loadList() {
  const projectId = currentProjectId();
  projectBadgeEl.textContent = "project: " + (projectId || "-");
  if (!projectId) {
    planListEl.innerHTML =
      '<li class="empty-state"><strong>No projects configured.</strong><small>Run <code>kfc plan workspace add &lt;name&gt; --project &lt;path&gt;</code>.</small></li>';
    return;
  }
  const includeDone = currentFilter() !== "active";
  currentPlans = await fetchPlans(projectId, includeDone);
  renderList(currentPlans);

  const route = parseRoute();
  if (!route && currentPlans.length > 0) {
    const nextPlan = currentPlans[0];
    location.hash = "#/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(nextPlan.plan_id);
  }
}

projectEl?.addEventListener("change", () => {
  loadList();
  loadDetail();
});

filterEl?.addEventListener("change", () => {
  loadList();
  loadDetail();
});

window.addEventListener("hashchange", () => loadDetail());

setConnectionState("disconnected");
fetchProjects()
  .then((projects) => {
    renderProjects(projects);
    return loadList();
  })
  .then(() => loadDetail())
  .catch((err) => {
    setStatus("Failed to initialize UI: " + (err?.message || String(err)));
    addActivity("ui_error", "Initialization failure", err?.stack || String(err));
  });
