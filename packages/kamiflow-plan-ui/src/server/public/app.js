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

let currentStream;
let lastHeartbeatTs = 0;
let staleTimer = null;
let pollTimer = null;
let currentDetail = null;
let currentPlans = [];
let activityItems = [];

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

function addActivity(eventType, message, detail) {
  const entry = {
    eventType,
    message,
    detail: detail || "",
    ts: nowIso()
  };
  activityItems = [entry, ...activityItems].slice(0, 60);
  activityEl.innerHTML = activityItems
    .map(
      (item) =>
        '<li class="activity-item">' +
        "<time>" + item.ts + "</time>" +
        "<strong>" + item.eventType + "</strong>" +
        "<div>" + item.message + "</div>" +
        (item.detail ? "<pre>" + escapeHtml(item.detail) + "</pre>" : "") +
        "</li>"
    )
    .join("");
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
    planListEl.innerHTML = "<li>No plans found in selected project</li>";
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
  const reasons = [];

  if (isArchived) {
    flags.codexPlan = true;
    flags.codexBuild = true;
    flags.codexCheck = true;
    flags.codexFix = true;
    flags.applyBuild = true;
    flags.applyCheckBlock = true;
    flags.applyCheckPass = true;
    flags.archive = true;
    reasons.push("Plan is archived.");
    return { flags, reasons };
  }

  if (isDone) {
    flags.codexBuild = true;
    flags.codexCheck = true;
    flags.codexFix = true;
    flags.applyBuild = true;
    flags.applyCheckBlock = true;
    flags.applyCheckPass = true;
    reasons.push("Plan is already done.");
  }

  if (!startGate.ok) {
    flags.codexBuild = true;
    flags.applyBuild = true;
    reasons.push("Start gate: " + startGate.reason);
  }

  if (summary.decision !== "GO") {
    flags.codexBuild = true;
    flags.applyBuild = true;
    reasons.push("Build actions require decision GO.");
  }

  if (summary.next_mode !== "Build" && summary.next_command !== "build" && !isDone) {
    flags.codexBuild = true;
    reasons.push("Current handoff is not build-ready.");
  }

  if (!allAcChecked) {
    flags.archive = true;
    reasons.push("Archive requires all Acceptance Criteria checked.");
  }

  if (!isDone) {
    flags.archive = true;
  }

  return { flags, reasons };
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
  const guardrails = buildActionGuardrails(detail);
  const btnDisabled = (flag) => (flag ? "disabled" : "");
  const reasonHtml = guardrails.reasons.length
    ? '<ul class="guardrail-list">' +
      guardrails.reasons.map((reason) => "<li>" + escapeHtml(reason) + "</li>").join("") +
      "</ul>"
    : '<p class="guardrail-ok">All action gates are satisfied.</p>';

  actionEl.innerHTML = `
    <div class="action-grid">
      <button class="btn-primary" id="codex-plan" ${btnDisabled(guardrails.flags.codexPlan)}>Run Plan</button>
      <button class="btn-primary" id="codex-build" ${btnDisabled(guardrails.flags.codexBuild)}>Run Build</button>
      <button class="btn-primary" id="codex-check" ${btnDisabled(guardrails.flags.codexCheck)}>Run Check</button>
      <button class="btn-primary" id="codex-fix" ${btnDisabled(guardrails.flags.codexFix)}>Run Fix</button>
      <button id="apply-build-result" ${btnDisabled(guardrails.flags.applyBuild)}>Apply Build Result</button>
      <button class="btn-warn" id="apply-check-block" ${btnDisabled(guardrails.flags.applyCheckBlock)}>Apply Check BLOCK</button>
      <button class="btn-primary" id="apply-check-pass" ${btnDisabled(guardrails.flags.applyCheckPass)}>Apply Check PASS</button>
      <button class="btn-danger" id="archive-plan" ${btnDisabled(guardrails.flags.archive)}>Archive Done</button>
    </div>
    <div class="guardrail-box">
      <strong>Action Guards</strong>
      ${reasonHtml}
    </div>
    <label for="findings-input">Check Findings (one line each)</label>
    <textarea id="findings-input" placeholder="Missing test coverage\nNeeds rollback guard"></textarea>
    <label for="evidence-input">Evidence (one line each)</label>
    <textarea id="evidence-input" placeholder="npm run plan-ui:test -> pass"></textarea>
  `;

  bindActionConsole(detail);
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
    <div>
      <h3>Start Summary</h3>
      <label for="start-required">Required</label>
      <select id="start-required">
        <option value="yes" ${(startSummary.required || "yes") === "yes" ? "selected" : ""}>yes</option>
        <option value="no" ${(startSummary.required || "yes") === "no" ? "selected" : ""}>no</option>
      </select>
      <label for="start-reason">Reason</label>
      <input id="start-reason" value="${escapeHtml(startSummary.reason || "")}" />
      <label for="start-selected-idea">Selected Idea</label>
      <input id="start-selected-idea" value="${escapeHtml(startSummary["selected idea"] || "")}" />
      <label for="start-alternatives">Alternatives Considered</label>
      <input id="start-alternatives" value="${escapeHtml(startSummary["alternatives considered"] || "")}" />
      <label for="start-premortem">Pre-mortem Risk</label>
      <input id="start-premortem" value="${escapeHtml(startSummary["pre-mortem risk"] || "")}" />
      <label for="start-confidence">Handoff Confidence</label>
      <input id="start-confidence" value="${escapeHtml(startSummary["handoff confidence"] || "")}" />
    </div>
    <div class="split-2">
      <div>
        <h3>Implementation Tasks</h3>
        <div class="checklist-box" id="task-box">
          ${tasks
            .map(
              (item) =>
                '<label><input type="checkbox" class="task-item" data-index="' +
                item.index +
                '" ' +
                (item.checked ? "checked" : "") +
                " />" +
                escapeHtml(item.text) +
                "</label>"
            )
            .join("")}
        </div>
      </div>
      <div>
        <h3>Acceptance Criteria</h3>
        <div class="checklist-box" id="ac-box">
          ${acs
            .map(
              (item) =>
                '<label><input type="checkbox" class="ac-item" data-index="' +
                item.index +
                '" ' +
                (item.checked ? "checked" : "") +
                " />" +
                escapeHtml(item.text) +
                "</label>"
            )
            .join("")}
        </div>
      </div>
    </div>
    <div>
      <h3>WIP Log</h3>
      <label for="wip-status">Status</label>
      <input id="wip-status" value="${escapeHtml(wipStatus)}" />
      <label for="wip-blockers">Blockers</label>
      <input id="wip-blockers" value="${escapeHtml(wipBlockers)}" />
      <label for="wip-next">Next step</label>
      <input id="wip-next" value="${escapeHtml(wipNext)}" />
      <label for="wip-evidence">Evidence</label>
      <input id="wip-evidence" value="${escapeHtml(wipEvidence)}" placeholder="item1 | item2" />
      <button id="save-wip">Save WIP</button>
    </div>
  `;

  document.querySelector("#save-wip")?.addEventListener("click", async () => {
    const projectId = detail.summary.project_id;
    const planId = detail.summary.plan_id;
    const base = projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId);
    const payload = {
      start_summary: {
        required: document.querySelector("#start-required")?.value || "yes",
        reason: document.querySelector("#start-reason")?.value || "",
        selected_idea: document.querySelector("#start-selected-idea")?.value || "",
        alternatives: document.querySelector("#start-alternatives")?.value || "",
        pre_mortem_risk: document.querySelector("#start-premortem")?.value || "",
        handoff_confidence: document.querySelector("#start-confidence")?.value || ""
      },
      wip: {
        status: document.querySelector("#wip-status")?.value || "",
        blockers: document.querySelector("#wip-blockers")?.value || "",
        next_step: document.querySelector("#wip-next")?.value || "",
        evidence: (document.querySelector("#wip-evidence")?.value || "")
          .split("|")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      }
    };
    const res = await postJson(base + "/progress", payload);
    if (!res.ok) {
      setStatus("WIP save failed: " + (res.body.error || res.body.error_code || "unknown"));
      return;
    }
    addActivity("wip_saved", "WIP log updated", "plan=" + planId);
    setStatus("WIP updated.");
    loadDetail();
    loadList();
  });
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

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function triggerCodexAction(detail, actionType, modeHint) {
  const projectId = detail.summary.project_id;
  const planId = detail.summary.plan_id;
  setStatus("Running Codex action: " + actionType + "...");
  addActivity("codex_run_requested", "Requested " + actionType, "plan=" + planId);
  const res = await postJson(projectApiBase(projectId) + "/codex/action", {
    plan_id: planId,
    action_type: actionType,
    mode_hint: modeHint
  });

  if (!res.ok) {
    setStatus("Codex action failed: " + (res.body.error_code || res.body.error || "unknown"));
    addActivity("codex_run_failed", "Action failed", JSON.stringify(res.body, null, 2));
    return;
  }

  setStatus("Codex action " + actionType + ": " + res.body.status);
  addActivity(
    res.body.status === "completed" ? "codex_run_completed" : "codex_run_failed",
    "Action " + actionType + " -> " + res.body.status,
    (res.body.stdout_tail || "") + (res.body.stderr_tail ? "\n" + res.body.stderr_tail : "")
  );
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
      setStatus("Build apply failed: " + (res.body.error || res.body.error_code || "unknown"));
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
      setStatus("Check BLOCK apply failed: " + (res.body.error || res.body.error_code || "unknown"));
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
      setStatus("Check PASS apply failed: " + (res.body.error || res.body.error_code || "unknown"));
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
      setStatus("Archive failed: " + (res.body.error || res.body.error_code || "unknown"));
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
  if (!route) {
    workflowEl.innerHTML = "<p>Select a plan to start.</p>";
    healthEl.innerHTML = "<p>No plan selected.</p>";
    actionEl.innerHTML = "<p>No actions available.</p>";
    workEl.innerHTML = "<p>No work surface.</p>";
    return;
  }

  if (projectEl && projectEl.value !== route.projectId) {
    projectEl.value = route.projectId;
  }
  projectBadgeEl.textContent = "project: " + route.projectId;

  const res = await fetch(projectApiBase(route.projectId) + "/plans/" + encodeURIComponent(route.planId) + "?include_done=true");
  if (!res.ok) {
    setStatus("Plan not found.");
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
    planListEl.innerHTML = "<li>No projects configured</li>";
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
