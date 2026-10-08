/**
 * Recolors hyperref-style link annotation borders (phase 0 capture: bright
 * green #00ff00 borders on arXiv papers, untouched by the shader since it
 * only sees canvas pixels, never the annotation layer's HTML/SVG).
 *
 * PDF.js renders a link's border two different ways depending on whether the
 * link wraps across lines (quadPoints):
 * - A single-rect link sets `container.style.borderColor` directly: a plain
 *   inline CSS color, which we can read and overwrite.
 * - A multi-rect (wrapped) link bakes the color into a `stroke="..."`
 *   attribute of an inline SVG `data:` URI set as `backgroundImage`, which
 *   is where most hyperref links in practice end up: CSS cannot reach a
 *   color inside a background-image, so this rewrites the data URI string.
 *
 * Both halves are plain string transforms, independent of the DOM glue that
 * finds the elements (src/viewer/layer.ts), and tested as such here.
 */
import { formatRgb, parseCssColor } from "../../color/css-color";
import type { Remap } from "../../color/remap";

/** `container.style.borderColor` (e.g. "rgb(0, 255, 0)") -> its remapped equivalent, or null if unparseable. */
export function recolorBorderColor(cssColor: string, remap: Remap): string | null {
  const parsed = parseCssColor(cssColor);
  if (!parsed) return null;
  return formatRgb(remap(parsed.rgb), parsed.alpha);
}

const STROKE = /stroke="([^"]*)"/;

/** `container.style.backgroundImage` holding the quad-border SVG data URI -> the same URI with its stroke recolored. */
export function rewriteBorderSvgStroke(backgroundImage: string, remap: Remap): string | null {
  const match = STROKE.exec(backgroundImage);
  if (!match) return null;
  const parsed = parseCssColor(match[1]!);
  if (!parsed) return null;
  const recolored = formatRgb(remap(parsed.rgb), parsed.alpha);
  return (
    backgroundImage.slice(0, match.index) +
    `stroke="${recolored}"` +
    backgroundImage.slice(match.index + match[0].length)
  );
}
