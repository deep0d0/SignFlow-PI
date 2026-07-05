import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const releaseDir = "release";
const root = process.cwd();

if (!existsSync(releaseDir)) {
  console.warn("[signflow] No release/ directory found — skipping copy");
  process.exit(0);
}

for (const name of readdirSync(releaseDir)) {
  if (!/\.(dmg|zip)$/i.test(name)) continue;
  const from = join(releaseDir, name);
  const to = join(root, name);
  copyFileSync(from, to);
  console.log(`[signflow] Copied ${name} to project root`);
}

for (const dir of ["mac", "mac-arm64"]) {
  const path = join(releaseDir, dir);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

for (const name of readdirSync(releaseDir)) {
  if (name.endsWith(".blockmap") || name === "builder-debug.yml") {
    rmSync(join(releaseDir, name), { force: true });
  }
}

try {
  if (readdirSync(releaseDir).length === 0) {
    rmSync(releaseDir, { recursive: true, force: true });
  }
} catch {
  // release/ already removed
}
