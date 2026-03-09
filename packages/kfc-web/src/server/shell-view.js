export function shellHtml({ title, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{margin:0;font-family:"Work Sans",system-ui,sans-serif;background:#f7f4ef;color:#1f1a14}.shell{padding:24px;display:grid;gap:24px}.nav{display:flex;gap:12px;flex-wrap:wrap}.nav a{padding:10px 14px;border:1px solid #d8cfc1;border-radius:999px;text-decoration:none;color:#1f1a14;background:#fff}.nav a:hover{border-color:#8d7156}.lede{color:#655646;margin:0}</style></head><body>${body}</body></html>`;
}

export function shellNav(features) {
  return features.map((feature) => `<a href="/${feature.slug}">${feature.navLabel}</a>`).join("");
}
