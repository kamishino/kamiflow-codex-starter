import { buildBrowserPageModel } from "../../../kfc-web-runtime/dist/browser-entry.js";

export function buildSessionPageModel(options = {}) {
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

