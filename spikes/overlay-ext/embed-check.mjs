// Is the legacy embed filter actually set, and what does the PDF document look like?
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";
import { launchWithExtension } from "../lib/browsers.mjs";
const { server, port } = await startServer();
const { browser } = await launchWithExtension(process.argv[2] ?? "chrome", fileURLToPath(new URL(".", import.meta.url)));
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/fixtures/sample.pdf?noct=embed-filter`);
await new Promise(r => setTimeout(r, 3000));
console.log(await page.evaluate(() => ({
  html: document.documentElement.outerHTML.slice(0, 600),
  embedFilter: document.querySelector("embed")?.style.filter,
  computed: document.querySelector("embed") && getComputedStyle(document.querySelector("embed")).filter,
})));
await browser.close(); server.close();
