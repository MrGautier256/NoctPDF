/**
 * Pure logic for Engine B (native-overlay): detecting a PDF surface, picking
 * the toolbar inset and the four built-in palettes, and building the SVG
 * filter that maps white/black to bg/fg. Kept DOM-free so it is unit
 * testable; src/content/native-overlay.ts wires it into the page.
 *
 * The invert + hueRotate(180) + per-channel table combination, and the
 * measured toolbar heights below, are validated in docs/phase0-findings.md
 * §5: it gives exact bg/fg colors at the luminance extremes, but (unlike
 * Engine A's OKLab remap) cannot preserve hue for every color in between and
 * inverts images to negatives — the one inherent limitation of this engine.
 */
import type { Settings } from "../settings/schema";

/** Chrome/Opera's built-in PDF viewer toolbar height, in CSS pixels. */
export const DEFAULT_TOOLBAR_INSET = 56;
/** Edge's is shorter (measured in phase 0). */
export const EDGE_TOOLBAR_INSET = 41;

export function resolveToolbarInset(overlay: Settings["nativeOverlay"], isEdge: boolean): number {
  if (overlay.coverToolbar) return 0;
  if (overlay.toolbarInset === "auto") return isEdge ? EDGE_TOOLBAR_INSET : DEFAULT_TOOLBAR_INSET;
  return overlay.toolbarInset;
}

export interface OverlayPalette {
  bg: string;
  fg: string;
  /** Desaturate the page before remapping: removes the color banding the hue-rotated invert leaves on photos. */
  grayscale: boolean;
}

const PURE: OverlayPalette = { bg: "#000000", fg: "#ffffff", grayscale: false };
const WARM: OverlayPalette = { bg: "#2b2520", fg: "#e8d9c0", grayscale: false };
const MONO: OverlayPalette = { bg: "#000000", fg: "#ffffff", grayscale: true };

/** "smart" follows the user's Engine A theme colors; the other three are fixed, theme-independent presets. */
export function paletteForStyle(style: Settings["nativeOverlay"]["style"], theme: Settings["theme"]): OverlayPalette {
  switch (style) {
    case "smart":
      return { bg: theme.bg, fg: theme.fg, grayscale: false };
    case "pure":
      return PURE;
    case "warm":
      return WARM;
    case "mono":
      return MONO;
  }
}

export function shouldActivateOverlay(settings: Settings): boolean {
  return settings.enabled && settings.engine === "native-overlay";
}

function hexToUnit(hex: string): [number, number, number] {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return [n(1), n(3), n(5)];
}

export interface FilterTables {
  r: readonly [number, number];
  g: readonly [number, number];
  b: readonly [number, number];
}

/** Two-point per-channel tables for feComponentTransfer: white -> bg, black -> fg (after the invert+hueRotate below). */
export function filterTables(bg: string, fg: string): FilterTables {
  const [br, bgG, bb] = hexToUnit(bg);
  const [fr, fgG, fb] = hexToUnit(fg);
  return { r: [br, fr], g: [bgG, fgG], b: [bb, fb] };
}

/**
 * The SVG <filter> markup: optionally desaturate, invert, rotate the hue back
 * 180deg (so a colored page keeps its hue after the invert), then remap
 * white/black to bg/fg. `id` must be unique on the page.
 */
export function buildFilterMarkup(id: string, palette: OverlayPalette): string {
  const { r, g, b } = filterTables(palette.bg, palette.fg);
  const saturate = palette.grayscale ? '<feColorMatrix type="saturate" values="0"/>' : "";
  return (
    `<filter id="${id}" color-interpolation-filters="sRGB">` +
    saturate +
    `<feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/>` +
    `<feColorMatrix type="hueRotate" values="180"/>` +
    `<feComponentTransfer>` +
    `<feFuncR type="table" tableValues="${r[0]} ${r[1]}"/>` +
    `<feFuncG type="table" tableValues="${g[0]} ${g[1]}"/>` +
    `<feFuncB type="table" tableValues="${b[0]} ${b[1]}"/>` +
    `</feComponentTransfer>` +
    `</filter>`
  );
}

/** document.contentType for a top-level PDF navigation. */
export function isTopLevelPdfDocument(contentType: string): boolean {
  return contentType === "application/pdf";
}

export interface EmbedCandidate {
  mimeType: string | null;
  /** The element's rendered width, and the viewport it should fill. */
  elementWidth: number;
  viewportWidth: number;
  /** Whether it is the only element in <body> (pdf.js' own full-bleed heuristic). */
  isOnlyBodyChild: boolean;
}

/** A page-embedded <embed>/<object> that fills the viewport is shown by the native plugin, same as a top-level PDF. */
export function isFullBleedPdfEmbed(candidate: EmbedCandidate): boolean {
  if (candidate.mimeType !== "application/pdf") return false;
  if (!candidate.isOnlyBodyChild) return false;
  return candidate.elementWidth >= candidate.viewportWidth - 2;
}
