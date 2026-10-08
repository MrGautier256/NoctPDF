import { describe, expect, it } from "vitest";
import { applyToPoint, IDENTITY, multiply, type Affine } from "./affine";

describe("affine", () => {
  it("identity leaves points unchanged", () => {
    expect(applyToPoint(IDENTITY, [3, 4])).toEqual([3, 4]);
  });

  it("composes a translate after a scale the way ctx.transform does", () => {
    // Current = scale(2,3); ctx.transform(translate(5,7)) afterwards means
    // "translate, then scale" when applied to a point.
    const scale: Affine = [2, 0, 0, 3, 0, 0];
    const translate: Affine = [1, 0, 0, 1, 5, 7];
    const combined = multiply(scale, translate);
    // Apply translate first: (0,0) -> (5,7), then scale: -> (10,21).
    expect(applyToPoint(combined, [0, 0])).toEqual([10, 21]);
  });

  it("composing with identity on either side is a no-op", () => {
    const m: Affine = [2, 0.5, -0.5, 2, 3, -4];
    expect(multiply(m, IDENTITY)).toEqual(m);
    expect(multiply(IDENTITY, m)).toEqual(m);
  });

  it("rotation by 90deg maps (1,0) to (0,1)", () => {
    const rot90: Affine = [0, 1, -1, 0, 0, 0];
    const [x, y] = applyToPoint(rot90, [1, 0]);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
  });
});
