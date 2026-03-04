import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { error, info } from "../lib/logger.js";

function usage() {
  info("Usage: kfc session <where|find|copy> [options]");
  info("Examples:");
  info("  kfc session where");
  info("  kfc session find --id 019caccc-f25d-7151-ad1d-6eab893d714d");
  info("  kfc session copy --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions");
  info("  kfc session copy --to E:/transfer/codex-sessions");
  info("  kfc session copy --from E:/transfer/codex-sessions --to ~/.codex/sessions --merge");
  info("  kfc session copy --to E:/transfer/codex-sessions --date 2026-03-04");
  info("Options:");
  info("  --from <path>      Source sessions root (default: ~/.codex/sessions)");
  info("  --to <path>        Target sessions root (required for copy)");
  info("  --id <session-id>  Find or copy one session file by session id");
  info("  --date <YYYY-MM-DD|YYYY/MM/DD>  Copy only one session day folder");
  info("  --overwrite        Replace destination path if it already exists");
  info("  --merge            Copy missing files into existing destination without overwrite");
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
    merge: false
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
      i += 1;
      continue;
    }
    if (token === "--to") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --to.");
      }
      parsed.to = value;
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

function parseDatePathFromRelative(relativePath) {
  const segments = String(relativePath || "").split(path.sep).filter(Boolean);
  if (segments.length < 4) {
    return null;
  }
  const year = segments[0];
  const month = segments[1];
  const day = segments[2];
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }
  return { year, month, day, fileName: segments[segments.length - 1] };
}

async function findSessionMatches(fromRoot, id) {
  if (!id || String(id).trim().length < 8) {
    throw new Error("Invalid --id. Provide the full session id.");
  }
  await assertDirectoryExists(fromRoot, "Source sessions root");
  const needle = String(id).trim().toLowerCase();
  const files = await walkFiles(fromRoot);
  const matches = files.filter((item) => path.basename(item).toLowerCase().includes(needle));
  matches.sort((a, b) => a.localeCompare(b));
  return matches;
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
    ? path.join(parsed.to, parsedDate.year, parsedDate.month, parsedDate.day, parsedDate.fileName)
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

  error(`Unknown session subcommand: ${parsed.subcommand}`);
  usage();
  return 1;
}
