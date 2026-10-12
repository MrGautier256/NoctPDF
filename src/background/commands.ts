// Keyboard shortcuts (manifest `commands`): a quick toggle and a theme cycle,
// for the two actions a user is most likely to want without opening the popup.
import { browser, storage } from "../platform";
import { THEME_PRESETS } from "../settings/presets";
import { writeSettings } from "../settings/storage";
import { getSettings } from "./settings-state";

async function toggleEnabled(): Promise<void> {
  const s = await getSettings();
  await writeSettings(storage.sync(), { ...s, enabled: !s.enabled });
}

async function cycleTheme(): Promise<void> {
  const s = await getSettings();
  const i = THEME_PRESETS.findIndex(p => p.id === s.theme.presetId);
  const next = THEME_PRESETS[(i + 1) % THEME_PRESETS.length]!;
  await writeSettings(storage.sync(), { ...s, theme: { ...next.theme, presetId: next.id } });
}

export function registerCommands(): void {
  browser.commands.onCommand.addListener(command => {
    if (command === "toggle-enabled") void toggleEnabled();
    else if (command === "cycle-theme") void cycleTheme();
  });
}
