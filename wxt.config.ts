import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig } from "wxt";
import { patchedFiles } from "./scripts/pdfjs-patches.ts";

const pdfjsContent = resolve(import.meta.dirname, "vendor/pdfjs/content");

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export default defineConfig({
  srcDir: "src",
  imports: false,
  modules: ["@wxt-dev/module-vue"],
  manifestVersion: 3,
  manifest: {
    name: "__MSG_extName__",
    short_name: "NoctPDF",
    description: "__MSG_extDescription__",
    default_locale: "en",
    // declarativeNetRequest responseHeaders condition.
    minimum_chrome_version: "128",
    permissions: [
      // Redirect PDF responses to the viewer (needs the host permission below).
      "declarativeNetRequestWithHostAccess",
      // Settings, and the PDF.js viewer preferences.
      "storage",
      // Local PDFs when file access is not granted, native-viewer bookkeeping.
      "webNavigation",
      // Read-only: remember the Referer of PDF requests and spot POST responses.
      "webRequest",
    ],
    host_permissions: ["<all_urls>"],
    // The viewer runs WebAssembly decoders (JPEG 2000, JBIG2, ICC profiles).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // DNR can only redirect navigations to web-accessible pages. The viewer
    // shows its PDF as <ext>/https://..., routed back by the service worker.
    web_accessible_resources: [
      { resources: ["content/web/viewer.html", "http:/*", "https:/*", "file:/*"], matches: ["<all_urls>"] },
    ],
    // The viewer must fetch incognito PDFs with incognito cookies.
    incognito: "split",
  },
  hooks: {
    // Ship the vendored PDF.js viewer as is, plus our patches on top.
    "build:publicAssets": (_wxt, files) => {
      const patched = patchedFiles(pdfjsContent);
      for (const abs of listFiles(pdfjsContent)) {
        const rel = relative(pdfjsContent, abs).replaceAll("\\", "/");
        const contents = patched.get(rel);
        files.push(
          contents !== undefined
            ? { contents, relativeDest: `content/${rel}` }
            : { absoluteSrc: abs, relativeDest: `content/${rel}` },
        );
      }
      files.push({
        absoluteSrc: resolve(import.meta.dirname, "vendor/pdfjs/VERSION.json"),
        relativeDest: "pdfjs-version.json",
      });
    },
  },
});
