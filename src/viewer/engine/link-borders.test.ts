import { describe, expect, it } from "vitest";
import { makeRemap } from "../../color/remap";
import { recolorBorderColor, rewriteBorderSvgStroke } from "./link-borders";

const DARK = makeRemap({ bg: "#1e1f22", fg: "#e6e3dc" });

describe("recolorBorderColor", () => {
  it("remaps a plain border color PDF.js set inline (hex)", () => {
    const out = recolorBorderColor("#00ff00", DARK);
    expect(out).not.toBeNull();
    expect(out).not.toBe("#00ff00");
  });

  it("remaps the rgb() form the browser normalizes inline styles to", () => {
    const out = recolorBorderColor("rgb(0, 255, 0)", DARK);
    expect(out).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("returns null for an empty/unset border color", () => {
    expect(recolorBorderColor("", DARK)).toBeNull();
  });
});

describe("rewriteBorderSvgStroke", () => {
  const svg = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1 1"><g fill="transparent" stroke="#00ff00" stroke-width="1"><rect x="0" y="0" width="1" height="1"/></g></svg>')`;

  it("replaces the stroke color and leaves the rest of the data URI intact", () => {
    const out = rewriteBorderSvgStroke(svg, DARK);
    expect(out).not.toBeNull();
    expect(out).not.toContain('stroke="#00ff00"');
    expect(out).toContain('<rect x="0" y="0" width="1" height="1"/>');
    expect(out!.startsWith("url('data:image/svg+xml;utf8,<svg")).toBe(true);
  });

  it("returns null when there is no stroke attribute to find", () => {
    expect(rewriteBorderSvgStroke("url('data:image/svg+xml;utf8,<svg></svg>')", DARK)).toBeNull();
  });
});
