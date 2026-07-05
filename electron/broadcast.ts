import { BrowserWindow } from "electron";

import { broadcastSignageChanged as emitSignageChanged } from "../main/services/signage-events.js";
import type { SignageState } from "../main/services/signage-store.js";

/** Push updated signage state to SSE clients and every open display window. */
export function broadcastSignageChanged(state: SignageState): void {
  emitSignageChanged(state);

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("signage:changed", state);
    }
  }
}
