import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildInteractiveResumeCommand } from "../../../dist/lib/session-actions.js";

let fixtureWriteTick = 0;

type ListSessionsOptions = {
  query?: string;
  date?: string;
};

export function defaultSessionsRoot() {
  return path.join(os.homedir(), ".codex", "sessions");
}

export function expandHome(rawPath) {
  const value = String(rawPath || "").trim();
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function resolvePath(baseCwd, rawPath, fallback = "") {
  const expanded = expandHome(rawPath || fallback);
  if (!expanded) {
    return "";
  }
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseCwd, expanded);
}

export function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

export function joinPortable(parts) {
  return normalizeRelativePath(parts.filter(Boolean).join("/"));
}

export function sessionIdFromFilePath(filePath) {
  return path.basename(String(filePath || ""), path.extname(String(filePath || "")));
}

export async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function assertDirectoryExists(targetPath, label) {
  const stat = await fsp.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`);
  }
}

export async function walkFiles(rootDir) {
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

export async function selectLatestFile(filePaths) {
  const scored = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fsp.stat(filePath);
      scored.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip unreadable files.
    }
  }
  scored.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return scored[0]?.filePath || "";
}

export function parseDatePathFromRelative(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 4) {
    return null;
  }
  const [year, month, day] = segments;
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }
  return {
    datePath: joinPortable([year, month, day]),
    fileName: segments[segments.length - 1]
  };
}

export function datePathFromNow() {
  const now = new Date();
  return joinPortable([
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ]);
}

export async function findSessionMatches(sessionsRoot, id) {
  if (!id || String(id).trim().length < 8) {
    throw new Error("Invalid session id. Provide the full session id.");
  }
  await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  const needle = String(id).trim().toLowerCase();
  const files = await walkFiles(sessionsRoot);
  return files
    .filter((item) => path.extname(item).toLowerCase() === ".jsonl")
    .filter((item) => path.basename(item).toLowerCase().includes(needle))
    .sort((left, right) => left.localeCompare(right));
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

function compactText(value, maxLength = 160) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function extractLinePreview(rawLine) {
  const trimmed = String(rawLine || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const payload = JSON.parse(trimmed);
    const fields = [
      payload.message,
      payload.text,
      payload.summary,
      payload.content,
      payload.reason,
      payload.prompt
    ];
    const content = fields.find((item) => String(item || "").trim().length > 0);
    return {
      role: String(payload.role || payload.type || payload.event_type || "event"),
      text: compactText(content || trimmed),
      timestamp: String(payload.updated_at || payload.created_at || payload.timestamp || "")
    };
  } catch {
    return {
      role: "raw",
      text: compactText(trimmed),
      timestamp: ""
    };
  }
}

async function buildSessionTail(filePath) {
  const tailText = await readTailText(filePath);
  const lines = tailText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = lines
    .slice(-12)
    .map((line) => extractLinePreview(line))
    .filter(Boolean);
  return {
    preview,
    tailText: lines.slice(-20).join("\n")
  };
}

async function buildSessionRecord(sessionsRoot, filePath, detail = false) {
  const stat = await fsp.stat(filePath);
  const relativePath = normalizeRelativePath(path.relative(sessionsRoot, filePath));
  const dateInfo = parseDatePathFromRelative(relativePath);
  const tail = await buildSessionTail(filePath);
  return {
    session_id: sessionIdFromFilePath(filePath),
    file_name: path.basename(filePath),
    file_path: filePath,
    relative_path: relativePath,
    date_path: dateInfo?.datePath || "",
    bytes: stat.size,
    modified_at: new Date(stat.mtimeMs).toISOString(),
    preview: tail.preview,
    preview_text: tail.preview.map((item) => item.text).join(" | "),
    tail_text: detail ? tail.tailText : ""
  };
}

export async function listSessions(sessionsRoot, options: ListSessionsOptions = {}) {
  await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  const files = await walkFiles(sessionsRoot);
  const query = String(options.query || "").trim().toLowerCase();
  const date = String(options.date || "").trim();
  const jsonlFiles = files.filter((item) => path.extname(item).toLowerCase() === ".jsonl");
  const records = [];
  for (const filePath of jsonlFiles) {
    const record = await buildSessionRecord(sessionsRoot, filePath, false);
    if (date && record.date_path !== date) {
      continue;
    }
    if (query) {
      const haystack = [record.session_id, record.file_name, record.relative_path, record.preview_text]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        continue;
      }
    }
    records.push(record);
  }
  records.sort((left, right) => Date.parse(right.modified_at) - Date.parse(left.modified_at));
  return records;
}

export async function getSessionDetail(sessionsRoot, sessionId) {
  const matches = await findSessionMatches(sessionsRoot, sessionId);
  if (matches.length === 0) {
    throw new Error(`No session file found for id: ${sessionId}`);
  }
  const target = matches.length === 1 ? matches[0] : await selectLatestFile(matches);
  return await buildSessionRecord(sessionsRoot, target, true);
}

function resolveExportDestination(record, destinationRoot) {
  if (String(destinationRoot || "").toLowerCase().endsWith(".jsonl")) {
    return destinationRoot;
  }
  return path.join(destinationRoot, ...String(record.date_path || datePathFromNow()).split("/"), record.file_name);
}

export async function exportSession(sessionsRoot, sessionId, destinationRoot) {
  const record = await getSessionDetail(sessionsRoot, sessionId);
  const targetPath = resolveExportDestination(record, destinationRoot);
  if (await pathExists(targetPath)) {
    throw new Error(`Destination already exists: ${targetPath}`);
  }
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.copyFile(record.file_path, targetPath);
  return {
    session_id: record.session_id,
    source_path: record.file_path,
    destination_path: targetPath
  };
}

async function importOneFile(sessionsRoot, sourceFile) {
  const sourceRelative = normalizeRelativePath(sourceFile);
  const dateInfo = parseDatePathFromRelative(sourceRelative);
  const destinationPath = dateInfo
    ? path.join(sessionsRoot, ...dateInfo.datePath.split("/"), dateInfo.fileName)
    : path.join(sessionsRoot, ...datePathFromNow().split("/"), path.basename(sourceFile));
  if (await pathExists(destinationPath)) {
    throw new Error(`Destination already exists: ${destinationPath}`);
  }
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.copyFile(sourceFile, destinationPath);
  return {
    session_id: sessionIdFromFilePath(destinationPath),
    source_path: sourceFile,
    destination_path: destinationPath
  };
}

export async function importSessions(sessionsRoot, sourcePath) {
  const stat = await fsp.stat(sourcePath);
  const imported = [];
  if (stat.isFile()) {
    imported.push(await importOneFile(sessionsRoot, sourcePath));
    return imported;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Import source is not a file or directory: ${sourcePath}`);
  }
  const files = (await walkFiles(sourcePath)).filter((item) => path.extname(item).toLowerCase() === ".jsonl");
  if (files.length === 0) {
    throw new Error(`No .jsonl session files found under: ${sourcePath}`);
  }
  for (const filePath of files) {
    imported.push(await importOneFile(sessionsRoot, filePath));
  }
  return imported;
}

