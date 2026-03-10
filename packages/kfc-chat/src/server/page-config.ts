import { buildFeaturePageModel } from "../../../kfc-web-runtime/dist/browser-entry.js";

const CHAT_PAGE_DEFINITION = {
  defaultTitle: "KFC Chat",
  apiBase: "/api/chat",
  fallbackStyleHref: "/assets/kfc-chat.css",
  fallbackScriptHref: "/assets/kfc-chat.js",
  importMapOptions: {
    preact: true,
    jsxRuntime: true,
    signals: true,
    webUi: true
  }
} as const;

export function buildChatPageModel(options: {
  assets?: unknown;
  projectName?: string;
  projectDir?: string;
  title?: string;
}) {
  const { assets, projectName, projectDir, title = "KFC Chat" } = options;
  return buildFeaturePageModel(CHAT_PAGE_DEFINITION, {
    title,
    assets,
    extra: {
      projectName,
      projectDir,
      wsPath: "/ws"
    }
  });
}

