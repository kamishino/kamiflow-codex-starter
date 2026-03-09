import path from "node:path";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runWorkflow } from "./commands/run.js";
import { runPlan } from "./commands/plan.js";
import { runFlow } from "./commands/flow.js";
import { runClient } from "./commands/client.js";
import { runSession } from "./commands/session.js";
import { runRemote } from "./commands/remote.js";
import { runWeb } from "./commands/web.js";
import { error } from "./lib/logger.js";

function printUsage() {
  console.log(`Kami Flow CLI

Usage:
  kfc <command> [options]

Commands:
  init       Create kamiflow.config.json in current directory
  doctor     Validate environment, config, and resources directory
  plan       Run kfc-plan plan workflow (init|serve|validate)
  flow       Deterministic plan guardrails (ensure-plan|ready|apply|next)
  client     Client-project one-command setup, diagnostics, and cleanup
  session    Codex session transfer helpers (where|find|copy|push|pull|key|trust)
  remote     Mobile-first remote server for mirrored session + queued prompts
  web        Hosted KFC web shell for /plan, /session, and /chat
  run        Execute Kami Flow with plan guardrails
  help       Show this usage

Global options:
  --cwd <path>   Override working directory for command execution

init options:
  --force        Overwrite existing config file

plan options:
  kfc plan init [--project <path>] [--new] [--topic <text>] [--route <start|plan|build|check|fix|research>]
  kfc plan serve [--project <path>] [--port <n>]
  kfc plan validate [--project <path>]

flow options:
  kfc flow ensure-plan --project <path> [--plan <path|plan_id>] [--new] [--topic <text>] [--route <start|plan|build|check|fix|research>]
  kfc flow ready --project <path> [--plan <path|plan_id>] [--new] [--no-sync-block] [--no-sync-ready]
  kfc flow apply --project <path> --plan <path|plan_id> --route <plan|build|check|fix|research|start> --result <go|progress|pass|block>
  kfc flow next --project <path> --plan <path|plan_id> --style narrative

run options:
  kfc run [--project <path>] [--skip-ready] [--route <start|plan|build|check|fix|research>] [--max-steps <n>] [--timeout-ms <n>]

client options:
  kfc client [--goal <text>] [--project <path>] [--force] [--skip-serve-check] [--no-launch-codex]
  kfc client bootstrap [--project <path>] [--profile <client|dogfood>] [--port <n>] [--force] [--skip-serve-check] [--no-launch-codex]
  kfc client doctor [--project <path>] [--fix]
  kfc client done [--project <path>]
  kfc client update [--project <path>] [--from <git-url|folder|tgz>] [--apply] [--skip-serve-check]
  kfc client upgrade [--project <path>] [--from <git-url|folder|tgz>] [--apply] [--skip-serve-check]

session options:
  kfc session where
  kfc session find --id <session-id> [--from <path>]
  kfc session copy --to <path> [--from <path>] [--date <YYYY-MM-DD|YYYY/MM/DD>|--id <session-id>] [--overwrite|--merge]
  kfc session key <gen|show|where> [--key <path>] [--name <text>] [--overwrite]
  kfc session trust <list|add|remove|where> [--name <text>] [--pubkey <age1...>] [--key <path>]
  kfc session push --to <transfer-path> [--id <session-id>] [--from <path>] [--merge]
  kfc session push --to <transfer-path> [--recipient <age1...>] [--recipient <age1...>]
  kfc session pull --from <transfer-path> [--id <session-id>] [--to <path>] [--key <path>] [--merge]

remote options:
  kfc remote serve [--project <path>] [--host <host>] [--port <n>] [--token <text>] [--detach] [--detach-file <path>]
  kfc remote stop [--project <path>] [--detach-file <path>] [--pid <n>]
  kfc remote token <gen|show|revoke> [--project <path>] [--token <text>] [--overwrite]

web options:
  kfc web serve [--project <path>] [--host <host>] [--port <n>] [--focus <plan|session|chat>]
  kfc web dev [--project <path>] [--host <host>] [--port <n>] [--vite-port <n>] [--focus <plan|session|chat>]
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

    if (command === "session") {
      return await runSession({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "remote") {
      return await runRemote({ cwd: global.cwd, args: commandArgs });
    }

    if (command === "web") {
      return await runWeb({ cwd: global.cwd, args: commandArgs });
    }

    error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

