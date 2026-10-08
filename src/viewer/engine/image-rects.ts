/**
 * Turns PDF.js' CanvasImagesTracker output (pageView.imageCoordinates: a flat
 * array of normalized [x0,y0, xU,yU, xV,yV] sextets, one per image) into the
 * rect list the shader consumes. The only real work here is the detail
 * canvas (phase 0 §1, PDF.js 6.x's high-zoom overlay): it covers a
 * sub-rectangle of the page, given as CSS percentages, so coordinates
 * recorded against the *full page* have to be re-expressed in the detail
 * canvas' own normalized space.
 */
import type { RawRect } from "./types";

export interface DetailViewArea {
  /** The detail canvas' CSS left/top/width/height, as 0..1 fractions of the full page. */
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

const SEXTET = 6;

export function rectsFromTrackedCoordinates(
  coords: ArrayLike<number> | null | undefined,
  detail?: DetailViewArea,
): RawRect[] {
  if (!coords || coords.length === 0) return [];
  const rects: RawRect[] = [];
  for (let i = 0; i + SEXTET <= coords.length; i += SEXTET) {
    const p: [number, number, number, number, number, number] = [
      coords[i]!,
      coords[i + 1]!,
      coords[i + 2]!,
      coords[i + 3]!,
      coords[i + 4]!,
      coords[i + 5]!,
    ];
    rects.push({ p: detail ? reprojectForDetailView(p, detail) : p });
  }
  return rects;
}

function reprojectForDetailView(
  p: readonly [number, number, number, number, number, number],
  { offsetX, offsetY, scaleX, scaleY }: DetailViewArea,
): [number, number, number, number, number, number] {
  const x = (v: number) => (v - offsetX) / scaleX;
  const y = (v: number) => (v - offsetY) / scaleY;
  return [x(p[0]), y(p[1]), x(p[2]), y(p[3]), x(p[4]), y(p[5])];
}

/** Axis-aligned bounding box of a rect, in normalized page coordinates, clamped to the page. */
export function rectBounds(p: readonly [number, number, number, number, number, number]): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const [x0, y0, xu, yu, xv, yv] = p;
  const x4 = xu + xv - x0;
  const y4 = yu + yv - y0;
  const xs = [x0, xu, xv, x4];
  const ys = [y0, yu, yv, y4];
  return {
    x0: Math.max(0, Math.min(...xs)),
    y0: Math.max(0, Math.min(...ys)),
    x1: Math.min(1, Math.max(...xs)),
    y1: Math.min(1, Math.max(...ys)),
  };
}
