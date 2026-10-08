import { describe, expect, it } from "vitest";
import { makeRemap } from "./remap";
import { applyTuning, composeTuning, NEUTRAL_TUNING, type Tuning } from "./tuning";

describe("applyTuning", () => {
  it("is the identity at neutral settings", () => {
    const rgb: [number, number, number] = [0.3, 0.6, 0.9];
    expect(applyTuning(rgb, NEUTRAL_TUNING)).toEqual(rgb);
  });

  it("brightness multiplies, clamped to 1", () => {
    const [r] = applyTuning([0.5, 0.5, 0.5], { ...NEUTRAL_TUNING, brightness: 1.5 });
    expect(r).toBeCloseTo(0.75, 5);
    const [r2] = applyTuning([0.9, 0.9, 0.9], { ...NEUTRAL_TUNING, brightness: 1.5 });
    expect(r2).toBe(1);
  });

  it("contrast pushes values away from mid-gray", () => {
    const [r] = applyTuning([0.75, 0.75, 0.75], { ...NEUTRAL_TUNING, contrast: 2 });
    expect(r).toBeCloseTo(1, 5);
  });

  it("saturation 0 desaturates to the sample's own luminance", () => {
    const [r, g, b] = applyTuning([1, 0, 0], { ...NEUTRAL_TUNING, saturation: 0 });
    expect(r).toBeCloseTo(g, 5);
    expect(g).toBeCloseTo(b, 5);
  });

  it("warmth shifts red up and blue down (or the reverse when negative)", () => {
    const warm = applyTuning([0.5, 0.5, 0.5], { ...NEUTRAL_TUNING, warmth: 1 });
    expect(warm[0]).toBeGreaterThan(0.5);
    expect(warm[2]).toBeLessThan(0.5);
    const cool = applyTuning([0.5, 0.5, 0.5], { ...NEUTRAL_TUNING, warmth: -1 });
    expect(cool[0]).toBeLessThan(0.5);
    expect(cool[2]).toBeGreaterThan(0.5);
  });
});

describe("composeTuning", () => {
  it("returns the same function reference at neutral settings (no-op fast path)", () => {
    const remap = makeRemap({ bg: "#1e1f22", fg: "#e6e3dc" });
    expect(composeTuning(remap, NEUTRAL_TUNING)).toBe(remap);
  });

  it("applies tuning on top of the remap otherwise", () => {
    const remap = makeRemap({ bg: "#1e1f22", fg: "#e6e3dc" });
    const tuning: Tuning = { ...NEUTRAL_TUNING, saturation: 0 };
    const tuned = composeTuning(remap, tuning);
    const [r, g, b] = tuned([1, 0, 0]);
    expect(r).toBeCloseTo(g, 5);
    expect(g).toBeCloseTo(b, 5);
  });
});
