import { buildBrowserPageModel } from "../../../kfc-web-runtime/src/browser-entry.js";

export function buildPlanPageModel(options = {}) {
  const { assets, uiMode = "observer", title = "KamiFlow Plan UI" } = options;
  return buildBrowserPageModel({
    title,
    apiBase: "/api",
    assets,
    fallbackStyleHref: "/assets/styles.css",
    fallbackScriptHref: "/assets/app.js",
    importMapOptions: {
      preact: true,
      preactHooks: true,
      jsxRuntime: true,
      signals: true,
      webUi: true,
      lucide: true
    },
    extra: { uiMode }
  });
}
