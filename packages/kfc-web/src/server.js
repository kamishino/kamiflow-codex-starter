import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import httpProxy from "http-proxy";
import { Eta } from "eta";
import { createServer as createViteServer } from "vite";

function shellHtml({ title, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{margin:0;font-family:"Work Sans",system-ui,sans-serif;background:#f7f4ef;color:#1f1a14}.shell{padding:24px;display:grid;gap:24px}.nav{display:flex;gap:12px;flex-wrap:wrap}.nav a{padding:10px 14px;border:1px solid #d8cfc1;border-radius:999px;text-decoration:none;color:#1f1a14;background:#fff}.nav a:hover{border-color:#8d7156}.lede{color:#655646;margin:0}</style></head><body>${body}</body></html>`;
}

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function resolveRepoRoot(packageDir) {
  return path.resolve(packageDir, "..", "..");
}

function projectNameFromDir(projectDir) {
  return path.basename(projectDir) || "Project";
}

function buildChildPorts(port) {
  return { plan: port + 10, session: port + 18, chat: port + 22, vite: port + 74 };
}

function npmExe() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function spawnChild({ cwd, workspace, args, name }) {
  const child = spawn(npmExe(), ["run", "-w", workspace, "serve", "--", ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
}

async function waitForReady(url, timeoutMs = 120000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 401) {
        return;
      }
      lastError = `${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

async function loadManifest(packageDir) {
  const manifestPath = path.join(packageDir, "dist", "client", ".vite", "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

function assetSetFromManifest(manifest, entryName) {
  const key = `src/entries/${entryName}.ts`;
  const entry = manifest[key];
  if (!entry) {
    throw new Error(`Missing Vite manifest entry: ${key}`);
  }
  const scripts = [`/assets/${entry.file}`];
  const styles = (entry.css || []).map((item) => `/assets/${item}`);
  return { scripts, styles };
}

function devAssetSet(vitePort, entryName) {
  return {
    scripts: [`http://127.0.0.1:${vitePort}/@vite/client`, `http://127.0.0.1:${vitePort}/src/entries/${entryName}.ts`],
    styles: []
  };
}

function createTemplateRenderer(templatePath) {
  const eta = new Eta({ views: path.dirname(templatePath), cache: false });
  return async (data) => {
    const out = await eta.renderAsync(path.basename(templatePath), data);
    if (!out) throw new Error(`Failed to render template: ${templatePath}`);
    return out;
  };
}

function featureTargets(ports) {
  return {
    plan: `http://127.0.0.1:${ports.plan}`,
    session: `http://127.0.0.1:${ports.session}`,
    chat: `http://127.0.0.1:${ports.chat}`
  };
}

function normalizeFeatureTargets(value, fallbackPorts) {
  if (!value) {
    return featureTargets(fallbackPorts);
  }
  return {
    plan: String(value.plan),
    session: String(value.session),
    chat: String(value.chat)
  };
}

function rewriteProxyPath(req, nextPath) {
  req.url = nextPath;
}

export async function createKfcWebServer(options = {}) {
  const mode = options.mode === "dev" ? "dev" : "serve";
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4300);
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const focus = String(options.focus || "").trim().toLowerCase();
  const packageDir = options.packageDir;
  const repoRoot = resolveRepoRoot(packageDir);
  const ports = buildChildPorts(mode === "dev" ? Number(options.port || 4300) : Number(options.port || 4300));
  if (options.vitePort) ports.vite = Number(options.vitePort);
  const targets = normalizeFeatureTargets(options.featureTargets, ports);
  const fastify = Fastify({ logger: false });
  const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });
  const children = [];
  let viteServer = null;
  let manifest = options.manifestOverride || null;

  const renderPlan = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-plan-web", "src", "server", "views", "index.eta"));
  const renderChat = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-chat", "src", "server", "views", "index.eta"));
  const renderSession = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-session", "src", "server", "views", "index.eta"));

  proxy.on("error", (_err, _req, res) => {
    if (res && !res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream KFC web surface unavailable." }));
    }
  });

  async function startChildren() {
    if (options.skipChildren) {
      return;
    }
    children.push(spawnChild({ cwd: repoRoot, workspace: "@kamishino/kfc-plan-web", name: "plan", args: ["--project", projectDir, "--host", "127.0.0.1", "--port", String(ports.plan)] }));
    children.push(spawnChild({ cwd: repoRoot, workspace: "@kamishino/kfc-session", name: "session", args: ["--host", "127.0.0.1", "--port", String(ports.session)] }));
    children.push(spawnChild({ cwd: repoRoot, workspace: "@kamishino/kfc-chat", name: "chat", args: ["--project", projectDir, "--host", "127.0.0.1", "--port", String(ports.chat)] }));

    await Promise.all([
      waitForReady(`${targets.plan}/api/projects`),
      waitForReady(`${targets.session}/api/health`),
      waitForReady(`${targets.chat}/api/chat/health`)
    ]);
  }

  async function startAssets() {
    if (mode === "dev") {
      if (options.skipVite) {
        return;
      }
      viteServer = await createViteServer({
        configFile: path.join(packageDir, "vite.config.mjs"),
        server: { host: "127.0.0.1", port: ports.vite, strictPort: true }
      });
      await viteServer.listen();
      return;
    }
    if (manifest) {
      return;
    }
    manifest = await loadManifest(packageDir);
  }

  function featureAssets(name) {
    return mode === "dev" ? devAssetSet(ports.vite, name) : assetSetFromManifest(manifest, name);
  }

  function proxyRequest(reply, req, target, nextPath = req.raw.url) {
    reply.hijack();
    rewriteProxyPath(req.raw, nextPath);
    proxy.web(req.raw, reply.raw, { target });
  }

  fastify.get("/", async (_request, reply) => {
    if (focus === "plan" || focus === "session" || focus === "chat") {
      return reply.redirect(`/${focus}`);
    }
    return reply.type("text/html; charset=utf-8").send(shellHtml({
      title: "KFC Web",
      body: `<div class="shell"><div><h1>KFC Web</h1><p class="lede">Unified KFC web shell for plan, session, and chat.</p></div><nav class="nav"><a href="/plan">Plan</a><a href="/session">Session</a><a href="/chat">Chat</a></nav></div>`
    }));
  });

  fastify.get("/plan", async (_request, reply) => {
    const assets = featureAssets("plan");
    reply.type("text/html; charset=utf-8");
    return await renderPlan({ title: "KamiFlow Plan Review", uiMode: "observer", apiBase: "/api", scriptHrefs: assets.scripts, styleHrefs: assets.styles });
  });

  fastify.get("/chat", async (_request, reply) => {
    const assets = featureAssets("chat");
    reply.type("text/html; charset=utf-8");
    return await renderChat({ title: "KFC Chat", projectName: projectNameFromDir(projectDir), projectDir, apiBase: "/api/chat", wsPath: "/ws", scriptHrefs: assets.scripts, styleHrefs: assets.styles });
  });

  fastify.get("/session", async (_request, reply) => {
    const assets = featureAssets("session");
    reply.type("text/html; charset=utf-8");
    return await renderSession({ title: "KFC Session", sessionsRootLabel: "~/.codex/sessions", scriptHrefs: assets.scripts, styleHrefs: assets.styles, apiBase: "/api/sessions" });
  });

  if (mode === "serve") {
    fastify.get("/assets/*", async (request, reply) => {
      const rel = String(request.params["*"] || "");
      const assetPath = path.join(packageDir, "dist", "client", rel);
      const body = await fs.readFile(assetPath);
      if (rel.endsWith(".js")) reply.type("application/javascript; charset=utf-8");
      else if (rel.endsWith(".css")) reply.type("text/css; charset=utf-8");
      else reply.type("application/octet-stream");
      return reply.send(body);
    });
  }

  fastify.all("/api/projects", async (request, reply) => proxyRequest(reply, request, targets.plan));
  fastify.all("/api/projects/*", async (request, reply) => proxyRequest(reply, request, targets.plan));
  fastify.all("/api/automation", async (request, reply) => proxyRequest(reply, request, targets.plan));
  fastify.all("/api/automation/*", async (request, reply) => proxyRequest(reply, request, targets.plan));
  fastify.all("/api/chat", async (request, reply) => proxyRequest(reply, request, targets.chat));
  fastify.all("/api/chat/*", async (request, reply) => proxyRequest(reply, request, targets.chat));
  fastify.all("/api/sessions", async (request, reply) => proxyRequest(reply, request, targets.session, "/api/sessions"));
  fastify.all("/api/sessions/*", async (request, reply) => proxyRequest(reply, request, targets.session));

  fastify.server.on("upgrade", (req, socket, head) => {
    const url = String(req.url || "");
    if (url.startsWith("/ws")) {
      proxy.ws(req, socket, head, { target: targets.chat });
      return;
    }
    socket.destroy();
  });

  return {
    fastify,
    targets,
    async ready() {
      await startChildren();
      await startAssets();
      await fastify.ready();
    },
    async listen() {
      await fastify.listen({ host, port });
      const address = fastify.server.address();
      const actualPort = address && typeof address === "object" ? address.port : port;
      return {
        url: `http://${host}:${actualPort}`,
        urls: {
          plan: `http://${host}:${actualPort}/plan`,
          session: `http://${host}:${actualPort}/session`,
          chat: `http://${host}:${actualPort}/chat`
        }
      };
    },
    async close() {
      await fastify.close();
      if (viteServer) await viteServer.close();
      for (const child of children) {
        child.kill();
      }
    }
  };
}
