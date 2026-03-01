import path from "node:path";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runWorkflow } from "./commands/run.js";
import { error } from "./lib/logger.js";

function printUsage() {
  console.log(`Kami Flow CLI

Usage:
  kamiflow <command> [options]

Commands:
  init       Create kamiflow.config.json in current directory
  doctor     Validate environment, config, and resources directory
  run        Execute Kami Flow (placeholder)
  help       Show this usage

Global options:
  --cwd <path>   Override working directory for command execution

init options:
  --force        Overwrite existing config file
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

    error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
