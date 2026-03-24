import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const PLAN_VIEW_DIR = path.join(".local", "plan-view");
export const PLAN_VIEW_RUNTIME_PATH = path.join(PLAN_VIEW_DIR, "runtime.json");
export const PLAN_VIEW_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const PLAN_VIEW_POLL_INTERVAL_MS = 5 * 1000;

export function resolvePlanViewDir(projectDir) {
  return path.join(projectDir, PLAN_VIEW_DIR);
}

export function resolvePlanViewRuntimePath(projectDir) {
  return path.join(projectDir, PLAN_VIEW_RUNTIME_PATH);
}

export async function ensurePlanViewDir(projectDir) {
  await fsp.mkdir(resolvePlanViewDir(projectDir), { recursive: true });
}

export async function readPlanViewRuntime(projectDir) {
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  if (!fs.existsSync(runtimePath)) {
    return {
      exists: false,
      valid: false,
      path: runtimePath,
      marker: null
    };
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(runtimePath, "utf8"));
    const marker = normalizePlanViewRuntime(parsed);
    if (!marker) {
      return {
        exists: true,
        valid: false,
        path: runtimePath,
        marker: null,
        reason: "invalid runtime marker"
      };
    }
    return {
      exists: true,
      valid: true,
      path: runtimePath,
      marker
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      path: runtimePath,
      marker: null,
      reason: `invalid JSON: ${error.message}`
    };
  }
}

export async function writePlanViewRuntime(projectDir, marker) {
  await ensurePlanViewDir(projectDir);
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  const normalizedMarker = normalizePlanViewRuntime(marker);
  if (!normalizedMarker) {
    throw new Error("Cannot write an invalid plan-view runtime marker.");
  }
  await fsp.writeFile(runtimePath, `${JSON.stringify(normalizedMarker, null, 2)}\n`, "utf8");
  return {
    path: runtimePath,
    marker: normalizedMarker
  };
}

export async function clearPlanViewRuntime(projectDir, expectedPid = null) {
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  if (!fs.existsSync(runtimePath)) {
    return false;
  }

  if (expectedPid !== null) {
    const runtime = await readPlanViewRuntime(projectDir);
    if (!runtime.valid || Number(runtime.marker?.pid) !== Number(expectedPid)) {
      return false;
    }
  }

  await fsp.rm(runtimePath, { force: true });
  return true;
}

export function normalizePlanViewRuntime(value) {
  const pid = Number(value?.pid);
  const port = Number(value?.port);
  const url = String(value?.url || "").trim();
  const projectDir = String(value?.project_dir || "").trim();
  const startedAt = String(value?.started_at || "").trim();

  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }
  if (!/^https?:\/\/127\.0\.0\.1:\d+\/?$/i.test(url)) {
    return null;
  }
  if (!projectDir || !path.isAbsolute(projectDir)) {
    return null;
  }
  if (!startedAt) {
    return null;
  }

  return {
    pid,
    port,
    url: url.endsWith("/") ? url : `${url}/`,
    project_dir: projectDir,
    started_at: startedAt
  };
}

export async function probePlanView(baseUrl, route = "/health", timeoutMs = 1500) {
  let targetUrl = "";
  try {
    targetUrl = new URL(route, ensureTrailingSlash(baseUrl)).toString();
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    return {
      ok: response.ok,
      status: response.status,
      url: targetUrl
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      error: error.message
    };
  }
}

export function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

export function terminateProcess(pid) {
  try {
    process.kill(Number(pid), "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export async function bestEffortOpenUrl(url) {
  if (String(process.env.KAMIFLOW_PLAN_VIEW_NO_BROWSER || "").trim() === "1") {
    return {
      attempted: false,
      opened: false,
      command: "disabled-by-env"
    };
  }

  try {
    let child;
    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/d", "/s", "/c", "start", "", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else {
      command = "xdg-open";
      args = [url];
    }

    child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: false
    });
    child.unref();
    return {
      attempted: true,
      opened: true,
      command: [command, ...args].join(" ")
    };
  } catch (error) {
    return {
      attempted: true,
      opened: false,
      command: "",
      error: error.message
    };
  }
}

