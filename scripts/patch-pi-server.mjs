/**
 * Ensures main/pi-server.ts is safe to bundle as CJS (no top-level await).
 * Older SignFlow-PI commits used top-level await, which esbuild rejects for .cjs output.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "main", "pi-server.ts");

const FIXED = `/**
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
`;

let src = "";
try {
  src = fs.readFileSync(target, "utf8");
} catch {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, FIXED);
  console.log("[signflow] Wrote main/pi-server.ts");
}

const hasTopLevelAwait = /^\s*await\s+startConfigServer\s*\(/m.test(src);
const hasMainWrapper = /async function main\s*\(/.test(src);

if (hasTopLevelAwait && !hasMainWrapper) {
  fs.writeFileSync(target, FIXED);
  console.log("[signflow] Patched main/pi-server.ts (removed top-level await)");
} else if (!hasMainWrapper && src.includes("startConfigServer")) {
  fs.writeFileSync(target, FIXED);
  console.log("[signflow] Normalized main/pi-server.ts");
}
