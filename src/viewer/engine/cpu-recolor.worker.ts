/**
 * Thin Worker entry point: wires processPixels() (cpu-recolor-pixels.ts) to
 * postMessage/onmessage. Not unit tested (needs the Worker global); the
 * pixel math it calls is tested on its own.
 */
import { processPixels, type PixelRect } from "./cpu-recolor-pixels";
import type { LevelsStretch } from "../../color/scan-normalize";

export interface CpuRecolorRequest {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  rects: PixelRect[];
  stretches: Array<LevelsStretch | null>;
  lutN: number;
  lutData: ArrayBuffer;
  dim: number;
  bg: readonly [number, number, number];
  split: number;
}

export interface CpuRecolorResponse {
  id: number;
  pixels: ArrayBuffer;
}

self.onmessage = (e: MessageEvent<CpuRecolorRequest>) => {
  const req = e.data;
  const pixels = processPixels({
    width: req.width,
    height: req.height,
    pixels: new Uint8ClampedArray(req.pixels),
    rects: req.rects,
    stretches: req.stretches,
    lutN: req.lutN,
    lutData: new Uint8Array(req.lutData),
    dim: req.dim,
    bg: req.bg,
    split: req.split,
  });
  const buffer = pixels.buffer as ArrayBuffer;
  const response: CpuRecolorResponse = { id: req.id, pixels: buffer };
  (self as unknown as Worker).postMessage(response, [buffer]);
};
