import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultCssPath = path.join(repoRoot, "packages", "kamiflow-plan-ui", "src", "server", "public", "styles.css");

function normalizeHex(hex) {
  const value = String(hex || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  }
  return null;
}

function parseRgbValue(raw) {
  const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }
  const parts = rgb[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const [rRaw, gRaw, bRaw, aRaw] = parts;
  const r = Number.parseFloat(rRaw);
  const g = Number.parseFloat(gRaw);
  const b = Number.parseFloat(bRaw);
  const a = aRaw == null ? 1 : Number.parseFloat(aRaw);
  if ([r, g, b, a].some((item) => Number.isNaN(item))) {
    return null;
  }
  return { r, g, b, a };
}

function parseColor(value) {
  const normalizedHex = normalizeHex(value);
  if (normalizedHex) {
    return {
      r: Number.parseInt(normalizedHex.slice(1, 3), 16),
      g: Number.parseInt(normalizedHex.slice(3, 5), 16),
      b: Number.parseInt(normalizedHex.slice(5, 7), 16),
      a: 1
    };
  }

  const rgb = parseRgbValue(String(value || "").trim());
  if (rgb) {
    return rgb;
  }

  throw new Error(`Unsupported color format: ${value}`);
}

function compositeOver(bg, fg) {
  if (fg.a >= 1) {
    return { r: fg.r, g: fg.g, b: fg.b };
  }
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a)
  };
}

function srgbChannelToLinear(value) {
  const c = value / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fg, bg) {
  const fgOpaque = compositeOver(bg, fg);
  const bgOpaque = compositeOver({ r: 255, g: 255, b: 255, a: 1 }, bg);
  const l1 = relativeLuminance(fgOpaque);
  const l2 = relativeLuminance(bgOpaque);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function apcaLcAbsolute(fg, bg) {
  const fgOpaque = compositeOver(bg, fg);
  const bgOpaque = compositeOver({ r: 255, g: 255, b: 255, a: 1 }, bg);
  const txtY = relativeLuminance(fgOpaque);
  const bgY = relativeLuminance(bgOpaque);
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scale = 1.14;
  const loOffset = 0.027;

  const txt = txtY > blkThrs ? txtY : txtY + (blkThrs - txtY) ** blkClmp;
  const bgL = bgY > blkThrs ? bgY : bgY + (blkThrs - bgY) ** blkClmp;

  let sapc = 0;
  if (bgL > txt) {
    sapc = (bgL ** 0.56 - txt ** 0.57) * scale;
    if (sapc < 0.1) {
      return 0;
    }
    return Math.abs((sapc - loOffset) * 100);
  }

  sapc = (bgL ** 0.65 - txt ** 0.62) * scale;
  if (sapc > -0.1) {
    return 0;
  }
  return Math.abs((sapc + loOffset) * 100);
}

function parseRootVars(css) {
  const rootMatch = css.match(/:root\s*{([\s\S]*?)}/);
  if (!rootMatch) {
    throw new Error("Missing :root block in styles.css");
  }
  const vars = new Map();
  const regex = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of rootMatch[1].matchAll(regex)) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

function resolveCssVar(vars, name, stack = []) {
  if (stack.includes(name)) {
    throw new Error(`Circular CSS variable reference: ${[...stack, name].join(" -> ")}`);
  }
  const raw = vars.get(name);
  if (!raw) {
    throw new Error(`Missing CSS variable: --${name}`);
  }
  const varRef = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (varRef) {
    return resolveCssVar(vars, varRef[1], [...stack, name]);
  }
  return raw;
}

function format(value) {
  return Number.parseFloat(String(value)).toFixed(2);
}

export async function verifyKfpContrast(cssPath = defaultCssPath) {
  const css = await fs.readFile(cssPath, "utf8");
  const vars = parseRootVars(css);

  const checks = [
    { name: "body-text", fg: "foreground", bg: "background", minRatio: 4.5, minLc: 60 },
    { name: "card-text", fg: "card-foreground", bg: "card", minRatio: 4.5, minLc: 60 },
    { name: "muted-text", fg: "muted-foreground", bg: "muted", minRatio: 4.5, minLc: 75 },
    { name: "primary-button", fg: "primary-foreground", bg: "primary", minRatio: 4.5, minLc: 75 },
    { name: "badge-info", fg: "semantic-info", bg: "semantic-info-soft", minRatio: 4.5, minLc: 75 },
    { name: "badge-success", fg: "semantic-success", bg: "semantic-success-soft", minRatio: 4.5, minLc: 75 },
    { name: "badge-warning", fg: "semantic-warning", bg: "semantic-warning-soft", minRatio: 4.5, minLc: 75 },
    { name: "badge-danger", fg: "semantic-danger", bg: "semantic-danger-soft", minRatio: 4.5, minLc: 75 },
    { name: "timeline-title-current", fg: "foreground", bg: "timeline-current-bg", minRatio: 4.5, minLc: 60 },
    { name: "timeline-hint-current", fg: "timeline-hint-foreground", bg: "timeline-current-bg", minRatio: 4.5, minLc: 75 },
    {
      name: "timeline-hint-upcoming",
      fg: "timeline-hint-foreground",
      bg: "timeline-upcoming-bg",
      minRatio: 4.5,
      minLc: 75
    },
    { name: "timeline-badge-current", fg: "primary-foreground", bg: "primary", minRatio: 4.5, minLc: 75 },
    {
      name: "timeline-badge-done",
      fg: "timeline-badge-done-foreground",
      bg: "semantic-success-soft",
      minRatio: 4.5,
      minLc: 75
    },
    {
      name: "timeline-badge-upcoming",
      fg: "timeline-badge-upcoming-foreground",
      bg: "muted",
      minRatio: 4.5,
      minLc: 75
    },
    { name: "timeline-node-current", fg: "primary-foreground", bg: "timeline-node-current", minRatio: 4.5, minLc: 75 },
    { name: "chip-text", fg: "text-2", bg: "muted", minRatio: 4.5, minLc: 60 },
    { name: "meta-row-text", fg: "text-2", bg: "surface-2", minRatio: 4.5, minLc: 60 },
    { name: "plan-result-title", fg: "text-4", bg: "surface-3", minRatio: 4.5, minLc: 60 }
  ];

  const failures = [];
  for (const item of checks) {
    const fg = parseColor(resolveCssVar(vars, item.fg));
    const bg = parseColor(resolveCssVar(vars, item.bg));
    const ratio = wcagContrastRatio(fg, bg);
    const lc = apcaLcAbsolute(fg, bg);
    if (ratio < item.minRatio || lc < item.minLc) {
      failures.push(
        `${item.name}: ratio=${format(ratio)} (min ${item.minRatio}), Lc=${format(lc)} (min ${item.minLc}), fg=${item.fg}, bg=${item.bg}`
      );
    }
  }

  return { failures, checksCount: checks.length };
}

const isCliEntry = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isCliEntry) {
  const result = await verifyKfpContrast();
  if (result.failures.length) {
    console.error("[kfp-contrast] FAILED");
    for (const line of result.failures) {
      console.error(" - " + line);
    }
    process.exit(1);
  }
  console.log(`[kfp-contrast] OK (${result.checksCount} checks)`);
}
