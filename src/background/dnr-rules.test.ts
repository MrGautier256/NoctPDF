import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { Settings } from "../settings/schema";
import { buildInterceptionRules, nativeAllowRule, type DnrRule } from "./dnr-rules";

const VIEWER = "chrome-extension://abc/content/web/viewer.html";
const withInterception = (patch: Partial<Settings["interception"]>, extra: Partial<Settings> = {}): Settings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...extra,
  interception: { ...DEFAULT_SETTINGS.interception, ...patch },
});
const redirects = (rules: DnrRule[]) => rules.filter(r => r.action.type === "redirect");
const allows = (rules: DnrRule[]) => rules.filter(r => r.action.type === "allow");

describe("buildInterceptionRules", () => {
  it("emits nothing when disabled or when another engine is active", () => {
    expect(buildInterceptionRules({ ...DEFAULT_SETTINGS, enabled: false }, VIEWER)).toEqual([]);
    expect(buildInterceptionRules({ ...DEFAULT_SETTINGS, engine: "native-overlay" }, VIEWER)).toEqual([]);
    expect(buildInterceptionRules({ ...DEFAULT_SETTINGS, engine: "off" }, VIEWER)).toEqual([]);
  });

  it("numbers rules from 1 with strictly decreasing priorities", () => {
    const rules = buildInterceptionRules(DEFAULT_SETTINGS, VIEWER);
    expect(rules.map(r => r.id)).toEqual(rules.map((_, i) => i + 1));
    for (let i = 1; i < rules.length; i++) expect(rules[i]!.priority).toBeLessThan(rules[i - 1]!.priority);
  });

  it("redirects to viewer.html?DNR:<raw url>", () => {
    for (const r of redirects(buildInterceptionRules(DEFAULT_SETTINGS, VIEWER))) {
      expect(r.action).toEqual({ type: "redirect", redirect: { regexSubstitution: `${VIEWER}?DNR:\\0` } });
    }
  });

  it("puts every allow rule above every redirect (except the file:// one)", () => {
    const rules = buildInterceptionRules(DEFAULT_SETTINGS, VIEWER);
    const httpRedirects = redirects(rules).filter(r => r.condition.responseHeaders);
    for (const a of allows(rules)) for (const r of httpRedirects) expect(a.priority).toBeGreaterThan(r.priority);
  });

  it("covers iframes only when embedded PDFs are on", () => {
    const on = buildInterceptionRules(withInterception({ embeddedPdfs: true }), VIEWER);
    const off = buildInterceptionRules(withInterception({ embeddedPdfs: false }), VIEWER);
    expect(redirects(on).every(r => r.condition.resourceTypes.includes("sub_frame"))).toBe(true);
    expect(off.every(r => !r.condition.resourceTypes.includes("sub_frame"))).toBe(true);
  });

  it("honors attachments in the main frame only when asked to", () => {
    const attachmentAllows = (s: Settings) =>
      allows(buildInterceptionRules(s, VIEWER)).filter(r =>
        r.condition.responseHeaders?.some(h => h.header === "content-disposition"),
      );
    const respect = attachmentAllows(withInterception({ respectAttachmentDownloads: true }));
    expect(respect).toHaveLength(1);
    expect(respect[0]!.condition.resourceTypes).toContain("main_frame");
    expect(respect[0]!.condition.urlFilter).toBe("*");

    const pdfjsLike = attachmentAllows(withInterception({ respectAttachmentDownloads: false }));
    const mainFrame = pdfjsLike.filter(r => r.condition.resourceTypes.includes("main_frame"));
    expect(mainFrame).toHaveLength(1);
    expect(mainFrame[0]!.condition.urlFilter).toBe("=download");
  });

  it("drops the file:// rule and the http rules independently", () => {
    const noFiles = buildInterceptionRules(withInterception({ localFiles: false }), VIEWER);
    expect(noFiles.some(r => r.condition.regexFilter?.startsWith("^file:"))).toBe(false);
    const noHttp = buildInterceptionRules(withInterception({ httpPdfs: false }), VIEWER);
    expect(redirects(noHttp).map(r => r.condition.regexFilter)).toEqual(["^file://.*\\.[pP][dD][fF]$"]);
  });

  it("never redirects POST responses", () => {
    for (const r of redirects(buildInterceptionRules(DEFAULT_SETTINGS, VIEWER))) {
      if (r.condition.responseHeaders) expect(r.condition.excludedRequestMethods).toEqual(["post"]);
    }
  });

  it("uses regexes that match what they should", () => {
    const rules = buildInterceptionRules(DEFAULT_SETTINGS, VIEWER);
    const re = (filter: string) =>
      new RegExp(rules.find(r => r.condition.regexFilter === filter)!.condition.regexFilter!);
    const octet = re("^.*\\.pdf\\b.*$");
    expect(octet.test("https://a.org/doc.pdf")).toBe(true);
    expect(octet.test("https://a.org/doc.pdf?x=1")).toBe(true);
    expect(octet.test("https://a.org/doc.pdfx")).toBe(false);
    const file = re("^file://.*\\.[pP][dD][fF]$");
    expect(file.test("file:///C:/Users/me/Report.PDF")).toBe(true);
    expect(file.test("file:///C:/Users/me/report.pdf.txt")).toBe(false);
  });
});

describe("nativeAllowRule", () => {
  it("targets one tab and the exact URL, without fragment", () => {
    expect(nativeAllowRule(7, 42, "https://a.org/x.pdf#page=3")).toEqual({
      id: 7,
      priority: 1000,
      action: { type: "allow" },
      condition: { urlFilter: "|https://a.org/x.pdf|", resourceTypes: ["main_frame"], tabIds: [42] },
    });
  });

  it("outranks every interception rule", () => {
    const top = Math.max(...buildInterceptionRules(DEFAULT_SETTINGS, VIEWER).map(r => r.priority));
    expect(nativeAllowRule(1, 1, "https://a.org/x.pdf").priority).toBeGreaterThan(top);
  });
});
