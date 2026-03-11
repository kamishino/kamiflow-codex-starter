import { effect } from "@preact/signals";
import { render } from "preact";
import { ConversationPanel } from "./components/ConversationPanel";
import { SessionPanel } from "./components/SessionPanel";
import { bindSession, fetchSession, fetchSessions, fetchTranscript, revealSession, verifyToken } from "./api";
import { connected, session, statusLine, token, transcript, wsRef } from "./state";
import type { ChatSessionPayload, SessionDiscoveryItem } from "./types";

const root = document.querySelector<HTMLElement>("#app-root");
if (!root) {
  throw new Error("KFC Chat bootstrap failed: app root missing.");
}

const projectName = root.dataset.projectName || "KFC Chat";
const projectDir = root.dataset.projectDir || "";
const wsPath = root.dataset.wsPath || "/ws";
let bindSessionId = "";
let promptValue = "";
let discoveryQuery = "";
let discoveredSessions: SessionDiscoveryItem[] = [];

function tokenStorageKey() {
  return `kfc-chat.token.${location.pathname}`;
}

function setStatus(text: string) {
  statusLine.value = text;
}

async function copyText(text: string, successMessage: string) {
  if (!text) {
    setStatus("Nothing to copy.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

async function loadDiscovery(query = "") {
  discoveryQuery = query;
  const payload = await fetchSessions(query);
  discoveredSessions = payload.sessions || [];
  rerender();
}

async function loadBootstrap() {
  const [sessionPayload, transcriptPayload] = await Promise.all([fetchSession(), fetchTranscript()]);
  session.value = sessionPayload;
  transcript.value = transcriptPayload.items || [];
}

function disconnect() {
  if (wsRef.value) {
    wsRef.value.close();
    wsRef.value = null;
  }
  connected.value = false;
}

function connectWebSocket() {
  disconnect();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const normalizedWsPath = wsPath.startsWith("/") ? wsPath : `/${wsPath}`;
  const ws = new WebSocket(`${protocol}://${location.host}${normalizedWsPath}?token=${encodeURIComponent(token.value)}`);
  wsRef.value = ws;
  ws.addEventListener("open", () => {
    connected.value = true;
    setStatus("Connected to KFC Chat.");
  });
  ws.addEventListener("message", (event) => {
    let packet: any;
    try {
      packet = JSON.parse(String(event.data || "{}"));
    } catch {
      return;
    }
    if (packet.type === "bootstrap") {
      session.value = packet.payload.session;
      transcript.value = packet.payload.transcript || [];
      return;
    }
    if (packet.type === "session_updated") {
      session.value = packet.payload;
      return;
    }
    if (packet.type === "transcript_updated") {
      transcript.value = packet.payload?.items || [];
      return;
    }
    if (packet.type === "error" || packet.type === "blocked") {
      setStatus(packet.payload?.message || "Blocked.");
      return;
    }
    if (packet.type === "queued") {
      setStatus(`Prompt queued (${packet.payload?.queue_depth || 0}).`);
      promptValue = "";
      rerender();
      return;
    }
    if (packet.type === "prompt_started") {
      setStatus(`Prompt started: ${packet.payload?.prompt_id || ""}`);
      return;
    }
    if (packet.type === "prompt_completed") {
      setStatus(packet.payload?.result?.text || "Prompt completed.");
      return;
    }
    if (packet.type === "prompt_failed") {
      setStatus(packet.payload?.error || "Prompt failed.");
    }
  });
  ws.addEventListener("close", () => {
    connected.value = false;
    setStatus("Disconnected.");
  });
}

async function connect() {
  if (!token.value) {
    setStatus("Token is required.");
    return;
  }
  localStorage.setItem(tokenStorageKey(), token.value);
  try {
    await verifyToken();
    await loadBootstrap();
    await loadDiscovery("");
    connectWebSocket();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

function sendPrompt() {
  const prompt = promptValue.trim();
  if (!wsRef.value || wsRef.value.readyState !== WebSocket.OPEN) {
    setStatus("Connect first.");
    return;
  }
  if (!prompt) {
    setStatus("Prompt cannot be empty.");
    return;
  }
  wsRef.value.send(JSON.stringify({ type: "submit_prompt", prompt }));
}

async function bindFromInput() {
  const sessionId = bindSessionId.trim();
  if (!sessionId) {
    setStatus("Session ID is required.");
    return;
  }
  try {
    const payload = await bindSession(sessionId);
    session.value = payload.session || session.value;
    bindSessionId = "";
    await loadBootstrap();
    await loadDiscovery("");
    setStatus("Codex session bound.");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

async function bindFromDiscovery(sessionId: string) {
  try {
    const payload = await bindSession(sessionId);
    session.value = payload.session || session.value;
    await loadBootstrap();
    await loadDiscovery("");
    setStatus(`Bound Codex session ${payload.session?.bound_session?.session_id || ""}.`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

async function doDiscoverSessions(nextQuery = "") {
  try {
    await loadDiscovery(nextQuery);
    setStatus(`Found ${discoveredSessions.length} session(s).`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

async function doReveal(targetName: "file" | "folder") {
  try {
    const payload = await revealSession(targetName);
    setStatus(`Revealed ${payload.target}: ${payload.path}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
}

function App(props: { session: ChatSessionPayload | null }) {
  const canBind = Boolean(props.session?.bound_session?.can_bind);
  return (
    <div class="app-shell">
      <div class="workspace">
        <ConversationPanel
          projectName={projectName}
          projectDir={projectDir}
          session={props.session}
          transcript={transcript.value}
          connected={connected.value}
          statusLine={statusLine.value}
          tokenValue={token.value}
          bindSessionId={bindSessionId}
          promptValue={promptValue}
          onTokenInput={(value) => { token.value = value; rerender(); }}
          onBindInput={(value) => { bindSessionId = value; rerender(); }}
          onPromptInput={(value) => { promptValue = value; rerender(); }}
          onConnect={() => void connect()}
          onDisconnect={() => disconnect()}
          onBind={() => void bindFromInput()}
          onCopySetup={() => void copyText(props.session?.bound_session?.onboarding_command || "kfc client --force --no-launch-codex", "Setup command copied.")}
          onSendPrompt={() => sendPrompt()}
        />
        <SessionPanel
          session={props.session}
          discoveryItems={discoveredSessions}
          discoveryQuery={discoveryQuery}
          canBind={canBind}
          onDiscoverySearch={(value) => { void doDiscoverSessions(value); }}
          onDiscoveryQueryInput={(value) => { discoveryQuery = value; rerender(); }}
          onDiscoveryBind={(sessionId) => { void bindFromDiscovery(sessionId); }}
          onCopyResume={() => void copyText(props.session?.bound_session?.manual_resume_command || "", "Manual resume command copied.")}
          onCopySessionId={() => void copyText(props.session?.bound_session?.session_id || "", "Session ID copied.")}
          onCopySessionPath={() => void copyText(props.session?.bound_session?.session_path || "", "Session path copied.")}
          onRevealFile={() => void doReveal("file")}
          onRevealFolder={() => void doReveal("folder")}
        />
      </div>
      <footer class="footer">
        <span id="status-line">{statusLine.value}</span>
      </footer>
    </div>
  );
}

function rerender() {
  render(<App session={session.value} />, root);
}

effect(() => {
  session.value;
  transcript.value;
  connected.value;
  statusLine.value;
  rerender();
});

window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  token.value = params.get("token") || localStorage.getItem(tokenStorageKey()) || "";
  rerender();
  if (token.value) {
    await connect();
  }
});
