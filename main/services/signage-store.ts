/**
 * Signage Store — types + read/write state, images and fonts
 *
 * Storage layout (inside data dir — see data-dir.ts):
 *   signage/state.json          — SignageState
 *   signage/images/<imageId>    — image files (imageId already includes extension)
 *   signage/fonts/<fontId>      — font files (fontId already includes extension)
 */

import fs from "fs/promises";
import path from "path";

import { getSignageDir } from "./data-dir.js";

// ── Contract types (shared with renderer) ────────────────────────────────────

export type ElementKind = "text" | "icon" | "divider" | "image" | "card";
export type ElementAlign = "left" | "center" | "right";
export type IconSource = "builtin" | "emoji" | "image";

/** One dark cell ("pill") inside a card. `text` is multi-line; a line wrapped in
 *  `**…**` renders bold, a blank line is a small gap. The optional style fields
 *  mirror a text element and override the card-level cell defaults for this pill. */
export interface CardCell {
  text: string;
  fontFamily?: string;
  fontWeight?: number;
  /** Font size in cqh units; overrides the card's cellSize. */
  fontSize?: number;
  /** Text color; overrides the card's cellColor. */
  color?: string;
  align?: ElementAlign;
  lineHeight?: number;
  /** Letter spacing in em. */
  letterSpacing?: number;
}

export interface SlideElement {
  id: string;
  kind: ElementKind;
  /** Reveal group; elements with the same step animate in together. */
  step: number;

  // text
  text?: string;
  /** Optional pre-formatted rich text (sanitized HTML, e.g. pasted from Illustrator).
   *  When set, it is rendered instead of `text`; structured font props act as base styles. */
  html?: string;
  fontFamily?: string;
  fontWeight?: number;
  /** Font size in cqh units (% of the 16:9 frame height). */
  fontSize?: number;
  color?: string;
  align?: ElementAlign;
  lineHeight?: number;
  /** Letter spacing in em. */
  letterSpacing?: number;
  /** Optional per-element width cap (% of slide content area). Overrides the
   * slide's content width for this text element so it can span wider. */
  textWidth?: number;

  // icon
  iconSource?: IconSource;
  iconName?: string;
  iconChar?: string;
  iconImageId?: string;
  /** Icon size in cqh units. */
  iconSize?: number;
  iconColor?: string;

  // divider
  /** Divider width as % of the content column. */
  dividerWidth?: number;
  /** Divider thickness in cqh units. */
  dividerThickness?: number;
  dividerColor?: string;
  /** Vertical margin around the divider in cqh units. */
  dividerSpacing?: number;

  // image
  imageId?: string;
  /** Max image height in cqh units (used when placement is "inline"). */
  imageSize?: number;
  /** Where the image sits: inline in the content flow, or pinned full-height to a side. */
  placement?: "inline" | "left" | "right";
  /** Side-panel width as % of the slide width (used when placement is "left"/"right"). */
  sideWidth?: number;
  /** How a side image fills its panel. */
  sideFit?: "cover" | "contain";
  /** Opacity taper toward the content edge, as % of the image width that fades out (0 = no fade). Multiple left/right images stack vertically in one panel. */
  sideFade?: number;
  /** object-position X% for a side (cover) image — repositions the visible crop horizontally (0 = left, 100 = right, default 50). */
  posX?: number;
  /** object-position Y% for a side (cover) image — repositions the visible crop vertically (0 = top, 100 = bottom, default 50). */
  posY?: number;

  // card — a colored header bar above one or more dark cells (activity board look)
  /** Header bar text; omit/empty to hide the header bar. */
  headerText?: string;
  headerBg?: string;
  headerColor?: string;
  /** Header font size in cqh units. */
  headerSize?: number;
  /** Header text styling (mirrors a text element); falls back to bold/centered defaults. */
  headerFontFamily?: string;
  headerFontWeight?: number;
  headerAlign?: ElementAlign;
  headerLineHeight?: number;
  /** Header letter spacing in em. */
  headerLetterSpacing?: number;
  cells?: CardCell[];
  cellBg?: string;
  cellColor?: string;
  /** Cell font size in cqh units. */
  cellSize?: number;
  /** Card width as % of the content area. When set, cards in the same step wrap
   *  side-by-side into a grid; omit for a full-width stacked card. */
  cardWidth?: number;
}

export type SlideAlign = "left" | "center" | "right";
export type SlideVAlign = "top" | "center" | "bottom";

export interface Slide {
  id: string;
  type: "image" | "custom";
  durationMs: number;

