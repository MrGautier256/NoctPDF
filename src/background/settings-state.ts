import { storage } from "../platform";
import type { Settings } from "../settings/schema";
import { isSettingsChange, readSettings } from "../settings/storage";

let cached: Promise<Settings> | null = null;

/** Current settings, read once per service worker lifetime and on change. */
export function getSettings(): Promise<Settings> {
  cached ??= readSettings(storage.sync()).then(r => {
    if (r.resetSections.length) console.warn("NoctPDF: invalid settings sections reset:", r.resetSections);
    return r.settings;
  });
  return cached;
}

/** Must be called synchronously at service worker start (MV3 listener rule). */
export function onSettingsChanged(listener: (s: Settings) => void): void {
  storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" && areaName !== "local") return;
    if (!isSettingsChange(Object.keys(changes))) return;
    cached = null;
    void getSettings().then(listener);
  });
}
