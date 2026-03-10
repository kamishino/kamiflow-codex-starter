import { buildFeaturePageModel } from "../../../kfc-web-runtime/dist/browser-entry.js";

const SESSION_PAGE_DEFINITION = {
  defaultTitle: "KFC Session",
  apiBase: "/api/sessions",
  fallbackStyleHref: "/assets/kfc-session.css",
  fallbackScriptHref: "/assets/kfc-session.js"
} as const;

export function buildSessionPageModel(options: {
  assets?: unknown;
  sessionsRootLabel?: string;
  title?: string;
} = {}) {
  const { assets, sessionsRootLabel = "", title = "KFC Session" } = options;
  return buildFeaturePageModel(SESSION_PAGE_DEFINITION, {
    title,
    assets,
    extra: { sessionsRootLabel }
  });
}

