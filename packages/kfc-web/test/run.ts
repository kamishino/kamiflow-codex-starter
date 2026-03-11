import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = process.cwd();
const { createKfcWebServer } = await import(pathToFileURL(path.join(packageDir, "dist/server.js")).href);

function stubFeatureImplementations() {
  return {
    plan: async (fastify) => {
      fastify.get("/api/projects", async () => ({ plans: [{ id: "plan-1" }] }));
      fastify.get("/api/projects/demo/events", async (_request, reply) => {
        reply.type("text/event-stream");
        return "event stream";
      });
      return { kind: "plan" };
    },
    session: async (fastify) => {
      fastify.get("/api/sessions", async () => ({ sessions: [{ id: "session-1" }] }));
      return { kind: "session" };
    },
    chat: async (fastify) => {
      fastify.get("/api/chat/health", async () => ({ ok: true }));
      fastify.get("/api/chat/session", async () => ({ state: "unbound" }));
      return { kind: "chat", token: "test-token" };
    }
  };
}

function manifestOverride() {
  return {
    "src/entries/plan.ts": { file: "plan.js", css: ["plan.css"] },
    "src/entries/chat.ts": { file: "chat.js", css: ["chat.css"] },
    "src/entries/session.ts": { file: "session.js", css: ["session.css"] }
  };
}

async function withStubbedShell(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-web-"));
  const server = await createKfcWebServer({
    mode: "serve",
    host: "127.0.0.1",
    port: 0,
    projectDir: tmpDir,
    packageDir,
    manifestOverride: manifestOverride(),
    featureImplementations: stubFeatureImplementations()
  });

  try {
    await server.ready();
    const listening = await server.listen();
    await fn({ tmpDir, server, listening });
  } finally {
    await server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function withOccupiedPort(port: number, fn: () => Promise<void>) {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    const done = (err?: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };
    server.on("error", (error) => reject(error as Error));
    server.listen(port, "127.0.0.1", () => done());
  });

  try {
    await fn();
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

async function withOccupiedPorts(ports: number[], fn: () => Promise<void>) {
  const servers = ports.map(() => net.createServer());
  await Promise.all(
    servers.map((server, index) => new Promise<void>((resolve, reject) => {
      server.once("error", (error) => reject(error as Error));
      server.listen(ports[index], "127.0.0.1", () => resolve());
    }))
  );

  try {
    await fn();
  } finally {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => {
        server.close(() => resolve());
      }))
    );
  }
}

let failed = 0;
async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[kfc-web:test] PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[kfc-web:test] FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

await runCase("package exposes the shell package manifest", async () => {
  const raw = await fs.readFile(path.join(packageDir, "package.json"), "utf8");
  const pkg = JSON.parse(raw);
  assert.equal(pkg.name, "@kamishino/kfc-web");
  assert.equal(pkg.bin["kfc-web"], "bin/kfc-web.js");
});

