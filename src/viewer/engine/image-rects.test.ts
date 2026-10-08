import { describe, expect, it } from "vitest";
import { rectBasis, rectBounds, rectsFromTrackedCoordinates } from "./image-rects";

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

describe("rectBasis", () => {
  it("gives u=0,v=0 at the origin corner and u=1,v=1 at the opposite corners, for an axis-aligned rect", () => {
    const p = [0.2, 0.3, 0.6, 0.3, 0.2, 0.7] as const; // origin, +U (x), +V (y)
    const { u, v } = rectBasis(p);
    const dot3 = (b: readonly [number, number, number], x: number, y: number) => b[0] * x + b[1] * y + b[2];
    expect(dot3(u, 0.2, 0.3)).toBeCloseTo(0, 10);
    expect(dot3(v, 0.2, 0.3)).toBeCloseTo(0, 10);
    expect(dot3(u, 0.6, 0.3)).toBeCloseTo(1, 10);
    expect(dot3(v, 0.6, 0.3)).toBeCloseTo(0, 10);
    expect(dot3(u, 0.2, 0.7)).toBeCloseTo(0, 10);
    expect(dot3(v, 0.2, 0.7)).toBeCloseTo(1, 10);
  });

  it("handles a rotated rect the same way", () => {
    // A square rotated 45deg: origin (0,0), +U at (1,1), +V at (-1,1) (both unit-length axes in this basis).
    const p = [0, 0, 1, 1, -1, 1] as const;
    const { u, v } = rectBasis(p);
    const dot3 = (b: readonly [number, number, number], x: number, y: number) => b[0] * x + b[1] * y + b[2];
    expect(dot3(u, 1, 1)).toBeCloseTo(1, 10);
    expect(dot3(v, 1, 1)).toBeCloseTo(0, 10);
    expect(dot3(u, -1, 1)).toBeCloseTo(0, 10);
    expect(dot3(v, -1, 1)).toBeCloseTo(1, 10);
  });
});
