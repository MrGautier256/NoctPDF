/**
 * 2D affine matrix helpers (the [a,b,c,d,e,f] form Canvas2D and PDF content
 * streams both use: x' = a*x + c*y + e, y' = b*x + d*y + f).
 */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/**
 * Composes two matrices the way `ctx.transform(...)` composes onto the
 * current transform: multiply(current, delta) is the matrix you get after
 * `ctx.transform(...delta)` when the context's matrix was `current`, i.e.
 * applying the result to a point equals applying `delta` first, then `current`.
 */
export function multiply(current: Affine, delta: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = current;
  const [a2, b2, c2, d2, e2, f2] = delta;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyToPoint(m: Affine, [x, y]: readonly [number, number]): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}
