// NoctPDF layer inside the PDF.js viewer page. Loaded by a synchronous
// <script> right after viewer.css (patches/pdfjs), so it runs before
// viewer.mjs: it can style the page before first paint, then wait for
// PDFViewerApplication.
import { browser, extUrl, storage } from "../platform";
import type { Message } from "../shared/messages";
import type { Settings } from "../settings/schema";
import { isSettingsChange, readSettings } from "../settings/storage";
import {
  RecolorController,
  type PageRenderedEvent,
  type PdfPageViewLike,
  type RecolorTheme,
} from "./engine/recolor-controller";

interface PdfjsApp {
  initializedPromise: Promise<void>;
  eventBus: { on(name: string, fn: (e: Record<string, unknown>) => void): void };
  pdfViewer: { getPageView(i: number): PdfPageViewLike | undefined };
  url: string;
}
declare global {
  interface Window {
    PDFViewerApplication?: PdfjsApp;
    PDFViewerApplicationOptions?: { get(name: string): unknown; set(name: string, value: unknown): void };
    /** Read by the e2e tests and the diagnostics page. */
    __noctpdf?: {
      ready: boolean;
      pdfjsOptions: Record<string, unknown>;
      pagesRendered: number;
      /** Image rectangles recorded by PDF.js per page (null: tracker off). */
      imageRects: Record<number, number | null>;
      documentUrl: string | null;
    };
  }
}

const THEME_CACHE = "noctpdf.viewerTheme";
type CachedTheme = Pick<Settings["theme"], "bg" | "fg" | "surround">;

function applyTheme(t: CachedTheme): void {
  const s = document.documentElement.style;
  s.setProperty("--noct-bg", t.bg);
  s.setProperty("--noct-fg", t.fg);
  s.setProperty("--noct-surround", t.surround);
}

function injectStylesheet(): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = extUrl("/noct/viewer.css");
  // A script-inserted stylesheet does not block rendering unless asked to.
  link.setAttribute("blocking", "render");
  document.head.append(link);
}

async function whenApp(): Promise<PdfjsApp> {
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }
  const app = window.PDFViewerApplication;
  if (!app) throw new Error("PDFViewerApplication missing");
  await app.initializedPromise;
  return app;
}

/**
 * Turns on PDF.js' CanvasImagesTracker without its right-click image-saving
 * UI (which inserts canvases into the text layer and degrades text selection
 * in Chrome, phase 0 §2): a value this large means the comparison
 * `size < imagesRightClickMinSize` that gates the UI is never true, while the
 * tracker itself (gated by `!== -1`) stays on. Called as early and as often
 * as the option object's availability allows; setting it twice is harmless.
 */
function enableImageTrackerOnly(): void {
  window.PDFViewerApplicationOptions?.set("imagesRightClickMinSize", 999999999);
}

/** tuning.saturation drives the remap's own chroma scaling (pre-LUT, phase 0's design); the
 *  post-process Tuning.saturation stays neutral so the knob is not applied twice. */
function themeFrom(settings: Settings): RecolorTheme {
  return {
    bg: settings.theme.bg,
    fg: settings.theme.fg,
    chroma: settings.tuning.saturation,
    minContrast: settings.tuning.minTextContrast,
    tuning: {
      brightness: settings.tuning.brightness,
      contrast: settings.tuning.contrast,
      gamma: settings.tuning.gamma,
      saturation: 1,
      warmth: settings.tuning.warmth,
    },
  };
}

export function startViewerLayer(): void {
  // viewer.mjs rewrites the address right away: remember how we got here.
  const via = location.search.startsWith("?DNR:") ? "DNR redirect" : "viewer link (file://, embed, reload, popup)";
  document.documentElement.classList.add("noctpdf");
  injectStylesheet();
  enableImageTrackerOnly();
  // Last known theme, read synchronously to avoid a flash of default colors.
  try {
    const cached = localStorage.getItem(THEME_CACHE);
    if (cached) applyTheme(JSON.parse(cached) as CachedTheme);
  } catch {
    // Private mode or corrupted cache: the stylesheet defaults apply.
  }

  const diag: NonNullable<Window["__noctpdf"]> = {
    ready: false,
    pdfjsOptions: {},
    pagesRendered: 0,
    imageRects: {},
    documentUrl: null,
  };
  window.__noctpdf = diag;

  void readSettings(storage.sync()).then(async ({ settings }) => {
    const t = { bg: settings.theme.bg, fg: settings.theme.fg, surround: settings.theme.surround };
    applyTheme(t);
    try {
      localStorage.setItem(THEME_CACHE, JSON.stringify(t));
    } catch {
      // Not fatal.
    }

    const controller = new RecolorController(themeFrom(settings), settings.images);
    let current = settings;

    const app = await whenApp();
    enableImageTrackerOnly();

    const opts = window.PDFViewerApplicationOptions;
    for (const k of ["imagesRightClickMinSize", "viewerCssTheme", "enableDetailCanvas", "enableHWA"]) {
      diag.pdfjsOptions[k] = opts?.get(k);
    }
    app.eventBus.on("documentloaded", () => {
      diag.documentUrl = app.url;
      void browser.runtime.sendMessage({ type: "noct:viewerOpened", pdfUrl: app.url, via } satisfies Message);
    });
    app.eventBus.on("pagerendered", e => {
      const evt = e as unknown as PageRenderedEvent;
      controller.onPageRendered(evt);
      if (evt.isDetailView) return;
      diag.pagesRendered++;
      const view: PdfPageViewLike | undefined = app.pdfViewer.getPageView(evt.pageNumber - 1);
      const coords = view?.imageCoordinates;
      diag.imageRects[evt.pageNumber] = coords ? coords.length / 6 : null;
    });
    diag.ready = true;

    storage.onChanged.addListener(changes => {
      if (!isSettingsChange(Object.keys(changes))) return;
      void readSettings(storage.sync()).then(({ settings: next }) => {
        const themeChanged =
          next.theme.bg !== current.theme.bg ||
          next.theme.fg !== current.theme.fg ||
          JSON.stringify(next.tuning) !== JSON.stringify(current.tuning);
        const imagesChanged = JSON.stringify(next.images) !== JSON.stringify(current.images);
        current = next;
        if (themeChanged) controller.setTheme(themeFrom(next));
        if (imagesChanged) controller.setImagesSettings(next.images);
      });
    });

    const matchesPeekKey = (e: KeyboardEvent) => current.peekKey !== "none" && e.key === current.peekKey;
    addEventListener("keydown", e => {
      if (matchesPeekKey(e) && !e.repeat) controller.setPeeking(true);
    });
    addEventListener("keyup", e => {
      if (matchesPeekKey(e)) controller.setPeeking(false);
    });
    addEventListener("blur", () => controller.setPeeking(false));

    addEventListener("beforeprint", () => {
      if (!current.print.useTheme) controller.setPrintingOriginal(true);
    });
    addEventListener("afterprint", () => controller.setPrintingOriginal(false));
  });
}
