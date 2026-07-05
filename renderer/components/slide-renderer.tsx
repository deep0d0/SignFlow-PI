import * as React from "react";

import { imageUrl } from "../lib/signage-assets";

// ── Mirrored contract types (do NOT import from main/) ────────────────────────

export type ElementKind = "text" | "icon" | "divider" | "image" | "card";
export type ElementAlign = "left" | "center" | "right";
export type IconSource = "builtin" | "emoji" | "image";
export type SlideAlign = "left" | "center" | "right";
export type SlideVAlign = "top" | "center" | "bottom";

export interface CardCell {
  text: string;
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  color?: string;
  align?: ElementAlign;
  lineHeight?: number;
  letterSpacing?: number;
}

export interface SlideElement {
  id: string;
  kind: ElementKind;
  step: number;

  // text
  text?: string;
  html?: string;
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  color?: string;
  align?: ElementAlign;
  lineHeight?: number;
  letterSpacing?: number;
  textWidth?: number;

  // icon
  iconSource?: IconSource;
  iconName?: string;
  iconChar?: string;
  iconImageId?: string;
  iconSize?: number;
  iconColor?: string;

  // divider
  dividerWidth?: number;
  dividerThickness?: number;
  dividerColor?: string;
  dividerSpacing?: number;

  // image
  imageId?: string;
  imageSize?: number;
  placement?: "inline" | "left" | "right";
  sideWidth?: number;
  sideFit?: "cover" | "contain";
  sideFade?: number;
  posX?: number;
  posY?: number;

  // card
  headerText?: string;
  headerBg?: string;
  headerColor?: string;
  headerSize?: number;
  headerFontFamily?: string;
  headerFontWeight?: number;
  headerAlign?: "left" | "center" | "right";
  headerLineHeight?: number;
  headerLetterSpacing?: number;
  cells?: CardCell[];
  cellBg?: string;
  cellColor?: string;
  cellSize?: number;
  cardWidth?: number;
}

export interface Slide {
  id: string;
  type: "image" | "custom";
  durationMs: number;

  // image type
  imageId?: string;
  fit?: "cover" | "contain";

  // custom type
  elements?: SlideElement[];
  align?: SlideAlign;
  vAlign?: SlideVAlign;
  contentWidth?: number;
  background?: string;
  revealDelayMs?: number;
  reveal?: "sequential" | "together";
  gap?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BEIGE_BASE =
  "radial-gradient(125% 110% at 62% 42%, #f6efe0 0%, #efe3ca 48%, #e4d5b3 100%)";

// ── HTML sanitiser ─────────────────────────────────────────────────────────────
// Strips script/style/iframe elements and on* event attributes; keeps layout
// tags and inline styles for rich text pasted from design tools.

const BLOCKED_TAGS = new Set(["script", "style", "iframe", "link", "meta", "object", "embed"]);

function sanitizeHtml(raw: string): string {
  // 1. Strip blocked tags (with content for script/style; self-closing for others)
  let out = raw;
  for (const tag of BLOCKED_TAGS) {
    // Tag with content
    out = out.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    // Self-closing / void
    out = out.replace(new RegExp(`<${tag}[^>]*\\/?>`, "gi"), "");
  }
  // 2. Strip on* event attributes
  out = out.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // 3. Strip javascript: hrefs / src
  out = out.replace(/\s+(href|src)\s*=\s*"javascript:[^"]*"/gi, "");
  out = out.replace(/\s+(href|src)\s*=\s*'javascript:[^']*'/gi, "");
  return out;
}

// ── Built-in SVG icons ─────────────────────────────────────────────────────────

const BUILTIN_ICONS: Record<string, React.ReactElement> = {
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeWidth="2" stroke="currentColor" fill="none" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

// ── Element renderers ──────────────────────────────────────────────────────────

function TextElement({ el }: { el: SlideElement }) {
  const baseStyle: React.CSSProperties = {
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight,
    color: el.color,
    fontSize: el.fontSize != null ? `${el.fontSize}cqh` : undefined,
    textAlign: el.align,
    lineHeight: el.lineHeight ?? 1.3,
    letterSpacing: el.letterSpacing != null ? `${el.letterSpacing}em` : undefined,
    margin: 0,
    width: "100%",
  };

  if (el.html) {
    return (
      <div
        style={baseStyle}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(el.html) }}
      />
    );
  }

