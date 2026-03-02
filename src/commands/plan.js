import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { error, info } from "../lib/logger.js";
import { createLocalPlanTemplate } from "../lib/plan-bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const REPO_KFP_BIN = path.join(REPO_ROOT, "packages", "kamiflow-plan-ui", "bin", "kfp.js");

function parseProjectDir(defaultCwd, args) {
  const idx = args.indexOf("--project");
  if (idx === -1) {
    return defaultCwd;
  }
  const value = args[idx + 1];
  if (!value) {
    throw new Error("Missing value for --project.");
  }
  return path.resolve(value);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveKfpRunner(projectDir) {
  if (path.resolve(projectDir) === REPO_ROOT && (await pathExists(REPO_KFP_BIN))) {
    return {
      command: process.execPath,
      args: [REPO_KFP_BIN]
    };
  }

  const localKfpBin = path.join(
    projectDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kfp.cmd" : "kfp"
  );
  if (await pathExists(localKfpBin)) {
    return {
      command: localKfpBin,
      args: []
    };
  }

  if (await pathExists(REPO_KFP_BIN)) {
    return {
      command: process.execPath,
      args: [REPO_KFP_BIN]
    };
  }

  throw new Error(
    "Cannot find `kfp` for this project. Install it with `npm i -D @kamishino/kamiflow-plan-ui`."
  );
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runPlan(options) {
  const [subcommand, ...rest] = options.args;

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    info("Usage: kfc plan <init|serve|validate|workspace> [kfp options]");
    info("Examples:");
    info("  kfc plan init");
    info("  kfc plan serve --port 4310");
    info("  kfc plan validate --project <path>");
    return 0;
  }

  if (!["init", "serve", "validate", "workspace"].includes(subcommand)) {
    error(`Unknown plan subcommand: ${subcommand}`);
    info("Supported: init, serve, validate, workspace");
    return 1;
  }

  const projectDir = subcommand === "workspace" ? options.cwd : parseProjectDir(options.cwd, rest);
  const hasProject = rest.includes("--project");
  const forwarded =
    subcommand === "workspace" || hasProject
      ? [subcommand, ...rest]
      : [subcommand, ...rest, "--project", projectDir];

  let runner;
  try {
    runner = await resolveKfpRunner(projectDir);
  } catch (err) {
    if (subcommand === "init") {
      await createLocalPlanTemplate(projectDir, {
        forceNew: rest.includes("--new"),
        log: info
      });
      return 0;
    }
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const exitCode = await runProcess(runner.command, [...runner.args, ...forwarded], options.cwd);
  if (subcommand === "init" && exitCode !== 0) {
    await createLocalPlanTemplate(projectDir, {
      forceNew: rest.includes("--new"),
      log: info
    });
    return 0;
  }
  return exitCode;
}
