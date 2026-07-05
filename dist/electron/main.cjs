"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_promises2 = __toESM(require("node:fs/promises"));
var import_node_path = __toESM(require("node:path"));
var import_node_url = require("node:url");
var import_electron4 = require("electron");

// main/handlers/index.ts
var import_electron2 = require("electron");

// main/services/signage-store.ts
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var import_electron = require("electron");
var DEFAULT_STATE = {
  slides: [],
  fonts: [],
  templates: [],
  transitionMs: 1200,
  updatedAt: 0
};
var _signageDir = null;
async function getSignageDir() {
  if (_signageDir) return _signageDir;
  const userData = import_electron.app.getPath("userData");
  _signageDir = import_path.default.join(userData, "signage");
  return _signageDir;
}
async function getStatePath() {
  const dir = await getSignageDir();
  return import_path.default.join(dir, "state.json");
}
async function getImagesDir() {
  const dir = await getSignageDir();
  return import_path.default.join(dir, "images");
}
async function getFontsDir() {
  const dir = await getSignageDir();
  return import_path.default.join(dir, "fonts");
}
async function ensureDirs() {
  await import_promises.default.mkdir(await getImagesDir(), { recursive: true });
  await import_promises.default.mkdir(await getFontsDir(), { recursive: true });
}
async function readState() {
  try {
    const statePath = await getStatePath();
    const raw = await import_promises.default.readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (isSignageState(parsed)) {
      return migrateState(parsed);
    }
    console.error("[signage-store] state.json malformed, using defaults");
    return { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
async function writeState(state) {
  await ensureDirs();
  const statePath = await getStatePath();
  await import_promises.default.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  console.log("[signage:state-saved]", { slides: state.slides.length, fonts: state.fonts.length });
}
function migrateState(state) {
  const fonts = Array.isArray(state.fonts) ? state.fonts : [];
  const templates = Array.isArray(state.templates) ? state.templates : [];
  const slides = state.slides.map((slide) => {
    if (slide.type !== "custom") return slide;
    if (Array.isArray(slide.elements) && slide.elements.length > 0) return slide;
    const legacy = slide;
    const elements = [];
    if (legacy.customImageId) {
      elements.push({
        id: "el-" + Math.random().toString(36).slice(2, 10),
        kind: "image",
        step: 0,
        imageId: legacy.customImageId,
        imageSize: 45
      });
    }
    if (legacy.heading) {
      elements.push({
        id: "el-" + Math.random().toString(36).slice(2, 10),
        kind: "text",
        step: 0,
        text: legacy.heading,
        fontFamily: "Georgia, serif",
        fontWeight: 600,
        fontSize: 8,
        color: "#3a3326",
        align: "center",
        lineHeight: 1.15
      });
    }
    if (legacy.body) {
      elements.push({
        id: "el-" + Math.random().toString(36).slice(2, 10),
        kind: "text",
        step: 1,
        text: legacy.body,
        fontFamily: "system-ui, sans-serif",
        fontWeight: 400,
        fontSize: 4.5,
        color: "#6b6354",
        align: "center",
        lineHeight: 1.5
      });
    }
    return {
      id: slide.id,
      type: "custom",
      durationMs: slide.durationMs,
      elements,
      align: "center",
      vAlign: "center",
      contentWidth: 80,
      revealDelayMs: 700,
      gap: 2.5
    };
  });
  return { ...state, fonts, templates, slides };
}
var IMAGE_EXT_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif"
};
function imageMimeForId(imageId) {
  const ext = imageId.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT_MIME[ext] ?? "image/png";
}
function imageExtForMime(mime) {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg") return "jpg";
  for (const [ext, mt] of Object.entries(IMAGE_EXT_MIME)) {
    if (mt === m) return ext;
  }
  return "png";
}
async function saveImage(imageId, bytes) {
  await ensureDirs();
  const imagesDir = await getImagesDir();
  const imgPath = import_path.default.join(imagesDir, import_path.default.basename(imageId));
  await import_promises.default.writeFile(imgPath, bytes);
  console.log("[signage:image-saved]", { imageId, bytes: bytes.length });
}
async function readImage(imageId) {
  try {
    const imagesDir = await getImagesDir();
    const imgPath = import_path.default.join(imagesDir, import_path.default.basename(imageId));
    return await import_promises.default.readFile(imgPath);
  } catch {
    console.error("[signage-store] image not found:", imageId);
    return null;
  }
}
async function getImagePath(imageId) {
  const imagesDir = await getImagesDir();
  return import_path.default.join(imagesDir, import_path.default.basename(imageId));
}
async function saveFont(fontId, bytes) {
  await ensureDirs();
  const fontsDir = await getFontsDir();
  const fontPath = import_path.default.join(fontsDir, import_path.default.basename(fontId));
  await import_promises.default.writeFile(fontPath, bytes);
  console.log("[signage:font-saved]", { fontId, bytes: bytes.length });
}
async function readFont(fontId) {
  try {
    const fontsDir = await getFontsDir();
    const fontPath = import_path.default.join(fontsDir, import_path.default.basename(fontId));
    return await import_promises.default.readFile(fontPath);
  } catch {
    console.error("[signage-store] font not found:", fontId);
    return null;
  }
}
async function getFontPath(fontId) {
  const fontsDir = await getFontsDir();
  return import_path.default.join(fontsDir, import_path.default.basename(fontId));
}
var BUNDLE_FORMAT = "signflow-bundle";
var BUNDLE_VERSION = 1;
function collectImageIds(state) {
  const ids = /* @__PURE__ */ new Set();
  const scanSlide = (slide) => {
    if (slide.imageId) ids.add(slide.imageId);
    for (const el of slide.elements ?? []) {
      if (el.imageId) ids.add(el.imageId);
      if (el.iconImageId) ids.add(el.iconImageId);
    }
  };
  for (const slide of state.slides) scanSlide(slide);
  for (const tpl of state.templates ?? []) if (tpl.slide) scanSlide(tpl.slide);
  return [...ids];
}
async function exportBundle() {
  const state = await readState();
  const images = [];
  for (const id of collectImageIds(state)) {
    const buf = await readImage(id);
    if (buf) images.push({ id, dataBase64: buf.toString("base64") });
  }
  const fonts = [];
  for (const font of state.fonts) {
    const buf = await readFont(font.id);
    if (buf) fonts.push({ id: font.id, dataBase64: buf.toString("base64") });
  }
  console.log("[signage:export]", { slides: state.slides.length, images: images.length, fonts: fonts.length });
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: Date.now(), state, images, fonts };
}
function isSignageBundle(v) {
  if (typeof v !== "object" || v === null) return false;
  const obj = v;
  return obj.format === BUNDLE_FORMAT && typeof obj.state === "object" && obj.state !== null && Array.isArray(obj.images) && Array.isArray(obj.fonts);
}
async function importBundle(bundle) {
  await ensureDirs();
  for (const img of bundle.images) {
    if (img && typeof img.id === "string" && typeof img.dataBase64 === "string") {
      await saveImage(img.id, Buffer.from(img.dataBase64, "base64"));
    }
  }
  for (const font of bundle.fonts) {
    if (font && typeof font.id === "string" && typeof font.dataBase64 === "string") {
      await saveFont(font.id, Buffer.from(font.dataBase64, "base64"));
    }
  }
  const incoming = bundle.state;
  const normalized = migrateState({
    slides: Array.isArray(incoming.slides) ? incoming.slides : [],
    fonts: Array.isArray(incoming.fonts) ? incoming.fonts : [],
    templates: Array.isArray(incoming.templates) ? incoming.templates : [],
    transitionMs: typeof incoming.transitionMs === "number" ? incoming.transitionMs : DEFAULT_STATE.transitionMs,
    updatedAt: Date.now()
  });
  await writeState(normalized);
  console.log("[signage:import]", {
    slides: normalized.slides.length,
    images: bundle.images.length,
    fonts: bundle.fonts.length
  });
  return normalized;
}
function isSignageState(v) {
  if (typeof v !== "object" || v === null) return false;
  const obj = v;
  return Array.isArray(obj.slides) && typeof obj.transitionMs === "number";
}

// main/handlers/index.ts
function registerHandlers() {
  import_electron2.ipcMain.handle("signage:getState", async () => {
    return await readState();
  });
}

// main/services/config-server.ts
var import_http = __toESM(require("http"));
var import_crypto = require("crypto");
var import_child_process = require("child_process");
var import_util = require("util");

// electron/broadcast.ts
var import_electron3 = require("electron");
function broadcastSignageChanged(state) {
  for (const win of import_electron3.BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("signage:changed", state);
    }
  }
}

