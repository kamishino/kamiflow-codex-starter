import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";
import { extractHashFromUrl, readDesktopState, sanitizeHashRoute, writeDesktopState } from "./state-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KFP_CREATE_SERVER_MODULE = path.resolve(__dirname, "../../kamiflow-plan-ui/dist/server/create-server.js");
const DESKTOP_STATE_FILENAME = "kfp-desktop-state.json";
const WINDOW_DEFAULTS = {
  width: 1440,
  height: 920,
  minWidth: 1024,
  minHeight: 640,
  show: false,
  backgroundColor: "#f4f6fb",
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false
  }
};

const projectDir = path.resolve(process.env.KFP_PROJECT_DIR || process.cwd());

let mainWindow = null;
let kfpServer = null;
let appUrl = "";
let persistedState = { lastHash: "#/", windowBounds: {} };
let isQuitting = false;

async function resolveCreateServer() {
  const candidates = [
    pathToFileURL(KFP_CREATE_SERVER_MODULE).href,
    "@kamishino/kamiflow-plan-ui/dist/server/create-server.js"
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
  throw new Error("Cannot load KFP server module. Run `npm run -w @kamishino/kamiflow-plan-ui build` first.");
}

async function startEmbeddedServer() {
  const createServer = await resolveCreateServer();
  kfpServer = await createServer({
    projectDir,
    withWatcher: true,
    uiMode: "observer"
  });
  await kfpServer.listen({ host: "127.0.0.1", port: 0 });

  const address = kfpServer.server.address();
  const port = typeof address === "object" && address ? address.port : 4310;
  appUrl = `http://127.0.0.1:${port}`;
}

async function stopEmbeddedServer() {
  if (!kfpServer) {
    return;
  }
  const server = kfpServer;
  kfpServer = null;
  try {
    await server.close();
  } catch {
    // noop: app is quitting anyway
  }
}

function stateFilePath() {
  return path.join(app.getPath("userData"), DESKTOP_STATE_FILENAME);
}

function restoredWindowOptions() {
  const bounds = persistedState.windowBounds || {};
  return {
    ...WINDOW_DEFAULTS,
    ...(typeof bounds.width === "number" ? { width: bounds.width } : {}),
    ...(typeof bounds.height === "number" ? { height: bounds.height } : {}),
    ...(typeof bounds.x === "number" ? { x: bounds.x } : {}),
    ...(typeof bounds.y === "number" ? { y: bounds.y } : {})
  };
}

async function persistCurrentState() {
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

async function createMainWindow() {
  if (!appUrl) {
    await startEmbeddedServer();
  }

  mainWindow = new BrowserWindow(restoredWindowOptions());
  const loadTarget = `${appUrl}${sanitizeHashRoute(persistedState.lastHash)}`;
  await mainWindow.loadURL(loadTarget);
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
  await startEmbeddedServer();
  await createMainWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
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
