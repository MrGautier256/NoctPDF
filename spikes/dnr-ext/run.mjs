// DNR interception matrix. Usage: node dnr-ext/run.mjs chrome|opera|edge [--headful]
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server.mjs";
import { launchWithExtension } from "../lib/browsers.mjs";

const name = process.argv[2] ?? "chrome";
const headless = !process.argv.includes("--headful");
const extPath = fileURLToPath(new URL(".", import.meta.url));
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const result = { browser: name, headless, cases: {} };
const settle = ms => new Promise(r => setTimeout(r, ms));
const outDir = new URL("../out/dnr/", import.meta.url);
mkdirSync(outDir, { recursive: true });

let browser, id;
try {
  ({ browser, id, version: result.version } = await launchWithExtension(name, extPath, { headless }));
} catch (e) {
  result.launchError = String(e.message ?? e);
  console.log(JSON.stringify(result, null, 1));
  result.matches = (await sw.evaluate(() => globalThis.__matches)).map(m => ({ ...m, url: m.url.replace(base, "") }));
writeFileSync(new URL(`${name}${headless ? "" : "-headful"}.json`, outDir), JSON.stringify(result, null, 1));
  server.close();
  process.exit(0);
}
const viewerPrefix = `chrome-extension://${id}/viewer.html`;
const swTarget = await browser.waitForTarget(
  t => t.type() === "service_worker" && t.url().startsWith(`chrome-extension://${id}/`),
  { timeout: 15000 },
);
const sw = await swTarget.worker();
result.status = await sw.evaluate(() => globalThis.__status());

const downloads = [];
const cdp = await browser.target().createCDPSession();
const dlDir = mkdtempSync(join(tmpdir(), "noct-dl-"));
await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: dlDir, eventsEnabled: true });
cdp.on("Browser.downloadWillBegin", e => downloads.push(e.url));

async function nav(label, url, { expect }) {
  const page = await browser.newPage();
  const before = downloads.length;
  let navError = null;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 15000 });
  } catch (e) {
    navError = String(e.message).split("\n")[0];
  }
  await settle(1200);
  const finalUrl = page.url();
  const frames = page.frames().map(f => f.url()).filter(u => u && u !== "about:blank");
  let contentType = null, viewer = null;
  try { contentType = await page.evaluate(() => document.contentType); } catch {}
  if (finalUrl.startsWith(viewerPrefix)) {
    try {
      await page.waitForFunction(() => window.__viewer?.done, { timeout: 8000 });
      viewer = await page.evaluate(() => window.__viewer);
    } catch {}
  }
  const iframeViewer = frames.some(u => u.startsWith(viewerPrefix));
  const outcome = finalUrl.startsWith(viewerPrefix) ? "redirected"
    : downloads.length > before ? "downloaded"
    : iframeViewer ? "iframe-redirected"
    : contentType === "application/pdf" ? "native-pdf" : `other(${contentType})`;
  result.cases[label] = {
    outcome, expect, ok: expect.split("|").includes(outcome) && (outcome !== "redirected" || viewer?.magic === "%PDF-"),
    finalUrl: finalUrl.replace(base, ""), navError,
    viewer: viewer && { raw: viewer.raw?.replace(base, ""), status: viewer.status, bytes: viewer.bytes, magic: viewer.magic, error: viewer.error },
    frames: frames.map(u => u.replace(base, "")),
  };
  await page.close();
}

await nav("pdf (application/pdf) + #page=2", `${base}/fixtures/sample.pdf#page=2`, { expect: "redirected" });
await nav("no .pdf extension (arxiv-like)", `${base}/case/no-extension/1706.03762`, { expect: "redirected" });
await nav("octet-stream + .pdf path", `${base}/case/octet/report.pdf`, { expect: "redirected" });
await nav("octet-stream + disposition filename", `${base}/case/octet-disposition/download?id=7`, { expect: "redirected" });
await nav("pdf; charset param", `${base}/case/pdf-charset`, { expect: "redirected" });
await nav("attachment (respect=true)", `${base}/case/attachment/doc.pdf`, { expect: "downloaded" });
await nav("plain html", `${base}/case/plain.html`, { expect: "other(text/html)" });
await nav("iframe in web page", `${base}/case/iframe.html`, { expect: "iframe-redirected" });
await nav("embed in web page", `${base}/case/embed.html`, { expect: "other(text/html)" });
await nav("download escape hatch", `${base}/fixtures/sample.pdf?noctpdf.action=download`, { expect: "native-pdf" });
const fileUrl = pathToFileURL(fileURLToPath(new URL("../fixtures/sample.pdf", import.meta.url))).href;
await nav(`file:// (fileAccess=${result.status.fileAccess})`, fileUrl, { expect: "redirected" });

// POST form must not be redirected (the viewer could not replay the body).
{
  const page = await browser.newPage();
  await page.goto(`${base}/case/post.html`);
  await Promise.all([page.waitForNavigation({ timeout: 10000 }).catch(() => {}), page.click("#go")]);
  await settle(1000);
  const ct = await page.evaluate(() => document.contentType).catch(() => null);
  const u = page.url();
  const outcome = u.startsWith(viewerPrefix) ? "redirected" : ct === "application/pdf" ? "native-pdf" : `other(${ct})`;
  result.cases["POST form"] = { outcome, expect: "native-pdf", ok: outcome === "native-pdf", finalUrl: u.replace(base, "") };
}

// "Open in native viewer": tab-scoped session allow rule, then reload, then another PDF.
{
  const url = `${base}/fixtures/sample.pdf`;
  const page = await browser.newPage();
  await page.goto(url).catch(() => {});
  await settle(800);
  const first = page.url().startsWith(viewerPrefix) ? "redirected" : "not-redirected";
  const tabId = await sw.evaluate(p => globalThis.__tabIdByUrl(p), page.url());
  await sw.evaluate((t, u) => globalThis.__openNative(t, u), tabId, url);
  await settle(1500);
  const ctOf = () => page.evaluate(() => document.contentType).catch(() => null);
  const afterNative = { url: page.url().replace(base, ""), ct: await ctOf() };
  await page.reload().catch(() => {});
  await settle(1200);
  const afterReload = { url: page.url().replace(base, ""), ct: await ctOf() };
  await page.goto(`${base}/case/no-extension/1706.03762`).catch(() => {});
  await settle(1200);
  const otherPdf = page.url().startsWith(viewerPrefix) ? "redirected" : "not-redirected";
  const ok = first === "redirected" && afterNative.ct === "application/pdf" && afterReload.ct === "application/pdf" && otherPdf === "redirected";
  result.cases["open in native viewer (session allow rule)"] = { outcome: ok ? "ok" : "ko", ok, first, tabId, afterNative, afterReload, otherPdf };
}

writeFileSync(new URL(`${name}${headless ? "" : "-headful"}.json`, outDir), JSON.stringify(result, null, 1));
console.log(`${name} ${result.version} headless=${headless}`, JSON.stringify(result.status));
for (const [k, v] of Object.entries(result.cases)) {
  console.log(v.ok ? "PASS" : "FAIL", k.padEnd(44), v.outcome ?? "", v.ok ? "" : JSON.stringify(v).slice(0, 500));
}
console.log("rule matches:", JSON.stringify(result.matches));
await browser.close();
server.close();
