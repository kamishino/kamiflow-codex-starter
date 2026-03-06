import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_HASH = "#/";
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;

export function sanitizeHashRoute(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("#/")) {
    return DEFAULT_HASH;
  }
  if (text.includes(" ")) {
    return DEFAULT_HASH;
  }
  return text;
}

export function normalizeWindowBounds(input) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  const width = Number(source.width);
  const height = Number(source.height);
  const x = Number(source.x);
  const y = Number(source.y);

  if (Number.isFinite(width) && width >= MIN_WIDTH) {
    out.width = Math.round(width);
  }
  if (Number.isFinite(height) && height >= MIN_HEIGHT) {
    out.height = Math.round(height);
  }
  if (Number.isFinite(x)) {
    out.x = Math.round(x);
  }
  if (Number.isFinite(y)) {
    out.y = Math.round(y);
  }
  return out;
}

export function sanitizeDesktopState(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    lastHash: sanitizeHashRoute(source.lastHash),
    windowBounds: normalizeWindowBounds(source.windowBounds)
  };
}

export async function readDesktopState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return sanitizeDesktopState(JSON.parse(raw));
  } catch {
    return sanitizeDesktopState({});
  }
}

export async function writeDesktopState(filePath, state) {
  const sanitized = sanitizeDesktopState(state);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), "utf8");
  return sanitized;
}

export function extractHashFromUrl(urlText) {
  const url = String(urlText || "");
  const idx = url.indexOf("#");
  if (idx === -1) {
    return DEFAULT_HASH;
  }
  return sanitizeHashRoute(url.slice(idx));
}

export const DESKTOP_STATE_DEFAULTS = {
  DEFAULT_HASH,
  MIN_WIDTH,
  MIN_HEIGHT
};
