// Right-click menu on PDF links: open them in the chosen engine directly,
// without first navigating and then switching from the popup.
import { browser, viewerUrlFor } from "../platform";
import { openNative } from "./native-viewer";

const ENHANCED_ID = "noct-open-link-enhanced";
const NATIVE_ID = "noct-open-link-native";
const PDF_LINK_PATTERNS = ["*://*/*.pdf*", "*://*/*.PDF*", "file://*/*.pdf*", "file://*/*.PDF*"];

export function registerContextMenu(): void {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: ENHANCED_ID,
        title: browser.i18n.getMessage("openEnhanced"),
        contexts: ["link"],
        targetUrlPatterns: PDF_LINK_PATTERNS,
      });
      browser.contextMenus.create({
        id: NATIVE_ID,
        title: browser.i18n.getMessage("openNative"),
        contexts: ["link"],
        targetUrlPatterns: PDF_LINK_PATTERNS,
      });
    });
  });

  browser.contextMenus.onClicked.addListener(info => {
    if (!info.linkUrl) return;
    if (info.menuItemId === ENHANCED_ID) {
      void browser.tabs.create({ url: viewerUrlFor(info.linkUrl) });
    } else if (info.menuItemId === NATIVE_ID) {
      void browser.tabs.create({ url: "about:blank" }).then(tab => {
        if (tab.id !== undefined) void openNative(tab.id, info.linkUrl!);
      });
    }
  });
}
