import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const CLIENT_SESSION_FILE = path.join(".kfc", "session.json");
const CHAT_SESSION_FILE = path.join(".kfc", "chat-session.json");
const CHAT_STATE_DIR = path.join(".local", "chat");
const CHAT_TRANSCRIPT_FILE = path.join(CHAT_STATE_DIR, "transcript.jsonl");

function nowIso() {
  return new Date().toISOString();
}

function compactText(value, maxLength = 1600) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function hashFingerprint(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

async function readJsonIfExists(targetPath, fallback = null) {
  try {
    const raw = await fsp.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(targetPath, payload) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertDirectoryExists(targetPath, label) {
  const stat = await fsp.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`);
  }
}

async function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function selectLatestFile(filePaths) {
  const scored = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fsp.stat(filePath);
      scored.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip unreadable files.
    }
  }
  scored.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return scored[0]?.filePath || "";
}

async function resolveSessionRecord(sessionsRoot, sessionId) {
  const matches = await findSessionMatches(sessionsRoot, sessionId);
  if (matches.length === 0) {
    throw new Error(`No session file found for id: ${sessionId}`);
  }
  const target = matches.length === 1 ? matches[0] : await selectLatestFile(matches);
  return {
    session_id: path.basename(target, path.extname(target)),
    session_path: target
  };
}

async function readTranscriptFingerprints(projectDir) {
  const items = await readTranscript(projectDir, 1000);
  return new Set(items.map((item) => String(item.fingerprint || "")).filter(Boolean));
}

async function readTailText(filePath, maxBytes = 65536) {
  const handle = await fsp.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const length = Math.min(maxBytes, stat.size);
    const position = Math.max(0, stat.size - length);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, position);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function extractCodexTailEntry(rawLine) {
  const trimmed = String(rawLine || "").trim();
  if (!trimmed) {
    return null;
  }
  const fingerprint = `codex:${hashFingerprint(trimmed)}`;
  try {
    const payload = JSON.parse(trimmed);
    const fields = [payload.message, payload.text, payload.summary, payload.content, payload.reason, payload.prompt];
    const content = fields.find((item) => String(item || "").trim().length > 0);
    return {
      created_at: String(payload.updated_at || payload.created_at || payload.timestamp || nowIso()),
      role: String(payload.role || payload.type || payload.event_type || "event"),
      kind: "codex_tail",
      text: compactText(content || trimmed, 3000),
      status: String(payload.status || "synced"),
      fingerprint,
      meta: {
        source: "codex_session",
        raw_role: String(payload.role || payload.type || payload.event_type || "event")
      }
    };
  } catch {
    return {
      created_at: nowIso(),
      role: "raw",
      kind: "codex_tail",
      text: compactText(trimmed, 3000),
      status: "synced",
      fingerprint,
      meta: {
        source: "codex_session"
      }
    };
  }
}

export function defaultSessionsRoot() {
  return path.join(os.homedir(), ".codex", "sessions");
}

export function resolveChatPaths(projectDir) {
  return {
    projectDir,
    clientSessionPath: path.join(projectDir, CLIENT_SESSION_FILE),
    chatSessionPath: path.join(projectDir, CHAT_SESSION_FILE),
    chatStateDir: path.join(projectDir, CHAT_STATE_DIR),
    transcriptPath: path.join(projectDir, CHAT_TRANSCRIPT_FILE)
  };
}

export async function ensureChatScaffold(projectDir) {
  const paths = resolveChatPaths(projectDir);
  await fsp.mkdir(path.dirname(paths.clientSessionPath), { recursive: true });
  await fsp.mkdir(paths.chatStateDir, { recursive: true });
  return paths;
}

export async function loadClientSession(projectDir) {
  return await readJsonIfExists(resolveChatPaths(projectDir).clientSessionPath, null);
}

export async function saveClientSession(projectDir, payload) {
  const paths = await ensureChatScaffold(projectDir);
  await writeJson(paths.clientSessionPath, payload);
  return paths.clientSessionPath;
}

export async function loadChatSession(projectDir) {
  return await readJsonIfExists(resolveChatPaths(projectDir).chatSessionPath, null);
}

export async function saveChatSession(projectDir, payload) {
  const paths = await ensureChatScaffold(projectDir);
  await writeJson(paths.chatSessionPath, payload);
  return paths.chatSessionPath;
}

export async function findSessionMatches(sessionsRoot, sessionId) {
  const needle = String(sessionId || "").trim().toLowerCase();
  if (!needle || needle.length < 8) {
    throw new Error("Invalid session id. Provide the full session id.");
  }
  await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  const files = await walkFiles(sessionsRoot);
  return files
    .filter((item) => path.extname(item).toLowerCase() === ".jsonl")
    .filter((item) => path.basename(item).toLowerCase().includes(needle))
    .sort((left, right) => left.localeCompare(right));
}

export function buildInteractiveResumeCommand(sessionId) {
  const normalized = String(sessionId || "").trim();
  if (!normalized) {
    return "";
  }
  return `codex resume ${JSON.stringify(normalized)}`;
}

export async function bindCodexSession(projectDir, sessionId, sessionsRoot = defaultSessionsRoot()) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession?.planId) {
    throw new Error("Missing .kfc/session.json. Run `kfc client --force --no-launch-codex` first.");
  }
  const record = await resolveSessionRecord(sessionsRoot, sessionId);
  const next = {
    ...clientSession,
    codexSessionId: record.session_id,
    codexSessionPath: record.session_path,
    codexBoundAt: nowIso()
  };
  const clientSessionPath = await saveClientSession(projectDir, next);
  return {
    session_id: record.session_id,
    session_path: record.session_path,
    client_session_path: clientSessionPath,
    manual_resume_command: buildInteractiveResumeCommand(record.session_id)
  };
}

export async function unbindCodexSession(projectDir) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession) {
    return false;
  }
  const next = { ...clientSession };
  delete next.codexSessionId;
  delete next.codexSessionPath;
  delete next.codexBoundAt;
  await saveClientSession(projectDir, next);
  return true;
}

export async function resolveBoundSession(projectDir, sessionsRoot = defaultSessionsRoot()) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession?.planId) {
    return {
      bound: false,
      reason: "Missing .kfc/session.json. Run `kfc client --force --no-launch-codex` first."
    };
  }
  const sessionId = String(clientSession.codexSessionId || "").trim();
  if (!sessionId) {
    return {
      bound: false,
      reason: "No Codex session bound. Run `kfc-chat bind --project . --session-id <id>` first."
    };
  }

  let sessionPath = String(clientSession.codexSessionPath || "").trim();
  if (!sessionPath || !(await pathExists(sessionPath))) {
    const resolved = await resolveSessionRecord(sessionsRoot, sessionId);
    sessionPath = resolved.session_path;
    await saveClientSession(projectDir, {
      ...clientSession,
      codexSessionId: resolved.session_id,
      codexSessionPath: resolved.session_path,
      codexBoundAt: clientSession.codexBoundAt || nowIso()
    });
  }

  return {
    bound: true,
    plan_id: String(clientSession.planId),
    plan_path: String(clientSession.planPath || ""),
    profile: String(clientSession.profile || ""),
    generated_at: String(clientSession.generatedAt || ""),
    session_id: sessionId,
    session_path: sessionPath,
    bound_at: String(clientSession.codexBoundAt || ""),
    manual_resume_command: buildInteractiveResumeCommand(sessionId)
  };
}

export async function ensureChatRuntimeSession(projectDir, options = {}) {
  const previous = await loadChatSession(projectDir);
  const paths = resolveChatPaths(projectDir);
  const next = {
    generated_at: previous?.generated_at || nowIso(),
    updated_at: nowIso(),
    project_dir: projectDir,
    host: String(options.host || previous?.host || "127.0.0.1"),
    port: Number(options.port || previous?.port || 0),
    token: String(options.token || previous?.token || crypto.randomBytes(24).toString("base64url")),
    status: previous?.status || "idle",
    busy: false,
    queue_depth: 0,
    current_prompt_id: null,
    last_prompt_at: previous?.last_prompt_at || "",
    last_result: previous?.last_result || null,
    connection_count: 0,
    transcript_path: paths.transcriptPath
  };
  await saveChatSession(projectDir, next);
  return next;
}

export async function readTranscript(projectDir, limit = 200) {
  const transcriptPath = resolveChatPaths(projectDir).transcriptPath;
  let raw = "";
  try {
    raw = await fsp.readFile(transcriptPath, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines.slice(-limit)) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // Skip malformed line.
    }
  }
  return items;
}

export async function appendTranscriptEntry(projectDir, entry) {
  const paths = await ensureChatScaffold(projectDir);
  const payload = {
    id: entry?.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: entry?.created_at || nowIso(),
    role: String(entry?.role || "system"),
    kind: String(entry?.kind || "note"),
    text: compactText(entry?.text || "", 3000),
    status: entry?.status ? String(entry.status) : undefined,
    fingerprint: String(entry?.fingerprint || `local:${hashFingerprint(JSON.stringify(entry || {}))}`),
    meta: entry?.meta && typeof entry.meta === "object" ? entry.meta : undefined
  };
  await fsp.appendFile(paths.transcriptPath, JSON.stringify(payload) + "\n", "utf8");
  return payload;
}

export async function hydrateTranscriptFromCodex(projectDir, sessionPath) {
  if (!sessionPath || !(await pathExists(sessionPath))) {
    return { appended: [] };
  }
  const seenFingerprints = await readTranscriptFingerprints(projectDir);
  const tailText = await readTailText(sessionPath, 262144);
  const lines = tailText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const appended = [];
  for (const line of lines) {
    const entry = extractCodexTailEntry(line);
    if (!entry || seenFingerprints.has(entry.fingerprint)) {
      continue;
    }
    const persisted = await appendTranscriptEntry(projectDir, entry);
    appended.push(persisted);
    seenFingerprints.add(persisted.fingerprint);
  }
  return { appended };
}

export function describeCodexResult(result) {
  if (!result) {
    return { state: "unknown", text: "No result." };
  }
  if (result.status === "completed") {
    return {
      state: "completed",
      text: compactText(result.stdout_tail || "Codex prompt completed.", 3000)
    };
  }
  return {
    state: "blocked",
    text: compactText(result.failure_signature || result.stderr_tail || result.recovery_hint || "Codex prompt failed.", 3000)
  };
}

export function chatTokenPresent(projectDir) {
  return fs.existsSync(resolveChatPaths(projectDir).chatSessionPath);
}
