import path from "node:path";
import { createServer as createViteServer } from "vite";
import { createFeatureServer } from "../../kfc-web-runtime/dist/feature-server.js";
import { assetSetFromManifest, devAssetSet, loadManifest, sendBuiltAsset } from "./server/assets.js";
import { loadBuiltInFeatureImplementations } from "./server/feature-implementations.js";
import { createFeatureContext, createFeatureDefinitions, registerFeaturePages } from "./server/features.js";
import { shellHtml, shellNav } from "./server/shell-view.js";

type KfcWebServerOptions = {
  mode?: string;
  host?: string;
  port?: number;
  vitePort?: number;
  projectDir?: string;
  focus?: string;
  packageDir: string;
  manifestOverride?: unknown;
  sessionsRoot?: string;
  skipVite?: boolean;
  featureImplementations?: unknown;
};

function resolveRepoRoot(packageDir: string) {
  return path.resolve(packageDir, "..", "..");
}

export async function createKfcWebServer(options: KfcWebServerOptions) {
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
  const featureContext = createFeatureContext({
    repoRoot,
    projectDir,
    sessionsRoot: options.sessionsRoot,
    host,
    port
  });
  const features = createFeatureDefinitions(featureContext);
  const featureBySlug = new Map(features.map((feature) => [feature.slug, feature]));

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

  function featureAssets(name: string) {
    return mode === "dev" ? devAssetSet(vitePort, name) : assetSetFromManifest(manifest, name);
  }

  async function startFeatures(fastify: any) {
    const implementations = options.featureImplementations || await loadBuiltInFeatureImplementations(repoRoot);
    featureHandles = Object.fromEntries(
      await Promise.all(
        features.map(async (feature) => [feature.key, await feature.mount(implementations, fastify)])
      )
    );
  }

  return await createFeatureServer({
    host,
    port,
    setup: async (fastify) => {
      fastify.get("/", async (_request: any, reply: any) => {
        if (featureBySlug.has(focus)) {
          return reply.redirect(`/${focus}`);
        }
        return reply.type("text/html; charset=utf-8").send(shellHtml({
          title: "KFC Web",
          body: `<div class="shell"><div><h1>KFC Web</h1><p class="lede">Unified KFC web shell for plan, session, and chat.</p></div><nav class="nav">${shellNav(features)}</nav></div>`
        }));
      });
      registerFeaturePages(fastify, features, featureAssets);

      if (mode === "serve") {
        fastify.get("/assets/*", async (request: any, reply: any) => {
          const rel = String(request.params["*"] || "");
          return await sendBuiltAsset(reply, packageDir, rel);
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

