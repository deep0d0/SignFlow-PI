import { contextBridge, ipcRenderer } from "electron";

import type { SignageState } from "../main/services/signage-store.js";

contextBridge.exposeInMainWorld("electronAPI", {
  getSignageState: (): Promise<SignageState> => ipcRenderer.invoke("signage:getState"),
  onSignageChanged: (callback: (state: SignageState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SignageState) => {
      callback(state);
    };
    ipcRenderer.on("signage:changed", handler);
    return () => {
      ipcRenderer.removeListener("signage:changed", handler);
    };
  },
});
