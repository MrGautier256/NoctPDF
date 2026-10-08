import { describe, expect, it } from "vitest";
import { applyLevelsStretch, histogramFromRgba, percentileLevels } from "./scan-normalize";

function flatRgba(values: number[]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  });
  return px;
}

describe("histogramFromRgba", () => {
  it("counts one sample per pixel at its (gamma-space) luminance", () => {
    const px = flatRgba([0, 128, 255]);
    const hist = histogramFromRgba(px);
    expect(hist[0]).toBe(1);
    expect(hist[128]).toBe(1);
    expect(hist[255]).toBe(1);
    expect(Array.from(hist).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("percentileLevels", () => {
  it("finds the 5th/95th percentile of a synthetic scan histogram (paper at 42, ink at 10)", () => {
    // A scan that is mostly paper (value 42, like the reported #2a) with a
    // little ink (value 10) and a long thin tail toward white from scanner
    // noise: the useful range is [10, 42], not [0, 255].
    const hist = new Uint32Array(256);
    hist[42] = 9000; // paper
    hist[10] = 900; // ink
    for (let v = 200; v < 256; v++) hist[v] = 1; // noise tail, <1% of the page

    const { lo, hi } = percentileLevels(hist);
    expect(Math.round(lo * 255)).toBe(10);
    expect(Math.round(hi * 255)).toBe(42);
  });

  it("returns the full range for an empty histogram", () => {
    expect(percentileLevels(new Uint32Array(256))).toEqual({ lo: 0, hi: 1 });
  });

  it("never returns a degenerate (lo >= hi) range", () => {
    const hist = new Uint32Array(256);
    hist[128] = 100; // every sample at the same value
    const { lo, hi } = percentileLevels(hist);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("applyLevelsStretch", () => {
  it("maps [lo, hi] onto [0, 1], clamped", () => {
    const stretch = { lo: 10 / 255, hi: 42 / 255 };
    expect(applyLevelsStretch(10 / 255, stretch)).toBeCloseTo(0, 5);
    expect(applyLevelsStretch(42 / 255, stretch)).toBeCloseTo(1, 5);
    expect(applyLevelsStretch(26 / 255, stretch)).toBeCloseTo(0.5, 1);
    expect(applyLevelsStretch(0, stretch)).toBe(0);
    expect(applyLevelsStretch(1, stretch)).toBe(1);
  });

  it("is a no-op when the range is degenerate", () => {
    expect(applyLevelsStretch(0.5, { lo: 0.3, hi: 0.3 })).toBe(0.5);
  });
});
