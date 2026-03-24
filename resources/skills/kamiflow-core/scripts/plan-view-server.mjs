#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCliArgs,
  resolveProjectDir
} from "./lib-plan.mjs";
import {
  clearPlanViewRuntime,
  PLAN_VIEW_IDLE_TIMEOUT_MS,
  PLAN_VIEW_POLL_INTERVAL_MS,
  readPlanViewAsset,
  writePlanViewRuntime
} from "./runtime/plan-view-runtime.mjs";
import { buildPlanSnapshot } from "./core/plan-snapshot-core.mjs";

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const host = "127.0.0.1";
const idleTimeoutMs = Number(args["idle-ms"] || PLAN_VIEW_IDLE_TIMEOUT_MS);

let lastInteractiveAt = Date.now();
let serverClosed = false;

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:0`}`);
  try {
    if (requestUrl.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }

    if (requestUrl.pathname === "/snapshot.json") {
      lastInteractiveAt = Date.now();
      const snapshot = await buildPlanSnapshot(projectDir);
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(snapshot, null, 2));
      return;
    }

    const asset = await readPlanViewAsset(requestUrl.pathname);
    if (asset) {
      lastInteractiveAt = Date.now();
      response.writeHead(200, { "content-type": asset.contentType, "cache-control": "no-store" });
      response.end(asset.body);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
});

server.listen(0, host, async () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Failed to bind a TCP port for plan-view.");
    process.exit(1);
  }

  const marker = {
    pid: process.pid,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    project_dir: projectDir,
    started_at: new Date().toISOString()
  };
  await writePlanViewRuntime(projectDir, marker);
});

const idleInterval = setInterval(async () => {
  if (Date.now() - lastInteractiveAt <= idleTimeoutMs) {
    return;
  }
  await shutdown();
}, Math.min(PLAN_VIEW_POLL_INTERVAL_MS, 30_000));

idleInterval.unref();

process.on("SIGINT", async () => {
  await shutdown();
});
process.on("SIGTERM", async () => {
  await shutdown();
});

server.on("close", async () => {
  await clearPlanViewRuntime(projectDir, process.pid);
});

async function shutdown() {
  if (serverClosed) {
    return;
  }
  serverClosed = true;
  clearInterval(idleInterval);
  await clearPlanViewRuntime(projectDir, process.pid);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 1_000).unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) {
  throw new Error("plan-view-server.mjs must run as a script.");
}
