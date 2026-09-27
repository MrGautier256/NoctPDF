// Messages expected by the PDF.js viewer (chromecom.js) from its extension
// background, ported from mozilla/pdf.js extensions/chromium/pdfHandler.js
// (Apache License 2.0).
import { browser, isAllowedFileSchemeAccess, type Browser } from "../platform";
import { canRequestBody } from "./referer";

type Sender = Browser.runtime.MessageSender;
type ViewerRequest = { action?: unknown; data?: { newTab?: boolean } };

export const isViewerRequest = (m: unknown): m is ViewerRequest =>
  typeof m === "object" && m !== null && typeof (m as ViewerRequest).action === "string";

/** Returns true when the reply is sent asynchronously (sendResponse kept). */
export function handleViewerRequest(
  message: ViewerRequest,
  sender: Sender,
  sendResponse: (r: unknown) => void,
): boolean {
  switch (message.action) {
    case "getParentOrigin": {
      // Used to decide whether a local file may be shown in a frame. The tab
      // URL stands in for the parent frame URL (chrome-extension: frames are
      // not visible to webNavigation, crbug.com/326768).
      const parentUrl = sender.tab?.url;
      if (!parentUrl) sendResponse("");
      else if (parentUrl.startsWith("file:")) sendResponse("file://");
      else sendResponse(/^[^:]+:\/\/[^/]+/.exec(parentUrl)?.[0] ?? parentUrl);
      return false;
    }
    case "isAllowedFileSchemeAccess":
      void isAllowedFileSchemeAccess().then(sendResponse);
      return true;
    case "openExtensionsPageForFileAccess": {
      const url = `chrome://extensions/?id=${browser.runtime.id}`;
      const tab = sender.tab;
      if (!tab?.id) return false;
      if (message.data?.newTab) {
        void browser.tabs.create({ windowId: tab.windowId, index: tab.index + 1, url, openerTabId: tab.id });
      } else {
        void browser.tabs.update(tab.id, { url });
      }
      return false;
    }
    case "canRequestBody":
      sendResponse(sender.tab?.id !== undefined ? canRequestBody(sender.tab.id, sender.frameId ?? 0) : true);
      return false;
    default:
      return false;
  }
}
