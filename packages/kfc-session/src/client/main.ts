function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("KFC Session bootstrap failed: app root missing.");
}

const apiBaseRaw = document.body.dataset.apiBase || "/api/sessions";
const apiBase = apiBaseRaw.endsWith("/") ? apiBaseRaw.slice(0, -1) : apiBaseRaw;
const sessionsRootLabel = root.dataset.sessionsRootLabel || "~/.codex/sessions";

const state = { sessions: [], selectedId: "", selected: null };

function setStatus(text) {
  byId("status-line").textContent = text;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text || "Invalid JSON response." }; }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function renderShell() {
  root.innerHTML = `
  <div class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">KFC Session</p>
        <h1>KFC Session Manager</h1>
        <p class="lede">Browse, inspect, export, import, and restore Codex sessions without touching KFC workflow controls.</p>
      </div>
      <div class="hero-meta"><span class="meta-chip">Sessions Root</span><code>${escapeHtml(sessionsRootLabel)}</code></div>
    </header>
    <main class="workspace">
      <section class="panel panel-list">
        <div class="panel-head"><div><p class="panel-kicker">Session Browser</p><h2>Sessions</h2></div><span id="session-count" class="meta-chip">0 sessions</span></div>
        <div class="toolbar">
          <label class="field"><span>Search</span><input id="search-input" type="search" placeholder="Session id, file, preview"></label>
          <label class="field field-date"><span>Date</span><input id="date-input" type="text" placeholder="YYYY/MM/DD"></label>
          <button id="refresh-button" type="button">Refresh</button>
        </div>
        <div id="session-list" class="session-list"></div>
      </section>
      <section class="panel panel-detail">
        <div class="panel-head"><div><p class="panel-kicker">Session Detail</p><h2 id="detail-title">Select a session</h2></div><div class="detail-actions"><button id="copy-id-button" type="button" class="button-secondary" disabled>Copy ID</button><button id="copy-path-button" type="button" class="button-secondary" disabled>Copy Path</button></div></div>
        <dl id="detail-grid" class="detail-grid"></dl>
        <section class="action-card"><h3>Export</h3><label class="field"><span>Destination Path</span><input id="export-path-input" type="text" placeholder="E:/transfer/codex-sessions"></label><button id="export-button" type="button" disabled>Export Session</button></section>
        <section class="action-card"><h3>Import</h3><label class="field"><span>Source Path</span><input id="import-path-input" type="text" placeholder="E:/transfer/codex-sessions/2026/03/07/session.jsonl"></label><button id="import-button" type="button">Import Into Codex Sessions Root</button></section>
        <section class="action-card"><h3>Restore</h3><p class="hint">Restore confirms the session is present in the Codex sessions root and gives you the session id/path for manual resume.</p><button id="restore-button" type="button" disabled>Restore Session</button></section>
        <section class="action-card action-card-preview"><div class="section-row"><h3>Transcript Tail</h3><span class="meta-chip">latest lines</span></div><div id="detail-preview" class="preview-list"></div><pre id="detail-tail" class="tail-view"></pre></section>
      </section>
    </main>
    <footer class="footer"><span id="status-line">Ready.</span></footer>
  </div>`;
}

function renderSessions() {
  byId("session-count").textContent = `${state.sessions.length} sessions`;
  byId("session-list").innerHTML = state.sessions.map((session) => {
    const selected = session.session_id === state.selectedId;
    return `<button type="button" class="session-item" data-id="${escapeHtml(session.session_id)}" data-selected="${selected}"><div class="session-item-header"><span class="session-id">${escapeHtml(session.session_id)}</span><span class="meta-chip">${escapeHtml(session.date_path || 'undated')}</span></div><div class="session-meta">${escapeHtml(session.relative_path)}</div><div class="session-preview">${escapeHtml(session.preview_text || 'No preview')}</div></button>`;
  }).join("");
  byId("session-list").querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => void selectSession(button.dataset.id)));
}