  // image type
  imageId?: string;
  fit?: "cover" | "contain";

  // custom type
  elements?: SlideElement[];
  /** Horizontal placement of the content column. */
  align?: SlideAlign;
  vAlign?: SlideVAlign;
  /** Content column max width as % of the frame width. */
  contentWidth?: number;
  /** Optional CSS background override; defaults to the beige base. */
  background?: string;
  /** Delay between reveal steps in ms. */
  revealDelayMs?: number;
  /** How grouped reveal steps play: staged one-after-another, or all at once. */
  reveal?: "sequential" | "together";
  /** Default vertical gap between elements in cqh units. */
  gap?: number;
}

export interface FontAsset {
  /** Includes the file extension, e.g. "<uuid>.woff2". */
  id: string;
  /** CSS font-family name used to reference the font. */
  family: string;
  /** File extension without the dot. */
  ext: string;
}

/** A reusable saved slide. `slide` holds a full slide definition; its ids are
 *  regenerated when the template is applied so each insertion is independent. */
export interface SlideTemplate {
  id: string;
  name: string;
  slide: Slide;
  createdAt: number;
}

export interface SignageState {
  slides: Slide[];
  fonts: FontAsset[];
  /** User-saved slide templates, reusable from the editor. */
  templates: SlideTemplate[];
  transitionMs: number;
  updatedAt: number;
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: SignageState = {
  slides: [],
  fonts: [],
  templates: [],
  transitionMs: 1200,
  updatedAt: 0,
};

// ── Path helpers ──────────────────────────────────────────────────────────────

async function getStatePath(): Promise<string> {
  const dir = await getSignageDir();
  return path.join(dir, "state.json");
}

async function getImagesDir(): Promise<string> {
  const dir = await getSignageDir();
  return path.join(dir, "images");
}

async function getFontsDir(): Promise<string> {
  const dir = await getSignageDir();
  return path.join(dir, "fonts");
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(await getImagesDir(), { recursive: true });
  await fs.mkdir(await getFontsDir(), { recursive: true });
}

// ── State I/O ─────────────────────────────────────────────────────────────────

export async function readState(): Promise<SignageState> {
  try {
    const statePath = await getStatePath();
    const raw = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (isSignageState(parsed)) {
      return migrateState(parsed);
    }
    console.error("[signage-store] state.json malformed, using defaults");
    return { ...DEFAULT_STATE };
  } catch {
    // File missing — return defaults
    return { ...DEFAULT_STATE };
  }
}

export async function writeState(state: SignageState): Promise<void> {
  await ensureDirs();
  const statePath = await getStatePath();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  console.log("[signage:state-saved]", { slides: state.slides.length, fonts: state.fonts.length });
}

// ── Migration ───────────────────────────────────────────────────────────────
// Converts legacy custom slides (heading/body/layout) into the element model and
// guarantees newer fields (fonts, elements) exist so old state.json keeps working.

function migrateState(state: SignageState): SignageState {
  const fonts = Array.isArray(state.fonts) ? state.fonts : [];
  const templates = Array.isArray(state.templates) ? state.templates : [];
  const slides = state.slides.map((slide) => {
    if (slide.type !== "custom") return slide;
    if (Array.isArray(slide.elements) && slide.elements.length > 0) return slide;

    const legacy = slide as Slide & { heading?: string; body?: string; customImageId?: string };
    const elements: SlideElement[] = [];
    if (legacy.customImageId) {
      elements.push({
        id: "el-" + Math.random().toString(36).slice(2, 10),
        kind: "image",
        step: 0,
        imageId: legacy.customImageId,
        imageSize: 45,
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
        lineHeight: 1.15,
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
        lineHeight: 1.5,
      });
    }
    return {
      id: slide.id,
      type: "custom" as const,
      durationMs: slide.durationMs,
      elements,
      align: "center" as const,
      vAlign: "center" as const,
      contentWidth: 80,
      revealDelayMs: 700,
      gap: 2.5,
    };
  });
  return { ...state, fonts, templates, slides };
}

// ── Image MIME helpers ────────────────────────────────────────────────────────
// imageId carries its file extension, so format is preserved end-to-end
// (upload → disk → HTTP preview + signage:// player protocol). SVG included.

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** Content-Type for an imageId based on its extension (defaults to PNG for legacy ids). */
export function imageMimeForId(imageId: string): string {
  const ext = imageId.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT_MIME[ext] ?? "image/png";
}

/** File extension (no dot) for an upload's MIME type; defaults to png for unknown types. */
export function imageExtForMime(mime: string | undefined): string {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg") return "jpg";
  for (const [ext, mt] of Object.entries(IMAGE_EXT_MIME)) {
    if (mt === m) return ext;
  }
  return "png";
}

// ── Image I/O ─────────────────────────────────────────────────────────────────

export async function saveImage(imageId: string, bytes: Buffer): Promise<void> {
  await ensureDirs();
  const imagesDir = await getImagesDir();
  const imgPath = path.join(imagesDir, path.basename(imageId));
  await fs.writeFile(imgPath, bytes);
  console.log("[signage:image-saved]", { imageId, bytes: bytes.length });
}

export async function readImage(imageId: string): Promise<Buffer | null> {
  try {
    const imagesDir = await getImagesDir();
    const imgPath = path.join(imagesDir, path.basename(imageId)); // prevent traversal
    return await fs.readFile(imgPath);
  } catch {
    console.error("[signage-store] image not found:", imageId);
    return null;
  }
}

export async function getImagePath(imageId: string): Promise<string> {
  const imagesDir = await getImagesDir();
  return path.join(imagesDir, path.basename(imageId));
}

// ── Font I/O ────────────────────────────────────────────────────────────────

export async function saveFont(fontId: string, bytes: Buffer): Promise<void> {
  await ensureDirs();
  const fontsDir = await getFontsDir();
  const fontPath = path.join(fontsDir, path.basename(fontId));
  await fs.writeFile(fontPath, bytes);
  console.log("[signage:font-saved]", { fontId, bytes: bytes.length });
}

export async function readFont(fontId: string): Promise<Buffer | null> {
  try {
    const fontsDir = await getFontsDir();
    const fontPath = path.join(fontsDir, path.basename(fontId)); // prevent traversal
    return await fs.readFile(fontPath);
  } catch {
    console.error("[signage-store] font not found:", fontId);
    return null;
  }
}

export async function getFontPath(fontId: string): Promise<string> {
  const fontsDir = await getFontsDir();
  return path.join(fontsDir, path.basename(fontId));
}

// ── Export / Import bundle ────────────────────────────────────────────────────
// A self-contained, portable snapshot of an entire SignFlow setup: the full
// state plus every referenced image and uploaded font, base64-encoded so the
// whole config moves as a single JSON file between instances. Asset ids (UUIDs)
// are preserved on import so all signage:// references keep resolving.

export const BUNDLE_FORMAT = "signflow-bundle";
export const BUNDLE_VERSION = 1;

export interface BundleAsset {
  /** Original asset id (includes extension); preserved on import. */
  id: string;
  dataBase64: string;
}

export interface SignageBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: number;
  state: SignageState;
  images: BundleAsset[];
  fonts: BundleAsset[];
}

