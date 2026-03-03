import path from "node:path";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runWorkflow } from "./commands/run.js";
import { runPlan } from "./commands/plan.js";
import { runFlow } from "./commands/flow.js";
import { runClient } from "./commands/client.js";
import { error } from "./lib/logger.js";

function printUsage() {
  console.log(`Kami Flow CLI

Usage:
  kfc <command> [options]

Commands:
  init       Create kamiflow.config.json in current directory
  doctor     Validate environment, config, and resources directory
  plan       Run kfp plan workflow (init|serve|validate)
  flow       Deterministic plan guardrails (ensure-plan|ready|apply|next)
  client     Client-project one-command setup, diagnostics, and cleanup
  run        Execute Kami Flow with plan guardrails
  help       Show this usage

Global options:
  --cwd <path>   Override working directory for command execution

init options:
  --force        Overwrite existing config file

plan options:
  kfc plan init [--project <path>]
  kfc plan serve [--project <path>] [--port <n>]
  kfc plan validate [--project <path>]

flow options:
  kfc flow ensure-plan --project <path> [--plan <path|plan_id>] [--new]
  kfc flow ready --project <path> [--plan <path|plan_id>] [--new]
  kfc flow apply --project <path> --plan <path|plan_id> --route <plan|build|check|fix|research|start> --result <go|progress|pass|block>
  kfc flow next --project <path> --plan <path|plan_id> --style narrative

run options:
  kfc run [--project <path>] [--skip-ready]

client options:
  kfc client [--goal <text>] [--project <path>] [--force] [--skip-serve-check]
  kfc client bootstrap [--project <path>] [--profile <client|dogfood>] [--port <n>] [--force] [--skip-serve-check]
  kfc client doctor [--project <path>] [--fix]
  kfc client done [--project <path>]
`);
}

function parseGlobalOptions(args) {
  const filtered = [];
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--cwd") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --cwd");
      }
      cwd = path.resolve(value);
      i += 1;
      continue;
    }
    filtered.push(token);
  }

  return { cwd, args: filtered };
}

export async function runCli(argv) {
  try {
    const global = parseGlobalOptions(argv);
    const [command, ...commandArgs] = global.args;

    if (!command || command === "help" || command === "--help" || command === "-h") {
      printUsage();
      return 0;
    }

    if (command === "init") {
      return await runInit({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "doctor") {
      return await runDoctor({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "run") {
      return await runWorkflow({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "plan") {
      return await runPlan({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "flow") {
      return await runFlow({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "client") {
      return await runClient({ cwd: global.cwd, args: commandArgs });
    }

    error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
