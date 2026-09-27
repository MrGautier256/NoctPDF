// URLs of the viewer. The PDF.js chromium viewer is reached as
//   <ext>/content/web/viewer.html?DNR:<raw url>     (DNR redirect, not encoded)
//   <ext>/content/web/viewer.html?file=<encoded url> (file://, embeds, our links)
// and, as soon as it loads, rewrites its address to the readable form
//   <ext>/<raw url>#<hash>
// which the service worker routes back to viewer.html on reload.

export const VIEWER_PATH = "content/web/viewer.html";

/** Schemes the viewer may open through the readable form (a subset of pdf.js'). */
const ROUTED_SCHEMES = ["http", "https", "file"];

/**
 * Original PDF URL behind a viewer URL (any of the three forms), or null.
 * `extBase` is the extension origin with a trailing slash.
 */
export function pdfUrlFromViewerUrl(url: string, extBase: string): string | null {
  if (!url.startsWith(extBase)) return null;
  const viewer = extBase + VIEWER_PATH;
  if (url.startsWith(`${viewer}?`)) {
    const query = url.slice(viewer.length + 1);
    // Everything after "DNR:" is the original URL, fragment included.
    if (query.startsWith("DNR:")) return query.slice(4) || null;
    const hashAt = query.indexOf("#");
    const search = hashAt === -1 ? query : query.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : query.slice(hashAt);
    const file = new URLSearchParams(search).get("file");
    return file ? file + hash : null;
  }
  const rest = url.slice(extBase.length);
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(rest)?.[1]?.toLowerCase();
  return scheme && ROUTED_SCHEMES.includes(scheme) ? rest : null;
}

/**
 * Viewer URL for a readable-form request (`<ext>/https://...`), or null.
 * Ported from mozilla/pdf.js extensions/chromium/extension-router.js
 * (Apache License 2.0).
 */
export function routeReadableUrl(url: string, extBase: string): string | null {
  if (!url.startsWith(extBase)) return null;
  let rest = url.slice(extBase.length);
  const schemeAt = rest.search(/:|%3A/i);
  if (schemeAt === -1) return null;
  if (!ROUTED_SCHEMES.includes(rest.slice(0, schemeAt).toLowerCase())) return null;
  const hashAt = url.indexOf("#");
  const hash = hashAt > 0 ? url.slice(hashAt) : "";
  rest = rest.split("#", 1)[0]!;
  // Already percent-encoded when the colon is.
  const file = rest.charAt(schemeAt) === ":" ? encodeURIComponent(rest) : rest;
  return `${extBase}${VIEWER_PATH}?file=${file}${hash}`;
}
