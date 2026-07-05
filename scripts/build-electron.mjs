import esbuild from "esbuild";
import { fileURLToPath } from "node:url";

const shared = {
  bundle: true,
  platform: "node",
  sourcemap: true,
  logLevel: "info",
};

export async function buildElectron() {
  await Promise.all([
    esbuild.build({
      ...shared,
      entryPoints: ["electron/main.ts"],
      outfile: "dist/electron/main.cjs",
      format: "cjs",
      packages: "external",
      target: "node20",
    }),
    esbuild.build({
      ...shared,
      entryPoints: ["electron/preload.ts"],
      outfile: "dist/electron/preload.cjs",
      format: "cjs",
      external: ["electron"],
      target: "node20",
    }),
  ]);

  console.log("[signflow] Built Electron main + preload");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildElectron();
}
