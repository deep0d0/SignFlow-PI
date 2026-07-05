/// <reference types="vite/client" />

import type { SignageState } from "../main/services/signage-store";

export interface ElectronAPI {
  getSignageState: () => Promise<SignageState>;
  onSignageChanged: (callback: (state: SignageState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
