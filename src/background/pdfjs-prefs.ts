// PDF.js (chromium build) reads its preferences from the root of
// storage.sync before initializing: writing them there is how we configure
// the viewer without patching it.
import { storage } from "../platform";
import type { Settings } from "../settings/schema";

/**
 * Keeps PDF.js' CanvasImagesTracker on (image rectangles for the recolorer)
 * while creating no right-click placeholders in the text layer, since every
 * image is smaller than this minimum. Placeholders degrade text selection in
 * Chrome, which is why PDF.js disables the feature outside Firefox.
 */
export const IMAGES_TRACKER_MIN_SIZE = 999_999_999;

export function pdfjsPreferences(settings: Settings): Record<string, number> {
  return {
    imagesRightClickMinSize: IMAGES_TRACKER_MIN_SIZE,
    // 0 follows the system, 2 forces the dark UI.
    viewerCssTheme: settings.ui.colorSource === "system" ? 0 : 2,
  };
}

export async function syncPdfjsPreferences(settings: Settings): Promise<void> {
  const area = storage.sync();
  const wanted = pdfjsPreferences(settings);
  const current = await area.get(Object.keys(wanted));
  const changed = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => current[k] !== v));
  if (Object.keys(changed).length) await area.set(changed);
}
