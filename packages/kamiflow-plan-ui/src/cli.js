import { runInit } from "./commands/init.js";
import { runValidate } from "./commands/validate.js";

function printUsage() {
  console.log(`KamiFlow Plan UI CLI

Usage:
  kfp <command> [options]

Commands:
  init       Create .local/plans and a starter plan template
  validate   Validate plan files in .local/plans
  help       Show this usage

Options:
  --project <path>   Override target project directory
`);
}

export async function runCli(argv) {
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  try {
    if (command === "init") {
      return await runInit(args);
    }
    if (command === "validate") {
      return await runValidate(args);
    }
  } catch (err) {
    console.error(`[kfp] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.error(`[kfp] ERROR: Unknown command: ${command}`);
  printUsage();
  return 1;
}
