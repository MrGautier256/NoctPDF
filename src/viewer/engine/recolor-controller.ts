/**
 * Glues the ShaderRecolorer to the real PDF.js viewer's eventBus. Not unit
 * tested (it needs a live WebGL2 context and real PDFPageView objects); the
 * math it calls (color/remap, color/tuning, image-rects, image-policy,
 * operator-list-fallback) is tested on its own. Ported from the phase 0
 * spike (spikes/recolor/main.mjs), see docs/ADR-001-recoloration.md.
 */
import { hexToRgb } from "../../color/oklab";
import { buildLut, makeRemap, type Remap } from "../../color/remap";
import { histogramFromRgba, percentileLevels, type LevelsStretch } from "../../color/scan-normalize";
import { composeTuning, type Tuning } from "../../color/tuning";
import type { Settings } from "../../settings/schema";
import type { Affine } from "./affine";
import { classifyImageSample, isScannedPage, staticImageMode } from "./image-policy";
import { rectBounds, rectsFromTrackedCoordinates, type DetailViewArea } from "./image-rects";
import {
  collectImageRectsFromOperatorList,
  shouldUseOperatorListFallback,
  type OperatorList,
} from "./operator-list-fallback";
import { ShaderRecolorer } from "./shader-recolorer";
import type { ImageRect, ImageRectMode } from "./types";

const SCAN_SAMPLE_SIZE = 64;
const CLASSIFY_SAMPLE_SIZE = 48;

export interface PdfPageProxyLike {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  getOperatorList(): Promise<OperatorList>;
}

export interface PdfPageViewLike {
  id: number;
  canvas: HTMLCanvasElement | null;
  imageCoordinates: ArrayLike<number> | null | undefined;
  pdfPage: PdfPageProxyLike | null;
  viewport: { transform: Affine; width: number; height: number };
  pageView?: PdfPageViewLike; // detail views only: back-reference to the parent
}

export interface PageRenderedEvent {
  source: PdfPageViewLike;
  pageNumber: number;
  isDetailView?: boolean;
}

interface OriginalEntry {
  copy: OffscreenCanvas;
  canvas: HTMLCanvasElement;
  coords: ArrayLike<number> | null | undefined;
  detail?: DetailViewArea;
  pageNumber: number;
}

export interface RecolorTheme {
  bg: string;
  fg: string;
  chroma: number;
  minContrast: number;
  tuning: Tuning;
}

export class RecolorController {
  private readonly recolorer = new ShaderRecolorer();
  private remap: Remap;
  private bg: readonly [number, number, number] = [0, 0, 0];
  private readonly originals = new Map<string, OriginalEntry>();
  private readonly classifyCache = new Map<string, ImageRectMode>();
  private readonly textEmptyByPage = new Map<number, boolean>();
  /** Flat, coords-shaped rects from the operator-list walk, for pages where the tracker came back empty wrongly. */
  private readonly fallbackCoordsByPage = new Map<number, number[]>();
  private imagesSettings: Settings["images"];
  private peeking = false;

  constructor(theme: RecolorTheme, images: Settings["images"]) {
    this.imagesSettings = images;
    this.remap = this.buildRemap(theme);
    this.recolorer.setLut(buildLut(this.remap, 17));
  }

  private buildRemap(theme: RecolorTheme): Remap {
    this.bg = hexToRgb(theme.bg);
    const base = makeRemap({ bg: theme.bg, fg: theme.fg, chroma: theme.chroma, minContrast: theme.minContrast });
    return composeTuning(base, theme.tuning);
  }

  /** Call when the theme or tuning changes: rebuilds the LUT and reprocesses every cached, still-visible page. */
  setTheme(theme: RecolorTheme): void {
    this.remap = this.buildRemap(theme);
    this.recolorer.setLut(buildLut(this.remap, 17));
    this.reprocessAll();
  }

  setImagesSettings(images: Settings["images"]): void {
    this.imagesSettings = images;
    this.classifyCache.clear();
    this.reprocessAll();
  }

