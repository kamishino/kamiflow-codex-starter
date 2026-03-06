import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { error, info } from "../lib/logger.js";

const INDEX_FILE_NAME = "kfc-session-index.json";
const ENVELOPE_FORMAT = "kfc-session-age-envelope-v1";
const LEGACY_ENVELOPE_FORMAT = "kfc-session-envelope-v1";
const TRUST_FILE_NAME = "trusted-recipients.json";
const DEFAULT_SESSION_KEY_DIR = path.join(os.homedir(), ".kfc", "session");
const DEFAULT_SESSION_KEY_PATH = path.join(DEFAULT_SESSION_KEY_DIR, "age.key");

function usage() {
  info("Usage: kfc session <where|find|copy|push|pull|key|trust> [options]");
  info("Examples:");
  info("  kfc session where");
  info("  kfc session find --id 019caccc-f25d-7151-ad1d-6eab893d714d");
  info("  kfc session key gen --name workstation");
  info("  kfc session key show");
  info("  kfc session trust list");
  info("  kfc session trust add --name laptop --pubkey age1...");
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
  info("  --key <path>       Override local age private key path");
  info("  --name <text>      Device display name for key/trust operations");
  info("  --pubkey <age1...> Recipient public key for trust add/remove or push");
  info("  --overwrite        Replace destination path if it already exists");
  info("  --merge            Keep existing destination file/path when present");
  info("Security: push/pull uses age recipient encryption (no passphrase mode).");
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
    action: "",
    from: defaultSessionsRoot(),
    to: "",
    id: "",
    date: "",
    key: DEFAULT_SESSION_KEY_PATH,
    name: "",
    pubkey: "",
    recipients: [],
    overwrite: false,
    merge: false,
    fromProvided: false,
    toProvided: false,
    keyProvided: false
  };

  let rest = args;
  if (rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.subcommand = rest[0];
    rest = rest.slice(1);
  }
  if (rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.action = rest[0];
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
    if (token === "--key") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --key.");
      }
      parsed.key = value;
      parsed.keyProvided = true;
      i += 1;
      continue;
    }
    if (token === "--name") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --name.");
      }
      parsed.name = String(value).trim();
      i += 1;
      continue;
    }
    if (token === "--pubkey" || token === "--recipient") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${token}.`);
      }
      const parsedValues = String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!parsedValues.length) {
        throw new Error(`Invalid value for ${token}.`);
      }
      parsed.recipients.push(...parsedValues);
      parsed.pubkey = parsedValues[0];
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
  parsed.key = resolvePath(baseCwd, parsed.key);
  parsed.recipients = Array.from(new Set(parsed.recipients.map((item) => String(item).trim()).filter(Boolean)));
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

function resolveTrustStorePath(parsed) {
  return path.join(path.dirname(parsed.key || DEFAULT_SESSION_KEY_PATH), TRUST_FILE_NAME);
}

function normalizeRecipient(value) {
  return String(value || "").trim();
}

function assertAgeRecipient(value, label = "recipient") {
  const recipient = normalizeRecipient(value);
  if (!/^age1[0-9a-z]+$/.test(recipient)) {
    throw new Error(`Invalid ${label}. Expected an age recipient key (age1...).`);
  }
  return recipient;
}

async function runProcessCapture(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd || process.cwd()
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to start \`${command}\`: ${err instanceof Error ? err.message : String(err)}`));
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    if (options.input !== undefined && options.input !== null) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

