import esbuild from "esbuild";
import { fileURLToPath } from "node:url";

import "./patch-pi-server.mjs";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: ["main/pi-server.ts"],
  outfile: "dist/pi/server.cjs",
});

console.log("[signflow] Built Pi server → dist/pi/server.cjs");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // no-op when imported
}
