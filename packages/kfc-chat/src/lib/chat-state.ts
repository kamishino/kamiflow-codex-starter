import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildInteractiveResumeCommand } from "@kamishino/kfc-runtime/session-actions";

const CLIENT_SESSION_FILE = path.join(".kfc", "session.json");
const CHAT_SESSION_FILE = path.join(".kfc", "chat-session.json");
const CHAT_STATE_DIR = path.join(".local", "chat");
const CHAT_TRANSCRIPT_FILE = path.join(CHAT_STATE_DIR, "transcript.jsonl");

export interface TranscriptEntry {
  id?: string;
  created_at?: string;
  role?: string;
  kind?: string;
  text?: string;
  status?: string;
  fingerprint?: string;
  meta?: Record<string, unknown>;
}

export interface TranscriptDisplayBlock {
  type: "message_group" | "event_row";
  id: string;
  role: string;
  label: string;
  created_at: string;
  status: string;
  align?: string;
  text?: string;
  items?: Array<{ id: string; text: string; created_at: string; status: string }>;
}

export interface ChatSessionDiscoveryItem {
  session_id: string;
  file_name: string;
  file_path: string;
  relative_path: string;
  date_path: string;
  bytes: number;
  modified_at: string;
  preview_text: string;
  preview: Array<{ role: string; text: string; timestamp: string }>;
}

export interface ChatSessionDiscoveryResponse {
  sessions_root: string;
  query: string;
  date: string;
  limit: number;
  total_matches: number;
  sessions: ChatSessionDiscoveryItem[];
}

type ListSessionsOptions = {
  query?: string;
  date?: string;
  limit?: number;
};

function nowIso() {
  return new Date().toISOString();
}

function compactText(value: unknown, maxLength = 1600) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function hashFingerprint(value: unknown) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativePath(value: unknown) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function parseDatePathFromRelative(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 4) {
    return null;
  }
  const [year, month, day] = segments;
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }
  return `${year}/${month}/${day}`;
}

