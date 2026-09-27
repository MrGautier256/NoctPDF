<script setup lang="ts">
import { onMounted, ref } from "vue";
import { browser } from "../../platform";
import type { TabState } from "../../shared/messages";
import type { Engine } from "../../settings/schema";
import { t } from "../shared/i18n";
import { send } from "../shared/messaging";
import { useSettings } from "../shared/use-settings";

const { settings, save } = useSettings();
const tabId = ref<number | null>(null);
const tab = ref<TabState | null>(null);
const engines: Engine[] = ["enhanced", "native-overlay", "off"];

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
  width: 280px;
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
