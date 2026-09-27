// Drives the recolor harness in the installed Chrome and dumps screenshots and
// timings to spikes/out/recolor/. Usage: node recolor/run.mjs [--headful]
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const outDir = new URL("../out/recolor/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const P = (name, dir) => fileURLToPath(new URL(name, dir));
const headful = process.argv.includes("--headful");
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/recolor/index.html`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !headful,
  args: ["--window-size=1200,1500", "--window-position=0,0"],
});
const summary = {};
const settle = ms => new Promise(r => setTimeout(r, ms));

async function open(query, dpr = 1) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: dpr });
  page.on("pageerror", e => console.log("pageerror", query, e.message));
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__results?.ready, { timeout: 60000 });
  await page.waitForFunction(() => Object.keys(window.__results.pages).length >= 1, { timeout: 60000 });
  await settle(1500);
  return page;
}

const files = {
  sample: "../fixtures/sample.pdf",
  arxiv: "../fixtures/arxiv-1706.03762.pdf",
  tracemonkey: "../fixtures/tracemonkey.pdf",
};

// 1. Pipeline probe (no recolor): what draws where.
{
  const page = await open(`mode=none&probe=1&file=${files.sample}`);
  summary.probe = await page.evaluate(() => ({ probe: window.__results.probe, workers: window.__results.workers }));
  await page.close();
}

// 2. Screens + timings per approach and file.
for (const [fname, f] of Object.entries(files)) {
  for (const mode of ["none", "hook", "shader"]) {
    for (const dpr of [1, 2]) {
      const scale = fname === "sample" ? 1.25 : 1;
      const page = await open(`mode=${mode}&file=${f}&scale=${scale}`, dpr);
      if (dpr === 1) await page.screenshot({ path: P(`${fname}-${mode}.png`, outDir) });
      const res = await page.evaluate(() => window.__results);
      const key = `${fname}/${mode}/dpr${dpr}`;
      summary[key] = {
        renderer: res.renderer,
        lutMs: res.lutMs,
        pages: Object.fromEntries(Object.entries(res.pages).map(([k, v]) => [k, v.renders])),
        classify: res.classify,
        errors: res.errors,
      };
      if (mode !== "none" && dpr === 1) {
        summary[key].switchTheme = await page.evaluate(() => window.__switchTheme("sepia"));
        await settle(300);
        await page.screenshot({ path: P(`${fname}-${mode}-sepia.png`, outDir) });
      }
      if (mode === "shader" && fname === "sample" && dpr === 1) {
        await page.evaluate(() => { window.__switchTheme("dark"); window.__split = 0.5; window.__peek(false); });
        await page.screenshot({ path: P(`${fname}-compare.png`, outDir) });
        await page.evaluate(() => { window.__split = 0; window.__peek(false); });
        // Zoom far in: detail canvas path.
        await page.evaluate(() => (window.__viewer.currentScaleValue = "4"));
        await settle(2500);
        await page.screenshot({ path: P(`${fname}-shader-zoom400.png`, outDir) });
        summary[`${key}/zoom400`] = await page.evaluate(() => window.__results.pages[1]?.renders.slice(-3));
        // Scroll to page 2 (scan).
        await page.evaluate(() => {
          window.__viewer.currentScaleValue = "1";
          window.__viewer.currentPageNumber = 2;
        });
        await settle(2000);
        await page.screenshot({ path: P(`${fname}-shader-scan.png`, outDir) });
      }
      await page.close();
    }
  }
}

writeFileSync(new URL("summary.json", outDir), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1).slice(0, 6000));
await browser.close();
server.close();
