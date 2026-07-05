/**
 * Standalone SignFlow server for Raspberry Pi (no Electron).
 * Serves the config UI, display viewer, API, and assets on port 8773.
 */

import { startConfigServer } from "./services/config-server.js";

async function main(): Promise<void> {
  console.log("[signflow] Starting Pi server…");
  await startConfigServer();
}

main().catch((err) => {
  console.error("[signflow] Fatal error:", err);
  process.exit(1);
});
