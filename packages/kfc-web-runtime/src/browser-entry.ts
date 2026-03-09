const COMMON_FONT_LINKS = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "crossorigin" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Work+Sans:wght@400;500;600;700&display=swap"
  }
];

type BrowserAssetHtmlOptions = {
  fontLinks?: Array<{ rel: string; href: string; crossorigin?: string }>;
  styleHrefsNormalized?: string[];
  scriptHrefsNormalized?: string[];
  importMapJson?: string;
};

type ImportMapOptions = {
  preact?: boolean;
  preactHooks?: boolean;
  jsxRuntime?: boolean;
  signals?: boolean;
  webUi?: boolean;
  lucide?: boolean;
};

type BrowserPageModelOptions = {
  title?: string;
  apiBase?: string;
  assets?: { styles?: string[]; scripts?: string[] } | null;
  fallbackStyleHref?: string;
  fallbackScriptHref?: string;
  importMapOptions?: ImportMapOptions | null;
  includeFonts?: boolean;
  extra?: Record<string, unknown>;
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFontLinksHtml(fontLinks) {
  return fontLinks
    .map((link) => {
      const crossorigin = link.crossorigin ? " crossorigin" : "";
      return `<link rel="${escapeHtml(link.rel)}" href="${escapeHtml(link.href)}"${crossorigin} />`;
    })
    .join("\n");
}

function renderStylesheetLinksHtml(styleHrefs) {
  return styleHrefs.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join("\n");
}

function renderImportMapHtml(importMapJson) {
  return importMapJson ? `<script type="importmap">${importMapJson}</script>` : "";
}

function renderModuleScriptsHtml(scriptHrefs) {
  return scriptHrefs.map((href) => `<script src="${escapeHtml(href)}" type="module"></script>`).join("\n");
}

export function buildBrowserAssetHtml(options: BrowserAssetHtmlOptions = {}) {
  const { fontLinks = [], styleHrefsNormalized = [], scriptHrefsNormalized = [], importMapJson = "" } = options;
  const headParts = [
    fontLinks.length > 0 ? renderFontLinksHtml(fontLinks) : "",
    styleHrefsNormalized.length > 0 ? renderStylesheetLinksHtml(styleHrefsNormalized) : "",
    renderImportMapHtml(importMapJson)
  ].filter(Boolean);

  return {
    headAssetHtml: headParts.join("\n"),
    moduleScriptHtml: scriptHrefsNormalized.length > 0 ? renderModuleScriptsHtml(scriptHrefsNormalized) : ""
  };
}

export function buildFontLinks(enabled = true) {
  return enabled ? COMMON_FONT_LINKS.map((item) => ({ ...item })) : [];
}

export function normalizeStyleHrefs(styleHrefs, fallbackHref) {
  const items = Array.isArray(styleHrefs) && styleHrefs.length > 0 ? styleHrefs : fallbackHref ? [fallbackHref] : [];
  return items.filter(Boolean);
}

export function normalizeScriptHrefs(scriptHrefs, fallbackHref) {
  const items = Array.isArray(scriptHrefs) && scriptHrefs.length > 0 ? scriptHrefs : fallbackHref ? [fallbackHref] : [];
  return items.filter(Boolean);
}

export function buildImportMap(options: ImportMapOptions = {}) {
  const imports: Record<string, string> = {};
  if (options.preact) {
    imports.preact = "/assets/vendor/preact.mjs";
  }
  if (options.preactHooks) {
    imports["preact/hooks"] = "/assets/vendor/preact-hooks.mjs";
  }
  if (options.jsxRuntime) {
    imports["preact/jsx-runtime"] = "/assets/vendor/preact-jsx-runtime.mjs";
  }
  if (options.signals) {
    imports["@preact/signals"] = "/assets/vendor/preact-signals.mjs";
    imports["@preact/signals-core"] = "/assets/vendor/preact-signals-core.mjs";
  }
  if (options.webUi) {
    imports["@kamishino/kfc-web-ui"] = "/assets/vendor/kfc-web-ui/index.js";
  }
  if (options.lucide) {
    imports["lucide-preact"] = "/assets/vendor/lucide-preact/lucide-preact.js";
  }
  return Object.keys(imports).length > 0 ? { imports } : null;
}

export function stringifyImportMap(importMap) {
  return importMap ? JSON.stringify(importMap, null, 2) : "";
}

export function buildBrowserPageModel(options: BrowserPageModelOptions = {}) {
  const {
    title,
    apiBase,
    assets = null,
    fallbackStyleHref,
    fallbackScriptHref,
    importMapOptions = null,
    includeFonts = true,
    extra = {}
  } = options;

  const fontLinks = buildFontLinks(includeFonts);
  const styleHrefsNormalized = normalizeStyleHrefs(assets?.styles, fallbackStyleHref);
  const scriptHrefsNormalized = normalizeScriptHrefs(assets?.scripts, fallbackScriptHref);
  const importMapJson = stringifyImportMap(buildImportMap(importMapOptions || {}));
  const assetHtml = buildBrowserAssetHtml({
    fontLinks,
    styleHrefsNormalized,
    scriptHrefsNormalized,
    importMapJson
  });

  return {
    title,
    apiBase,
    fontLinks,
    styleHrefsNormalized,
    scriptHrefsNormalized,
    importMapJson,
    ...assetHtml,
    ...extra
  };
}
