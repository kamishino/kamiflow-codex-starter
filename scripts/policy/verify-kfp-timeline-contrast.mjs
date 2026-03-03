import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultCssPath = path.join(repoRoot, "packages", "kamiflow-plan-ui", "src", "server", "public", "styles.css");

function normalizeHex(hex) {
  const value = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  }
  throw new Error(`Unsupported color format: ${hex}`);
}

function parseHex(hex) {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function srgbChannelToLinear(value) {
  const c = value / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function apcaLcAbsolute(fgHex, bgHex) {
  const txtY = relativeLuminance(fgHex);
  const bgY = relativeLuminance(bgHex);
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scale = 1.14;
  const loOffset = 0.027;

  const txt = txtY > blkThrs ? txtY : txtY + (blkThrs - txtY) ** blkClmp;
  const bg = bgY > blkThrs ? bgY : bgY + (blkThrs - bgY) ** blkClmp;

  let sapc = 0;
  if (bg > txt) {
    sapc = (bg ** 0.56 - txt ** 0.57) * scale;
    if (sapc < 0.1) {
      return 0;
    }
    return Math.abs((sapc - loOffset) * 100);
  }

  sapc = (bg ** 0.65 - txt ** 0.62) * scale;
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
  if (!vars.has(name)) {
    throw new Error(`Missing CSS variable: --${name}`);
  }

  const raw = vars.get(name).trim();
  const varRef = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (varRef) {
    return resolveCssVar(vars, varRef[1], [...stack, name]);
  }
  return normalizeHex(raw);
}

function format(value) {
  return Number.parseFloat(String(value)).toFixed(2);
}

export async function verifyKfpTimelineContrast(cssPath = defaultCssPath) {
  const css = await fs.readFile(cssPath, "utf8");
  const vars = parseRootVars(css);

  const checks = [
    {
      name: "timeline-title-current",
      fg: "foreground",
      bg: "timeline-current-bg",
      minRatio: 4.5,
      minLc: 60
    },
    {
      name: "timeline-hint-current",
      fg: "timeline-hint-foreground",
      bg: "timeline-current-bg",
      minRatio: 4.5,
      minLc: 75
    },
    {
      name: "timeline-hint-upcoming",
      fg: "timeline-hint-foreground",
      bg: "timeline-upcoming-bg",
      minRatio: 4.5,
      minLc: 75
    },
    {
      name: "timeline-badge-current",
      fg: "primary-foreground",
      bg: "primary",
      minRatio: 4.5,
      minLc: 75
    },
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
    {
      name: "timeline-node-current",
      fg: "primary-foreground",
      bg: "timeline-node-current",
      minRatio: 4.5,
      minLc: 75
    }
  ];

  const failures = [];
  for (const item of checks) {
    const fg = resolveCssVar(vars, item.fg);
    const bg = resolveCssVar(vars, item.bg);
    const ratio = wcagContrastRatio(fg, bg);
    const lc = apcaLcAbsolute(fg, bg);
    const ratioOk = ratio >= item.minRatio;
    const lcOk = lc >= item.minLc;
    if (!ratioOk || !lcOk) {
      failures.push(
        `${item.name}: ratio=${format(ratio)} (min ${item.minRatio}), Lc=${format(lc)} (min ${item.minLc}), fg=${fg}, bg=${bg}`
      );
    }
  }

  return { failures, checksCount: checks.length };
}

const isCliEntry = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isCliEntry) {
  const result = await verifyKfpTimelineContrast();
  if (result.failures.length) {
    console.error("[kfp-timeline-contrast] FAILED");
    for (const line of result.failures) {
      console.error(" - " + line);
    }
    process.exit(1);
  }

  console.log(`[kfp-timeline-contrast] OK (${result.checksCount} checks)`);
}
