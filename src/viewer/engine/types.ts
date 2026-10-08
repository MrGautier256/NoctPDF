/** Shared types between the rect builders (tracker-based and operator-list fallback) and the shader. */

/** 0 keep, 1 dim, 2 recolor (also used for the "invert" image policy and for vectors/text), 3 grayscale, 4 blend. */
export type ImageRectMode = 0 | 1 | 2 | 3 | 4;

/**
 * Three corners of a (possibly rotated/skewed) parallelogram in normalized
 * page coordinates (0..1, top-left origin): origin, the point one unit along
 * U, and the point one unit along V. This is PDF.js' own CanvasImagesTracker
 * format (see docs/ADR-001-recoloration.md); the operator-list fallback
 * produces the same shape so both feed the same shader uniforms.
 */
export interface ImageRect {
  /** [x0,y0, xU,yU, xV,yV] */
  p: readonly [number, number, number, number, number, number];
  mode: ImageRectMode;
}
