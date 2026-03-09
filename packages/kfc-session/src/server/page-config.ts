import { buildBrowserPageModel } from "../../../kfc-web-runtime/dist/browser-entry.js";

export function buildSessionPageModel(options: {
  assets?: unknown;
  sessionsRootLabel?: string;
  title?: string;
} = {}) {
  const { assets, sessionsRootLabel = "", title = "KFC Session" } = options;
  return buildBrowserPageModel({
    title,
    apiBase: "/api/sessions",
    assets,
    fallbackStyleHref: "/assets/kfc-session.css",
    fallbackScriptHref: "/assets/kfc-session.js",
    extra: { sessionsRootLabel }
  });
}

