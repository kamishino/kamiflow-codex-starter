import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kfcPlanDesktopTheme", {
  isDesktop: true,
  getThemeState: () => ipcRenderer.invoke("kfc-plan:theme:get"),
  setThemePreference: (preference) => ipcRenderer.invoke("kfc-plan:theme:set", preference),
  onThemeChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on("kfc-plan:theme-updated", handler);
    return () => {
      ipcRenderer.removeListener("kfc-plan:theme-updated", handler);
    };
  }
});