// main/services/config-server.ts
var PORT = 8773;
var FONT_MIME = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf"
};
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var systemFontsCache = null;
async function listSystemFonts() {
  if (systemFontsCache) return systemFontsCache;
  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/system_profiler",
      ["SPFontsDataType", "-json"],
      { maxBuffer: 64 * 1024 * 1024, timeout: 3e4 }
    );
    const parsed = JSON.parse(stdout);
    const families = /* @__PURE__ */ new Set();
    for (const entry of parsed.SPFontsDataType ?? []) {
      for (const tf of entry.typefaces ?? []) {
        if (tf.family && !tf.family.startsWith(".")) families.add(tf.family);
      }
    }
    systemFontsCache = [...families].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("[config-server] failed to list system fonts", err);
    systemFontsCache = [];
  }
  return systemFontsCache;
}
function buildConfigHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SignFlow</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f6efe0;
    --cream-mid: #efe3ca;
    --cream-dark: #e4d5b3;
    --panel: #fbf7ee;
    --brown: #3a3326;
    --brown-mid: #6b6354;
    --brown-light: #9c8e7a;
    --accent: #b8860b;
    --accent-hover: #9a7209;
    --border: #ded2b8;
    --border-soft: #eae2cf;
    --shadow: rgba(58,51,38,.12);
    --danger: #b4321e;
    --danger-bg: rgba(180,50,30,.1);
    --danger-border: rgba(180,50,30,.2);
    --sel: rgba(184,134,11,.14);
  }

  html, body { height: 100%; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--cream);
    color: var(--brown);
    font-size: 13px;
    overflow: hidden;
  }

  .app { display: flex; height: 100vh; }

  /* \u2500\u2500 Left rail: slides \u2500\u2500 */
  .rail {
    width: 232px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--panel);
    display: flex;
    flex-direction: column;
  }
  .rail-head {
    padding: 16px 16px 10px;
    border-bottom: 1px solid var(--border-soft);
  }
  .brand { font-family: Georgia, serif; font-size: 20px; font-weight: 600; }
  .rail-sub { font-size: 11px; color: var(--brown-light); margin-top: 2px; }
  .rail-scroll { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .rail-foot { padding: 12px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 7px; }
  .rail-divider { height: 1px; background: var(--border-soft); margin: 3px 0; }
  .rail-foot .row .btn { flex: 1; padding: 6px 4px; }

  /* \u2500\u2500 Templates (rail footer) \u2500\u2500 */
  .tpl-list { display: flex; flex-direction: column; gap: 4px; max-height: 148px; overflow-y: auto; }
  .tpl-row {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-soft);
    background: #fff; cursor: pointer; transition: border-color .1s;
  }
  .tpl-row:hover { border-color: var(--accent); }
  .tpl-star { color: var(--accent); font-size: 11px; flex-shrink: 0; }
  .tpl-name { flex: 1; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tpl-del { color: var(--brown-light); border: none; background: none; cursor: pointer; font-size: 13px; padding: 0 2px; flex-shrink: 0; }
  .tpl-del:hover { color: var(--danger); }
  .tpl-empty { font-size: 11px; color: var(--brown-light); text-align: center; padding: 6px 4px; line-height: 1.4; }

  .slide-thumb {
    position: relative;
    border-radius: 9px;
    border: 1.5px solid var(--border);
    background: #fff;
    overflow: hidden;
    cursor: pointer;
    transition: border-color .12s, box-shadow .12s;
  }
  .slide-thumb:hover { border-color: var(--brown-light); }
  .slide-thumb.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(184,134,11,.2); }
  .slide-thumb.drag-over { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .slide-thumb[draggable="true"] { cursor: grab; }

  .thumb-frame { width: 100%; aspect-ratio: 16/9; container-type: size; position: relative; }
  .thumb-meta {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-top: 1px solid var(--border-soft);
    background: rgba(255,255,255,.6);
  }
  .thumb-num { font-size: 11px; font-weight: 700; color: var(--brown-light); }
  .thumb-kind {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    padding: 1px 6px; border-radius: 999px; background: rgba(58,51,38,.08); color: var(--brown-mid);
  }
  .thumb-dur { margin-left: auto; font-size: 10px; color: var(--brown-light); }
  .thumb-del {
    position: absolute; top: 5px; right: 5px;
    width: 20px; height: 20px; border-radius: 6px;
    background: rgba(0,0,0,.45); color: #fff; border: none; cursor: pointer;
    font-size: 13px; line-height: 1; opacity: 0; transition: opacity .12s;
    display: flex; align-items: center; justify-content: center;
  }
  .slide-thumb:hover .thumb-del { opacity: 1; }
  .thumb-del:hover { background: var(--danger); }

  /* \u2500\u2500 Center stage \u2500\u2500 */
  .stage { flex: 1; min-width: 0; display: flex; flex-direction: column;
    background: radial-gradient(125% 110% at 62% 42%, #f6efe0 0%, #efe3ca 48%, #e4d5b3 100%); }
  .stage-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; border-bottom: 1px solid var(--border-soft);
    background: rgba(255,255,255,.35);
  }
  .stage-bar .grow { flex: 1; }
  .inline-field { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--brown-mid); }
  .inline-field input { width: 64px; }

  .canvas-wrap {
    flex: 1; min-height: 0; container-type: size;
    display: flex; align-items: center; justify-content: center; padding: 28px;
  }
  .canvas {
    aspect-ratio: 16/9;
    width: min(100cqw, calc(100cqh * 16 / 9));
    container-type: size;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(58,51,38,.22), 0 0 0 1px rgba(58,51,38,.06);
    background: #fff;
  }
  .canvas-empty {
    display: flex; align-items: center; justify-content: center;
    color: var(--brown-light); font-size: 14px; text-align: center; padding: 24px;
  }
  .cv-el { transition: outline-color .1s; }

  /* \u2500\u2500 Right inspector \u2500\u2500 */
  .inspector {
    width: 318px; flex-shrink: 0;
    border-left: 1px solid var(--border);
    background: var(--panel);
    overflow-y: auto;
  }
  .insp-section { border-bottom: 1px solid var(--border-soft); padding: 16px; }
  .insp-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
    color: var(--brown-light); margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px;
  }
  .insp-title .grow { flex: 1; }

  label {
    font-size: 11px; font-weight: 600; color: var(--brown-mid);
    display: block; margin-bottom: 5px;
    text-transform: uppercase; letter-spacing: .03em;
  }

  input[type="number"], input[type="text"], input[type="color"], textarea, select {
    background: #fff; border: 1px solid var(--border); border-radius: 7px;
    padding: 7px 9px; font-size: 13px; color: var(--brown); outline: none; width: 100%;
    transition: border-color .12s, box-shadow .12s; font-family: inherit;
  }
  input:focus, textarea:focus, select:focus {
    border-color: var(--accent); box-shadow: 0 0 0 2px rgba(184,134,11,.15);
  }
  input[type="color"] { padding: 2px 4px; height: 32px; cursor: pointer; width: 44px; flex-shrink: 0; }

  .field { margin-bottom: 12px; }
  .row { display: flex; gap: 9px; }
  .row > * { flex: 1; min-width: 0; }
  .color-row { display: flex; align-items: center; gap: 7px; }
  .color-row input[type="text"] { flex: 1; }

  .ce {
    background: #fff; border: 1px solid var(--border); border-radius: 7px;
    padding: 8px 10px; font-size: 13px; color: var(--brown); min-height: 64px;
    outline: none; transition: border-color .12s; line-height: 1.4;
  }
  .ce:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(184,134,11,.15); }

  details { margin-top: 6px; }
  summary {
    cursor: pointer; font-size: 11px; font-weight: 700; color: var(--brown-light);
    text-transform: uppercase; letter-spacing: .05em; padding: 6px 0; list-style: none;
    user-select: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: "\u25B8 "; }
  details[open] summary::before { content: "\u25BE "; }
  .details-body { padding-top: 6px; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: none; transition: background .12s, transform .06s;
    font-family: inherit; white-space: nowrap;
  }
  .btn:active { transform: scale(.97); }
  .btn:disabled { opacity: .45; cursor: default; pointer-events: none; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-ghost { background: rgba(58,51,38,.06); color: var(--brown); border: 1px solid var(--border); }
  .btn-ghost:hover { background: rgba(58,51,38,.12); }
  .btn-block { width: 100%; }
  .btn-xs { padding: 5px 9px; font-size: 11px; border-radius: 6px; }

  /* \u2500\u2500 Layers (elements) \u2500\u2500 */
  .add-els { display: flex; gap: 5px; margin-bottom: 10px; }
  .add-els .btn { flex: 1; padding: 6px 4px; }
  .layers { display: flex; flex-direction: column; gap: 5px; }
  .layer {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 9px; border-radius: 7px; border: 1px solid var(--border-soft);
    background: #fff; cursor: pointer; transition: background .1s, border-color .1s;
  }
  .layer:hover { border-color: var(--border); }
  .layer.selected { background: var(--sel); border-color: var(--accent); }
  .layer.drag-over { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .layer[draggable="true"] { cursor: grab; }
  .layer-handle { color: var(--brown-light); font-size: 12px; flex-shrink: 0; }
  .layer-badge {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    padding: 1px 6px; border-radius: 999px; flex-shrink: 0;
  }
  .lk-text { background: rgba(100,80,40,.12); color: #5a4520; }
  .lk-icon { background: rgba(80,120,40,.12); color: #3a5a18; }
  .lk-divider { background: rgba(40,80,130,.1); color: #2a4a7a; }
  .lk-image { background: rgba(120,60,130,.1); color: #6a2a7a; }
  .lk-card { background: rgba(180,50,30,.12); color: #9a2a18; }
  .layer-label { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer-del { color: var(--brown-light); border: none; background: none; cursor: pointer; font-size: 13px; flex-shrink: 0; padding: 2px 4px; }
  .layer-del:hover { color: var(--danger); }
  .layer-dup { color: var(--brown-light); border: none; background: none; cursor: pointer; font-size: 12px; flex-shrink: 0; padding: 2px 4px; }
  .layer-dup:hover { color: var(--brown); }
  .empty-hint { font-size: 12px; color: var(--brown-light); text-align: center; padding: 16px 8px; }

  .img-preview { max-height: 64px; border-radius: 6px; margin-top: 8px; object-fit: contain; display: block; }

  /* \u2500\u2500 Card pill editor \u2500\u2500 */
  .pill-edit { border: 1px solid var(--border-soft); border-radius: 8px; padding: 9px; margin-bottom: 9px; background: rgba(255,255,255,.5); }
  .pill-edit textarea { min-height: 0; }
  .pill-edit details { margin-top: 2px; }

  /* \u2500\u2500 Toast \u2500\u2500 */
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(8px);
    background: var(--brown); color: var(--cream); padding: 9px 18px; border-radius: 9px;
    font-size: 12px; font-weight: 600; opacity: 0; transition: opacity .2s, transform .2s;
    pointer-events: none; z-index: 999;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>

<div class="app">
  <aside class="rail">
    <div class="rail-head">
      <div class="brand">SignFlow</div>
      <div class="rail-sub">Slides \xB7 changes save automatically</div>
    </div>
    <div class="rail-scroll" id="railScroll"></div>
    <div class="rail-foot">
      <button class="btn btn-primary btn-block" onclick="addCustomSlide()">+ Custom slide</button>
      <button class="btn btn-ghost btn-block" onclick="addImageSlide()">+ Image slide</button>
      <button class="btn btn-ghost btn-block btn-xs" onclick="saveAsTemplate()">\u2605 Save slide as template</button>
      <div class="tpl-list" id="tplList"></div>
      <div class="rail-divider"></div>
      <div class="row" style="gap:7px">
        <button class="btn btn-ghost btn-xs" onclick="exportSetup()" title="Download the whole setup (slides, images, fonts) as one file">\u21A7 Export setup</button>
        <button class="btn btn-ghost btn-xs" onclick="importSetup()" title="Replace this setup with one exported from another instance">\u21A5 Import setup</button>
      </div>
    </div>
  </aside>

  <main class="stage">
    <div class="stage-bar">
      <span class="grow"></span>
      <div class="inline-field">
        <span>Transition</span>
        <input type="number" id="transitionMs" min="0.1" max="10" step="0.1" value="1.2" />
        <span>s</span>
      </div>
    </div>
    <div class="canvas-wrap">
      <div class="canvas" id="canvas" onclick="selectElement(null)"></div>
    </div>
  </main>

  <aside class="inspector" id="inspector"></aside>
</div>

<div class="toast" id="toast"></div>

<script>
'use strict';

const BEIGE_BASE = 'radial-gradient(125% 110% at 62% 42%, #f6efe0 0%, #efe3ca 48%, #e4d5b3 100%)';

const BUILTIN_SVG = {
  star: '<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="100%" height="100%"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="100%" height="100%"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
};
const BUILTIN_NAMES = ['star','heart','bell','sun','clock','calendar'];

// \u2500\u2500 State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let state = { slides: [], fonts: [], templates: [], transitionMs: 1200, updatedAt: 0 };
let systemFamilies = [];
let fontsLoaded = false;
let selectedSlideId = null;
let selectedElId = null;

// \u2500\u2500 Boot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function boot() {
  const res = await fetch('/api/state');
  state = await res.json();
  if (!Array.isArray(state.fonts)) state.fonts = [];
  if (!Array.isArray(state.templates)) state.templates = [];
  document.getElementById('transitionMs').value = (state.transitionMs / 1000).toFixed(1);
  if (state.slides.length) selectedSlideId = state.slides[0].id;
  renderAll();
  tryLoadSystemFonts();
}
boot().catch(console.error);

// \u2500\u2500 Save \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}
async function doSave() {
  state.updatedAt = Date.now();
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error('Save failed: ' + res.status);
    showToast('Saved');
  } catch (e) {
    showToast('Error saving: ' + e.message);
  }
}

document.getElementById('transitionMs').addEventListener('input', (e) => {
  const secs = parseFloat(e.target.value);
  if (!isNaN(secs) && secs > 0) { state.transitionMs = Math.round(secs * 1000); scheduleSave(); }
});

// \u2500\u2500 Fonts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function tryLoadSystemFonts() {
  if (fontsLoaded) return;
  try {
    const res = await fetch('/api/system-fonts');
    const data = await res.json();
    systemFamilies = Array.isArray(data.fonts) ? data.fonts : [];
    fontsLoaded = true;
    refreshFontPicker();
  } catch (e) {
    // Backend unavailable \u2014 leave the dropdown with uploaded fonts only.
  }
}
// Rebuild the font <select> in place (used after async font load / font upload),
// so we don't re-render the whole inspector and lose focus while editing text.
function refreshFontPicker() {
  const el = curEl();
  if (!el) return;
  // Text element has a single in-place select (#fontSelect) we can swap without
  // a full rebuild. Cards have multiple font selects (header + each pill) that
  // depend on different current values, so just re-render the inspector \u2014 this
  // only fires on async system-font load / discrete font upload, never on a
  // keystroke, so losing input focus isn't a concern here.
  if (el.kind === 'text') {
    const sel = document.getElementById('fontSelect');
    if (sel) sel.innerHTML = fontOptionsHtml(el);
  } else if (el.kind === 'card') {
    renderInspector();
  }
}
function fontOptionsHtml(el) { return fontOptionsForValue(el.fontFamily); }
function fontOptionsForValue(curValue) {
  const uploaded = (state.fonts || []).map(f => f.family);
  const cur = curValue || '';
  let html = '<option value=""' + (cur ? '' : ' selected') + '>Default font</option>';
  if (cur && !uploaded.includes(cur) && !systemFamilies.includes(cur)) {
    html += '<option value="' + escAttr(cur) + '" selected>' + escHtml(cur) + '</option>';
  }
  if (uploaded.length) {
    html += '<optgroup label="Uploaded">' + uploaded.map(f =>
      '<option value="' + escAttr(f) + '"' + (cur === f ? ' selected' : '') + '>' + escHtml(f) + '</option>').join('') + '</optgroup>';
  }
  if (systemFamilies.length) {
    html += '<optgroup label="System fonts">' + systemFamilies.map(f =>
      '<option value="' + escAttr(f) + '"' + (cur === f ? ' selected' : '') + '>' + escHtml(f) + '</option>').join('') + '</optgroup>';
  }
  return html;
}

// \u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function newId(p) { return (p || 'id') + '-' + Math.random().toString(36).slice(2, 10); }
function alignItemsFor(a) { return a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center'; }
function justifyFor(v) { return v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center'; }
// Soft (smoothstep) opacity taper toward the content edge of a side image \u2014 mirrors sideFadeMask in slide-renderer.tsx.
function sideFadeGradient(panelSide, fade) {
  if (!fade || fade <= 0) return '';
  const dir = panelSide === 'left' ? 'right' : 'left';
  const start = Math.max(0, 100 - fade);
  const at = frac => (start + frac * fade).toFixed(2);
  return 'linear-gradient(to ' + dir + ',#000 ' + start + '%,rgba(0,0,0,0.844) ' + at(0.25) +
    '%,rgba(0,0,0,0.5) ' + at(0.5) + '%,rgba(0,0,0,0.156) ' + at(0.75) + '%,transparent 100%)';
}
function curSlide() { return state.slides.find(s => s.id === selectedSlideId) || null; }
function curEl() { const s = curSlide(); return s && s.elements ? s.elements.find(e => e.id === selectedElId) || null : null; }

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '*/*';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result, name: file.name });
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '*/*';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    };
    input.click();
  });
}
async function uploadImage(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const mimeMatch = /^data:([^;,]+)/.exec(dataUrl);
  const mime = mimeMatch ? mimeMatch[1] : '';
  const res = await fetch('/api/images', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataBase64: base64, mime }),
  });
  if (!res.ok) throw new Error('Image upload failed: ' + res.status);
  return (await res.json()).imageId;
}
async function uploadFont(dataUrl, family, ext) {
  const base64 = dataUrl.split(',')[1];
  const res = await fetch('/api/fonts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataBase64: base64, family, ext }),
  });
  if (!res.ok) throw new Error('Font upload failed: ' + res.status);
  return (await res.json()).id;
}

