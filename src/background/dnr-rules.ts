// Declarative rules that send PDF navigations to our viewer.
//
// Adapted from mozilla/pdf.js extensions/chromium/pdfHandler.js
// (Apache License 2.0, see docs/CREDITS.md). Changes: rules depend on our
// settings, and Content-Disposition: attachment can be honored in the main
// frame too (respectAttachmentDownloads).
import type { Settings } from "../settings/schema";

type ResourceType = "main_frame" | "sub_frame";

/** Structural subset of chrome.declarativeNetRequest.Rule that we emit. */
export interface DnrRule {
  id: number;
  priority: number;
  action: { type: "allow" } | { type: "redirect"; redirect: { regexSubstitution: string } };
  condition: {
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes: ResourceType[];
    excludedRequestMethods?: "post"[];
    responseHeaders?: { header: string; values?: string[] }[];
    excludedResponseHeaders?: { header: string; excludedValues?: string[] }[];
    tabIds?: number[];
  };
}

/** Query parameters that force the browser's own handling (download, native viewer). */
export const ESCAPE_HATCHES = ["noctpdf.action=download", "pdfjs.action=download"];

const PDF_TYPES = ["application/pdf", "application/pdf;*"];
const OCTET_TYPES = ["application/octet-stream", "application/octet-stream;*"];

/**
 * The viewer understands `viewer.html?DNR:<raw url>`: DNR cannot URL-encode the
 * match, so the URL is appended as is (its fragment survives the redirect).
 */
export function redirectAction(viewerUrl: string): DnrRule["action"] {
  return { type: "redirect", redirect: { regexSubstitution: `${viewerUrl}?DNR:\\0` } };
}

type RuleBody = Omit<DnrRule, "id" | "priority">;

export function buildInterceptionRules(settings: Settings, viewerUrl: string): DnrRule[] {
  if (!settings.enabled || settings.engine !== "enhanced") return [];
  const { httpPdfs, localFiles, embeddedPdfs, respectAttachmentDownloads } = settings.interception;
  const frames: ResourceType[] = embeddedPdfs ? ["main_frame", "sub_frame"] : ["main_frame"];
  const allow = { type: "allow" } as const;
  const redirect = redirectAction(viewerUrl);
  // Highest priority first; ids and priorities are assigned at the end.
  const rules: RuleBody[] = [];

  for (const hatch of ESCAPE_HATCHES) {
    rules.push({ action: allow, condition: { urlFilter: hatch, resourceTypes: frames } });
  }

  if (localFiles) {
    // Only effective when the user allowed file access; otherwise the
    // webNavigation fallback opens the viewer, which explains how to allow it.
    rules.push({ action: redirect, condition: { regexFilter: "^file://.*\\.[pP][dD][fF]$", resourceTypes: frames } });
  }

  if (httpPdfs) {
    const attachment = [{ header: "content-disposition", values: ["attachment*"] }];
    if (respectAttachmentDownloads) {
      rules.push({ action: allow, condition: { urlFilter: "*", resourceTypes: frames, responseHeaders: attachment } });
    } else {
      // pdf.js behavior: always display in the main frame (servers are often
      // misconfigured), except for "=download" URLs such as Google Drive's.
      if (embeddedPdfs) {
        rules.push({
          action: allow,
          condition: { urlFilter: "*", resourceTypes: ["sub_frame"], responseHeaders: attachment },
        });
      }
      rules.push({
        action: allow,
        condition: { urlFilter: "=download", resourceTypes: ["main_frame"], responseHeaders: attachment },
      });
    }

    // The viewer refetches with GET: a POST response cannot be reproduced.
    const base = { excludedRequestMethods: ["post"] as "post"[], resourceTypes: frames };
    rules.push({
      action: redirect,
      condition: { regexFilter: "^.*$", ...base, responseHeaders: [{ header: "content-type", values: PDF_TYPES }] },
    });
    rules.push({
      // Wrong MIME type, but a .pdf path.
      action: redirect,
      condition: {
        regexFilter: "^.*\\.pdf\\b.*$",
        ...base,
        responseHeaders: [{ header: "content-type", values: OCTET_TYPES }],
      },
    });
    rules.push({
      // Wrong MIME type, but a .pdf file name in Content-Disposition. responseHeaders
      // is an OR: the double negation below means "content-type is octet-stream".
      action: redirect,
      condition: {
        regexFilter: "^.*$",
        ...base,
        responseHeaders: [{ header: "content-disposition", values: ["*.pdf", '*.pdf"*', "*.pdf'*"] }],
        excludedResponseHeaders: [{ header: "content-type", excludedValues: OCTET_TYPES }],
      },
    });
  }

  return rules.map((r, i) => ({ ...r, id: i + 1, priority: rules.length - i }));
}

/**
 * "Open in the native viewer": a session rule scoped to one tab and one URL,
 * above every redirect. It survives reloads and cannot loop.
 */
export function nativeAllowRule(ruleId: number, tabId: number, url: string): DnrRule {
  return {
    id: ruleId,
    priority: 1000,
    action: { type: "allow" },
    condition: { urlFilter: `|${url.split("#")[0]}|`, resourceTypes: ["main_frame"], tabIds: [tabId] },
  };
}
