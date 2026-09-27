<script setup lang="ts">
// Provisional options page (phase 1): interception switches and diagnostics.
// The full page with every section comes in phase 3.
import { onMounted, ref } from "vue";
import type { Diagnostics } from "../../shared/messages";
import type { Settings } from "../../settings/schema";
import { t } from "../shared/i18n";
import { send } from "../shared/messaging";
import { useSettings } from "../shared/use-settings";

const { settings, save } = useSettings();
const diag = ref<Diagnostics | null>(null);
const refresh = async () => (diag.value = await send({ type: "noct:getDiagnostics" }));
onMounted(refresh);

const switches: (keyof Settings["interception"])[] = [
  "httpPdfs",
  "localFiles",
  "embeddedPdfs",
  "respectAttachmentDownloads",
];
</script>

<template>
  <main v-if="settings" class="options">
    <h1>NoctPDF</h1>
    <p class="note">{{ t("optionsProvisional") }}</p>

    <section>
      <h2>{{ t("sectionInterception") }}</h2>
      <label v-for="k in switches" :key="k" class="row">
        <input v-model="settings.interception[k]" type="checkbox" :data-test="k" @change="save" />
        {{ t(`interception_${k}`) }}
      </label>
    </section>

    <section>
      <h2>{{ t("sectionDiagnostics") }}</h2>
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
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
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
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px;
}
.note {
  color: #a9a59c;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 4px 0;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
}
dt {
  color: #a9a59c;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
button {
  font: inherit;
  color: inherit;
  background: #2b2d31;
  border: 1px solid #3a3b3f;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