async function ensureAgeTool(command, checkArgs = ["--version"]) {
  try {
    const result = await runProcessCapture(command, checkArgs);
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || "<empty>").trim();
      throw new Error(`\`${command}\` returned non-zero exit code. ${detail}`);
    }
  } catch (err) {
    throw new Error(
      `${command} is required for session encryption. Install age tools and ensure \`${command}\` is available in PATH. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

function extractPublicKey(rawText) {
  const match = String(rawText || "").match(/age1[0-9a-z]+/);
  return match ? match[0] : "";
}

async function getPublicKeyFromPrivateKey(keyPath) {
  const result = await runProcessCapture("age-keygen", ["-y", keyPath]);
  if (result.code !== 0) {
    throw new Error(`Cannot derive public key from private key: ${(result.stderr || result.stdout || "<empty>").trim()}`);
  }
  const pubkey = extractPublicKey(result.stdout || result.stderr);
  if (!pubkey) {
    throw new Error("age-keygen did not return a valid public key.");
  }
  return assertAgeRecipient(pubkey, "public key");
}

async function readTrustedRecipients(parsed) {
  const trustPath = resolveTrustStorePath(parsed);
  if (!(await pathExists(trustPath))) {
    return {
      path: trustPath,
      data: {
        version: 1,
        updated_at: null,
        devices: []
      }
    };
  }
  let parsedJson;
  try {
    parsedJson = JSON.parse(await fs.readFile(trustPath, "utf8"));
  } catch {
    throw new Error(`Invalid trusted recipients file: ${trustPath}`);
  }
  const devices = Array.isArray(parsedJson?.devices) ? parsedJson.devices : [];
  return {
    path: trustPath,
    data: {
      version: Number(parsedJson?.version || 1),
      updated_at: parsedJson?.updated_at || null,
      devices
    }
  };
}

async function writeTrustedRecipients(trustPath, trustData) {
  await fs.mkdir(path.dirname(trustPath), { recursive: true });
  await fs.writeFile(
    trustPath,
    JSON.stringify(
      {
        version: 1,
        updated_at: new Date().toISOString(),
        devices: Array.isArray(trustData?.devices) ? trustData.devices : []
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function upsertTrustedRecipient(devices, recipient, name) {
  const safeRecipient = assertAgeRecipient(recipient, "recipient");
  const safeName = String(name || "").trim() || "device";
  const next = Array.isArray(devices) ? [...devices] : [];
  const filtered = next.filter((item) => normalizeRecipient(item?.recipient) !== safeRecipient);
  filtered.push({
    recipient: safeRecipient,
    name: safeName,
    added_at: new Date().toISOString()
  });
  filtered.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return filtered;
}

function removeTrustedRecipient(devices, recipient = "", name = "") {
  const safeRecipient = normalizeRecipient(recipient);
  const safeName = String(name || "").trim().toLowerCase();
  const current = Array.isArray(devices) ? devices : [];
  if (!safeRecipient && !safeName) {
    throw new Error("Missing selector for trust remove. Provide --pubkey or --name.");
  }
  return current.filter((item) => {
    const recipientMatches = safeRecipient && normalizeRecipient(item?.recipient) === safeRecipient;
    const nameMatches = safeName && String(item?.name || "").trim().toLowerCase() === safeName;
    return !(recipientMatches || nameMatches);
  });
}

async function resolvePushRecipients(parsed) {
  if (parsed.recipients.length) {
    return parsed.recipients.map((item, index) => assertAgeRecipient(item, `recipient #${index + 1}`));
  }

  const trusted = await readTrustedRecipients(parsed);
  const recipients = trusted.data.devices
    .map((item) => normalizeRecipient(item?.recipient))
    .filter(Boolean)
    .map((item, index) => assertAgeRecipient(item, `trusted recipient #${index + 1}`));

  if (!recipients.length) {
    throw new Error(
      `No trusted recipients found at ${trusted.path}. Run \`kfc session key gen --name <device>\` and \`kfc session trust add --name <device> --pubkey <age1...>\` first.`
    );
  }
  return Array.from(new Set(recipients));
}

