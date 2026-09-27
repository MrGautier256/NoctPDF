// The only module that talks to the extension APIs directly. Keeping the
// surface small makes a later Firefox port a matter of adapting this file.
import { browser, type Browser } from "wxt/browser";
import type { DnrRule } from "../background/dnr-rules";
import type { Message, Replies } from "../shared/messages";
import type { KeyValueArea } from "../settings/storage";
import { VIEWER_PATH } from "../shared/viewer-url";

export { browser };
export type { Browser };

/** Absolute URL of a file packaged with the extension. */
export const extUrl = (path: string): string =>
  (browser.runtime.getURL as (p: string) => string)(path.startsWith("/") ? path : `/${path}`);

export const viewerUrl = (): string => extUrl(VIEWER_PATH);
/** Viewer URL for a PDF, with its fragment (#page=3) passed to the viewer. */
export function viewerUrlFor(pdfUrl: string): string {
  const i = pdfUrl.indexOf("#");
  const [url, hash] = i > 0 ? [pdfUrl.slice(0, i), pdfUrl.slice(i)] : [pdfUrl, ""];
  return `${viewerUrl()}?file=${encodeURIComponent(url)}${hash}`;
}

function area(a: Browser.storage.StorageArea): KeyValueArea {
  return {
    get: keys => a.get(keys),
    set: items => a.set(items),
    remove: keys => a.remove(keys),
  };
}

export const storage = {
  sync: (): KeyValueArea => {
    // storage.sync is missing at runtime in some Chromium derivatives (pdf.js
    // notes it for Opera), which the typings cannot express.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return area(browser.storage.sync ?? browser.storage.local);
  },
  local: (): KeyValueArea => area(browser.storage.local),
  session: (): KeyValueArea => area(browser.storage.session),
  onChanged: browser.storage.onChanged,
};

export const dnr = {
  async replaceDynamicRules(rules: DnrRule[]): Promise<void> {
    const old = await browser.declarativeNetRequest.getDynamicRules();
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: old.map(r => r.id),
      addRules: rules,
    });
  },
  getDynamicRules: () => browser.declarativeNetRequest.getDynamicRules(),
  getSessionRules: () => browser.declarativeNetRequest.getSessionRules(),
  updateSessionRules: (opts: { addRules?: DnrRule[]; removeRuleIds?: number[] }) =>
    browser.declarativeNetRequest.updateSessionRules(opts),

  /**
   * Chrome 123-127 accept the responseHeaders condition but ignore it, which
   * would redirect every request. Detection trick from pdf.js
   * (w3c/webextensions#638): an invalid empty list must be rejected.
   */
  async isResponseHeadersConditionSupported(): Promise<boolean> {
    const existing = await browser.declarativeNetRequest.getSessionRules();
    const id = Math.max(0, ...existing.map(r => r.id)) + 1;
    const probe = (responseHeaders: unknown[]) => ({
      id,
      condition: { responseHeaders, urlFilter: "|does_not_match_anything" },
      action: { type: "block" },
    });
    try {
      await dnr.updateSessionRules({ addRules: [probe([{ header: "x-probe" }]) as unknown as DnrRule] });
    } catch {
      return false;
    }
    try {
      await dnr.updateSessionRules({ removeRuleIds: [id], addRules: [probe([]) as unknown as DnrRule] });
      return false; // validation skipped: the feature is disabled
    } catch {
      return true;
    } finally {
      await dnr.updateSessionRules({ removeRuleIds: [id] });
    }
  },
};

export const isAllowedFileSchemeAccess = (): Promise<boolean> => browser.extension.isAllowedFileSchemeAccess();

/** Typed message to the service worker. */
export const send = <M extends Message>(message: M): Promise<Replies[M["type"]]> =>
  browser.runtime.sendMessage<M, Replies[M["type"]]>(message);
