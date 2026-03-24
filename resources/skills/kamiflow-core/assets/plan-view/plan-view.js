const POLL_MS = __PLAN_VIEW_POLL_INTERVAL_MS__;
let previousSignature = "";

function safeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function progressLabel(group) {
  const checked = Number(group?.checked || 0);
  const total = Number(group?.total || 0);
  return checked + "/" + total;
}

function progressWidth(group) {
  const checked = Number(group?.checked || 0);
  const total = Number(group?.total || 0);
  if (total <= 0) {
    return "0%";
  }
  return Math.max(0, Math.min(100, Math.round((checked / total) * 100))) + "%";
}

function snapshotSignature(snapshot) {
  return JSON.stringify([
    snapshot.has_active_plan,
    snapshot.plan_id,
    snapshot.title,
    snapshot.derived_state,
    snapshot.status,
    snapshot.decision,
    snapshot.lifecycle_phase,
    snapshot.next_command,
    snapshot.next_mode,
    snapshot.updated_at,
    snapshot.release_impact,
    snapshot.open_decisions_remaining,
    snapshot.latest_status,
    snapshot.latest_blockers,
    snapshot.latest_next_step,
    snapshot.project_fit
  ]);
}

function applyDecisionBadge(decision) {
  const element = document.getElementById("decision");
  const normalized = safeText(decision, "None");
  element.textContent = "Decision: " + normalized;
  element.className = "badge " + ({
    GO: "decision-go",
    PASS: "decision-pass",
    PENDING: "decision-pending",
    BLOCK: "decision-block",
    "": "decision-none"
  }[normalized.toUpperCase()] || "decision-none");
}

function renderSnapshot(snapshot) {
  document.getElementById("title").textContent = safeText(snapshot.title, "No Active Plan");
  document.getElementById("derived-state").textContent = safeText(snapshot.derived_state, "No Active Plan");
  applyDecisionBadge(snapshot.decision);
  document.getElementById("release-impact").textContent = "Release: " + safeText(snapshot.release_impact, "none");
  document.getElementById("freshness").textContent = snapshot.updated_at ? "Updated " + snapshot.updated_at : "No active plan timestamp";
  document.getElementById("next-command").textContent = safeText(snapshot.next_command, "None");
  document.getElementById("next-mode").textContent = safeText(snapshot.next_mode, "None");
  document.getElementById("open-decisions").textContent = String(Number(snapshot.open_decisions_remaining || 0));
  document.getElementById("lifecycle").textContent = safeText(snapshot.lifecycle_phase, "none");
  document.getElementById("tasks-count").textContent = progressLabel(snapshot.progress?.implementation);
  document.getElementById("acceptance-count").textContent = progressLabel(snapshot.progress?.acceptance);
  document.getElementById("gng-count").textContent = progressLabel(snapshot.progress?.go_no_go);
  document.getElementById("tasks-meter").style.width = progressWidth(snapshot.progress?.implementation);
  document.getElementById("acceptance-meter").style.width = progressWidth(snapshot.progress?.acceptance);
  document.getElementById("gng-meter").style.width = progressWidth(snapshot.progress?.go_no_go);
  document.getElementById("latest-status").textContent = safeText(snapshot.latest_status, "No current status line.");
  document.getElementById("latest-blockers").textContent = safeText(snapshot.latest_blockers, "None.");
  document.getElementById("latest-next-step").textContent = safeText(snapshot.latest_next_step, "No next step recorded.");
  document.getElementById("project-fit").textContent = safeText(snapshot.project_fit, "No project-fit summary available.");
  document.getElementById("updated-at").textContent = safeText(snapshot.updated_at, "Unknown");
  document.getElementById("plan-path").textContent = safeText(snapshot.plan_path, "No active plan path.");
}

async function loadSnapshot() {
  try {
    const response = await fetch("/snapshot.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("snapshot request failed with status " + response.status);
    }
    const snapshot = await response.json();
    const signature = snapshotSignature(snapshot);
    if (signature !== previousSignature) {
      renderSnapshot(snapshot);
      previousSignature = signature;
    }
  } catch (error) {
    document.getElementById("freshness").textContent = "Snapshot unavailable";
    document.getElementById("latest-blockers").textContent = error.message;
  }
}

loadSnapshot();
window.setInterval(loadSnapshot, POLL_MS);
