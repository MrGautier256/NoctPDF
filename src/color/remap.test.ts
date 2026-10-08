import { describe, expect, it } from "vitest";
import { contrast, labToLch, rgbToOklab, type Rgb } from "./oklab";
import { buildLut, makeRemap, makeStyleMapper } from "./remap";

const DARK = { bg: "#1e1f22", fg: "#e6e3dc" };

describe("grey ramp", () => {
  it("stays strictly monotone with a minimum lightness step (regression: #8c8c8c plateau)", () => {
    const remap = makeRemap(DARK);
    // White (i=255) maps to bg and black (i=0) to fg: the ramp is decreasing in i.
    const MIN_STEP = 0.0008;
    let prev: number | undefined;
    for (let i = 0; i <= 255; i++) {
      const g = i / 255;
      const l = rgbToOklab(remap([g, g, g]))[0];
      if (prev !== undefined) expect(prev - l).toBeGreaterThanOrEqual(MIN_STEP);
      prev = l;
    }
  });

  it("never produces a run of three or more identical consecutive quantized grays (the reported plateau)", () => {
    // A handful of isolated adjacent collisions are an unavoidable consequence
    // of quantizing a continuous, non-uniform curve to 8 bits; what broke the
    // grey ramp before was several *consecutive* steps landing on the exact
    // same byte (cases 4..7 all at #8c8c8c), which this would catch.
    const remap = makeRemap(DARK);
    let run = 1;
    let maxRun = 1;
    let prevKey = "";
    for (let i = 0; i <= 255; i++) {
      const g = i / 255;
      const key = remap([g, g, g])
        .map(c => Math.round(c * 255))
        .join(",");
      run = key === prevKey ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
      prevKey = key;
    }
    expect(maxRun).toBeLessThan(3);
  });
});

describe("white and black snap exactly to the theme", () => {
  it("pure white maps to exactly bg (no seam against the .page CSS background)", () => {
    const remap = makeRemap(DARK);
    const [r, g, b] = remap([1, 1, 1]);
    expect([r, g, b].map(c => Math.round(c * 255))).toEqual([0x1e, 0x1f, 0x22]);
  });

  it("pure black maps to exactly fg", () => {
    const remap = makeRemap(DARK);
    const [r, g, b] = remap([0, 0, 0]);
    expect([r, g, b].map(c => Math.round(c * 255))).toEqual([0xe6, 0xe3, 0xdc]);
  });
});

describe("vivid colors keep their hue (orange does not become brown)", () => {
  const orange: Rgb = [1, 0x8c / 255, 0];

  it("stays within a small hue-angle tolerance of the original", () => {
    const remap = makeRemap(DARK);
    const out = remap(orange);
    const { h: hIn, c: cIn } = labToLch(rgbToOklab(orange));
    const { h: hOut, c: cOut } = labToLch(rgbToOklab(out));
    let delta = Math.abs(hOut - hIn);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    expect(delta).toBeLessThan((15 * Math.PI) / 180);
    // Chroma should survive too: a hue-preserving but chroma-collapsed result
    // would still read as a dull, brownish color.
    expect(cOut).toBeGreaterThan(cIn * 0.4);
  });

  it("is not simply lightness-inverted onto the full bg->fg range (that is what clips it to brown)", () => {
    const remap = makeRemap(DARK);
    const out = remap(orange);
    const outL = rgbToOklab(out)[0];
    const bgL = rgbToOklab(remap([1, 1, 1]))[0]; // == bg's own L
    const fgL = rgbToOklab(remap([0, 0, 0]))[0]; // == fg's own L
    // A full linear inversion would put a moderately-light color close to the
    // fg end; the band keeps it away from both extremes.
    const lo = Math.min(bgL, fgL);
    const hi = Math.max(bgL, fgL);
    expect(outL).toBeGreaterThan(lo + (hi - lo) * 0.2);
    expect(outL).toBeLessThan(hi - (hi - lo) * 0.2);
  });
});

describe("very light saturated colors still invert fully (highlighters, pastel fills)", () => {
  it("a pale yellow highlight becomes a dark, legible yellow, not a mid-band one", () => {
    const remap = makeRemap(DARK);
    const paleYellow: Rgb = [1, 1, 0.6]; // OKLab L ~= 0.978: above the very-light threshold.
    const out = remap(paleYellow);
    const outL = rgbToOklab(out)[0];
    const bgL = rgbToOklab(remap([1, 1, 1]))[0];
    const fgL = rgbToOklab(remap([0, 0, 0]))[0];
    const bandLo = bgL + (fgL - bgL) * 0.35;
    // Being very light, it keeps inverting fully instead of landing in the vivid
    // band: nearly-white input lands close to bg's own lightness (just tinted
    // yellow by its chroma), the same as it would with no chroma at all.
    expect(Math.abs(outL - bgL)).toBeLessThan(0.08);
    expect(outL).toBeLessThan(bandLo);
  });
});

describe("contrast guard", () => {
  it("lifts a dark saturated color (navy) to the requested contrast against bg", () => {
    const remap = makeRemap({ ...DARK, minContrast: 4.5 });
    const navy: Rgb = [0, 0, 0x40 / 255];
    const out = remap(navy);
    const bg = remap([1, 1, 1]);
    expect(contrast(out, bg)).toBeGreaterThanOrEqual(4.49);
  });

  it("does not touch grays (they already follow the bg->fg gradient)", () => {
    const withGuard = makeRemap({ ...DARK, minContrast: 10 });
    const withoutGuard = makeRemap({ ...DARK, minContrast: 1 });
    const mid: Rgb = [0.5, 0.5, 0.5];
    expect(withGuard(mid)).toEqual(withoutGuard(mid));
  });
});

describe("buildLut", () => {
  it("round-trips corner samples close to the direct remap", () => {
    const remap = makeRemap(DARK);
    const { n, data } = buildLut(remap, 17);
    // Corner (0,0,0) is r=g=b=0 -> fastest index 0.
    expect([data[0], data[1], data[2]]).toEqual([0xe6, 0xe3, 0xdc]);
    // Corner (1,1,1): last RGBA quad.
    const last = (n * n * n - 1) * 4;
    expect([data[last], data[last + 1], data[last + 2]]).toEqual([0x1e, 0x1f, 0x22]);
  });
});

describe("makeStyleMapper", () => {
  it("remaps hex, rgb() and rgba() css color strings", () => {
    const remap = makeRemap(DARK);
    const map = makeStyleMapper(remap);
    expect(map("#ffffff")).toBe("rgb(30,31,34)");
    expect(map("rgb(255, 255, 255)")).toBe("rgb(30,31,34)");
    expect(map("rgba(255, 255, 255, 0.5)")).toBe("rgba(30,31,34,0.5)");
  });

  it("passes through strings it cannot parse", () => {
    const remap = makeRemap(DARK);
    const map = makeStyleMapper(remap);
    expect(map("transparent")).toBe("transparent");
  });
});
