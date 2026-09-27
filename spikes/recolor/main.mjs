// Phase 0 recolor harness. Query params:
//   mode=none|hook|shader  file=<pdf url>  scale=<n>  probe=1  theme=<id>
import { makeRemap, buildLut, makeStyleMapper, hexToRgb } from "./color.mjs";
import { installHook } from "./hook.mjs";
import { ShaderRecolorer } from "./shader.mjs";

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "shader";
const file = q.get("file") ?? "../fixtures/sample.pdf";
const scale = Number(q.get("scale") ?? 1.25);
const THEMES = {
  dark: { bg: "#1e1f22", fg: "#e6e3dc", surround: "#141517" },
  sepia: { bg: "#2b2520", fg: "#e8d9c0", surround: "#1d1915" },
  nord: { bg: "#2e3440", fg: "#eceff4", surround: "#242933" },
};
let theme = THEMES[q.get("theme") ?? "dark"];
const R = (window.__results = { mode, file, scale, pages: {}, events: [], errors: [] });
window.addEventListener("error", e => R.errors.push(String(e.message)));

// ---- probe: count every 2D call, on-screen and offscreen contexts ----
if (q.get("probe")) {
  R.probe = {};
  for (const [name, C] of [
    ["2d", CanvasRenderingContext2D],
    ["offscreen2d", globalThis.OffscreenCanvasRenderingContext2D],
  ]) {
    if (!C) continue;
    for (const key of Object.getOwnPropertyNames(C.prototype)) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, key);
      if (typeof d.value !== "function" || key === "constructor") continue;
      C.prototype[key] = function (...args) {
        const k = `${name}.${key}`;
        R.probe[k] = (R.probe[k] ?? 0) + 1;
        if (key === "drawImage") {
          const t = `${name}.drawImage<${args[0]?.constructor?.name}>`;
          R.probe[t] = (R.probe[t] ?? 0) + 1;
        }
        return d.value.apply(this, args);
      };
    }
  }
  const W = globalThis.Worker;
  globalThis.Worker = class extends W {
    constructor(url, opts) {
      super(url, opts);
      (R.workers ??= []).push(String(url));
    }
  };
}

document.documentElement.style.setProperty("--noct-bg", theme.bg);
document.documentElement.style.setProperty("--noct-surround", theme.surround);
if (mode === "none") document.documentElement.classList.add("no-theme");

let remap = makeRemap({ bg: theme.bg, fg: theme.fg });
let hookState, recolorer;
if (mode === "hook") hookState = installHook(makeStyleMapper(remap));
if (mode === "shader") {
  recolorer = new ShaderRecolorer();
  R.renderer = recolorer.renderer;
  const t = performance.now();
  recolorer.setLut(buildLut(remap));
  R.lutMs = performance.now() - t;
}

const pdfjsLib = await import("../node_modules/pdfjs-dist/build/pdf.mjs");
globalThis.pdfjsLib = pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "../node_modules/pdfjs-dist/build/pdf.worker.mjs";
const { EventBus, PDFViewer, PDFLinkService } = await import("../node_modules/pdfjs-dist/web/pdf_viewer.mjs");

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const viewer = new PDFViewer({
  container: document.getElementById("viewerContainer"),
  eventBus,
  linkService,
  // >= 0 turns on PDF.js' CanvasImagesTracker (right-click image feature).
  imagesRightClickMinSize: mode === "shader" ? 0 : -1,
});
linkService.setViewer(viewer);
window.__viewer = viewer;

const renderStart = new Map();
const originals = new Map(); // pageNumber -> { copy: OffscreenCanvas, canvas, rects }
const textEmpty = new Map();

