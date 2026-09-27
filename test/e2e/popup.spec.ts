import { expect, test } from "./fixtures";

const ruleCount = (sw: import("@playwright/test").Worker) =>
  sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);

test("the popup switches the engine and the global toggle", async ({ context, sw, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Labels follow the browser language: select by data-test, not by text.
  await expect(popup.locator("[data-test=engine-enhanced]")).toBeChecked();
  expect(await ruleCount(sw)).toBeGreaterThan(0);

  await popup.locator("[data-test=engine-off]").check();
  await expect.poll(() => ruleCount(sw)).toBe(0);
  await popup.locator("[data-test=engine-enhanced]").check();
  await expect.poll(() => ruleCount(sw)).toBeGreaterThan(0);

  await popup.locator("[data-test=enabled]").uncheck();
  await expect.poll(() => ruleCount(sw)).toBe(0);
  // Engines are greyed out while NoctPDF is off (disabled fieldset).
  await expect(popup.locator("[data-test=engine-off]")).toBeDisabled();
  await popup.locator("[data-test=enabled]").check();
  await expect.poll(() => ruleCount(sw)).toBeGreaterThan(0);
});
