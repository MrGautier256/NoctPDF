import { describe, expect, it } from "vitest";
import { classifyImageSample, isScannedPage, staticImageMode } from "./image-policy";

function sample(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe("staticImageMode", () => {
  it("maps every non-auto mode directly", () => {
    expect(staticImageMode("keep")).toBe(0);
    expect(staticImageMode("dim")).toBe(1);
    expect(staticImageMode("invert")).toBe(2);
    expect(staticImageMode("grayscale")).toBe(3);
    expect(staticImageMode("blend")).toBe(4);
  });

  it("returns null for auto, meaning the caller must classify", () => {
    expect(staticImageMode("auto")).toBeNull();
  });
});

describe("classifyImageSample", () => {
  it("classifies a mostly-white, few-color sample as a diagram (invert/recolor)", () => {
    const px: Array<[number, number, number]> = [];
    for (let i = 0; i < 90; i++) px.push([250, 250, 250]); // white background
    for (let i = 0; i < 10; i++) px.push([20, 20, 150]); // a few lines of blue ink
    expect(classifyImageSample(sample(px))).toBe(2);
  });

  it("classifies a rich, mostly-dark photo-like sample as dim", () => {
    const px: Array<[number, number, number]> = [];
    // A noisy, colorful sample with almost no light pixels and many distinct bins.
    for (let i = 0; i < 100; i++) {
      px.push([(i * 37) % 256, (i * 59) % 100, (i * 83) % 60]);
    }
    expect(classifyImageSample(sample(px))).toBe(1);
  });

  it("defaults to dim on an empty sample", () => {
    expect(classifyImageSample(new Uint8ClampedArray(0))).toBe(1);
  });
});

describe("isScannedPage", () => {
  it("is true only when the page has no text and the image covers enough of it", () => {
    expect(isScannedPage(0.9, true, 0.85)).toBe(true);
    expect(isScannedPage(0.5, true, 0.85)).toBe(false);
    expect(isScannedPage(0.9, false, 0.85)).toBe(false);
  });
});
