/**
 * Matches a URL against a site rule's Chrome-style match pattern
 * (`*://*.example.com/*`, `https://example.com/*`, `file:///*`) and resolves
 * which rule, if any, applies to a given document.
 *
 * `matchPatternToRegexSource` is the one source of truth for the pattern
 * language: it feeds both `matchPatternToRegExp` here (content scripts,
 * background message handlers) and the DNR `regexFilter` built in
 * background/dnr-rules.ts (RE2 accepts this subset: literal escapes, `.*`,
 * `^`/`$` anchors — no lookaround or backreferences are produced).
 */
import { findPreset } from "./presets";
import type { Settings, SiteRule } from "./schema";

// file:// patterns have no host segment (file:///path); every other scheme requires one.
const FILE_PATTERN = /^file:\/\/(\/.*)$/i;
const PATTERN = /^(\*|[a-z][a-z0-9+.-]*):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const wildcardPathToRegexSource = (path: string): string => path.split("*").map(escapeRegExp).join(".*");

export function matchPatternToRegexSource(pattern: string): string | null {
  const fileMatch = FILE_PATTERN.exec(pattern);
  if (fileMatch) return `^file://${wildcardPathToRegexSource(fileMatch[1]!)}$`;

  const m = PATTERN.exec(pattern);
  if (!m) return null;
  const scheme = m[1]!;
  const host = m[2]!;
  const path = m[3]!;
  const schemeRe = scheme === "*" ? "https?" : escapeRegExp(scheme);
  const hostRe =
    host === "*" ? "[^/]+" : host.startsWith("*.") ? `(?:[^/]+\\.)?${escapeRegExp(host.slice(2))}` : escapeRegExp(host);
  return `^${schemeRe}://${hostRe}${wildcardPathToRegexSource(path)}$`;
}

export function matchPatternToRegExp(pattern: string): RegExp | null {
  const source = matchPatternToRegexSource(pattern);
  return source ? new RegExp(source, "i") : null;
}

export function siteRuleMatches(url: string, pattern: string): boolean {
  return matchPatternToRegExp(pattern)?.test(url) ?? false;
}

/** The first non-disabled rule matching `url`, in list order. */
export function resolveSiteRule(url: string, siteRules: readonly SiteRule[]): SiteRule | undefined {
  return siteRules.find(rule => !rule.disabled && siteRuleMatches(url, rule.pattern));
}

/**
 * Applies the matching site rule's engine/theme override on top of the
 * global settings. Returns `settings` unchanged (same reference) when no
 * rule matches or the matching rule has nothing to override.
 */
export function resolveEffectiveSettings(settings: Settings, url: string): Settings {
  const rule = resolveSiteRule(url, settings.siteRules);
  if (!rule) return settings;
  let next = settings;
  if (rule.engine && rule.engine !== next.engine) next = { ...next, engine: rule.engine };
  if (rule.presetId) {
    const preset = findPreset(rule.presetId) ?? settings.customPresets.find(p => p.id === rule.presetId);
    if (preset) next = { ...next, theme: { ...preset.theme, presetId: rule.presetId } };
  }
  return next;
}
