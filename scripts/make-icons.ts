// Draws the extension icon (a dark page with text lines and a crescent moon)
// at every size Chrome asks for. Run: node scripts/make-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";

type Rgba = [number, number, number, number];
const SIZES = [16, 32, 48, 96, 128];
const SS = 4; // supersampling factor per axis

const hex = (h: string, a = 255): Rgba => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).concat(a) as Rgba;
const PAGE = hex("#26282c");
const EDGE = hex("#3a3c42");
const LINE = hex("#b9b5ac");
const MOON = hex("#f2d38b");

/** Color of the icon at (x, y) in a 0..1 square, or null for transparent. */
function sample(x: number, y: number): Rgba | null {
  // Page: rounded rectangle.
  const r = 0.14,
    x0 = 0.1,
    y0 = 0.04,
    x1 = 0.9,
    y1 = 0.96;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r),
    cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy);
  if (x < x0 || x > x1 || y < y0 || y > y1 || d > r) return null;
  // Crescent: a disc minus an offset disc.
  const inMoon = Math.hypot(x - 0.62, y - 0.3) < 0.18 && Math.hypot(x - 0.71, y - 0.24) > 0.15;
  if (inMoon) return MOON;
  // Text lines.
  for (const [ly, len] of [
    [0.58, 0.62],
    [0.69, 0.62],
    [0.8, 0.42],
  ] as const) {
    if (Math.abs(y - ly) < 0.035 && x > 0.2 && x < 0.2 + len) return LINE;
  }
  return d > r - 0.03 || x < x0 + 0.03 || x > x1 - 0.03 || y < y0 + 0.03 || y > y1 - 0.03 ? EDGE : PAGE;
}

function draw(size: number): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc: [number, number, number, number] = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!c) continue;
          const a = c[3] / 255;
          acc[0] += c[0] * a;
          acc[1] += c[1] * a;
          acc[2] += c[2] * a;
          acc[3] += a;
        }
      }
      const i = (py * size + px) * 4;
      const cover = acc[3];
      png.data[i] = cover ? Math.round(acc[0] / cover) : 0;
      png.data[i + 1] = cover ? Math.round(acc[1] / cover) : 0;
      png.data[i + 2] = cover ? Math.round(acc[2] / cover) : 0;
      png.data[i + 3] = Math.round((cover / (SS * SS)) * 255);
    }
  }
  return PNG.sync.write(png);
}

const outDir = resolve(import.meta.dirname, "..", "public", "icon");
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) writeFileSync(join(outDir, `${size}.png`), draw(size));
console.log(`icons written to ${outDir}`);
