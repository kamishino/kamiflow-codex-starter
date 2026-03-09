import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Eta } from "eta";
import { createServer as createViteServer } from "vite";
import { createFeatureServer } from "../../kfc-web-runtime/src/feature-server.js";

function shellHtml({ title, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{margin:0;font-family:"Work Sans",system-ui,sans-serif;background:#f7f4ef;color:#1f1a14}.shell{padding:24px;display:grid;gap:24px}.nav{display:flex;gap:12px;flex-wrap:wrap}.nav a{padding:10px 14px;border:1px solid #d8cfc1;border-radius:999px;text-decoration:none;color:#1f1a14;background:#fff}.nav a:hover{border-color:#8d7156}.lede{color:#655646;margin:0}</style></head><body>${body}</body></html>`;
}

function resolveRepoRoot(packageDir) {
  return path.resolve(packageDir, "..", "..");
}

function projectNameFromDir(projectDir) {
  return path.basename(projectDir) || "Project";
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
  return {
    scripts: [`/assets/${entry.file}`],
    styles: (entry.css || []).map((item) => `/assets/${item}`)
  };
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
    if (!out) {
      throw new Error(`Failed to render template: ${templatePath}`);
    }
    return out;
  };
}

async function loadBuiltInFeatureImplementations(repoRoot) {
  const [planModule, sessionModule, chatModule] = await Promise.all([
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-plan-web", "dist", "server", "create-server.js")).href),
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-session", "src", "server", "create-server.js")).href),
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-chat", "dist", "server", "create-server.js")).href)
  ]);

  return {
    plan: planModule.registerKfcPlanFeature,
    session: sessionModule.registerKfcSessionFeature,
    chat: chatModule.registerKfcChatFeature
  };
}

export async function createKfcWebServer(options = {}) {
  const mode = options.mode === "dev" ? "dev" : "serve";
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4300);
  const vitePort = Number(options.vitePort || 5174);
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const focus = String(options.focus || "").trim().toLowerCase();
  const packageDir = options.packageDir;
  const repoRoot = resolveRepoRoot(packageDir);
  let viteServer = null;
  let manifest = options.manifestOverride || null;
  let featureHandles = null;

  const renderPlan = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-plan-web", "src", "server", "views", "index.eta"));
  const renderChat = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-chat", "src", "server", "views", "index.eta"));
  const renderSession = createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-session", "src", "server", "views", "index.eta"));

  async function startAssets() {
    if (mode === "dev") {
      if (options.skipVite) {
        return;
      }
      viteServer = await createViteServer({
        configFile: path.join(packageDir, "vite.config.mjs"),
        server: { host: "127.0.0.1", port: vitePort, strictPort: true }
      });
      await viteServer.listen();
      return;
    }
    if (!manifest) {
      manifest = await loadManifest(packageDir);
    }
  }

  function featureAssets(name) {
    return mode === "dev" ? devAssetSet(vitePort, name) : assetSetFromManifest(manifest, name);
  }

  async function startFeatures(fastify) {
    const implementations = options.featureImplementations || await loadBuiltInFeatureImplementations(repoRoot);
    featureHandles = {
      plan: await implementations.plan(fastify, {
        projectDir,
        uiMode: "observer",
        mountUi: false,
        workspaceName: "KFC Web"
      }),
      session: await implementations.session(fastify, {
        mountUi: false,
        mountHealth: false,
        sessionsRoot: options.sessionsRoot
      }),
      chat: await implementations.chat(fastify, {
        projectDir,
        projectName: projectNameFromDir(projectDir),
        host,
        port,
        mountUi: false
      })
    };
  }

  return await createFeatureServer({
    host,
    port,
    setup: async (fastify) => {
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
        return await renderPlan({
          title: "KamiFlow Plan Review",
          uiMode: "observer",
          apiBase: "/api",
          scriptHrefs: assets.scripts,
          styleHrefs: assets.styles
        });
      });

      fastify.get("/chat", async (_request, reply) => {
        const assets = featureAssets("chat");
        reply.type("text/html; charset=utf-8");
        return await renderChat({
          title: "KFC Chat",
          projectName: projectNameFromDir(projectDir),
          projectDir,
          apiBase: "/api/chat",
          wsPath: "/ws",
          scriptHrefs: assets.scripts,
          styleHrefs: assets.styles
        });
      });

      fastify.get("/session", async (_request, reply) => {
        const assets = featureAssets("session");
        reply.type("text/html; charset=utf-8");
        return await renderSession({
          title: "KFC Session",
          sessionsRootLabel: "~/.codex/sessions",
          scriptHrefs: assets.scripts,
          styleHrefs: assets.styles,
          apiBase: "/api/sessions"
        });
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

      return {};
    },
    onBeforeReady: async ({ fastify }) => {
      await startAssets();
      await startFeatures(fastify);
    },
    onAfterListen: async ({ host, port }) => ({
      urls: {
        plan: `http://${host}:${port}/plan`,
        session: `http://${host}:${port}/session`,
        chat: `http://${host}:${port}/chat`
      },
      chatToken: featureHandles?.chat?.token || ""
    }),
    onAfterClose: async () => {
      if (viteServer) {
        await viteServer.close();
      }
    }
  });
}
