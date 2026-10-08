import { describe, expect, it } from "vitest";
import { IDENTITY } from "./affine";
import {
  collectImageRectsFromOperatorList,
  shouldUseOperatorListFallback,
  type OperatorList,
} from "./operator-list-fallback";

const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintImageXObjectRepeat: 88 };

describe("shouldUseOperatorListFallback", () => {
  it("does not engage when the tracker already found rects", () => {
    const ol: OperatorList = { fnArray: [OPS.paintImageXObject], argsArray: [[]] };
    expect(shouldUseOperatorListFallback(new Float32Array(6), ol)).toBe(false);
  });

  it("does not engage on a page with no images at all", () => {
    const ol: OperatorList = { fnArray: [OPS.save, OPS.restore], argsArray: [null, null] };
    expect(shouldUseOperatorListFallback(null, ol)).toBe(false);
    expect(shouldUseOperatorListFallback(new Float32Array(0), ol)).toBe(false);
  });

  it("engages when the tracker is empty but the page paints an image (the risk the backlog calls out)", () => {
    const ol: OperatorList = { fnArray: [OPS.save, OPS.paintImageXObject, OPS.restore], argsArray: [null, [], null] };
    expect(shouldUseOperatorListFallback(null, ol)).toBe(true);
    expect(shouldUseOperatorListFallback(new Float32Array(0), ol)).toBe(true);
  });
});

describe("collectImageRectsFromOperatorList", () => {
  it("places a single image painted at the full unit square (no transforms)", () => {
    const ol: OperatorList = { fnArray: [OPS.paintImageXObject], argsArray: [["objId"]] };
    const rects = collectImageRectsFromOperatorList(ol, IDENTITY, 100, 200);
    expect(rects).toHaveLength(1);
    const [x0, y0, xu, yu, xv, yv] = rects[0]!.p;
    expect([x0, y0]).toEqual([0, 0]);
    expect([xu, yu]).toEqual([1 / 100, 0]);
    expect([xv, yv]).toEqual([0, 1 / 200]);
  });

  it("applies a cm placing the image in the right half of the page", () => {
    // cm: scale 50x200 then translate to x=50 (PDF units == pixels here, viewport = identity).
    const ol: OperatorList = {
      fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      argsArray: [null, [50, 0, 0, 200, 50, 0], ["objId"], null],
    };
    const rects = collectImageRectsFromOperatorList(ol, IDENTITY, 100, 200);
    expect(rects).toHaveLength(1);
    const [x0, y0] = rects[0]!.p;
    expect(x0).toBeCloseTo(0.5, 10);
    expect(y0).toBeCloseTo(0, 10);
  });

  it("restore undoes a transform, so a later image at the same op is unaffected", () => {
    const ol: OperatorList = {
      fnArray: [OPS.save, OPS.transform, OPS.restore, OPS.paintImageXObject],
      argsArray: [null, [1, 0, 0, 1, 999, 999], null, ["objId"]],
    };
    const rects = collectImageRectsFromOperatorList(ol, IDENTITY, 100, 200);
    expect(rects[0]!.p[0]).toBeCloseTo(0, 10);
    expect(rects[0]!.p[1]).toBeCloseTo(0, 10);
  });

  it("expands paintImageXObjectRepeat into one rect per tile position", () => {
    const ol: OperatorList = {
      fnArray: [OPS.paintImageXObjectRepeat],
      argsArray: [["objId", 10, 10, [0, 0, 20, 0, 40, 0]]],
    };
    const rects = collectImageRectsFromOperatorList(ol, IDENTITY, 100, 10);
    expect(rects).toHaveLength(3);
    expect(rects.map(r => r.p[0])).toEqual([0, 0.2, 0.4]);
  });
});
