// Phase 2 performance measurement: theme-switch time against the <200ms
// acceptance criterion, measured (not estimated) on this sandbox's Chromium.
import puppeteer from "puppeteer-core";
import { startServer } from "../server.mjs";

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/recolor/index.html`;
const browser = await puppeteer.launch({
  executablePath: process.argv[2] ?? "/opt/pw-browsers/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 1 });
await page.goto(`${base}?mode=shader&file=../fixtures/sample.pdf&scale=1.25`);
await page.waitForFunction(() => window.__results?.ready, { timeout: 60000 });
await page.waitForFunction(() => Object.keys(window.__results.pages).length >= 1, { timeout: 60000 });
await new Promise(r => setTimeout(r, 1000));

const runs = [];
for (const theme of ["sepia", "dark", "sepia", "dark"]) {
  const r = await page.evaluate(id => window.__switchTheme(id), theme);
  runs.push(r);
}
console.log(JSON.stringify(runs, null, 2));
await browser.close();
server.close();