await runCase("shell serves routed plan, session, and chat pages with shell-owned asset injection", async () => {
  await withStubbedShell(async ({ listening, tmpDir }) => {
    const planHtml = await fetch(listening.urls.plan).then((response) => response.text());
    const sessionHtml = await fetch(listening.urls.session).then((response) => response.text());
    const chatHtml = await fetch(listening.urls.chat).then((response) => response.text());

    assert.match(planHtml, /data-api-base="\/api"/);
    assert.match(planHtml, /\/assets\/plan\.js/);
    assert.match(planHtml, /\/assets\/plan\.css/);

    assert.match(sessionHtml, /data-api-base="\/api\/sessions"/);
    assert.match(sessionHtml, /\/assets\/session\.js/);
    assert.match(sessionHtml, /\/assets\/session\.css/);

    assert.match(chatHtml, /data-api-base="\/api\/chat"/);
    assert.match(chatHtml, /data-ws-path="\/ws"/);
    assert.match(chatHtml, /\/assets\/chat\.js/);
    assert.match(chatHtml, /\/assets\/chat\.css/);
    assert.match(chatHtml, new RegExp(path.basename(tmpDir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(listening.urls.chat.includes("token=test-token"), true);
  });
});

await runCase("shell mounts plan, session, and chat APIs in-process", async () => {
  await withStubbedShell(async ({ listening }) => {
    const projectPayload = await fetch(`${listening.url}/api/projects`).then((response) => response.json());
    const sessionPayload = await fetch(`${listening.url}/api/sessions`).then((response) => response.json());
    const chatPayload = await fetch(`${listening.url}/api/chat/session`).then((response) => response.json());

    assert.deepEqual(projectPayload, { plans: [{ id: "plan-1" }] });
    assert.deepEqual(sessionPayload, { sessions: [{ id: "session-1" }] });
    assert.deepEqual(chatPayload, { state: "unbound" });
  });
});

await runCase("shell auto-selects a free shell port when the requested port is occupied", async () => {
  const blockedPort = 43810;
  await withOccupiedPort(blockedPort, async () => {
    const server = await createKfcWebServer({
      mode: "serve",
      host: "127.0.0.1",
      port: blockedPort,
      portStrategy: "next",
      projectDir: process.cwd(),
      packageDir,
      manifestOverride: manifestOverride(),
      featureImplementations: stubFeatureImplementations()
    });
    try {
      await server.ready();
      const listening = await server.listen();
      const selectedPort = Number(new URL(listening.url).port);

      assert.notEqual(selectedPort, blockedPort);
      assert.ok(selectedPort > blockedPort);
      assert.ok(selectedPort <= blockedPort + 20);
    } finally {
      await server.close();
    }
  });
});

await runCase("shell fails startup when requested port is occupied and strategy is fail", async () => {
  const blockedPort = 43811;
  await withOccupiedPort(blockedPort, async () => {
    await assert.rejects(
      createKfcWebServer({
        mode: "serve",
        host: "127.0.0.1",
        port: blockedPort,
        portStrategy: "fail",
        projectDir: process.cwd(),
        packageDir,
        manifestOverride: manifestOverride(),
        featureImplementations: stubFeatureImplementations()
      }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes("already in use") && message.includes("port-strategy next");
      }
  );
  });
});

await runCase("shell bounds auto-port search with --port-scan-limit", async () => {
  const blockedPort = 43812;
  await withOccupiedPorts([blockedPort, blockedPort + 1], async () => {
    await assert.rejects(
      createKfcWebServer({
        mode: "serve",
        host: "127.0.0.1",
        port: blockedPort,
        portStrategy: "next",
        portScanLimit: 1,
        projectDir: process.cwd(),
        packageDir,
        manifestOverride: manifestOverride(),
        featureImplementations: stubFeatureImplementations()
      }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes("No available Shell port found");
      }
  );
  });
});

await runCase("shell dev mode injects Vite client assets without requiring a built manifest", async () => {
  const server = await createKfcWebServer({
    mode: "dev",
    host: "127.0.0.1",
    port: 0,
    vitePort: 5199,
    projectDir: process.cwd(),
    packageDir,
    skipVite: true,
    featureImplementations: stubFeatureImplementations()
  });
  try {
    await server.ready();
    const response = await server.fastify.inject({ method: "GET", url: "/plan" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /@vite\/client/);
    assert.match(response.body, /src\/entries\/plan\.ts/);
  } finally {
    await server.close();
  }
});

await runCase("shell dev mode can boot a real Vite server without loading a config file", async () => {
  const server = await createKfcWebServer({
    mode: "dev",
    host: "127.0.0.1",
    port: 0,
    vitePort: 5293,
    portStrategy: "next",
    projectDir: process.cwd(),
    packageDir,
    featureImplementations: stubFeatureImplementations()
  });
  try {
    await server.ready();
    const listening = await server.listen();
    const response = await fetch(listening.urls.plan).then((result) => result.text());

    assert.match(response, /@vite\/client/);
    assert.match(response, /src\/entries\/plan\.ts/);
  } finally {
    await server.close();
  }
});

await runCase("shell honors focus redirects for compatibility wrappers", async () => {
  const server = await createKfcWebServer({
    mode: "serve",
    host: "127.0.0.1",
    port: 0,
    projectDir: process.cwd(),
    packageDir,
    manifestOverride: manifestOverride(),
    featureImplementations: stubFeatureImplementations(),
    focus: "chat"
  });
  try {
    await server.ready();
    await server.fastify.ready();
    const response = await server.fastify.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/chat");
  } finally {
    await server.close();
  }
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[kfc-web:test] ${failed} test(s) failed.`);
} else {
  console.log("[kfc-web:test] all tests passed.");
}
