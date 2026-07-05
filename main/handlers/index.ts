/**
 * Handler Registration
 */

import { ipcMain } from "electron";

import { readState } from "../services/signage-store.js";

export function registerHandlers(): void {
  ipcMain.handle("signage:getState", async () => {
    return await readState();
  });
}
