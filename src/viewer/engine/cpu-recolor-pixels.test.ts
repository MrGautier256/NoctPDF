import { describe, expect, it } from "vitest";
import { buildLut, makeRemap } from "../../color/remap";
import { processPixels, sampleLut3D, type PixelRect } from "./cpu-recolor-pixels";

const THEME = { bg: "#1e1f22", fg: "#e6e3dc" };
const remap = makeRemap(THEME);
const lut = buildLut(remap, 17);

function rgba(colors: Array<[number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe("sampleLut3D", () => {
  it("returns the exact stored texel at a grid point", () => {
    const [r, g, b] = sampleLut3D(lut.data, lut.n, 1, 1, 1);
    expect(Math.round(r * 255)).toBe(lut.data[lut.data.length - 4]!);
    expect(Math.round(g * 255)).toBe(lut.data[lut.data.length - 3]!);
    expect(Math.round(b * 255)).toBe(lut.data[lut.data.length - 2]!);
  });

  it("averages two adjacent texels at the midpoint along one axis", () => {
    // A 2-point LUT (n=2): grid points are at r=0 and r=1 exactly.
    const n = 2;
    const data = new Uint8Array(n * n * n * 4);
    // r=0 -> 0, r=1 -> 255, g=b=0 fixed.
    data.set([0, 0, 0, 255], 0);
    data.set([255, 0, 0, 255], 4);
    const [r] = sampleLut3D(data, n, 0.5, 0, 0);
    expect(r).toBeCloseTo(0.5, 5);
  });
});

describe("processPixels", () => {
  it("maps full white to bg and full black to fg under mode 2 (recolor), matching makeRemap", () => {
    const pixels = rgba([
      [255, 255, 255],
      [0, 0, 0],
    ]);
    const rects: PixelRect[] = [];
    const out = processPixels({
      width: 2,
      height: 1,
      pixels,
      rects,
      stretches: [],
      lutN: lut.n,
      lutData: lut.data,
      dim: 0.85,
      bg: [0, 0, 0],
      split: 0,
    });
    const [br, bgc, bb] = remap([1, 1, 1]).map(v => Math.round(v * 255));
    const [fr, fg, fb] = remap([0, 0, 0]).map(v => Math.round(v * 255));
    expect([out[0], out[1], out[2]]).toEqual([br, bgc, bb]);
    expect([out[4], out[5], out[6]]).toEqual([fr, fg, fb]);
  });

  it("mode 0 (keep) leaves the pixel untouched", () => {
    const pixels = rgba([[12, 34, 56]]);
    const rects: PixelRect[] = [{ p: [0, 0, 1, 0, 0, 1], mode: 0 }];
    const out = processPixels({
      width: 1,
      height: 1,
      pixels,
      rects,
      stretches: [undefined],
      lutN: lut.n,
      lutData: lut.data,
      dim: 0.85,
      bg: [0, 0, 0],
      split: 0,
    });
    expect([out[0], out[1], out[2]]).toEqual([12, 34, 56]);
  });

  it("mode 3 (grayscale) sets r=g=b to the dimmed luminance", () => {
    const pixels = rgba([[200, 100, 50]]);
    const rects: PixelRect[] = [{ p: [0, 0, 1, 0, 0, 1], mode: 3 }];
    const out = processPixels({
      width: 1,
      height: 1,
      pixels,
      rects,
      stretches: [undefined],
      lutN: lut.n,
      lutData: lut.data,
      dim: 1,
      bg: [0, 0, 0],
      split: 0,
    });
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it("the later rect in list order wins when two rects overlap", () => {
    const pixels = rgba([[200, 200, 200]]);
    const rects: PixelRect[] = [
      { p: [0, 0, 1, 0, 0, 1], mode: 0 },
      { p: [0, 0, 1, 0, 0, 1], mode: 3 },
    ];
    const out = processPixels({
      width: 1,
      height: 1,
      pixels,
      rects,
      stretches: [undefined, undefined],
      lutN: lut.n,
      lutData: lut.data,
      dim: 1,
      bg: [0, 0, 0],
      split: 0,
    });
    // mode 3 (grayscale) won, not mode 0 (keep): r stayed 200 would fail this.
    expect(out[0]).toBe(out[1]);
  });

  it("split leaves pixels left of the split untouched", () => {
    const pixels = rgba([
      [255, 255, 255],
      [255, 255, 255],
    ]);
    const out = processPixels({
      width: 2,
      height: 1,
      pixels,
      rects: [],
      stretches: [],
      lutN: lut.n,
      lutData: lut.data,
      dim: 0.85,
      bg: [0, 0, 0],
      split: 0.5,
    });
    expect([out[0], out[1], out[2]]).toEqual([255, 255, 255]);
    expect([out[4], out[5], out[6]]).not.toEqual([255, 255, 255]);
  });

  it("always forces alpha to 255", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 0]);
    const out = processPixels({
      width: 1,
      height: 1,
      pixels,
      rects: [{ p: [0, 0, 1, 0, 0, 1], mode: 0 }],
      stretches: [undefined],
      lutN: lut.n,
      lutData: lut.data,
      dim: 1,
      bg: [0, 0, 0],
      split: 0,
    });
    expect(out[3]).toBe(255);
  });
});
