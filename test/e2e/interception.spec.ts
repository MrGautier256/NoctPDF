import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { expect, test, waitForViewer } from "./fixtures";
import { FIXTURES } from "./server";

test.describe("interception", () => {
  for (const [label, path] of [
    ["application/pdf, fragment kept", "/pdf/sample.pdf#page=2"],
    ["no .pdf extension (arXiv style)", "/pdf/no-extension/1706.03762"],
    ["octet-stream with a .pdf path", "/pdf/octet/report.pdf"],
    ["octet-stream with a .pdf file name", "/pdf/octet-disposition/download"],
    ["application/pdf with parameters", "/pdf/charset"],
  ] as const) {
    test(`redirects: ${label}`, async ({ context, server, readable }) => {
      const page = await context.newPage();
      await page.goto(server.base + path);
      await expect(page).toHaveURL(readable(server.base + path));
      const diag = await waitForViewer(page);
      expect(diag.documentUrl).toBe(server.base + path.replace(/#.*/, ""));
    });
  }

  test("the viewer gets its preferences and records image rectangles", async ({ context, server }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/pdf/sample.pdf`);
    const diag = await waitForViewer(page);
    expect(diag.pdfjsOptions.imagesRightClickMinSize).toBe(999_999_999);
    // Page 1 of the sample has a photo and a diagram.
    await expect.poll(() => page.evaluate(() => window.__noctpdf!.imageRects[1])).toBe(2);
    // No right-click placeholders in the text layer (they hurt text selection).
    expect(await page.locator(".textLayerImagePlaceholder").count()).toBe(0);
  });

  test("downloads attachments", async ({ context, server }) => {
    const page = await context.newPage();
    const download = page.waitForEvent("download");
    await page.goto(`${server.base}/pdf/attachment/doc.pdf`).catch(() => undefined);
    expect((await download).suggestedFilename()).toBe("doc.pdf");
  });

  test("leaves HTML pages alone", async ({ context, server }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/page/plain.html`);
    await expect(page).toHaveURL(`${server.base}/page/plain.html`);
  });

  test("never redirects the response to a POST form", async ({ context, server, viewerBase }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/page/post.html`);
    await Promise.all([page.waitForURL(`${server.base}/pdf/post`), page.click("#go")]);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.contentType)).toBe("application/pdf");
    expect(page.frames().some(f => f.url().startsWith(viewerBase))).toBe(false);
  });

  test("honors the download escape hatch", async ({ context, server }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/pdf/sample.pdf?noctpdf.action=download`);
    expect(await page.evaluate(() => document.contentType)).toBe("application/pdf");
  });

  test("takes over a PDF whose type was sniffed", async ({ context, server, readable }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/pdf/sniffed`);
    await expect.poll(() => page.frames().map(f => f.url())).toContain(readable(`${server.base}/pdf/sniffed`));
  });

  test("opens local files", async ({ context, readable }) => {
    const page = await context.newPage();
    const file = pathToFileURL(resolve(FIXTURES, "sample.pdf")).href;
    await page.goto(file).catch(() => undefined);
    await expect(page).toHaveURL(readable(file));
    await waitForViewer(page);
  });
});

test.describe("embedded PDFs", () => {
  test("redirects a PDF iframe", async ({ context, server, readable }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/page/iframe.html`);
    await expect
      .poll(() => page.frames().map(f => f.url()))
      .toContain(readable(`${server.base}/pdf/no-extension/1706.03762`));
  });

  test("replaces an <embed>", async ({ context, server, viewerBase }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/page/embed.html`);
    await expect
      .poll(() => page.locator("#e").getAttribute("src"))
      .toBe(`${viewerBase}?file=${encodeURIComponent(`${server.base}/pdf/sample.pdf`)}`);
    await expect(page.locator("#e")).toHaveAttribute("type", "text/html");
  });

  test("replaces an <object>", async ({ context, server, viewerBase }) => {
    const page = await context.newPage();
    await page.goto(`${server.base}/page/object.html`);
    await expect(page.locator("#o > iframe")).toHaveAttribute(
      "src",
      `${viewerBase}?file=${encodeURIComponent(`${server.base}/pdf/sample.pdf`)}`,
    );
  });

  test("leaves them to the browser when the setting is off", async ({ context, server, extensionId, setSettings }) => {
    await setSettings(s => (s.interception.embeddedPdfs = false));
    const page = await context.newPage();
    await page.goto(`${server.base}/page/iframe.html`);
    await page.waitForTimeout(1500);
    // Chrome's own PDF viewer is an extension frame too: look for ours only.
    expect(page.frames().some(f => f.url().startsWith(`chrome-extension://${extensionId}/`))).toBe(false);
    await page.goto(`${server.base}/page/embed.html`);
    await page.waitForTimeout(1000);
    await expect(page.locator("#e")).toHaveAttribute("type", "application/pdf");
  });
});

test.describe("settings and viewer switching", () => {
  test("does nothing when disabled", async ({ context, sw, server, setSettings }) => {
    await setSettings(s => (s.enabled = false));
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length))
      .toBe(0);
    const page = await context.newPage();
    await page.goto(`${server.base}/pdf/sample.pdf`);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => document.contentType)).toBe("application/pdf");
  });

  test("open in the native viewer, then back, without loops", async ({ context, server, viewerBase, readable }) => {
    const url = `${server.base}/pdf/sample.pdf`;
    const page = await context.newPage();
    await page.goto(url);
    await waitForViewer(page);
    // Same message the popup sends, from the viewer page itself (an extension page).
    await page.evaluate(async u => {
      const tab = await chrome.tabs.getCurrent();
      await chrome.runtime.sendMessage({ type: "noct:openNative", tabId: tab!.id, url: u });
    }, url);
    await page.waitForURL(url);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => document.contentType)).toBe("application/pdf");

    await page.reload();
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.contentType)).toBe("application/pdf");

    // Another PDF in the same tab goes to our viewer again.
    await page.goto(`${server.base}/pdf/no-extension/1706.03762`);
    await expect(page).toHaveURL(readable(`${server.base}/pdf/no-extension/1706.03762`));

    // The native PDF tab is known to the service worker and can switch back.
    await page.goBack();
    await page.waitForURL(url);
    await page.waitForTimeout(1000);
    const options = await context.newPage();
    await options.goto(viewerBase.replace("content/web/viewer.html", "options.html"));
    const tabId = await options.evaluate(async u => (await chrome.tabs.query({})).find(t => t.url === u)?.id, url);
    expect(tabId).toBeDefined();
    const state: unknown = await options.evaluate(
      id => chrome.runtime.sendMessage({ type: "noct:getTabState", tabId: id }),
      tabId,
    );
    expect(state).toEqual({ inViewer: false, inNativeViewer: true, pdfUrl: url });
    await options.evaluate(([id, u]) => chrome.runtime.sendMessage({ type: "noct:openEnhanced", tabId: id, url: u }), [
      tabId,
      url,
    ] as const);
    await expect(page).toHaveURL(readable(url));
    await waitForViewer(page);
  });

  test("reloading the readable address reopens the viewer", async ({ context, server, readable }) => {
    const url = `${server.base}/pdf/sample.pdf`;
    const page = await context.newPage();
    await page.goto(url);
    await expect(page).toHaveURL(readable(url));
    await waitForViewer(page);
    await page.reload();
    await expect(page).toHaveURL(readable(url));
    const diag = await waitForViewer(page);
    expect(diag.documentUrl).toBe(url);
  });
});
