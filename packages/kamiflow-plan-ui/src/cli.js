import { runInit } from "./commands/init.js";
import { runValidate } from "./commands/validate.js";

function printUsage() {
  console.log(`KamiFlow Plan UI CLI

Usage:
  kfp <command> [options]

Commands:
  init       Create .local/plans and a starter plan template
  validate   Validate plan files in .local/plans
  serve      Run local API + SSE + read-only plan UI
  help       Show this usage

Options:
  --project <path>   Override target project directory
  --port <number>    Override local server port (serve only)
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
    if (command === "serve") {
      const mod = await import("./commands/serve.js");
      return await mod.runServe(args);
    }
  } catch (err) {
    console.error(`[kfp] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.error(`[kfp] ERROR: Unknown command: ${command}`);
  printUsage();
  return 1;
}
