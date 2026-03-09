import { buildBrowserPageModel } from "../../../kfc-web-runtime/src/browser-entry.js";

export function buildChatPageModel(options) {
  const { assets, projectName, projectDir, title = "KFC Chat" } = options;
  return buildBrowserPageModel({
    title,
    apiBase: "/api/chat",
    assets,
    fallbackStyleHref: "/assets/kfc-chat.css",
    fallbackScriptHref: "/assets/kfc-chat.js",
    importMapOptions: {
      preact: true,
      jsxRuntime: true,
      signals: true,
      webUi: true
    },
    extra: {
      projectName,
      projectDir,
      wsPath: "/ws"
    }
  });
}
