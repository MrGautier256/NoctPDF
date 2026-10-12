import { describe, expect, it } from "vitest";
import type { Settings } from "../settings/schema";
import {
  buildFilterMarkup,
  DEFAULT_TOOLBAR_INSET,
  EDGE_TOOLBAR_INSET,
  filterTables,
  isFullBleedPdfEmbed,
  isTopLevelPdfDocument,
  paletteForStyle,
  resolveToolbarInset,
  shouldActivateOverlay,
} from "./native-overlay-logic";

const theme = { bg: "#1e1f22", fg: "#e6e3dc" } as Settings["theme"];

describe("resolveToolbarInset", () => {
  it("covers the toolbar when coverToolbar is set, regardless of the rest", () => {
    expect(resolveToolbarInset({ style: "smart", toolbarInset: 90, coverToolbar: true }, false)).toBe(0);
  });

  it("auto-detects the default and Edge toolbar heights", () => {
    expect(resolveToolbarInset({ style: "smart", toolbarInset: "auto", coverToolbar: false }, false)).toBe(
      DEFAULT_TOOLBAR_INSET,
    );
    expect(resolveToolbarInset({ style: "smart", toolbarInset: "auto", coverToolbar: false }, true)).toBe(
      EDGE_TOOLBAR_INSET,
    );
  });

  it("uses an explicit inset as given", () => {
    expect(resolveToolbarInset({ style: "smart", toolbarInset: 12, coverToolbar: false }, false)).toBe(12);
  });
});

describe("paletteForStyle", () => {
  it("follows the theme for smart", () => {
    expect(paletteForStyle("smart", theme)).toEqual({ bg: theme.bg, fg: theme.fg, grayscale: false });
  });

  it("gives fixed, theme-independent palettes for the other three styles", () => {
    expect(paletteForStyle("pure", theme)).toEqual({ bg: "#000000", fg: "#ffffff", grayscale: false });
    expect(paletteForStyle("warm", theme).bg).not.toBe(theme.bg);
    expect(paletteForStyle("mono", theme).grayscale).toBe(true);
  });
});

describe("shouldActivateOverlay", () => {
  it("activates only when enabled and engine is native-overlay", () => {
    const base = { enabled: true, engine: "native-overlay" } as Settings;
    expect(shouldActivateOverlay(base)).toBe(true);
    expect(shouldActivateOverlay({ ...base, enabled: false })).toBe(false);
    expect(shouldActivateOverlay({ ...base, engine: "enhanced" })).toBe(false);
  });
});

describe("filterTables", () => {
  it("maps white to bg and black to fg per channel", () => {
    expect(filterTables("#1e1f22", "#e6e3dc")).toEqual({
      r: [0x1e / 255, 0xe6 / 255],
      g: [0x1f / 255, 0xe3 / 255],
      b: [0x22 / 255, 0xdc / 255],
    });
  });
});

describe("buildFilterMarkup", () => {
  it("includes the invert/hueRotate/table primitives and the given id", () => {
    const markup = buildFilterMarkup("my-filter", { bg: "#000000", fg: "#ffffff", grayscale: false });
    expect(markup).toContain('id="my-filter"');
    expect(markup).toContain("hueRotate");
    expect(markup).not.toContain("saturate");
  });

  it("adds a saturate(0) step for grayscale palettes", () => {
    const markup = buildFilterMarkup("f", { bg: "#000000", fg: "#ffffff", grayscale: true });
    expect(markup).toContain('type="saturate" values="0"');
  });
});

describe("isTopLevelPdfDocument", () => {
  it("is true only for the application/pdf content type", () => {
    expect(isTopLevelPdfDocument("application/pdf")).toBe(true);
    expect(isTopLevelPdfDocument("text/html")).toBe(false);
  });
});

describe("isFullBleedPdfEmbed", () => {
  it("requires a pdf mime type, sole-child placement, and full viewport width", () => {
    expect(
      isFullBleedPdfEmbed({
        mimeType: "application/pdf",
        elementWidth: 1024,
        viewportWidth: 1024,
        isOnlyBodyChild: true,
      }),
    ).toBe(true);
    expect(
      isFullBleedPdfEmbed({
        mimeType: "application/pdf",
        elementWidth: 400,
        viewportWidth: 1024,
        isOnlyBodyChild: true,
      }),
    ).toBe(false);
    expect(
      isFullBleedPdfEmbed({
        mimeType: "application/pdf",
        elementWidth: 1024,
        viewportWidth: 1024,
        isOnlyBodyChild: false,
      }),
    ).toBe(false);
    expect(
      isFullBleedPdfEmbed({ mimeType: "text/html", elementWidth: 1024, viewportWidth: 1024, isOnlyBodyChild: true }),
    ).toBe(false);
  });

  it("tolerates a 2px rounding slack", () => {
    expect(
      isFullBleedPdfEmbed({
        mimeType: "application/pdf",
        elementWidth: 1022,
        viewportWidth: 1024,
        isOnlyBodyChild: true,
      }),
    ).toBe(true);
  });
});
