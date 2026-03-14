import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRemoteServer } from "../../lib/remote/remote-server.js";
import { ensureRemoteAuth, loadRemoteAuth, loadRemoteSession, remoteTokenPresent, revokeRemoteAuth } from "../../lib/remote/remote-state.js";
import { error, info, warn } from "../../lib/core/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const KFC_BIN = path.join(PACKAGE_ROOT, "bin", "kamiflow.js");
const DEFAULT_PORT = 4320;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DETACH_FILE = path.join(".kfc", "remote-detach.json");

function usage() {
  info("Usage: kfc remote <serve|stop|token> [options]");
  info("Examples:");
  info("  kfc remote serve --project . --host 127.0.0.1 --port 4320");
  info("  kfc remote serve --project . --token my-secret-token");
  info("  kfc remote serve --project . --detach --detach-file .kfc/remote-detach.json");
  info("  kfc remote stop --project .");
  info("  kfc remote token gen --project .");
  info("  kfc remote token show --project .");
  info("  kfc remote token revoke --project .");
}

function parseArgs(baseCwd, args) {
  const parsed = {
    subcommand: "",
    action: "",
    project: baseCwd,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    token: "",
    overwrite: false,
    detach: false,
    detachFile: path.resolve(baseCwd, DEFAULT_DETACH_FILE),
    pid: 0
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
    if (token === "--project") {
      const value = rest[i + 1];
      if (!value) {
        throw new Error("Missing value for --project.");
      }
      parsed.project = path.resolve(baseCwd, value);
      i += 1;
      continue;
    }
    if (token === "--host") {
      const value = String(rest[i + 1] || "").trim();
      if (!value) {
        throw new Error("Missing value for --host.");
      }
      parsed.host = value;
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
    if (token === "--token") {
      const value = String(rest[i + 1] || "").trim();
      if (!value) {
        throw new Error("Missing value for --token.");
      }
      parsed.token = value;
      i += 1;
      continue;
    }
    if (token === "--overwrite") {
      parsed.overwrite = true;
      continue;
    }
    if (token === "--detach") {
      parsed.detach = true;
      continue;
    }
    if (token === "--detach-file") {
      const value = String(rest[i + 1] || "").trim();
      if (!value) {
        throw new Error("Missing value for --detach-file.");
      }
      parsed.detachFile = path.resolve(baseCwd, value);
      i += 1;
      continue;
    }
    if (token === "--pid") {
      const value = Number(rest[i + 1] || "");
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Invalid --pid value.");
      }
      parsed.pid = value;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.subcommand = "help";
      return parsed;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

async function writeDetachFile(detachFile, payload) {
  await fsp.mkdir(path.dirname(detachFile), { recursive: true });
  await fsp.writeFile(detachFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function readDetachFile(detachFile) {
  const raw = await fsp.readFile(detachFile, "utf8");
  return JSON.parse(raw);
}

async function runServeDetached(options) {
  const auth = await ensureRemoteAuth(options.project, options.token, false);
  const logsDir = path.join(options.project, ".local", "remote");
  await fsp.mkdir(logsDir, { recursive: true });
  const stdoutPath = path.join(logsDir, "remote-serve.stdout.log");
  const stderrPath = path.join(logsDir, "remote-serve.stderr.log");
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const stderrFd = fs.openSync(stderrPath, "a");
  const childArgs = [
    KFC_BIN,
    "remote",
    "serve",
    "--project",
    options.project,
    "--host",
    options.host,
    "--port",
    String(options.port)
  ];
  if (auth.token) {
    childArgs.push("--token", auth.token);
  }
  function spawnDetachedChild() {
    const child = spawn(process.execPath, childArgs, {
      cwd: options.project,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdoutFd, stderrFd]
    });
    child.unref();
    return child;
  }

  try {
    const child = spawnDetachedChild();
    const payload = {
      pid: child.pid || 0,
      project: options.project,
      host: options.host,
      port: options.port,
      url: `http://${options.host}:${options.port}`,
      token: auth.token,
      started_at: new Date().toISOString(),
      stdout_log: stdoutPath,
      stderr_log: stderrPath
    };

    if (process.platform !== "win32") {
      const deadline = Date.now() + 15000;
      let healthy = false;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          break;
        }
        try {
          const response = await fetch(`${payload.url}/api/remote/health`);
          if (response.ok) {
            healthy = true;
            break;
          }
        } catch {
          // Keep polling until the deadline or child exit.
        }
        await sleep(250);
      }

      if (!healthy) {
        const stdout = fs.existsSync(stdoutPath) ? await fsp.readFile(stdoutPath, "utf8") : "";
        const stderr = fs.existsSync(stderrPath) ? await fsp.readFile(stderrPath, "utf8") : "";
        error(`Remote server failed to start in detached mode. stdout: ${stdout.trim() || "<empty>"} stderr: ${stderr.trim() || "<empty>"}`);
        return 1;
      }
    }

    const remoteSession = await loadRemoteSession(options.project);
    if (
      Number.isInteger(remoteSession?.server_pid) &&
      remoteSession.server_pid > 0 &&
      Number(remoteSession.port || 0) === Number(options.port) &&
      String(remoteSession.host || "") === String(options.host || "")
    ) {
      payload.pid = remoteSession.server_pid;
    }

    await writeDetachFile(options.detachFile, payload);
    info(`Remote server detached: pid=${child.pid}`);
    info(`URL: ${payload.url}`);
    info(`Token: ${payload.token}`);
    info(`Detach file: ${options.detachFile}`);
    return 0;
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

async function runServeAttached(options) {
  const server = await createRemoteServer({
    projectDir: options.project,
    host: options.host,
    port: options.port,
    token: options.token || ""
  });
  const listener = await server.listen();
  info(`Remote server listening at ${listener.url}`);
  info(`Token: ${listener.token}`);
  info("Scope: mobile web UI + authenticated APIs + serialized prompt queue");
  return await new Promise((resolve) => {
    const close = async () => {
      try {
        await server.fastify.close();
      } finally {
        resolve(0);
      }
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

async function runStop(options) {
  let pid = options.pid;
  if (!pid) {
    try {
      const payload = await readDetachFile(options.detachFile);
      pid = Number(payload.pid || 0);
    } catch (err) {
      error(`Cannot read detach file: ${options.detachFile}`);
      return 1;
    }
  }
  if (!pid) {
    error("No remote server pid available.");
    return 1;
  }
  try {
    process.kill(pid);
  } catch (err) {
    error(`Failed to stop pid ${pid}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  info(`Stopped remote server pid ${pid}.`);
  return 0;
}

async function runToken(options) {
  const action = String(options.action || "").toLowerCase();
  if (!action || action === "help") {
    usage();
    return 0;
  }
  if (action === "gen") {
    const payload = await ensureRemoteAuth(options.project, options.token, options.overwrite);
    info(`Remote token ${payload.created ? "generated" : "reused"}: ${payload.authPath}`);
    info(`Token: ${payload.token}`);
    return 0;
  }
  if (action === "show") {
    const payload = await loadRemoteAuth(options.project);
    if (!payload?.token) {
      error("Remote token is not configured. Run `kfc remote token gen --project .`.");
      return 1;
    }
    info(`Token: ${payload.token}`);
    return 0;
  }
  if (action === "revoke") {
    const removed = await revokeRemoteAuth(options.project);
    if (!removed) {
      warn("Remote token was not configured.");
      return 0;
    }
    info("Remote token revoked.");
    return 0;
  }
  error(`Unknown token action: ${options.action}`);
  usage();
  return 1;
}

export async function runRemote({ cwd, args }) {
  const options = parseArgs(cwd, args);
  if (!options.subcommand || options.subcommand === "help") {
    usage();
    return 0;
  }

  if (!fs.existsSync(options.project)) {
    error(`Project directory does not exist: ${options.project}`);
    return 1;
  }

  if (options.subcommand === "serve") {
    return options.detach ? await runServeDetached(options) : await runServeAttached(options);
  }

  if (options.subcommand === "stop") {
    return await runStop(options);
  }

  if (options.subcommand === "token") {
    return await runToken(options);
  }

  if (options.subcommand === "where") {
    info(`Remote token configured: ${remoteTokenPresent(options.project) ? "yes" : "no"}`);
    info(`Default detach file: ${options.detachFile}`);
    return 0;
  }

  error(`Unknown remote subcommand: ${options.subcommand}`);
  usage();
  return 1;
}


