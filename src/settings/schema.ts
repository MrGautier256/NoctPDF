import * as v from "valibot";

/** Bump when the stored shape changes, and add a step in migrations.ts. */
export const SETTINGS_VERSION = 1;

const Hex = v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i, "expected a #rrggbb color"));
const Clock = v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"));
const range = (min: number, max: number) => v.pipe(v.number(), v.minValue(min), v.maxValue(max));

export const EngineSchema = v.picklist(["enhanced", "native-overlay", "off"]);
export type Engine = v.InferOutput<typeof EngineSchema>;

export const ActivationSchema = v.object({
  mode: v.picklist(["always", "follow-system", "schedule"]),
  schedule: v.optional(v.object({ darkFrom: Clock, darkTo: Clock })),
});

export const ThemeSchema = v.object({
  presetId: v.pipe(v.string(), v.minLength(1)),
  bg: Hex,
  fg: Hex,
  accents: v.optional(v.array(Hex)),
  linkColor: v.optional(Hex),
  selectionColor: v.optional(Hex),
  /** Hide link annotation borders instead of recoloring them (hyperref documents). */
  hideLinkBorders: v.boolean(),
  /** Background around the pages. */
  surround: Hex,
  pageShadow: v.boolean(),
  pageBorder: v.optional(Hex),
  /** Gap between pages, in CSS pixels. */
  pageGap: range(0, 64),
});

export const TuningSchema = v.object({
  /** Multipliers, 1 = neutral. */
  brightness: range(0.5, 1.5),
  contrast: range(0.5, 1.5),
  gamma: range(0.5, 2),
  saturation: range(0, 2),
  /** -1 (cool) .. 1 (warm), 0 = neutral. */
  warmth: range(-1, 1),
  /** WCAG contrast ratio, 1 disables the guard. */
  minTextContrast: range(1, 21),
  recolorVectors: v.boolean(),
  preserveSemanticHues: v.boolean(),
});

export const ImagesSchema = v.object({
  mode: v.picklist(["keep", "dim", "blend", "grayscale", "invert", "auto"]),
  /** Brightness factor for `dim`, 1 = unchanged. */
  dimLevel: range(0.3, 1),
  scannedPages: v.picklist(["recolor", "keep"]),
  /** Share of the page an image must cover to count as a scan. */
  scanDetectionThreshold: range(0.5, 1),
});

export const UiSchema = v.object({
  skin: v.picklist(["stock", "enhanced"]),
  colorSource: v.picklist(["theme", "system", "custom"]),
  customUiColors: v.optional(v.object({ surface: Hex, text: Hex, accent: Hex })),
  autoHideToolbar: v.boolean(),
  animations: v.boolean(),
  density: v.picklist(["compact", "comfortable"]),
});

export const InterceptionSchema = v.object({
  httpPdfs: v.boolean(),
  localFiles: v.boolean(),
  /** PDFs in iframes, and <embed>/<object> placed by web pages. */
  embeddedPdfs: v.boolean(),
  /** Content-Disposition: attachment is downloaded instead of opened. */
  respectAttachmentDownloads: v.boolean(),
});

export const NativeOverlaySchema = v.object({
  style: v.picklist(["smart", "pure", "mono", "warm"]),
  /** CSS pixels left uncovered at the top; "auto" picks it per browser (56, Edge 41). */
  toolbarInset: v.union([v.literal("auto"), range(0, 200)]),
  coverToolbar: v.boolean(),
});

export const CustomPresetSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  theme: v.omit(ThemeSchema, ["presetId"]),
});
export type CustomPreset = v.InferOutput<typeof CustomPresetSchema>;

export const SiteRuleSchema = v.object({
  pattern: v.pipe(v.string(), v.minLength(1)),
  engine: v.optional(EngineSchema),
  presetId: v.optional(v.string()),
  disabled: v.optional(v.boolean()),
});

export const SettingsSchema = v.object({
  version: v.literal(SETTINGS_VERSION),
  enabled: v.boolean(),
  engine: EngineSchema,
  activation: ActivationSchema,
  theme: ThemeSchema,
  tuning: TuningSchema,
  images: ImagesSchema,
  ui: UiSchema,
  interception: InterceptionSchema,
  nativeOverlay: NativeOverlaySchema,
  print: v.object({ useTheme: v.boolean() }),
  peekKey: v.picklist(["Alt", "Shift", "none"]),
  siteRules: v.array(SiteRuleSchema),
  /** User-saved themes, in addition to the built-in presets (src/settings/presets.ts). */
  customPresets: v.array(CustomPresetSchema),
  /** Remember theme, page and zoom per document (key = URL hash or PDF fingerprint). */
  rememberPerDocument: v.boolean(),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;
export type SettingsSection = Exclude<keyof Settings, "version">;
