import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const CLIENT_SESSION_FILE = path.join(".kfc", "session.json");
const REMOTE_AUTH_FILE = path.join(".kfc", "remote-auth.json");
const REMOTE_SESSION_FILE = path.join(".kfc", "remote-session.json");
const REMOTE_STATE_DIR = path.join(".local", "remote");
const REMOTE_TRANSCRIPT_FILE = path.join(REMOTE_STATE_DIR, "transcript.jsonl");

function nowIso() {
  return new Date().toISOString();
}

export function resolveRemotePaths(projectDir) {
  return {
    projectDir,
    clientSessionPath: path.join(projectDir, CLIENT_SESSION_FILE),
    authPath: path.join(projectDir, REMOTE_AUTH_FILE),
    sessionPath: path.join(projectDir, REMOTE_SESSION_FILE),
    stateDir: path.join(projectDir, REMOTE_STATE_DIR),
    transcriptPath: path.join(projectDir, REMOTE_TRANSCRIPT_FILE)
  };
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export async function ensureRemoteScaffold(projectDir) {
  const paths = resolveRemotePaths(projectDir);
  await fsp.mkdir(path.dirname(paths.authPath), { recursive: true });
  await fsp.mkdir(paths.stateDir, { recursive: true });
  return paths;
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function loadRemoteAuth(projectDir) {
  return await readJsonIfExists(resolveRemotePaths(projectDir).authPath, null);
}

export async function ensureRemoteAuth(projectDir, preferredToken = "", overwrite = false) {
  const paths = await ensureRemoteScaffold(projectDir);
  const existing = overwrite ? null : await readJsonIfExists(paths.authPath, null);
  if (existing?.token) {
    return { ...existing, authPath: paths.authPath, created: false };
  }
  const token = String(preferredToken || "").trim() || randomToken();
  const payload = {
    token,
    generated_at: nowIso()
  };
  await writeJson(paths.authPath, payload);
  return { ...payload, authPath: paths.authPath, created: true };
}

export async function revokeRemoteAuth(projectDir) {
  const paths = resolveRemotePaths(projectDir);
  try {
    await fsp.unlink(paths.authPath);
    return true;
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

export async function loadClientSession(projectDir) {
  return await readJsonIfExists(resolveRemotePaths(projectDir).clientSessionPath, null);
}

export async function loadRemoteSession(projectDir) {
  return await readJsonIfExists(resolveRemotePaths(projectDir).sessionPath, null);
}

export async function saveRemoteSession(projectDir, payload) {
  const paths = await ensureRemoteScaffold(projectDir);
  await writeJson(paths.sessionPath, payload);
  return paths.sessionPath;
}

export async function readTranscript(projectDir, limit = 200) {
  const transcriptPath = resolveRemotePaths(projectDir).transcriptPath;
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
  const paths = await ensureRemoteScaffold(projectDir);
  const payload = {
    id: entry?.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: entry?.created_at || nowIso(),
    role: String(entry?.role || "system"),
    kind: String(entry?.kind || "note"),
    text: String(entry?.text || "").trim(),
    status: entry?.status ? String(entry.status) : undefined,
    meta: entry?.meta && typeof entry.meta === "object" ? entry.meta : undefined
  };
  await fsp.appendFile(paths.transcriptPath, JSON.stringify(payload) + "\n", "utf8");
  return payload;
}

function compactText(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function summarizeRemoteResult(result) {
  if (!result) {
    return { state: "unknown", text: "No result." };
  }
  if (result.status === "completed") {
    return {
      state: "completed",
      text: compactText(result.stdout_tail || "Codex prompt completed.")
    };
  }
  return {
    state: "blocked",
    text: compactText(result.failure_signature || result.stderr_tail || result.recovery_hint || "Codex prompt failed.")
  };
}

export async function readLatestRunlogSignal(projectDir, planId) {
  const normalizedPlanId = String(planId || "").trim();
  if (!normalizedPlanId) {
    return null;
  }
  const runlogPath = path.join(projectDir, ".local", "runs", `${normalizedPlanId}.jsonl`);
  let raw = "";
  try {
    raw = await fsp.readFile(runlogPath, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Skip malformed line.
    }
  }
  return null;
}

export async function resolveBoundSession(projectDir) {
  const clientSession = await loadClientSession(projectDir);
  if (!clientSession?.planId) {
    return {
      bound: false,
      reason: "Missing .kfc/session.json. Run `kfc client` or regenerate the client ready artifacts first."
    };
  }
  const runlog = await readLatestRunlogSignal(projectDir, clientSession.planId);
  return {
    bound: true,
    plan_id: String(clientSession.planId),
    plan_path: String(clientSession.planPath || ""),
    profile: String(clientSession.profile || ""),
    generated_at: String(clientSession.generatedAt || ""),
    runlog
  };
}

export function remoteTokenPresent(projectDir) {
  return fs.existsSync(resolveRemotePaths(projectDir).authPath);
}
