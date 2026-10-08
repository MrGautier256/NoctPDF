/**
 * OKLab/OKLCh color math (Björn Ottosson's model). Pure functions, no DOM
 * dependency, so the same reference runs in tests, the GPU LUT builder and
 * (phase 6) the CPU fallback Worker.
 */

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

const srgbToLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: Rgb): Lab {
  const rl = srgbToLin(r);
  const gl = srgbToLin(g);
  const bl = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin: Rgb): boolean => lin.every(c => c >= -1e-4 && c <= 1 + 1e-4);

/** OKLab -> sRGB, reducing chroma (keeping L and hue) until it fits the gamut. */
export function oklabToRgb(lab: Lab): Rgb {
  let lin = oklabToLinear(lab);
  if (!inGamut(lin)) {
    const [L, a, b] = lab;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const k = (lo + hi) / 2;
      if (inGamut(oklabToLinear([L, a * k, b * k]))) lo = k;
      else hi = k;
    }
    lin = oklabToLinear([L, a * lo, b * lo]);
  }
  return lin.map(c => Math.min(1, Math.max(0, linToSrgb(Math.min(1, Math.max(0, c)))))) as unknown as Rgb;
}

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return `#${[r, g, b].map(c => byte(c).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

/** WCAG contrast ratio between two sRGB colors (1 .. 21). */
export function contrast(x: Rgb, y: Rgb): number {
  const lighter = Math.max(relativeLuminance(x), relativeLuminance(y));
  const darker = Math.min(relativeLuminance(x), relativeLuminance(y));
  return (lighter + 0.05) / (darker + 0.05);
}

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** OKLab chroma and hue (radians), for OKLCh-style manipulations. */
export function labToLch([L, a, b]: Lab): { l: number; c: number; h: number } {
  return { l: L, c: Math.hypot(a, b), h: Math.atan2(b, a) };
}