// \u2500\u2500 Add slides \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function addImageSlide() {
  const picked = await pickFile('image/*');
  if (!picked) return;
  showToast('Uploading image\u2026');
  try {
    const imageId = await uploadImage(picked.dataUrl);
    const slide = { id: newId('slide'), type: 'image', durationMs: 8000, imageId, fit: 'contain' };
    state.slides.push(slide);
    selectSlide(slide.id);
    scheduleSave();
  } catch (e) { showToast('Upload error: ' + e.message); }
}
function addCustomSlide() {
  const slide = {
    id: newId('slide'), type: 'custom', durationMs: 8000, elements: [],
    align: 'center', vAlign: 'center', contentWidth: 70, gap: 2.5,
    reveal: 'sequential', revealDelayMs: 700,
  };
  state.slides.push(slide);
  selectSlide(slide.id);
  scheduleSave();
}
// \u2500\u2500 Templates \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// Built-in starter templates baked into the editor (always present, not stored in
// user state). Each builds a fresh slide on demand so applying one is independent.
function tplPill(en, enTime, gu, guTime) {
  return { text: '**' + en + '**\\n' + enTime + '\\n\\n**' + gu + '**\\n' + guTime };
}
function tplText(step, t, size, weight) {
  return { id: newId('el'), kind: 'text', step, text: t, fontSize: size, fontWeight: weight, color: '#2b2b2b', align: 'center' };
}
function tplCard(step, header, cells) {
  return { id: newId('el'), kind: 'card', step, headerText: header,
    headerBg: '#c0392b', headerColor: '#ffffff', headerSize: 1.9,
    cellBg: '#2b2b2b', cellColor: '#ffffff', cellSize: 1.7, cardWidth: 46, cells };
}
function buildWeeklyActivitiesSlide() {
  return {
    id: newId('slide'), type: 'custom', durationMs: 15000,
    align: 'center', vAlign: 'center', contentWidth: 70, gap: 2.0,
    reveal: 'sequential', revealDelayMs: 600, background: '#f4eddb',
    elements: [
      { id: newId('el'), kind: 'icon', step: 0, iconSource: 'emoji', iconChar: '\u{1F465}', iconSize: 7, iconColor: '#2b2b2b' },
      tplText(0, 'Weekly Sunday Activities', 4.2, 800),
      tplText(0, '\u0AB0\u0AB5\u0ABF\u0AB5\u0ABE\u0AB0\u0AA8\u0AC0 \u0AAA\u0ACD\u0AB0\u0AB5\u0AC3\u0AA4\u0ACD\u0AA4\u0ABF\u0A93', 3.4, 600),
      { id: newId('el'), kind: 'divider', step: 0, dividerWidth: 16, dividerThickness: 0.22, dividerColor: '#2b2b2b', dividerSpacing: 1.0 },
      tplCard(1, 'Bal \u2013 Balika Mandal  |  Kindergarten \u2013 8th Grade', [
        tplPill('Bal Sabha (boys)', '4:00pm to 6:00pm', '\u0AAC\u0ABE\u0AB2 \u0AB8\u0AAD\u0ABE (\u0A9B\u0ACB\u0A95\u0AB0\u0ABE\u0A93)', '\u0AB8\u0ABE\u0A82\u0A9C\u0AC7 \u0AEA:\u0AE6\u0AE6 \u2013 \u0AEC:\u0AE6\u0AE6'),
        tplPill('Balika Sabha (girls)', '4:00pm to 6:00pm', '\u0AAC\u0ABE\u0AB2\u0ABF\u0A95\u0ABE \u0AB8\u0AAD\u0ABE (\u0A9B\u0ACB\u0A95\u0AB0\u0AC0\u0A93)', '\u0AB8\u0ABE\u0A82\u0A9C\u0AC7 \u0AEA:\u0AE6\u0AE6 \u2013 \u0AEC:\u0AE6\u0AE6'),
      ]),
      tplCard(1, 'Kishore \u2013 Kishori Mandal  |  9th Grade \u2013 College', [
        tplPill('Kishore Sabha (boys)', '2:00pm to 3:30pm', '\u0A95\u0ABF\u0AB6\u0ACB\u0AB0 \u0AB8\u0AAD\u0ABE (\u0A9B\u0ACB\u0A95\u0AB0\u0ABE\u0A93)', '\u0AAC\u0AAA\u0ACB\u0AB0\u0AC7 \u0AE8:\u0AE6\u0AE6 \u2013 \u0AE9:\u0AE9\u0AE6'),
        tplPill('Kishori Sabha (girls)', '2:00pm to 3:30pm', '\u0A95\u0ABF\u0AB6\u0ACB\u0AB0\u0AC0 \u0AB8\u0AAD\u0ABE (\u0A9B\u0ACB\u0A95\u0AB0\u0AC0\u0A93)', '\u0AAC\u0AAA\u0ACB\u0AB0\u0AC7 \u0AE8:\u0AE6\u0AE6 \u2013 \u0AE9:\u0AE9\u0AE6'),
      ]),
      tplCard(2, 'Yuvak \u2013 Yuvati Mandal  |  Ages 22 and up', [
        tplPill('Yuvak Sabha (males)', '4:00pm to 6:00pm', '\u0AAF\u0AC1\u0AB5\u0A95 \u0AB8\u0AAD\u0ABE (\u0AAA\u0AC1\u0AB0\u0AC1\u0AB7\u0ACB)', '\u0AAC\u0AAA\u0ACB\u0AB0\u0AC7 \u0AE9:\u0AE9\u0AE6 \u2013 \u0AEB:\u0AE6\u0AE6'),
        tplPill('Yuvati Sabha (females)', '4:00pm to 6:00pm', '\u0AAF\u0AC1\u0AB5\u0AA4\u0AC0 \u0AB8\u0AAD\u0ABE (\u0AAE\u0AB9\u0ABF\u0AB2\u0ABE\u0A93)', '\u0AB8\u0ABE\u0A82\u0A9C\u0AC7 \u0AEA:\u0AE6\u0AE6 \u2013 \u0AEC:\u0AE6\u0AE6'),
      ]),
      tplCard(2, 'Mandal Activities  |  Ages 30 and up', [
        tplPill('Sanyukta Sabha (all)', '4:00pm to 6:00pm', '\u0AB8\u0A82\u0AAF\u0AC1\u0A95\u0ACD\u0AA4\u0ABE \u0AB8\u0AAD\u0ABE (\u0AAC\u0AA7\u0ABE)', '\u0AB8\u0ABE\u0A82\u0A9C\u0AC7 \u0AEA:\u0AE6\u0AE6 \u2013 \u0AEC:\u0AE6\u0AE6'),
        tplPill('Mahila Sabha (females)', '2:15pm to 3:30pm', '\u0AAE\u0AB9\u0ABF\u0AB2\u0ABE \u0AB8\u0AAD\u0ABE (\u0AAE\u0AB9\u0ABF\u0AB2\u0ABE\u0A93)', '\u0AAC\u0AAA\u0ACB\u0AB0\u0AC7 \u0AE8:\u0AE7\u0AEB \u2013 \u0AE9:\u0AE9\u0AE6'),
      ]),
    ],
  };
}
const BUILTIN_TEMPLATES = [
  { id: 'builtin-weekly', name: 'Weekly Activities', builtin: true, build: buildWeeklyActivitiesSlide },
];
function allTemplates() { return BUILTIN_TEMPLATES.concat(state.templates || []); }

function defaultTemplateName(slide) {
  if (slide.type === 'image') return 'Image slide';
  const firstText = (slide.elements || []).find(e => e.kind === 'text' && (e.text || '').trim());
  if (firstText) {
    const t = firstText.text.replace(/\\s+/g, ' ').trim();
    return t.length > 30 ? t.slice(0, 30) : t;
  }
  return 'Template';
}

// Save the currently selected slide as a reusable template.
function saveAsTemplate() {
  const slide = curSlide();
  if (!slide) { showToast('Select a slide first'); return; }
  if (!Array.isArray(state.templates)) state.templates = [];
  const name = (prompt('Template name', defaultTemplateName(slide)) || '').trim();
  if (!name) return;
  const slideCopy = deepClone(slide);
  const existing = state.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!confirm('A template named "' + name + '" already exists. Replace it?')) return;
    existing.slide = slideCopy;
    existing.createdAt = Date.now();
  } else {
    state.templates.push({ id: newId('tpl'), name, slide: slideCopy, createdAt: Date.now() });
  }
  renderTemplates();
  showToast('Saved template: ' + name);
  scheduleSave();
}

// Insert a new slide built from a template (ids regenerated so it's independent).
function applyTemplate(id) {
  const tpl = allTemplates().find(t => t.id === id);
  if (!tpl) return;
  const slide = tpl.builtin ? tpl.build() : deepClone(tpl.slide);
  slide.id = newId('slide');
  if (Array.isArray(slide.elements)) slide.elements.forEach(el => { el.id = newId('el'); });
  state.slides.push(slide);
  selectSlide(slide.id);
  showToast('Added from template: ' + tpl.name);
  scheduleSave();
}

function deleteTemplate(id, ev) {
  if (ev) ev.stopPropagation();
  const tpl = (state.templates || []).find(t => t.id === id);
  if (!tpl) return; // built-ins aren't deletable
  if (!confirm('Delete template "' + tpl.name + '"?')) return;
  state.templates = state.templates.filter(t => t.id !== id);
  renderTemplates();
  scheduleSave();
}

function renderTemplates() {
  const list = document.getElementById('tplList');
  if (!list) return;
  list.innerHTML = allTemplates().map(t =>
    '<div class="tpl-row" title="Add a slide from this template" onclick="applyTemplate(\\'' + t.id + '\\')">' +
      '<span class="tpl-star">' + (t.builtin ? '\u25C6' : '\u2605') + '</span>' +
      '<span class="tpl-name">' + escHtml(t.name) + (t.builtin ? ' <span style="color:var(--brown-light);font-size:9px">starter</span>' : '') + '</span>' +
      (t.builtin ? '' : '<button class="tpl-del" title="Delete template" onclick="deleteTemplate(\\'' + t.id + '\\', event)">\xD7</button>') +
    '</div>').join('');
}

