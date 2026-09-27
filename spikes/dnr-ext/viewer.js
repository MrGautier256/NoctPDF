// Proves the redirected viewer can fetch the original PDF (with cookies).
const raw = location.search.startsWith("?DNR:") ? location.search.slice(5) + location.hash : new URLSearchParams(location.search).get("file");
window.__viewer = { raw };
fetch(raw, { credentials: "include" })
  .then(r => r.arrayBuffer().then(b => ({ status: r.status, type: r.headers.get("content-type"), bytes: b.byteLength, magic: new TextDecoder().decode(b.slice(0, 5)) })))
  .catch(e => ({ error: String(e) }))
  .then(res => { Object.assign(window.__viewer, res, { done: true }); document.getElementById("out").textContent = JSON.stringify(window.__viewer, null, 1); });
