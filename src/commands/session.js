import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { error, info } from "../lib/logger.js";

const PASS_ENV_NAME = "KFC_SESSION_PASSPHRASE";
const INDEX_FILE_NAME = "kfc-session-index.json";
const ENVELOPE_FORMAT = "kfc-session-envelope-v1";
const KDF_ITERATIONS = 210000;
const KDF_KEY_LENGTH = 32;
const GCM_IV_BYTES = 12;
const SALT_BYTES = 16;

function usage() {
  info("Usage: kfc session <where|find|copy|push|pull> [options]");
  info("Examples:");
  info("  kfc session where");
  info("  kfc session find --id 019caccc-f25d-7151-ad1d-6eab893d714d");
  info("  kfc session push --to E:/transfer/codex-sessions");
  info("  kfc session push --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions");
  info("  kfc session pull --from E:/transfer/codex-sessions");
  info("  kfc session pull --from E:/transfer/codex-sessions --id 019caccc-f25d-7151-ad1d-6eab893d714d");
  info("  kfc session copy --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions");
  info("  kfc session copy --to E:/transfer/codex-sessions --date 2026-03-04");
  info("Options:");
  info("  --from <path>      Source sessions root (default: ~/.codex/sessions)");
  info("  --to <path>        Target sessions root or transfer folder (required for push/copy)");
  info("  --id <session-id>  Find/copy/push/pull one session by id");
  info("  --date <YYYY-MM-DD|YYYY/MM/DD>  Copy only one session day folder");
  info("  --overwrite        Replace destination path if it already exists");
  info("  --merge            Keep existing destination file/path when present");
  info(`Security: set ${PASS_ENV_NAME} for encrypted push/pull.`);
}

function defaultSessionsRoot() {
  return path.join(os.homedir(), ".codex", "sessions");
}

function parseDateParts(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/").replace(/-/g, "/");
  const match = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) {
    throw new Error("Invalid --date value. Use YYYY-MM-DD or YYYY/MM/DD.");
  }
  return { year: match[1], month: match[2], day: match[3] };
}

function expandHome(rawPath) {
  const value = String(rawPath || "").trim();
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolvePath(baseCwd, rawPath) {
  const expanded = expandHome(rawPath);
  if (!expanded) {
    return "";
  }
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseCwd, expanded);
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function joinPortable(parts) {
  return normalizeRelativePath(parts.filter(Boolean).join("/"));
}

function datePathFromNow() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return joinPortable([year, month, day]);
}

