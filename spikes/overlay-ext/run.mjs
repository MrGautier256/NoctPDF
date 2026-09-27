// Engine B matrix: screenshots of each overlay variant on the native viewer,
// plus the native toolbar height read from the viewer's internal frame.
// Usage: node overlay-ext/run.mjs chrome|opera|edge [--headful]
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";
import { launchWithExtension } from "../lib/browsers.mjs";

const name = process.argv[2] ?? "chrome";
const headless = !process.argv.includes("--headful");
const variants = (process.argv.find(a => a.startsWith("--variants="))?.slice(11) ?? "none,backdrop,backdrop-svg,blend,blend-colors,embed-filter").split(",");
const inset = process.argv.find(a => a.startsWith("--inset="))?.slice(8);
const outDir = new URL(`../out/overlay/${name}${headless ? "" : "-headful"}${inset ? `-inset${inset}` : ""}/`, import.meta.url);
mkdirSync(outDir, { recursive: true });
const P = f => fileURLToPath(new URL(f, outDir));
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const { browser, version } = await launchWithExtension(name, fileURLToPath(new URL(".", import.meta.url)), { headless });
const settle = ms => new Promise(r => setTimeout(r, ms));
const result = { browser: name, version, headless, variants: {} };

for (const v of variants) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/fixtures/sample.pdf?noct=${v.replace('+once', '')}${v.endsWith('+once') ? '&once=1' : ''}${inset ? `&inset=${inset}` : ''}`).catch(e => (result.variants[v] = { navError: e.message }));
  await settle(4000);
  await page.screenshot({ path: P(`${v}.png`) });
  const info = { frames: page.frames().map(f => f.url()) };
  info.overlayLayers = await page.evaluate(() => document.querySelectorAll("[data-noct]").length).catch(e => String(e));
  info.contentType = await page.evaluate(() => document.contentType).catch(() => null);
  // Toolbar geometry from the internal viewer frame (readable through CDP only).
  for (const f of page.frames()) {
    if (!f.url().startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/")) continue;
    info.toolbar = await f.evaluate(() => {
      const find = (root, sel) => {
        const hit = root.querySelector(sel);
        if (hit) return hit;
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            const r = find(el.shadowRoot, sel);
            if (r) return r;
          }
        }
        return null;
      };
      const tb = find(document, "viewer-toolbar") ?? find(document, "#toolbar");
      const r = tb?.getBoundingClientRect();
      return { tag: tb?.tagName, top: r?.top, height: r?.height, bodyBg: getComputedStyle(document.body).backgroundColor, dpr: devicePixelRatio };
    }).catch(e => String(e));
  }
  result.variants[v] = { ...(result.variants[v] ?? {}), ...info };
  await page.close();
}
writeFileSync(P("result.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await browser.close();
server.close();
