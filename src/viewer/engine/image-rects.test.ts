import { describe, expect, it } from "vitest";
import { rectBounds, rectsFromTrackedCoordinates } from "./image-rects";

describe("rectsFromTrackedCoordinates", () => {
  it("returns nothing for an empty or missing tracker result", () => {
    expect(rectsFromTrackedCoordinates(null)).toEqual([]);
    expect(rectsFromTrackedCoordinates(new Float32Array(0))).toEqual([]);
  });

  it("splits a flat array into one rect per sextet, unchanged with no detail view", () => {
    const coords = new Float32Array([0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1]);
    const rects = rectsFromTrackedCoordinates(coords);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.p).toEqual([0, 0, 0.5, 0, 0, 0.5]);
    expect(rects[1]!.p).toEqual([0.5, 0.5, 1, 0.5, 0.5, 1]);
  });

  it("reprojects into the detail canvas' own normalized space", () => {
    // Detail canvas covers the right half of the page (x in [0.5, 1]).
    const detail = { offsetX: 0.5, offsetY: 0, scaleX: 0.5, scaleY: 1 };
    const coords = new Float32Array([0.5, 0, 0.75, 0, 0.5, 1]);
    const [rect] = rectsFromTrackedCoordinates(coords, detail);
    // Page x=0.5 is the detail view's left edge (0), x=0.75 its 50% mark.
    expect(rect!.p).toEqual([0, 0, 0.5, 0, 0, 1]);
  });
});

describe("rectBounds", () => {
  it("gives the axis-aligned box of an un-rotated rect", () => {
    const { x0, y0, x1, y1 } = rectBounds([0.1, 0.2, 0.4, 0.2, 0.1, 0.6]);
    expect(x0).toBeCloseTo(0.1, 10);
    expect(y0).toBeCloseTo(0.2, 10);
    expect(x1).toBeCloseTo(0.4, 10);
    expect(y1).toBeCloseTo(0.6, 10);
  });

  it("clamps to the page for a rect that overshoots it", () => {
    expect(rectBounds([-0.1, -0.1, 1.1, -0.1, -0.1, 1.1])).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });
});
