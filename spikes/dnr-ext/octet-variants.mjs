// Why is "application/octet-stream + .pdf path" downloaded instead of
// redirected? Try rule variants one at a time.
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";
import { launchWithExtension } from "../lib/browsers.mjs";

const name = process.argv[2] ?? "chrome";
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const { browser, id } = await launchWithExtension(name, fileURLToPath(new URL(".", import.meta.url)));
const sw = await (await browser.waitForTarget(t => t.type() === "service_worker" && t.url().includes(id))).worker();
await sw.evaluate(() => globalThis.__status());
const VIEWER = `chrome-extension://${id}/viewer.html`;
const redirect = { type: "redirect", redirect: { regexSubstitution: VIEWER + "?DNR:\\0" } };
const octet = [{ header: "content-type", values: ["application/octet-stream", "application/octet-stream;*"] }];
const variants = {
  "pdf.js rule: regex ^.*\\.pdf\\b.*$": { regexFilter: "^.*\\.pdf\\b.*$", responseHeaders: octet },
  "regex without \\b": { regexFilter: "^.*\\.pdf.*$", responseHeaders: octet },
  "regex ^.*$ + urlFilter-free": { regexFilter: "^.*$", responseHeaders: octet },
  "regex + excludedRequestMethods post": { regexFilter: "^.*\\.pdf.*$", excludedRequestMethods: ["post"], responseHeaders: octet },
};
const full = await sw.evaluate(() => globalThis.__rules);
const order = [["full ruleset", { without: -1 }], ...Object.entries(variants)];
order.length = 0;
order.push(["rule 5 alone (orig id/priority)", { only: [5] }]);
for (const r of full) if (r.id !== 5) order.push([`rule 5 + rule ${r.id}`, { only: [5, r.id] }]);
let n = 0;
for (const [label, cond] of order) {
  await sw.evaluate(async (cond, redirect) => {
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: old.map(r => r.id),
      addRules: cond.only ? globalThis.__rules.filter(r => cond.only.includes(r.id))
        : cond.without !== undefined
        ? globalThis.__rules.filter(r => r.id !== cond.without)
        : [{ id: 1, priority: 1, action: redirect, condition: { ...cond, resourceTypes: ["main_frame", "sub_frame"] } }],
    });
    globalThis.__matches = [];
  }, cond, redirect);
  const page = await browser.newPage();
  let err = null;
  await page.goto(`${base}/case/octet/report.pdf${process.argv.includes('--same-url') ? '' : '?n=' + n++}`).catch(e => (err = e.message.split(" at ")[0]));
  await new Promise(r => setTimeout(r, 1000));
  const matches = await sw.evaluate(() => globalThis.__matches);
  console.log(label.padEnd(40), page.url().startsWith(VIEWER) ? "REDIRECTED" : `not redirected (${err})`, JSON.stringify(matches));
  await page.close();
}
await browser.close();
server.close();
