"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  getSignageState: () => import_electron.ipcRenderer.invoke("signage:getState"),
  onSignageChanged: (callback) => {
    const handler = (_event, state) => {
      callback(state);
    };
    import_electron.ipcRenderer.on("signage:changed", handler);
    return () => {
      import_electron.ipcRenderer.removeListener("signage:changed", handler);
    };
  }
});
//# sourceMappingURL=preload.cjs.map
