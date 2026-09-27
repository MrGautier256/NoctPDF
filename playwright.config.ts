import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  // One browser per test (persistent context with the extension).
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./test/e2e/global-setup.ts",
});
