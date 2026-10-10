<script setup lang="ts">
import { computed, ref } from "vue";
import * as v from "valibot";
import { contrast as contrastRatio, hexToRgb, type Rgb } from "../../color/oklab";
import { makeRemap } from "../../color/remap";
import { composeTuning } from "../../color/tuning";
import { THEME_PRESETS, type ThemePreset } from "../../settings/presets";
import { ThemeSchema, type CustomPreset, type Settings } from "../../settings/schema";
import { t } from "../shared/i18n";

const settings = defineModel<Settings>("settings", { required: true });
const emit = defineEmits<{ save: [] }>();
const theme = computed(() => settings.value.theme);

const allPresets = computed<ThemePreset[]>(() => [
  ...THEME_PRESETS,
  ...settings.value.customPresets.map(p => ({ id: p.id, name: p.name, theme: p.theme })),
]);
const isCustom = (id: string) => settings.value.customPresets.some(p => p.id === id);

function applyPreset(preset: ThemePreset): void {
  Object.assign(settings.value.theme, preset.theme, { presetId: preset.id });
  emit("save");
}

const newPresetName = ref("");
function saveAsPreset(): void {
  const name = newPresetName.value.trim();
  if (!name) return;
  const id = `custom-${Date.now().toString(36)}`;
  const current = settings.value.theme;
  const themeWithoutPresetId: CustomPreset["theme"] = {
    bg: current.bg,
    fg: current.fg,
    accents: current.accents,
    linkColor: current.linkColor,
    selectionColor: current.selectionColor,
    hideLinkBorders: current.hideLinkBorders,
    surround: current.surround,
    pageShadow: current.pageShadow,
    pageBorder: current.pageBorder,
    pageGap: current.pageGap,
  };
  settings.value.customPresets.push({ id, name, theme: themeWithoutPresetId });
  settings.value.theme.presetId = id;
  newPresetName.value = "";
  emit("save");
}

function deletePreset(id: string): void {
  const idx = settings.value.customPresets.findIndex(p => p.id === id);
  if (idx === -1) return;
  settings.value.customPresets.splice(idx, 1);
  if (settings.value.theme.presetId === id) applyPreset(THEME_PRESETS[0]!);
  else emit("save");
}

function onFieldChange(): void {
  emit("save");
}

// --- Live preview: run the real color engine on representative sample colors. ---
const remap = computed(() => {
  const base = makeRemap({
    bg: theme.value.bg,
    fg: theme.value.fg,
    chroma: settings.value.tuning.saturation,
    minContrast: settings.value.tuning.minTextContrast,
  });
  return composeTuning(base, {
    brightness: settings.value.tuning.brightness,
    contrast: settings.value.tuning.contrast,
    gamma: settings.value.tuning.gamma,
    saturation: 1,
    warmth: settings.value.tuning.warmth,
  });
});
const css = (rgb: Rgb): string => {
  const [r, g, b] = remap.value(rgb).map(c => Math.round(c * 255));
  return `rgb(${r},${g},${b})`;
};
const SAMPLE = {
  link: [0.05, 0.25, 0.8] as Rgb,
  warn: [0.8, 0.1, 0.1] as Rgb,
  ok: [0.1, 0.55, 0.2] as Rgb,
  highlightBg: [1, 0.95, 0.3] as Rgb,
  tableGreen: [0.85, 1, 0.85] as Rgb,
  tableRed: [1, 0.85, 0.85] as Rgb,
  tableBlue: [0.85, 0.9, 1] as Rgb,
  darkBoxBg: [0.1, 0.2, 0.45] as Rgb,
  darkBoxFg: [1, 1, 1] as Rgb,
};

const bgFgContrast = computed(() => contrastRatio(hexToRgb(theme.value.bg), hexToRgb(theme.value.fg)));
const contrastLevel = computed<"good" | "ok" | "bad">(() => {
  const r = bgFgContrast.value;
  return r >= 4.5 ? "good" : r >= 3 ? "ok" : "bad";
});

