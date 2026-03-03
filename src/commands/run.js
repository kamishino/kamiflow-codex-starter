import {
  assertReadableDirectory,
  readRawConfig,
  resolveResourcesDir,
  validateConfig
} from "../lib/config.js";
import path from "node:path";
import { error, info } from "../lib/logger.js";
import { runFlow } from "./flow.js";

function usage() {
  info("Usage: kfc run [--project <path>] [--skip-ready]");
  info("Examples:");
  info("  kfc run");
  info("  kfc run --project .");
  info("  kfc run --project . --skip-ready");
}

function parseArgs(baseCwd, args) {
  const parsed = {
    project: baseCwd,
    skipReady: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--project") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --project.");
      }
      parsed.project = path.resolve(baseCwd, value);
      i += 1;
      continue;
    }
    if (token === "--skip-ready") {
      parsed.skipReady = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { ...parsed, help: true };
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

export async function runWorkflow(options) {
  const parsed = parseArgs(options.cwd, options.args);
  if (parsed.help) {
    usage();
    return 0;
  }

  let raw;
  try {
    raw = await readRawConfig(parsed.project);
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

  const ensurePlanCode = await runFlow({
    cwd: parsed.project,
    args: ["ensure-plan", "--project", parsed.project]
  });
  if (ensurePlanCode !== 0) {
    error("Run guardrail failed: `kfc flow ensure-plan` did not succeed.");
    return ensurePlanCode;
  }

  if (!parsed.skipReady) {
    const readyCode = await runFlow({
      cwd: parsed.project,
      args: ["ready", "--project", parsed.project]
    });
    if (readyCode !== 0) {
      error("Run guardrail failed: plan is not build-ready. Fix the plan before running implementation.");
      return readyCode;
    }
  } else {
    info("Skipping build-readiness gate (--skip-ready).");
  }

  info("Run guardrails passed.");
  info(`Provider: ${raw.data.workflow.defaultProvider}`);
  info(`Profile: ${raw.data.workflow.profile ?? "default"}`);
  info(`Resources: ${resourcesDir}`);
  info("Run flow is currently a placeholder. Add workflow actions next.");
  return 0;
}
