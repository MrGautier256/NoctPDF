// Smoke test of the built extension in the browsers installed on this machine.
// Branded Chrome and its derivatives ignore --load-extension, so the extension
// is installed through the CDP method Extensions.loadUnpacked (pipe only).
//
//   node test/browsers/smoke.ts [chrome|opera|edge ...] [--headful]
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer, { TargetType, type Browser, type Page } from "puppeteer-core";
import { startServer } from "../e2e/server.ts";

const EXTENSION = resolve(import.meta.dirname, "..", "..", ".output", "chrome-mv3");
const LOCAL = process.env.LOCALAPPDATA ?? "";

function operaGx(): string | undefined {
  const dir = join(LOCAL, "Programs", "Opera GX");
  if (!existsSync(dir)) return undefined;
  // Use the versioned binary: the launcher next to it would drop the CDP pipe.
  const versions = readdirSync(dir)
    .filter(d => /^\d+\./.test(d))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const last = versions.at(-1);
  return last ? join(dir, last, "opera.exe") : undefined;
}

const BROWSERS: Record<string, string | undefined> = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  edge: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  opera: operaGx(),
};

const args = process.argv.slice(2);
const headless = !args.includes("--headful");
const names = args.filter(a => !a.startsWith("--"));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Result {
  name: string;
  ok: boolean;
  detail?: string;
}

async function run(name: string, executablePath: string): Promise<{ version: string; results: Result[] }> {
  const browser: Browser = await puppeteer.launch({
    executablePath,
    headless,
    pipe: true,
    enableExtensions: true,
    userDataDir: mkdtempSync(join(tmpdir(), `noctpdf-${name}-`)),
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1200,900"],
  });
  const server = await startServer();
  const results: Result[] = [];
  const check = async (label: string, fn: () => Promise<string | true>) => {
    try {
      const r = await fn();
      results.push(r === true ? { name: label, ok: true } : { name: label, ok: false, detail: r });
    } catch (e) {
      results.push({ name: label, ok: false, detail: (e as Error).message.split("\n")[0] });
    }
  };
  try {
    const id = await browser.installExtension(EXTENSION);
    const readable = (u: string) => `chrome-extension://${id}/${u}`;
    const sw = await browser.waitForTarget(
      t => t.type() === TargetType.SERVICE_WORKER && t.url().startsWith(`chrome-extension://${id}/`),
    );
    const worker = (await sw.worker())!;
    for (let i = 0; i < 50; i++) {
      if ((await worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length)) > 0) break;
      await wait(200);
    }
    const cdp = await browser.target().createCDPSession();
    const downloads: string[] = [];
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allowAndName",
      downloadPath: mkdtempSync(join(tmpdir(), "noctpdf-dl-")),
      eventsEnabled: true,
    });
    cdp.on("Browser.downloadWillBegin", e => downloads.push(e.url));

    const open = async (url: string): Promise<Page> => {
      const page = await browser.newPage();
      await page.goto(url).catch(() => undefined);
      await wait(1500);
      return page;
    };
    const rendered = async (page: Page) => {
      for (let i = 0; i < 40; i++) {
        const n = await page.evaluate(() => window.__noctpdf?.pagesRendered ?? 0).catch(() => 0);
        if (n > 0) return true;
        await wait(250);
      }
      return false;
    };

    for (const path of [
      "/pdf/sample.pdf#page=2",
      "/pdf/no-extension/1706.03762",
      "/pdf/octet/report.pdf",
      "/pdf/octet-disposition/download",
      "/pdf/charset",
    ]) {
      await check(`redirect ${path}`, async () => {
        const page = await open(server.base + path);
        const url = page.url();
        if (url !== readable(server.base + path)) return `url ${url}`;
        if (!(await rendered(page))) return "viewer did not render";
        await page.close();
        return true;
      });
    }
    await check("image rectangles recorded (PDF.js tracker)", async () => {
      const page = await open(`${server.base}/pdf/sample.pdf`);
      await rendered(page);
      const n = await page.evaluate(() => window.__noctpdf?.imageRects[1]);
      await page.close();
      return n === 2 || `imageRects[1] = ${n}`;
    });
    await check("attachment downloaded", async () => {
      const before = downloads.length;
      const page = await open(`${server.base}/pdf/attachment/doc.pdf`);
      await page.close();
      return downloads.length > before || "no download";
    });
    await check("iframe redirected", async () => {
      const page = await open(`${server.base}/page/iframe.html`);
      const ok = page.frames().some(f => f.url() === readable(`${server.base}/pdf/no-extension/1706.03762`));
      await page.close();
      return ok || "no viewer frame";
    });
    await check("embed replaced", async () => {
      const page = await open(`${server.base}/page/embed.html`);
      const src = await page.$eval("#e", e => (e as HTMLEmbedElement).src);
      await page.close();
      return src.startsWith(`chrome-extension://${id}/content/web/viewer.html?file=`) || `src ${src}`;
    });
    await check("sniffed PDF taken over", async () => {
      const page = await open(`${server.base}/pdf/sniffed`);
      await wait(1000);
      const ok = page.frames().some(f => f.url() === readable(`${server.base}/pdf/sniffed`));
      await page.close();
      return (
        ok ||
        `frames ${page
          .frames()
          .map(f => f.url())
          .join(", ")}`
      );
    });
    await check("POST response left to the browser", async () => {
      const page = await open(`${server.base}/page/post.html`);
      await Promise.all([page.waitForNavigation().catch(() => undefined), page.click("#go")]);
      await wait(1500);
      const ct = await page.evaluate(() => document.contentType);
      await page.close();
      return ct === "application/pdf" || `contentType ${ct}`;
    });
    await check("open in the native viewer, reload, next PDF", async () => {
      const url = `${server.base}/pdf/sample.pdf`;
      const page = await open(url);
      await rendered(page);
      await page.evaluate(async u => {
        const tab = await chrome.tabs.getCurrent();
        await chrome.runtime.sendMessage({ type: "noct:openNative", tabId: tab!.id, url: u });
      }, url);
      await wait(2000);
      if ((await page.evaluate(() => document.contentType)) !== "application/pdf") return `not native: ${page.url()}`;
      await page.reload().catch(() => undefined);
      await wait(1500);
      if ((await page.evaluate(() => document.contentType)) !== "application/pdf")
        return "reload left the native viewer";
      await page.goto(`${server.base}/pdf/no-extension/1706.03762`).catch(() => undefined);
      await wait(1500);
      const next = page.url();
      await page.close();
      return next === readable(`${server.base}/pdf/no-extension/1706.03762`) || `next PDF at ${next}`;
    });
    return { version: await browser.version(), results };
  } finally {
    await browser.close();
    await server.close();
  }
}

if (!existsSync(join(EXTENSION, "manifest.json"))) throw new Error("Build first: npm run build");
let failed = false;
for (const name of names.length ? names : Object.keys(BROWSERS)) {
  const exe = BROWSERS[name];
  if (!exe || !existsSync(exe)) {
    console.log(`\n${name}: not installed, skipped`);
    continue;
  }
  const { version, results } = await run(name, exe);
  console.log(`\n${name} (${version}, ${headless ? "headless" : "headful"})`);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
    failed ||= !r.ok;
  }
}
process.exitCode = failed ? 1 : 0;