// \u2500\u2500 Export / Import setup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function exportSetup() {
  showToast('Preparing export\u2026');
  try {
    const res = await fetch('/api/export');
    if (!res.ok) throw new Error('Export failed: ' + res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'signflow-setup-' + new Date().toISOString().slice(0, 10) + '.signflow.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Setup exported');
  } catch (e) { showToast(e.message); }
}
async function importSetup() {
  const text = await pickTextFile('.json,application/json');
  if (!text) return;
  let bundle;
  try { bundle = JSON.parse(text); } catch { showToast('Not a valid setup file'); return; }
  if (!bundle || bundle.format !== 'signflow-bundle') { showToast('Not a SignFlow setup file'); return; }
  const slideCount = (bundle.state && bundle.state.slides ? bundle.state.slides.length : 0);
  if (!confirm('Import ' + slideCount + ' slide(s)? This replaces ALL current slides, images and fonts.')) return;
  showToast('Importing\u2026');
  try {
    const res = await fetch('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    if (!res.ok) throw new Error('Import failed: ' + res.status);
    state = await res.json();
    if (!Array.isArray(state.fonts)) state.fonts = [];
    if (!Array.isArray(state.templates)) state.templates = [];
    selectedSlideId = state.slides.length ? state.slides[0].id : null;
    selectedElId = null;
    document.getElementById('transitionMs').value = (state.transitionMs / 1000).toFixed(1);
    renderAll();
    showToast('Imported ' + state.slides.length + ' slide(s)');
  } catch (e) { showToast(e.message); }
}

function deleteSlide(id, ev) {
  if (ev) ev.stopPropagation();
  const idx = state.slides.findIndex(s => s.id === id);
  state.slides = state.slides.filter(s => s.id !== id);
  if (selectedSlideId === id) {
    const next = state.slides[idx] || state.slides[idx - 1] || null;
    selectedSlideId = next ? next.id : null;
    selectedElId = null;
  }
  renderAll();
  scheduleSave();
}

// \u2500\u2500 Selection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function selectSlide(id) {
  selectedSlideId = id;
  selectedElId = null;
  renderAll();
}
function selectElement(elId) {
  selectedElId = elId;
  renderCanvas();
  renderInspector();
  updateLayerSelection();
}

// \u2500\u2500 Elements \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function addElement(kind) {
  const slide = curSlide();
  if (!slide) return;
  if (!Array.isArray(slide.elements)) slide.elements = [];
  const defaults = {
    text: { text: 'New text', fontSize: 5, fontWeight: 400, color: '#2a2a2a', align: 'center' },
    icon: { iconSource: 'emoji', iconChar: '\\u2605', iconSize: 7, iconColor: '#2a2a2a' },
    divider: { dividerWidth: 80, dividerThickness: 0.15, dividerColor: 'rgba(40,40,40,.4)', dividerSpacing: 1.2 },
    image: { imageSize: 30 },
    card: {
      headerText: 'Section title',
      headerBg: '#c0392b', headerColor: '#ffffff', headerSize: 2.2,
      cellBg: '#2b2b2b', cellColor: '#ffffff', cellSize: 2,
      cells: [{ text: '**Activity name**\\n10:00am to 11:00am' }],
    },
  };
  const el = { id: newId('el'), kind, step: 0, ...(defaults[kind] || {}) };
  slide.elements.push(el);
  selectedElId = el.id;
  renderCanvas(); renderInspector(); refreshThumb(slide.id);
  scheduleSave();
}
function deleteElement(elId, ev) {
  if (ev) ev.stopPropagation();
  const slide = curSlide();
  if (!slide || !slide.elements) return;
  slide.elements = slide.elements.filter(e => e.id !== elId);
  if (selectedElId === elId) selectedElId = null;
  renderCanvas(); renderInspector(); refreshThumb(slide.id);
  scheduleSave();
}
function duplicateElement(elId, ev) {
  if (ev) ev.stopPropagation();
  const slide = curSlide();
  if (!slide || !slide.elements) return;
  const idx = slide.elements.findIndex(e => e.id === elId);
  if (idx < 0) return;
  const copy = JSON.parse(JSON.stringify(slide.elements[idx]));
  copy.id = newId('el');
  slide.elements.splice(idx + 1, 0, copy);
  selectedElId = copy.id;
  renderCanvas(); renderInspector(); refreshThumb(slide.id);
  scheduleSave();
}
function setEl(elId, field, value) {
  const slide = curSlide();
  if (!slide || !slide.elements) return;
  const el = slide.elements.find(e => e.id === elId);
  if (!el) return;
  if (value === undefined) delete el[field]; else el[field] = value;
  renderCanvas(); refreshThumb(slide.id);
  scheduleSave();
}
function setElRebuild(elId, field, value) {
  setEl(elId, field, value);
  renderInspector();
}
function setSlide(field, value) {
  const slide = curSlide();
  if (!slide) return;
  if (value === undefined) delete slide[field]; else slide[field] = value;
  renderCanvas(); refreshThumb(slide.id);
  scheduleSave();
}

// \u2500\u2500 Render: top-level \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderAll() {
  renderRail();
  renderCanvas();
  renderInspector();
  renderTemplates();
}

// \u2500\u2500 Render: rail \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderRail() {
  const scroll = document.getElementById('railScroll');
  scroll.innerHTML = '';
  if (!state.slides.length) {
    scroll.innerHTML = '<div class="empty-hint">No slides yet.<br>Add one below.</div>';
    return;
  }
  state.slides.forEach((slide, idx) => {
    const card = document.createElement('div');
    card.className = 'slide-thumb' + (slide.id === selectedSlideId ? ' selected' : '');
    card.dataset.slideId = slide.id;
    card.setAttribute('draggable', 'true');
    card.onclick = () => selectSlide(slide.id);
    card.addEventListener('dragstart', (e) => onSlideDragStart(e, slide.id));
    card.addEventListener('dragover', (e) => onSlideDragOver(e, card));
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => onSlideDrop(e, slide.id));

    const frame = document.createElement('div');
    frame.className = 'thumb-frame';
    frame.id = 'thumb-' + slide.id;
    frame.innerHTML = slideHtml(slide, false);
    card.appendChild(frame);

    const meta = document.createElement('div');
    meta.className = 'thumb-meta';
    meta.innerHTML =
      '<span class="thumb-num">' + (idx + 1) + '</span>' +
      '<span class="thumb-kind">' + escHtml(slide.type) + '</span>' +
      '<span class="thumb-dur">' + ((slide.durationMs || 8000) / 1000).toFixed(0) + 's</span>';
    card.appendChild(meta);

    const del = document.createElement('button');
    del.className = 'thumb-del';
    del.textContent = '\xD7';
    del.title = 'Delete slide';
    del.onclick = (e) => deleteSlide(slide.id, e);
    card.appendChild(del);

    scroll.appendChild(card);
  });
}
function refreshThumb(slideId) {
  const frame = document.getElementById('thumb-' + slideId);
  const slide = state.slides.find(s => s.id === slideId);
  if (frame && slide) frame.innerHTML = slideHtml(slide, false);
}

// \u2500\u2500 Slide drag reorder \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let dragSlideId = null;
function onSlideDragStart(e, id) { dragSlideId = id; e.dataTransfer.effectAllowed = 'move'; }
function onSlideDragOver(e, card) { e.preventDefault(); card.classList.add('drag-over'); }
function onSlideDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragSlideId || dragSlideId === targetId) return;
  const s = state.slides.findIndex(x => x.id === dragSlideId);
  const t = state.slides.findIndex(x => x.id === targetId);
  if (s === -1 || t === -1) return;
  const [m] = state.slides.splice(s, 1);
  state.slides.splice(t, 0, m);
  renderRail();
  scheduleSave();
}

// \u2500\u2500 Element (layer) drag reorder \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let dragElId = null;
function onElDragStart(e, id) { dragElId = id; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); }
function onElDragOver(e, row) { e.preventDefault(); e.stopPropagation(); row.classList.add('drag-over'); }
function onElDrop(e, targetId) {
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  const slide = curSlide();
  if (!slide || !slide.elements || !dragElId || dragElId === targetId) return;
  const s = slide.elements.findIndex(x => x.id === dragElId);
  const t = slide.elements.findIndex(x => x.id === targetId);
  if (s === -1 || t === -1) return;
  const [m] = slide.elements.splice(s, 1);
  slide.elements.splice(t, 0, m);
  renderCanvas(); renderInspector(); refreshThumb(slide.id);
  scheduleSave();
}

// \u2500\u2500 Render: canvas \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderCanvas() {
  const canvas = document.getElementById('canvas');
  const slide = curSlide();
  if (!slide) {
    canvas.innerHTML = '<div class="canvas-empty">Select or add a slide to start editing.</div>';
    return;
  }
  canvas.innerHTML = slideHtml(slide, true);
}

// Build the slide markup. Mirrors renderer/components/slide-renderer.tsx so the
// editor preview matches the live display. Uses real cqh units inside a
// container-type:size frame (canvas or thumbnail).
function slideHtml(slide, selectable) {
  const bg = slide.background || BEIGE_BASE;

  if (slide.type === 'image') {
    const inner = slide.imageId
      ? '<img src="/images/' + encodeURIComponent(slide.imageId) + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:' + (slide.fit || 'contain') + ';"/>'
      : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9c8e7a;font-size:4cqh;">No image</div>';
    return '<div style="width:100%;height:100%;position:relative;background:' + bg + ';overflow:hidden;">' + inner + '</div>';
  }

  const ai = alignItemsFor(slide.align);
  const jc = justifyFor(slide.vAlign);
  const ta = slide.align || 'center';
  const cw = slide.contentWidth != null ? slide.contentWidth : 80;
  const gap = slide.gap != null ? slide.gap : 2.5;
  const els = slide.elements || [];

  // One or more image elements may be pinned full-height to a side; they stack
  // vertically into one panel.
  const sideImages = els.filter(el => el.kind === 'image' && (el.placement === 'left' || el.placement === 'right'));
  const panelSide = sideImages[0] ? sideImages[0].placement : null;
  const contentEls = sideImages.length ? els.filter(el => sideImages.indexOf(el) === -1) : els;

  let inner = '';
  contentEls.forEach(el => {
    const sel = selectable && el.id === selectedElId;
    const isGridCard = el.kind === 'card' && el.cardWidth != null;
    let ws;
    if (isGridCard) {
      ws = 'display:flex;flex-direction:column;align-items:' + ai + ';width:' + el.cardWidth + '%;max-width:' + el.cardWidth + '%;min-width:0;flex-shrink:1;';
    } else {
      const elMax = (el.kind === 'text' && el.textWidth != null) ? el.textWidth : cw;
      ws = 'display:flex;flex-direction:column;align-items:' + ai + ';width:100%;max-width:' + elMax + '%;';
    }
    if (sel) ws += 'outline:0.4cqh solid #b8860b;outline-offset:0.5cqh;border-radius:0.5cqh;';
    if (selectable) ws += 'cursor:pointer;';
    const click = selectable ? ' onclick="event.stopPropagation();selectElement(\\'' + el.id + '\\')"' : '';
    inner += '<div class="cv-el" data-el-id="' + el.id + '"' + click + ' style="' + ws + '">' + elInnerHtml(el) + '</div>';
  });

  if (!inner) {
    inner = selectable
      ? '<div style="color:#9c8e7a;font-size:3cqh;text-align:center;width:100%;">Add elements from the right panel \u2192</div>'
      : '';
  }

  const contentCol =
    '<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:' + jc +
    ';align-items:' + ai + ';overflow:hidden;">' +
    '<div style="display:flex;flex-wrap:wrap;justify-content:' + ai + ';align-items:flex-start;text-align:' + ta +
    ';width:100%;gap:' + gap + 'cqh;">' + inner + '</div></div>';

  let sidePanel = '';
  if (sideImages.length) {
    const sw = sideImages[0].sideWidth != null ? sideImages[0].sideWidth : 45;
    const ps = 'width:' + sw + '%;height:100%;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;';
    let bands = '';
    sideImages.forEach(si => {
      const fit = si.sideFit || 'cover';
      const fade = si.sideFade != null ? si.sideFade : 0;
      const grad = sideFadeGradient(panelSide, fade);
      const mask = grad ? ('-webkit-mask-image:' + grad + ';mask-image:' + grad + ';') : '';
      const px = si.posX != null ? si.posX : 50;
      const py = si.posY != null ? si.posY : 50;
      const selS = selectable && si.id === selectedElId;
      let bs = 'flex:1;min-height:0;overflow:hidden;position:relative;';
      if (selS) bs += 'outline:0.4cqh solid #b8860b;outline-offset:-0.4cqh;';
      if (selectable) bs += 'cursor:pointer;';
      const click = selectable ? ' onclick="event.stopPropagation();selectElement(\\'' + si.id + '\\')"' : '';
      const img = si.imageId
        ? '<img src="/images/' + encodeURIComponent(si.imageId) + '" style="width:100%;height:100%;object-fit:' + fit + ';object-position:' + px + '% ' + py + '%;display:block;' + mask + '"/>'
        : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(160,140,110,.18);color:#9c8e7a;font-size:2.5cqh;">No image</div>';
      bands += '<div class="cv-el" data-el-id="' + si.id + '"' + click + ' style="' + bs + '">' + img + '</div>';
    });
    sidePanel = '<div style="' + ps + '">' + bands + '</div>';
  }

  const row = panelSide === 'left'
    ? sidePanel + contentCol
    : contentCol + sidePanel;

  return '<div style="width:100%;height:100%;background:' + bg + ';display:flex;flex-direction:row;overflow:hidden;">' + row + '</div>';
}

