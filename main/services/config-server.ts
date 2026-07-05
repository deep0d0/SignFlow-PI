/**
 * Config HTTP server — http://<host>:8773 (default bind: all interfaces)
 *
 * GET  /                          → self-contained config UI HTML
 * GET  /api/state                 → SignageState JSON
 * GET  /api/system-fonts          → { fonts: string[] } installed font families
 * PUT  /api/state (JSON body)     → save full SignageState + broadcast, return saved state
 * GET  /api/export                → download a portable setup bundle (state + images + fonts)
 * POST /api/import (bundle JSON)  → restore a bundle, replace setup + broadcast, return saved state
 * POST /api/images ({dataBase64, mime?}) → save image (format from mime, SVG ok), return { imageId }
 * GET  /images/<imageId>          → serve image for preview (Content-Type from extension)
 * POST /api/fonts ({dataBase64, family, ext}) → save font, return { id }
 * GET  /fonts/<fontId>            → serve font file (woff2/woff/ttf/otf)
 */

import http from "http";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

import { broadcastSignageChanged, onSignageChanged } from "./signage-events.js";
import { getAppRoot } from "./data-dir.js";

import {
  readState,
  writeState,
  saveImage,
  readImage,
  saveFont,
  readFont,
  imageMimeForId,
  imageExtForMime,
  exportBundle,
  importBundle,
  isSignageBundle,
} from "./signage-store.js";
import type { SignageState } from "./signage-store.js";

const PORT = Number(process.env.SIGNFLOW_PORT) || 8773;
/** Bind address. Use 0.0.0.0 on a Pi so LAN clients can reach http://<pi-ip>:8773 */
const BIND_HOST = process.env.SIGNFLOW_BIND_HOST ?? "0.0.0.0";

const FONT_MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

// ── System fonts (enumerated on the backend, cached) ────────────────────────────
const execFileAsync = promisify(execFile);
let systemFontsCache: string[] | null = null;

/**
 * List installed font family names (macOS: system_profiler, Linux: fc-list).
 * Browser font enumeration (queryLocalFonts) is unreliable — absent in Safari and
 * permission-gated in Chrome — so the editor pulls the list from here instead.
 * Cached for the server lifetime (the call is slow and fonts rarely change).
 */
