/**
 * Minimal CSS color string parsing, without the OffscreenCanvas probe the
 * phase 0 spike used (not available in Vitest's node environment, nor in a
 * phase 6 Worker without OffscreenCanvas support). Covers what PDF.js itself
 * emits: #rgb, #rrggbb, #rrggbbaa, rgb(...), rgba(...).
 */
import type { Rgb } from "./oklab";

export interface ParsedColor {
  rgb: Rgb;
  alpha: number;
}

export function parseCssColor(input: string): ParsedColor | null {
  const s = input.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const nibble = (i: number) => parseInt(hex.charAt(i) + hex.charAt(i), 16);
      const r = nibble(0);
      const g = nibble(1);
      const b = nibble(2);
      const alpha = hex.length === 4 ? nibble(3) / 255 : 1;
      return { rgb: [r / 255, g / 255, b / 255], alpha };
    }
    if (hex.length === 6 || hex.length === 8) {
      const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      const r = byte(0);
      const g = byte(2);
      const b = byte(4);
      const alpha = hex.length === 8 ? byte(6) / 255 : 1;
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { rgb: [r / 255, g / 255, b / 255], alpha };
    }
    return null;
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (!m) return null;
  const [, rStr, gStr, bStr, aStr] = m;
  const r = Number(rStr) / 255;
  const g = Number(gStr) / 255;
  const b = Number(bStr) / 255;
  return { rgb: [r, g, b], alpha: aStr === undefined ? 1 : Number(aStr) };
}

export function formatRgb([r, g, b]: Rgb, alpha = 1): string {
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  const br = byte(r);
  const bg = byte(g);
  const bb = byte(b);
  return alpha === 1 ? `rgb(${br},${bg},${bb})` : `rgba(${br},${bg},${bb},${alpha})`;
}
