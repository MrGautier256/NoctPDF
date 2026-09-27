// Messages between our pages/content scripts and the service worker.
// The PDF.js viewer uses its own protocol (`{ action }`), see viewer-bridge.ts.

export interface TabState {
  /** The tab shows our viewer; `pdfUrl` is the original document. */
  inViewer: boolean;
  /** The tab shows a PDF in the browser's native viewer. */
  inNativeViewer: boolean;
  pdfUrl: string | null;
}

export interface Diagnostics {
  extensionVersion: string;
  userAgent: string;
  responseHeadersCondition: boolean;
  fileSchemeAccess: boolean;
  dynamicRuleCount: number;
  sessionRuleCount: number;
  pdfjs: { tag: string; version: string; commit: string } | null;
  lastInterception: { url: string; reason: string; at: number } | null;
}

export type Message =
  | { type: "noct:getTabState"; tabId: number }
  | { type: "noct:openNative"; tabId: number; url: string }
  | { type: "noct:openEnhanced"; tabId: number; url: string }
  /** Content script: the top frame is a PDF shown by the native viewer. */
  | { type: "noct:nativePdfShown" }
  /** Content script: a PDF document was not redirected (sniffed type...). Open our viewer? */
  | { type: "noct:shouldTakeOverPdfDocument" }
  /** Viewer layer: a PDF was opened, and how it reached the viewer. */
  | { type: "noct:viewerOpened"; pdfUrl: string; via: string }
  | { type: "noct:getDiagnostics" };

export interface Replies {
  "noct:getTabState": TabState;
  "noct:openNative": true;
  "noct:openEnhanced": true;
  "noct:nativePdfShown": true;
  "noct:shouldTakeOverPdfDocument": boolean;
  "noct:viewerOpened": true;
  "noct:getDiagnostics": Diagnostics;
}

export const isMessage = (m: unknown): m is Message =>
  typeof m === "object" &&
  m !== null &&
  typeof (m as { type?: unknown }).type === "string" &&
  (m as { type: string }).type.startsWith("noct:");
