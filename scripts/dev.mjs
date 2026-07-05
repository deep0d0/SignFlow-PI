import { spawn } from "node:child_process";
import { createServer } from "vite";

import { buildElectron } from "./build-electron.mjs";

await buildElectron();

const vite = await createServer({
  configFile: "vite.config.ts",
  server: {
    port: 5173,
    strictPort: true,
  },
});

await vite.listen();
const devServerUrl = `http://localhost:${vite.config.server.port}`;
console.log(`[signflow] Renderer dev server: ${devServerUrl}`);

const electronEnv = { ...process.env, VITE_DEV_SERVER_URL: devServerUrl };
delete electronEnv.ELECTRON_RUN_AS_NODE;

const electron = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["electron", "."], {
  env: electronEnv,
  stdio: "inherit",
});

const shutdown = async (signal) => {
  console.log(`[signflow] Shutting down (${signal ?? "exit"})`);
  electron.kill();
  await vite.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

electron.on("exit", (code) => {
  void vite.close().finally(() => {
    process.exit(code ?? 0);
  });
});
