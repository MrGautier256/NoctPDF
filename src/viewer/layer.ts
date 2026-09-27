// NoctPDF layer inside the PDF.js viewer page. Loaded by a synchronous
// <script> right after viewer.css (patches/pdfjs), so it runs before
// viewer.mjs: it can style the page before first paint, then wait for
// PDFViewerApplication. Phase 1 only wires things up; recoloring is phase 2.
import { browser, extUrl, storage } from "../platform";
import type { Message } from "../shared/messages";
import type { Settings } from "../settings/schema";
import { readSettings } from "../settings/storage";

interface PdfjsApp {
  initializedPromise: Promise<void>;
  eventBus: { on(name: string, fn: (e: Record<string, unknown>) => void): void };
  pdfViewer: { getPageView(i: number): { imageCoordinates?: ArrayLike<number> | null } | undefined };
  url: string;
}
declare global {
  interface Window {
    PDFViewerApplication?: PdfjsApp;
    PDFViewerApplicationOptions?: { get(name: string): unknown };
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

export function startViewerLayer(): void {
  // viewer.mjs rewrites the address right away: remember how we got here.
  const via = location.search.startsWith("?DNR:") ? "DNR redirect" : "viewer link (file://, embed, reload, popup)";
  document.documentElement.classList.add("noctpdf");
  injectStylesheet();
  // Last known theme, read synchronously to avoid a flash of default colors.
  try {
    const cached = localStorage.getItem(THEME_CACHE);
    if (cached) applyTheme(JSON.parse(cached) as CachedTheme);
  } catch {
    // Private mode or corrupted cache: the stylesheet defaults apply.
  }
  void readSettings(storage.sync()).then(({ settings }) => {
    const t = { bg: settings.theme.bg, fg: settings.theme.fg, surround: settings.theme.surround };
    applyTheme(t);
    try {
      localStorage.setItem(THEME_CACHE, JSON.stringify(t));
    } catch {
      // Not fatal.
    }
  });

  const diag: NonNullable<Window["__noctpdf"]> = {
    ready: false,
    pdfjsOptions: {},
    pagesRendered: 0,
    imageRects: {},
    documentUrl: null,
  };
  window.__noctpdf = diag;

  void whenApp().then(app => {
    const opts = window.PDFViewerApplicationOptions;
    for (const k of ["imagesRightClickMinSize", "viewerCssTheme", "enableDetailCanvas", "enableHWA"]) {
      diag.pdfjsOptions[k] = opts?.get(k);
    }
    app.eventBus.on("documentloaded", () => {
      diag.documentUrl = app.url;
      void browser.runtime.sendMessage({ type: "noct:viewerOpened", pdfUrl: app.url, via } satisfies Message);
    });
    app.eventBus.on("pagerendered", e => {
      if (e.isDetailView) return;
      diag.pagesRendered++;
      const view = app.pdfViewer.getPageView((e.pageNumber as number) - 1);
      const coords = view?.imageCoordinates;
      diag.imageRects[e.pageNumber as number] = coords ? coords.length / 6 : null;
    });
    diag.ready = true;
  });
}