/** Every image id referenced by the state (slide images, image + icon elements). */
function collectImageIds(state: SignageState): string[] {
  const ids = new Set<string>();
  const scanSlide = (slide: Slide) => {
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

export async function exportBundle(): Promise<SignageBundle> {
  const state = await readState();
  const images: BundleAsset[] = [];
  for (const id of collectImageIds(state)) {
    const buf = await readImage(id);
    if (buf) images.push({ id, dataBase64: buf.toString("base64") });
  }
  const fonts: BundleAsset[] = [];
  for (const font of state.fonts) {
    const buf = await readFont(font.id);
    if (buf) fonts.push({ id: font.id, dataBase64: buf.toString("base64") });
  }
  console.log("[signage:export]", { slides: state.slides.length, images: images.length, fonts: fonts.length });
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: Date.now(), state, images, fonts };
}

export function isSignageBundle(v: unknown): v is SignageBundle {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.format === BUNDLE_FORMAT &&
    typeof obj.state === "object" &&
    obj.state !== null &&
    Array.isArray(obj.images) &&
    Array.isArray(obj.fonts)
  );
}

/** Restore a bundle, replacing the current setup. Assets are written first so
 *  every reference resolves once the new state goes live. */
export async function importBundle(bundle: SignageBundle): Promise<SignageState> {
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
    updatedAt: Date.now(),
  });
  await writeState(normalized);
  console.log("[signage:import]", {
    slides: normalized.slides.length,
    images: bundle.images.length,
    fonts: bundle.fonts.length,
  });
  return normalized;
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isSignageState(v: unknown): v is SignageState {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.slides) && typeof obj.transitionMs === "number";
}
