// Spike color model: OKLab remap + 3D LUT. Deliberately small; the real model
// (with tests) is phase 2 work.

const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]) {
  r = srgbToLin(r); g = srgbToLin(g); b = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = lin => lin.every(c => c >= -1e-4 && c <= 1 + 1e-4);

// Reduce chroma until the color fits in sRGB (keeps L and hue).
export function oklabToRgb([L, a, b]) {
  let lin = oklabToLinear([L, a, b]);
  if (!inGamut(lin)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const k = (lo + hi) / 2;
      if (inGamut(oklabToLinear([L, a * k, b * k]))) lo = k; else hi = k;
    }
    lin = oklabToLinear([L, a * lo, b * lo]);
  }
  return lin.map(c => Math.min(1, Math.max(0, linToSrgb(Math.min(1, Math.max(0, c))))));
}

export const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

function relLum(rgb) {
  const [r, g, b] = rgb.map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (x, y) => {
  const [a, b] = [relLum(x), relLum(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Returns rgb -> rgb for a theme. Grays follow the bg->fg gradient (white
 * becomes bg, black becomes fg). Chromatic colors keep their hue, get an
 * inverted lightness inside the theme range and a scaled chroma. Colors that
 * were dark enough to be text are lifted until they reach minContrast vs bg.
 */
export function makeRemap({ bg, fg, chroma = 1, minContrast = 4.5 }) {
  const bgRgb = hexToRgb(bg), fgRgb = hexToRgb(fg);
  const B = rgbToOklab(bgRgb), F = rgbToOklab(fgRgb);
  return rgb => {
    const [L, a, b] = rgbToOklab(rgb);
    const C = Math.hypot(a, b);
    const t = 1 - Math.min(1, Math.max(0, L));
    const gL = B[0] + (F[0] - B[0]) * t;
    const ga = B[1] + (F[1] - B[1]) * t;
    const gb = B[2] + (F[2] - B[2]) * t;
    const w = smoothstep(0.015, 0.06, C);
    let out = [gL, ga + (a * chroma - ga) * w, gb + (b * chroma - gb) * w];
    if (w > 0.5 && L < 0.75 && minContrast > 1 && contrast(oklabToRgb(out), bgRgb) < minContrast) {
      // Text guard, chromatic colors only (grays already follow bg->fg):
      // bisect the smallest L shift toward fg that reaches minContrast.
      let lo = out[0], hi = F[0] > B[0] ? 1 : 0;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (contrast(oklabToRgb([mid, out[1], out[2]]), bgRgb) >= minContrast) hi = mid; else lo = mid;
      }
      out = [hi, out[1], out[2]];
    }
    return oklabToRgb(out);
  };
}

/** Bakes the remap into an N^3 RGBA8 LUT (r fastest), for a WebGL 3D texture. */
export function buildLut(remap, n = 33) {
  const data = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const out = remap([r / (n - 1), g / (n - 1), b / (n - 1)]);
        data[i++] = Math.round(out[0] * 255);
        data[i++] = Math.round(out[1] * 255);
        data[i++] = Math.round(out[2] * 255);
        data[i++] = 255;
      }
    }
  }
  return { n, data };
}

/** CSS color string (as PDF.js sets it) -> remapped "#rrggbb", memoized. */
export function makeStyleMapper(remap) {
  const cache = new Map();
  const probe = new OffscreenCanvas(1, 1).getContext("2d");
  return style => {
    let out = cache.get(style);
    if (out) return out;
    probe.fillStyle = "#000";
    probe.fillStyle = style;
    const norm = probe.fillStyle; // "#rrggbb" or "rgba(r, g, b, a)"
    let rgb, alpha = 1;
    if (norm[0] === "#") rgb = hexToRgb(norm);
    else {
      const m = norm.match(/[\d.]+/g).map(Number);
      rgb = m.slice(0, 3).map(v => v / 255);
      alpha = m[3] ?? 1;
    }
    const [r, g, b] = remap(rgb).map(v => Math.round(v * 255));
    out = alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
    cache.set(style, out);
    return out;
  };
}
