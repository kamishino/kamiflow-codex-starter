import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_HASH = "#/";
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const MAX_RECENT_TARGETS = 8;
const TARGET_MODE_ROOT = "root";
const TARGET_MODE_PLANS_DIR = "plans_dir";
const THEME_SYSTEM = "system";
const THEME_LIGHT = "light";
const THEME_DARK = "dark";
const DEFAULT_THEME_PREFERENCE = THEME_SYSTEM;

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

export function sanitizeThemePreference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === THEME_LIGHT || normalized === THEME_DARK || normalized === THEME_SYSTEM) {
    return normalized;
  }
  return DEFAULT_THEME_PREFERENCE;
}

function normalizeDirectoryPath(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return "";
  }
  return path.resolve(raw);
}

export function deriveRootFromPlansDir(plansDir) {
  const normalized = normalizeDirectoryPath(plansDir);
  if (!normalized) {
    return "";
  }
  const parent = path.dirname(normalized);
  if (path.basename(normalized).toLowerCase() === "plans" && path.basename(parent).toLowerCase() === ".local") {
    return path.dirname(parent);
  }
  return parent;
}

export function targetKey(target) {
  if (!target || typeof target !== "object") {
    return "";
  }
  if (target.mode === TARGET_MODE_PLANS_DIR) {
    return `${TARGET_MODE_PLANS_DIR}:${target.plansDir || ""}`.toLowerCase();
  }
  if (target.mode === TARGET_MODE_ROOT) {
    return `${TARGET_MODE_ROOT}:${target.rootDir || ""}`.toLowerCase();
  }
  return "";
}

export function sanitizeDesktopTarget(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const source = input;
  const rawMode = String(source.mode || "").trim().toLowerCase();
  const mode = rawMode === TARGET_MODE_PLANS_DIR || rawMode === "plans-dir" ? TARGET_MODE_PLANS_DIR : TARGET_MODE_ROOT;

  if (mode === TARGET_MODE_PLANS_DIR) {
    const plansDir = normalizeDirectoryPath(source.plansDir || source.plans_dir);
    if (!plansDir) {
      return null;
    }
    const rootDir = normalizeDirectoryPath(source.rootDir || source.root_dir) || deriveRootFromPlansDir(plansDir);
    return {
      mode: TARGET_MODE_PLANS_DIR,
      rootDir,
      plansDir
    };
  }

  const rootDir = normalizeDirectoryPath(source.rootDir || source.root_dir);
  if (!rootDir) {
    return null;
  }
  return {
    mode: TARGET_MODE_ROOT,
    rootDir
  };
}

function sanitizeRecentTargets(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const target = sanitizeDesktopTarget(item);
    if (!target) {
      continue;
    }
    const key = targetKey(target);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(target);
    if (out.length >= MAX_RECENT_TARGETS) {
      break;
    }
  }
  return out;
}

export function withRecentTarget(state, target) {
  const normalizedTarget = sanitizeDesktopTarget(target);
  if (!normalizedTarget) {
    return sanitizeDesktopState(state);
  }
  const next = sanitizeDesktopState(state);
  const key = targetKey(normalizedTarget);
  next.activeTarget = normalizedTarget;
  next.recentTargets = [normalizedTarget, ...next.recentTargets.filter((item) => targetKey(item) !== key)].slice(
    0,
    MAX_RECENT_TARGETS
  );
  return next;
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
    windowBounds: normalizeWindowBounds(source.windowBounds),
    activeTarget: sanitizeDesktopTarget(source.activeTarget),
    recentTargets: sanitizeRecentTargets(source.recentTargets),
    themePreference: sanitizeThemePreference(source.themePreference)
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
  MIN_HEIGHT,
  MAX_RECENT_TARGETS,
  TARGET_MODE_ROOT,
  TARGET_MODE_PLANS_DIR,
  THEME_SYSTEM,
  THEME_LIGHT,
  THEME_DARK,
  DEFAULT_THEME_PREFERENCE
};
