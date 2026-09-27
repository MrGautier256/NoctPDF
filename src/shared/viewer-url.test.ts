import { describe, expect, it } from "vitest";
import { pdfUrlFromViewerUrl, routeReadableUrl } from "./viewer-url";

const EXT = "chrome-extension://abc/";
const VIEWER = `${EXT}content/web/viewer.html`;

describe("pdfUrlFromViewerUrl", () => {
  it("reads the raw DNR form, fragment included", () => {
    expect(pdfUrlFromViewerUrl(`${VIEWER}?DNR:https://arxiv.org/pdf/1706.03762?v=7#page=2`, EXT)).toBe(
      "https://arxiv.org/pdf/1706.03762?v=7#page=2",
    );
  });

  it("decodes the file= form and keeps the viewer fragment", () => {
    const pdf = "file:///C:/Docs/r%C3%A9sum%C3%A9.pdf";
    expect(pdfUrlFromViewerUrl(`${VIEWER}?file=${encodeURIComponent(pdf)}#page=4`, EXT)).toBe(`${pdf}#page=4`);
  });

  it("reads the readable form the viewer switches to", () => {
    expect(pdfUrlFromViewerUrl(`${EXT}https://a.org/x.pdf?q=1#page=3`, EXT)).toBe("https://a.org/x.pdf?q=1#page=3");
    expect(pdfUrlFromViewerUrl(`${EXT}file:///C:/x.pdf`, EXT)).toBe("file:///C:/x.pdf");
  });

  it("returns null for anything else", () => {
    expect(pdfUrlFromViewerUrl("https://example.com/x.pdf", EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl(VIEWER, EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl(`${VIEWER}?DNR:`, EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl(`${VIEWER}?page=2`, EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl(`${EXT}options.html`, EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl(`${EXT}javascript:alert(1)`, EXT)).toBeNull();
    expect(pdfUrlFromViewerUrl("chrome-extension://other/https://a.org/x.pdf", EXT)).toBeNull();
  });
});

describe("routeReadableUrl", () => {
  it("routes the readable form to the viewer, fragment kept", () => {
    expect(routeReadableUrl(`${EXT}https://a.org/x.pdf?q=1&r=2#page=3`, EXT)).toBe(
      `${VIEWER}?file=${encodeURIComponent("https://a.org/x.pdf?q=1&r=2")}#page=3`,
    );
  });

  it("does not encode twice", () => {
    const encoded = encodeURIComponent("https://a.org/x.pdf");
    expect(routeReadableUrl(`${EXT}${encoded}`, EXT)).toBe(`${VIEWER}?file=${encoded}`);
  });

  it("ignores our own pages and other schemes", () => {
    expect(routeReadableUrl(`${EXT}popup.html`, EXT)).toBeNull();
    expect(routeReadableUrl(`${VIEWER}?file=x`, EXT)).toBeNull();
    expect(routeReadableUrl(`${EXT}javascript:alert(1)`, EXT)).toBeNull();
  });

  it("round-trips with pdfUrlFromViewerUrl", () => {
    const pdf = "https://a.org/dir/x.pdf?q=a%20b#page=2";
    expect(pdfUrlFromViewerUrl(routeReadableUrl(`${EXT}${pdf}`, EXT)!, EXT)).toBe(pdf);
  });
});
