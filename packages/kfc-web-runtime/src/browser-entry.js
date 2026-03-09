const COMMON_FONT_LINKS = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "crossorigin" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Work+Sans:wght@400;500;600;700&display=swap"
  }
];

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

export function buildImportMap(options = {}) {
  const imports = {};
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