function elInnerHtml(el) {
  if (el.kind === 'text') {
    const lh = el.lineHeight != null ? el.lineHeight : 1.3;
    const ls = (el.letterSpacing != null && el.letterSpacing !== 0) ? (el.letterSpacing + 'em') : 'normal';
    const ta = el.align || 'inherit';
    const fw = el.fontWeight || 400;
    const col = el.color || '#2a2a2a';
    const ff = el.fontFamily ? el.fontFamily.replace(/"/g, '') : 'inherit';
    const fs = el.fontSize != null ? el.fontSize : 5;
    const content = el.html ? el.html : escHtml(el.text || '').replace(/\\n/g, '<br>');
    return '<div style="font-size:' + fs + 'cqh;line-height:' + lh + ';letter-spacing:' + ls +
      ';text-align:' + ta + ';font-weight:' + fw + ';color:' + col + ';font-family:' + ff +
      ';margin:0;width:100%;">' + content + '</div>';
  }
  if (el.kind === 'icon') {
    const sz = el.iconSize != null ? el.iconSize : 7;
    const col = el.iconColor || '#2a2a2a';
    if (el.iconSource === 'emoji' && el.iconChar) {
      return '<div style="font-size:' + sz + 'cqh;line-height:1;">' + escHtml(el.iconChar) + '</div>';
    }
    if (el.iconSource === 'image' && el.iconImageId) {
      return '<img src="/images/' + encodeURIComponent(el.iconImageId) + '" style="max-height:' + sz + 'cqh;object-fit:contain;display:block;"/>';
    }
    const svg = BUILTIN_SVG[el.iconName] || BUILTIN_SVG.star;
    return '<div style="width:' + sz + 'cqh;height:' + sz + 'cqh;color:' + col + ';">' + svg + '</div>';
  }
  if (el.kind === 'divider') {
    const w = el.dividerWidth != null ? el.dividerWidth : 80;
    const th = el.dividerThickness != null ? el.dividerThickness : 0.15;
    const col = el.dividerColor || 'rgba(40,40,40,.4)';
    const sp = el.dividerSpacing != null ? el.dividerSpacing : 1.2;
    return '<div style="width:' + w + '%;height:' + th + 'cqh;background:' + col +
      ';margin-top:' + sp + 'cqh;margin-bottom:' + sp + 'cqh;flex-shrink:0;"></div>';
  }
  if (el.kind === 'image') {
    const sz = el.imageSize != null ? el.imageSize : 30;
    if (el.imageId) {
      return '<img src="/images/' + encodeURIComponent(el.imageId) + '" style="max-height:' + sz + 'cqh;max-width:100%;object-fit:contain;display:block;"/>';
    }
    return '<div style="height:' + sz + 'cqh;width:40%;background:rgba(160,140,110,.18);border-radius:1cqh;display:flex;align-items:center;justify-content:center;color:#9c8e7a;font-size:2.5cqh;">No image</div>';
  }
  if (el.kind === 'card') {
    const headerBg = el.headerBg || '#c0392b';
    const headerColor = el.headerColor || '#ffffff';
    const headerSize = el.headerSize != null ? el.headerSize : 2.2;
    const cellBg = el.cellBg || '#2b2b2b';
    const cellColor = el.cellColor || '#ffffff';
    const cellSize = el.cellSize != null ? el.cellSize : 2;
    const cells = (el.cells && el.cells.length) ? el.cells : [{ text: '' }];
    const hAlign = el.headerAlign || 'center';
    const hWeight = el.headerFontWeight != null ? el.headerFontWeight : 700;
    const hLh = el.headerLineHeight != null ? el.headerLineHeight : 1.25;
    const hLs = (el.headerLetterSpacing != null && el.headerLetterSpacing !== 0) ? (el.headerLetterSpacing + 'em') : 'normal';
    const hFam = el.headerFontFamily ? ('font-family:' + el.headerFontFamily.replace(/"/g, '') + ';') : '';
    const header = el.headerText
      ? '<div style="background:' + headerBg + ';color:' + headerColor + ';border-radius:1.2cqh;padding:0.9cqh 1.4cqh;text-align:' + hAlign + ';' + hFam + 'font-weight:' + hWeight + ';font-size:' + headerSize + 'cqh;line-height:' + hLh + ';letter-spacing:' + hLs + ';box-sizing:border-box;">' + escHtml(el.headerText) + '</div>'
      : '';
    const cellsHtml = cells.map(c => {
      const cColor = c.color || cellColor;
      const cSize = c.fontSize != null ? c.fontSize : cellSize;
      const cAlign = c.align || 'center';
      const cLh = c.lineHeight != null ? c.lineHeight : 1.4;
      const cLs = (c.letterSpacing != null && c.letterSpacing !== 0) ? (c.letterSpacing + 'em') : 'normal';
      const cFam = c.fontFamily ? ('font-family:' + c.fontFamily.replace(/"/g, '') + ';') : '';
      const cWeight = c.fontWeight != null ? ('font-weight:' + c.fontWeight + ';') : '';
      return '<div style="flex:1;min-width:0;background:' + cellBg + ';color:' + cColor + ';border-radius:1.2cqh;padding:1.2cqh 1cqh;text-align:' + cAlign + ';font-size:' + cSize + 'cqh;line-height:' + cLh + ';letter-spacing:' + cLs + ';' + cFam + cWeight + 'box-sizing:border-box;">' + cardLinesHtml(c.text) + '</div>';
    }).join('');
    return '<div style="width:100%;display:flex;flex-direction:column;gap:0.9cqh;box-sizing:border-box;">' + header +
      '<div style="display:flex;gap:1cqh;align-items:stretch;width:100%;">' + cellsHtml + '</div></div>';
  }
  return '';
}

// Mirror of renderCardLines in slide-renderer.tsx: **line** = bold, blank = gap.
function cardLinesHtml(text) {
  return String(text || '').split('\\n').map(raw => {
    const ln = raw.trim();
    if (!ln) return '<div style="height:0.6cqh;"></div>';
    const bold = ln.length >= 4 && ln.slice(0, 2) === '**' && ln.slice(-2) === '**';
    const content = bold ? ln.slice(2, -2) : ln;
    return '<div' + (bold ? ' style="font-weight:700;"' : '') + '>' + escHtml(content) + '</div>';
  }).join('');
}

// \u2500\u2500 Render: inspector \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderInspector() {
  const insp = document.getElementById('inspector');
  const slide = curSlide();
  if (!slide) {
    insp.innerHTML = '<div class="insp-section"><div class="empty-hint">No slide selected.</div></div>';
    return;
  }
  if (slide.type === 'image') {
    insp.innerHTML = imageSlidePanel(slide);
    wireImageSlide(slide);
    return;
  }
  insp.innerHTML = slidePanel(slide) + layersPanel(slide) + elementPanel(slide);
  wireElementPanel();
}

function imageSlidePanel(slide) {
  return '<div class="insp-section">' +
    '<div class="insp-title">Image slide</div>' +
    '<div class="field"><label>Duration (s)</label>' +
    '<input type="number" min="0.5" max="60" step="0.5" value="' + ((slide.durationMs || 8000) / 1000).toFixed(1) +
    '" oninput="setSlide(\\'durationMs\\', Math.round(parseFloat(this.value)*1000))" onchange="renderRail()"/></div>' +
    '<div class="field"><label>Fit</label><select onchange="setSlide(\\'fit\\', this.value)">' +
    '<option value="contain"' + (slide.fit !== 'cover' ? ' selected' : '') + '>Contain</option>' +
    '<option value="cover"' + (slide.fit === 'cover' ? ' selected' : '') + '>Cover</option></select></div>' +
    '<button class="btn btn-ghost btn-block" id="replaceImgBtn">' + (slide.imageId ? 'Replace image' : 'Upload image') + '</button>' +
    (slide.imageId ? '<img class="img-preview" src="/images/' + encodeURIComponent(slide.imageId) + '"/>' : '') +
    '</div>';
}
function wireImageSlide(slide) {
  const btn = document.getElementById('replaceImgBtn');
  if (btn) btn.onclick = async () => {
    const picked = await pickFile('image/*');
    if (!picked) return;
    showToast('Uploading\u2026');
    try {
      const imageId = await uploadImage(picked.dataUrl);
      slide.imageId = imageId;
      renderCanvas(); renderInspector(); refreshThumb(slide.id);
      scheduleSave();
    } catch (e) { showToast('Error: ' + e.message); }
  };
}

function slidePanel(slide) {
  const sa = slide.align || 'center', sv = slide.vAlign || 'center';
  return '<div class="insp-section">' +
    '<div class="insp-title">Slide</div>' +
    '<div class="field"><label>Duration (s)</label>' +
    '<input type="number" min="0.5" max="60" step="0.5" value="' + ((slide.durationMs || 8000) / 1000).toFixed(1) +
    '" oninput="setSlide(\\'durationMs\\', Math.round(parseFloat(this.value)*1000))" onchange="renderRail()"/></div>' +
    '<div class="field"><label>Reveal animation</label><select onchange="setSlide(\\'reveal\\', this.value)">' +
    '<option value="sequential"' + (slide.reveal !== 'together' ? ' selected' : '') + '>Sequential (by step)</option>' +
    '<option value="together"' + (slide.reveal === 'together' ? ' selected' : '') + '>All at once</option></select></div>' +
    '<details><summary>Advanced</summary><div class="details-body">' +
      '<div class="row field">' +
        '<div><label>Align</label><select onchange="setSlide(\\'align\\', this.value)">' +
          '<option value="left"' + (sa === 'left' ? ' selected' : '') + '>Left</option>' +
          '<option value="center"' + (sa === 'center' ? ' selected' : '') + '>Center</option>' +
          '<option value="right"' + (sa === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
        '<div><label>Vertical</label><select onchange="setSlide(\\'vAlign\\', this.value)">' +
          '<option value="top"' + (sv === 'top' ? ' selected' : '') + '>Top</option>' +
          '<option value="center"' + (sv === 'center' ? ' selected' : '') + '>Center</option>' +
          '<option value="bottom"' + (sv === 'bottom' ? ' selected' : '') + '>Bottom</option></select></div>' +
      '</div>' +
      '<div class="row field">' +
        '<div><label>Content width %</label><input type="number" min="10" max="100" step="1" value="' + (slide.contentWidth != null ? slide.contentWidth : 70) + '" oninput="setSlide(\\'contentWidth\\', parseFloat(this.value))"/></div>' +
        '<div><label>Gap (cqh)</label><input type="number" min="0" max="20" step="0.1" value="' + (slide.gap != null ? slide.gap : 2.5) + '" oninput="setSlide(\\'gap\\', parseFloat(this.value))"/></div>' +
      '</div>' +
      '<div class="field"><label>Reveal delay (ms)</label><input type="number" min="0" max="5000" step="50" value="' + (slide.revealDelayMs != null ? slide.revealDelayMs : 700) + '" oninput="setSlide(\\'revealDelayMs\\', parseInt(this.value)||0)"/></div>' +
      '<div class="field"><label>Background (optional)</label><input type="text" placeholder="e.g. #1a1a2e" value="' + escAttr(slide.background || '') + '" oninput="setSlide(\\'background\\', this.value||undefined)"/></div>' +
    '</div></details>' +
  '</div>';
}

function elLabel(el) {
  if (el.kind === 'text') {
    const t = (el.text || '').replace(/\\s+/g, ' ').trim();
    return t ? (t.length > 24 ? t.slice(0, 24) + '\u2026' : t) : 'Text';
  }
  if (el.kind === 'icon') return 'Icon';
  if (el.kind === 'divider') return 'Divider';
  if (el.kind === 'image') return 'Image';
  if (el.kind === 'card') { const h = (el.headerText || '').trim(); return h ? (h.length > 24 ? h.slice(0, 24) + '\u2026' : h) : 'Card'; }
  return el.kind;
}
function layersPanel(slide) {
  const els = slide.elements || [];
  let rows = '';
  els.forEach(el => {
    const sel = el.id === selectedElId ? ' selected' : '';
    rows += '<div class="layer' + sel + '" data-el-id="' + el.id + '" draggable="true"' +
      ' onclick="selectElement(\\'' + el.id + '\\')"' +
      ' ondragstart="onElDragStart(event, \\'' + el.id + '\\')"' +
      ' ondragover="onElDragOver(event, this)"' +
      ' ondragleave="this.classList.remove(\\'drag-over\\')"' +
      ' ondrop="onElDrop(event, \\'' + el.id + '\\')">' +
      '<span class="layer-handle">\u2630</span>' +
      '<span class="layer-badge lk-' + el.kind + '">' + el.kind.charAt(0) + '</span>' +
      '<span class="layer-label">' + escHtml(elLabel(el)) + '</span>' +
      '<button class="layer-dup" title="Duplicate" onclick="duplicateElement(\\'' + el.id + '\\', event)">\u29C9</button>' +
      '<button class="layer-del" title="Delete" onclick="deleteElement(\\'' + el.id + '\\', event)">\xD7</button>' +
    '</div>';
  });
  if (!rows) rows = '<div class="empty-hint">No elements yet.</div>';
  return '<div class="insp-section">' +
    '<div class="insp-title">Elements</div>' +
    '<div class="add-els">' +
      '<button class="btn btn-ghost btn-xs" onclick="addElement(\\'text\\')">Text</button>' +
      '<button class="btn btn-ghost btn-xs" onclick="addElement(\\'icon\\')">Icon</button>' +
      '<button class="btn btn-ghost btn-xs" onclick="addElement(\\'divider\\')">Line</button>' +
      '<button class="btn btn-ghost btn-xs" onclick="addElement(\\'image\\')">Image</button>' +
      '<button class="btn btn-ghost btn-xs" onclick="addElement(\\'card\\')">Card</button>' +
    '</div>' +
    '<div class="layers" id="layersList">' + rows + '</div>' +
  '</div>';
}
function updateLayerSelection() {
  document.querySelectorAll('#layersList .layer').forEach(row => {
    row.classList.toggle('selected', row.dataset.elId === selectedElId);
  });
}

function elementPanel(slide) {
  const el = (slide.elements || []).find(e => e.id === selectedElId);
  if (!el) return '<div class="insp-section"><div class="empty-hint">Select an element above (or on the canvas) to edit it.</div></div>';
  let body = '';
  if (el.kind === 'text') body = textFields(el);
  else if (el.kind === 'icon') body = iconFields(el);
  else if (el.kind === 'divider') body = dividerFields(el);
  else if (el.kind === 'image') body = imageFields(el);
  else if (el.kind === 'card') body = cardFields(el);
  const adv = '<details><summary>Advanced</summary><div class="details-body">' +
    '<div class="field"><label>Reveal step (group)</label><input type="number" min="0" max="20" step="1" value="' + (el.step || 0) + '" oninput="setEl(\\'' + el.id + '\\', \\'step\\', parseInt(this.value)||0)"/></div>' +
    advExtra(el) + '</div></details>';
  return '<div class="insp-section">' +
    '<div class="insp-title"><span class="grow">' + escHtml(el.kind) + '</span>' +
    '<button class="btn btn-ghost btn-xs" onclick="duplicateElement(\\'' + el.id + '\\')">Duplicate</button>' +
    '<button class="btn btn-ghost btn-xs" onclick="deleteElement(\\'' + el.id + '\\')">Delete</button></div>' +
    body + adv + '</div>';
}

function advExtra(el) {
  if (el.kind !== 'text') return '';
  return '<div class="row field">' +
    '<div><label>Line height</label><input type="number" min="0.8" max="3" step="0.05" value="' + (el.lineHeight != null ? el.lineHeight : 1.3) + '" oninput="setEl(\\'' + el.id + '\\', \\'lineHeight\\', parseFloat(this.value))"/></div>' +
    '<div><label>Letter sp (em)</label><input type="number" min="-0.1" max="0.5" step="0.01" value="' + (el.letterSpacing != null ? el.letterSpacing : 0) + '" oninput="setEl(\\'' + el.id + '\\', \\'letterSpacing\\', parseFloat(this.value))"/></div>' +
    '<div><label>Text width %</label><input type="number" min="10" max="100" step="1" placeholder="slide" value="' + (el.textWidth != null ? el.textWidth : '') + '" oninput="setEl(\\'' + el.id + '\\', \\'textWidth\\', this.value===\\'\\'?undefined:parseFloat(this.value))"/></div>' +
  '</div>';
}

function textFields(el) {
  const wOpts = [[300,'Light'],[400,'Regular'],[500,'Medium'],[600,'SemiBold'],[700,'Bold'],[800,'ExtraBold'],[900,'Black']];
  const cur = el.fontWeight || 400;
  const weights = wOpts.map(o => '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + ' ' + o[0] + '</option>').join('');
  const ta = el.align || 'center';
  return '<div class="field"><label>Content (paste keeps formatting)</label>' +
    '<div class="ce" id="ceField" contenteditable="true"></div></div>' +
    '<div class="field"><label>Font</label>' +
      '<div class="row"><select id="fontSelect" onchange="setEl(\\'' + el.id + '\\', \\'fontFamily\\', this.value||undefined)" style="flex:2">' + fontOptionsHtml(el) + '</select>' +
      '<button class="btn btn-ghost" id="uploadFontBtn" style="flex:1">Upload</button></div></div>' +
    '<div class="row field">' +
      '<div><label>Weight</label><select onchange="setEl(\\'' + el.id + '\\', \\'fontWeight\\', parseInt(this.value))">' + weights + '</select></div>' +
      '<div style="flex:0 0 84px"><label>Size (cqh)</label><input type="number" min="0.5" max="50" step="0.25" value="' + (el.fontSize != null ? el.fontSize : 5) + '" oninput="setEl(\\'' + el.id + '\\', \\'fontSize\\', parseFloat(this.value))"/></div>' +
    '</div>' +
    '<div class="row field">' +
      '<div><label>Align</label><select onchange="setEl(\\'' + el.id + '\\', \\'align\\', this.value)">' +
        '<option value="left"' + (ta === 'left' ? ' selected' : '') + '>Left</option>' +
        '<option value="center"' + (ta === 'center' ? ' selected' : '') + '>Center</option>' +
        '<option value="right"' + (ta === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
      '<div><label>Color</label><div class="color-row">' +
        '<input type="color" value="' + hexFor(el.color, '#2a2a2a') + '" oninput="setEl(\\'' + el.id + '\\', \\'color\\', this.value);this.nextElementSibling.value=this.value"/>' +
        '<input type="text" value="' + escAttr(el.color || '#2a2a2a') + '" oninput="setEl(\\'' + el.id + '\\', \\'color\\', this.value)"/></div></div>' +
    '</div>';
}

function iconFields(el) {
  const src = el.iconSource || 'emoji';
  const builtin = BUILTIN_NAMES.map(n => '<option value="' + n + '"' + (el.iconName === n ? ' selected' : '') + '>' + n + '</option>').join('');
  let srcSpecific = '';
  if (src === 'emoji') {
    srcSpecific = '<div class="field"><label>Emoji</label><input type="text" value="' + escAttr(el.iconChar || '') + '" placeholder="\u{1F64F}" oninput="setEl(\\'' + el.id + '\\', \\'iconChar\\', this.value)"/></div>';
  } else if (src === 'builtin') {
    srcSpecific = '<div class="field"><label>Icon</label><select onchange="setEl(\\'' + el.id + '\\', \\'iconName\\', this.value)"><option value="">\u2014</option>' + builtin + '</select></div>';
  } else {
    srcSpecific = '<button class="btn btn-ghost btn-block" id="iconImgBtn">' + (el.iconImageId ? 'Replace icon image' : 'Upload icon image') + '</button>' +
      (el.iconImageId ? '<img class="img-preview" src="/images/' + encodeURIComponent(el.iconImageId) + '"/>' : '');
  }
  return '<div class="field"><label>Source</label><select onchange="setElRebuild(\\'' + el.id + '\\', \\'iconSource\\', this.value)">' +
      '<option value="emoji"' + (src === 'emoji' ? ' selected' : '') + '>Emoji</option>' +
      '<option value="builtin"' + (src === 'builtin' ? ' selected' : '') + '>Built-in</option>' +
      '<option value="image"' + (src === 'image' ? ' selected' : '') + '>Image</option></select></div>' +
    srcSpecific +
    '<div class="row field">' +
      '<div style="flex:0 0 90px"><label>Size (cqh)</label><input type="number" min="1" max="50" step="0.5" value="' + (el.iconSize != null ? el.iconSize : 7) + '" oninput="setEl(\\'' + el.id + '\\', \\'iconSize\\', parseFloat(this.value))"/></div>' +
      '<div><label>Color</label><div class="color-row">' +
        '<input type="color" value="' + hexFor(el.iconColor, '#2a2a2a') + '" oninput="setEl(\\'' + el.id + '\\', \\'iconColor\\', this.value);this.nextElementSibling.value=this.value"/>' +
        '<input type="text" value="' + escAttr(el.iconColor || '#2a2a2a') + '" oninput="setEl(\\'' + el.id + '\\', \\'iconColor\\', this.value)"/></div></div>' +
    '</div>';
}

function dividerFields(el) {
  return '<div class="row field">' +
      '<div><label>Width %</label><input type="number" min="5" max="100" step="5" value="' + (el.dividerWidth != null ? el.dividerWidth : 80) + '" oninput="setEl(\\'' + el.id + '\\', \\'dividerWidth\\', parseFloat(this.value))"/></div>' +
      '<div><label>Thickness</label><input type="number" min="0.01" max="2" step="0.01" value="' + (el.dividerThickness != null ? el.dividerThickness : 0.15) + '" oninput="setEl(\\'' + el.id + '\\', \\'dividerThickness\\', parseFloat(this.value))"/></div>' +
      '<div><label>Spacing</label><input type="number" min="0" max="10" step="0.1" value="' + (el.dividerSpacing != null ? el.dividerSpacing : 1.2) + '" oninput="setEl(\\'' + el.id + '\\', \\'dividerSpacing\\', parseFloat(this.value))"/></div>' +
    '</div>' +
    '<div class="field"><label>Color</label><input type="text" value="' + escAttr(el.dividerColor || 'rgba(40,40,40,.4)') + '" oninput="setEl(\\'' + el.id + '\\', \\'dividerColor\\', this.value)"/></div>';
}

function imageFields(el) {
  const placement = el.placement || 'inline';
  const pl = sel =>
    '<option value="' + sel + '"' + (placement === sel ? ' selected' : '') + '>';
  let html = '<button class="btn btn-ghost btn-block" id="elImgBtn">' + (el.imageId ? 'Replace image' : 'Upload image') + '</button>' +
    (el.imageId ? '<img class="img-preview" src="/images/' + encodeURIComponent(el.imageId) + '"/>' : '') +
    '<div class="field" style="margin-top:12px"><label>Placement</label>' +
    '<select onchange="setElRebuild(\\'' + el.id + '\\', \\'placement\\', this.value)">' +
    pl('inline') + 'Inline</option>' + pl('left') + 'Left (side panel)</option>' + pl('right') + 'Right (side panel)</option>' +
    '</select></div>';

  if (placement === 'inline') {
    html += '<div class="field"><label>Max height (cqh)</label><input type="number" min="1" max="90" step="1" value="' + (el.imageSize != null ? el.imageSize : 30) + '" oninput="setEl(\\'' + el.id + '\\', \\'imageSize\\', parseFloat(this.value))"/></div>';
  } else {
    const fit = el.sideFit || 'cover';
    html += '<div class="row field">' +
      '<div><label>Panel width %</label><input type="number" min="10" max="90" step="1" value="' + (el.sideWidth != null ? el.sideWidth : 45) + '" oninput="setEl(\\'' + el.id + '\\', \\'sideWidth\\', parseFloat(this.value))"/></div>' +
      '<div><label>Fit</label><select onchange="setEl(\\'' + el.id + '\\', \\'sideFit\\', this.value)">' +
      '<option value="cover"' + (fit === 'cover' ? ' selected' : '') + '>Cover (fill)</option>' +
      '<option value="contain"' + (fit === 'contain' ? ' selected' : '') + '>Contain (whole)</option>' +
      '</select></div>' +
    '</div>';
    const fade = el.sideFade != null ? el.sideFade : 0;
    const px = el.posX != null ? el.posX : 50;
    const py = el.posY != null ? el.posY : 50;
    html += '<div class="field"><label>Fade edge % (taper toward content)</label><input type="number" min="0" max="100" step="5" value="' + fade + '" oninput="setEl(\\'' + el.id + '\\', \\'sideFade\\', parseFloat(this.value))"/></div>' +
      '<div class="row field">' +
      '<div><label>Position X %</label><input type="number" min="0" max="100" step="5" value="' + px + '" oninput="setEl(\\'' + el.id + '\\', \\'posX\\', parseFloat(this.value))"/></div>' +
      '<div><label>Position Y %</label><input type="number" min="0" max="100" step="5" value="' + py + '" oninput="setEl(\\'' + el.id + '\\', \\'posY\\', parseFloat(this.value))"/></div>' +
      '</div>' +
      '<div class="hint" style="color:#9c8e7a;font-size:11px;margin-top:-4px">Position shifts which part of the image shows (X: 0 left\u2013100 right, Y: 0 top\u2013100 bottom; needs Fit = Cover). Add several images with the same side to stack them vertically in one panel.</div>';
  }
  return html;
}

function cardFields(el) {
  const cells = (el.cells && el.cells.length) ? el.cells : [{ text: '' }];
  const pillColorDefault = el.cellColor || '#ffffff';
  const wOpts = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']];
  const cellBlocks = cells.map((c, i) => {
    const curW = c.fontWeight != null ? c.fontWeight : '';
    const weights = '<option value=""' + (curW === '' ? ' selected' : '') + '>Weight (auto)</option>' +
      wOpts.map(o => '<option value="' + o[0] + '"' + (curW === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    const ta = c.align || 'center';
    const cf = (field, val) => 'setCardCellField(\\'' + el.id + '\\', ' + i + ', \\'' + field + '\\', ' + val + ')';
    return '<div class="pill-edit">' +
      '<div class="field" style="margin-bottom:6px"><label>Pill ' + (i + 1) +
        (cells.length > 1 ? '<button class="layer-del" style="float:right;margin-top:-2px" title="Remove pill" onclick="removeCardCell(\\'' + el.id + '\\', ' + i + ')">\xD7</button>' : '') +
      '</label>' +
      '<textarea rows="4" oninput="setCardCell(\\'' + el.id + '\\', ' + i + ', this.value)" placeholder="**Title**&#10;Detail line&#10;&#10;**More**&#10;Detail">' + escHtml(c.text) + '</textarea></div>' +
      '<div class="field" style="margin-bottom:6px"><div class="row"><select onchange="' + cf('fontFamily', 'this.value||undefined') + '" style="flex:2">' + fontOptionsForValue(c.fontFamily) + '</select>' +
        '<button class="btn btn-ghost btn-xs" style="flex:1" onclick="uploadFontForCell(\\'' + el.id + '\\', ' + i + ')">Upload</button></div></div>' +
      '<div class="row field" style="margin-bottom:6px">' +
        '<div><select onchange="' + cf('fontWeight', "this.value===''?undefined:parseInt(this.value)") + '">' + weights + '</select></div>' +
        '<div style="flex:0 0 78px"><input type="number" min="0.5" max="20" step="0.1" placeholder="size" value="' + (c.fontSize != null ? c.fontSize : '') + '" oninput="' + cf('fontSize', "this.value===''?undefined:parseFloat(this.value)") + '"/></div>' +
      '</div>' +
      '<div class="row field" style="margin-bottom:6px">' +
        '<div><select onchange="' + cf('align', 'this.value') + '">' +
          '<option value="left"' + (ta === 'left' ? ' selected' : '') + '>Left</option>' +
          '<option value="center"' + (ta === 'center' ? ' selected' : '') + '>Center</option>' +
          '<option value="right"' + (ta === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
        '<div class="color-row" style="flex:1">' +
          '<input type="color" value="' + hexFor(c.color, pillColorDefault) + '" oninput="' + cf('color', 'this.value') + '"/>' +
          '<input type="text" placeholder="pill color" value="' + escAttr(c.color || '') + '" oninput="' + cf('color', 'this.value||undefined') + '"/></div>' +
      '</div>' +
      '<details><summary>Pill spacing</summary><div class="details-body"><div class="row field">' +
        '<div><label>Line height</label><input type="number" min="0.8" max="3" step="0.05" placeholder="1.4" value="' + (c.lineHeight != null ? c.lineHeight : '') + '" oninput="' + cf('lineHeight', "this.value===''?undefined:parseFloat(this.value)") + '"/></div>' +
        '<div><label>Letter sp (em)</label><input type="number" min="-0.1" max="0.5" step="0.01" placeholder="0" value="' + (c.letterSpacing != null ? c.letterSpacing : '') + '" oninput="' + cf('letterSpacing', "this.value===''?undefined:parseFloat(this.value)") + '"/></div>' +
      '</div></div></details>' +
    '</div>';
  }).join('');
  const colorBox = (label, field, val, def) =>
    '<div><label>' + label + '</label><div class="color-row">' +
    '<input type="color" value="' + hexFor(val, def) + '" oninput="setEl(\\'' + el.id + '\\', \\'' + field + '\\', this.value)"/>' +
    '<input type="text" value="' + escAttr(val || def) + '" oninput="setEl(\\'' + el.id + '\\', \\'' + field + '\\', this.value)"/></div></div>';
  const hCurW = el.headerFontWeight != null ? el.headerFontWeight : 700;
  const hWeights = wOpts.map(o => '<option value="' + o[0] + '"' + (hCurW === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
  const hAlign = el.headerAlign || 'center';
  const headerStyleBlock =
    '<div class="field" style="margin-bottom:6px"><label>Header font</label><div class="row">' +
      '<select onchange="setEl(\\'' + el.id + '\\', \\'headerFontFamily\\', this.value||undefined)" style="flex:2">' + fontOptionsForValue(el.headerFontFamily) + '</select>' +
      '<button class="btn btn-ghost btn-xs" style="flex:1" onclick="uploadFontForHeader(\\'' + el.id + '\\')">Upload</button></div></div>' +
    '<div class="row field" style="margin-bottom:6px">' +
      '<div><label>Header weight</label><select onchange="setEl(\\'' + el.id + '\\', \\'headerFontWeight\\', this.value===\\'\\'?undefined:parseInt(this.value))"><option value=""' + (el.headerFontWeight == null ? ' selected' : '') + '>Bold (auto)</option>' + hWeights + '</select></div>' +
      '<div><label>Header align</label><select onchange="setEl(\\'' + el.id + '\\', \\'headerAlign\\', this.value)">' +
        '<option value="left"' + (hAlign === 'left' ? ' selected' : '') + '>Left</option>' +
        '<option value="center"' + (hAlign === 'center' ? ' selected' : '') + '>Center</option>' +
        '<option value="right"' + (hAlign === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
    '</div>' +
    '<details style="margin-bottom:6px"><summary>Header spacing</summary><div class="details-body"><div class="row field">' +
      '<div><label>Line height</label><input type="number" min="0.8" max="3" step="0.05" placeholder="1.25" value="' + (el.headerLineHeight != null ? el.headerLineHeight : '') + '" oninput="setEl(\\'' + el.id + '\\', \\'headerLineHeight\\', this.value===\\'\\'?undefined:parseFloat(this.value))"/></div>' +
      '<div><label>Letter sp (em)</label><input type="number" min="-0.1" max="0.5" step="0.01" placeholder="0" value="' + (el.headerLetterSpacing != null ? el.headerLetterSpacing : '') + '" oninput="setEl(\\'' + el.id + '\\', \\'headerLetterSpacing\\', this.value===\\'\\'?undefined:parseFloat(this.value))"/></div>' +
    '</div></div></details>';
  return '<div class="field"><label>Header (blank = no header bar)</label>' +
      '<input type="text" value="' + escAttr(el.headerText || '') + '" oninput="setEl(\\'' + el.id + '\\', \\'headerText\\', this.value||undefined)"/></div>' +
    headerStyleBlock +
    cellBlocks +
    '<button class="btn btn-ghost btn-xs btn-block" onclick="addCardCell(\\'' + el.id + '\\')">+ Add pill (side by side)</button>' +
    '<div class="row field" style="margin-top:12px">' + colorBox('Header bg', 'headerBg', el.headerBg, '#c0392b') + colorBox('Header text', 'headerColor', el.headerColor, '#ffffff') + '</div>' +
    '<div class="insp-title" style="margin:10px 0 4px">Card defaults</div>' +
    '<div class="row field">' + colorBox('Pill bg', 'cellBg', el.cellBg, '#2b2b2b') + colorBox('Default text', 'cellColor', el.cellColor, '#ffffff') + '</div>' +
    '<div class="row field">' +
      '<div><label>Header size</label><input type="number" min="1" max="10" step="0.1" value="' + (el.headerSize != null ? el.headerSize : 2.2) + '" oninput="setEl(\\'' + el.id + '\\', \\'headerSize\\', parseFloat(this.value))"/></div>' +
      '<div><label>Default size</label><input type="number" min="1" max="10" step="0.1" value="' + (el.cellSize != null ? el.cellSize : 2) + '" oninput="setEl(\\'' + el.id + '\\', \\'cellSize\\', parseFloat(this.value))"/></div>' +
      '<div><label>Card width %</label><input type="number" min="20" max="100" step="1" placeholder="full" value="' + (el.cardWidth != null ? el.cardWidth : '') + '" oninput="setEl(\\'' + el.id + '\\', \\'cardWidth\\', this.value===\\'\\'?undefined:parseFloat(this.value))"/></div>' +
    '</div>' +
    '<div class="empty-hint" style="text-align:left;padding:4px 0 0">Tip: wrap a line in **double asterisks** to make it bold. Set a card width (e.g. 48) to place cards side by side.</div>';
}

function cardElById(elId) {
  const s = curSlide();
  return s && s.elements ? s.elements.find(e => e.id === elId) || null : null;
}
function setCardCell(elId, idx, value) {
  const el = cardElById(elId);
  if (!el) return;
  if (!Array.isArray(el.cells) || !el.cells.length) el.cells = [{ text: '' }];
  if (!el.cells[idx]) el.cells[idx] = { text: '' };
  el.cells[idx].text = value;
  renderCanvas(); refreshThumb(selectedSlideId);
  scheduleSave();
}
// Per-pill style field (font, weight, size, color, align, line-height, letter-spacing).
function setCardCellField(elId, idx, field, value) {
  const el = cardElById(elId);
  if (!el) return;
  if (!Array.isArray(el.cells) || !el.cells.length) el.cells = [{ text: '' }];
  if (!el.cells[idx]) el.cells[idx] = { text: '' };
  if (value === undefined) delete el.cells[idx][field]; else el.cells[idx][field] = value;
  renderCanvas(); refreshThumb(selectedSlideId);
  scheduleSave();
}
async function uploadFontForCell(elId, idx) {
  const picked = await pickFile('.woff2,.woff,.ttf,.otf');
  if (!picked) return;
  const ext = picked.name.split('.').pop().toLowerCase();
  const family = picked.name.replace(/\\.\\w+$/, '');
  showToast('Uploading font\u2026');
  try {
    const id = await uploadFont(picked.dataUrl, family, ext);
    if (!Array.isArray(state.fonts)) state.fonts = [];
    state.fonts.push({ id, family, ext });
    setCardCellField(elId, idx, 'fontFamily', family);
    renderInspector();
    showToast('Font uploaded: ' + family);
    scheduleSave();
  } catch (e) { showToast('Font upload error: ' + e.message); }
}
async function uploadFontForHeader(elId) {
  const picked = await pickFile('.woff2,.woff,.ttf,.otf');
  if (!picked) return;
  const ext = picked.name.split('.').pop().toLowerCase();
  const family = picked.name.replace(/\\.\\w+$/, '');
  showToast('Uploading font\u2026');
  try {
    const id = await uploadFont(picked.dataUrl, family, ext);
    if (!Array.isArray(state.fonts)) state.fonts = [];
    state.fonts.push({ id, family, ext });
    setEl(elId, 'headerFontFamily', family);
    renderInspector();
    showToast('Font uploaded: ' + family);
    scheduleSave();
  } catch (e) { showToast('Font upload error: ' + e.message); }
}
function addCardCell(elId) {
  const el = cardElById(elId);
  if (!el) return;
  if (!Array.isArray(el.cells)) el.cells = [];
  if (!el.cells.length) el.cells.push({ text: '' });
  el.cells.push({ text: '' });
  renderCanvas(); renderInspector(); refreshThumb(selectedSlideId);
  scheduleSave();
}
function removeCardCell(elId, idx) {
  const el = cardElById(elId);
  if (!el || !Array.isArray(el.cells)) return;
  el.cells.splice(idx, 1);
  if (!el.cells.length) el.cells.push({ text: '' });
  renderCanvas(); renderInspector(); refreshThumb(selectedSlideId);
  scheduleSave();
}

// Wire up handlers that need JS (contenteditable, file pickers) after innerHTML.
function wireElementPanel() {
  const el = curEl();
  if (!el) return;

  if (el.kind === 'text') {
    const ce = document.getElementById('ceField');
    if (ce) {
      if (el.html) ce.innerHTML = el.html; else ce.textContent = el.text || '';
      ce.addEventListener('paste', (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
        else document.execCommand('insertText', false, text);
      });
      ce.addEventListener('input', () => {
        const html = ce.innerHTML.trim();
        const text = ce.innerText.trim();
        const cur = curEl();
        if (!cur) return;
        if (html) cur.html = html; else delete cur.html;
        cur.text = text;
        renderCanvas(); refreshThumb(selectedSlideId);
        updateLayerSelection();
        scheduleSave();
      });
    }
    const fb = document.getElementById('uploadFontBtn');
    if (fb) fb.onclick = () => uploadFontForEl(el.id);
  }

  if (el.kind === 'icon' && el.iconSource === 'image') {
    const b = document.getElementById('iconImgBtn');
    if (b) b.onclick = async () => {
      const picked = await pickFile('image/*');
      if (!picked) return;
      showToast('Uploading\u2026');
      try {
        const imageId = await uploadImage(picked.dataUrl);
        const cur = curEl(); if (!cur) return;
        cur.iconImageId = imageId;
        renderCanvas(); renderInspector(); refreshThumb(selectedSlideId);
        scheduleSave();
      } catch (e) { showToast('Error: ' + e.message); }
    };
  }

  if (el.kind === 'image') {
    const b = document.getElementById('elImgBtn');
    if (b) b.onclick = async () => {
      const picked = await pickFile('image/*');
      if (!picked) return;
      showToast('Uploading\u2026');
      try {
        const imageId = await uploadImage(picked.dataUrl);
        const cur = curEl(); if (!cur) return;
        cur.imageId = imageId;
        renderCanvas(); renderInspector(); refreshThumb(selectedSlideId);
        scheduleSave();
      } catch (e) { showToast('Error: ' + e.message); }
    };
  }
}

async function uploadFontForEl(elId) {
  const picked = await pickFile('.woff2,.woff,.ttf,.otf');
  if (!picked) return;
  const ext = picked.name.split('.').pop().toLowerCase();
  const family = picked.name.replace(/\\.\\w+$/, '');
  showToast('Uploading font\u2026');
  try {
    const id = await uploadFont(picked.dataUrl, family, ext);
    if (!Array.isArray(state.fonts)) state.fonts = [];
    state.fonts.push({ id, family, ext });
    setEl(elId, 'fontFamily', family);
    refreshFontPicker();
    showToast('Font uploaded: ' + family);
    scheduleSave();
  } catch (e) { showToast('Font upload error: ' + e.message); }
}

// \u2500\u2500 HTML helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}
function hexFor(color, fallback) {
  if (!color || !color.startsWith('#') || color.length < 4) return fallback;
  if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  return color.slice(0, 7);
}
function escHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) { return escHtml(str).replace(/'/g, '&#39;'); }

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
</script>
</body>
</html>`;
}
var server = null;
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function send(res, status, contentType, body) {
  const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(buf);
}
function sendJson(res, status, data) {
  send(res, status, "application/json", JSON.stringify(data));
}
async function handleRequest(req, res) {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  try {
    if (method === "GET" && url === "/") {
      send(res, 200, "text/html; charset=utf-8", buildConfigHtml());
      return;
    }
    if (method === "GET" && url === "/api/state") {
      const state = await readState();
      sendJson(res, 200, state);
      return;
    }
    if (method === "GET" && url === "/api/system-fonts") {
      const fonts = await listSystemFonts();
      sendJson(res, 200, { fonts });
      return;
    }
    if (method === "PUT" && url === "/api/state") {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      if (!isSignageStateBody(parsed)) {
        sendJson(res, 400, { error: "Body must include { slides: [], transitionMs: number }" });
        return;
      }
      const savedState = {
        slides: parsed.slides,
        fonts: Array.isArray(parsed.fonts) ? parsed.fonts : [],
        templates: Array.isArray(parsed.templates) ? parsed.templates : [],
        transitionMs: parsed.transitionMs,
        updatedAt: Date.now()
      };
      await writeState(savedState);
      console.log("[config-server] state saved", { slides: savedState.slides.length, fonts: savedState.fonts.length, transitionMs: savedState.transitionMs });
      broadcastSignageChanged(savedState);
      sendJson(res, 200, savedState);
      return;
    }
    if (method === "GET" && url === "/api/export") {
      const bundle = await exportBundle();
      const filename = `signflow-setup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.signflow.json`;
      const body = Buffer.from(JSON.stringify(bundle), "utf-8");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*"
      });
      res.end(body);
      return;
    }
    if (method === "POST" && url === "/api/import") {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      if (!isSignageBundle(parsed)) {
        sendJson(res, 400, { error: "Not a SignFlow setup file" });
        return;
      }
      const savedState = await importBundle(parsed);
      broadcastSignageChanged(savedState);
      sendJson(res, 200, savedState);
      return;
    }
    if (method === "POST" && url === "/api/images") {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      if (!isImageBody(parsed)) {
        sendJson(res, 400, { error: "Body must be { dataBase64: string }" });
        return;
      }
      const bytes = Buffer.from(parsed.dataBase64, "base64");
      const ext = imageExtForMime(parsed.mime);
      const imageId = (0, import_crypto.randomUUID)() + "." + ext;
      await saveImage(imageId, bytes);
      sendJson(res, 200, { imageId });
      return;
    }
    if (method === "GET" && url.startsWith("/images/")) {
      const imageId = decodeURIComponent(url.slice("/images/".length));
      const buf = await readImage(imageId);
      if (!buf) {
        sendJson(res, 404, { error: `Image not found: ${imageId}` });
        return;
      }
      send(res, 200, imageMimeForId(imageId), buf);
      return;
    }
    if (method === "POST" && url === "/api/fonts") {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      if (!isFontBody(parsed)) {
        sendJson(res, 400, { error: "Body must be { dataBase64: string, family: string, ext: string }" });
        return;
      }
      const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!["woff2", "woff", "ttf", "otf"].includes(ext)) {
        sendJson(res, 400, { error: `Unsupported font ext: ${parsed.ext}` });
        return;
      }
      const fontBytes = Buffer.from(parsed.dataBase64, "base64");
      const fontId = (0, import_crypto.randomUUID)() + "." + ext;
      await saveFont(fontId, fontBytes);
      console.log("[config-server] font uploaded", { fontId, family: parsed.family, ext });
      sendJson(res, 200, { id: fontId });
      return;
    }
    if (method === "GET" && url.startsWith("/fonts/")) {
      const fontId = decodeURIComponent(url.slice("/fonts/".length));
      const buf = await readFont(fontId);
      if (!buf) {
        console.error("[config-server] font not found", { fontId });
        sendJson(res, 404, { error: `Font not found: ${fontId}` });
        return;
      }
      const ext = fontId.split(".").pop()?.toLowerCase() ?? "";
      const mime = FONT_MIME[ext] ?? "application/octet-stream";
      send(res, 200, mime, buf);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[config-server] unhandled error:", { url, method, error: msg });
    sendJson(res, 500, { error: msg });
  }
}
function isSignageStateBody(v) {
  if (typeof v !== "object" || v === null) return false;
  const obj = v;
  return Array.isArray(obj.slides) && typeof obj.transitionMs === "number";
}
function isImageBody(v) {
  if (typeof v !== "object" || v === null) return false;
  const obj = v;
  return typeof obj.dataBase64 === "string" && (obj.mime === void 0 || typeof obj.mime === "string");
}
function isFontBody(v) {
  if (typeof v !== "object" || v === null) return false;
  const obj = v;
  return typeof obj.dataBase64 === "string" && typeof obj.family === "string" && typeof obj.ext === "string";
}
function startServerOnPort(port) {
  return new Promise((resolve, reject) => {
    server = import_http.default.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error("[config-server] fatal request error:", err);
        try {
          res.end();
        } catch {
        }
      });
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`EADDRINUSE on port ${port}`));
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      console.log(`[config-server] Listening on http://localhost:${port}`);
      resolve();
    });
  });
}
async function startConfigServer() {
  if (server) {
    await new Promise((resolve) => server.close(() => resolve()));
    server = null;
  }
  try {
    await startServerOnPort(PORT);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("EADDRINUSE")) {
      console.warn("[config-server] port in use, retrying after 500ms\u2026");
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await startServerOnPort(PORT);
      } catch (retryErr) {
        console.error("[config-server] retry also failed:", retryErr);
      }
    } else {
      console.error("[config-server] failed to start:", err);
    }
  }
}

// electron/main.ts
import_electron4.protocol.registerSchemesAsPrivileged([
  {
    scheme: "signage",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);
registerHandlers();
var mainWindow = null;
var FONT_MIME2 = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf"
};
function getPreloadPath() {
  return import_node_path.default.join(import_electron4.app.getAppPath(), "dist", "electron", "preload.cjs");
}
function getMainWindowTarget() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}/main-window.html`;
  }
  return import_node_path.default.join(import_electron4.app.getAppPath(), "dist", "renderer", "main-window.html");
}
async function loadMainWindowContent(win) {
  const target = getMainWindowTarget();
  if (target.startsWith("http://") || target.startsWith("https://")) {
    await win.loadURL(target);
    return;
  }
  await win.loadFile(target);
}
async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }
  const packageJsonPath = import_node_path.default.join(import_electron4.app.getAppPath(), "package.json");
  let windowTitle = "SignFlow";
  try {
    const packageJson = JSON.parse(await import_promises2.default.readFile(packageJsonPath, "utf-8"));
    windowTitle = packageJson.productName || windowTitle;
  } catch {
  }
  mainWindow = new import_electron4.BrowserWindow({
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
      sandbox: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  await loadMainWindowContent(mainWindow);
  mainWindow.setAspectRatio(16 / 9);
}
function setupApplicationMenu() {
  const menu = import_electron4.Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ]);
  import_electron4.Menu.setApplicationMenu(menu);
}
import_electron4.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron4.app.quit();
  }
});
import_electron4.app.on("activate", () => {
  if (import_electron4.BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  } else {
    mainWindow?.show();
  }
});
import_electron4.app.whenReady().then(async () => {
  import_electron4.protocol.handle("signage", async (request) => {
    const url = new URL(request.url);
    const kind = url.hostname;
    const id = url.pathname.replace(/^\//, "");
    try {
      if (kind === "font") {
        const filePath2 = await getFontPath(id);
        const ext = id.split(".").pop()?.toLowerCase() ?? "";
        const mime = FONT_MIME2[ext] ?? "application/octet-stream";
        return import_electron4.net.fetch((0, import_node_url.pathToFileURL)(filePath2).toString(), {
          headers: { "Content-Type": mime }
        });
      }
      const filePath = await getImagePath(id);
      return import_electron4.net.fetch((0, import_node_url.pathToFileURL)(filePath).href, {
        headers: { "Content-Type": imageMimeForId(id) }
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
//# sourceMappingURL=main.cjs.map
