import type { Settings } from "./schema";

export interface ThemePreset {
  id: string;
  /** Proper noun, not translated (Nord, Dracula, Gruvbox... read the same in every locale). */
  name: string;
  theme: Omit<Settings["theme"], "presetId">;
}

const base = (
  overrides: Partial<Omit<Settings["theme"], "presetId">> & Pick<Settings["theme"], "bg" | "fg" | "surround">,
): Omit<Settings["theme"], "presetId"> => ({
  pageShadow: true,
  pageGap: 12,
  hideLinkBorders: false,
  ...overrides,
});

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "chrome-dark",
    name: "Chrome Dark",
    theme: base({ bg: "#1e1f22", fg: "#e6e3dc", surround: "#141517", selectionColor: "#3d70d1" }),
  },
  {
    id: "oled",
    name: "OLED",
    theme: base({ bg: "#000000", fg: "#e6e3dc", surround: "#000000", selectionColor: "#3d70d1" }),
  },
  {
    id: "sepia-dark",
    name: "Sepia Dark",
    theme: base({ bg: "#2b2520", fg: "#e8d9c0", surround: "#1d1915", selectionColor: "#8a6a3d" }),
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    theme: base({ bg: "#002b36", fg: "#93a1a1", surround: "#00212b", selectionColor: "#268bd2" }),
  },
  {
    id: "nord",
    name: "Nord",
    theme: base({ bg: "#2e3440", fg: "#eceff4", surround: "#242933", selectionColor: "#5e81ac" }),
  },
  {
    id: "dracula",
    name: "Dracula",
    theme: base({ bg: "#282a36", fg: "#f8f8f2", surround: "#21222c", selectionColor: "#44475a" }),
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    theme: base({ bg: "#282828", fg: "#ebdbb2", surround: "#1d2021", selectionColor: "#458588" }),
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    theme: base({ bg: "#1e1e2e", fg: "#cdd6f4", surround: "#181825", selectionColor: "#cba6f7" }),
  },
  {
    id: "sepia-light",
    name: "Sepia Light",
    theme: base({ bg: "#f4ecd8", fg: "#5b4636", surround: "#e8ddc4", selectionColor: "#c9a86a" }),
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    // base01, not the slightly lighter base00: the canonical pairing falls just under 4.5:1.
    theme: base({ bg: "#fdf6e3", fg: "#586e75", surround: "#eee8d5", selectionColor: "#268bd2" }),
  },
];

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find(p => p.id === id);
}
