import path from "node:path";
import { createTemplateRenderer } from "./template-render.js";
import {
  buildFontLinks,
  buildImportMap,
  normalizeScriptHrefs,
  normalizeStyleHrefs,
  stringifyImportMap
} from "../../../kfc-web-runtime/src/browser-entry.js";

function projectNameFromDir(projectDir) {
  return path.basename(projectDir) || "Project";
}

export function createFeatureDefinitions(context) {
  return [
    {
      key: "plan",
      slug: "plan",
      navLabel: "Plan",
      entryName: "plan",
      render: context.renderPlan,
      buildViewModel: ({ assets }) => ({
        title: "KamiFlow Plan Review",
        uiMode: "observer",
        apiBase: "/api",
        fontLinks: buildFontLinks(true),
        scriptHrefsNormalized: normalizeScriptHrefs(assets.scripts, "/assets/app.js"),
        styleHrefsNormalized: normalizeStyleHrefs(assets.styles, "/assets/styles.css"),
        importMapJson: stringifyImportMap(
          buildImportMap({
            preact: true,
            preactHooks: true,
            jsxRuntime: true,
            signals: true,
            webUi: true,
            lucide: true
          })
        )
      }),
      mount: (implementations, fastify) =>
        implementations.plan(fastify, {
          projectDir: context.projectDir,
          uiMode: "observer",
          mountUi: false,
          workspaceName: "KFC Web"
        })
    },
    {
      key: "session",
      slug: "session",
      navLabel: "Session",
      entryName: "session",
      render: context.renderSession,
      buildViewModel: ({ assets }) => ({
        title: "KFC Session",
        sessionsRootLabel: "~/.codex/sessions",
        fontLinks: buildFontLinks(true),
        scriptHrefsNormalized: normalizeScriptHrefs(assets.scripts, "/assets/kfc-session.js"),
        styleHrefsNormalized: normalizeStyleHrefs(assets.styles, "/assets/kfc-session.css"),
        apiBase: "/api/sessions"
      }),
      mount: (implementations, fastify) =>
        implementations.session(fastify, {
          mountUi: false,
          mountHealth: false,
          sessionsRoot: context.sessionsRoot
        })
    },
    {
      key: "chat",
      slug: "chat",
      navLabel: "Chat",
      entryName: "chat",
      render: context.renderChat,
      buildViewModel: ({ assets }) => ({
        title: "KFC Chat",
        projectName: projectNameFromDir(context.projectDir),
        projectDir: context.projectDir,
        apiBase: "/api/chat",
        wsPath: "/ws",
        fontLinks: buildFontLinks(true),
        scriptHrefsNormalized: normalizeScriptHrefs(assets.scripts, "/assets/kfc-chat.js"),
        styleHrefsNormalized: normalizeStyleHrefs(assets.styles, "/assets/kfc-chat.css"),
        importMapJson: stringifyImportMap(
          buildImportMap({
            preact: true,
            jsxRuntime: true,
            signals: true,
            webUi: true
          })
        )
      }),
      mount: (implementations, fastify) =>
        implementations.chat(fastify, {
          projectDir: context.projectDir,
          projectName: projectNameFromDir(context.projectDir),
          host: context.host,
          port: context.port,
          mountUi: false
        })
    }
  ];
}

export function createFeatureContext({ repoRoot, projectDir, sessionsRoot, host, port }) {
  return {
    projectDir,
    sessionsRoot,
    host,
    port,
    renderPlan: createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-plan-web", "src", "server", "views", "index.eta")),
    renderChat: createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-chat", "src", "server", "views", "index.eta")),
    renderSession: createTemplateRenderer(path.resolve(repoRoot, "packages", "kfc-session", "src", "server", "views", "index.eta"))
  };
}

export function registerFeaturePages(fastify, features, featureAssets) {
  for (const feature of features) {
    fastify.get(`/${feature.slug}`, async (_request, reply) => {
      const assets = featureAssets(feature.entryName);
      reply.type("text/html; charset=utf-8");
      return await feature.render(feature.buildViewModel({ assets }));
    });
  }
}