function parseDatePathFromRelative(relativePath) {
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

function sessionIdFromFilePath(filePath) {
  return path.basename(String(filePath || ""), path.extname(String(filePath || "")));
}

function hashSha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function requireSyncPassphrase() {
  const value = String(process.env[PASS_ENV_NAME] || "").trim();
  if (!value) {
    throw new Error(`Missing ${PASS_ENV_NAME}. Set this environment variable before using session push/pull.`);
  }
  return value;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertDirectoryExists(targetPath, label) {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`);
  }
}

function parseArgs(baseCwd, args) {
  const parsed = {
    subcommand: "",
    from: defaultSessionsRoot(),
    to: "",
    id: "",
    date: "",
    overwrite: false,
    merge: false,
    fromProvided: false,
    toProvided: false
  };

  let rest = args;
  if (rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.subcommand = rest[0];
    rest = rest.slice(1);
  }

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--from") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --from.");
      }
      parsed.from = value;
      parsed.fromProvided = true;
      i += 1;
      continue;
    }
    if (token === "--to") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --to.");
      }
      parsed.to = value;
      parsed.toProvided = true;
      i += 1;
      continue;
    }
    if (token === "--id") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --id.");
      }
      parsed.id = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--date") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --date.");
      }
      parsed.date = value;
      i += 1;
      continue;
    }
    if (token === "--overwrite") {
      parsed.overwrite = true;
      continue;
    }
    if (token === "--merge") {
      parsed.merge = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.subcommand = "help";
      return parsed;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  parsed.from = resolvePath(baseCwd, parsed.from);
  parsed.to = resolvePath(baseCwd, parsed.to);
  return parsed;
}

async function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
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
      const stat = await fs.stat(filePath);
      scored.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip unreadable files
    }
  }
  scored.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return scored[0]?.filePath || "";
}

async function findLatestSessionFile(sessionsRoot) {
  await assertDirectoryExists(sessionsRoot, "Source sessions root");
  const files = await walkFiles(sessionsRoot);
  const candidates = files.filter((item) => path.extname(item).toLowerCase() === ".jsonl");
  if (!candidates.length) {
    return "";
  }
  return await selectLatestFile(candidates);
}

async function findSessionMatches(fromRoot, id) {
  if (!id || String(id).trim().length < 8) {
    throw new Error("Invalid --id. Provide the full session id.");
  }
  await assertDirectoryExists(fromRoot, "Source sessions root");
  const needle = String(id).trim().toLowerCase();
  const files = await walkFiles(fromRoot);
  const matches = files
    .filter((item) => path.extname(item).toLowerCase() === ".jsonl")
    .filter((item) => path.basename(item).toLowerCase().includes(needle));
  matches.sort((a, b) => a.localeCompare(b));
  return matches;
}

async function resolveSessionSourceForPush(parsed) {
  const sourceRoot = parsed.from || defaultSessionsRoot();
  await assertDirectoryExists(sourceRoot, "Source sessions root");

  if (parsed.id) {
    const matches = await findSessionMatches(sourceRoot, parsed.id);
    if (!matches.length) {
      throw new Error(`No session file found for id: ${parsed.id}`);
    }
    const sourceFile = matches.length === 1 ? matches[0] : await selectLatestFile(matches);
    return { sourceFile, sessionId: String(parsed.id).trim(), reason: "explicit-id" };
  }

  const envSessionId = String(process.env.CODEX_THREAD_ID || "").trim();
  if (envSessionId) {
    const envMatches = await findSessionMatches(sourceRoot, envSessionId);
    if (envMatches.length === 1) {
      return { sourceFile: envMatches[0], sessionId: envSessionId, reason: "codex-thread-id" };
    }
    if (envMatches.length > 1) {
      const sourceFile = await selectLatestFile(envMatches);
      return { sourceFile, sessionId: envSessionId, reason: "codex-thread-id-latest" };
    }
  }

  const latestFile = await findLatestSessionFile(sourceRoot);
  if (!latestFile) {
    throw new Error(
      "Cannot auto-resolve session id. Provide --id or ensure ~/.codex/sessions contains at least one .jsonl session file."
    );
  }

  return { sourceFile: latestFile, sessionId: sessionIdFromFilePath(latestFile), reason: "latest-file" };
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KDF_KEY_LENGTH, "sha256");
}

function encryptSessionBuffer(plaintextBuffer, metadata, passphrase) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    format: ENVELOPE_FORMAT,
    created_at: new Date().toISOString(),
    kdf: {
      name: "pbkdf2-sha256",
      iterations: KDF_ITERATIONS,
      salt_b64: salt.toString("base64"),
      key_length: KDF_KEY_LENGTH
    },
    cipher: {
      name: "aes-256-gcm",
      iv_b64: iv.toString("base64"),
      tag_b64: authTag.toString("base64")
    },
    metadata,
    payload_b64: encrypted.toString("base64")
  };
}

function decryptSessionEnvelope(envelope, passphrase) {
  if (!envelope || envelope.format !== ENVELOPE_FORMAT) {
    throw new Error("Invalid session envelope format.");
  }
  const salt = Buffer.from(String(envelope?.kdf?.salt_b64 || ""), "base64");
  const iv = Buffer.from(String(envelope?.cipher?.iv_b64 || ""), "base64");
  const tag = Buffer.from(String(envelope?.cipher?.tag_b64 || ""), "base64");
  const encrypted = Buffer.from(String(envelope?.payload_b64 || ""), "base64");
  if (!salt.length || !iv.length || !tag.length || !encrypted.length) {
    throw new Error("Corrupt session envelope payload.");
  }

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error("Session decryption failed. Check KFC_SESSION_PASSPHRASE or artifact integrity.");
  }

  const sha = hashSha256(plaintext);
  const expectedSha = String(envelope?.metadata?.sha256 || "");
  if (expectedSha && sha !== expectedSha) {
    throw new Error("Session integrity check failed (sha256 mismatch).");
  }

  return {
    plaintext,
    metadata: envelope.metadata || {}
  };
}

function resolveIndexPath(transferRoot) {
  return path.join(transferRoot, INDEX_FILE_NAME);
}

async function readSessionIndex(transferRoot) {
  const indexPath = resolveIndexPath(transferRoot);
  if (!(await pathExists(indexPath))) {
    return {
      version: 1,
      updated_at: null,
      entries: []
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(indexPath, "utf8"));
  } catch {
    throw new Error(`Invalid session index file: ${indexPath}`);
  }
  return {
    version: Number(parsed?.version || 1),
    updated_at: parsed?.updated_at || null,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : []
  };
}

async function writeSessionIndex(transferRoot, index) {
  const indexPath = resolveIndexPath(transferRoot);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
}

function upsertSessionIndexEntry(index, entry) {
  const entries = Array.isArray(index.entries) ? [...index.entries] : [];
  const next = entries.filter((item) => String(item?.session_id || "") !== String(entry.session_id));
  next.push(entry);
  next.sort((a, b) => Date.parse(String(b.updated_at || "")) - Date.parse(String(a.updated_at || "")));
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    entries: next
  };
}

function resolveTransferPaths(parsed) {
  const fromRoot = parsed.from;
  const toRoot = parsed.to;
  if (!toRoot) {
    throw new Error("Missing --to path for `kfc session copy`.");
  }
  if (parsed.id && parsed.date) {
    throw new Error("Use either --id or --date for `kfc session copy`, not both.");
  }

  if (!parsed.date) {
    return { fromPath: fromRoot, toPath: toRoot, fromRoot, toRoot, dayPath: null };
  }

  const day = parseDateParts(parsed.date);
  const dayPath = path.join(day.year, day.month, day.day);
  return {
    fromPath: path.join(fromRoot, dayPath),
    toPath: path.join(toRoot, dayPath),
    fromRoot,
    toRoot,
    dayPath
  };
}

async function runFind(parsed) {
  if (!parsed.id) {
    throw new Error("Missing --id for `kfc session find`.");
  }
  const matches = await findSessionMatches(parsed.from, parsed.id);
  if (matches.length === 0) {
    throw new Error(`No session file found for id: ${parsed.id}`);
  }
  info(`Found ${matches.length} session file(s):`);
  for (const match of matches) {
    info(match);
  }
}

async function runCopyById(parsed) {
  if (!parsed.id) {
    throw new Error("Missing --id for `kfc session copy`.");
  }
  if (!parsed.to) {
    throw new Error("Missing --to path for `kfc session copy`.");
  }

  const matches = await findSessionMatches(parsed.from, parsed.id);
  if (matches.length === 0) {
    throw new Error(`No session file found for id: ${parsed.id}`);
  }
  if (matches.length > 1) {
    const preview = matches.map((item) => `- ${item}`).join("\n");
    throw new Error(`Multiple session files match id ${parsed.id}. Narrow with --from.\n${preview}`);
  }

  const sourceFile = matches[0];
  const relative = path.relative(parsed.from, sourceFile);
  const parsedDate = parseDatePathFromRelative(relative);
  const destinationFile = parsedDate
    ? path.join(parsed.to, ...parsedDate.datePath.split("/"), parsedDate.fileName)
    : path.join(parsed.to, path.basename(sourceFile));
  const destinationExists = await pathExists(destinationFile);
  if (destinationExists && !parsed.overwrite && !parsed.merge) {
    throw new Error(`Destination already exists: ${destinationFile}. Use --overwrite or --merge.`);
  }

  await fs.mkdir(path.dirname(destinationFile), { recursive: true });
  if (destinationExists && parsed.merge) {
    info(`Destination already exists; keeping existing file (merge mode): ${destinationFile}`);
    return;
  }
  await fs.copyFile(sourceFile, destinationFile);
  info(`Copied session file: ${sourceFile}`);
  info(`Destination: ${destinationFile}`);
}

async function runCopy(parsed) {
  if (parsed.overwrite && parsed.merge) {
    throw new Error("Use either --overwrite or --merge, not both.");
  }

  if (parsed.id) {
    await runCopyById(parsed);
    return;
  }

  const resolved = resolveTransferPaths(parsed);
  await assertDirectoryExists(resolved.fromRoot, "Source sessions root");
  await assertDirectoryExists(resolved.fromPath, "Source path");

  if (path.resolve(resolved.fromPath) === path.resolve(resolved.toPath)) {
    throw new Error("Source and destination are the same path.");
  }

  const destinationExists = await pathExists(resolved.toPath);
  if (destinationExists && !parsed.overwrite && !parsed.merge) {
    throw new Error(`Destination already exists: ${resolved.toPath}. Use --overwrite or --merge.`);
  }

  if (destinationExists && parsed.overwrite) {
    await fs.rm(resolved.toPath, { recursive: true, force: true });
  }

  await fs.mkdir(path.dirname(resolved.toPath), { recursive: true });
  await fs.cp(resolved.fromPath, resolved.toPath, {
    recursive: true,
    force: !parsed.merge,
    errorOnExist: false
  });

  info(`Copied sessions: ${resolved.fromPath}`);
  info(`Destination: ${resolved.toPath}`);
  if (parsed.merge) {
    info("Mode: merge (existing destination files were preserved).");
  } else if (parsed.overwrite) {
    info("Mode: overwrite (destination path was replaced).");
  } else {
    info("Mode: create (new destination path).");
  }
}

async function runPush(parsed) {
  if (!parsed.to) {
    throw new Error("Missing --to path for `kfc session push`.");
  }
  if (parsed.date) {
    throw new Error("`kfc session push` does not support --date. Use --id or auto-detect mode.");
  }

  const passphrase = requireSyncPassphrase();
  const source = await resolveSessionSourceForPush(parsed);
  const sourceBuffer = await fs.readFile(source.sourceFile);
  const sourceRelative = path.relative(parsed.from, source.sourceFile);
  const fromDate = parseDatePathFromRelative(sourceRelative);
  const datePath = fromDate?.datePath || datePathFromNow();
  const fileName = fromDate?.fileName || `${source.sessionId}.jsonl`;
  const metadata = {
    session_id: source.sessionId,
    date_path: datePath,
    file_name: fileName,
    bytes: sourceBuffer.byteLength,
    sha256: hashSha256(sourceBuffer)
  };

  const envelope = encryptSessionBuffer(sourceBuffer, metadata, passphrase);
  const artifactRelPath = joinPortable([datePath, `${source.sessionId}.kfcsess`]);
  const artifactPath = path.join(parsed.to, ...artifactRelPath.split("/"));

  const artifactExists = await pathExists(artifactPath);
  if (artifactExists && parsed.merge) {
    info(`Artifact already exists; keeping existing (merge mode): ${artifactPath}`);
    return;
  }

  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(envelope, null, 2) + "\n", "utf8");

  const index = await readSessionIndex(parsed.to);
  const nextIndex = upsertSessionIndexEntry(index, {
    session_id: source.sessionId,
    date_path: datePath,
    artifact_relpath: artifactRelPath,
    sha256: metadata.sha256,
    bytes: metadata.bytes,
    updated_at: new Date().toISOString()
  });
  await writeSessionIndex(parsed.to, nextIndex);

  info(`Pushed encrypted session: ${source.sessionId}`);
  info(`Selection: ${source.reason}`);
  info(`Artifact: ${artifactPath}`);
  info(`Index: ${resolveIndexPath(parsed.to)}`);
}

function selectIndexEntry(index, id = "") {
  const entries = Array.isArray(index?.entries) ? index.entries : [];
  if (!entries.length) {
    return null;
  }
  if (id) {
    return entries.find((item) => String(item?.session_id || "") === String(id)) || null;
  }
  const ordered = [...entries].sort(
    (a, b) => Date.parse(String(b?.updated_at || "")) - Date.parse(String(a?.updated_at || ""))
  );
  return ordered[0] || null;
}

async function runPull(parsed) {
  if (!parsed.fromProvided) {
    throw new Error("Missing --from path for `kfc session pull`.");
  }
  if (parsed.date) {
    throw new Error("`kfc session pull` does not support --date. Use --id or latest indexed session.");
  }

  const passphrase = requireSyncPassphrase();
  await assertDirectoryExists(parsed.from, "Transfer sessions root");
  const index = await readSessionIndex(parsed.from);
  const entry = selectIndexEntry(index, parsed.id);
  if (!entry) {
    if (parsed.id) {
      throw new Error(`Session id not found in transfer index: ${parsed.id}`);
    }
    throw new Error(`No session entries found in transfer index: ${resolveIndexPath(parsed.from)}`);
  }

  const artifactRelPath = normalizeRelativePath(entry.artifact_relpath || "");
  if (!artifactRelPath) {
    throw new Error("Invalid index entry: missing artifact_relpath.");
  }
  const artifactPath = path.join(parsed.from, ...artifactRelPath.split("/"));
  const artifactRaw = await fs.readFile(artifactPath, "utf8");
  let envelope;
  try {
    envelope = JSON.parse(artifactRaw);
  } catch {
    throw new Error(`Invalid encrypted artifact JSON: ${artifactPath}`);
  }

  const decrypted = decryptSessionEnvelope(envelope, passphrase);
  const metadata = decrypted.metadata || {};
  const sessionId = String(metadata.session_id || entry.session_id || parsed.id || "").trim();
  if (!sessionId) {
    throw new Error("Missing session id in artifact metadata.");
  }

  const datePath = normalizeRelativePath(metadata.date_path || entry.date_path || datePathFromNow());
  const fileName = String(metadata.file_name || `${sessionId}.jsonl`).trim();
  const destinationRoot = parsed.to || defaultSessionsRoot();
  const destinationPath = path.join(destinationRoot, ...datePath.split("/"), fileName);

  const destinationExists = await pathExists(destinationPath);
  if (destinationExists && parsed.merge) {
    info(`Destination already exists; keeping existing file (merge mode): ${destinationPath}`);
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const tmpPath = `${destinationPath}.tmp-${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, decrypted.plaintext);
    if (destinationExists) {
      await fs.rm(destinationPath, { force: true });
    }
    await fs.rename(tmpPath, destinationPath);
  } finally {
    if (await pathExists(tmpPath)) {
      await fs.rm(tmpPath, { force: true });
    }
  }

  info(`Pulled session: ${sessionId}`);
  info(`Artifact: ${artifactPath}`);
  info(`Destination: ${destinationPath}`);
}

export async function runSession(options) {
  let parsed;
  try {
    parsed = parseArgs(options.cwd, options.args);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    usage();
    return 1;
  }

  if (!parsed.subcommand || parsed.subcommand === "help") {
    usage();
    return 0;
  }

  if (parsed.subcommand === "where") {
    info(defaultSessionsRoot());
    return 0;
  }

  if (parsed.subcommand === "find") {
    try {
      await runFind(parsed);
      return 0;
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "copy") {
    try {
      await runCopy(parsed);
      return 0;
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "push") {
    try {
      await runPush(parsed);
      return 0;
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "pull") {
    try {
      await runPull(parsed);
      return 0;
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  error(`Unknown session subcommand: ${parsed.subcommand}`);
  usage();
  return 1;
}