  /** Called on every `pagerendered` event (both full-page and detail-view renders). */
  onPageRendered(evt: PageRenderedEvent): void {
    const canvas = evt.source.canvas;
    if (!canvas?.width) return;
    const pageView = evt.isDetailView ? (evt.source.pageView ?? evt.source) : evt.source;
    const coords = pageView.imageCoordinates;

    void this.ensureTextEmptyKnown(pageView);
    if (!evt.isDetailView) void this.verifyImageCoordinates(pageView, evt.pageNumber);

    const detail = evt.isDetailView ? detailAreaFromCanvasStyle(canvas) : undefined;
    const rawRects = this.getRawRects(evt.pageNumber, coords, detail);

    const copy = new OffscreenCanvas(canvas.width, canvas.height);
    copy.getContext("2d")!.drawImage(canvas, 0, 0);

    const { rects, stretches } = this.classifyRects(rawRects, coords, evt.pageNumber, copy, !!evt.isDetailView);

    const out = this.recolorer.process(copy, rects, { dim: this.imagesSettings.dimLevel, bg: this.bg, stretches });
    canvas.getContext("2d")!.drawImage(out, 0, 0);
    canvas.dataset.noct = "1";

    this.originals.set(entryKey(evt.pageNumber, !!evt.isDetailView), {
      copy,
      canvas,
      coords,
      detail,
      pageNumber: evt.pageNumber,
    });
  }

  private classifyRects(
    rawRects: ReturnType<typeof rectsFromTrackedCoordinates>,
    coords: ArrayLike<number> | null | undefined,
    pageNumber: number,
    copy: OffscreenCanvas,
    isDetailView: boolean,
  ): { rects: ImageRect[]; stretches: Array<LevelsStretch | undefined> } {
    const staticMode = staticImageMode(this.imagesSettings.mode);
    const textEmpty = this.textEmptyByPage.get(pageNumber) ?? false;

    const rects: ImageRect[] = [];
    const stretches: Array<LevelsStretch | undefined> = [];
    for (let i = 0; i < rawRects.length; i++) {
      const raw = rawRects[i]!;
      const rawKey = coords ? rawSextetKey(pageNumber, coords, i) : `${pageNumber}:${i}`;
      const bounds = rectBounds(raw.p);
      const area = (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0);

      if (isScannedPage(area, textEmpty, this.imagesSettings.scanDetectionThreshold)) {
        // scannedPages is its own policy, independent of images.mode: a scan is not "an image on a page", it IS the page.
        if (this.imagesSettings.scannedPages === "recolor") {
          rects.push({ p: raw.p, mode: 2 });
          stretches.push(this.scanStretch(copy, bounds));
        } else {
          rects.push({ p: raw.p, mode: 0 });
          stretches.push(undefined);
        }
        continue;
      }

      let mode: ImageRectMode;
      if (staticMode !== null) {
        mode = staticMode;
      } else {
        const cached = this.classifyCache.get(rawKey);
        if (cached !== undefined) {
          mode = cached;
        } else if (isDetailView) {
          mode = 1; // not cached from the full-page render: approximate as "dim" (matches the phase 0 spike)
        } else {
          mode = classifyImageSample(sampleRect(copy, bounds, CLASSIFY_SAMPLE_SIZE));
          this.classifyCache.set(rawKey, mode);
        }
      }
      rects.push({ p: raw.p, mode });
      stretches.push(undefined);
    }
    return { rects, stretches };
  }

  private scanStretch(
    copy: OffscreenCanvas,
    bounds: { x0: number; y0: number; x1: number; y1: number },
  ): LevelsStretch {
    const sample = sampleRect(copy, bounds, SCAN_SAMPLE_SIZE);
    const hist = histogramFromRgba(sample);
    return percentileLevels(hist);
  }

  private async ensureTextEmptyKnown(pageView: PdfPageViewLike): Promise<void> {
    if (this.textEmptyByPage.has(pageView.id) || !pageView.pdfPage) return;
    const content = await pageView.pdfPage.getTextContent();
    this.textEmptyByPage.set(
      pageView.id,
      content.items.every(it => !it.str?.trim()),
    );
  }