export async function restoreSession(sessionsRoot, sessionId) {
  const record = await getSessionDetail(sessionsRoot, sessionId);
  return {
    session_id: record.session_id,
    session_path: record.file_path,
    manual_resume_command: buildInteractiveResumeCommand(record.session_id),
    message: "Session is present in the Codex sessions root. Resume it manually with the printed command."
  };
}

export async function summarizeSessionsRoot(sessionsRoot) {
  const sessions = await listSessions(sessionsRoot);
  return {
    sessions_root: sessionsRoot,
    total_sessions: sessions.length,
    latest_session_id: sessions[0]?.session_id || ""
  };
}

export async function ensureSessionsRoot(sessionsRoot) {
  if (!(await pathExists(sessionsRoot))) {
    await fsp.mkdir(sessionsRoot, { recursive: true });
  }
  await assertDirectoryExists(sessionsRoot, "Codex sessions root");
  return sessionsRoot;
}

export async function writeFixtureSession(rootDir, datePath, sessionId, items) {
  const targetPath = path.join(rootDir, ...datePath.split("/"), `${sessionId}.jsonl`);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const payload = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
  await fsp.writeFile(targetPath, payload, "utf8");
  fixtureWriteTick += 1;
  const mtime = new Date(Date.UTC(2026, 2, 7, 0, 0, fixtureWriteTick));
  await fsp.utimes(targetPath, mtime, mtime);
  return targetPath;
}

export function isJsonlPath(targetPath) {
  return path.extname(String(targetPath || "")).toLowerCase() === ".jsonl";
}

export function readJsonIfExists(targetPath, fallback = null) {
  if (!fs.existsSync(targetPath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}
