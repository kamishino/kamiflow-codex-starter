function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function formatEta(ms) {
  const total = Number(ms || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return "now";
  }
  const seconds = Math.ceil(total / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function buildRemoteHtml({ projectName }) {
  const safeProject = escapeHtml(projectName || "Kami Flow Remote");
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"utf-8\">",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `    <title>${safeProject} - Remote</title>`,
    "    <link rel=\"stylesheet\" href=\"/assets/remote.css\">",
    "  </head>",
    "  <body>",
    "    <div class=\"app\">",
    "      <header class=\"topbar\">",
    `        <div><p class=\"eyebrow\">Kami Flow Remote</p><h1>${safeProject}</h1></div>`,
    "        <div class=\"status-row\">",
    "          <span id=\"connection-badge\" class=\"badge\">Disconnected</span>",
    "          <span id=\"busy-badge\" class=\"badge badge-muted\">Idle</span>",
    "        </div>",
    "      </header>",
    "",
    "      <section class=\"card auth-card\" id=\"auth-card\">",
    "        <label class=\"field\">",
    "          <span>Access Token</span>",
    "          <input id=\"token-input\" type=\"password\" placeholder=\"Paste the remote token\">",
    "        </label>",
    "        <div class=\"auth-actions\">",
    "          <button id=\"connect-button\" type=\"button\">Connect</button>",
    "          <button id=\"forget-button\" type=\"button\" class=\"button-secondary\">Forget</button>",
    "        </div>",
    "        <p class=\"hint\">Use the token printed by <code>kfc remote serve</code> or stored via <code>kfc remote token show</code>.</p>",
    "      </section>",
    "",
    "      <main class=\"layout\">",
    "        <section class=\"card stack\">",
    "          <div class=\"section-head\">",
    "            <h2>Session</h2>",
    "            <span id=\"queue-label\" class=\"meta\">Queue 0</span>",
    "          </div>",
    "          <dl id=\"session-grid\" class=\"session-grid\"></dl>",
    "          <div class=\"hint\">Queue ETA: <span id=\"queue-eta\">0s</span></div>",
    "        </section>",
    "",
    "        <section class=\"card stack\">",
    "          <div class=\"section-head\">",
    "            <h2>Prompt Queue</h2>",
    "            <span class=\"meta\">Live control</span>",
    "          </div>",
    "          <div id=\"queue-body\" class=\"queue-list\">",
    "            <div class=\"queue-item queue-item-empty\">No queued prompts.</div>",
    "          </div>",
    "        </section>",
    "",
    "        <section class=\"card stack transcript-card\">",
    "          <div class=\"section-head\">",
    "            <h2>Transcript</h2>",
    "            <span id=\"transcript-count\" class=\"meta\">0 entries</span>",
    "          </div>",
    "          <div id=\"transcript-list\" class=\"transcript-list\"></div>",
    "        </section>",
    "",
    "        <section class=\"card stack\">",
    "          <div class=\"section-head\">",
    "            <h2>Prompt</h2>",
    "            <span id=\"prompt-state\" class=\"meta\">No bound session</span>",
    "          </div>",
    "          <label class=\"field\">",
    "            <span>Message</span>",
    "            <textarea id=\"prompt-input\" rows=\"5\" placeholder=\"Send the next prompt into the bound workstation session.\"></textarea>",
    "          </label>",
    "          <div class=\"auth-actions\">",
    "            <button id=\"send-button\" type=\"button\">Send Prompt</button>",
    "          </div>",
    "          <p id=\"prompt-hint\" class=\"hint\">If the workstation is busy, prompts enter the queue.</p>",
    "        </section>",
    "      </main>",
    "    </div>",
    "",
    "    <script src=\"/assets/remote.js\"></script>",
    "  </body>",
    "</html>"
  ].join("\n");
}

export const REMOTE_UI_CSS = [
  ":root {",
  "  color-scheme: dark;",
  "  --bg: #0f141c;",
  "  --panel: #16202b;",
  "  --panel-2: #1b2734;",
  "  --border: #2f4359;",
  "  --text: #edf3fb;",
  "  --muted: #9ab0c7;",
  "  --accent: #4fc3f7;",
  "  --good: #66bb6a;",
  "  --warn: #ffca57;",
  "  --bad: #ef5350;",
  "  --shadow: rgba(0, 0, 0, 0.28);",
  "  font-family: \"Segoe UI\", system-ui, sans-serif;",
  "}",
  "body { margin: 0; background: radial-gradient(circle at top, #162536, var(--bg) 48%); color: var(--text); }",
  ".app { max-width: 1060px; margin: 0 auto; padding: 20px 16px 40px; }",
  ".topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }",
  ".eyebrow { margin: 0 0 4px; color: var(--muted); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }",
  "h1, h2 { margin: 0; }",
  ".layout { display: grid; gap: 16px; }",
  ".card { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 16px 42px var(--shadow); padding: 16px; }",
  ".stack { display: grid; gap: 12px; }",
  ".section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
  ".status-row, .auth-actions { display: flex; gap: 8px; flex-wrap: wrap; }",
  ".badge { border-radius: 999px; padding: 6px 10px; border: 1px solid var(--border); background: var(--panel-2); font-size: 12px; }",
  ".badge-ok { border-color: color-mix(in srgb, var(--good) 40%, var(--border)); color: var(--good); }",
  ".badge-busy { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); color: var(--accent); }",
  ".badge-blocked { border-color: color-mix(in srgb, var(--bad) 40%, var(--border)); color: var(--bad); }",
  ".badge-muted { color: var(--muted); }",
  ".field { display: grid; gap: 8px; font-size: 14px; }",
  ".field span { color: var(--muted); }",
  "input, textarea, button { font: inherit; }",
  "input, textarea { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid var(--border); background: #0d1722; color: var(--text); padding: 12px; }",
  "textarea { resize: vertical; min-height: 120px; }",
  "button { border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 18%, #0d1722); color: var(--text); padding: 12px 14px; border-radius: 12px; }",
  "button[disabled] { opacity: 0.6; cursor: not-allowed; }",
  ".button-secondary { border-color: var(--border); background: var(--panel-2); }",
  ".hint, .meta { color: var(--muted); font-size: 13px; margin: 0; }",
  ".session-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }",
  ".session-grid div { background: rgba(0, 0, 0, 0.14); border-radius: 14px; padding: 12px; }",
  ".session-grid dt { color: var(--muted); font-size: 12px; margin-bottom: 6px; }",
  ".session-grid dd { margin: 0; font-size: 14px; word-break: break-word; }",
  ".transcript-list, .queue-list { display: grid; gap: 10px; max-height: 52vh; overflow: auto; }",
  ".transcript-entry { border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: rgba(8, 15, 24, 0.48); }",
  ".transcript-entry-user { border-color: color-mix(in srgb, var(--accent) 24%, var(--border)); }",
  ".transcript-entry-assistant { border-color: color-mix(in srgb, var(--good) 24%, var(--border)); }",
  ".transcript-entry-system { border-color: color-mix(in srgb, var(--warn) 24%, var(--border)); }",
  ".transcript-entry-sentinel { color: var(--warn); }",
  ".transcript-meta { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: var(--muted); font-size: 12px; }",
  ".transcript-text { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }",
  ".queue-item { position: relative; border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: rgba(8, 15, 24, 0.48); display: grid; gap: 8px; }",
  ".queue-item-empty { color: var(--muted); font-size: 13px; border-style: dashed; }",
  ".queue-item-running { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); background: color-mix(in srgb, #1f4b75 14%, rgba(8, 15, 24, 0.48)); }",
  ".queue-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }",
  ".queue-item-meta { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.4; display: grid; gap: 2px; }",
  ".queue-cancel-button { justify-self: start; border-color: var(--bad); background: color-mix(in srgb, var(--bad) 15%, var(--panel-2)); }",
  ".queue-prompt-text { margin: 0; font-size: 13px; color: var(--text); white-space: pre-wrap; word-break: break-word; line-height: 1.45; }",
  "code { background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 8px; padding: 2px 6px; }",
  "@media (max-width: 720px) {",
  "  .topbar { flex-direction: column; }",
  "  .session-grid { grid-template-columns: 1fr; }",
  "  .app { padding-left: 12px; padding-right: 12px; }",
  "}"
].join("\n");

export const REMOTE_UI_JS = String.raw`
const TOKEN_KEY = "kfc.remote.token";
const state = {
  token: "",
  session: null,
  transcript: [],
  eventSource: null,
  reconnectTimer: null,
  reconnectDelay: 500
};

function byId(id) {
  return document.getElementById(id);
}

function readTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("token") || "").trim();
}

function readStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

function saveToken(token) {
  state.token = token || "";
  if (state.token) {
    window.localStorage.setItem(TOKEN_KEY, state.token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
  byId("token-input").value = state.token;
}

function authHeaders() {
  return state.token ? { Authorization: "Bearer " + state.token } : {};
}

function nowIsoDate(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour12: false }) : "-";
}

function setConnection(text, cls) {
  const badge = byId("connection-badge");
  badge.textContent = text;
  badge.className = "badge" + (cls ? " " + cls : "");
}

function setBusy(text, cls) {
  const badge = byId("busy-badge");
  badge.textContent = text;
  badge.className = "badge" + (cls ? " " + cls : " badge-muted");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMsDuration(ms) {
  const safeMs = Number(ms || 0);
  if (!Number.isFinite(safeMs) || safeMs <= 0) {
    return "0s";
  }
  const seconds = Math.ceil(safeMs / 1000);
  if (seconds < 60) {
    return String(seconds) + "s";
  }
  return String(Math.ceil(seconds / 60)) + "m";
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const fallbackId = String(entry.role || "entry") + ":" + Math.random().toString(36).slice(2, 8);
  const id = String(entry.id || entry.created_at || "").trim() || fallbackId;
  return Object.assign({}, entry, { id: id });
}

function dedupeTranscript(entries) {
  const seen = new Set();
  const out = [];
  for (const item of entries || []) {
    const normalized = normalizeEntry(item);
    if (!normalized) {
      continue;
    }
    const key = String(normalized.id || (normalized.created_at || "") + "-" + (normalized.text || "")).trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out.slice(-200);
}

function addTranscriptEntries(items) {
  state.transcript = dedupeTranscript((state.transcript || []).concat(items || []));
  renderTranscript();
}

function renderSession() {
  const session = state.session || {};
  const bound = session.bound_session || { bound: false, reason: "No bound session." };
  const queueDepth = Number(session.queue_depth || 0);
  const runlog = bound.runlog || {};
  const rows = [
    ["State", String(session.status || "idle")],
    ["Plan", bound.plan_id || "None"],
    ["Queue", String(queueDepth)],
    ["Busy", session.busy ? "true" : "false"],
    ["Last prompt", session.last_prompt_at ? nowIsoDate(session.last_prompt_at) : "n/a"],
    ["Run state", runlog.run_state || session.status || "unknown"],
    ["Phase", runlog.phase || "unknown"],
    ["Last result", session.last_result && session.last_result.state ? session.last_result.state : "None"],
    ["Reason", (session.last_result && session.last_result.text) || (bound.bound ? "Ready" : bound.reason) || "No bound session"]
  ];
  byId("session-grid").innerHTML = rows.map(function (pair) {
    return "<div><dt>" + escapeHtml(pair[0]) + "</dt><dd>" + escapeHtml(String(pair[1] || "")) + "</dd></div>";
  }).join("");
  byId("queue-label").textContent = "Queue " + String(queueDepth);
  byId("queue-eta").textContent = formatMsDuration(session.queue_eta_ms || 0);
  const busy = Boolean(session.busy);
  setBusy(
    busy ? "Working" : (session.status === "blocked" ? "Blocked" : "Idle"),
    busy ? "badge-busy" : (session.status === "blocked" ? "badge-blocked" : "badge-muted")
  );
  byId("prompt-state").textContent = bound.bound ? (busy ? "Busy: prompt queued" : "Ready to send") : "No bound session";
  byId("send-button").disabled = !bound.bound || !state.token;
}

function renderQueue() {
  const session = state.session || {};
  const snapshot = Array.isArray(session.queue_snapshot) ? session.queue_snapshot : [];
  if (!snapshot.length) {
    byId("queue-body").innerHTML = '<div class="queue-item queue-item-empty">Queue is empty.</div>';
    return;
  }
  byId("queue-body").innerHTML = snapshot.map(function (item) {
    const promptId = escapeHtml(item.prompt_id || item.id || "unknown");
    const created = nowIsoDate(item.created_at || item.created || new Date().toISOString());
    const eta = formatMsDuration(item.estimated_wait_ms || 0);
    const status = String(item.status || "queued");
    const queuePosition = escapeHtml(String(item.queue_position || ""));
    const promptText = escapeHtml(String(item.prompt || "").trim() || "Prompt body unavailable.");
    const canCancel = status === "queued";
    return ""
      + '<article class="queue-item' + (status === "running" ? " queue-item-running" : "") + '">'
      + '<div class="queue-item-head">'
      + "<strong>#" + promptId + "</strong>"
      + '<span class="meta">#' + queuePosition + "</span>"
      + "</div>"
      + '<p class="queue-item-meta">'
      + "<span>Status: " + escapeHtml(status) + "</span>"
      + "<span>Created: " + created + "</span>"
      + "<span>ETA: " + eta + "</span>"
      + "</p>"
      + '<p class="queue-prompt-text">' + promptText + "</p>"
      + (canCancel ? '<button class="queue-cancel-button" data-prompt-id="' + promptId + '" type="button">Cancel</button>' : "")
      + "</article>";
  }).join("");
}

function renderTranscript() {
  const entries = Array.isArray(state.transcript) ? state.transcript : [];
  byId("transcript-count").textContent = String(entries.length) + " entries";
  byId("transcript-list").innerHTML = entries.map(function (entry) {
    const role = entry.role || "system";
    const created = entry.created_at ? nowIsoDate(entry.created_at) : "";
    const text = escapeHtml(entry.text || "");
    return ""
      + '<article class="transcript-entry transcript-entry-' + escapeHtml(role) + '">'
      + '<div class="transcript-meta"><strong>' + escapeHtml(role) + "</strong><span>" + created + "</span></div>"
      + '<div class="transcript-text">' + text + "</div>"
      + "</article>";
  }).join("");
}

function parseJsonPayload(raw) {
  try {
    if (typeof raw === "string" && raw) {
      return JSON.parse(raw);
    }
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    ...(options || {}),
    headers: {
      ...(((options || {}).headers) || {}),
      ...authHeaders(),
      "Content-Type": "application/json"
    }
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "Invalid JSON response." };
  }
  if (!response.ok) {
    const message = payload && payload.error ? payload.error : "Request failed (" + String(response.status) + ")";
    throw new Error(message);
  }
  return payload;
}

async function loadSnapshot() {
  state.session = await fetchJson("/api/remote/session");
  const transcriptPayload = await fetchJson("/api/remote/transcript");
  state.transcript = dedupeTranscript(Array.isArray(transcriptPayload.items) ? transcriptPayload.items : []);
  renderSession();
  renderQueue();
  renderTranscript();
}

function writeEvent(eventType, payload) {
  const incoming = parseJsonPayload(payload);
  const resolvedType = String(eventType || incoming.event_type || "").trim();
  if (resolvedType === "connected" || resolvedType === "session_updated") {
    if (incoming.session) {
      state.session = incoming.session;
    }
    renderSession();
    renderQueue();
    if (resolvedType === "connected") {
      setConnection("Connected", "badge-ok");
    }
    return;
  }
  if (resolvedType === "transcript_appended") {
    if (incoming.entry) {
      addTranscriptEntries([incoming.entry]);
    }
    return;
  }
  if (
    resolvedType === "prompt_started" ||
    resolvedType === "prompt_completed" ||
    resolvedType === "prompt_failed" ||
    resolvedType === "prompt_cancelled" ||
    resolvedType === "resync_required"
  ) {
    void loadSnapshot();
  }
}

function closeEvents() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!state.token || state.reconnectTimer) {
    return;
  }
  setConnection("Reconnecting", "badge-blocked");
  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 8000);
  state.reconnectTimer = window.setTimeout(function () {
    state.reconnectTimer = null;
    if (!state.token) {
      return;
    }
    void loadSnapshot().finally(openEvents);
  }, delay);
}

function openEvents() {
  closeEvents();
  const token = encodeURIComponent(state.token);
  const source = new EventSource("/api/remote/events?token=" + token);
  state.eventSource = source;
  state.reconnectDelay = 500;
  [
    "connected",
    "session_updated",
    "transcript_appended",
    "prompt_started",
    "prompt_completed",
    "prompt_failed",
    "prompt_cancelled",
    "resync_required"
  ].forEach(function (type) {
    source.addEventListener(type, function (evt) {
      writeEvent(type, evt.data || "{}");
    });
  });
  source.addEventListener("open", function () {
    state.reconnectDelay = 500;
    setConnection("Connected", "badge-ok");
  });
  source.onerror = function () {
    setConnection("Connection unstable", "badge-blocked");
    scheduleReconnect();
  };
}

async function connect() {
  const token = String(byId("token-input").value || "").trim();
  if (!token) {
    setConnection("Token required", "badge-blocked");
    return;
  }
  saveToken(token);
  try {
    await fetchJson("/api/remote/token/verify", { method: "POST", body: JSON.stringify({ token: token }) });
    await loadSnapshot();
    openEvents();
    setConnection("Connected", "badge-ok");
  } catch (err) {
    setConnection(err instanceof Error ? err.message : String(err), "badge-blocked");
    closeEvents();
  }
}

function findQueueButton(target) {
  const button = target && target.closest ? target.closest("[data-prompt-id]") : null;
  if (!button || !(button instanceof HTMLElement)) {
    return null;
  }
  const promptId = button.getAttribute("data-prompt-id");
  return { button: button, promptId: promptId ? promptId.trim() : "" };
}

async function cancelPrompt(promptId) {
  if (!promptId) {
    return;
  }
  try {
    await fetchJson("/api/remote/prompt/" + encodeURIComponent(promptId), { method: "DELETE" });
    setConnection("Cancel requested", "badge-muted");
    await loadSnapshot();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

async function sendPrompt() {
  const prompt = String(byId("prompt-input").value || "").trim();
  if (!prompt) {
    return;
  }
  byId("send-button").disabled = true;
  try {
    await fetchJson("/api/remote/prompt", { method: "POST", body: JSON.stringify({ prompt: prompt }) });
    byId("prompt-input").value = "";
    await loadSnapshot();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  } finally {
    byId("send-button").disabled = false;
    renderSession();
    renderQueue();
  }
}

function forgetToken() {
  saveToken("");
  state.session = null;
  state.transcript = [];
  closeEvents();
  setConnection("Disconnected", "");
  renderSession();
  renderQueue();
  renderTranscript();
}

window.addEventListener("DOMContentLoaded", async function () {
  saveToken(readTokenFromUrl() || readStoredToken());
  byId("connect-button").addEventListener("click", connect);
  byId("forget-button").addEventListener("click", forgetToken);
  byId("send-button").addEventListener("click", sendPrompt);
  byId("queue-body").addEventListener("click", function (event) {
    const found = findQueueButton(event.target);
    if (!found || !found.promptId) {
      return;
    }
    event.preventDefault();
    void cancelPrompt(found.promptId);
  });
  byId("prompt-input").addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void sendPrompt();
    }
  });
  if (state.token) {
    await connect();
  } else {
    renderSession();
    renderQueue();
    renderTranscript();
  }
});
`;
