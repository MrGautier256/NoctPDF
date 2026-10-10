<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { browser } from "../../platform";
import { parseSettings } from "../../settings/migrations";
import type { Diagnostics } from "../../shared/messages";
import type { Settings } from "../../settings/schema";
import { t } from "../shared/i18n";
import { send } from "../shared/messaging";
import { useSettings } from "../shared/use-settings";
import ThemeEditor from "./ThemeEditor.vue";

const { settings, save } = useSettings();
const diag = ref<Diagnostics | null>(null);
const refresh = async () => (diag.value = await send({ type: "noct:getDiagnostics" }));
onMounted(refresh);

type Section =
  "general" | "theme" | "images" | "interface" | "interception" | "native" | "siteRules" | "data" | "about";
const SECTIONS: Section[] = [
  "general",
  "theme",
  "images",
  "interface",
  "interception",
  "native",
  "siteRules",
  "data",
  "about",
];
const section = ref<Section>("theme");

const interceptionSwitches: (keyof Settings["interception"])[] = [
  "httpPdfs",
  "localFiles",
  "embeddedPdfs",
  "respectAttachmentDownloads",
];
const imagesModes: Settings["images"]["mode"][] = ["auto", "dim", "keep", "blend", "grayscale", "invert"];
const skins: Settings["ui"]["skin"][] = ["enhanced", "stock"];
const colorSources: Settings["ui"]["colorSource"][] = ["theme", "system", "custom"];
const densities: Settings["ui"]["density"][] = ["compact", "comfortable"];
const nativeStyles: Settings["nativeOverlay"]["style"][] = ["smart", "pure", "mono", "warm"];
const peekKeys: Settings["peekKey"][] = ["Alt", "Shift", "none"];

function setDarkFrom(e: Event): void {
  if (!settings.value) return;
  settings.value.activation.schedule = {
    darkFrom: (e.target as HTMLInputElement).value,
    darkTo: settings.value.activation.schedule?.darkTo ?? "07:30",
  };
  void save();
}
function setDarkTo(e: Event): void {
  if (!settings.value) return;
  settings.value.activation.schedule = {
    darkFrom: settings.value.activation.schedule?.darkFrom ?? "20:00",
    darkTo: (e.target as HTMLInputElement).value,
  };
  void save();
}

function setCustomUiColor(key: "surface" | "text" | "accent", e: Event): void {
  if (!settings.value) return;
  const value = (e.target as HTMLInputElement).value;
  settings.value.ui.customUiColors = {
    surface: settings.value.ui.customUiColors?.surface ?? "#2b2d31",
    text: settings.value.ui.customUiColors?.text ?? "#e6e3dc",
    accent: settings.value.ui.customUiColors?.accent ?? "#8ab4f8",
    [key]: value,
  };
  void save();
}

function addSiteRule(): void {
  if (!settings.value) return;
  settings.value.siteRules.push({ pattern: "" });
  void save();
}
function removeSiteRule(i: number): void {
  if (!settings.value) return;
  settings.value.siteRules.splice(i, 1);
  void save();
}