  /**
   * Covers the "imagesRightClickMinSize relies on an internal behavior" risk
   * (docs/backlog.md): if the tracker comes back empty on a page whose
   * operator list actually paints images, walk the operator list ourselves
   * and reprocess the page with those rects instead.
   */
  private async verifyImageCoordinates(pageView: PdfPageViewLike, pageNumber: number): Promise<void> {
    if (!pageView.pdfPage || this.fallbackCoordsByPage.has(pageNumber)) return;
    const coords = pageView.imageCoordinates;
    if (coords && coords.length > 0) return;
    const operatorList = await pageView.pdfPage.getOperatorList();
    if (!shouldUseOperatorListFallback(coords, operatorList)) return;
    const { transform, width, height } = pageView.viewport;
    const rects = collectImageRectsFromOperatorList(operatorList, transform, width, height);
    this.fallbackCoordsByPage.set(
      pageNumber,
      rects.flatMap(r => r.p),
    );
    this.reprocessPage(pageNumber);
  }

  /** The flat, tracker-shaped coordinates to use for a page: the operator-list fallback if one was computed, else the tracker's own. */
  private getRawRects(
    pageNumber: number,
    coords: ArrayLike<number> | null | undefined,
    detail: DetailViewArea | undefined,
  ): ReturnType<typeof rectsFromTrackedCoordinates> {
    const fallback = !coords || coords.length === 0 ? this.fallbackCoordsByPage.get(pageNumber) : undefined;
    return rectsFromTrackedCoordinates(fallback ?? coords, detail);
  }

  private reprocessPage(pageNumber: number): void {
    for (const key of [entryKey(pageNumber, false), entryKey(pageNumber, true)]) {
      const o = this.originals.get(key);
      if (o) this.reprocessOne(o);
    }
  }

  private reprocessAll(): void {
    for (const o of this.originals.values()) this.reprocessOne(o);
  }

  private reprocessOne(o: OriginalEntry): void {
    if (!o.canvas.isConnected) return;
    const rawRects = this.getRawRects(o.pageNumber, o.coords, o.detail);
    const { rects, stretches } = this.classifyRects(rawRects, o.coords, o.pageNumber, o.copy, !!o.detail);
    const out = this.recolorer.process(o.copy, rects, { dim: this.imagesSettings.dimLevel, bg: this.bg, stretches });
    o.canvas.getContext("2d")!.drawImage(out, 0, 0);
  }

  /** Shows the original, un-recolored pages while held (the "peek" key). */
  setPeeking(on: boolean): void {
    if (this.peeking === on) return;
    this.peeking = on;
    if (on) {
      for (const o of this.originals.values()) {
        if (!o.canvas.isConnected) continue;
        o.canvas.getContext("2d")!.drawImage(o.copy, 0, 0);
      }
    } else {
      this.reprocessAll();
    }
  }

  /** Restores original pixels for printing (settings.print.useTheme === false). Call again with false after printing. */
  setPrintingOriginal(on: boolean): void {
    if (on) {
      for (const o of this.originals.values()) o.canvas.getContext("2d")!.drawImage(o.copy, 0, 0);
    } else {
      this.reprocessAll();
    }
  }
}

function entryKey(pageNumber: number, isDetailView: boolean): string {
  return `${pageNumber}:${isDetailView ? "d" : "p"}`;
}

function rawSextetKey(pageNumber: number, coords: ArrayLike<number>, rectIndex: number): string {
  const base = rectIndex * 6;
  const parts: number[] = [];
  for (let k = 0; k < 6; k++) parts.push(coords[base + k] ?? 0);
  return `${pageNumber}:${parts.map(v => v.toFixed(4)).join(",")}`;
}

function detailAreaFromCanvasStyle(canvas: HTMLCanvasElement): DetailViewArea {
  const s = canvas.style;
  return {
    offsetX: parseFloat(s.left) / 100 || 0,
    offsetY: parseFloat(s.top) / 100 || 0,
    scaleX: parseFloat(s.width) / 100 || 1,
    scaleY: parseFloat(s.height) / 100 || 1,
  };
}

function sampleRect(
  source: OffscreenCanvas,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  size: number,
): Uint8ClampedArray {
  const x0 = bounds.x0 * source.width;
  const y0 = bounds.y0 * source.height;
  const w = Math.max(1, bounds.x1 * source.width - x0);
  const h = Math.max(1, bounds.y1 * source.height - y0);
  const sampler = new OffscreenCanvas(size, size);
  const ctx = sampler.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, x0, y0, w, h, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
