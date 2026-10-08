/**
 * Fallback image rects from the raw operator list, for the (expected rare)
 * case where PDF.js' own CanvasImagesTracker (`pageView.imageCoordinates`,
 * see docs/ADR-001-recoloration.md) comes back empty on a page that actually
 * paints images: an internal change to that tracker in a future PDF.js
 * version, or the two ops phase 0 found it does not cover
 * (paintImageXObjectRepeat, paintInlineImageXObjectGroup).
 *
 * Every PDF image-painting operator draws into the unit square (0,0)-(1,1)
 * under whatever transform is current when the operator runs; a preceding
 * `cm` (OPS.transform) always places it, per the PDF content stream model.
 * So walking save/restore/transform to track the CTM and reading it off at
 * each image op reconstructs the same parallelogram the tracker records.
 *
 * OPS codes are from PDF.js 6.3.289's public operator list contract
 * (web/pdf.mjs OPS enum); they are a stable serialization format, not an
 * internal we read out of the bundle, but pinned here as plain numbers so
 * this module has no runtime dependency on the pdf.js bundle and can be
 * unit tested with synthetic operator lists.
 */
import { applyToPoint, IDENTITY, multiply, type Affine } from "./affine";
import type { ImageRect } from "./types";

const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  paintImageMaskXObject: 83,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
} as const;

/** The ops that paint pixels (as opposed to paintImageMaskXObject, a stencil that must stay recolored). */
const IMAGE_PAINT_OPS: ReadonlySet<number> = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageXObjectRepeat,
]);

export interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<readonly unknown[] | null>;
}

/**
 * True when the tracker's result cannot be trusted: it is empty/missing but
 * the page's own operator list paints at least one image. Callers should
 * then use {@link collectImageRectsFromOperatorList} instead.
 */
export function shouldUseOperatorListFallback(
  trackedCoordinates: ArrayLike<number> | null | undefined,
  operatorList: OperatorList,
): boolean {
  if (trackedCoordinates && trackedCoordinates.length > 0) return false;
  const { fnArray } = operatorList;
  for (let i = 0; i < fnArray.length; i++) {
    if (IMAGE_PAINT_OPS.has(fnArray[i] ?? -1)) return true;
  }
  return false;
}

interface InlineImageGroupMap {
  transform: readonly [number, number, number, number, number, number];
}

/**
 * Walks the operator list maintaining the CTM, and returns one rect per
 * image-painting op (mode defaults to 2/recolor; callers reclassify with the
 * same image policy used for tracker-derived rects).
 *
 * @param viewportTransform the page's own viewport.transform (PDF space -> the
 *   same pixel space pageView.imageCoordinates is normalized against)
 * @param viewportWidth/viewportHeight that viewport's pixel dimensions, for normalization
 */
export function collectImageRectsFromOperatorList(
  operatorList: OperatorList,
  viewportTransform: Affine,
  viewportWidth: number,
  viewportHeight: number,
): ImageRect[] {
  const rects: ImageRect[] = [];
  const stack: Affine[] = [];
  let ctm: Affine = IDENTITY;
  const { fnArray, argsArray } = operatorList;

  const unitSquareRect = (tileCtm: Affine): ImageRect => {
    const total = multiply(viewportTransform, tileCtm);
    const normalize = (local: readonly [number, number]): [number, number] => {
      const [x, y] = applyToPoint(total, local);
      return [x / viewportWidth, y / viewportHeight];
    };
    const origin = normalize([0, 0]);
    const u = normalize([1, 0]);
    const v = normalize([0, 1]);
    return { p: [origin[0], origin[1], u[0], u[1], v[0], v[1]], mode: 2 };
  };

  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i];
    if (op === OPS.save) {
      stack.push(ctm);
    } else if (op === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (op === OPS.transform) {
      const [a, b, c, d, e, f] = (args ?? [1, 0, 0, 1, 0, 0]) as number[];
      ctm = multiply(ctm, [a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0]);
    } else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject) {
      rects.push(unitSquareRect(ctm));
    } else if (op === OPS.paintImageXObjectRepeat) {
      const [, scaleX, scaleY, rawPositions] = (args ?? []) as [unknown, number, number, number[] | undefined];
      const positions = rawPositions ?? [];
      for (let k = 0; k + 1 < positions.length; k += 2) {
        rects.push(unitSquareRect(multiply(ctm, [scaleX, 0, 0, scaleY, positions[k]!, positions[k + 1]!])));
      }
    } else if (op === OPS.paintInlineImageXObjectGroup) {
      const [, map] = (args ?? []) as [unknown, InlineImageGroupMap[] | undefined];
      for (const entry of map ?? []) {
        rects.push(unitSquareRect(multiply(ctm, entry.transform)));
      }
    }
  }
  return rects;
}
