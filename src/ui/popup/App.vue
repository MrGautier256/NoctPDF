<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { browser } from "../../platform";
import type { TabState } from "../../shared/messages";
import type { Engine, Settings } from "../../settings/schema";
import { THEME_PRESETS } from "../../settings/presets";
import { t } from "../shared/i18n";
import { send } from "../shared/messaging";
import { useSettings } from "../shared/use-settings";

const { settings, save } = useSettings();
const tabId = ref<number | null>(null);
const tab = ref<TabState | null>(null);
const engines: Engine[] = ["enhanced", "native-overlay", "off"];
const QUICK_PRESETS = THEME_PRESETS.slice(0, 8);
const IMAGE_MODES: Settings["images"]["mode"][] = ["auto", "dim", "keep", "blend", "grayscale", "invert"];

onMounted(async () => {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id === undefined) return;
  tabId.value = active.id;
  tab.value = await send({ type: "noct:getTabState", tabId: active.id });
});

async function openNative() {
  if (tabId.value === null || !tab.value?.pdfUrl) return;
  await send({ type: "noct:openNative", tabId: tabId.value, url: tab.value.pdfUrl });
  window.close();
}

async function openEnhanced() {
  if (tabId.value === null || !tab.value?.pdfUrl) return;
  await send({ type: "noct:openEnhanced", tabId: tabId.value, url: tab.value.pdfUrl });
  window.close();
}

const openOptions = () => void browser.runtime.openOptionsPage();

function applyPreset(presetId: string): void {
  if (!settings.value) return;
  const preset = QUICK_PRESETS.find(p => p.id === presetId);
  if (!preset) return;
  Object.assign(settings.value.theme, preset.theme, { presetId: preset.id });
  void save();
}

const imageModeLabel = computed(() => (settings.value ? t(`imagesMode_${settings.value.images.mode}`) : ""));
function cycleImageMode(): void {
  if (!settings.value) return;
  const i = IMAGE_MODES.indexOf(settings.value.images.mode);
  settings.value.images.mode = IMAGE_MODES[(i + 1) % IMAGE_MODES.length]!;
  void save();
}
</script>

<template>
  <main v-if="settings" class="popup">
    <header>
      <h1>NoctPDF</h1>
      <label class="switch">
        <input v-model="settings.enabled" type="checkbox" data-test="enabled" @change="save" />
        <span>{{ settings.enabled ? t("stateOn") : t("stateOff") }}</span>
      </label>
    </header>

    <fieldset :disabled="!settings.enabled">
      <legend>{{ t("engineLabel") }}</legend>
      <label v-for="e in engines" :key="e" class="choice">
        <input
          v-model="settings.engine"
          type="radio"
          name="engine"
          :value="e"
          :data-test="`engine-${e}`"
          @change="save"
        />
        {{ t(`engine_${e.replace("-", "_")}`) }}
      </label>
    </fieldset>

    <section :class="{ disabled: !settings.enabled }" class="quick-theme">
      <p class="quick-label">{{ t("popupQuickTheme") }}</p>
      <div class="swatches">
        <button
          v-for="p in QUICK_PRESETS"
          :key="p.id"
          type="button"
          class="swatch"
          :class="{ active: settings.theme.presetId === p.id }"
          :style="{ background: p.theme.bg, borderColor: p.theme.fg }"
          :disabled="!settings.enabled"
          :title="p.name"
          :data-test="`preset-${p.id}`"
          @click="applyPreset(p.id)"
        />
      </div>
    </section>

    <section :class="{ disabled: !settings.enabled }" class="sliders">
      <label class="slider-row">
        <span>{{ t("tuningBrightness") }}</span>
        <input
          v-model.number="settings.tuning.brightness"
          type="range"
          min="0.5"
          max="1.5"
          step="0.01"
          :disabled="!settings.enabled"
          @change="save"
        />
      </label>
      <label class="slider-row">
        <span>{{ t("tuningContrast") }}</span>
        <input
          v-model.number="settings.tuning.contrast"
          type="range"
          min="0.5"
          max="1.5"
          step="0.01"
          :disabled="!settings.enabled"
          @change="save"
        />
      </label>
      <button type="button" class="image-mode" :disabled="!settings.enabled" @click="cycleImageMode">
        {{ t("imagesMode") }}: {{ imageModeLabel }}
      </button>
    </section>

    <section v-if="tab?.inViewer || tab?.inNativeViewer" class="tab-actions">
      <button v-if="tab.inViewer" type="button" data-test="open-native" @click="openNative">
        {{ t("openNative") }}
      </button>
      <button v-else type="button" data-test="open-enhanced" @click="openEnhanced">{{ t("openEnhanced") }}</button>
    </section>

    <footer>
      <button type="button" class="link" @click="openOptions">{{ t("openOptions") }}</button>
    </footer>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
  --surface: #1e1f22;
  --text: #e6e3dc;
  --muted: #a9a59c;
  --accent: #8ab4f8;
  --border: #3a3b3f;
}
body {
  margin: 0;
  background: var(--surface);
  color: var(--text);
  font:
    13px/1.4 system-ui,
    sans-serif;
}
.popup {
  width: 300px;
  padding: 12px;
  display: grid;
  gap: 12px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h1 {
  margin: 0;
  font-size: 15px;
}
fieldset {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin: 0;
  display: grid;
  gap: 4px;
}
legend {
  color: var(--muted);
  padding: 0 4px;
}
.choice,
.switch {
  display: flex;
  gap: 6px;
  align-items: center;
}
.quick-theme,
.sliders {
  display: grid;
  gap: 6px;
}
.quick-theme.disabled,
.sliders.disabled {
  opacity: 0.5;
}
.quick-label {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid;
  cursor: pointer;
  padding: 0;
}
.swatch.active {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.slider-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 8px;
}
.image-mode {
  text-align: left;
}
button {
  font: inherit;
  color: var(--text);
  background: #2b2d31;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  width: 100%;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
button.link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0;
  width: auto;
}
</style>
