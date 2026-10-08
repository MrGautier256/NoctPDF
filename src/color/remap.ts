/**
 * The theme remap: rgb -> rgb for a given {bg, fg}. See docs/ADR-001-recoloration.md
 * for the reasoning. Reference implementation: ported from spikes/recolor/color.mjs
 * (phase 0), with two phase 2 fixes:
 *
 * 1. Saturated colors no longer share the grayscale axis' full bg->fg lightness
 *    inversion: at moderate-to-high original lightness that collapsed vivid hues
 *    (an orange triangle turned brown) by forcing them toward the gamut edge at
 *    low L. They now land in a "readable band" inside the theme's own bg->fg
 *    range (35%..70% of the way, in OKLab L) instead, which keeps them in gamut
 *    without hue drift. Very light saturated colors (highlighters, pastel fills)
 *    are exempted and keep inverting fully, since that is what makes a yellow
 *    highlight read as a dark, legible yellow under light text.
 * 2. Pure white and pure black snap exactly to bg/fg (bypassing the OKLab round
 *    trip's float error), so the shader's recolored white equals the `.page`
 *    CSS background with no visible seam at the page edge.
 */
import { parseCssColor } from "./css-color";
import { clamp01, contrast, hexToRgb, oklabToRgb, rgbToOklab, smoothstep, type Rgb } from "./oklab";

export interface RemapOptions {
  bg: string;
  fg: string;
  /** Chroma multiplier for saturated colors, 1 = unchanged (tuning.saturation). */
  chroma?: number;
  /** WCAG contrast ratio text must reach against bg, 1 disables the guard. */
  minContrast?: number;
}

export type Remap = (rgb: Rgb) => Rgb;

const GRAY_LOW_C = 0.015;
const GRAY_HIGH_C = 0.06;
const VERY_LIGHT_LO = 0.8;
const VERY_LIGHT_HI = 0.92;
const VIVID_BAND_LO = 0.35;
const VIVID_BAND_HI = 0.7;
const WHITE_EPS = 1 / 510; // half an 8-bit step
const BLACK_EPS = 1 / 510;

export function makeRemap({ bg, fg, chroma = 1, minContrast = 4.5 }: RemapOptions): Remap {
  const bgRgb = hexToRgb(bg);
  const fgRgb = hexToRgb(fg);
  const B = rgbToOklab(bgRgb);
  const F = rgbToOklab(fgRgb);
  const bandLo = B[0] + (F[0] - B[0]) * VIVID_BAND_LO;
  const bandHi = B[0] + (F[0] - B[0]) * VIVID_BAND_HI;

  return (rgb: Rgb): Rgb => {
    if (rgb[0] >= 1 - WHITE_EPS && rgb[1] >= 1 - WHITE_EPS && rgb[2] >= 1 - WHITE_EPS) return bgRgb;
    if (rgb[0] <= BLACK_EPS && rgb[1] <= BLACK_EPS && rgb[2] <= BLACK_EPS) return fgRgb;

    const [L, a, b] = rgbToOklab(rgb);
    const C = Math.hypot(a, b);
    const t = 1 - clamp01(L);

    const invertedL = B[0] + (F[0] - B[0]) * t;
    const ga = B[1] + (F[1] - B[1]) * t;
    const gb = B[2] + (F[2] - B[2]) * t;

    const w = smoothstep(GRAY_LOW_C, GRAY_HIGH_C, C);
    const veryLight = smoothstep(VERY_LIGHT_LO, VERY_LIGHT_HI, L);
    const bandAmount = w * (1 - veryLight);
    const bandedL = bandLo + t * (bandHi - bandLo);
    const outL = invertedL * (1 - bandAmount) + bandedL * bandAmount;
    const outA = ga + (a * chroma - ga) * w;
    const outB = gb + (b * chroma - gb) * w;

    let out: [number, number, number] = [outL, outA, outB];
    if (w > 0.5 && L < 0.75 && minContrast > 1 && contrast(oklabToRgb(out), bgRgb) < minContrast) {
      // Text guard, saturated colors only (grays already follow bg->fg): bisect
      // the smallest lightness shift toward fg that reaches minContrast.
      let lo = out[0];
      let hi = F[0] > B[0] ? 1 : 0;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (contrast(oklabToRgb([mid, out[1], out[2]]), bgRgb) >= minContrast) hi = mid;
        else lo = mid;
      }
      out = [hi, out[1], out[2]];
    }
    return oklabToRgb(out);
  };
}

/** Bakes the remap into an N^3 RGBA8 LUT (r fastest), for a WebGL 3D texture. */
export function buildLut(remap: Remap, n = 17): { n: number; data: Uint8Array } {
  const data = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let bIdx = 0; bIdx < n; bIdx++) {
    for (let gIdx = 0; gIdx < n; gIdx++) {
      for (let rIdx = 0; rIdx < n; rIdx++) {
        const out = remap([rIdx / (n - 1), gIdx / (n - 1), bIdx / (n - 1)]);
        data[i++] = Math.round(out[0] * 255);
        data[i++] = Math.round(out[1] * 255);
        data[i++] = Math.round(out[2] * 255);
        data[i++] = 255;
      }
    }
  }
  return { n, data };
}

/** CSS color string (as PDF.js/annotation CSS sets it) -> remapped CSS color string, memoized. */
export function makeStyleMapper(remap: Remap): (style: string) => string {
  const cache = new Map<string, string>();
  return style => {
    const cached = cache.get(style);
    if (cached) return cached;
    const parsed = parseCssColor(style);
    if (!parsed) return style;
    const [r, g, b] = remap(parsed.rgb).map(v => Math.round(v * 255));
    const out = parsed.alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${parsed.alpha})`;
    cache.set(style, out);
    return out;
  };
}
