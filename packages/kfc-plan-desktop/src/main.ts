import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import {
  DESKTOP_STATE_DEFAULTS,
  type DesktopState,
  type DesktopTarget,
  type WindowBounds,
  deriveRootFromPlansDir,
  extractHashFromUrl,
  readDesktopState,
  sanitizeDesktopState,
  sanitizeDesktopTarget,
  sanitizeHashRoute,
  sanitizeThemePreference,
  withRecentTarget,
  writeDesktopState
} from "./state-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KFC_PLAN_CREATE_SERVER_MODULE = path.resolve(__dirname, "../../kfc-plan-web/dist/server/create-server.js");
const DESKTOP_STATE_FILENAME = "kfc-plan-desktop-state.json";
const PRELOAD_FILE = path.join(__dirname, "preload.js");
const LAUNCH_CWD = path.resolve(process.cwd());
const TARGET_MODE_ROOT = DESKTOP_STATE_DEFAULTS.TARGET_MODE_ROOT;
const TARGET_MODE_PLANS_DIR = DESKTOP_STATE_DEFAULTS.TARGET_MODE_PLANS_DIR;
const DEFAULT_THEME_PREFERENCE = DESKTOP_STATE_DEFAULTS.DEFAULT_THEME_PREFERENCE;
const WINDOW_DEFAULTS = {
  width: 1440,
  height: 920,
  minWidth: 1024,
  minHeight: 640,
  show: false,
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    preload: PRELOAD_FILE
  }
};

let mainWindow = null;
let kfcPlanServer = null;
let appUrl = "";
let persistedState: DesktopState = sanitizeDesktopState({});
let activeTarget: DesktopTarget | null = null;
let isQuitting = false;
const externalNoticeSeen = new Set();

function currentThemePreference() {
  return sanitizeThemePreference(persistedState.themePreference || DEFAULT_THEME_PREFERENCE);
}

function applyNativeThemePreference(preference) {
  nativeTheme.themeSource = preference === DESKTOP_STATE_DEFAULTS.THEME_SYSTEM ? "system" : preference;
}

function resolvedThemeForPreference(preference) {
  const normalized = sanitizeThemePreference(preference);
  if (normalized === DESKTOP_STATE_DEFAULTS.THEME_DARK) {
    return "dark";
  }
  if (normalized === DESKTOP_STATE_DEFAULTS.THEME_LIGHT) {
    return "light";
  }
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function themeBackgroundColor(theme) {
  return theme === "dark" ? "#08111f" : "#f4f6fb";
}

function currentThemeState() {
  const preference = currentThemePreference();
  return {
    preference,
    resolvedTheme: resolvedThemeForPreference(preference)
  };
}

function updateWindowThemeSurface() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setBackgroundColor(themeBackgroundColor(currentThemeState().resolvedTheme));
}

function broadcastThemeState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("kfc-plan:theme-updated", currentThemeState());
}

async function applyDesktopThemePreference(preference) {
  persistedState = {
    ...persistedState,
    themePreference: sanitizeThemePreference(preference)
  };
  applyNativeThemePreference(currentThemePreference());
  updateWindowThemeSurface();
  refreshMenu();
  await persistCurrentState();
  broadcastThemeState();
  return currentThemeState();
}

function parseArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return "";
  }
  const value = process.argv[idx + 1];
  if (!value || String(value).startsWith("--")) {
    return "";
  }
  return String(value).trim();
}

function resolveTargetFromRuntimeInput() {
  const argProject = parseArgValue("--project");
  const argPlansDir = parseArgValue("--plans-dir");
  const envProject = String(process.env.KFC_PLAN_PROJECT_DIR || "").trim();
  const envPlansDir = String(process.env.KFC_PLAN_PLANS_DIR || "").trim();

  const plansDir = argPlansDir || envPlansDir;
  if (plansDir) {
    const rootDir = argProject || envProject || deriveRootFromPlansDir(plansDir);
    return sanitizeDesktopTarget({
      mode: TARGET_MODE_PLANS_DIR,
      rootDir,
      plansDir
    });
  }

  const projectDir = argProject || envProject;
  if (projectDir) {
    return sanitizeDesktopTarget({
      mode: TARGET_MODE_ROOT,
      rootDir: projectDir
    });
  }

  return null;
}

