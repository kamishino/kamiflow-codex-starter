import { buildFeaturePageModel } from "../../../kfc-web-runtime/dist/browser-entry.js";

const PLAN_PAGE_DEFINITION = {
  defaultTitle: "KamiFlow Plan UI",
  apiBase: "/api",
  fallbackStyleHref: "/assets/styles.css",
  fallbackScriptHref: "/assets/app.js",
  importMapOptions: {
    preact: true,
    preactHooks: true,
    jsxRuntime: true,
    signals: true,
    webUi: true,
    lucide: true
  }
} as const;

export function buildPlanPageModel(options: {
  assets?: unknown;
  uiMode?: string;
  title?: string;
} = {}) {
  const { assets, uiMode = "observer", title = "KamiFlow Plan UI" } = options;
  return buildFeaturePageModel(PLAN_PAGE_DEFINITION, {
    title,
    assets,
    extra: { uiMode }
  });
}

