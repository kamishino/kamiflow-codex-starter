import {
  assertReadableDirectory,
  readRawConfig,
  resolveResourcesDir,
  validateConfig
} from "../lib/config.js";
import { error, info } from "../lib/logger.js";

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
  try {
    const raw = await readRawConfig(options.cwd);
    config = raw.data;
    configPath = raw.configPath;
    info(`Config found: ${configPath}`);
  } catch (readErr) {
    error(`Missing or unreadable config: ${readErr.message}`);
    error("Run `kamiflow init` to create a default config.");
    return 1;
  }

  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    return 1;
  }
  info("Config schema OK.");

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