async function listSystemFonts(): Promise<string[]> {
  if (systemFontsCache) return systemFontsCache;

  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileAsync(
        "fc-list",
        [":", "family"],
        { maxBuffer: 16 * 1024 * 1024, timeout: 15_000 },
      );
      const families = new Set<string>();
      for (const line of stdout.split("\n")) {
        for (const part of line.split(",")) {
          const name = part.trim();
          if (name && !name.startsWith(".")) families.add(name);
        }
      }
      systemFontsCache = [...families].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      console.error("[config-server] failed to list system fonts (fc-list)", err);
      systemFontsCache = [];
    }
    return systemFontsCache;
  }

  if (process.platform !== "darwin") {
    systemFontsCache = [];
    return systemFontsCache;
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/system_profiler",
      ["SPFontsDataType", "-json"],
      { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 },
    );
    const parsed = JSON.parse(stdout) as {
      SPFontsDataType?: Array<{ typefaces?: Array<{ family?: string }> }>;
    };
    const families = new Set<string>();
    for (const entry of parsed.SPFontsDataType ?? []) {
      for (const tf of entry.typefaces ?? []) {
        // Skip Apple's hidden/internal fonts (dot-prefixed) — not user-selectable.
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

// ── HTML config UI ────────────────────────────────────────────────────────────

function buildConfigHtml(): string {
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

  /* ── Left rail: slides ── */
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

  /* ── Templates (rail footer) ── */
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

  /* ── Center stage ── */
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

  /* ── Right inspector ── */
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
  summary::before { content: "▸ "; }
  details[open] summary::before { content: "▾ "; }
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

  /* ── Layers (elements) ── */
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

  /* ── Card pill editor ── */
  .pill-edit { border: 1px solid var(--border-soft); border-radius: 8px; padding: 9px; margin-bottom: 9px; background: rgba(255,255,255,.5); }
  .pill-edit textarea { min-height: 0; }
  .pill-edit details { margin-top: 2px; }

  /* ── Toast ── */
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
      <div class="rail-sub">Slides · changes save automatically</div>
    </div>
    <div class="rail-scroll" id="railScroll"></div>
    <div class="rail-foot">
      <button class="btn btn-primary btn-block" onclick="addCustomSlide()">+ Custom slide</button>
      <button class="btn btn-ghost btn-block" onclick="addImageSlide()">+ Image slide</button>
      <button class="btn btn-ghost btn-block btn-xs" onclick="saveAsTemplate()">★ Save slide as template</button>
      <div class="tpl-list" id="tplList"></div>
      <div class="rail-divider"></div>
      <div class="row" style="gap:7px">
        <button class="btn btn-ghost btn-xs" onclick="exportSetup()" title="Download the whole setup (slides, images, fonts) as one file">↧ Export setup</button>
        <button class="btn btn-ghost btn-xs" onclick="importSetup()" title="Replace this setup with one exported from another instance">↥ Import setup</button>
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

// ── State ─────────────────────────────────────────────────────────────────────
let state = { slides: [], fonts: [], templates: [], transitionMs: 1200, updatedAt: 0 };
let systemFamilies = [];
let fontsLoaded = false;
let selectedSlideId = null;
let selectedElId = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
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

// ── Save ──────────────────────────────────────────────────────────────────────
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

// ── Fonts ─────────────────────────────────────────────────────────────────────
async function tryLoadSystemFonts() {
  if (fontsLoaded) return;
  try {
    const res = await fetch('/api/system-fonts');
    const data = await res.json();
    systemFamilies = Array.isArray(data.fonts) ? data.fonts : [];
    fontsLoaded = true;
    refreshFontPicker();
  } catch (e) {
    // Backend unavailable — leave the dropdown with uploaded fonts only.
  }
}
// Rebuild the font <select> in place (used after async font load / font upload),
// so we don't re-render the whole inspector and lose focus while editing text.
function refreshFontPicker() {
  const el = curEl();
  if (!el) return;
  // Text element has a single in-place select (#fontSelect) we can swap without
  // a full rebuild. Cards have multiple font selects (header + each pill) that
  // depend on different current values, so just re-render the inspector — this
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function newId(p) { return (p || 'id') + '-' + Math.random().toString(36).slice(2, 10); }
function alignItemsFor(a) { return a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center'; }
function justifyFor(v) { return v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center'; }
// Soft (smoothstep) opacity taper toward the content edge of a side image — mirrors sideFadeMask in slide-renderer.tsx.
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

// ── Add slides ────────────────────────────────────────────────────────────────
async function addImageSlide() {
  const picked = await pickFile('image/*');
  if (!picked) return;
  showToast('Uploading image…');
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
// ── Templates ───────────────────────────────────────────────────────────────
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
      { id: newId('el'), kind: 'icon', step: 0, iconSource: 'emoji', iconChar: '👥', iconSize: 7, iconColor: '#2b2b2b' },
      tplText(0, 'Weekly Sunday Activities', 4.2, 800),
      tplText(0, 'રવિવારની પ્રવૃત્તિઓ', 3.4, 600),
      { id: newId('el'), kind: 'divider', step: 0, dividerWidth: 16, dividerThickness: 0.22, dividerColor: '#2b2b2b', dividerSpacing: 1.0 },
      tplCard(1, 'Bal – Balika Mandal  |  Kindergarten – 8th Grade', [
        tplPill('Bal Sabha (boys)', '4:00pm to 6:00pm', 'બાલ સભા (છોકરાઓ)', 'સાંજે ૪:૦૦ – ૬:૦૦'),
        tplPill('Balika Sabha (girls)', '4:00pm to 6:00pm', 'બાલિકા સભા (છોકરીઓ)', 'સાંજે ૪:૦૦ – ૬:૦૦'),
      ]),
      tplCard(1, 'Kishore – Kishori Mandal  |  9th Grade – College', [
        tplPill('Kishore Sabha (boys)', '2:00pm to 3:30pm', 'કિશોર સભા (છોકરાઓ)', 'બપોરે ૨:૦૦ – ૩:૩૦'),
        tplPill('Kishori Sabha (girls)', '2:00pm to 3:30pm', 'કિશોરી સભા (છોકરીઓ)', 'બપોરે ૨:૦૦ – ૩:૩૦'),
      ]),
      tplCard(2, 'Yuvak – Yuvati Mandal  |  Ages 22 and up', [
        tplPill('Yuvak Sabha (males)', '4:00pm to 6:00pm', 'યુવક સભા (પુરુષો)', 'બપોરે ૩:૩૦ – ૫:૦૦'),
        tplPill('Yuvati Sabha (females)', '4:00pm to 6:00pm', 'યુવતી સભા (મહિલાઓ)', 'સાંજે ૪:૦૦ – ૬:૦૦'),
      ]),
      tplCard(2, 'Mandal Activities  |  Ages 30 and up', [
        tplPill('Sanyukta Sabha (all)', '4:00pm to 6:00pm', 'સંયુક્તા સભા (બધા)', 'સાંજે ૪:૦૦ – ૬:૦૦'),
        tplPill('Mahila Sabha (females)', '2:15pm to 3:30pm', 'મહિલા સભા (મહિલાઓ)', 'બપોરે ૨:૧૫ – ૩:૩૦'),
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
      '<span class="tpl-star">' + (t.builtin ? '◆' : '★') + '</span>' +
      '<span class="tpl-name">' + escHtml(t.name) + (t.builtin ? ' <span style="color:var(--brown-light);font-size:9px">starter</span>' : '') + '</span>' +
      (t.builtin ? '' : '<button class="tpl-del" title="Delete template" onclick="deleteTemplate(\\'' + t.id + '\\', event)">×</button>') +
    '</div>').join('');
}

// ── Export / Import setup ───────────────────────────────────────────────────
async function exportSetup() {
  showToast('Preparing export…');
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
  showToast('Importing…');
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

// ── Selection ─────────────────────────────────────────────────────────────────
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

// ── Elements ──────────────────────────────────────────────────────────────────
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

// ── Render: top-level ─────────────────────────────────────────────────────────
function renderAll() {
  renderRail();
  renderCanvas();
  renderInspector();
  renderTemplates();
}

// ── Render: rail ──────────────────────────────────────────────────────────────
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
    del.textContent = '×';
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

// ── Slide drag reorder ────────────────────────────────────────────────────────
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

// ── Element (layer) drag reorder ──────────────────────────────────────────────
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

// ── Render: canvas ────────────────────────────────────────────────────────────
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
      ? '<div style="color:#9c8e7a;font-size:3cqh;text-align:center;width:100%;">Add elements from the right panel →</div>'
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

// ── Render: inspector ─────────────────────────────────────────────────────────
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
    showToast('Uploading…');
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
    return t ? (t.length > 24 ? t.slice(0, 24) + '…' : t) : 'Text';
  }
  if (el.kind === 'icon') return 'Icon';
  if (el.kind === 'divider') return 'Divider';
  if (el.kind === 'image') return 'Image';
  if (el.kind === 'card') { const h = (el.headerText || '').trim(); return h ? (h.length > 24 ? h.slice(0, 24) + '…' : h) : 'Card'; }
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
      '<span class="layer-handle">☰</span>' +
      '<span class="layer-badge lk-' + el.kind + '">' + el.kind.charAt(0) + '</span>' +
      '<span class="layer-label">' + escHtml(elLabel(el)) + '</span>' +
      '<button class="layer-dup" title="Duplicate" onclick="duplicateElement(\\'' + el.id + '\\', event)">⧉</button>' +
      '<button class="layer-del" title="Delete" onclick="deleteElement(\\'' + el.id + '\\', event)">×</button>' +
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
    srcSpecific = '<div class="field"><label>Emoji</label><input type="text" value="' + escAttr(el.iconChar || '') + '" placeholder="🙏" oninput="setEl(\\'' + el.id + '\\', \\'iconChar\\', this.value)"/></div>';
  } else if (src === 'builtin') {
    srcSpecific = '<div class="field"><label>Icon</label><select onchange="setEl(\\'' + el.id + '\\', \\'iconName\\', this.value)"><option value="">—</option>' + builtin + '</select></div>';
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
      '<div class="hint" style="color:#9c8e7a;font-size:11px;margin-top:-4px">Position shifts which part of the image shows (X: 0 left–100 right, Y: 0 top–100 bottom; needs Fit = Cover). Add several images with the same side to stack them vertically in one panel.</div>';
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
        (cells.length > 1 ? '<button class="layer-del" style="float:right;margin-top:-2px" title="Remove pill" onclick="removeCardCell(\\'' + el.id + '\\', ' + i + ')">×</button>' : '') +
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
  showToast('Uploading font…');
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
  showToast('Uploading font…');
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
      showToast('Uploading…');
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
      showToast('Uploading…');
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
  showToast('Uploading font…');
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

// ── HTML helpers ──────────────────────────────────────────────────────────────
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

// ── Display static files + SSE ──────────────────────────────────────────────

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function getRendererDir(): string {
  return path.join(getAppRoot(), "dist", "renderer");
}

async function serveDisplayStatic(
  urlPath: string,
  res: http.ServerResponse,
): Promise<boolean> {
  if (!urlPath.startsWith("/display/")) return false;

  const rel = urlPath.slice("/display/".length);
  if (!rel || rel.includes("..")) {
    sendJson(res, 400, { error: "Invalid path" });
    return true;
  }

  const filePath = path.join(getRendererDir(), rel);
  const rendererDir = path.resolve(getRendererDir());
  if (!path.resolve(filePath).startsWith(rendererDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return true;
  }

  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, STATIC_MIME[ext] ?? "application/octet-stream", buf);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
  return true;
}

const sseClients = new Set<http.ServerResponse>();

onSignageChanged((state) => {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
});

// ── HTTP server ───────────────────────────────────────────────────────────────

let server: http.Server | null = null;

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buf);
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  send(res, status, "application/json", JSON.stringify(data));
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // GET /display → redirect so relative asset paths resolve under /display/
    if (method === "GET" && (url === "/display" || url === "/display?")) {
      res.writeHead(302, { Location: "/display/" });
      res.end();
      return;
    }

    // GET /display/ — fullscreen signage viewer (Chromium kiosk on Pi)
    if (method === "GET" && url === "/display/") {
      const htmlPath = path.join(getRendererDir(), "main-window.html");
      try {
        const html = await fs.readFile(htmlPath);
        send(res, 200, "text/html; charset=utf-8", html);
      } catch {
        sendJson(res, 503, {
          error: "Display not built. Run: npm run build",
        });
      }
      return;
    }

    // GET /display/assets/… — Vite-built JS/CSS for the viewer
    if (method === "GET" && url.startsWith("/display/")) {
      const handled = await serveDisplayStatic(url.split("?")[0] ?? url, res);
      if (handled) return;
    }

    // GET /api/events — live state updates for the browser viewer (SSE)
    if (method === "GET" && url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");
      sseClients.add(res);
      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    // GET /
    if (method === "GET" && url === "/") {
      send(res, 200, "text/html; charset=utf-8", buildConfigHtml());
      return;
    }

    // GET /api/state
    if (method === "GET" && url === "/api/state") {
      const state = await readState();
      sendJson(res, 200, state);
      return;
    }

    // GET /api/system-fonts — installed font families (for the editor dropdown)
    if (method === "GET" && url === "/api/system-fonts") {
      const fonts = await listSystemFonts();
      sendJson(res, 200, { fonts });
      return;
    }

    // PUT /api/state — persist full SignageState
    if (method === "PUT" && url === "/api/state") {
      const raw = await readBody(req);
      let parsed: unknown;
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

      const savedState: SignageState = {
        slides: parsed.slides,
        fonts: Array.isArray(parsed.fonts) ? parsed.fonts : [],
        templates: Array.isArray(parsed.templates) ? parsed.templates : [],
        transitionMs: parsed.transitionMs,
        updatedAt: Date.now(),
      };

      await writeState(savedState);
      console.log("[config-server] state saved", { slides: savedState.slides.length, fonts: savedState.fonts.length, transitionMs: savedState.transitionMs });
      broadcastSignageChanged(savedState);
      sendJson(res, 200, savedState);
      return;
    }

    // GET /api/export — full portable setup bundle (state + images + fonts)
    if (method === "GET" && url === "/api/export") {
      const bundle = await exportBundle();
      const filename = `signflow-setup-${new Date().toISOString().slice(0, 10)}.signflow.json`;
      const body = Buffer.from(JSON.stringify(bundle), "utf-8");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
      return;
    }

    // POST /api/import — restore a bundle, replacing the current setup
    if (method === "POST" && url === "/api/import") {
      const raw = await readBody(req);
      let parsed: unknown;
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

    // POST /api/images
    if (method === "POST" && url === "/api/images") {
      const raw = await readBody(req);
      let parsed: unknown;
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
      const imageId = randomUUID() + "." + ext;
      await saveImage(imageId, bytes);
      sendJson(res, 200, { imageId });
      return;
    }

    // GET /images/<imageId>
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

    // POST /api/fonts
    if (method === "POST" && url === "/api/fonts") {
      const raw = await readBody(req);
      let parsed: unknown;
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
      const fontId = randomUUID() + "." + ext;
      await saveFont(fontId, fontBytes);
      console.log("[config-server] font uploaded", { fontId, family: parsed.family, ext });
      sendJson(res, 200, { id: fontId });
      return;
    }

    // GET /fonts/<fontId>
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

// ── Type guards ───────────────────────────────────────────────────────────────

interface SignageStateBody {
  slides: SignageState["slides"];
  fonts?: SignageState["fonts"];
  templates?: SignageState["templates"];
  transitionMs: number;
}

function isSignageStateBody(v: unknown): v is SignageStateBody {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.slides) && typeof obj.transitionMs === "number";
}

interface ImageBody {
  dataBase64: string;
  /** Optional source MIME type (e.g. "image/svg+xml") used to pick the stored extension. */
  mime?: string;
}

function isImageBody(v: unknown): v is ImageBody {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.dataBase64 === "string" && (obj.mime === undefined || typeof obj.mime === "string");
}

interface FontBody {
  dataBase64: string;
  family: string;
  ext: string;
}

function isFontBody(v: unknown): v is FontBody {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.dataBase64 === "string" &&
    typeof obj.family === "string" &&
    typeof obj.ext === "string"
  );
}

// ── Start / stop ──────────────────────────────────────────────────────────────

function startServerOnPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error("[config-server] fatal request error:", err);
        try { res.end(); } catch { /* ignore */ }
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`EADDRINUSE on port ${port}`));
      } else {
        reject(err);
      }
    });

    server.listen(port, BIND_HOST, () => {
      const hostLabel = BIND_HOST === "0.0.0.0" ? "all interfaces" : BIND_HOST;
      console.log(`[config-server] Listening on http://${hostLabel}:${port}`);
      resolve();
    });
  });
}

export async function startConfigServer(): Promise<void> {
  // Close existing server (hot-reload)
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }

  try {
    await startServerOnPort(PORT);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("EADDRINUSE")) {
      console.warn("[config-server] port in use, retrying after 500ms…");
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
