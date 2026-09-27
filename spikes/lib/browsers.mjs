// Installed Chromium browsers on this machine, and a launcher that loads an
// unpacked extension. Branded Chrome ignores --load-extension since 137, so
// extensions go through the CDP Extensions.loadUnpacked method (pipe only).
import puppeteer from "puppeteer-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAD = process.env.LOCALAPPDATA;
export const BROWSERS = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  edge: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  opera: `${LAD}/Programs/Opera GX/136.0.6008.67/opera.exe`,
};

export async function launchWithExtension(name, extPath, { headless = true, args = [] } = {}) {
  const browser = await puppeteer.launch({
    executablePath: BROWSERS[name],
    headless,
    pipe: true,
    enableExtensions: true,
    userDataDir: mkdtempSync(join(tmpdir(), `noct-${name}-`)),
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1200,1000", ...args],
  });
  const id = await browser.installExtension(extPath);
  return { browser, id, version: await browser.version() };
}
