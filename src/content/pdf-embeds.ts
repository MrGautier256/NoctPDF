// Shows our viewer for PDFs that the DNR rules cannot catch:
// - <embed>/<object> PDFs placed by web pages (the request type is "object");
// - PDF documents that were not redirected (type sniffed, unusual headers).
// Ported from mozilla/pdf.js extensions/chromium/contentscript.js
// (Apache License 2.0).
import { send, storage, viewerUrl } from "../platform";
import { readSettings } from "../settings/storage";

export const DETECTION_ANIMATION = "noctpdf-detected-object-or-embed";

function viewerUrlForEmbed(path: string): string {
  const [, rawPath = "", fragment = ""] = /^([^#]*)(#.*)?$/.exec(path) ?? [];
  const absolute = new URL(rawPath, document.baseURI).href;
  return `${viewerUrl()}?file=${encodeURIComponent(absolute)}${fragment}`;
}

let embedsAllowed: Promise<boolean> | null = null;
function areEmbedsAllowed(): Promise<boolean> {
  embedsAllowed ??= readSettings(storage.sync()).then(
    ({ settings: s }) => s.enabled && s.engine === "enhanced" && s.interception.embeddedPdfs,
  );
  return embedsAllowed;
}

const seen = new WeakSet<Element>();

function watchObjectOrEmbed(elem: HTMLObjectElement | HTMLEmbedElement): void {
  const mimeType = elem.type;
  if (mimeType && mimeType.toLowerCase() !== "application/pdf") return;
  const srcAttribute = elem instanceof HTMLEmbedElement ? "src" : "data";
  const path = elem instanceof HTMLEmbedElement ? elem.src : elem.data;
  if (!mimeType && !/\.pdf(?:$|[?#])/i.test(path)) return;
  // Chrome's own embed inside a PDF document: not ours to touch.
  if (
    elem instanceof HTMLEmbedElement &&
    (elem.src === "about:blank" || (elem.getAttribute("name") === "plugin" && elem.src === location.href))
  )
    return;
  if (seen.has(elem)) return;
  seen.add(elem);

  const srcOf = () => (elem instanceof HTMLEmbedElement ? elem.src : elem.data);
  let lastSrc: string | undefined;
  let updating = false;
  const update = () => {
    if (updating || srcOf() === lastSrc) return;
    updating = true;
    try {
      if (elem instanceof HTMLEmbedElement) updateEmbed(elem);
      else updateObject(elem);
      // Our own change of src/data must not trigger another update.
      lastSrc = srcOf();
    } finally {
      updating = false;
    }
  };
  void areEmbedsAllowed().then(allowed => {
    if (!allowed) return;
    update();
    // Pages may change src/data later.
    new MutationObserver(update).observe(elem, { attributes: true, attributeFilter: [srcAttribute] });
  });
}

function updateEmbed(elem: HTMLEmbedElement): void {
  if (elem.type === "text/html" && elem.src.startsWith(viewerUrl())) return;
  // An <embed> only picks up a new src when re-inserted.
  const parent = elem.parentNode;
  const next = elem.nextSibling;
  elem.remove();
  elem.type = "text/html";
  elem.src = viewerUrlForEmbed(elem.src);
  parent?.insertBefore(elem, next);
}

function updateObject(elem: HTMLObjectElement): void {
  // Forcing the fallback content of <object> is the only reliable way to swap
  // its content (see the pdf.js original for the gory details).
  let iframe = elem.firstElementChild;
  if (!(iframe instanceof HTMLIFrameElement) || !iframe.dataset.noctpdf) {
    iframe = fullSizeIframe();
    elem.textContent = "";
    elem.append(iframe);
  }
  (iframe as HTMLIFrameElement).src = viewerUrlForEmbed(elem.data);
  elem.type = "application/x-noctpdf-not-a-pdf";
  // Setting data again, even to the same value, reloads the fallback content.
  const data = elem.data;
  elem.data = data;
  elem.style.padding = "0";
  elem.style.display = "inline-block";
}

function fullSizeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.dataset.noctpdf = "1";
  Object.assign(iframe.style, {
    background: "none",
    border: "none",
    borderRadius: "0",
    boxShadow: "none",
    cssFloat: "none",
    display: "block",
    width: "100%",
    height: "100%",
    margin: "0",
    maxWidth: "none",
    maxHeight: "none",
    position: "static",
    transform: "none",
    visibility: "visible",
  });
  return iframe;
}

/** Replaces the native viewer of this document with ours. */
function takeOverPdfDocument(): void {
  const iframe = fullSizeIframe();
  Object.assign(iframe.style, { position: "absolute", inset: "0" });
  iframe.src = viewerUrlForEmbed(document.URL);
  try {
    // Same approach as pdf.js: navigating the document itself crashed
    // Chrome before 129.
    document.body.attachShadow({ mode: "closed" }).append(iframe);
  } catch {
    // Chrome may already host its own shadow tree on <body>: swap the body.
    const body = document.createElement("body");
    body.style.margin = "0";
    body.append(iframe);
    document.body.replaceWith(body);
  }
}

export function startPdfEmbedWatcher(): void {
  document.addEventListener(
    "animationstart",
    e => {
      if (e.animationName !== DETECTION_ANIMATION) return;
      const t = e.target;
      if (t instanceof HTMLEmbedElement || t instanceof HTMLObjectElement) watchObjectOrEmbed(t);
    },
    true,
  );

  if (document.contentType === "application/pdf") {
    void send({ type: "noct:shouldTakeOverPdfDocument" }).then(takeOver => {
      if (takeOver) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", takeOverPdfDocument, { once: true });
        } else {
          takeOverPdfDocument();
        }
      } else if (window === top) {
        void send({ type: "noct:nativePdfShown" });
      }
    });
  }
}
