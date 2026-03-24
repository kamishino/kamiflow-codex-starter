import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PLAN_VIEW_DIR = path.join(".local", "plan-view");
export const PLAN_VIEW_RUNTIME_PATH = path.join(PLAN_VIEW_DIR, "runtime.json");
export const PLAN_VIEW_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const PLAN_VIEW_POLL_INTERVAL_MS = 5 * 1000;

const planViewAssetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "plan-view");
const planViewAssetMap = new Map([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/plan-view.css", { fileName: "plan-view.css", contentType: "text/css; charset=utf-8" }],
  ["/plan-view.js", { fileName: "plan-view.js", contentType: "application/javascript; charset=utf-8" }]
]);
const planViewAssetCache = new Map();

export function resolvePlanViewDir(projectDir) {
  return path.join(projectDir, PLAN_VIEW_DIR);
}

export function resolvePlanViewRuntimePath(projectDir) {
  return path.join(projectDir, PLAN_VIEW_RUNTIME_PATH);
}

export async function ensurePlanViewDir(projectDir) {
  await fsp.mkdir(resolvePlanViewDir(projectDir), { recursive: true });
}

export async function readPlanViewRuntime(projectDir) {
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  if (!fs.existsSync(runtimePath)) {
    return {
      exists: false,
      valid: false,
      path: runtimePath,
      marker: null
    };
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(runtimePath, "utf8"));
    const marker = normalizePlanViewRuntime(parsed);
    if (!marker) {
      return {
        exists: true,
        valid: false,
        path: runtimePath,
        marker: null,
        reason: "invalid runtime marker"
      };
    }
    return {
      exists: true,
      valid: true,
      path: runtimePath,
      marker
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      path: runtimePath,
      marker: null,
      reason: `invalid JSON: ${error.message}`
    };
  }
}

export async function writePlanViewRuntime(projectDir, marker) {
  await ensurePlanViewDir(projectDir);
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  const normalizedMarker = normalizePlanViewRuntime(marker);
  if (!normalizedMarker) {
    throw new Error("Cannot write an invalid plan-view runtime marker.");
  }
  await fsp.writeFile(runtimePath, `${JSON.stringify(normalizedMarker, null, 2)}\n`, "utf8");
  return {
    path: runtimePath,
    marker: normalizedMarker
  };
}

export async function clearPlanViewRuntime(projectDir, expectedPid = null) {
  const runtimePath = resolvePlanViewRuntimePath(projectDir);
  if (!fs.existsSync(runtimePath)) {
    return false;
  }

  if (expectedPid !== null) {
    const runtime = await readPlanViewRuntime(projectDir);
    if (!runtime.valid || Number(runtime.marker?.pid) !== Number(expectedPid)) {
      return false;
    }
  }

  await fsp.rm(runtimePath, { force: true });
  return true;
}

export function normalizePlanViewRuntime(value) {
  const pid = Number(value?.pid);
  const port = Number(value?.port);
  const url = String(value?.url || "").trim();
  const projectDir = String(value?.project_dir || "").trim();
  const startedAt = String(value?.started_at || "").trim();

  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }
  if (!/^https?:\/\/127\.0\.0\.1:\d+\/?$/i.test(url)) {
    return null;
  }
  if (!projectDir || !path.isAbsolute(projectDir)) {
    return null;
  }
  if (!startedAt) {
    return null;
  }

  return {
    pid,
    port,
    url: url.endsWith("/") ? url : `${url}/`,
    project_dir: projectDir,
    started_at: startedAt
  };
}

export async function probePlanView(baseUrl, route = "/health", timeoutMs = 1500) {
  let targetUrl = "";
  try {
    targetUrl = new URL(route, ensureTrailingSlash(baseUrl)).toString();
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    return {
      ok: response.ok,
      status: response.status,
      url: targetUrl
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      error: error.message
    };
  }
}

export async function readPlanViewSnapshot(baseUrl, timeoutMs = 1500) {
  let targetUrl = "";
  try {
    targetUrl = new URL("/snapshot.json", ensureTrailingSlash(baseUrl)).toString();
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        url: targetUrl,
        snapshot: null
      };
    }
    return {
      ok: true,
      status: response.status,
      url: targetUrl,
      snapshot: await response.json()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      error: error.message,
      snapshot: null
    };
  }
}

export function terminateProcess(pid) {
  try {
    process.kill(Number(pid), "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export async function bestEffortOpenUrl(url) {
  if (String(process.env.KAMIFLOW_PLAN_VIEW_NO_BROWSER || "").trim() === "1") {
    return {
      attempted: false,
      opened: false,
      command: "disabled-by-env"
    };
  }

  try {
    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/d", "/s", "/c", "start", "", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else {
      command = "xdg-open";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: false
    });
    child.unref();
    return {
      attempted: true,
      opened: true,
      command: [command, ...args].join(" ")
    };
  } catch (error) {
    return {
      attempted: true,
      opened: false,
      command: "",
      error: error.message
    };
  }
}

export async function readPlanViewAsset(pathname) {
  const asset = planViewAssetMap.get(pathname);
  if (!asset) {
    return null;
  }
  const body = await readPlanViewAssetBody(asset.fileName);
  return {
    body,
    contentType: asset.contentType
  };
}

async function readPlanViewAssetBody(fileName) {
  if (planViewAssetCache.has(fileName)) {
    return planViewAssetCache.get(fileName);
  }

  const assetPath = path.join(planViewAssetDir, fileName);
  const text = await fsp.readFile(assetPath, "utf8");
  const resolvedText = fileName === "plan-view.js"
    ? text.replaceAll("__PLAN_VIEW_POLL_INTERVAL_MS__", String(PLAN_VIEW_POLL_INTERVAL_MS))
    : text;
  planViewAssetCache.set(fileName, resolvedText);
  return resolvedText;
}

function ensureTrailingSlash(value) {
  return String(value || "").endsWith("/") ? String(value) : `${value}/`;
}
