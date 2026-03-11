import path from "node:path";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";
import { defaultSessionsRoot } from "./lib/chat-state.js";
import { runBind } from "./commands/bind.js";
import { runCopy } from "./commands/copy.js";
import { runReveal } from "./commands/reveal.js";
import { runServe } from "./commands/serve.js";
import { runShow } from "./commands/show.js";
import { runUnbind } from "./commands/unbind.js";

function printUsage() {
  console.log(`KFC Chat

Usage:
  kfc-chat <command> [options]

Commands:
  serve       Start the local bound-session chat web app
  bind        Bind a Codex session to the project
  bind show   Show the current bound Codex session
  show        Show the current bound Codex session
  copy        Copy a bound session field to the clipboard
  reveal      Reveal the bound session file or folder
  unbind      Remove the current Codex session binding
  help        Show this usage

Options:
  --project <path>        Project root (default: nearest project root)
  --host <host>           Host for serve (default: 127.0.0.1)
  --port <n>              Port for serve (default: 4322)
  --token <text>          Token for browser/API access
  --session-id <id>       Codex session id for bind
  --sessions-root <path>  Override ~/.codex/sessions
  --field <name>          Copy field: resume|session-id|session-path
  --target <name>         Reveal target: file|folder
`);
}

export function resolvePath(baseCwd: string, rawPath: string | undefined, fallback = "") {
  const value = String(rawPath || fallback || "").trim();
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseCwd, value);
}

export function parseArgs(baseCwd: string, args: string[]) {
  const parsed: any = {
    command: "",
    action: "",
    project: "",
    host: "127.0.0.1",
    port: 4322,
    token: "",
    sessionId: "",
    sessionsRoot: defaultSessionsRoot(),
    field: "resume",
    target: "file"
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
    if (token === "--field") {
      parsed.field = String(rest[index + 1] || "").trim() || parsed.field;
      index += 1;
      continue;
    }
    if (token === "--target") {
      parsed.target = String(rest[index + 1] || "").trim() || parsed.target;
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

export async function runCli(argv: string[], deps: Record<string, any> = {}) {
  let parsed: any;
  try {
    parsed = parseArgs(process.cwd(), argv);
    if (!String(parsed.project || "").trim()) {
      parsed.project = await detectProjectRoot(process.cwd());
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    return 1;
  }

  if (!parsed.command || parsed.command === "help") {
    printUsage();
    return 0;
  }

  try {
    if (parsed.command === "serve") return await runServe(parsed);
    if (parsed.command === "bind") return await runBind(parsed);
    if (parsed.command === "show") return await runShow(parsed);
    if (parsed.command === "copy") return await runCopy(parsed, deps);
    if (parsed.command === "reveal") return await runReveal(parsed, deps);
    if (parsed.command === "unbind") return await runUnbind(parsed);
    console.error(`Unknown command: ${parsed.command}`);
    printUsage();
    return 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
