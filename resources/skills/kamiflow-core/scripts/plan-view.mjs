#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseCliArgs,
  printJson,
  resolveProjectDir
} from "./lib-plan.mjs";
import { buildSpawnSpec } from "./lib-process.mjs";
import {
  bestEffortOpenUrl,
  clearPlanViewRuntime,
  probePlanView,
  readPlanViewRuntime,
  terminateProcess
} from "./lib-plan-view.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const shouldOpen = args.open === true;
const shouldStop = args.stop === true;

if ((shouldOpen && shouldStop) || (!shouldOpen && !shouldStop)) {
  printJson({
    ok: false,
    action: "invalid-args",
    recovery: "node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open"
  });
  process.exit(1);
}

if (shouldOpen) {
  await openPlanView(projectDir);
} else {
  await stopPlanView(projectDir);
}

async function openPlanView(projectDir) {
  const existing = await readPlanViewRuntime(projectDir);
  if (existing.valid) {
    const probe = await probePlanView(existing.marker.url, "/health");
    if (probe.ok) {
      const browser = await bestEffortOpenUrl(existing.marker.url);
      printJson({
        ok: true,
        action: "reused",
        url: existing.marker.url,
        port: existing.marker.port,
        pid: existing.marker.pid,
        browser
      });
      return;
    }
  }

  let recoveredStale = false;
  if (existing.exists) {
    recoveredStale = true;
    if (existing.valid) {
      terminateProcess(existing.marker.pid);
      await waitForPlanViewShutdown(existing.marker.url, 1_500);
    }
    await clearPlanViewRuntime(projectDir);
  }

  const serverScriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "plan-view-server.mjs");
  const spawnSpec = buildSpawnSpec("node", [serverScriptPath, "--project", projectDir]);
  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: projectDir,
    detached: true,
    stdio: "ignore",
    shell: false,
    env: {
      ...process.env
    }
  });
  child.unref();

  const launched = await waitForHealthyPlanView(projectDir, 8_000);
  if (!launched.ok) {
    printJson({
      ok: false,
      action: "start-failed",
      recovered_stale: recoveredStale,
      reason: launched.reason
    });
    process.exit(1);
  }

  const browser = await bestEffortOpenUrl(launched.marker.url);
  printJson({
    ok: true,
    action: recoveredStale ? "replaced-stale-and-started" : "started",
    url: launched.marker.url,
    port: launched.marker.port,
    pid: launched.marker.pid,
    browser
  });
}

async function stopPlanView(projectDir) {
  const existing = await readPlanViewRuntime(projectDir);
  if (!existing.exists) {
    printJson({
      ok: true,
      action: "no-active-server"
    });
    return;
  }

  if (existing.valid) {
    terminateProcess(existing.marker.pid);
    await waitForPlanViewShutdown(existing.marker.url, 4_000);
  }
  await clearPlanViewRuntime(projectDir);

  printJson({
    ok: true,
    action: existing.valid ? "stopped" : "cleared-stale-marker"
  });
}

async function waitForHealthyPlanView(projectDir, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const runtime = await readPlanViewRuntime(projectDir);
    if (runtime.valid) {
      const probe = await probePlanView(runtime.marker.url, "/health");
      if (probe.ok) {
        return {
          ok: true,
          marker: runtime.marker
        };
      }
    }
    await sleep(200);
  }

  return {
    ok: false,
    reason: "Timed out waiting for a healthy plan-view server."
  };
}

async function waitForPlanViewShutdown(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const probe = await probePlanView(baseUrl, "/health", 600);
    if (!probe.ok) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