async function encryptSessionBuffer(plaintextBuffer, metadata, recipients) {
  await ensureAgeTool("age");
  const args = ["--encrypt", "--armor"];
  for (const recipient of recipients) {
    args.push("-r", recipient);
  }
  const result = await runProcessCapture("age", args, { input: plaintextBuffer });
  if (result.code !== 0) {
    throw new Error(`Session encryption failed: ${(result.stderr || result.stdout || "<empty>").trim()}`);
  }

  return {
    format: ENVELOPE_FORMAT,
    created_at: new Date().toISOString(),
    cipher: {
      name: "age",
      armor: true,
      recipient_count: recipients.length
    },
    metadata,
    payload: result.stdout
  };
}

async function decryptSessionEnvelope(envelope, parsed) {
  if (!envelope || !envelope.format) {
    throw new Error("Invalid session envelope format.");
  }
  if (envelope.format === LEGACY_ENVELOPE_FORMAT) {
    throw new Error(
      "Legacy passphrase artifacts are no longer supported. Re-export the session using current `kfc session push`."
    );
  }
  if (envelope.format !== ENVELOPE_FORMAT) {
    throw new Error(`Unsupported session envelope format: ${String(envelope.format)}`);
  }

  const payload = String(envelope?.payload || "");
  if (!payload.trim()) {
    throw new Error("Corrupt session envelope payload.");
  }

  await ensureAgeTool("age");
  const keyPath = parsed.key || DEFAULT_SESSION_KEY_PATH;
  if (!(await pathExists(keyPath))) {
    throw new Error(`Missing age private key: ${keyPath}. Run \`kfc session key gen --name <device>\` first.`);
  }

  const result = await runProcessCapture("age", ["--decrypt", "-i", keyPath], { input: payload });
  if (result.code !== 0) {
    throw new Error(`Session decryption failed: ${(result.stderr || result.stdout || "<empty>").trim()}`);
  }
  const plaintext = Buffer.from(result.stdout, "utf8");

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

  const recipients = await resolvePushRecipients(parsed);
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

  const envelope = await encryptSessionBuffer(sourceBuffer, metadata, recipients);
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
    envelope_format: ENVELOPE_FORMAT,
    recipient_count: recipients.length,
    sha256: metadata.sha256,
    bytes: metadata.bytes,
    updated_at: new Date().toISOString()
  });
  await writeSessionIndex(parsed.to, nextIndex);

  info(`Pushed encrypted session: ${source.sessionId}`);
  info(`Selection: ${source.reason}`);
  info(`Recipients: ${recipients.length}`);
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

  const decrypted = await decryptSessionEnvelope(envelope, parsed);
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

async function runKeyGen(parsed) {
  await ensureAgeTool("age-keygen", ["--help"]);
  const keyPath = parsed.key || DEFAULT_SESSION_KEY_PATH;
  const keyExists = await pathExists(keyPath);
  if (keyExists && !parsed.overwrite) {
    throw new Error(`Key already exists: ${keyPath}. Use --overwrite to replace it.`);
  }

  await fs.mkdir(path.dirname(keyPath), { recursive: true });
  const result = await runProcessCapture("age-keygen", ["-o", keyPath]);
  if (result.code !== 0) {
    throw new Error(`age-keygen failed: ${(result.stderr || result.stdout || "<empty>").trim()}`);
  }

  let publicKey = extractPublicKey(`${result.stdout}\n${result.stderr}`);
  if (!publicKey) {
    publicKey = await getPublicKeyFromPrivateKey(keyPath);
  }
  publicKey = assertAgeRecipient(publicKey, "generated public key");

  const deviceName = String(parsed.name || os.hostname() || "current-device").trim();
  const trust = await readTrustedRecipients(parsed);
  trust.data.devices = upsertTrustedRecipient(trust.data.devices, publicKey, deviceName);
  await writeTrustedRecipients(trust.path, trust.data);

  info(`Generated age key: ${keyPath}`);
  info(`Public key: ${publicKey}`);
  info(`Trusted recipients updated: ${trust.path}`);
}

