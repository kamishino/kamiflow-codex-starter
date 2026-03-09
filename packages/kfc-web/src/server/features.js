import path from "node:path";
import { createTemplateRenderer } from "./template-render.js";
import { buildPlanPageModel } from "../../../kfc-plan-web/src/server/page-config.js";
import { buildChatPageModel } from "../../../kfc-chat/src/server/page-config.js";
import { buildSessionPageModel } from "../../../kfc-session/src/server/page-config.js";

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
      buildViewModel: ({ assets }) => buildPlanPageModel({ assets, uiMode: "observer", title: "KamiFlow Plan Review" }),
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
      buildViewModel: ({ assets }) => buildSessionPageModel({ assets, sessionsRootLabel: "~/.codex/sessions" }),
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
      buildViewModel: ({ assets }) =>
        buildChatPageModel({
          assets,
          projectName: projectNameFromDir(context.projectDir),
          projectDir: context.projectDir
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