async function isDirectory(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function describeTarget(target) {
  if (!target) {
    return "(none)";
  }
  if (target.mode === TARGET_MODE_PLANS_DIR && "plansDir" in target) {
    return `plans: ${target.plansDir}`;
  }
  return `root: ${target.rootDir}`;
}

async function validateTarget(target) {
  const normalized = sanitizeDesktopTarget(target);
  if (!normalized) {
    return { ok: false, message: "Invalid folder selection." };
  }

  if (normalized.mode === TARGET_MODE_PLANS_DIR) {
    const plansDir = "plansDir" in normalized ? normalized.plansDir : "";
    const ok = await isDirectory(plansDir);
    if (!ok) {
      return {
        ok: false,
        message: `The selected plans directory does not exist:\n${plansDir}`
      };
    }
    return { ok: true, message: "" };
  }

  const plansDir = path.join(normalized.rootDir, ".local", "plans");
  const ok = await isDirectory(plansDir);
  if (!ok) {
    return {
      ok: false,
      message: `This folder does not contain .local/plans:\n${normalized.rootDir}\n\nPlease choose your project root (or use Open Plans Directory in Advanced mode).`
    };
  }
  return { ok: true, message: "" };
}

function buildServerOptionsForTarget(target) {
  if (target.mode === TARGET_MODE_PLANS_DIR) {
    return {
      projectDir: target.rootDir || deriveRootFromPlansDir(target.plansDir),
      plansDir: target.plansDir,
      donePlansDir: path.join(target.plansDir, "done")
    };
  }
  return {
    projectDir: target.rootDir
  };
}

function isWithin(baseDir, candidateDir) {
  const base = path.resolve(baseDir);
  const candidate = path.resolve(candidateDir);
  if (base.toLowerCase() === candidate.toLowerCase()) {
    return true;
  }
  const relative = path.relative(base, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isExternalTarget(target) {
  if (!target) {
    return false;
  }
  const candidate = target.mode === TARGET_MODE_PLANS_DIR ? target.plansDir : target.rootDir;
  return !isWithin(LAUNCH_CWD, candidate);
}

async function notifyExternalTarget(target) {
  if (!target || !isExternalTarget(target)) {
    return;
  }
  const key = describeTarget(target).toLowerCase();
  if (externalNoticeSeen.has(key)) {
    return;
  }
  externalNoticeSeen.add(key);
  await dialog.showMessageBox({
    type: "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "External Folder",
    message: "You are viewing plans from a folder outside the current project.",
    detail: "This is useful for shared/cross-machine plan storage. Continue only if this is your intended source."
  });
}

async function resolveCreateServer() {
  const candidates = [
    pathToFileURL(KFC_PLAN_CREATE_SERVER_MODULE).href,
    "@kamishino/kfc-plan-web/dist/server/create-server.js"
  ];
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      if (typeof mod.createServer === "function") {
        return mod.createServer;
      }
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("Cannot load KFC Plan server module. Run `npm run -w @kamishino/kfc-plan-web build` first.");
}

async function startEmbeddedServer(target) {
  const createServer = await resolveCreateServer();
  const runtime = buildServerOptionsForTarget(target);
  kfcPlanServer = await createServer({
    projectDir: runtime.projectDir,
    plansDir: runtime.plansDir,
    donePlansDir: runtime.donePlansDir,
    withWatcher: true,
    uiMode: "observer"
  });
  await kfcPlanServer.listen({ host: "127.0.0.1", port: 0 });

  const address = kfcPlanServer.server.address();
  const port = typeof address === "object" && address ? address.port : 4310;
  appUrl = `http://127.0.0.1:${port}`;
}

async function stopEmbeddedServer() {
  if (!kfcPlanServer) {
    return;
  }
  const server = kfcPlanServer;
  kfcPlanServer = null;
  try {
    await server.close();
  } catch {
    // noop: app is quitting anyway
  }
}

function stateFilePath() {
  return path.join(app.getPath("userData"), DESKTOP_STATE_FILENAME);
}

function buildWindowUrl(hash) {
  const url = new URL(appUrl);
  url.searchParams.set("theme_env", "desktop");
  url.searchParams.set("theme_pref", currentThemePreference());
  url.hash = sanitizeHashRoute(hash);
  return url.toString();
}

function restoredWindowOptions() {
  const bounds: WindowBounds = persistedState.windowBounds || {};
  const resolvedTheme = currentThemeState().resolvedTheme;
  return {
    ...WINDOW_DEFAULTS,
    backgroundColor: themeBackgroundColor(resolvedTheme),
    ...(typeof bounds.width === "number" ? { width: bounds.width } : {}),
    ...(typeof bounds.height === "number" ? { height: bounds.height } : {}),
    ...(typeof bounds.x === "number" ? { x: bounds.x } : {}),
    ...(typeof bounds.y === "number" ? { y: bounds.y } : {})
  };
}

async function persistCurrentState() {
  persistedState = sanitizeDesktopState(persistedState);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const currentUrl = mainWindow.webContents.getURL();
    persistedState = {
      ...persistedState,
      lastHash: extractHashFromUrl(currentUrl),
      windowBounds: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      }
    };
  }
  await writeDesktopState(stateFilePath(), persistedState);
}

async function pickTarget(mode) {
  const title =
    mode === TARGET_MODE_PLANS_DIR ? "Select Plans Directory (.local/plans)" : "Select Project Root (must contain .local/plans)";
  const response = await dialog.showOpenDialog({
    title,
    properties: ["openDirectory", "dontAddToRecent"]
  });
  if (response.canceled || !response.filePaths?.[0]) {
    return null;
  }
  const selected = response.filePaths[0];
  if (mode === TARGET_MODE_PLANS_DIR) {
    return sanitizeDesktopTarget({
      mode: TARGET_MODE_PLANS_DIR,
      plansDir: selected,
      rootDir: deriveRootFromPlansDir(selected)
    });
  }
  return sanitizeDesktopTarget({
    mode: TARGET_MODE_ROOT,
    rootDir: selected
  });
}

async function requestValidTarget(mode, initialWarning = "") {
  let warning = initialWarning;
  while (true) {
    if (warning) {
      await dialog.showMessageBox({
        type: "warning",
        buttons: ["Choose Folder"],
        defaultId: 0,
        title: "Folder Check",
        message: warning
      });
    }
    const selected = await pickTarget(mode);
    if (!selected) {
      return null;
    }
    const validation = await validateTarget(selected);
    if (validation.ok) {
      return selected;
    }
    warning = validation.message || "Selected folder is not valid for KFC Plan.";
  }
}

async function resolveInitialTarget() {
  const fromRuntime = resolveTargetFromRuntimeInput();
  if (fromRuntime) {
    const runtimeValidation = await validateTarget(fromRuntime);
    if (runtimeValidation.ok) {
      return fromRuntime;
    }
  }

  const fromState = sanitizeDesktopTarget(persistedState.activeTarget);
  if (fromState) {
    const stateValidation = await validateTarget(fromState);
    if (stateValidation.ok) {
      return fromState;
    }
  }

  return await requestValidTarget(
    TARGET_MODE_ROOT,
    "KFC Plan Desktop needs your project root folder (must contain .local/plans)."
  );
}

function buildRecentMenuItems(): MenuItemConstructorOptions[] {
  const recents = Array.isArray(persistedState.recentTargets) ? persistedState.recentTargets : [];
  if (recents.length === 0) {
    return [{ label: "No recent locations", enabled: false }];
  }
  return recents.map((target, index) => {
    const label =
      target.mode === TARGET_MODE_PLANS_DIR && "plansDir" in target
        ? `Plans: ${target.plansDir}`
        : `Root: ${target.rootDir}`;
    return {
      label: `${index + 1}. ${label}`,
      click: () => {
        void safeApplyTarget(target);
      }
    };
  });
}

function refreshMenu() {
  const themePreference = currentThemePreference();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Project Root...",
          click: () => {
            void chooseAndApplyTarget(TARGET_MODE_ROOT);
          }
        },
        {
          label: "Open Plans Directory (Advanced)...",
          click: () => {
            void chooseAndApplyTarget(TARGET_MODE_PLANS_DIR);
          }
        },
        { type: "separator" },
        {
          label: "Recent Locations",
          submenu: buildRecentMenuItems()
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Appearance",
      submenu: [
        {
          label: "System",
          type: "radio",
          checked: themePreference === DESKTOP_STATE_DEFAULTS.THEME_SYSTEM,
          click: () => {
            void applyDesktopThemePreference(DESKTOP_STATE_DEFAULTS.THEME_SYSTEM);
          }
        },
        {
          label: "Dark",
          type: "radio",
          checked: themePreference === DESKTOP_STATE_DEFAULTS.THEME_DARK,
          click: () => {
            void applyDesktopThemePreference(DESKTOP_STATE_DEFAULTS.THEME_DARK);
          }
        },
        {
          label: "Light",
          type: "radio",
          checked: themePreference === DESKTOP_STATE_DEFAULTS.THEME_LIGHT,
          click: () => {
            void applyDesktopThemePreference(DESKTOP_STATE_DEFAULTS.THEME_LIGHT);
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function chooseAndApplyTarget(mode: string) {
  const target = await requestValidTarget(mode);
  if (!target) {
    return;
  }
  await safeApplyTarget(target);
}

async function safeApplyTarget(target: DesktopTarget) {
  try {
    await applyTarget(target, { showExternalNotice: true });
  } catch (err) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      defaultId: 0,
      title: "Unable to Switch Folder",
      message: err instanceof Error ? err.message : String(err)
    });
  }
}

async function applyTarget(target: DesktopTarget, options: { showExternalNotice?: boolean } = {}) {
  const showExternalNotice = options.showExternalNotice !== false;
  const normalized = sanitizeDesktopTarget(target);
  if (!normalized) {
    throw new Error("Invalid target.");
  }
  const validation = await validateTarget(normalized);
  if (!validation.ok) {
    throw new Error(validation.message || "Invalid target.");
  }

  const activeHash =
    mainWindow && !mainWindow.isDestroyed() ? extractHashFromUrl(mainWindow.webContents.getURL()) : persistedState.lastHash;
  const hash = sanitizeHashRoute(activeHash);

  persistedState = withRecentTarget(persistedState, normalized);
  persistedState.lastHash = hash;
  activeTarget = normalized;

  await stopEmbeddedServer();
  await startEmbeddedServer(normalized);

  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(buildWindowUrl(hash));
    updateWindowThemeSurface();
    mainWindow.show();
  }

  refreshMenu();
  await persistCurrentState();
  if (showExternalNotice) {
    await notifyExternalTarget(normalized);
  }
}

async function createMainWindow() {
  if (!appUrl) {
    if (!activeTarget) {
      return;
    }
    await startEmbeddedServer(activeTarget);
  }

  mainWindow = new BrowserWindow(restoredWindowOptions());
  const loadTarget = buildWindowUrl(sanitizeHashRoute(persistedState.lastHash));
  await mainWindow.loadURL(loadTarget);
  updateWindowThemeSurface();
  mainWindow.show();

  const syncRouteState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    persistedState.lastHash = extractHashFromUrl(mainWindow.webContents.getURL());
  };

  mainWindow.webContents.on("did-navigate", syncRouteState);
  mainWindow.webContents.on("did-navigate-in-page", syncRouteState);
  mainWindow.on("resize", syncRouteState);
  mainWindow.on("move", syncRouteState);
  mainWindow.on("close", () => {
    if (!isQuitting) {
      void persistCurrentState();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  persistedState = await readDesktopState(stateFilePath());
  applyNativeThemePreference(currentThemePreference());
  activeTarget = await resolveInitialTarget();
  if (!activeTarget) {
    app.quit();
    return;
  }
  persistedState = withRecentTarget(persistedState, activeTarget);
  refreshMenu();
  await startEmbeddedServer(activeTarget);
  await createMainWindow();
  await notifyExternalTarget(activeTarget);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  ipcMain.handle("kfc-plan:theme:get", async () => {
    return currentThemeState();
  });
  ipcMain.handle("kfc-plan:theme:set", async (_event, preference) => {
    return await applyDesktopThemePreference(preference);
  });
  nativeTheme.on("updated", () => {
    updateWindowThemeSurface();
    broadcastThemeState();
    refreshMenu();
  });

  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.show();
  });

  app.whenReady().then(() => {
    void bootstrap();
  });

  app.on("activate", () => {
    if (!mainWindow) {
      void createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("will-quit", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    isQuitting = true;
    void persistCurrentState()
      .then(() => stopEmbeddedServer())
      .finally(() => {
        app.quit();
      });
  });
}