export function buildPlanViewHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kami Flow Core Plan View</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f4efe4;
      --ink: #171411;
      --muted: #5d564d;
      --line: rgba(23, 20, 17, 0.12);
      --accent: #b14f2b;
      --accent-soft: rgba(177, 79, 43, 0.12);
      --good: #265f43;
      --warn: #8c5b1c;
      --cold: #2d526b;
      --shadow: 0 24px 60px rgba(23, 20, 17, 0.08);
      font-family: "Segoe UI Variable", "IBM Plex Sans", "Trebuchet MS", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(177, 79, 43, 0.12), transparent 34%),
        linear-gradient(180deg, #fbf7ee 0%, var(--paper) 100%);
      color: var(--ink);
    }

    .shell {
      width: min(980px, calc(100vw - 32px));
      margin: 28px auto;
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: rgba(255, 252, 245, 0.92);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .masthead {
      display: grid;
      gap: 10px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
    }

    .eyebrow {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }

    h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(34px, 5vw, 56px);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }

    .badge-row,
    .band {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 12px;
      align-items: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.65);
      font-size: 13px;
      font-weight: 600;
    }

    .badge.state {
      background: var(--accent-soft);
      border-color: rgba(177, 79, 43, 0.22);
      color: var(--accent);
    }

    .badge.decision-go,
    .badge.decision-pass {
      color: var(--good);
      border-color: rgba(38, 95, 67, 0.24);
      background: rgba(38, 95, 67, 0.1);
    }

    .badge.decision-pending,
    .badge.decision-block,
    .badge.decision-none {
      color: var(--warn);
      border-color: rgba(140, 91, 28, 0.2);
      background: rgba(140, 91, 28, 0.08);
    }

    .layout {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }

    .band {
      padding: 14px 0;
      border-bottom: 1px solid var(--line);
    }

    .band:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      width: 100%;
    }

    .meta-block {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .label {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .value {
      font-size: 18px;
      line-height: 1.25;
      font-weight: 600;
    }

    .value.small {
      font-size: 15px;
      font-weight: 500;
      color: var(--muted);
    }

    .progress-grid {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .progress-strip {
      display: grid;
      gap: 8px;
    }

    .progress-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      font-size: 14px;
      font-weight: 600;
    }

    .meter {
      position: relative;
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(23, 20, 17, 0.08);
    }

    .meter > span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #d96f3d);
    }

    .status-copy {
      display: grid;
      gap: 10px;
      width: 100%;
    }

    .status-copy p {
      margin: 0;
      font-size: 16px;
      line-height: 1.45;
    }

    .status-copy strong {
      display: inline-block;
      min-width: 86px;
      color: var(--ink);
    }

    .footnote {
      margin: 16px 0 0;
      font-size: 13px;
      color: var(--muted);
    }

    code {
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 0.95em;
    }

    @media (max-width: 640px) {
      .shell {
        width: calc(100vw - 20px);
        margin: 10px auto;
        padding: 18px;
        border-radius: 22px;
      }

      h1 {
        font-size: 34px;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <p class="eyebrow">Kami Flow Core / Plan View</p>
      <h1 id="title">Loading active plan...</h1>
      <div class="badge-row">
        <span class="badge state" id="derived-state">Loading</span>
        <span class="badge" id="decision">Decision: Unknown</span>
        <span class="badge" id="release-impact">Release: none</span>
        <span class="badge" id="freshness">Waiting for snapshot…</span>
      </div>
    </header>

    <section class="layout">
      <div class="band">
        <div class="meta">
          <div class="meta-block">
            <span class="label">Next Command</span>
            <span class="value" id="next-command">Unknown</span>
          </div>
          <div class="meta-block">
            <span class="label">Next Mode</span>
            <span class="value" id="next-mode">Unknown</span>
          </div>
          <div class="meta-block">
            <span class="label">Open Decisions</span>
            <span class="value" id="open-decisions">0</span>
          </div>
          <div class="meta-block">
            <span class="label">Lifecycle</span>
            <span class="value" id="lifecycle">Unknown</span>
          </div>
        </div>
      </div>

      <div class="band">
        <div class="progress-grid">
          <div class="progress-strip">
            <div class="progress-head"><span>Implementation</span><span id="tasks-count">0/0</span></div>
            <div class="meter"><span id="tasks-meter" style="width:0%"></span></div>
          </div>
          <div class="progress-strip">
            <div class="progress-head"><span>Acceptance</span><span id="acceptance-count">0/0</span></div>
            <div class="meter"><span id="acceptance-meter" style="width:0%"></span></div>
          </div>
          <div class="progress-strip">
            <div class="progress-head"><span>Go / No-Go</span><span id="gng-count">0/0</span></div>
            <div class="meter"><span id="gng-meter" style="width:0%"></span></div>
          </div>
        </div>
      </div>

      <div class="band">
        <div class="status-copy">
          <p><strong>Status</strong><span id="latest-status">Waiting for snapshot…</span></p>
          <p><strong>Blockers</strong><span id="latest-blockers">Waiting for snapshot…</span></p>
          <p><strong>Next Step</strong><span id="latest-next-step">Waiting for snapshot…</span></p>
        </div>
      </div>

      <div class="band">
        <div class="meta">
          <div class="meta-block">
            <span class="label">Project Fit</span>
            <span class="value small" id="project-fit">Waiting for snapshot…</span>
          </div>
          <div class="meta-block">
            <span class="label">Updated</span>
            <span class="value small" id="updated-at">Waiting for snapshot…</span>
          </div>
          <div class="meta-block">
            <span class="label">Plan Path</span>
            <span class="value small"><code id="plan-path">Waiting for snapshot…</code></span>
          </div>
        </div>
      </div>
    </section>

    <p class="footnote">Read-only projection of <code>.local/plans/*.md</code> via <code>plan-snapshot.mjs</code>.</p>
  </main>

  <script>
    const POLL_MS = ${PLAN_VIEW_POLL_INTERVAL_MS};
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
        "GO": "decision-go",
        "PASS": "decision-pass",
        "PENDING": "decision-pending",
        "BLOCK": "decision-block",
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
  </script>
</body>
</html>`;
}

function ensureTrailingSlash(value) {
  return String(value || "").endsWith("/") ? String(value) : `${value}/`;
}