  return (
    <div style={{ ...baseStyle, whiteSpace: "pre-line" }}>
      {el.text ?? ""}
    </div>
  );
}

function IconElement({ el }: { el: SlideElement }) {
  const size = el.iconSize != null ? `${el.iconSize}cqh` : "8cqh";
  const color = el.iconColor ?? "currentColor";

  if (el.iconSource === "emoji" && el.iconChar) {
    return (
      <div
        style={{
          fontSize: size,
          color,
          lineHeight: 1,
          textAlign: "center",
        }}
        aria-hidden="true"
      >
        {el.iconChar}
      </div>
    );
  }

  if (el.iconSource === "image" && el.iconImageId) {
    return (
      <img
        src={imageUrl(el.iconImageId)}
        alt=""
        style={{
          maxHeight: size,
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }

  // builtin (default)
  const iconName = el.iconName ?? "star";
  const svgEl = BUILTIN_ICONS[iconName] ?? BUILTIN_ICONS["star"];
  return (
    <div
      style={{
        width: size,
        height: size,
        color,
        display: "block",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {svgEl}
    </div>
  );
}

function DividerElement({ el }: { el: SlideElement }) {
  const width = el.dividerWidth != null ? `${el.dividerWidth}%` : "60%";
  const thickness = el.dividerThickness != null ? `${el.dividerThickness}cqh` : "0.3cqh";
  const color = el.dividerColor ?? "currentColor";
  const spacing = el.dividerSpacing != null ? `${el.dividerSpacing}cqh` : "1cqh";

  return (
    <div
      style={{
        width,
        height: thickness,
        background: color,
        marginTop: spacing,
        marginBottom: spacing,
        flexShrink: 0,
      }}
    />
  );
}

function ImageElement({ el }: { el: SlideElement }) {
  if (!el.imageId) return null;
  const maxHeight = el.imageSize != null ? `${el.imageSize}cqh` : "40cqh";
  return (
    <img
      src={imageUrl(el.imageId)}
      alt=""
      style={{
        maxHeight,
        maxWidth: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

// Parse a cell's multi-line text: `**…**` lines render bold (non-bold lines
// inherit the pill's base weight), blank lines are gaps.
function renderCardLines(text: string): React.ReactNode {
  return (text ?? "").split("\n").map((raw, i) => {
    const ln = raw.trim();
    if (!ln) return <div key={i} style={{ height: "0.6cqh" }} />;
    const bold = ln.length >= 4 && ln.startsWith("**") && ln.endsWith("**");
    const content = bold ? ln.slice(2, -2) : ln;
    return (
      <div key={i} style={bold ? { fontWeight: 700 } : undefined}>
        {content}
      </div>
    );
  });
}

function CardElement({ el }: { el: SlideElement }) {
  const headerBg = el.headerBg ?? "#c0392b";
  const headerColor = el.headerColor ?? "#ffffff";
  const headerSize = el.headerSize ?? 2.2;
  const cellBg = el.cellBg ?? "#2b2b2b";
  const cellColor = el.cellColor ?? "#ffffff";
  const cellSize = el.cellSize ?? 2;
  const cells = el.cells && el.cells.length ? el.cells : [{ text: "" }];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.9cqh", boxSizing: "border-box" }}>
      {el.headerText ? (
        <div
          style={{
            background: headerBg,
            color: headerColor,
            borderRadius: "1.2cqh",
            padding: "0.9cqh 1.4cqh",
            textAlign: el.headerAlign ?? "center",
            fontFamily: el.headerFontFamily,
            fontWeight: el.headerFontWeight ?? 700,
            fontSize: `${headerSize}cqh`,
            lineHeight: el.headerLineHeight ?? 1.25,
            letterSpacing: el.headerLetterSpacing != null ? `${el.headerLetterSpacing}em` : undefined,
            boxSizing: "border-box",
          }}
        >
          {el.headerText}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "1cqh", alignItems: "stretch", width: "100%" }}>
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              background: cellBg,
              color: c.color ?? cellColor,
              borderRadius: "1.2cqh",
              padding: "1.2cqh 1cqh",
              textAlign: c.align ?? "center",
              fontFamily: c.fontFamily,
              fontWeight: c.fontWeight,
              fontSize: `${c.fontSize ?? cellSize}cqh`,
              lineHeight: c.lineHeight ?? 1.4,
              letterSpacing: c.letterSpacing != null ? `${c.letterSpacing}em` : undefined,
              boxSizing: "border-box",
            }}
          >
            {renderCardLines(c.text)}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderElement(el: SlideElement): React.ReactNode {
  switch (el.kind) {
    case "text":
      return <TextElement el={el} />;
    case "icon":
      return <IconElement el={el} />;
    case "divider":
      return <DividerElement el={el} />;
    case "image":
      return <ImageElement el={el} />;
    case "card":
      return <CardElement el={el} />;
    default:
      return null;
  }
}

// ── Props for the reveal-aware wrapper ────────────────────────────────────────

export interface SlideRendererProps {
  slide: Slide;
  /** Step index up to which elements are visible. Pass Infinity to show all. */
  revealedStep?: number;
}

// Build a soft opacity taper that dissolves the content-facing edge of a side
// image into the background. Uses an eased (smoothstep) alpha ramp with several
// stops so there's no visible hard line where the fade begins or ends.
function sideFadeMask(panelSide: SlideElement["placement"], fade: number): string | undefined {
  if (!fade || fade <= 0) return undefined;
  const dir = panelSide === "left" ? "right" : "left";
  const start = Math.max(0, 100 - fade); // fully opaque up to here, then ramp to 100%
  const at = (frac: number) => (start + frac * fade).toFixed(2);
  // smoothstep alpha samples (1 → 0) for a perceptually smooth, edge-free fade
  return (
    `linear-gradient(to ${dir}, ` +
    `#000 ${start}%, ` +
    `rgba(0,0,0,0.844) ${at(0.25)}%, ` +
    `rgba(0,0,0,0.5) ${at(0.5)}%, ` +
    `rgba(0,0,0,0.156) ${at(0.75)}%, ` +
    `transparent 100%)`
  );
}

// ── Custom slide ──────────────────────────────────────────────────────────────

function CustomSlide({ slide, revealedStep = Infinity }: SlideRendererProps) {
  const elements = slide.elements ?? [];
  const gap = slide.gap ?? 2.5;

  // Justify-content for vAlign
  const justifyMap: Record<SlideVAlign, string> = {
    top: "flex-start",
    center: "center",
    bottom: "flex-end",
  };
  // Align-items for align
  const alignMap: Record<SlideAlign, string> = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };
  // Text-align default for align
  const textAlignMap: Record<SlideAlign, React.CSSProperties["textAlign"]> = {
    left: "left",
    center: "center",
    right: "right",
  };

  const vAlign = slide.vAlign ?? "center";
  const hAlign = slide.align ?? "center";
  const contentWidth = slide.contentWidth ?? 80;
  const background = slide.background ?? BEIGE_BASE;

  // One or more image elements may be pinned full-height to a side; they stack
  // vertically into one panel and the rest of the elements flow beside it.
  const sideImages = elements.filter(
    (el) => el.kind === "image" && (el.placement === "left" || el.placement === "right"),
  );
  const panelSide = sideImages[0]?.placement;
  const contentElements = sideImages.length
    ? elements.filter((el) => !sideImages.includes(el))
    : elements;

  // Group elements by step, preserving order within each step
  const stepMap = new Map<number, SlideElement[]>();
  for (const el of contentElements) {
    const s = el.step ?? 0;
    if (!stepMap.has(s)) stepMap.set(s, []);
    stepMap.get(s)!.push(el);
  }
  const sortedSteps = Array.from(stepMap.keys()).sort((a, b) => a - b);

  const contentColumn = (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: justifyMap[vAlign],
        alignItems: alignMap[hAlign],
        overflow: "hidden",
      }}
    >
      {/* Content column. No flex gap here — inter-step spacing is an animated
          margin so collapsed (not-yet-revealed) groups reserve zero space and
          the column stays truly centered, letting earlier steps slide up
          smoothly as later steps expand. The content-width cap is applied
          per-element (below) instead of here, so individual text elements can
          opt to span wider than the rest of the content. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: alignMap[hAlign],
          textAlign: textAlignMap[hAlign],
          width: "100%",
        }}
      >
        {sortedSteps.map((step, idx) => {
          const stepElements = stepMap.get(step)!;
          const isVisible = step <= revealedStep;
          // grid-template-rows 0fr→1fr animates real height smoothly (WebKit 16+),
          // so the centered column recenters and earlier content rises gracefully.
          return (
            <div
              key={step}
              style={{
                display: "grid",
                gridTemplateRows: isVisible ? "1fr" : "0fr",
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(16px)",
                marginTop: idx > 0 && isVisible ? `${gap}cqh` : 0,
                width: "100%",
                transition:
                  "grid-template-rows 0.6s cubic-bezier(0.22,0.61,0.36,1)," +
                  "margin-top 0.6s cubic-bezier(0.22,0.61,0.36,1)," +
                  "opacity 0.45s ease," +
                  "transform 0.5s cubic-bezier(0.22,0.61,0.36,1)",
              }}
            >
              <div
                style={{
                  overflow: "hidden",
                  minHeight: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: alignMap[hAlign],
                  alignItems: "flex-start",
                  gap: `${gap}cqh`,
                  width: "100%",
                }}
              >
                {stepElements.map((el) => {
                  // Cards with a width pair up side-by-side (a grid); everything
                  // else takes a full row, capped to the slide content width.
                  const isGridCard = el.kind === "card" && el.cardWidth != null;
                  const wrapStyle: React.CSSProperties = isGridCard
                    ? {
                        width: `${el.cardWidth}%`,
                        maxWidth: `${el.cardWidth}%`,
                        flexShrink: 1,
                        minWidth: 0,
                      }
                    : {
                        width: "100%",
                        maxWidth:
                          el.kind === "text" && el.textWidth != null
                            ? `${el.textWidth}%`
                            : `${contentWidth}%`,
                      };
                  return (
                    <div
                      key={el.id}
                      style={{
                        ...wrapStyle,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: alignMap[hAlign],
                      }}
                    >
                      {renderElement(el)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const sidePanel = sideImages.length ? (
    <div
      style={{
        width: `${sideImages[0].sideWidth ?? 45}%`,
        height: "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {sideImages.map((img) => {
        // Taper toward the content side: fade the edge facing the content column.
        const mask = sideFadeMask(panelSide, img.sideFade ?? 0);
        return (
          <div key={img.id} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {img.imageId && (
              <img
                src={imageUrl(img.imageId)}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: img.sideFit ?? "cover",
                  objectPosition: `${img.posX ?? 50}% ${img.posY ?? 50}%`,
                  display: "block",
                  WebkitMaskImage: mask,
                  maskImage: mask,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background,
        display: "flex",
        flexDirection: "row",
        containerType: "size",
        overflow: "hidden",
      }}
    >
      {panelSide === "left" && sidePanel}
      {contentColumn}
      {panelSide === "right" && sidePanel}
    </div>
  );
}

// ── Image slide ───────────────────────────────────────────────────────────────

function ImageSlide({ slide }: { slide: Slide }) {
  const fit = slide.fit ?? "contain";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: BEIGE_BASE,
        containerType: "size",
      }}
    >
      {slide.imageId && (
        <img
          src={imageUrl(slide.imageId)}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
          }}
        />
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function SlideRenderer({ slide, revealedStep }: SlideRendererProps) {
  if (slide.type === "image") {
    return <ImageSlide slide={slide} />;
  }
  return <CustomSlide slide={slide} revealedStep={revealedStep} />;
}
