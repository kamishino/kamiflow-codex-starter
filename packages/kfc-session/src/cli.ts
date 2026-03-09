import {
  defaultSessionsRoot,
  exportSession,
  findSessionMatches,
  getSessionDetail,
  importSessions,
  resolvePath,
  restoreSession,
  summarizeSessionsRoot
} from "./session-store.js";
import { createKfcSessionServer } from "./server.js";

type ParsedArgs = {
  command: string;
  sessionsRoot: string;
  host: string;
  port: number;
  id: string;
  to: string;
  from: string;
};

function usage() {
  console.log(`KFC Session

Usage:
  kfc-session <command> [options]

Commands:
  serve    Start the local session-manager web app
  index    Print a summary of the current Codex sessions root
  where    Print the Codex sessions root used by KFC Session
  find     Find one or more sessions by id
  export   Copy one session to another path
  copy     Alias of export
  import   Import session files into the Codex sessions root
  restore  Confirm a session is present and ready for manual resume
  help     Show this usage

Options:
  --sessions-root <path>  Override the Codex sessions root (default: ~/.codex/sessions)
  --host <host>           Host for \`serve\` (default: 127.0.0.1)
  --port <n>              Port for \`serve\` (default: 4318)
  --id <session-id>       Session id for find/export/restore
  --to <path>             Destination for export/copy
  --from <path>           Source path for import
`);
}

function parseArgs(baseCwd: string, args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "",
    sessionsRoot: defaultSessionsRoot(),
    host: "127.0.0.1",
    port: 4318,
    id: "",
    to: "",
    from: ""
  };
  let rest = args;
  if (rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.command = rest[0];
    rest = rest.slice(1);
  }
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--sessions-root") {
      parsed.sessionsRoot = resolvePath(baseCwd, rest[i + 1], defaultSessionsRoot());
      i += 1;
      continue;
    }
    if (token === "--host") {
      parsed.host = String(rest[i + 1] || "").trim() || parsed.host;
      i += 1;
      continue;
    }
    if (token === "--port") {
      const value = Number(rest[i + 1] || "");
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        throw new Error("Invalid --port value. Use an integer between 1 and 65535.");
      }
      parsed.port = value;
      i += 1;
      continue;
    }
    if (token === "--id") {
      parsed.id = String(rest[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--to") {
      parsed.to = resolvePath(baseCwd, rest[i + 1], "");
      i += 1;
      continue;
    }
    if (token === "--from") {
      parsed.from = resolvePath(baseCwd, rest[i + 1], "");
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.command = "help";
      return parsed;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

async function runServe(parsed) {
  const server = await createKfcSessionServer({
    sessionsRoot: parsed.sessionsRoot,
    host: parsed.host,
    port: parsed.port
  });
  await server.ready();
  const listener = await server.listen();
  console.log(`KFC Session listening at ${listener.url}`);
  console.log(`Sessions root: ${server.sessionsRoot}`);
}

async function runIndex(parsed) {
  const summary = await summarizeSessionsRoot(parsed.sessionsRoot);
  console.log(`Sessions root: ${summary.sessions_root}`);
  console.log(`Total sessions: ${summary.total_sessions}`);
  console.log(`Latest session: ${summary.latest_session_id || "<none>"}`);
}

function runWhere(parsed: ParsedArgs) {
  console.log(parsed.sessionsRoot);
}

async function runFind(parsed) {
  if (!parsed.id) {
    throw new Error("Missing --id for `kfc-session find`.");
  }
  const matches = await findSessionMatches(parsed.sessionsRoot, parsed.id);
  if (matches.length === 0) {
    throw new Error(`No session file found for id: ${parsed.id}`);
  }
  matches.forEach((item) => console.log(item));
}

async function runExport(parsed) {
  if (!parsed.id || !parsed.to) {
    throw new Error("Missing --id or --to for `kfc-session export`.");
  }
  const result = await exportSession(parsed.sessionsRoot, parsed.id, parsed.to);
  console.log(`Exported ${result.session_id}`);
  console.log(`Source: ${result.source_path}`);
  console.log(`Destination: ${result.destination_path}`);
}

async function runImport(parsed) {
  if (!parsed.from) {
    throw new Error("Missing --from for `kfc-session import`.");
  }
  const result = await importSessions(parsed.sessionsRoot, parsed.from);
  console.log(`Imported ${result.length} session file(s) into ${parsed.sessionsRoot}`);
  result.forEach((item) => {
    console.log(`${item.session_id} -> ${item.destination_path}`);
  });
}

async function runRestore(parsed) {
  if (!parsed.id) {
    throw new Error("Missing --id for `kfc-session restore`.");
  }
  const result = await restoreSession(parsed.sessionsRoot, parsed.id);
  console.log(`Session ID: ${result.session_id}`);
  console.log(`Session Path: ${result.session_path}`);
  console.log(`Manual Resume: ${result.manual_resume_command}`);
  console.log(result.message);
}

export async function runCli(argv: string[]) {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.cwd(), argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    usage();
    return 1;
  }

  if (!parsed.command || parsed.command === "help") {
    usage();
    return 0;
  }

  try {
    if (parsed.command === "serve") {
      await runServe(parsed);
      return 0;
    }
    if (parsed.command === "index") {
      await runIndex(parsed);
      return 0;
    }
    if (parsed.command === "where") {
      runWhere(parsed);
      return 0;
    }
    if (parsed.command === "find") {
      await runFind(parsed);
      return 0;
    }
    if (parsed.command === "export" || parsed.command === "copy") {
      await runExport(parsed);
      return 0;
    }
    if (parsed.command === "import") {
      await runImport(parsed);
      return 0;
    }
    if (parsed.command === "restore") {
      await runRestore(parsed);
      return 0;
    }
    if (parsed.command === "detail") {
      if (!parsed.id) {
        throw new Error("Missing --id for `kfc-session detail`.");
      }
      const detail = await getSessionDetail(parsed.sessionsRoot, parsed.id);
      console.log(JSON.stringify(detail, null, 2));
      return 0;
    }
    console.error(`Unknown command: ${parsed.command}`);
    usage();
    return 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
