// Playwright fixtures: Chromium with the built extension (.output/chrome-mv3).
// Branded Chrome ignores --load-extension since 137; Playwright's own Chromium
// still honors it (test/browsers/ covers the installed Chrome, Opera and Edge).
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { resolve } from "node:path";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { Settings } from "../../src/settings/schema";
import { SETTINGS_PREFIX, splitIntoChunks } from "../../src/settings/storage";
import { startServer, type TestServer } from "./server";

export const EXTENSION_DIR = resolve(import.meta.dirname, "..", "..", ".output", "chrome-mv3");

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  viewerBase: string;
  /** Address the viewer shows for a PDF: <ext>/<pdf url>. */
  readable: (pdfUrl: string) => string;
  setSettings: (patch: (s: Settings) => void) => Promise<void>;
}

export const test = base.extend<Fixtures, { server: TestServer }>({
  server: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixture's parameter pattern
    async ({}, use) => {
      const server = await startServer();
      await use(server);
      await server.close();
    },
    { scope: "worker" },
  ],
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixture's parameter pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
      acceptDownloads: true,
      viewport: { width: 1100, height: 900 },
    });
    await use(context);
    await context.close();
  },
  // Automatic: every test waits for the rules before navigating.
  sw: [
    async ({ context }, use) => {
      const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      // The dynamic rules are registered on install: wait for them.
      await expect
        .poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length))
        .toBeGreaterThan(0);
      await use(sw);
    },
    { auto: true },
  ],
  extensionId: async ({ sw }, use) => use(new URL(sw.url()).host),
  viewerBase: async ({ extensionId }, use) => use(`chrome-extension://${extensionId}/content/web/viewer.html`),
  readable: async ({ extensionId }, use) => use(pdfUrl => `chrome-extension://${extensionId}/${pdfUrl}`),
  setSettings: async ({ sw }, use) => {
    await use(async patch => {
      const settings = structuredClone(DEFAULT_SETTINGS);
      patch(settings);
      const chunks = splitIntoChunks(JSON.stringify(settings));
      const items: Record<string, unknown> = { [`${SETTINGS_PREFIX}.meta`]: { chunks: chunks.length } };
      chunks.forEach((c, i) => (items[`${SETTINGS_PREFIX}.${i}`] = c));
      await sw.evaluate(i => chrome.storage.sync.set(i), items);
      // Rules are rebuilt from storage.onChanged: let it settle.
      await sw.evaluate(() => new Promise(r => setTimeout(r, 300)));
    });
  },
});

export { expect };

/** Waits for the viewer layer to report a rendered first page. */
export async function waitForViewer(page: Page): Promise<NonNullable<Window["__noctpdf"]>> {
  await expect
    .poll(() => page.evaluate(() => window.__noctpdf?.pagesRendered ?? 0), { timeout: 20_000 })
    .toBeGreaterThan(0);
  return page.evaluate(() => window.__noctpdf!);
}
