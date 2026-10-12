import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { matchPatternToRegexSource, resolveEffectiveSettings, resolveSiteRule, siteRuleMatches } from "./site-rules";

describe("siteRuleMatches", () => {
  it("matches a wildcard scheme and host", () => {
    expect(siteRuleMatches("https://example.com/a.pdf", "*://example.com/*")).toBe(true);
    expect(siteRuleMatches("http://example.com/a.pdf", "*://example.com/*")).toBe(true);
    expect(siteRuleMatches("https://other.com/a.pdf", "*://example.com/*")).toBe(false);
  });

  it("matches a wildcard subdomain", () => {
    expect(siteRuleMatches("https://docs.example.com/a.pdf", "https://*.example.com/*")).toBe(true);
    expect(siteRuleMatches("https://example.com/a.pdf", "https://*.example.com/*")).toBe(true);
    expect(siteRuleMatches("https://example.org/a.pdf", "https://*.example.com/*")).toBe(false);
  });

  it("matches file:// patterns", () => {
    expect(siteRuleMatches("file:///home/me/report.pdf", "file:///*")).toBe(true);
  });

  it("is false for an invalid or empty pattern", () => {
    expect(siteRuleMatches("https://example.com/a.pdf", "")).toBe(false);
    expect(siteRuleMatches("https://example.com/a.pdf", "not a pattern")).toBe(false);
  });

  it("treats regex metacharacters in the host/path literally", () => {
    expect(siteRuleMatches("https://example.com/a+b.pdf", "https://example.com/a+b.pdf")).toBe(true);
    expect(siteRuleMatches("https://examplexcom/a.pdf", "https://example.com/*")).toBe(false);
  });
});

describe("matchPatternToRegexSource", () => {
  it("only produces anchors, literal escapes and .*, never lookaround", () => {
    const source = matchPatternToRegexSource("*://*.example.com/*");
    expect(source).not.toBeNull();
    expect(source).not.toMatch(/\(\?[=!<]/);
  });
});

describe("resolveSiteRule", () => {
  it("picks the first non-disabled matching rule", () => {
    const rules = [
      { pattern: "https://a.org/*", engine: "off" as const },
      { pattern: "https://*.org/*", engine: "native-overlay" as const },
    ];
    expect(resolveSiteRule("https://a.org/x.pdf", rules)?.engine).toBe("off");
    expect(resolveSiteRule("https://b.org/x.pdf", rules)?.engine).toBe("native-overlay");
  });

  it("skips a disabled rule", () => {
    const rules = [
      { pattern: "https://a.org/*", engine: "off" as const, disabled: true },
      { pattern: "https://a.org/*", engine: "native-overlay" as const },
    ];
    expect(resolveSiteRule("https://a.org/x.pdf", rules)?.engine).toBe("native-overlay");
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveSiteRule("https://a.org/x.pdf", [{ pattern: "https://b.org/*" }])).toBeUndefined();
  });
});

describe("resolveEffectiveSettings", () => {
  it("returns the same settings object when no rule matches", () => {
    const settings = { ...DEFAULT_SETTINGS, siteRules: [{ pattern: "https://b.org/*", engine: "off" as const }] };
    expect(resolveEffectiveSettings(settings, "https://a.org/x.pdf")).toBe(settings);
  });

  it("overrides the engine for a matching rule", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      siteRules: [{ pattern: "https://a.org/*", engine: "native-overlay" as const }],
    };
    const effective = resolveEffectiveSettings(settings, "https://a.org/x.pdf");
    expect(effective.engine).toBe("native-overlay");
    expect(effective).not.toBe(settings);
  });

  it("overrides the theme with a built-in preset", () => {
    const settings = { ...DEFAULT_SETTINGS, siteRules: [{ pattern: "https://a.org/*", presetId: "nord" }] };
    const effective = resolveEffectiveSettings(settings, "https://a.org/x.pdf");
    expect(effective.theme.presetId).toBe("nord");
    expect(effective.theme.bg).toBe("#2e3440");
  });

  it("overrides the theme with a custom preset", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      customPresets: [
        {
          id: "my-preset",
          name: "Mine",
          theme: { ...DEFAULT_SETTINGS.theme, bg: "#010203" },
        },
      ],
      siteRules: [{ pattern: "https://a.org/*", presetId: "my-preset" }],
    };
    const effective = resolveEffectiveSettings(settings, "https://a.org/x.pdf");
    expect(effective.theme.bg).toBe("#010203");
  });

  it("leaves the theme alone when the preset id is unknown", () => {
    const settings = { ...DEFAULT_SETTINGS, siteRules: [{ pattern: "https://a.org/*", presetId: "nope" }] };
    const effective = resolveEffectiveSettings(settings, "https://a.org/x.pdf");
    expect(effective.theme).toEqual(DEFAULT_SETTINGS.theme);
  });
});
