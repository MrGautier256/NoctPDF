// Local HTTP server reproducing the interception edge cases.
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const FIXTURES = resolve(import.meta.dirname, "..", "fixtures");
const pdf = () => readFileSync(resolve(FIXTURES, "sample.pdf"));

type Headers = Record<string, string>;
/** path -> response headers of a PDF response. */
const PDF_CASES: Record<string, Headers> = {
  "/pdf/sample.pdf": { "content-type": "application/pdf" },
  "/pdf/no-extension/1706.03762": { "content-type": "application/pdf" },
  "/pdf/octet/report.pdf": { "content-type": "application/octet-stream" },
  "/pdf/octet-disposition/download": {
    "content-type": "application/octet-stream",
    "content-disposition": 'inline; filename="report.pdf"',
  },
  "/pdf/attachment/doc.pdf": {
    "content-type": "application/pdf",
    "content-disposition": 'attachment; filename="doc.pdf"',
  },
  "/pdf/charset": { "content-type": "application/pdf; charset=binary" },
  // No Content-Type: Chrome sniffs the bytes, DNR has nothing to match.
  "/pdf/sniffed": {},
};

const PAGES: Record<string, string> = {
  "/page/iframe.html": `<!doctype html><title>iframe host</title><iframe id="f" src="/pdf/no-extension/1706.03762" width="800" height="600"></iframe>`,
  "/page/embed.html": `<!doctype html><title>embed host</title><embed id="e" src="/pdf/sample.pdf" type="application/pdf" width="800" height="600">`,
  "/page/object.html": `<!doctype html><title>object host</title><object id="o" data="/pdf/sample.pdf" type="application/pdf" width="800" height="600"></object>`,
  "/page/post.html": `<!doctype html><title>post form</title><form method="post" action="/pdf/post"><button id="go">POST</button></form>`,
  "/page/plain.html": `<!doctype html><title>plain</title><p>Just HTML.</p>`,
};

export interface TestServer {
  base: string;
  close(): Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    const headers = PDF_CASES[path];
    if (headers) {
      res.writeHead(200, { ...headers, "cache-control": "no-store" });
      res.end(pdf());
    } else if (path === "/pdf/post" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end(pdf());
    } else if (PAGES[path]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGES[path]);
    } else {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(r => server.close(() => r())),
  };
}