function humanizeTypeLabel(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function readJsonIfExists<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(targetPath: string, payload: unknown) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function pathExists(targetPath: string) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertDirectoryExists(targetPath: string, label: string) {
  const stat = await fsp.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`);
  }
}

async function walkFiles(rootDir: string) {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
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

function extractSessionPreviewLine(rawLine: string) {
  const trimmed = String(rawLine || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    const fields = [payload.message, payload.text, payload.summary, payload.content, payload.reason, payload.prompt];
    const content = fields.find((item) => String(item || "").trim().length > 0);
    return {
      role: String(payload.role || payload.type || payload.event_type || "event"),
      text: compactText(content || trimmed, 280),
      timestamp: String(payload.updated_at || payload.created_at || payload.timestamp || "")
    };
  } catch {
    return {
      role: "raw",
      text: compactText(trimmed, 280),
      timestamp: ""
    };
  }
}

async function buildSessionDiscoveryItem(sessionsRoot: string, filePath: string) {
  const stat = await fsp.stat(filePath);
  const relativePath = normalizeRelativePath(path.relative(sessionsRoot, filePath));
  const datePath = parseDatePathFromRelative(relativePath) || "";
  const tailText = await readTailText(filePath, 65536);
  const lines = tailText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines
    .slice(-6)
    .map((line) => extractSessionPreviewLine(line))
    .filter((entry): entry is NonNullable<ReturnType<typeof extractSessionPreviewLine>> => Boolean(entry));
  return {
    session_id: path.basename(filePath, path.extname(filePath)),
    file_name: path.basename(filePath),
    file_path: filePath,
    relative_path: relativePath,
    date_path: datePath,
    bytes: stat.size,
    modified_at: new Date(stat.mtimeMs).toISOString(),
    preview_text: preview.map((item) => item.text).join(" | "),
    preview
  };
}

async function selectLatestFile(filePaths: string[]) {
  const scored: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fsp.stat(filePath);
      scored.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Ignore unreadable files.
    }
  }
  scored.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return scored[0]?.filePath || "";
}

async function resolveSessionRecord(sessionsRoot: string, sessionId: string) {
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

async function readTranscriptFingerprints(projectDir: string) {
  const items = await readTranscript(projectDir, 1000);
  return new Set(items.map((item) => String(item.fingerprint || "")).filter(Boolean));
}

async function readTailText(filePath: string, maxBytes = 65536) {
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

function extractCodexTailEntry(rawLine: string): TranscriptEntry | null {
  const trimmed = String(rawLine || "").trim();
  if (!trimmed) {
    return null;
  }
  const fingerprint = `codex:${hashFingerprint(trimmed)}`;
  try {
    const payload = JSON.parse(trimmed) as Record<string, any>;
    const nested = isPlainRecord(payload.payload) ? payload.payload : null;
    const record = nested || payload;
    const topType = String(payload.type || payload.event_type || "").toLowerCase();
    const nestedType = String(record.type || "").toLowerCase();
    const createdAt = String(record.updated_at || record.created_at || payload.updated_at || payload.created_at || payload.timestamp || nowIso());
    if (topType === "event_msg") {
      const eventType = nestedType || "event_msg";
      const message = compactText(record.message || record.text || record.summary || record.reason || record.content || "", 3000);
      if (eventType === "token_count") {
        return null;
      }
      if (eventType === "user_message") {
        return {
          created_at: createdAt,
          role: "user",
          kind: "user_message",
          text: message || "User message.",
          status: "synced",
          fingerprint,
          meta: { source: "codex_session", raw_role: "user_message", raw_type: eventType }
        };
      }
      if (eventType === "agent_message") {
        return {
          created_at: createdAt,
          role: "assistant",
          kind: "agent_message",
          text: message || "Codex reply.",
          status: "synced",
          fingerprint,
          meta: { source: "codex_session", raw_role: "agent_message", raw_type: eventType }
        };
      }
      const fallbackTextByType: Record<string, string> = {
        task_started: "Task started.",
        task_complete: "Task complete.",
        agent_reasoning: "Reasoning updated."
      };
      return {
        created_at: createdAt,
        role: "system",
        kind: eventType,
        text: message || fallbackTextByType[eventType] || `${humanizeTypeLabel(eventType || "event")}.`,
        status: "synced",
        fingerprint,
        meta: { source: "codex_session", raw_role: "event_msg", raw_type: eventType }
      };
    }
    const fields = [
      record.message,
      record.text,
      record.summary,
      record.content,
      record.reason,
      record.prompt,
      record.output,
      payload.message,
      payload.text,
      payload.summary,
      payload.content,
      payload.reason,
      payload.prompt
    ];
    const content = fields.find((item) => String(item || "").trim().length > 0);
    const isToolEvent = ["function_call_output", "function_call", "tool_call", "tool_result"].includes(nestedType);
    const role = isToolEvent
      ? "system"
      : String(record.role || payload.role || record.type || payload.type || payload.event_type || "event");
    const kind = isToolEvent ? nestedType : "codex_tail";
    const status = String(record.status || payload.status || (isToolEvent ? "synced" : "synced"));
    const text = isToolEvent
      ? compactText(record.output || record.text || record.summary || trimmed, 3000)
      : compactText(content || trimmed, 3000);
    return {
      created_at: createdAt,
      role,
      kind,
      text,
      status,
      fingerprint,
      meta: {
        source: "codex_session",
        raw_role: String(record.role || payload.role || record.type || payload.type || payload.event_type || "event"),
        raw_type: nestedType || topType || ""
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
      meta: { source: "codex_session" }
    };
  }
}

function isEventTranscriptItem(item: TranscriptEntry) {
  const kind = String(item?.kind || "").toLowerCase();
  const role = String(item?.role || "").toLowerCase();
  return kind === "prompt_error" || kind === "function_call_output" || kind === "function_call" || kind === "tool_call" || kind === "tool_result" || role === "system" || role === "raw";
}

function normalizeDisplayRole(item: TranscriptEntry) {
  const kind = String(item?.kind || "").toLowerCase();
  const role = String(item?.role || item?.kind || "event").toLowerCase();
  if (kind === "prompt_error") {
    return "prompt_error";
  }
  if (role === "assistant" || role === "codex_result" || role === "codex_tail") {
    return "assistant";
  }
  if (role === "user") {
    return "user";
  }
  return role || "event";
}

function prettyDisplayLabel(role: string) {
  if (role === "assistant") return "Codex";
  if (role === "user") return "You";
  if (role === "prompt_error") return "Blocked";
  if (role === "system") return "System";
  if (role === "function_call_output") return "Tool Output";
  if (role === "function_call" || role === "tool_call") return "Tool Call";
  if (role === "tool_result") return "Tool Result";
  if (role === "task_started") return "Task Started";
  if (role === "task_complete") return "Task Complete";
  if (role === "agent_reasoning") return "Reasoning";
  if (role === "raw") return "Synced";
  return role ? humanizeTypeLabel(role) : "Event";
}

function normalizeTranscriptItemForDisplay(item: TranscriptEntry, index: number) {
  const role = normalizeDisplayRole(item);
  const kind = String(item?.kind || "");
  const labelKey = isEventTranscriptItem(item) ? kind.toLowerCase() || role : role;
  return {
    id: String(item?.id || `entry_${index}`),
    role,
    kind,
    label: prettyDisplayLabel(labelKey),
    text: compactText(item?.text || "", 3000),
    created_at: String(item?.created_at || ""),
    status: String(item?.status || ""),
    is_event: isEventTranscriptItem(item),
    align: role === "user" ? "right" : "left"
  };
}

export function buildTranscriptDisplayBlocks(items: TranscriptEntry[]): TranscriptDisplayBlock[] {
  const normalized = (items || [])
    .map((item, index) => normalizeTranscriptItemForDisplay(item, index))
    .sort((left, right) => {
      const leftTime = Number.isFinite(Date.parse(left.created_at)) ? Date.parse(left.created_at) : 0;
      const rightTime = Number.isFinite(Date.parse(right.created_at)) ? Date.parse(right.created_at) : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(right.id || "").localeCompare(String(left.id || ""));
    });
  const blocks: TranscriptDisplayBlock[] = [];
  for (const item of normalized) {
    const previous = blocks[blocks.length - 1];
    if (!item.is_event && previous && previous.type === "message_group" && previous.role === item.role) {
      previous.items!.push({ id: item.id, text: item.text, created_at: item.created_at, status: item.status });
      previous.created_at = item.created_at || previous.created_at;
      previous.status = item.status || previous.status;
      continue;
    }
    if (item.is_event) {
      blocks.push({
        type: "event_row",
        id: item.id,
        role: item.role,
        label: item.label,
        text: item.text,
        created_at: item.created_at,
        status: item.status
      });
      continue;
    }
    blocks.push({
      type: "message_group",
      id: item.id,
      role: item.role,
      label: item.label,
      align: item.align,
      created_at: item.created_at,
      status: item.status,
      items: [{ id: item.id, text: item.text, created_at: item.created_at, status: item.status }]
    });
  }
  return blocks;
}

export function defaultSessionsRoot() {
  return path.join(os.homedir(), ".codex", "sessions");
}

function buildUnboundSessionState(state: string, extras: Record<string, unknown> = {}) {
  return { bound: false, state, can_bind: false, can_prompt: false, ...extras };
}

export function resolveChatPaths(projectDir: string) {
  return {
    projectDir,
    clientSessionPath: path.join(projectDir, CLIENT_SESSION_FILE),
    chatSessionPath: path.join(projectDir, CHAT_SESSION_FILE),
    chatStateDir: path.join(projectDir, CHAT_STATE_DIR),
    transcriptPath: path.join(projectDir, CHAT_TRANSCRIPT_FILE)
  };
}

export async function ensureChatScaffold(projectDir: string) {
  const paths = resolveChatPaths(projectDir);
  await fsp.mkdir(path.dirname(paths.clientSessionPath), { recursive: true });
  await fsp.mkdir(paths.chatStateDir, { recursive: true });
  return paths;
}

export async function loadClientSession(projectDir: string) {
  return await readJsonIfExists<Record<string, any> | null>(resolveChatPaths(projectDir).clientSessionPath, null);
}

export async function saveClientSession(projectDir: string, payload: unknown) {
  const paths = await ensureChatScaffold(projectDir);
  await writeJson(paths.clientSessionPath, payload);
  return paths.clientSessionPath;
}

export async function loadChatSession(projectDir: string) {
  return await readJsonIfExists<Record<string, any> | null>(resolveChatPaths(projectDir).chatSessionPath, null);
}

export async function saveChatSession(projectDir: string, payload: unknown) {
  const paths = await ensureChatScaffold(projectDir);
  await writeJson(paths.chatSessionPath, payload);
  return paths.chatSessionPath;
}

export async function findSessionMatches(sessionsRoot: string, sessionId: string) {
  const needle = String(sessionId || "").trim().toLowerCase();
  if (!needle || needle.length < 8) {
    throw new Error("Invalid session id. Provide the full session id.");
  }
  await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  const files = await walkFiles(sessionsRoot);
  return files.filter((item) => path.extname(item).toLowerCase() === ".jsonl").filter((item) => path.basename(item).toLowerCase().includes(needle)).sort((left, right) => left.localeCompare(right));
}

function isMatch(value: string, needle: string) {
  return String(value || "").toLowerCase().includes(needle);
}

export async function listAvailableSessions(sessionsRoot: string, options: ListSessionsOptions = {}): Promise<ChatSessionDiscoveryResponse> {
  const query = String(options.query || "").trim().toLowerCase();
  const date = String(options.date || "").trim();
  const parsedLimit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 0;
  const limit = parsedLimit >= 1 ? Math.min(parsedLimit, 200) : 50;
  try {
    await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  } catch {
    return {
      sessions_root: sessionsRoot,
      query,
      date,
      limit,
      total_matches: 0,
      sessions: []
    };
  }
  const files = (await walkFiles(sessionsRoot)).filter((item) => path.extname(item).toLowerCase() === ".jsonl");
  const sessions: ChatSessionDiscoveryItem[] = [];
  for (const filePath of files) {
    const record = await buildSessionDiscoveryItem(sessionsRoot, filePath);
    if (date && record.date_path !== date) {
      continue;
    }
    if (query) {
      const haystack = [record.session_id, record.file_name, record.relative_path, record.preview_text].join(" ").toLowerCase();
      if (!isMatch(haystack, query)) {
        continue;
      }
    }
    sessions.push(record);
  }
  sessions.sort((left, right) => Date.parse(right.modified_at) - Date.parse(left.modified_at));
  return {
    sessions_root: sessionsRoot,
    query,
    date,
    limit,
    total_matches: sessions.length,
    sessions: sessions.slice(0, limit)
  };
}

export async function bindCodexSession(projectDir: string, sessionId: string, sessionsRoot = defaultSessionsRoot()) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession?.planId) {
    throw new Error("Missing .kfc/session.json. Run `kfc client --force --no-launch-codex` first.");
  }
  const record = await resolveSessionRecord(sessionsRoot, sessionId);
  const next = { ...clientSession, codexSessionId: record.session_id, codexSessionPath: record.session_path, codexBoundAt: nowIso() };
  const clientSessionPath = await saveClientSession(projectDir, next);
  return {
    session_id: record.session_id,
    session_path: record.session_path,
    client_session_path: clientSessionPath,
    manual_resume_command: buildInteractiveResumeCommand(record.session_id)
  };
}

export async function unbindCodexSession(projectDir: string) {
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

export async function resolveBoundSession(projectDir: string, sessionsRoot = defaultSessionsRoot()) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession?.planId) {
    return buildUnboundSessionState("client_session_missing", {
      reason: "Missing .kfc/session.json. Run `kfc client --force --no-launch-codex` first.",
      onboarding_command: "kfc client --force --no-launch-codex",
      onboarding_title: "Initialize the project runtime first."
    });
  }
  const sessionId = String(clientSession.codexSessionId || "").trim();
  if (!sessionId) {
    return buildUnboundSessionState("session_unbound", {
      reason: "No Codex session bound. Paste a Codex session id to bind this project.",
      onboarding_title: "Bind a Codex session to this project.",
      can_bind: true,
      plan_id: String(clientSession.planId || ""),
      plan_path: String(clientSession.planPath || ""),
      profile: String(clientSession.profile || ""),
      generated_at: String(clientSession.generatedAt || "")
    });
  }

  let sessionPath = String(clientSession.codexSessionPath || "").trim();
  if (!sessionPath || !(await pathExists(sessionPath))) {
    try {
      const resolved = await resolveSessionRecord(sessionsRoot, sessionId);
      sessionPath = resolved.session_path;
      await saveClientSession(projectDir, {
        ...clientSession,
        codexSessionId: resolved.session_id,
        codexSessionPath: resolved.session_path,
        codexBoundAt: clientSession.codexBoundAt || nowIso()
      });
    } catch {
      return buildUnboundSessionState("session_stale", {
        reason: "The bound Codex session could not be found. Paste a session id to bind or rebind this project.",
        onboarding_title: "Rebind the missing Codex session.",
        can_bind: true,
        session_id: sessionId,
        plan_id: String(clientSession.planId || ""),
        plan_path: String(clientSession.planPath || ""),
        profile: String(clientSession.profile || ""),
        generated_at: String(clientSession.generatedAt || "")
      });
    }
  }

  return {
    bound: true,
    state: "bound",
    can_bind: true,
    can_prompt: true,
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

export async function ensureChatRuntimeSession(projectDir: string, options: Record<string, any> = {}) {
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

export async function readTranscript(projectDir: string, limit = 200): Promise<TranscriptEntry[]> {
  const transcriptPath = resolveChatPaths(projectDir).transcriptPath;
  let raw = "";
  try {
    raw = await fsp.readFile(transcriptPath, "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: TranscriptEntry[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // Ignore malformed line.
    }
  }
  return items;
}

export async function appendTranscriptEntry(projectDir: string, entry: TranscriptEntry) {
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

export async function hydrateTranscriptFromCodex(projectDir: string, sessionPath: string) {
  if (!sessionPath || !(await pathExists(sessionPath))) {
    return { appended: [] as TranscriptEntry[] };
  }
  const seenFingerprints = await readTranscriptFingerprints(projectDir);
  const tailText = await readTailText(sessionPath, 262144);
  const lines = tailText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const appended: TranscriptEntry[] = [];
  for (const line of lines) {
    const entry = extractCodexTailEntry(line);
    if (!entry || seenFingerprints.has(entry.fingerprint!)) {
      continue;
    }
    const persisted = await appendTranscriptEntry(projectDir, entry);
    appended.push(persisted);
    seenFingerprints.add(String(persisted.fingerprint || ""));
  }
  return { appended };
}

export function describeCodexResult(result: any) {
  if (!result) {
    return { state: "unknown", text: "No result." };
  }
  if (result.status === "completed") {
    return { state: "completed", text: compactText(result.stdout_tail || result.stderr_tail || "Prompt completed.", 3000) };
  }
  return { state: "blocked", text: compactText(result.stderr_tail || result.error_code || result.status || "Prompt failed.", 3000) };
}
