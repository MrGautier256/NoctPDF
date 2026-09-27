// The viewer rewrites its address to `<ext>/<pdf url>`; on reload or when
// opened from history, the service worker sends that document request back to
// viewer.html. Ported from mozilla/pdf.js extensions/chromium/extension-router.js
// (Apache License 2.0).
import { browser, extUrl } from "../platform";
import { routeReadableUrl } from "../shared/viewer-url";

interface FetchEventLike extends Event {
  request: Request;
  respondWith(r: Response | Promise<Response>): void;
}

export function registerReadableUrlRouter(): void {
  const extBase = extUrl("/");
  self.addEventListener("fetch", event => {
    const e = event as FetchEventLike;
    if (e.request.destination !== "document") return;
    const target = routeReadableUrl(e.request.url, extBase);
    if (target) e.respondWith(Response.redirect(target));
  });

  // A hard reload (Ctrl+F5) bypasses the service worker and fails: catch the
  // error and navigate to the viewer.
  browser.webNavigation.onErrorOccurred.addListener(
    d => {
      if (d.frameId !== 0) return;
      const target = routeReadableUrl(d.url, extBase);
      if (target) void browser.tabs.update(d.tabId, { url: target });
    },
    { url: [{ urlPrefix: extBase }] },
  );
}
