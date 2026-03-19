import {
  assertReadableDirectory,
  readConfigOrDefault,
  resolveResourcesDir,
  validateConfig
} from "../../lib/core/config.js";
import { error, info } from "../../lib/core/logger.js";

function parseMajorVersion(version) {
  const parsed = Number.parseInt(version.split(".")[0], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function runDoctor(options) {
  let hasFailure = false;

  const nodeMajor = parseMajorVersion(process.versions.node);
  if (nodeMajor < 20) {
    error(`Node.js >= 20 is required. Current: ${process.versions.node}`);
    hasFailure = true;
  } else {
    info(`Node.js version OK: ${process.versions.node}`);
  }

  let config;
  let configPath;
  let configSource = "file";
  try {
    const raw = await readConfigOrDefault(options.cwd);
    config = raw.data;
    configPath = raw.configPath;
    configSource = raw.source;
    if (configSource === "file") {
      info(`Config found: ${configPath}`);
    } else {
      info(`Config optional: using bundled defaults for this project (no ${configPath} present).`);
    }
  } catch (readErr) {
    error(`Unable to resolve project config: ${readErr.message}`);
    return 1;
  }

  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    return 1;
  }
  info(configSource === "file" ? "Config schema OK." : "Bundled default config OK.");

  const resourcesDir = resolveResourcesDir(config, configPath);
  try {
    await assertReadableDirectory(resourcesDir);
    info(`Resources directory OK: ${resourcesDir}`);
  } catch (dirErr) {
    error(`Resources directory check failed: ${dirErr.message}`);
    hasFailure = true;
  }

  return hasFailure ? 1 : 0;
}
