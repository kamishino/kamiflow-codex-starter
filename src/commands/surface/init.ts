import fs from "node:fs/promises";
import { defaultConfig, getConfigPath } from "../../lib/core/config.js";
import { info } from "../../lib/core/logger.js";

function hasFlag(args, flag) {
  return args.includes(flag);
}

export async function runInit(options) {
  const configPath = getConfigPath(options.cwd);
  const force = hasFlag(options.args, "--force");

  let exists = false;
  try {
    await fs.access(configPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists && !force) {
    info(`Config already exists: ${configPath}`);
    info("Use `kfc init --force` to overwrite.");
    return 0;
  }

  const content = JSON.stringify(defaultConfig(), null, 2) + "\n";
  await fs.writeFile(configPath, content, "utf8");

  info(`Wrote config: ${configPath}`);
  return 0;
}


