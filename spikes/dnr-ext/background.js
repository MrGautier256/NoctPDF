// Adapted from mozilla/pdf.js extensions/chromium/pdfHandler.js (Apache-2.0),
// plus a main_frame attachment rule (respectAttachmentDownloads) and the
// "open in native viewer" session allow rule.
const VIEWER = chrome.runtime.getURL("viewer.html");
const allow = { type: "allow" };
const redirect = { type: "redirect", redirect: { regexSubstitution: VIEWER + "?DNR:\\0" } };
const frames = ["main_frame", "sub_frame"];

const rules = [
  { condition: { urlFilter: "noctpdf.action=download", resourceTypes: frames }, action: allow },
  { condition: { regexFilter: "^file://.*\\.[pP][dD][fF]$", resourceTypes: frames }, action: redirect },
  // respectAttachmentDownloads = true: attachments are downloaded, main frame included.
  { condition: { urlFilter: "*", resourceTypes: frames, responseHeaders: [{ header: "content-disposition", values: ["attachment*"] }] }, action: allow },
  { condition: { regexFilter: "^.*$", excludedRequestMethods: ["post"], resourceTypes: frames,
      responseHeaders: [{ header: "content-type", values: ["application/pdf", "application/pdf;*"] }] }, action: redirect },
  { condition: { regexFilter: "^.*\\.pdf\\b.*$", excludedRequestMethods: ["post"], resourceTypes: frames,
      responseHeaders: [{ header: "content-type", values: ["application/octet-stream", "application/octet-stream;*"] }] }, action: redirect },
  { condition: { regexFilter: "^.*$", excludedRequestMethods: ["post"], resourceTypes: frames,
      responseHeaders: [{ header: "content-disposition", values: ["*.pdf", '*.pdf"*', "*.pdf'*"] }],
      excludedResponseHeaders: [{ header: "content-type", excludedValues: ["application/octet-stream", "application/octet-stream;*"] }] }, action: redirect },
];
rules.forEach((r, i) => Object.assign(r, { id: i + 1, priority: rules.length - i }));

async function isHeaderConditionSupported() {
  const id = 123456;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id, condition: { responseHeaders: [{ header: "whatever" }], urlFilter: "|does_not_match_anything" }, action: { type: "block" } }] });
  } catch { return false; }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [{ id, condition: { responseHeaders: [], urlFilter: "|does_not_match_anything" }, action: { type: "block" } }] });
    return false;
  } catch { return true; } finally {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
  }
}

const ready = (async () => {
  const supported = await isHeaderConditionSupported();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules: supported ? rules : [] });
  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
  return { supported, fileAccess, ua: navigator.userAgent, brands: navigator.userAgentData?.brands };
})();

chrome.webNavigation.onBeforeNavigate.addListener(
  d => {
    if (d.frameId !== 0) return;
    chrome.extension.isAllowedFileSchemeAccess(ok => {
      if (!ok) chrome.tabs.update(d.tabId, { url: VIEWER + "?file=" + encodeURIComponent(d.url) });
    });
  },
  { url: [{ urlPrefix: "file://", pathSuffix: ".pdf" }] },
);

// Test hooks, called from the harness through the service worker target.
globalThis.__status = () => ready;
globalThis.__openNative = async (tabId, url) => {
  // Session rule scoped to one tab and one URL: no redirect loop possible.
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [9000],
    addRules: [{ id: 9000, priority: 1000, action: { type: "allow" },
      condition: { tabIds: [tabId], urlFilter: "|" + url + "|", resourceTypes: ["main_frame"] } }],
  });
  await chrome.tabs.update(tabId, { url });
  return true;
};
globalThis.__activeTabId = async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
globalThis.__tabIdByUrl = async prefix => (await chrome.tabs.query({})).find(t => (t.url || t.pendingUrl || "").startsWith(prefix))?.id;

// Debug only (unpacked + declarativeNetRequestFeedback): which rule matched.
globalThis.__matches = [];
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(i =>
  globalThis.__matches.push({ url: i.request.url, rule: i.rule.ruleId, ruleset: i.rule.rulesetId, type: i.request.type }));
globalThis.__rules = rules;
