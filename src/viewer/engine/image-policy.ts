/**
 * Maps the `images.mode` setting to a shader rect mode, resolving "auto" with
 * a lightweight per-image heuristic: a near-monochrome, mostly-light sample
 * (a diagram, a scanned text page) gets recolored like vector art; a
 * photographic one (rich histogram) gets dimmed instead. Ported from the
 * phase 0 spike (spikes/recolor/main.mjs classify()), which measured this
 * against a scientific-paper figure (dimmed, correctly: 1% light pixels, 15
 * dominant bins) and a schematic (recolored, correctly: 87% light, 6 bins).
 */
import type { Settings } from "../../settings/schema";
import type { ImageRectMode } from "./types";

type ImagesMode = Settings["images"]["mode"];

const STATIC_MODE: Record<Exclude<ImagesMode, "auto">, ImageRectMode> = {
  keep: 0,
  dim: 1,
  invert: 2,
  grayscale: 3,
  blend: 4,
};

/** Resolves every `images.mode` except "auto", which needs a per-image sample. */
export function staticImageMode(mode: ImagesMode): ImageRectMode | null {
  return mode === "auto" ? null : STATIC_MODE[mode];
}

export interface ClassifyOptions {
  /** Luminance (0..1) above which a pixel counts as "light". */
  lightLuminance: number;
  /** Share of light pixels above which the image is considered a diagram/scan rather than a photo. */
  lightFraction: number;
  /** A sample with more distinct dominant color bins than this reads as a photo. */
  maxDominantBins: number;
}

export const DEFAULT_CLASSIFY_OPTIONS: ClassifyOptions = {
  lightLuminance: 0.85,
  lightFraction: 0.45,
  maxDominantBins: 24,
};

/**
 * Classifies a small RGBA8 sample (the spike used a 48x48 downsample) as
 * "invert" (2, diagram-like) or "dim" (1, photo-like).
 */
export function classifyImageSample(
  pixels: Uint8ClampedArray | Uint8Array,
  options: ClassifyOptions = DEFAULT_CLASSIFY_OPTIONS,
): 1 | 2 {
  const { lightLuminance, lightFraction, maxDominantBins } = options;
  const bins = new Map<number, number>();
  let light = 0;
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (y > lightLuminance) light++;
    const bin = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
    total++;
  }
  if (total === 0) return 1;
  const bigBins = [...bins.values()].filter(count => count / total > 0.005).length;
  return light / total > lightFraction && bigBins < maxDominantBins ? 2 : 1;
}

/** area: share of the page this image rect's bounding box covers (0..1). */
export function isScannedPage(area: number, pageHasNoText: boolean, threshold: number): boolean {
  return pageHasNoText && area >= threshold;
}
