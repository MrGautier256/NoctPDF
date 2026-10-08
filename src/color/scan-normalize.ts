/**
 * Levels stretch for scanned pages. A scan's paper is rarely pure white and
 * its ink rarely pure black, so after the theme remap the "paper" ends up
 * lighter than the surrounding theme background and the text ends up low
 * contrast (bug: paper at #2a next to a #1e page background). This computes
 * a 5th/95th percentile stretch from the page's own luminance histogram,
 * which is applied to pixels *before* the LUT lookup so the LUT still sees a
 * full-range black-to-white input.
 *
 * Deliberately gamma-space luminance (matching common "auto levels" tools),
 * not the linear-light luminance used for WCAG contrast: scans are a levels
 * problem, not a perceptual-uniformity one.
 */

export interface LevelsStretch {
  lo: number;
  hi: number;
}

const HISTOGRAM_BINS = 256;

function gammaLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Luminance histogram (256 bins, 0 = black .. 255 = white) from RGBA8 pixel data. */
export function histogramFromRgba(pixels: Uint8ClampedArray | Uint8Array, stride: 1 | 3 | 4 = 4): Uint32Array {
  const bins = new Uint32Array(HISTOGRAM_BINS);
  for (let i = 0; i + stride <= pixels.length; i += stride) {
    const y = stride === 1 ? pixels[i]! : gammaLuminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    const bin = Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.round(y)));
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  return bins;
}

/**
 * The value (0..255) at which the cumulative histogram first reaches
 * `percentile` of the total sample count, for each of `loPercentile` and
 * `hiPercentile`. Falls back to {lo: 0, hi: 255} on an empty histogram, and
 * widens a degenerate (lo >= hi) result by one level so the stretch below
 * never divides by zero.
 */
export function percentileLevels(
  histogram: ArrayLike<number>,
  loPercentile = 0.05,
  hiPercentile = 0.95,
): LevelsStretch {
  const total = Array.from(histogram).reduce((a, b) => a + b, 0);
  if (total === 0) return { lo: 0, hi: 1 };
  const loCount = loPercentile * total;
  const hiCount = hiPercentile * total;
  let cumulative = 0;
  let lo = 0;
  let hi = histogram.length - 1;
  let loFound = false;
  for (let v = 0; v < histogram.length; v++) {
    cumulative += histogram[v] ?? 0;
    if (!loFound && cumulative >= loCount) {
      lo = v;
      loFound = true;
    }
    if (cumulative >= hiCount) {
      hi = v;
      break;
    }
  }
  if (hi <= lo) hi = Math.min(histogram.length - 1, lo + 1);
  return { lo: lo / 255, hi: hi / 255 };
}

/** Stretches a 0..1 channel value so [lo, hi] maps to [0, 1], clamped. */
export function applyLevelsStretch(value: number, { lo, hi }: LevelsStretch): number {
  if (hi <= lo) return value;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}
