// Per-tab choice between our viewer and the browser's own PDF viewer.
import { browser, dnr, storage, viewerUrlFor } from "../platform";
import { nativeAllowRule } from "./dnr-rules";

/** tabId -> URL the user asked to see natively (session rule id = tabId). */
const NATIVE_REQUESTS = "noct.nativeRequests";
/** tabId -> URL of a PDF currently shown by the native viewer. */
const NATIVE_SHOWN = "noct.nativeShown";

type TabMap = Record<string, string>;
const without = (m: TabMap, tabId: number): TabMap =>
  Object.fromEntries(Object.entries(m).filter(([k]) => k !== String(tabId)));

async function readMap(key: string): Promise<TabMap> {
  return ((await storage.session().get([key]))[key] as TabMap | undefined) ?? {};
}
async function updateMap(key: string, fn: (m: TabMap) => TabMap): Promise<void> {
  await storage.session().set({ [key]: fn(await readMap(key)) });
}

export async function openNative(tabId: number, url: string): Promise<void> {
  const target = url.split("#")[0]!;
  await dnr.updateSessionRules({ removeRuleIds: [tabId], addRules: [nativeAllowRule(tabId, tabId, target)] });
  await updateMap(NATIVE_REQUESTS, m => ({ ...m, [tabId]: target }));
  await browser.tabs.update(tabId, { url });
}

export async function openEnhanced(tabId: number, url: string): Promise<void> {
  await dnr.updateSessionRules({ removeRuleIds: [tabId] });
  await updateMap(NATIVE_REQUESTS, m => without(m, tabId));
  await browser.tabs.update(tabId, { url: viewerUrlFor(url) });
}

/** True when the user chose the native viewer for this tab and URL. */
export async function isNativeRequested(tabId: number, url: string): Promise<boolean> {
  return (await readMap(NATIVE_REQUESTS))[tabId] === url.split("#")[0];
}

export const markNativeShown = (tabId: number, url: string) => updateMap(NATIVE_SHOWN, m => ({ ...m, [tabId]: url }));
export const clearNativeShown = (tabId: number) => updateMap(NATIVE_SHOWN, m => without(m, tabId));
export async function nativeShownUrl(tabId: number): Promise<string | null> {
  return (await readMap(NATIVE_SHOWN))[tabId] ?? null;
}

export async function forgetTab(tabId: number): Promise<void> {
  await dnr.updateSessionRules({ removeRuleIds: [tabId] });
  await updateMap(NATIVE_REQUESTS, m => without(m, tabId));
  await clearNativeShown(tabId);
}
