const projectEl = document.querySelector("#project-filter");
const planListEl = document.querySelector("#plan-list");
const detailEl = document.querySelector("#plan-detail");
const statusEl = document.querySelector("#status");
const filterEl = document.querySelector("#plan-filter");

let currentStream;
let lastHeartbeatTs = 0;
let staleTimer = null;
let pollTimer = null;

function currentFilter() {
  return filterEl?.value || "active";
}

function currentProjectId() {
  return projectEl?.value || "";
}

function projectApiBase(projectId) {
  return "/api/projects/" + encodeURIComponent(projectId);
}

async function fetchProjects() {
  const res = await fetch("/api/projects");
  const data = await res.json();
  return data.projects ?? [];
}

async function fetchPlans(projectId, includeDone) {
  const res = await fetch(projectApiBase(projectId) + "/plans?include_done=" + (includeDone ? "true" : "false"));
  const data = await res.json();
  return data.plans ?? [];
}

function renderProjects(projects) {
  projectEl.innerHTML = projects
    .map((p) => '<option value="' + p.project_id + '">' + p.project_id + " - " + p.project_dir + "</option>")
    .join("");
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
      return (
        '<li><button data-plan-id="' + p.plan_id + '">' + p.plan_id + " - " + p.title + archived + invalid + "</button></li>"
      );
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
  const m = hash.match(/^#\/projects\/([^/]+)\/plans\/(.+)$/);
  if (!m) {
    return null;
  }
  return {
    projectId: decodeURIComponent(m[1]),
    planId: decodeURIComponent(m[2])
  };
}

async function loadDetail() {
  const route = parseRoute();
  if (!route) {
    detailEl.innerHTML = "<p>Select a plan.</p>";
    return;
  }

  const { projectId, planId } = route;
  const res = await fetch(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "?include_done=true");
  if (!res.ok) {
    detailEl.innerHTML = "<p>Plan not found.</p>";
    return;
  }

  const data = await res.json();
  const errors = (data.errors || []).map((e) => "<li>" + e + "</li>").join("");
  const sections = Object.entries(data.sections || {})
    .map(([name, content]) => "<section><h4>" + name + "</h4><pre>" + content + "</pre></section>")
    .join("");

  detailEl.innerHTML = `
    <h3>${data.summary.plan_id} - ${data.summary.title}</h3>
    <p>Status: ${data.summary.status} | Decision: ${data.summary.decision}</p>
    <p>Mode: ${data.summary.selected_mode} -> ${data.summary.next_mode}</p>
    <p>Next: ${data.summary.next_command}</p>
    <p>Archived: ${data.summary.is_archived ? "yes" : "no"}</p>
    <div>
      <button id="set-status-active">Set Status Active</button>
      <button id="toggle-decision">Toggle Decision</button>
      <button id="toggle-task-0">Toggle Task 1</button>
      <button id="toggle-gate-0">Toggle Gate 1</button>
      <button id="complete-archive">Complete & Archive</button>
      <button id="run-codex-plan">Send Plan Action to Codex</button>
    </div>
    <h4>Validation</h4>
    <ul>${errors || "<li>No validation errors</li>"}</ul>
    ${sections}
  `;

  bindActions(projectId, planId, data);
  attachStream(projectId, planId);
}

async function patch(url, payload) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

function parseFirstChecklistState(sectionText) {
  const m = (sectionText || "").match(/^- \[( |x|X)\]/m);
  return m ? m[1].toLowerCase() === "x" : false;
}

function bindActions(projectId, planId, data) {
  const updatedAt = data.summary.updated_at || "";
  const base = projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId);

  document.querySelector("#set-status-active")?.addEventListener("click", async () => {
    const out = await patch(base + "/status", {
      status: "active",
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Status updated.";
    loadDetail();
    loadList();
  });

  document.querySelector("#toggle-decision")?.addEventListener("click", async () => {
    const nextDecision = data.summary.decision === "GO" ? "NO_GO" : "GO";
    const out = await patch(base + "/decision", {
      decision: nextDecision,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Decision updated.";
    loadDetail();
    loadList();
  });

  document.querySelector("#toggle-task-0")?.addEventListener("click", async () => {
    const current = parseFirstChecklistState(data.sections["Implementation Tasks"]);
    const out = await patch(base + "/task", {
      task_index: 0,
      checked: !current,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Task updated.";
    loadDetail();
    loadList();
  });

  document.querySelector("#toggle-gate-0")?.addEventListener("click", async () => {
    const current = parseFirstChecklistState(data.sections["Go/No-Go Checklist"]);
    const out = await patch(base + "/gate", {
      gate_index: 0,
      checked: !current,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Gate updated.";
    loadDetail();
    loadList();
  });

  document.querySelector("#complete-archive")?.addEventListener("click", async () => {
    const res = await fetch(base + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_passed: true })
    });
    const out = await res.json();
    if (!res.ok) {
      statusEl.textContent = out.error || out.error_code || "Complete failed.";
      return;
    }
    statusEl.textContent = "Plan archived: " + (out.archived_path || "done");
    loadDetail();
    loadList();
  });

  document.querySelector("#run-codex-plan")?.addEventListener("click", async () => {
    const res = await fetch(projectApiBase(projectId) + "/codex/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        action_type: "plan",
        mode_hint: "Plan"
      })
    });
    const out = await res.json();
    statusEl.textContent = "Codex action: " + (out.status || out.error_code || "unknown");
  });
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
      statusEl.textContent = "Connection stale. Resyncing...";
      startPollingFallback();
      loadDetail();
      loadList();
    }
  }, 5000);

  currentStream.addEventListener("connected", () => {
    statusEl.textContent = "Connected.";
    lastHeartbeatTs = Date.now();
    stopPollingFallback();
  });
  currentStream.addEventListener("heartbeat", () => {
    lastHeartbeatTs = Date.now();
  });
  currentStream.addEventListener("resync_required", () => {
    statusEl.textContent = "Stream replay unavailable. Full resync.";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_updated", () => {
    statusEl.textContent = "Live update received: plan_updated";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_deleted", () => {
    statusEl.textContent = "Live update received: plan_deleted";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_invalid", () => {
    statusEl.textContent = "Live update received: plan_invalid";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_archived", () => {
    statusEl.textContent = "Live update received: plan_archived";
    loadDetail();
    loadList();
  });
  currentStream.onerror = () => {
    statusEl.textContent = "Disconnected. Reconnecting...";
    startPollingFallback();
  };
}

async function loadList() {
  const projectId = currentProjectId();
  if (!projectId) {
    planListEl.innerHTML = "<li>No projects configured</li>";
    return;
  }
  const includeDone = currentFilter() !== "active";
  const plans = await fetchPlans(projectId, includeDone);
  renderList(plans);
}

projectEl?.addEventListener("change", () => {
  loadList();
  loadDetail();
});

filterEl?.addEventListener("change", () => {
  loadList();
});

window.addEventListener("hashchange", () => loadDetail());
fetchProjects()
  .then((projects) => {
    renderProjects(projects);
    return loadList();
  })
  .then(() => loadDetail());

