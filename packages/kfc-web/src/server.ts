import path from "node:path";
import { createServer as createViteServer } from "vite";
import { createServer as createNetServer } from "node:net";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";
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
  portStrategy?: "fail" | "next";
  portScanLimit?: number;
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

type PortResolutionOptions = {
  host: string;
  requested: number;
  role: string;
  strategy: "fail" | "next";
  avoidPorts?: Set<number>;
  maxAttempts?: number;
};

const DEFAULT_PORT_ATTEMPTS = 20;

function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    let settled = false;
    const finalize = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        finalize(false);
        return;
      }
      finalize(false);
    });

    server.once("listening", () => {
      server.close(() => finalize(true));
    });

    server.listen({ host, port });
  });
}

async function resolvePort(options: PortResolutionOptions): Promise<number> {
  const {
    host,
    requested,
    role,
    strategy,
    avoidPorts = new Set<number>(),
    maxAttempts = DEFAULT_PORT_ATTEMPTS
  } = options;

  if (strategy === "fail") {
    if (avoidPorts.has(requested)) {
      throw new Error(`[kfc-web] ${role} port ${requested} is unavailable (${host}).`);
    }

    const available = await isPortAvailable(host, requested);
    if (!available) {
      throw new Error(`[kfc-web] ${role} port ${requested} is already in use on ${host}. Use --port-strategy next to auto-select a free port.`);
    }

    return requested;
  }

  let selected = -1;
  for (let offset = 0; offset <= maxAttempts; offset += 1) {
    const candidate = requested + offset;
    if (candidate > 65535) {
      break;
    }
    if (avoidPorts.has(candidate)) {
      continue;
    }
    const available = await isPortAvailable(host, candidate);
    if (available) {
      selected = candidate;
      if (offset > 0) {
        console.log(`[kfc-web] ${role} port ${requested} is already in use. Switched to ${candidate}.`);
      }
      return selected;
    }
  }

  throw new Error(`[kfc-web] No available ${role} port found from ${requested} within +${maxAttempts} attempts on ${host}.`);
}

export async function createKfcWebServer(options: KfcWebServerOptions) {
  const mode = options.mode === "dev" ? "dev" : "serve";
  const host = String(options.host || "127.0.0.1");
  const requestedPort = Number(options.port || 4300);
  const requestedVitePort = Number(options.vitePort || 5174);
  const portStrategy = String(options.portStrategy || "next") as "fail" | "next";
  const portScanLimit = Number(options.portScanLimit || DEFAULT_PORT_ATTEMPTS);
  const projectDir = await detectProjectRoot(path.resolve(options.projectDir || process.cwd()));
  const focus = String(options.focus || "").trim().toLowerCase();
  const packageDir = options.packageDir;
  const repoRoot = resolveRepoRoot(packageDir);
  const workspaceRoot = path.resolve(packageDir, "..");
  let viteServer = null;
  let manifest = options.manifestOverride || null;
  let featureHandles = null;

  const port = requestedPort > 0 ? await resolvePort({
    host,
    requested: requestedPort,
    role: "Shell",
    strategy: portStrategy,
    maxAttempts: portScanLimit
  }) : 0;
  const vitePort = requestedVitePort > 0 ? await resolvePort({
    host,
    requested: requestedVitePort,
    role: "Vite",
    strategy: portStrategy,
    avoidPorts: new Set([port]),
    maxAttempts: portScanLimit
  }) : 0;

  if (requestedPort > 0) {
    console.log(`[kfc-web] Shell port requested: ${requestedPort}, resolved: ${port}.`);
  }
  if (requestedVitePort > 0) {
    console.log(`[kfc-web] Vite port requested: ${requestedVitePort}, resolved: ${vitePort}.`);
  }

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
        configFile: false,
        root: packageDir,
        server: {
          host,
          port: vitePort,
          strictPort: true,
          fs: {
            allow: [workspaceRoot]
          }
        }
      });
      await viteServer.listen();
      return;
    }
    if (!manifest) {
      manifest = await loadManifest(packageDir);
    }
  }

  function featureAssets(name: string, request?: any) {
    return mode === "dev" ? devAssetSet(vitePort, name, request) : assetSetFromManifest(manifest, name);
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
        chat: featureHandles?.chat?.token
          ? `http://${host}:${port}/chat?token=${encodeURIComponent(String(featureHandles?.chat?.token || ""))}`
          : `http://${host}:${port}/chat`
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

