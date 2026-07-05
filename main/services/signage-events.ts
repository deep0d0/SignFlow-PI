import { EventEmitter } from "node:events";

import type { SignageState } from "./signage-store.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

/** Notify all listeners (SSE clients, Electron windows) that signage changed. */
export function broadcastSignageChanged(state: SignageState): void {
  emitter.emit("changed", state);
}

export function onSignageChanged(listener: (state: SignageState) => void): () => void {
  emitter.on("changed", listener);
  return () => {
    emitter.off("changed", listener);
  };
}
