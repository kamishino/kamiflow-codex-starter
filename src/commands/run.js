import {
  assertReadableDirectory,
  readRawConfig,
  resolveResourcesDir,
  validateConfig
} from "../lib/config.js";
import { error, info } from "../lib/logger.js";

export async function runWorkflow(options) {
  let raw;
  try {
    raw = await readRawConfig(options.cwd);
  } catch (readErr) {
    error(`Cannot read config: ${readErr.message}`);
    error("Run `kfc init` first.");
    return 1;
  }

  const validationErrors = validateConfig(raw.data);
  if (validationErrors.length > 0) {
    for (const msg of validationErrors) {
      error(`Invalid config: ${msg}`);
    }
    return 1;
  }

  const resourcesDir = resolveResourcesDir(raw.data, raw.configPath);
  try {
    await assertReadableDirectory(resourcesDir);
  } catch (dirErr) {
    error(`Resources directory is not usable: ${dirErr.message}`);
    return 1;
  }

  info("Executing placeholder workflow.");
  info(`Provider: ${raw.data.workflow.defaultProvider}`);
  info(`Profile: ${raw.data.workflow.profile ?? "default"}`);
  info(`Resources: ${resourcesDir}`);
  info("Run flow is currently a placeholder. Add workflow actions next.");
  return 0;
}