eventBus.on("pagerender", ({ pageNumber }) => renderStart.set(pageNumber, performance.now()));
eventBus.on("pagerendered", ev => {
  const { pageNumber, source, isDetailView, timestamp } = ev;
  const entry = (R.pages[pageNumber] ??= { renders: [] });
  const r = { detail: !!isDetailView, renderMs: +(timestamp - (renderStart.get(pageNumber) ?? timestamp)).toFixed(1) };
  entry.renders.push(r);
  R.events.push(["pagerendered", pageNumber, !!isDetailView, performance.now()]);
  if (mode !== "shader") return;

  const pageView = source.pageView ?? source; // detail view exposes pageView
  const canvas = isDetailView ? pageView.detailView?.canvas : pageView.canvas;
  if (!canvas || !canvas.width) return;
  const coords = pageView.imageCoordinates ?? pageView.pdfPage?.imageCoordinates;
  r.imageRects = coords ? coords.length / 6 : null;
  const t0 = performance.now();
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  copy.getContext("2d").drawImage(canvas, 0, 0);
  const tCopy = performance.now();
  const rects = buildRects(coords, canvas, isDetailView, pageNumber, copy);
  const out = recolorer.process(copy, rects, { split: window.__split ?? 0 });
  canvas.getContext("2d").drawImage(out, 0, 0);
  canvas.dataset.noct = "1";
  const t1 = performance.now();
  r.copyMs = +(tCopy - t0).toFixed(2);
  r.processMs = +(t1 - t0).toFixed(2);
  r.px = canvas.width * canvas.height;
  r.rects = rects.map(x => x.mode);
  originals.set(`${pageNumber}:${isDetailView ? "d" : "p"}`, { copy, canvas, coords, isDetailView, pageNumber });
});

// Normalized page coords -> normalized canvas coords (detail canvas covers a
// sub-rectangle of the page, given in CSS percentages by PDF.js).
function buildRects(coords, canvas, isDetail, pageNumber, copy) {
  if (!coords) return [];
  let ox = 0, oy = 0, sx = 1, sy = 1;
  if (isDetail) {
    const st = canvas.style;
    ox = parseFloat(st.left) / 100; oy = parseFloat(st.top) / 100;
    sx = parseFloat(st.width) / 100; sy = parseFloat(st.height) / 100;
  }
  const rects = [];
  for (let i = 0; i < coords.length; i += 6) {
    const p = [];
    for (let k = 0; k < 6; k += 2) p.push((coords[i + k] - ox) / sx, (coords[i + k + 1] - oy) / sy);
    rects.push({ p, mode: classify(coords.subarray(i, i + 6), copy, isDetail, pageNumber, p) });
  }
  return rects;
}

// Image policy "auto": diagrams (light, few colors) are recolored like
// vectors, photos are dimmed. Scans (>= 85% of page, no text) are recolored.
const classCache = new Map();
function classify(c, copy, isDetail, pageNumber, p) {
  const key = `${pageNumber}:${Array.from(c).map(v => v.toFixed(3)).join(",")}`;
  if (classCache.has(key)) return classCache.get(key);
  const xs = [c[0], c[2], c[4], c[2] + c[4] - c[0]], ys = [c[1], c[3], c[5], c[3] + c[5] - c[1]];
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  let m;
  if (area >= 0.85 && textEmpty.get(pageNumber)) m = 2;
  else if (isDetail) return 1; // not cached: classify from the full page canvas
  else {
    const px = [p[0], p[2], p[4], p[2] + p[4] - p[0]], py = [p[1], p[3], p[5], p[3] + p[5] - p[1]];
    const x0 = Math.max(0, Math.min(...px)) * copy.width, y0 = Math.max(0, Math.min(...py)) * copy.height;
    const w = Math.max(1, (Math.min(1, Math.max(...px)) * copy.width) - x0);
    const h = Math.max(1, (Math.min(1, Math.max(...py)) * copy.height) - y0);
    const s = new OffscreenCanvas(48, 48).getContext("2d", { willReadFrequently: true });
    s.drawImage(copy, x0, y0, w, h, 0, 0, 48, 48);
    const d = s.getImageData(0, 0, 48, 48).data;
    let light = 0;
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (y > 0.85) light++;
      const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    const n = d.length / 4;
    const bigBins = [...bins.values()].filter(v => v / n > 0.005).length;
    m = light / n > 0.45 && bigBins < 24 ? 2 : 1;
    (R.classify ??= []).push({ pageNumber, light: +(light / n).toFixed(2), bigBins, mode: m });
  }
  classCache.set(key, m);
  return m;
}

