import { browser } from "../../platform";

/** chrome.i18n message, falling back to the key so a missing string is visible. */
export const t = (key: string, substitutions?: string | string[]): string =>
  (browser.i18n.getMessage as (k: string, s?: string | string[]) => string)(key, substitutions) || key;