// --- Full-settings import/export, distinct from the theme-only one in ThemeEditor. ---
const importError = ref("");
function exportSettings(): void {
  if (!settings.value) return;
  const blob = new Blob([JSON.stringify(settings.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "noctpdf-settings.json";
  a.click();
  URL.revokeObjectURL(url);
}
async function importSettings(e: Event): Promise<void> {
  importError.value = "";
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !settings.value) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const { settings: next, resetSections } = parseSettings(parsed);
    settings.value = next;
    await save();
    if (resetSections.length) importError.value = t("dataImportPartial", resetSections.join(", "));
  } catch {
    importError.value = t("dataImportError");
  }
}

const manifest = computed(() => browser.runtime.getManifest());
</script>

<template>
  <div v-if="settings" class="options">
    <nav class="sidebar">
      <h1>NoctPDF</h1>
      <button
        v-for="s in SECTIONS"
        :key="s"
        type="button"
        class="nav-item"
        :class="{ active: section === s }"
        @click="section = s"
      >
        {{ t(`section_${s}`) }}
      </button>
    </nav>

    <main class="content">
      <section v-if="section === 'general'">
        <h2>{{ t("section_general") }}</h2>
        <label class="row">
          <input v-model="settings.enabled" type="checkbox" data-test="enabled" @change="save" />
          {{ t("generalEnabled") }}
        </label>
        <fieldset :disabled="!settings.enabled">
          <legend>{{ t("engineLabel") }}</legend>
          <label v-for="e in ['enhanced', 'native-overlay', 'off'] as const" :key="e" class="choice">
            <input v-model="settings.engine" type="radio" name="engine" :value="e" @change="save" />
            {{ t(`engine_${e.replace("-", "_")}`) }}
          </label>
        </fieldset>
        <fieldset>
          <legend>{{ t("generalActivation") }}</legend>
          <label v-for="m in ['always', 'follow-system', 'schedule'] as const" :key="m" class="choice">
            <input v-model="settings.activation.mode" type="radio" name="activation" :value="m" @change="save" />
            {{ t(`activation_${m.replace("-", "_")}`) }}
          </label>
          <div v-if="settings.activation.mode === 'schedule'" class="schedule">
            <label>
              <span>{{ t("activationFrom") }}</span>
              <input :value="settings.activation.schedule?.darkFrom ?? '20:00'" type="time" @change="setDarkFrom" />
            </label>
            <label>
              <span>{{ t("activationTo") }}</span>
              <input :value="settings.activation.schedule?.darkTo ?? '07:30'" type="time" @change="setDarkTo" />
            </label>
          </div>
        </fieldset>
        <label class="row">
          <input v-model="settings.rememberPerDocument" type="checkbox" @change="save" />
          {{ t("generalRememberPerDocument") }}
        </label>
        <label class="row">
          <input v-model="settings.print.useTheme" type="checkbox" @change="save" />
          {{ t("generalPrintUseTheme") }}
        </label>
        <fieldset>
          <legend>{{ t("generalPeekKey") }}</legend>
          <label v-for="k in peekKeys" :key="k" class="choice">
            <input v-model="settings.peekKey" type="radio" name="peekKey" :value="k" @change="save" />
            {{ k === "none" ? t("none") : k }}
          </label>
        </fieldset>
      </section>

      <section v-else-if="section === 'theme'">
        <h2>{{ t("section_theme") }}</h2>
        <ThemeEditor v-model:settings="settings" @save="save" />
        <h3>{{ t("tuningTitle") }}</h3>
        <div class="sliders">
          <label>
            <span>{{ t("tuningBrightness") }}</span>
            <input
              v-model.number="settings.tuning.brightness"
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              @change="save"
            />
          </label>
          <label>
            <span>{{ t("tuningContrast") }}</span>
            <input
              v-model.number="settings.tuning.contrast"
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              @change="save"
            />
          </label>
          <label>
            <span>{{ t("tuningGamma") }}</span>
            <input v-model.number="settings.tuning.gamma" type="range" min="0.5" max="2" step="0.01" @change="save" />
          </label>
          <label>
            <span>{{ t("tuningSaturation") }}</span>
            <input
              v-model.number="settings.tuning.saturation"
              type="range"
              min="0"
              max="2"
              step="0.01"
              @change="save"
            />
          </label>
          <label>
            <span>{{ t("tuningWarmth") }}</span>
            <input v-model.number="settings.tuning.warmth" type="range" min="-1" max="1" step="0.01" @change="save" />
          </label>
          <label>
            <span>{{ t("tuningMinContrast") }}</span>
            <input
              v-model.number="settings.tuning.minTextContrast"
              type="range"
              min="1"
              max="21"
              step="0.1"
              @change="save"
            />
          </label>
        </div>
        <label class="row">
          <input v-model="settings.tuning.recolorVectors" type="checkbox" @change="save" />
          <span>{{ t("tuningRecolorVectors") }}</span>
        </label>
        <label class="row">
          <input v-model="settings.tuning.preserveSemanticHues" type="checkbox" @change="save" />
          <span>{{ t("tuningPreserveSemanticHues") }}</span>
        </label>
      </section>

      <section v-else-if="section === 'images'">
        <h2>{{ t("section_images") }}</h2>
        <fieldset>
          <legend>{{ t("imagesMode") }}</legend>
          <label v-for="m in imagesModes" :key="m" class="choice">
            <input v-model="settings.images.mode" type="radio" name="imagesMode" :value="m" @change="save" />
            {{ t(`imagesMode_${m}`) }}
          </label>
        </fieldset>
        <label class="row">
          <span>{{ t("imagesDimLevel") }}</span>
          <input v-model.number="settings.images.dimLevel" type="range" min="0.3" max="1" step="0.01" @change="save" />
          <span>{{ Math.round(settings.images.dimLevel * 100) }}%</span>
        </label>
        <fieldset>
          <legend>{{ t("imagesScannedPages") }}</legend>
          <label class="choice">
            <input
              v-model="settings.images.scannedPages"
              type="radio"
              name="scannedPages"
              value="recolor"
              @change="save"
            />
            {{ t("imagesScannedPages_recolor") }}
          </label>
          <label class="choice">
            <input
              v-model="settings.images.scannedPages"
              type="radio"
              name="scannedPages"
              value="keep"
              @change="save"
            />
            {{ t("imagesScannedPages_keep") }}
          </label>
        </fieldset>
        <label class="row">
          <span>{{ t("imagesScanThreshold") }}</span>
          <input
            v-model.number="settings.images.scanDetectionThreshold"
            type="range"
            min="0.5"
            max="1"
            step="0.01"
            @change="save"
          />
          <span>{{ Math.round(settings.images.scanDetectionThreshold * 100) }}%</span>
        </label>
      </section>

      <section v-else-if="section === 'interface'">
        <h2>{{ t("section_interface") }}</h2>
        <fieldset>
          <legend>{{ t("uiSkin") }}</legend>
          <label v-for="s in skins" :key="s" class="choice">
            <input v-model="settings.ui.skin" type="radio" name="skin" :value="s" @change="save" />
            {{ t(`uiSkin_${s}`) }}
          </label>
        </fieldset>
        <fieldset :disabled="settings.ui.skin !== 'enhanced'">
          <legend>{{ t("uiColorSource") }}</legend>
          <label v-for="c in colorSources" :key="c" class="choice">
            <input v-model="settings.ui.colorSource" type="radio" name="colorSource" :value="c" @change="save" />
            {{ t(`uiColorSource_${c}`) }}
          </label>
          <div v-if="settings.ui.colorSource === 'custom'" class="custom-ui-colors">
            <label>
              <span>{{ t("uiCustomSurface") }}</span>
              <input
                :value="settings.ui.customUiColors?.surface ?? '#2b2d31'"
                type="color"
                @input="setCustomUiColor('surface', $event)"
              />
            </label>
            <label>
              <span>{{ t("uiCustomText") }}</span>
              <input
                :value="settings.ui.customUiColors?.text ?? '#e6e3dc'"
                type="color"
                @input="setCustomUiColor('text', $event)"
              />
            </label>
            <label>
              <span>{{ t("uiCustomAccent") }}</span>
              <input
                :value="settings.ui.customUiColors?.accent ?? '#8ab4f8'"
                type="color"
                @input="setCustomUiColor('accent', $event)"
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ t("uiDensity") }}</legend>
          <label v-for="d in densities" :key="d" class="choice">
            <input v-model="settings.ui.density" type="radio" name="density" :value="d" @change="save" />
            {{ t(`uiDensity_${d}`) }}
          </label>
        </fieldset>
        <label class="row">
          <input v-model="settings.ui.autoHideToolbar" type="checkbox" @change="save" />
          <span>{{ t("uiAutoHideToolbar") }}</span>
        </label>
        <label class="row">
          <input v-model="settings.ui.animations" type="checkbox" @change="save" />
          <span>{{ t("uiAnimations") }}</span>
        </label>
      </section>

      <section v-else-if="section === 'interception'">
        <h2>{{ t("section_interception") }}</h2>
        <label v-for="k in interceptionSwitches" :key="k" class="row">
          <input v-model="settings.interception[k]" type="checkbox" :data-test="k" @change="save" />
          {{ t(`interception_${k}`) }}
        </label>
      </section>

      <section v-else-if="section === 'native'">
        <h2>{{ t("section_native") }}</h2>
        <p class="note">{{ t("nativeNote") }}</p>
        <fieldset>
          <legend>{{ t("nativeStyle") }}</legend>
          <label v-for="s in nativeStyles" :key="s" class="choice">
            <input v-model="settings.nativeOverlay.style" type="radio" name="nativeStyle" :value="s" @change="save" />
            {{ t(`nativeStyle_${s}`) }}
          </label>
        </fieldset>
        <label class="row">
          <input v-model="settings.nativeOverlay.coverToolbar" type="checkbox" @change="save" />
          <span>{{ t("nativeCoverToolbar") }}</span>
        </label>
      </section>

      <section v-else-if="section === 'siteRules'">
        <h2>{{ t("section_siteRules") }}</h2>
        <p class="note">{{ t("siteRulesNote") }}</p>
        <div v-for="(rule, i) in settings.siteRules" :key="i" class="site-rule">
          <input v-model="rule.pattern" type="text" :placeholder="t('siteRulesPattern')" @change="save" />
          <select v-model="rule.disabled" @change="save">
            <option :value="undefined">{{ t("siteRulesEnabled") }}</option>
            <option :value="true">{{ t("siteRulesDisabled") }}</option>
          </select>
          <button type="button" @click="removeSiteRule(i)">{{ t("siteRulesRemove") }}</button>
        </div>
        <button type="button" @click="addSiteRule">{{ t("siteRulesAdd") }}</button>
      </section>

      <section v-else-if="section === 'data'">
        <h2>{{ t("section_data") }}</h2>
        <div class="import-export">
          <button type="button" @click="exportSettings">{{ t("dataExport") }}</button>
          <label class="file-button">
            {{ t("dataImport") }}
            <input type="file" accept="application/json" @change="importSettings" />
          </label>
        </div>
        <p v-if="importError" class="error">{{ importError }}</p>
      </section>

      <section v-else-if="section === 'about'">
        <h2>{{ t("section_about") }}</h2>
        <dl v-if="diag" data-test="diagnostics">
          <dt>{{ t("diagExtension") }}</dt>
          <dd>{{ diag.extensionVersion }}</dd>
          <dt>{{ t("diagBrowser") }}</dt>
          <dd>{{ diag.userAgent }}</dd>
          <dt>{{ t("diagResponseHeaders") }}</dt>
          <dd>{{ diag.responseHeadersCondition ? t("yes") : t("diagResponseHeadersMissing") }}</dd>
          <dt>{{ t("diagFileAccess") }}</dt>
          <dd>{{ diag.fileSchemeAccess ? t("yes") : t("diagFileAccessMissing") }}</dd>
          <dt>{{ t("diagRules") }}</dt>
          <dd>{{ diag.dynamicRuleCount }} / {{ diag.sessionRuleCount }}</dd>
          <dt>PDF.js</dt>
          <dd>{{ diag.pdfjs ? `${diag.pdfjs.version} (${diag.pdfjs.commit.slice(0, 10)})` : "?" }}</dd>
          <dt>{{ t("diagLastPdf") }}</dt>
          <dd>
            <template v-if="diag.lastInterception">
              <code>{{ diag.lastInterception.url }}</code>
              <br />{{ diag.lastInterception.reason }}
            </template>
            <template v-else>{{ t("none") }}</template>
          </dd>
        </dl>
        <button type="button" @click="refresh">{{ t("refresh") }}</button>
        <p class="about-credits">
          {{ manifest.name }} {{ manifest.version }} —
          <a href="https://github.com/MrGautier256/NoctPDF" target="_blank" rel="noreferrer">GitHub</a>
        </p>
      </section>
    </main>
  </div>
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
  background: #17181a;
  color: #e6e3dc;
  font:
    14px/1.5 system-ui,
    sans-serif;
}
.options {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 190px;
  flex: none;
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid var(--border);
}
.sidebar h1 {
  font-size: 16px;
  margin: 4px 8px 12px;
}
.nav-item {
  text-align: left;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.nav-item:hover {
  background: #2b2d31;
}
.nav-item.active {
  background: var(--accent);
  color: #10131c;
  font-weight: 600;
}
.content {
  flex: 1;
  max-width: 760px;
  padding: 24px 32px;
}
.content h2 {
  margin-top: 0;
}
.note {
  color: var(--muted);
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 4px 0;
}
fieldset {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin: 12px 0;
  display: grid;
  gap: 4px;
}
legend {
  color: var(--muted);
  padding: 0 4px;
}
.choice {
  display: flex;
  gap: 6px;
  align-items: center;
}
.schedule {
  display: flex;
  gap: 16px;
  margin-top: 6px;
}
.sliders {
  display: grid;
  gap: 8px;
  margin: 8px 0 12px;
}
.sliders label {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 8px;
}
.custom-ui-colors {
  display: flex;
  gap: 16px;
  padding: 8px 4px 4px;
}
.custom-ui-colors label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.custom-ui-colors input {
  width: 44px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.site-rule {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.site-rule input[type="text"] {
  flex: 1;
  font: inherit;
  color: inherit;
  background: #2b2d31;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.about-credits {
  color: var(--muted);
  font-size: 12px;
}
button {
  font: inherit;
  color: inherit;
  background: #2b2d31;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
select {
  font: inherit;
  color: inherit;
  background: #2b2d31;
  border: 1px solid var(--border);
  border-radius: 6px;
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
  border: 1px solid var(--border);
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
