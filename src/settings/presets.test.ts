import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { contrast, hexToRgb } from "../color/oklab";
import { findPreset, THEME_PRESETS } from "./presets";
import { ThemeSchema } from "./schema";

describe("THEME_PRESETS", () => {
  it("has a unique id and name for every preset", () => {
    const ids = THEME_PRESETS.map(p => p.id);
    const names = THEME_PRESETS.map(p => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every preset is a valid theme once presetId is attached", () => {
    for (const preset of THEME_PRESETS) {
      const candidate = { ...preset.theme, presetId: preset.id };
      const result = v.safeParse(ThemeSchema, candidate);
      expect(result.success, `${preset.id}: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });

  it("bg and fg have a comfortable WCAG contrast in every preset (>= 4.5:1)", () => {
    for (const preset of THEME_PRESETS) {
      const ratio = contrast(hexToRgb(preset.theme.bg), hexToRgb(preset.theme.fg));
      expect(ratio, `${preset.id}: bg/fg contrast ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("findPreset looks up by id and returns undefined otherwise", () => {
    expect(findPreset("nord")?.name).toBe("Nord");
    expect(findPreset("does-not-exist")).toBeUndefined();
  });
});
