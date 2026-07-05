import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideRenderer } from "./slide-renderer";
import type { Slide } from "./slide-renderer";
import { fontUrl, imageUrl } from "../lib/signage-assets";
import { fetchSignageState, subscribeSignageChanged } from "../lib/signage-client";

// ── Mirrored contract types (do NOT import from main/) ────────────────────────

interface FontAsset {
  id: string;
  family: string;
  ext: string;
}

interface SignageState {
  slides: Slide[];
  fonts: FontAsset[];
  transitionMs: number;
  updatedAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SIGNAGE_QUERY_KEY = ["signage", "state"] as const;

const BEIGE_BASE =
  "radial-gradient(125% 110% at 62% 42%, #f6efe0 0%, #efe3ca 48%, #e4d5b3 100%)";

const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

// ── Keyframes injected once into the document ──────────────────────────────────

const KEYFRAMES_ID = "signage-keyframes";

function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes signage-flow-in {
      from {
        opacity: 0;
        transform: scale(1.04) translateY(12px);
        filter: blur(18px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
        filter: blur(0px);
      }
    }
    @keyframes signage-flow-out {
      from {
        opacity: 1;
        transform: scale(1) translateY(0);
        filter: blur(0px);
      }
      to {
        opacity: 0;
        transform: scale(1.04) translateY(12px);
        filter: blur(18px);
      }
    }
  `;
  document.head.appendChild(style);
}

// ── Font face injector ─────────────────────────────────────────────────────────

const FONT_STYLE_ID = "signage-fonts";

function injectFontFaces(fonts: FontAsset[]) {
  let el = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = FONT_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = fonts
    .map((f) => `@font-face { font-family: '${f.family}'; src: url('${fontUrl(f.id)}'); }`)
    .join("\n");
}

// ── 16:9 letterbox hook ─────────────────────────────────────────────────────────
// Computes the largest 16:9 box that fits inside the current window. When the
// window matches 16:9 (the aspect-locked default), the box fills it; in native
// fullscreen on a non-16:9 screen, the leftover space becomes black bars.

const TARGET_RATIO = 16 / 9;

function computeStageSize(): { width: number; height: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let width = w;
  let height = w / TARGET_RATIO;
  if (height > h) {
    height = h;
    width = h * TARGET_RATIO;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function useStageSize(): { width: number; height: number } {
  const [size, setSize] = React.useState(computeStageSize);

  React.useEffect(() => {
    const onResize = () => setSize(computeStageSize());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

// ── Image preloader ─────────────────────────────────────────────────────────────
// Only the current slide is mounted, and custom-scheme (signage://img) responses
// aren't reliably cached, so a slide's <img> would otherwise begin loading the
// moment that slide becomes active and its flow-in animation starts — making the
// image pop in after the blur transition whenever it hasn't decoded in time.
// Preload + decode every referenced image up front and keep the decoded elements
// alive in a ref, so each slide's image paints in sync with its animation.

function collectImageIds(slides: Slide[]): string[] {
  const ids = new Set<string>();
  for (const slide of slides) {
    if (slide.type === "image" && slide.imageId) ids.add(slide.imageId);
    for (const el of slide.elements ?? []) {
      if (el.kind === "image" && el.imageId) ids.add(el.imageId);
      if (el.kind === "icon" && el.iconSource === "image" && el.iconImageId) {
        ids.add(el.iconImageId);
      }
    }
  }
  return Array.from(ids);
}

function useImagePreload(slides: Slide[]) {
  const cacheRef = React.useRef<Map<string, HTMLImageElement>>(new Map());

  React.useEffect(() => {
    const ids = collectImageIds(slides);
    const cache = cacheRef.current;

    for (const id of ids) {
      if (cache.has(id)) continue;
      const img = new Image();
      img.src = imageUrl(id);
      cache.set(id, img);
      // decode() warms the bitmap so the React <img> paints immediately;
      // ignore failures (missing/broken image).
      img.decode?.().catch(() => {});
    }

    // Drop entries no longer referenced so memory tracks the current playlist.
    for (const id of Array.from(cache.keys())) {
      if (!ids.includes(id)) cache.delete(id);
    }
  }, [slides]);
}

// ── Cursor hiding hook ─────────────────────────────────────────────────────────

function useHideCursorOnIdle(idleMs: number) {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function show() {
      document.body.style.cursor = "default";
      clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    }

    function hide() {
      document.body.style.cursor = "none";
    }

    hide();

    document.addEventListener("mousemove", show);
    document.addEventListener("mousedown", show);

    return () => {
      clearTimeout(timer);
      document.body.style.cursor = "default";
      document.removeEventListener("mousemove", show);
      document.removeEventListener("mousedown", show);
    };
  }, [idleMs]);
}

// ── Reveal hook ────────────────────────────────────────────────────────────────
// Returns the highest step index that should currently be visible.
// Step 0 is always shown immediately. Higher steps are revealed after
// `revealDelayMs` each (unless reveal === "together").

function useReveal(
  slide: Slide | undefined,
  isActive: boolean,
): number {
  // revealedStep = the max step index that is currently visible.
  // We start at -1 (nothing shown) and immediately jump to 0 on mount,
  // then schedule subsequent steps.
  const [revealedStep, setRevealedStep] = React.useState(-1);

  React.useEffect(() => {
    if (!isActive || !slide || slide.type !== "custom") {
      setRevealedStep(-1);
      return;
    }

    const elements = slide.elements ?? [];
    const steps = Array.from(new Set(elements.map((el) => el.step ?? 0))).sort(
      (a, b) => a - b,
    );

    if (steps.length === 0) {
      setRevealedStep(Infinity);
      return;
    }

    const revealTogether = slide.reveal === "together";
    const delayMs = slide.revealDelayMs ?? 700;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    // Step 0: show immediately
    setRevealedStep(steps[0]);
    console.log("[Signage:reveal]", { slide: slide.id, step: steps[0] });

    if (revealTogether) {
      // Reveal all steps at once after one delay
      if (steps.length > 1) {
        const t = setTimeout(() => {
          if (!cancelled) {
            const last = steps[steps.length - 1];
            setRevealedStep(last);
            console.log("[Signage:reveal]", { slide: slide.id, step: last });
          }
        }, delayMs);
        timers.push(t);
      }
    } else {
      // Reveal each subsequent step after cumulative delays
      for (let i = 1; i < steps.length; i++) {
        const step = steps[i];
        const delay = delayMs * i;
        const t = setTimeout(() => {
          if (!cancelled) {
            setRevealedStep(step);
            console.log("[Signage:reveal]", { slide: slide.id, step });
          }
        }, delay);
        timers.push(t);
      }
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [slide?.id, slide?.reveal, slide?.revealDelayMs, isActive]);

  return revealedStep;
}

// ── Animated slide wrapper ─────────────────────────────────────────────────────

type AnimPhase = "in" | "hold" | "out";

interface AnimatedSlideProps {
  slide: Slide;
  transitionMs: number;
  phase: AnimPhase;
  /** Whether this slide is the first one shown on initial mount (skip blur-in). */
  isFirst: boolean;
}

function AnimatedSlide({ slide, transitionMs, phase, isFirst }: AnimatedSlideProps) {
  // The first slide on initial mount skips the flow-in animation entirely.
  const skipFlowIn = isFirst && phase === "in";

  const animStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    animationDuration: `${transitionMs}ms`,
    animationTimingFunction: EASING,
    animationFillMode: "forwards",
    animationName:
      skipFlowIn
        ? "none"
        : phase === "in"
          ? "signage-flow-in"
          : phase === "out"
            ? "signage-flow-out"
            : "none",
    opacity: (phase === "hold" || skipFlowIn) ? 1 : undefined,
    filter: (phase === "hold" || skipFlowIn) ? "blur(0px)" : undefined,
    transform: (phase === "hold" || skipFlowIn) ? "scale(1) translateY(0)" : undefined,
  };

  const isActive = phase === "in" || phase === "hold";
  const revealedStep = useReveal(slide, isActive);

  return (
    <div style={animStyle}>
      <SlideRenderer slide={slide} revealedStep={revealedStep} />
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: BEIGE_BASE }}
    />
  );
}

// ── Slideshow hook ─────────────────────────────────────────────────────────────

interface SlideshowState {
  index: number;
  phase: AnimPhase;
  isFirst: boolean;
}

function useSlideshow(slides: Slide[], transitionMs: number): SlideshowState {
  const [state, setState] = React.useState<SlideshowState>({
    index: 0,
    phase: "in",
    isFirst: true,
  });

  // When slides array identity changes (live update), restart from slide 0
  React.useEffect(() => {
    setState({ index: 0, phase: "in", isFirst: true });
  }, [slides]);

  React.useEffect(() => {
    if (slides.length === 0) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function schedule(fn: () => void, delay: number) {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timers.push(t);
    }

    function runSlide(index: number) {
      const slide = slides[index];
      if (!slide) return;

      // 1. Flow-in animation runs for transitionMs (or 0 for first-ever slide)
      schedule(() => {
        setState((prev) => ({ ...prev, index, phase: "hold", isFirst: false }));

        // 2. After hold, flow-out
        schedule(() => {
          setState((prev) => ({ ...prev, index, phase: "out" }));

          // 3. After flow-out, advance
          schedule(() => {
            const next = (index + 1) % slides.length;
            console.log(
              `[Signage:advance] slide ${next + 1}/${slides.length} id=${slides[next]?.id}`,
            );
            setState({ index: next, phase: "in", isFirst: false });
          }, transitionMs);
        }, slide.durationMs);
      }, transitionMs);
    }

    const { index } = state;
    runSlide(index);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [state.index, slides, transitionMs]);

  return state;
}

// ── Main display component ─────────────────────────────────────────────────────

export function SignageDisplay() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    injectKeyframes();
  }, []);

  useHideCursorOnIdle(3000);

  const { data: state } = useQuery<SignageState>({
    queryKey: SIGNAGE_QUERY_KEY,
    queryFn: async () => {
      const result = await fetchSignageState();
      console.log("[Signage:state]", { slides: result.slides.length, fonts: result.fonts?.length ?? 0 });
      return result;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // Inject @font-face declarations whenever fonts change
  React.useEffect(() => {
    if (state?.fonts) {
      injectFontFaces(state.fonts);
    }
  }, [state?.fonts]);

  React.useEffect(() => {
    const unsubscribe = subscribeSignageChanged((newState) => {
      console.log("[Signage:changed]", { slides: newState.slides.length, fonts: newState.fonts?.length ?? 0 });
      queryClient.setQueryData(SIGNAGE_QUERY_KEY, newState);
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  const slides = state?.slides ?? [];
  const transitionMs = state?.transitionMs ?? 600;

  useImagePreload(slides);

  const { index, phase, isFirst } = useSlideshow(slides, transitionMs);
  const currentSlide = slides[index];

  const stage = useStageSize();

  return (
    <div
      className="fixed inset-0 overflow-hidden z-50 flex items-center justify-center"
      style={{ background: "#000" }}
    >
      <div
        className="relative overflow-hidden"
        style={{ width: stage.width, height: stage.height, background: BEIGE_BASE }}
      >
        {slides.length === 0 ? (
          <EmptyState />
        ) : currentSlide ? (
          <AnimatedSlide
            key={`${currentSlide.id}-${index}`}
            slide={currentSlide}
            transitionMs={transitionMs}
            phase={phase}
            isFirst={isFirst}
          />
        ) : null}
      </div>
    </div>
  );
}
