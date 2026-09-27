// Tiny static server for the spikes, plus endpoints reproducing the
// interception edge cases (no .pdf extension, octet-stream, attachment...).
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const pdf = readFileSync(join(root, "fixtures/sample.pdf"));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".icc": "application/octet-stream",
};

const special = {
  "/case/no-extension/1706.03762": { "content-type": "application/pdf" },
  "/case/octet/report.pdf": { "content-type": "application/octet-stream" },
  "/case/octet-disposition/download?id=7": {
    "content-type": "application/octet-stream",
    "content-disposition": 'inline; filename="report.pdf"',
  },
  "/case/attachment/doc.pdf": {
    "content-type": "application/pdf",
    "content-disposition": 'attachment; filename="doc.pdf"',
  },
  "/case/pdf-charset": { "content-type": "application/pdf; charset=binary" },
};

const pages = {
  "/case/iframe.html": `<!doctype html><title>iframe host</title><h1>Web page with a PDF iframe</h1>
<iframe src="/case/no-extension/1706.03762" width="800" height="600"></iframe>`,
  "/case/embed.html": `<!doctype html><title>embed host</title><h1>Web page with a PDF embed</h1>
<embed src="/fixtures/sample.pdf" type="application/pdf" width="800" height="600">`,
  "/case/post.html": `<!doctype html><title>post form</title>
<form method="post" action="/case/post-pdf"><button id="go">POST for a PDF</button></form>`,
  "/case/plain.html": `<!doctype html><title>plain</title><p>Just HTML, must never be redirected.</p>`,
};

const log = [];
export function startServer(port = 0) {
  const server = createServer((req, res) => {
    const url = req.url;
    log.push(`${req.method} ${url}`);
    const key = url.startsWith("/case/octet/report.pdf?") ? "/case/octet/report.pdf" : url;
    if (special[key]) {
      res.writeHead(200, { ...special[key], "content-length": pdf.length });
      return res.end(pdf);
    }
    if (url === "/case/post-pdf" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(pdf);
    }
    if (pages[url]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(pages[url]);
    }
    if (url === "/__log") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(log));
    }
    const path = normalize(join(root, decodeURIComponent(url.split("?")[0])));
    if (path.startsWith(root) && existsSync(path) && statSync(path).isFile()) {
      res.writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
        "access-control-allow-origin": "*",
      });
      return res.end(readFileSync(path));
    }
    res.writeHead(404).end("not found");
  });
  return new Promise(resolve =>
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, log })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.argv[2] ?? 8123));
  console.log(`http://127.0.0.1:${port}/`);
}