function renderDetail() {
  const selected = state.selected;
  const disabled = !selected;
  byId("copy-id-button").disabled = disabled;
  byId("copy-path-button").disabled = disabled;
  byId("export-button").disabled = disabled;
  byId("restore-button").disabled = disabled;
  if (!selected) {
    byId("detail-title").textContent = "Select a session";
    byId("detail-grid").innerHTML = "";
    byId("detail-preview").innerHTML = "";
    byId("detail-tail").textContent = "";
    return;
  }
  byId("detail-title").textContent = selected.session_id;
  const items = [["File", selected.file_name],["Path", selected.file_path],["Modified", selected.modified_at],["Bytes", String(selected.bytes)],["Date", selected.date_path || "undated"],["Relative", selected.relative_path]];
  byId("detail-grid").innerHTML = items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  byId("detail-preview").innerHTML = (selected.preview || []).map((item) => `<div class="preview-row"><div class="preview-role">${escapeHtml(item.role || 'event')}</div><div class="preview-text">${escapeHtml(item.text || '')}</div></div>`).join("");
  byId("detail-tail").textContent = selected.tail_text || "";
}

async function loadSessions() {
  setStatus("Loading sessions...");
  const search = encodeURIComponent(byId("search-input").value.trim());
  const date = encodeURIComponent(byId("date-input").value.trim());
  const payload = await fetchJson(`${apiBase}?query=${search}&date=${date}`);
  state.sessions = payload.items || [];
  if (!state.sessions.some((item) => item.session_id === state.selectedId)) {
    state.selectedId = state.sessions[0]?.session_id || "";
  }
  renderSessions();
  if (state.selectedId) {
    await selectSession(state.selectedId, { silent: true });
  } else {
    state.selected = null;
    renderDetail();
  }
  setStatus(`Loaded ${state.sessions.length} sessions.`);
}

async function selectSession(sessionId, options = {}) {
  if (!sessionId) return;
  const payload = await fetchJson(`${apiBase}/${encodeURIComponent(sessionId)}`);
  state.selectedId = sessionId;
  state.selected = payload.item || null;
  renderSessions();
  renderDetail();
  if (!options.silent) setStatus(`Loaded ${sessionId}.`);
}

async function copyText(text, successMessage) {
  if (!text) { setStatus("Nothing to copy."); return; }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

async function doExport() {
  if (!state.selected) return;
  const to = byId("export-path-input").value.trim();
  if (!to) { setStatus("Destination path is required."); return; }
  const payload = await fetchJson(`${apiBase}/export`, { method: "POST", body: JSON.stringify({ id: state.selected.session_id, to }) });
  setStatus(payload.message || "Session exported.");
}

async function doImport() {
  const from = byId("import-path-input").value.trim();
  if (!from) { setStatus("Source path is required."); return; }
  const payload = await fetchJson(`${apiBase}/import`, { method: "POST", body: JSON.stringify({ from }) });
  setStatus(payload.message || "Sessions imported.");
  await loadSessions();
}

async function doRestore() {
  if (!state.selected) return;
  const payload = await fetchJson(`${apiBase}/restore`, { method: "POST", body: JSON.stringify({ id: state.selected.session_id }) });
  setStatus(payload.message || "Session restored.");
}

renderShell();
byId("refresh-button").addEventListener("click", () => void loadSessions());
byId("search-input").addEventListener("input", () => void loadSessions());
byId("date-input").addEventListener("change", () => void loadSessions());
byId("copy-id-button").addEventListener("click", () => void copyText(state.selected?.session_id || "", "Session ID copied."));
byId("copy-path-button").addEventListener("click", () => void copyText(state.selected?.file_path || "", "Session path copied."));
byId("export-button").addEventListener("click", () => void doExport());
byId("import-button").addEventListener("click", () => void doImport());
byId("restore-button").addEventListener("click", () => void doRestore());
void loadSessions();