function reprocessAll() {
  for (const o of originals.values()) {
    if (!o.canvas.isConnected) continue;
    const rects = buildRects(o.coords, o.canvas, o.isDetailView, o.pageNumber, o.copy);
    o.canvas.getContext("2d").drawImage(recolorer.process(o.copy, rects, { split: window.__split ?? 0 }), 0, 0);
  }
}

// Theme switch benchmark: returns ms until the visible pages show the new theme.
window.__switchTheme = async id => {
  theme = THEMES[id];
  document.documentElement.style.setProperty("--noct-bg", theme.bg);
  document.documentElement.style.setProperty("--noct-surround", theme.surround);
  const t0 = performance.now();
  remap = makeRemap({ bg: theme.bg, fg: theme.fg });
  if (mode === "shader") {
    const lut = buildLut(remap);
    const tLut = performance.now();
    recolorer.setLut(lut);
    reprocessAll();
    return { totalMs: performance.now() - t0, lutMs: tLut - t0 };
  }
  if (mode === "hook") {
    hookState.map = makeStyleMapper(remap);
    let last = performance.now();
    const onR = () => (last = performance.now());
    eventBus.on("pagerendered", onR);
    viewer.refresh();
    await new Promise(res => {
      const tick = () => (performance.now() - last > 400 ? res() : setTimeout(tick, 50));
      setTimeout(tick, 50);
    });
    eventBus.off("pagerendered", onR);
    return { totalMs: last - t0 };
  }
  return { totalMs: 0 };
};

// Peek: show originals while Alt is held.
window.__peek = on => {
  for (const o of originals.values()) {
    if (!o.canvas.isConnected) continue;
    const ctx = o.canvas.getContext("2d");
    if (on) ctx.drawImage(o.copy, 0, 0);
  }
  if (!on) reprocessAll();
};
addEventListener("keydown", e => e.key === "Alt" && (e.preventDefault(), window.__peek(true)));
addEventListener("keyup", e => e.key === "Alt" && window.__peek(false));

eventBus.on("pagesinit", () => (viewer.currentScaleValue = String(scale)));
const t0 = performance.now();
const doc = await pdfjsLib.getDocument({
  url: file,
  enableHWA: q.get("hwa") === "1",
  wasmUrl: "../node_modules/pdfjs-dist/wasm/",
  cMapUrl: "../node_modules/pdfjs-dist/cmaps/",
  standardFontDataUrl: "../node_modules/pdfjs-dist/standard_fonts/",
}).promise;
for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
  const tc = await (await doc.getPage(i)).getTextContent();
  textEmpty.set(i, tc.items.every(it => !it.str?.trim()));
}
R.numPages = doc.numPages;
R.loadMs = performance.now() - t0;
viewer.setDocument(doc);
linkService.setDocument(doc);
R.ready = true;

// Stage-by-stage benchmark on the first rendered page (warm, medians of 20).
window.__bench = () => {
  const o = [...originals.values()].find(x => !x.isDetailView && x.canvas.isConnected);
  const med = a => a.sort((x, y) => x - y)[a.length >> 1];
  const st = { copy: [], upload_draw: [], drawBack: [], total: [], classify: [] };
  const ctx = o.canvas.getContext("2d");
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const copy = new OffscreenCanvas(o.canvas.width, o.canvas.height);
    copy.getContext("2d").drawImage(o.canvas, 0, 0);
    const t1 = performance.now();
    classCache.clear();
    const rects = buildRects(o.coords, o.canvas, false, o.pageNumber, o.copy);
    const t2 = performance.now();
    const out = recolorer.process(o.copy, rects);
    recolorer.gl.finish();
    const t3 = performance.now();
    ctx.drawImage(out, 0, 0);
    ctx.getImageData(0, 0, 1, 1); // force the draw to complete
    const t4 = performance.now();
    st.copy.push(t1 - t0); st.classify.push(t2 - t1); st.upload_draw.push(t3 - t2); st.drawBack.push(t4 - t3); st.total.push(t4 - t0);
  }
  const lut = {};
  for (const n of [17, 25, 33]) {
    const t = performance.now();
    buildLut(remap, n);
    lut[n] = +(performance.now() - t).toFixed(1);
  }
  return { px: o.canvas.width * o.canvas.height, ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +med(v).toFixed(2)])), lutBuildMs: lut };
};