async function runKeyShow(parsed) {
  await ensureAgeTool("age-keygen", ["--help"]);
  const keyPath = parsed.key || DEFAULT_SESSION_KEY_PATH;
  if (!(await pathExists(keyPath))) {
    throw new Error(`Missing key file: ${keyPath}. Run \`kfc session key gen --name <device>\`.`);
  }
  const publicKey = await getPublicKeyFromPrivateKey(keyPath);
  const trust = await readTrustedRecipients(parsed);
  const trusted = trust.data.devices.some((item) => normalizeRecipient(item?.recipient) === publicKey);

  info(`Key: ${keyPath}`);
  info(`Public key: ${publicKey}`);
  info(`Trust store: ${trust.path}`);
  info(`Trusted locally: ${trusted ? "yes" : "no"}`);
}

function runKeyWhere(parsed) {
  info(`Key: ${parsed.key || DEFAULT_SESSION_KEY_PATH}`);
  info(`Trust store: ${resolveTrustStorePath(parsed)}`);
}

async function runKey(parsed) {
  const action = String(parsed.action || "show").trim().toLowerCase();
  if (["gen", "generate"].includes(action)) {
    await runKeyGen(parsed);
    return;
  }
  if (["show", "public"].includes(action)) {
    await runKeyShow(parsed);
    return;
  }
  if (["where", "path"].includes(action)) {
    runKeyWhere(parsed);
    return;
  }
  throw new Error(`Unknown key action: ${action}. Use gen|show|where.`);
}

async function runTrustList(parsed) {
  const trust = await readTrustedRecipients(parsed);
  info(`Trust store: ${trust.path}`);
  if (!trust.data.devices.length) {
    info("No trusted recipients configured.");
    return;
  }
  trust.data.devices.forEach((item, index) => {
    info(`${index + 1}. ${String(item?.name || "device")} -> ${String(item?.recipient || "")}`);
  });
}

async function runTrustAdd(parsed) {
  const recipient = parsed.pubkey || parsed.recipients[0];
  if (!recipient) {
    throw new Error("Missing --pubkey for `kfc session trust add`.");
  }
  const safeRecipient = assertAgeRecipient(recipient, "pubkey");
  const name = String(parsed.name || "trusted-device").trim();
  const trust = await readTrustedRecipients(parsed);
  trust.data.devices = upsertTrustedRecipient(trust.data.devices, safeRecipient, name);
  await writeTrustedRecipients(trust.path, trust.data);
  info(`Trusted recipient saved: ${name} -> ${safeRecipient}`);
  info(`Trust store: ${trust.path}`);
}

async function runTrustRemove(parsed) {
  const trust = await readTrustedRecipients(parsed);
  const before = trust.data.devices.length;
  trust.data.devices = removeTrustedRecipient(trust.data.devices, parsed.pubkey || parsed.recipients[0], parsed.name);
  const removed = before - trust.data.devices.length;
  if (removed <= 0) {
    throw new Error("No trusted recipient matched. Provide an existing --pubkey or --name.");
  }
  await writeTrustedRecipients(trust.path, trust.data);
  info(`Removed trusted recipient(s): ${removed}`);
  info(`Trust store: ${trust.path}`);
}

async function runTrust(parsed) {
  const action = String(parsed.action || "list").trim().toLowerCase();
  if (action === "list") {
    await runTrustList(parsed);
    return;
  }
  if (action === "add") {
    await runTrustAdd(parsed);
    return;
  }
  if (["remove", "rm", "delete"].includes(action)) {
    await runTrustRemove(parsed);
    return;
  }
  if (["where", "path"].includes(action)) {
    info(resolveTrustStorePath(parsed));
    return;
  }
  throw new Error(`Unknown trust action: ${action}. Use list|add|remove|where.`);
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

  if (parsed.subcommand === "key") {
    try {
      await runKey(parsed);
      return 0;
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (parsed.subcommand === "trust") {
    try {
      await runTrust(parsed);
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
