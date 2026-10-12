/**
 * CPU fallback for the WebGL2 shader (shader-recolorer.ts), run inside a Web
 * Worker (cpu-recolor.worker.ts) so a page's pixel loop never blocks the
 * viewer's main thread. Pure, DOM/Worker-free, so it is unit tested here;
 * the per-rect mode dispatch and LUT lookup mirror the fragment shader's
 * `main()` exactly (same rect precedence: the last matching rect in list
 * order wins), so the CPU and GPU paths recolor a page identically.
 */
import { clamp01 } from "../../color/oklab";
import { applyLevelsStretch, type LevelsStretch } from "../../color/scan-normalize";
import { rectBasis } from "./image-rects";
import type { ImageRectMode } from "./types";

export interface PixelRect {
  p: readonly [number, number, number, number, number, number];
  mode: ImageRectMode;
}

export interface ProcessPixelsRequest {
  width: number;
  height: number;
  /** RGBA8, length width*height*4. Mutated and returned (no extra copy). */
  pixels: Uint8ClampedArray;
  rects: readonly PixelRect[];
  /** Index-aligned with `rects`. */
  stretches: ReadonlyArray<LevelsStretch | null | undefined>;
  lutN: number;
  lutData: Uint8Array;
  dim: number;
  bg: readonly [number, number, number];
  /** 0..1 fraction of the width to leave untouched (the "compare" peek mode), 0 disables it. */
  split: number;
}

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
const luminance = (r: number, g: number, b: number): number => LUMA_R * r + LUMA_G * g + LUMA_B * b;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Trilinear sample of a buildLut()-shaped 3D LUT (r fastest), matching the shader's half-texel-offset addressing. */
export function sampleLut3D(lutData: Uint8Array, n: number, r: number, g: number, b: number): [number, number, number] {
  const scale = Math.max(1, n - 1);
  const fr = clamp01(r) * scale;
  const fg = clamp01(g) * scale;
  const fb = clamp01(b) * scale;
  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, scale);
  const g1 = Math.min(g0 + 1, scale);
  const b1 = Math.min(b0 + 1, scale);
  const tr = fr - r0;
  const tg = fg - g0;
  const tb = fb - b0;
  const at = (ri: number, gi: number, bi: number, ch: number) => lutData[((bi * n + gi) * n + ri) * 4 + ch]! / 255;
  const lerp = (a: number, bb: number, t: number) => a + (bb - a) * t;

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c00 = lerp(at(r0, g0, b0, ch), at(r1, g0, b0, ch), tr);
    const c10 = lerp(at(r0, g1, b0, ch), at(r1, g1, b0, ch), tr);
    const c01 = lerp(at(r0, g0, b1, ch), at(r1, g0, b1, ch), tr);
    const c11 = lerp(at(r0, g1, b1, ch), at(r1, g1, b1, ch), tr);
    out[ch] = lerp(lerp(c00, c10, tg), lerp(c01, c11, tg), tb);
  }
  return out;
}

/** Which rect (if any) covers normalized point (px, py); last match in list order wins, same as the shader. */
function rectModeAt(
  rects: readonly PixelRect[],
  stretches: ReadonlyArray<LevelsStretch | null | undefined>,
  px: number,
  py: number,
): { mode: ImageRectMode; stretch: LevelsStretch | null | undefined } {
  for (let k = rects.length - 1; k >= 0; k--) {
    const { u, v } = rectBasis(rects[k]!.p);
    const ru = u[0] * px + u[1] * py + u[2];
    const rv = v[0] * px + v[1] * py + v[2];
    if (ru >= 0 && ru <= 1 && rv >= 0 && rv <= 1) return { mode: rects[k]!.mode, stretch: stretches[k] };
  }
  return { mode: 2, stretch: undefined };
}

/** Recolors `req.pixels` in place (and returns it) using the same model as the WebGL2 shader. */
export function processPixels(req: ProcessPixelsRequest): Uint8ClampedArray {
  const { width, height, pixels, rects, stretches, lutN, lutData, dim, bg, split } = req;

  for (let y = 0; y < height; y++) {
    const py = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const px = (x + 0.5) / width;
      const i = (y * width + x) * 4;
      if (px < split) continue;

      const { mode, stretch } = rectModeAt(rects, stretches, px, py);
      let r = pixels[i]! / 255;
      let g = pixels[i + 1]! / 255;
      let b = pixels[i + 2]! / 255;

      switch (mode) {
        case 0:
          break;
        case 1:
          r = (0.04 + 0.92 * r) * dim;
          g = (0.04 + 0.92 * g) * dim;
          b = (0.04 + 0.92 * b) * dim;
          break;
        case 2: {
          if (stretch) {
            r = applyLevelsStretch(r, stretch);
            g = applyLevelsStretch(g, stretch);
            b = applyLevelsStretch(b, stretch);
          }
          [r, g, b] = sampleLut3D(lutData, lutN, r, g, b);
          break;
        }
        case 3: {
          const y2 = luminance(r, g, b) * dim;
          r = g = b = y2;
          break;
        }
        case 4: {
          const t = smoothstep(0.7, 1, luminance(r, g, b));
          r += (bg[0] - r) * t;
          g += (bg[1] - g) * t;
          b += (bg[2] - b) * t;
          break;
        }
      }

      pixels[i] = clamp01(r) * 255;
      pixels[i + 1] = clamp01(g) * 255;
      pixels[i + 2] = clamp01(b) * 255;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}
