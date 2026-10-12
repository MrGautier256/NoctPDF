/**
 * Main-thread counterpart of cpu-recolor.worker.ts: same setLut/process
 * shape as ShaderRecolorer (see recolor-controller.ts), but `process` is
 * necessarily async (it round-trips to the Worker) where the GPU one is
 * synchronous. Not unit tested: it needs a real Worker and OffscreenCanvas,
 * neither available in Vitest's node environment; the pixel math it
 * delegates to is tested in cpu-recolor-pixels.test.ts.
 */
import type { LevelsStretch, ProcessOptions } from "./shader-recolorer";
import type { ImageRect } from "./types";
import type { CpuRecolorRequest, CpuRecolorResponse } from "./cpu-recolor.worker";

export class CpuRecolorer {
  readonly renderer = "cpu (worker fallback, no WebGL2)";
  private readonly worker: Worker;
  private readonly scratch = new OffscreenCanvas(1, 1);
  private readonly scratchCtx: OffscreenCanvasRenderingContext2D;
  private nextId = 1;
  private readonly pending = new Map<number, (pixels: ArrayBuffer) => void>();
  private lut: { n: number; data: Uint8Array } = { n: 2, data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) };

  constructor() {
    const ctx = this.scratch.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.scratchCtx = ctx;
    this.worker = new Worker(new URL("./cpu-recolor.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<CpuRecolorResponse>) => {
      const resolve = this.pending.get(e.data.id);
      if (!resolve) return;
      this.pending.delete(e.data.id);
      resolve(e.data.pixels);
    };
  }

  setLut(lut: { n: number; data: Uint8Array }): void {
    this.lut = lut;
  }

  async process(
    source: OffscreenCanvas,
    rects: readonly ImageRect[],
    options: ProcessOptions = {},
  ): Promise<OffscreenCanvas> {
    const { width, height } = source;
    if (this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch.width = width;
      this.scratch.height = height;
    }
    this.scratchCtx.drawImage(source, 0, 0);
    const srcPixels = this.scratchCtx.getImageData(0, 0, width, height).data.buffer;
    const lutData = this.lut.data.buffer.slice(0) as ArrayBuffer;

    const id = this.nextId++;
    const result = new Promise<ArrayBuffer>(resolve => this.pending.set(id, resolve));
    const request: CpuRecolorRequest = {
      id,
      width,
      height,
      pixels: srcPixels,
      rects: rects.map(r => ({ p: r.p, mode: r.mode })),
      stretches: (options.stretches ?? []).map((s): LevelsStretch | null => (s ? { lo: s.lo, hi: s.hi } : null)),
      lutN: this.lut.n,
      lutData,
      dim: options.dim ?? 0.85,
      bg: options.bg ?? [0, 0, 0],
      split: options.split ?? 0,
    };
    this.worker.postMessage(request, [request.pixels, request.lutData]);

    const pixels = await result;
    this.scratchCtx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return this.scratch;
  }
}
