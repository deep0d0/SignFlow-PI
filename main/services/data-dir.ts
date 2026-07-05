import os from "node:os";
import path from "node:path";

let _signageDir: string | null = null;

/** Project root (where dist/ lives). Override with SIGNFLOW_APP_ROOT on the Pi. */
export function getAppRoot(): string {
  return process.env.SIGNFLOW_APP_ROOT || process.cwd();
}

/** Persistent signage data directory (state, images, fonts). */
export async function getSignageDir(): Promise<string> {
  if (_signageDir) return _signageDir;

  if (process.env.SIGNFLOW_DATA_DIR) {
    _signageDir = path.join(process.env.SIGNFLOW_DATA_DIR, "signage");
    return _signageDir;
  }

  if (process.versions.electron) {
    try {
      const { app } = await import("electron");
      if (!app.isReady()) {
        await app.whenReady();
      }
      _signageDir = path.join(app.getPath("userData"), "signage");
      return _signageDir;
    } catch {
      // Fall through to default path.
    }
  }

  _signageDir = path.join(os.homedir(), ".config", "signflow", "signage");
  return _signageDir;
}
