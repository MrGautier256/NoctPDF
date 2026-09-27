// Local PDFs. With "Allow access to file URLs" on, the DNR file:// rule
// redirects them. Without it, DNR never sees the request, but webNavigation
// does: we then open the viewer, which explains how to grant the access.
import { browser, isAllowedFileSchemeAccess, viewerUrlFor } from "../platform";
import { isNativeRequested } from "./native-viewer";
import { getSettings } from "./settings-state";

export function registerFileSchemeListener(): void {
  browser.webNavigation.onBeforeNavigate.addListener(
    details => {
      if (details.frameId !== 0) return;
      void (async () => {
        const s = await getSettings();
        if (!s.enabled || s.engine !== "enhanced" || !s.interception.localFiles) return;
        if (await isAllowedFileSchemeAccess()) return; // handled by DNR
        if (await isNativeRequested(details.tabId, details.url)) return;
        await browser.tabs.update(details.tabId, { url: viewerUrlFor(details.url) });
      })();
    },
    {
      url: [
        { urlPrefix: "file://", pathSuffix: ".pdf" },
        { urlPrefix: "file://", pathSuffix: ".PDF" },
      ],
    },
  );
}
