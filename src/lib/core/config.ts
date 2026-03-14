import fs from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

export const CONFIG_FILE_NAME = "kamiflow.config.json";

export function getConfigPath(cwd) {
  return path.join(cwd, CONFIG_FILE_NAME);
}

export function defaultConfig() {
  return {
    version: "1",
    workflow: {
      defaultProvider: "codex",
      profile: "default"
    },
    codex: {
      rulesProfile: "client"
    },
    paths: {
      resourcesDir: "./resources"
    }
  };
}

export async function readRawConfig(cwd) {
  const configPath = getConfigPath(cwd);
  const raw = await fs.readFile(configPath, "utf8");
  return {
    configPath,
    data: JSON.parse(raw)
  };
}

export function validateConfig(data) {
  const errors = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["Config must be a JSON object."];
  }

  if (typeof data.version !== "string" || data.version.length === 0) {
    errors.push("`version` must be a non-empty string.");
  }

  if (typeof data.workflow !== "object" || data.workflow === null || Array.isArray(data.workflow)) {
    errors.push("`workflow` must be an object.");
  } else {
    if (
      typeof data.workflow.defaultProvider !== "string" ||
      data.workflow.defaultProvider.length === 0
    ) {
      errors.push("`workflow.defaultProvider` must be a non-empty string.");
    }

    if (
      data.workflow.profile !== undefined &&
      typeof data.workflow.profile !== "string"
    ) {
      errors.push("`workflow.profile` must be a string when provided.");
    }
  }

  if (data.paths !== undefined) {
    if (typeof data.paths !== "object" || data.paths === null || Array.isArray(data.paths)) {
      errors.push("`paths` must be an object when provided.");
    } else if (
      data.paths.resourcesDir !== undefined &&
      typeof data.paths.resourcesDir !== "string"
    ) {
      errors.push("`paths.resourcesDir` must be a string when provided.");
    }
  }

  if (data.codex !== undefined) {
    if (typeof data.codex !== "object" || data.codex === null || Array.isArray(data.codex)) {
      errors.push("`codex` must be an object when provided.");
    } else if (
      data.codex.rulesProfile !== undefined &&
      !["dogfood", "client"].includes(data.codex.rulesProfile)
    ) {
      errors.push("`codex.rulesProfile` must be either `dogfood` or `client` when provided.");
    }
  }

  return errors;
}

export function resolveResourcesDir(config, configPath) {
  const configDir = path.dirname(configPath);
  const userPath = config.paths?.resourcesDir;
  if (typeof userPath === "string" && userPath.length > 0) {
    return path.resolve(configDir, userPath);
  }
  return path.resolve(configDir, "resources");
}

export async function assertReadableDirectory(dirPath) {
  await fs.access(dirPath, fsConstants.F_OK | fsConstants.R_OK);
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }
}
