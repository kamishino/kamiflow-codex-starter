import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";
import { createKfcWebServer } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");

type ParsedArgs = {
  command: string;
  project: string;
  host: string;
  port: number;
  portStrategy: "fail" | "next";
  portScanLimit: number;
  focus: string;
  vitePort: number;
};

function usage() {
  console.log(`KFC Web

Usage:
  kfc-web <serve|dev> [options]

Options:
  --project <path>     Project root (default: nearest project root)
  --host <host>        Host for shell server (default: 127.0.0.1)
  --port <n>           Port for shell server (default: 4300)
  --port-strategy <s>  Port conflict strategy: fail|next (default: next)
  --port-scan-limit <n> Maximum auto-scan attempts when conflict strategy is next (default: 20)
  --focus <surface>    plan | session | chat
  --vite-port <n>      Vite dev asset port (default: 5174)
`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: argv[0] || "",
    project: "",
    host: "127.0.0.1",
    port: 4300,
    portStrategy: "next",
    portScanLimit: 20,
    focus: "",
    vitePort: 5174
  };
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--project") {
      if (!next || next.startsWith("--")) throw new Error("Missing value for --project.");
      parsed.project = path.resolve(next);
      i += 1;
      continue;
    }
    if (token === "--host") {
      parsed.host = String(next || "").trim() || parsed.host;
      i += 1;
      continue;
    }
    if (token === "--port") {
      const value = Number(next || "");
      if (!Number.isInteger(value) || value <= 0 || value > 65535) throw new Error("Invalid --port value.");
      parsed.port = value;
      i += 1;
      continue;
    }
    if (token === "--port-strategy") {
      const value = String(next || "").toLowerCase();
      if (value !== "fail" && value !== "next") {
        throw new Error("Invalid --port-strategy value. Use 'fail' or 'next'.");
      }
      parsed.portStrategy = value;
      i += 1;
      continue;
    }
    if (token === "--port-scan-limit") {
      const value = Number(next || "");
      if (!Number.isInteger(value) || value <= 0 || value > 1000) {
        throw new Error("Invalid --port-scan-limit value.");
      }
      parsed.portScanLimit = value;
      i += 1;
      continue;
    }
    if (token === "--vite-port") {
      const value = Number(next || "");
      if (!Number.isInteger(value) || value <= 0 || value > 65535) throw new Error("Invalid --vite-port value.");
      parsed.vitePort = value;
      i += 1;
      continue;
    }
    if (token === "--focus") {
      parsed.focus = String(next || "").trim().toLowerCase();
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

export async function resolveProjectDir(project: string, cwd = process.cwd()): Promise<string> {
  const normalized = String(project || "").trim();
  if (normalized) {
    return normalized;
  }
  return await detectProjectRoot(cwd);
}

export async function runCli(argv: string[]) {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
    parsed.project = await resolveProjectDir(parsed.project, process.cwd());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    usage();
    return 1;
  }

  if (!parsed.command || parsed.command === "help") {
    usage();
    return 0;
  }
  if (parsed.command !== "serve" && parsed.command !== "dev") {
    console.error(`Unknown command: ${parsed.command}`);
    usage();
    return 1;
  }

  const server = await createKfcWebServer({
    mode: parsed.command,
    projectDir: parsed.project,
    host: parsed.host,
    port: parsed.port,
    portStrategy: parsed.portStrategy,
    portScanLimit: parsed.portScanLimit,
    focus: parsed.focus,
    vitePort: parsed.vitePort,
    packageDir
  });
  await server.ready();
  const listener = await server.listen();
  console.log(`KFC Web listening at ${listener.url}`);
  console.log(`Project: ${parsed.project}`);
  console.log(`Plan: ${listener.urls.plan}`);
  console.log(`Session: ${listener.urls.session}`);
  console.log(`Chat: ${listener.urls.chat}`);
  return 0;
}
