import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, Menu, net, protocol } from "electron";

import { registerHandlers } from "../main/handlers/index.js";
import { startConfigServer } from "../main/services/config-server.js";
import { getFontPath, getImagePath, imageMimeForId } from "../main/services/signage-store.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "signage",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

registerHandlers();

let mainWindow: BrowserWindow | null = null;

const FONT_MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

function getPreloadPath(): string {
  return path.join(app.getAppPath(), "dist", "electron", "preload.cjs");
}

function getMainWindowTarget(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}/main-window.html`;
  }
  return path.join(app.getAppPath(), "dist", "renderer", "main-window.html");
}

async function loadMainWindowContent(win: BrowserWindow): Promise<void> {
  const target = getMainWindowTarget();
  if (target.startsWith("http://") || target.startsWith("https://")) {
    await win.loadURL(target);
    return;
  }
  await win.loadFile(target);
}

async function createMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  const packageJsonPath = path.join(app.getAppPath(), "package.json");
  let windowTitle = "SignFlow";
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    windowTitle = packageJson.productName || windowTitle;
  } catch {
    // Use default title.
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    title: windowTitle,
    fullscreen: true,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  await loadMainWindowContent(mainWindow);
  mainWindow.setAspectRatio(16 / 9);
}

function setupApplicationMenu(): void {
  const menu = Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  } else {
    mainWindow?.show();
  }
});

app.whenReady().then(async () => {
  protocol.handle("signage", async (request) => {
    const url = new URL(request.url);
    const kind = url.hostname;
    const id = url.pathname.replace(/^\//, "");

    try {
      if (kind === "font") {
        const filePath = await getFontPath(id);
        const ext = id.split(".").pop()?.toLowerCase() ?? "";
        const mime = FONT_MIME[ext] ?? "application/octet-stream";
        return net.fetch(pathToFileURL(filePath).toString(), {
          headers: { "Content-Type": mime },
        });
      }

      const filePath = await getImagePath(id);
      return net.fetch(pathToFileURL(filePath).href, {
        headers: { "Content-Type": imageMimeForId(id) },
      });
    } catch (error) {
      console.error("[signage-protocol] Failed to serve asset:", kind, id, error);
      return new Response("Not found", { status: 404 });
    }
  });

  await startConfigServer();
  setupApplicationMenu();
  await createMainWindow();
});