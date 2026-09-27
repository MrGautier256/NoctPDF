// Keeps the Referer of the original PDF request when the viewer refetches the
// file: some servers refuse hotlinked PDFs. Ported from mozilla/pdf.js
// extensions/chromium/preserve-referer.js (Apache License 2.0). The viewer
// side lives in PDF.js' chromecom.js and talks over the "chromecom-referrer" port.
import { browser, dnr } from "../platform";

// referrers[tabId][frameId] = Referer of the PDF frame; kept 5 minutes at most.
const referrers = new Map<number, Map<number, string | undefined>>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
// Frames loaded through a POST: the viewer could not reproduce the request.
const postFrames = new Map<number, Set<number>>();
const KEEP_MS = 5 * 60_000;

function forgetEventually(tabId: number) {
  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(() => {
      referrers.delete(tabId);
      timers.delete(tabId);
      postFrames.delete(tabId);
    }, KEEP_MS),
  );
}

/** False when the frame is known to come from a POST form submission. */
export const canRequestBody = (tabId: number, frameId: number) => !postFrames.get(tabId)?.has(frameId);

export function registerRefererListeners(): void {
  browser.webRequest.onSendHeaders.addListener(
    ({ tabId, frameId, requestHeaders, method }) => {
      if (!referrers.has(tabId)) referrers.set(tabId, new Map());
      referrers.get(tabId)!.set(frameId, requestHeaders?.find(h => /^referer$/i.test(h.name))?.value);
      if (method !== "GET") {
        if (!postFrames.has(tabId)) postFrames.set(tabId, new Set());
        postFrames.get(tabId)!.add(frameId);
      } else {
        postFrames.get(tabId)?.delete(frameId);
      }
      forgetEventually(tabId);
    },
    { urls: ["*://*/*"], types: ["main_frame", "sub_frame"] },
    ["requestHeaders", "extraHeaders"],
  );

  browser.runtime.onConnect.addListener(port => {
    if (port.name !== "chromecom-referrer" || !port.sender?.tab?.id) return;
    const tabId = port.sender.tab.id;
    const frameId = port.sender.frameId ?? 0;
    let ruleId: number | undefined;
    let referer = referrers.get(tabId)?.get(frameId) ?? "";

    port.onMessage.addListener((data: { referer?: string; dnrRequestId: number; requestUrl: string }) => {
      // Opened directly (history, reload): the viewer remembers the referer.
      if (data.referer) referer = data.referer;
      ruleId = data.dnrRequestId;
      const done = () => port.postMessage(referer);
      if (!referer) {
        void dnr.updateSessionRules({ removeRuleIds: [ruleId] }).then(done);
        return;
      }
      void dnr
        .updateSessionRules({
          removeRuleIds: [ruleId],
          addRules: [
            {
              id: ruleId,
              priority: 1,
              condition: {
                urlFilter: `|${data.requestUrl}|`,
                // Only the viewer's own fetch, in this tab.
                initiatorDomains: [browser.runtime.id],
                resourceTypes: ["xmlhttprequest"],
                tabIds: [tabId],
              },
              action: {
                type: "modifyHeaders",
                requestHeaders: [{ operation: "set", header: "referer", value: referer }],
              },
            } as never,
          ],
        })
        .then(done);
    });
    port.onDisconnect.addListener(() => {
      if (ruleId !== undefined) void dnr.updateSessionRules({ removeRuleIds: [ruleId] });
    });
  });
}
