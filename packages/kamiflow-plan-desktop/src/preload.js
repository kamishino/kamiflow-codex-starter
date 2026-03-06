import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kfpDesktopTheme", {
  isDesktop: true,
  getThemeState: () => ipcRenderer.invoke("kfp:theme:get"),
  setThemePreference: (preference) => ipcRenderer.invoke("kfp:theme:set", preference),
  onThemeChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on("kfp:theme-updated", handler);
    return () => {
      ipcRenderer.removeListener("kfp:theme-updated", handler);
    };
  }
});
