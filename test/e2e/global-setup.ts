import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { EXTENSION_DIR } from "./fixtures";

export default function globalSetup(): void {
  if (!existsSync(resolve(EXTENSION_DIR, "manifest.json"))) {
    throw new Error("Build the extension first: npm run build (npm run test:e2e does both).");
  }
  if (!existsSync(resolve(import.meta.dirname, "..", "fixtures", "sample.pdf"))) {
    execFileSync(process.execPath, [resolve(import.meta.dirname, "..", "..", "scripts", "make-fixtures.ts")], {
      stdio: "inherit",
    });
  }
}
