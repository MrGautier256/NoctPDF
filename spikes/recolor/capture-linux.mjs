// Phase 2 capture script for a Linux sandbox without the Windows browsers
// run.mjs expects: uses the Playwright-bundled Chromium instead. Captures
// the three backlog fixes that needed before/after evidence (grey ramp +
// orange triangle, scanned page levels stretch, hyperref-style link border).
// Usage: node recolor/capture-linux.mjs [outDir] [chromiumPath]
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const outDir = new URL(`${process.argv[2] ?? "../out/phase2"}/`, import.meta.url);
mkdirSync(fileURLToPath(outDir), { recursive: true });
const P = name => fileURLToPath(new URL(name, outDir));

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/recolor/index.html`;

const browser = await puppeteer.launch({
  executablePath: process.argv[3] ?? "/opt/pw-browsers/chromium",
  headless: true,
  args: ["--no-sandbox", "--window-size=1200,1500"],
});
const settle = ms => new Promise(r => setTimeout(r, ms));

async function open(query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.log("pageerror", query, e.message));
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__results?.ready, { timeout: 60000 });
  await page.waitForFunction(() => Object.keys(window.__results.pages).length >= 1, { timeout: 60000 });
  await settle(1500);
  return page;
}

for (const mode of ["shader", "hook"]) {
  const page = await open(`mode=${mode}&file=../fixtures/sample.pdf&scale=1.25`);
  await page.screenshot({ path: P(`recolor-${mode}-fixed.png`) });
  await page.evaluate(() => {
    window.__viewer.currentPageNumber = 2;
  });
  await settle(1500);
  await page.screenshot({ path: P(`recolor-${mode}-scan-fixed.png`) });
  await page.close();
}

{
  const page = await open("mode=shader&file=../fixtures/link-border.pdf&scale=2");
  await settle(1500); // the annotation layer renders slightly after the first pagerendered
  await page.screenshot({ path: P("recolor-linkborder-fixed.png") });
  await page.close();
}
{
  const page = await open("mode=none&file=../fixtures/link-border.pdf&scale=2");
  await settle(1500);
  await page.screenshot({ path: P("recolor-linkborder-before.png") });
  await page.close();
}

await browser.close();
server.close();
console.log(`captures written to ${fileURLToPath(outDir)}`);
