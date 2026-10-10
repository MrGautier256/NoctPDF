import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { migrate, parseSettings } from "./migrations";
import { SETTINGS_VERSION, SettingsSchema } from "./schema";
import {
  readSettings,
  SETTINGS_PREFIX,
  splitIntoChunks,
  SYNC_QUOTA_BYTES_PER_ITEM,
  writeSettings,
  type KeyValueArea,
} from "./storage";

function memoryArea(initial: Record<string, unknown> = {}): KeyValueArea & { data: Record<string, unknown> } {
  const data = structuredClone(initial);
  return {
    data,
    get(keys) {
      if (!keys) return Promise.resolve(structuredClone(data));
      return Promise.resolve(Object.fromEntries(keys.filter(k => k in data).map(k => [k, structuredClone(data[k])])));
    },
    set(items) {
      Object.assign(data, structuredClone(items));
      return Promise.resolve();
    },
    remove(keys) {
      for (const k of keys) Reflect.deleteProperty(data, k);
      return Promise.resolve();
    },
  };
}

describe("schema and defaults", () => {
  it("defaults are valid", () => {
    expect(v.safeParse(SettingsSchema, DEFAULT_SETTINGS).success).toBe(true);
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION);
  });

  it("nothing stored gives the defaults", () => {
    expect(parseSettings(undefined)).toEqual({ settings: DEFAULT_SETTINGS, resetSections: [] });
    expect(parseSettings("garbage").settings).toEqual(DEFAULT_SETTINGS);
  });

  it("fills missing keys from the defaults", () => {
    const { settings, resetSections } = parseSettings({ version: 1, theme: { bg: "#000000" }, enabled: false });
    expect(resetSections).toEqual([]);
    expect(settings.enabled).toBe(false);
    expect(settings.theme.bg).toBe("#000000");
    expect(settings.theme.fg).toBe(DEFAULT_SETTINGS.theme.fg);
    expect(settings.images).toEqual(DEFAULT_SETTINGS.images);
  });

  it("resets only the invalid section", () => {
    const { settings, resetSections } = parseSettings({
      version: 1,
      engine: "native-overlay",
      theme: { bg: "not a color" },
      tuning: { minTextContrast: 99 },
    });
    expect(resetSections.sort()).toEqual(["theme", "tuning"]);
    expect(settings.theme).toEqual(DEFAULT_SETTINGS.theme);
    expect(settings.tuning).toEqual(DEFAULT_SETTINGS.tuning);
    expect(settings.engine).toBe("native-overlay");
  });

  it("drops unknown keys", () => {
    const { settings } = parseSettings({ version: 1, bogus: 1, theme: { bogus: 2 } });
    expect(settings).not.toHaveProperty("bogus");
    expect(settings.theme).not.toHaveProperty("bogus");
  });

  it("accepts an explicit toolbar inset or auto", () => {
    expect(parseSettings({ nativeOverlay: { toolbarInset: 41 } }).settings.nativeOverlay.toolbarInset).toBe(41);
    expect(parseSettings({ nativeOverlay: { toolbarInset: "x" } }).resetSections).toEqual(["nativeOverlay"]);
  });
});

describe("migrations", () => {
  const steps = {
    1: (s: Record<string, unknown>) => ({ ...s, renamed: s.old, old: undefined }),
    2: (s: Record<string, unknown>) => ({ ...s, added: true }),
  };

  it("runs every step in order", () => {
    expect(migrate({ version: 1, old: "x" }, steps, 3)).toEqual({
      version: 3,
      renamed: "x",
      old: undefined,
      added: true,
    });
  });

  it("fails loudly on a missing step", () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow(/no migration from settings version 1/);
  });

  it("keeps what it understands from a newer version", () => {
    const { settings } = parseSettings({ version: SETTINGS_VERSION + 5, enabled: false });
    expect(settings.enabled).toBe(false);
    expect(settings.version).toBe(SETTINGS_VERSION);
  });
});

describe("chunked storage", () => {
  it("round-trips the defaults", async () => {
    const area = memoryArea();
    await writeSettings(area, DEFAULT_SETTINGS);
    expect((await readSettings(area)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("splits large settings under the per-item quota and cleans stale chunks", async () => {
    const big = structuredClone(DEFAULT_SETTINGS);
    big.siteRules = Array.from({ length: 400 }, (_, i) => ({
      pattern: `https://example-${i}.org/"quoted"/é/*`,
      disabled: true,
    }));
    const area = memoryArea();
    await writeSettings(area, big);
    const chunkKeys = Object.keys(area.data).filter(k => /\.\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThan(3);
    for (const k of chunkKeys) {
      const bytes = new TextEncoder().encode(k + JSON.stringify(area.data[k])).length;
      expect(bytes).toBeLessThanOrEqual(SYNC_QUOTA_BYTES_PER_ITEM);
    }
    expect((await readSettings(area)).settings).toEqual(big);

    await writeSettings(area, DEFAULT_SETTINGS);
    expect(Object.keys(area.data).filter(k => /\.\d+$/.test(k))).toEqual([`${SETTINGS_PREFIX}.0`]);
    expect((await readSettings(area)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("never splits a surrogate pair", () => {
    const json = "😀".repeat(5000);
    const chunks = splitIntoChunks(json, 1000);
    expect(chunks.join("")).toBe(json);
    for (const c of chunks) expect(c).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/u);
  });

  it("falls back to defaults on a missing chunk", async () => {
    const area = memoryArea({ [`${SETTINGS_PREFIX}.meta`]: { chunks: 2 }, [`${SETTINGS_PREFIX}.0`]: "{" });
    expect((await readSettings(area)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a freshly-added site rule with an empty pattern (regression: the options page adds one, then the user types into it)", async () => {
    // A rule the options page just pushed, before the user has typed a pattern into it.
    const withDraftRule = { ...DEFAULT_SETTINGS, siteRules: [{ pattern: "" }] };
    const area = memoryArea();
    await writeSettings(area, withDraftRule);
    const { settings, resetSections } = await readSettings(area);
    expect(resetSections).toEqual([]);
    expect(settings.siteRules).toEqual([{ pattern: "" }]);
  });
});
