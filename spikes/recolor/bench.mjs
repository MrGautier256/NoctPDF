// Stage timings for the shader recolorer, CPU vs GPU page canvases, DPR 1 and 2.
import puppeteer from "puppeteer-core";
import { startServer } from "../server.mjs";
const { server, port } = await startServer();
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const out = {};
for (const hwa of ["0", "1"]) for (const dpr of [1, 2]) for (const f of ["sample.pdf", "tracemonkey.pdf"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: dpr });
  await page.goto(`http://127.0.0.1:${port}/recolor/index.html?mode=shader&hwa=${hwa}&file=../fixtures/${f}&scale=1.25`);
  await page.waitForFunction(() => window.__results?.ready && Object.keys(window.__results.pages).length >= 2, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  out[`${f} hwa=${hwa} dpr=${dpr}`] = await page.evaluate(() => window.__bench());
  await page.close();
}
console.table(out); console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.lutBuildMs]))));
await browser.close(); server.close();