// --- Import / export ---
const importError = ref("");
function exportTheme(): void {
  const blob = new Blob([JSON.stringify(theme.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `noctpdf-theme-${theme.value.presetId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importTheme(e: Event): Promise<void> {
  importError.value = "";
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const withId =
      parsed && typeof parsed === "object" && "presetId" in parsed
        ? parsed
        : { ...(parsed as object), presetId: `custom-${Date.now().toString(36)}` };
    const result = v.safeParse(ThemeSchema, withId);
    if (!result.success) {
      importError.value = t("themeImportError");
      return;
    }
    Object.assign(settings.value.theme, result.output);
    emit("save");
  } catch {
    importError.value = t("themeImportError");
  }
}
</script>

<template>
  <section class="theme-editor">
    <h3>{{ t("themePresets") }}</h3>
    <div class="presets">
      <button
        v-for="p in allPresets"
        :key="p.id"
        type="button"
        class="preset"
        :class="{ active: p.id === theme.presetId }"
        :title="p.name"
        @click="applyPreset(p)"
      >
        <span class="swatch" :style="{ background: p.theme.bg, borderColor: p.theme.fg }">
          <span class="swatch-fg" :style="{ background: p.theme.fg }" />
        </span>
        <span class="preset-name">{{ p.name }}</span>
        <button
          v-if="isCustom(p.id)"
          type="button"
          class="delete"
          :aria-label="t('themeDeletePreset')"
          @click.stop="deletePreset(p.id)"
        >
          ×
        </button>
      </button>
    </div>
    <div class="save-as">
      <input v-model="newPresetName" type="text" :placeholder="t('themeNewPresetName')" @keyup.enter="saveAsPreset" />
      <button type="button" :disabled="!newPresetName.trim()" @click="saveAsPreset">
        {{ t("themeSaveAsPreset") }}
      </button>
    </div>

    <h3>{{ t("themeColors") }}</h3>
    <div class="colors">
      <label class="color-field">
        {{ t("themeBg") }}
        <input v-model="settings.theme.bg" type="color" data-test="theme-bg" @change="onFieldChange" />
      </label>
      <label class="color-field">
        {{ t("themeFg") }}
        <input v-model="settings.theme.fg" type="color" data-test="theme-fg" @change="onFieldChange" />
      </label>
      <label class="color-field">
        {{ t("themeSurround") }}
        <input v-model="settings.theme.surround" type="color" data-test="theme-surround" @change="onFieldChange" />
      </label>
      <label class="color-field">
        {{ t("themeSelection") }}
        <input
          :value="settings.theme.selectionColor ?? settings.theme.bg"
          type="color"
          data-test="theme-selection"
          @input="settings.theme.selectionColor = ($event.target as HTMLInputElement).value"
          @change="onFieldChange"
        />
      </label>
    </div>
    <div class="switches">
      <label>
        <input v-model="settings.theme.hideLinkBorders" type="checkbox" @change="onFieldChange" />
        <span>{{ t("themeHideLinkBorders") }}</span>
      </label>
      <label>
        <input v-model="settings.theme.pageShadow" type="checkbox" @change="onFieldChange" />
        <span>{{ t("themePageShadow") }}</span>
      </label>
      <label class="range-field">
        {{ t("themePageGap") }}
        <input v-model.number="settings.theme.pageGap" type="range" min="0" max="64" @change="onFieldChange" />
        <span>{{ settings.theme.pageGap }}px</span>
      </label>
    </div>

    <div class="contrast" :class="contrastLevel" data-test="contrast-indicator">
      {{ t("themeContrastLabel") }} {{ bgFgContrast.toFixed(2) }}:1
      <span v-if="contrastLevel !== 'good'">({{ t("themeContrastLow") }})</span>
    </div>

    <h3>{{ t("themePreview") }}</h3>
    <div class="preview" :style="{ background: theme.surround }">
      <div
        class="preview-page"
        :style="{
          background: theme.bg,
          color: theme.fg,
          boxShadow: theme.pageShadow ? '0 4px 16px rgb(0 0 0 / 0.4)' : 'none',
        }"
      >
        <p>{{ t("themePreviewBody") }}</p>
        <p>
          <span :style="{ color: css(SAMPLE.link) }">{{ t("themePreviewLink") }}</span>
        </p>
        <p>
          <span :style="{ color: css(SAMPLE.warn) }">{{ t("themePreviewWarn") }}</span> ·
          <span :style="{ color: css(SAMPLE.ok) }">{{ t("themePreviewOk") }}</span>
        </p>
        <p>
          <span :style="{ background: css(SAMPLE.highlightBg) }">{{ t("themePreviewHighlight") }}</span>
        </p>
        <div class="preview-table">
          <span :style="{ background: css(SAMPLE.tableGreen) }">{{ t("themePreviewCellA") }}</span>
          <span :style="{ background: css(SAMPLE.tableRed) }">{{ t("themePreviewCellB") }}</span>
          <span :style="{ background: css(SAMPLE.tableBlue) }">{{ t("themePreviewCellC") }}</span>
        </div>
        <div class="preview-box" :style="{ background: css(SAMPLE.darkBoxBg), color: css(SAMPLE.darkBoxFg) }">
          {{ t("themePreviewBox") }}
        </div>
      </div>
    </div>

    <h3>{{ t("themeImportExport") }}</h3>
    <div class="import-export">
      <button type="button" @click="exportTheme">{{ t("themeExport") }}</button>
      <label class="file-button">
        {{ t("themeImport") }}
        <input type="file" accept="application/json" @change="importTheme" />
      </label>
      <span v-if="importError" class="error">{{ importError }}</span>
    </div>
  </section>
</template>

<style scoped>
.theme-editor h3 {
  margin: 20px 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #a9a59c);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 84px;
  padding: 8px 4px;
  background: #2b2d31;
  border: 1px solid var(--border, #3a3b3f);
  border-radius: 8px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.preset.active {
  border-color: var(--accent, #8ab4f8);
  outline: 2px solid var(--accent, #8ab4f8);
  outline-offset: -1px;
}
.swatch {
  position: relative;
  width: 40px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid;
  overflow: hidden;
}
.swatch-fg {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.preset-name {
  font-size: 11px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.delete {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border, #3a3b3f);
  background: #1e1f22;
  color: inherit;
  line-height: 1;
  cursor: pointer;
}
.save-as {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.save-as input[type="text"] {
  flex: 1;
  font: inherit;
  color: inherit;
  background: #2b2d31;
  border: 1px solid var(--border, #3a3b3f);
  border-radius: 6px;
  padding: 6px 8px;
}
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.color-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted, #a9a59c);
}
.color-field input {
  width: 48px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border, #3a3b3f);
  border-radius: 6px;
  background: none;
}
.switches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.range-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.contrast {
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  width: fit-content;
  font-size: 13px;
}
.contrast.good {
  background: rgb(40 120 60 / 0.3);
}
.contrast.ok {
  background: rgb(150 120 20 / 0.3);
}
.contrast.bad {
  background: rgb(150 40 40 / 0.3);
}
.preview {
  padding: 20px;
  border-radius: 8px;
}
.preview-page {
  max-width: 420px;
  margin: 0 auto;
  padding: 16px 20px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
}
.preview-page p {
  margin: 0 0 8px;
}
.preview-table {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.preview-table span {
  flex: 1;
  padding: 4px 6px;
  border-radius: 3px;
  color: #111;
  font-size: 11px;
}
.preview-box {
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 12px;
}
.import-export {
  display: flex;
  align-items: center;
  gap: 10px;
}
.file-button {
  position: relative;
  display: inline-block;
  padding: 6px 12px;
  background: #2b2d31;
  border: 1px solid var(--border, #3a3b3f);
  border-radius: 6px;
  cursor: pointer;
}
.file-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.error {
  color: #e06c6c;
  font-size: 12px;
}
</style>
