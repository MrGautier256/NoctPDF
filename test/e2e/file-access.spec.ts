import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "./fixtures";
import { FIXTURES } from "./server";

// Unpacked extensions get "Allow access to file URLs" by default: turn it off
// through chrome://extensions, the way a user would, to exercise the
// webNavigation fallback that the DNR file:// rule cannot cover. Developer
// mode must be on first, or Chrome disables the reloaded unpacked extension.
test("without file access, local PDFs open the viewer and explain how to allow it", async ({
  context,
  extensionId,
  readable,
}) => {
  const settingsPage = await context.newPage();
  await settingsPage.goto("chrome://extensions/");
  await settingsPage.locator("#devMode").click();
  await expect(settingsPage.locator("#devMode")).toHaveAttribute("checked", "");
  await settingsPage.goto(`chrome://extensions/?id=${extensionId}`);
  const toggle = settingsPage.locator("#allow-on-file-urls");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("checked", "");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("checked", "");
  // Revoking the access reloads the extension: give it a moment.
  await settingsPage.waitForTimeout(1500);

  const page = await context.newPage();
  const file = pathToFileURL(resolve(FIXTURES, "sample.pdf")).href;
  await page.goto(file).catch(() => undefined);
  await expect(page).toHaveURL(readable(file));
  await expect(page.locator("#chromeFileAccessDialog")).toBeVisible();
  await expect(page.locator("#chrome-url-of-local-file")).toHaveText(file);
});
