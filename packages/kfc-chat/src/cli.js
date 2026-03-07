import path from "node:path";
import {
  bindCodexSession,
  buildInteractiveResumeCommand,
  defaultSessionsRoot,
  resolveBoundSession,
  unbindCodexSession
} from "./chat-state.js";
import { createKfcChatServer } from "./server.js";

function usage() {
  console.log(`KFC Chat

Usage:
  kfc-chat <command> [options]

Commands:
  serve       Start the local bound-session chat web app
  bind        Bind a Codex session to the project
  bind show   Show the current bound Codex session
  unbind      Remove the current Codex session binding
  help        Show this usage

Options:
  --project <path>        Project root (default: current directory)
  --host <host>           Host for serve (default: 127.0.0.1)
  --port <n>              Port for serve (default: 4322)
  --token <text>          Token for browser/API access
  --session-id <id>       Codex session id for bind
  --sessions-root <path>  Override ~/.codex/sessions
`);
}

function resolvePath(baseCwd, rawPath, fallback = "") {
  const value = String(rawPath || fallback || "").trim();
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseCwd, value);
}

function parseArgs(baseCwd, args) {
  const parsed = {
    command: "",
    action: "",
    project: baseCwd,
    host: "127.0.0.1",
    port: 4322,
    token: "",
    sessionId: "",
    sessionsRoot: defaultSessionsRoot()
  };
  let rest = args;
  if (rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.command = rest[0];
    rest = rest.slice(1);
  }
  if (parsed.command === "bind" && rest.length > 0 && !String(rest[0]).startsWith("-")) {
    parsed.action = rest[0];
    rest = rest.slice(1);
  }
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--project") {
      parsed.project = resolvePath(baseCwd, rest[index + 1], baseCwd);
      index += 1;
      continue;
    }
    if (token === "--host") {
      parsed.host = String(rest[index + 1] || "").trim() || parsed.host;
      index += 1;
      continue;
    }
    if (token === "--port") {
      const value = Number(rest[index + 1] || "");
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        throw new Error("Invalid --port value. Use an integer between 1 and 65535.");
      }
      parsed.port = value;
      index += 1;
      continue;
    }
    if (token === "--token") {
      parsed.token = String(rest[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--session-id") {
      parsed.sessionId = String(rest[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--sessions-root") {
      parsed.sessionsRoot = resolvePath(baseCwd, rest[index + 1], parsed.sessionsRoot);
      index += 1;
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
  const server = await createKfcChatServer({
    projectDir: parsed.project,
    host: parsed.host,
    port: parsed.port,
    token: parsed.token,
    sessionsRoot: parsed.sessionsRoot
  });
  await server.ready();
  const listener = await server.listen();
  console.log(`KFC Chat listening at ${listener.url}`);
  console.log(`Project: ${parsed.project}`);
  console.log(`Token: ${listener.token}`);
  console.log(`Browser: ${listener.url}/?token=${encodeURIComponent(listener.token)}`);
}

async function runBind(parsed) {
  if (parsed.action === "show") {
    const binding = await resolveBoundSession(parsed.project, parsed.sessionsRoot);
    if (!binding.bound) {
      console.log(binding.reason);
      return 1;
    }
    console.log(`Plan ID: ${binding.plan_id}`);
    console.log(`Session ID: ${binding.session_id}`);
    console.log(`Session Path: ${binding.session_path}`);
    console.log(`Manual Resume: ${buildInteractiveResumeCommand(binding.session_id)}`);
    return 0;
  }
  if (!parsed.sessionId) {
    throw new Error("Missing --session-id for `kfc-chat bind`.");
  }
  const result = await bindCodexSession(parsed.project, parsed.sessionId, parsed.sessionsRoot);
  console.log(`Bound Session: ${result.session_id}`);
  console.log(`Session Path: ${result.session_path}`);
  console.log(`Client Session File: ${result.client_session_path}`);
  console.log(`Manual Resume: ${result.manual_resume_command}`);
  return 0;
}

async function runUnbind(parsed) {
  const removed = await unbindCodexSession(parsed.project);
  console.log(removed ? "Codex session binding removed." : "No client session file found.");
  return 0;
}

export async function runCli(argv) {
  let parsed;
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
    if (parsed.command === "bind") {
      return await runBind(parsed);
    }
    if (parsed.command === "unbind") {
      return await runUnbind(parsed);
    }
    console.error(`Unknown command: ${parsed.command}`);
    usage();
    return 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
