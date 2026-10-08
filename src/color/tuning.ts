/**
 * The global sliders (settings.tuning): simple, standard image adjustments
 * applied after the theme remap, in sRGB space. Composable with a Remap so
 * the LUT builder does not need to know about them.
 */
import { clamp01, type Rgb } from "./oklab";
import type { Remap } from "./remap";

export interface Tuning {
  /** Multiplier, 1 = neutral. */
  brightness: number;
  /** Scale around mid-gray, 1 = neutral. */
  contrast: number;
  /** Power curve, 1 = neutral. */
  gamma: number;
  /** Mix toward luminance, 1 = neutral, 0 = grayscale. */
  saturation: number;
  /** -1 (cool, more blue) .. 1 (warm, more red/less blue), 0 = neutral. */
  warmth: number;
}

export const NEUTRAL_TUNING: Tuning = { brightness: 1, contrast: 1, gamma: 1, saturation: 1, warmth: 0 };

const WARMTH_STRENGTH = 0.06;

export function applyTuning([r, g, b]: Rgb, t: Tuning): Rgb {
  // Brightness (multiply), then contrast (scale around mid-gray).
  let rr = clamp01((r * t.brightness - 0.5) * t.contrast + 0.5);
  let gg = clamp01((g * t.brightness - 0.5) * t.contrast + 0.5);
  let bb = clamp01((b * t.brightness - 0.5) * t.contrast + 0.5);

  if (t.gamma !== 1) {
    const invGamma = 1 / t.gamma;
    rr = rr ** invGamma;
    gg = gg ** invGamma;
    bb = bb ** invGamma;
  }

  if (t.saturation !== 1) {
    const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    rr = y + (rr - y) * t.saturation;
    gg = y + (gg - y) * t.saturation;
    bb = y + (bb - y) * t.saturation;
  }

  rr += t.warmth * WARMTH_STRENGTH;
  bb -= t.warmth * WARMTH_STRENGTH;

  return [clamp01(rr), clamp01(gg), clamp01(bb)];
}

export function composeTuning(remap: Remap, tuning: Tuning): Remap {
  if (
    tuning.brightness === 1 &&
    tuning.contrast === 1 &&
    tuning.gamma === 1 &&
    tuning.saturation === 1 &&
    tuning.warmth === 0
  ) {
    return remap;
  }
  return rgb => applyTuning(remap(rgb), tuning);
}
