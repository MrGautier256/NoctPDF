import { browser, dnr, extUrl, isAllowedFileSchemeAccess, storage, viewerUrl, type Browser } from "../platform";
import { isMessage, type Diagnostics, type Message, type Replies, type TabState } from "../shared/messages";
import { pdfUrlFromViewerUrl } from "../shared/viewer-url";
import type { Settings } from "../settings/schema";
import { buildInterceptionRules } from "./dnr-rules";
import { registerFileSchemeListener } from "./file-scheme";
import { registerReadableUrlRouter } from "./router";
import {
  clearNativeShown,
  forgetTab,
  isNativeRequested,
  markNativeShown,
  nativeShownUrl,
  openEnhanced,
  openNative,
} from "./native-viewer";
import { syncPdfjsPreferences } from "./pdfjs-prefs";
import { canRequestBody, registerRefererListeners } from "./referer";
import { getSettings, onSettingsChanged } from "./settings-state";
import { handleViewerRequest, isViewerRequest } from "./viewer-bridge";

const LAST_INTERCEPTION = "noct.lastInterception";

async function applySettings(settings: Settings): Promise<void> {
  const supported = await dnr.isResponseHeadersConditionSupported();
  // Chrome 128+ is required (manifest). If the condition is still unsupported
  // (a derivative with the feature disabled), registering the rules would
  // redirect every page: register nothing and report it in the diagnostics.
  await dnr.replaceDynamicRules(supported ? buildInterceptionRules(settings, viewerUrl()) : []);
  await syncPdfjsPreferences(settings);
}

async function tabState(tabId: number): Promise<TabState> {
  const tab = await browser.tabs.get(tabId);
  const pdfUrl = tab.url ? pdfUrlFromViewerUrl(tab.url, extUrl("/")) : null;
  if (pdfUrl) return { inViewer: true, inNativeViewer: false, pdfUrl };
  const native = await nativeShownUrl(tabId);
  return { inViewer: false, inNativeViewer: native !== null, pdfUrl: native };
}

async function diagnostics(): Promise<Diagnostics> {
  let pdfjs: Diagnostics["pdfjs"] = null;
  try {
    pdfjs = (await (await fetch(extUrl("/pdfjs-version.json"))).json()) as Diagnostics["pdfjs"];
  } catch {
    // The build copies vendor/pdfjs/VERSION.json; absent in unit tests.
  }
  return {
    extensionVersion: browser.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    responseHeadersCondition: await dnr.isResponseHeadersConditionSupported(),
    fileSchemeAccess: await isAllowedFileSchemeAccess(),
    dynamicRuleCount: (await dnr.getDynamicRules()).length,
    sessionRuleCount: (await dnr.getSessionRules()).length,
    pdfjs,
    lastInterception:
      ((await storage.session().get([LAST_INTERCEPTION]))[LAST_INTERCEPTION] as Diagnostics["lastInterception"]) ??
      null,
  };
}

async function handle(message: Message, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "noct:getTabState":
      return tabState(message.tabId);
    case "noct:openNative":
      await openNative(message.tabId, message.url);
      return true satisfies Replies["noct:openNative"];
    case "noct:openEnhanced":
      await openEnhanced(message.tabId, message.url);
      return true satisfies Replies["noct:openEnhanced"];
    case "noct:nativePdfShown":
      if (sender.tab?.id !== undefined && sender.frameId === 0 && sender.url)
        await markNativeShown(sender.tab.id, sender.url);
      return true;
    case "noct:shouldTakeOverPdfDocument": {
      const tabId = sender.tab?.id;
      const url = sender.url; // the frame's document, not the tab
      if (tabId === undefined || !url) return false;
      const s = await getSettings();
      const scheme = url.startsWith("file:") ? s.interception.localFiles : s.interception.httpPdfs;
      if (!s.enabled || s.engine !== "enhanced" || !scheme) return false;
      if (sender.frameId && !s.interception.embeddedPdfs) return false;
      if (!canRequestBody(tabId, sender.frameId ?? 0)) return false;
      if (!sender.frameId && (await isNativeRequested(tabId, url))) return false;
      await storage.session().set({
        [LAST_INTERCEPTION]: {
          url,
          reason: "PDF document not redirected by DNR (sniffed or unusual headers)",
          at: Date.now(),
        },
      });
      return true;
    }
    case "noct:viewerOpened": {
      await storage
        .session()
        .set({ [LAST_INTERCEPTION]: { url: message.pdfUrl, reason: message.via, at: Date.now() } });
      return true;
    }
    case "noct:getDiagnostics":
      return diagnostics();
  }
}

export function startBackground(): void {
  // MV3: every listener is registered synchronously, before any await.
  registerReadableUrlRouter();
  registerRefererListeners();
  registerFileSchemeListener();
  onSettingsChanged(s => void applySettings(s));

  browser.runtime.onInstalled.addListener(() => void getSettings().then(applySettings));
  browser.runtime.onStartup.addListener(() => void getSettings().then(applySettings));

  browser.tabs.onRemoved.addListener(tabId => void forgetTab(tabId));
  browser.webNavigation.onCommitted.addListener(d => {
    if (d.frameId === 0) void clearNativeShown(d.tabId);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (isViewerRequest(message)) return handleViewerRequest(message, sender, sendResponse);
    if (!isMessage(message)) return false;
    handle(message, sender).then(sendResponse, (e: unknown) => {
      console.error("NoctPDF:", message.type, e);
      sendResponse(undefined);
    });
    return true;
  });
}
