import { ref, toRaw, type Ref } from "vue";
import { storage } from "../../platform";
import type { Settings } from "../../settings/schema";
import { isSettingsChange, readSettings, writeSettings } from "../../settings/storage";

/** Reactive settings for extension pages; `save` persists the whole object. */
export function useSettings(): { settings: Ref<Settings | null>; save: () => Promise<void> } {
  const settings = ref<Settings | null>(null);
  const load = async () => (settings.value = (await readSettings(storage.sync())).settings);
  void load();
  storage.onChanged.addListener((changes, area) => {
    if ((area === "sync" || area === "local") && isSettingsChange(Object.keys(changes))) void load();
  });
  return {
    settings,
    save: async () => {
      if (settings.value) await writeSettings(storage.sync(), structuredClone(toRaw(settings.value)));
    },
  };
}
