// Páginas de PDF → PNG pelo pdf.js dentro do Chromium que o sagadeck já usa (funciona em Windows, Linux e Mac).
// Um servidor local de vida curta entrega o pdf.js e o PDF; nada sai da máquina.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const PDFJS = (() => { try { return path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/build/pdf.min.mjs")); } catch { return null; } })();

export async function renderPdfPages(pdfBytes, outDir, { width = 1920, prefix = "slide-", pages = null } = {}) {
  if (!PDFJS) throw new Error("pdf.js não encontrado (pdfjs-dist)");
  fs.mkdirSync(outDir, { recursive: true });
  const buf = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  const page = `<!doctype html><meta charset="utf-8"><body><script type="module">
    import * as pdfjs from "/pdf.min.mjs";
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    window.render = async (n, width) => {
      const doc = window.doc || (window.doc = await pdfjs.getDocument({ url: "/doc.pdf", isEvalSupported: false }).promise);
      if (n === 0) return doc.numPages;
      const pg = await doc.getPage(n);
      const vp0 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: width / vp0.width });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      return c.toDataURL("image/png");
    };
    window.ready = true;
  </script>`;
  const server = http.createServer((req, res) => {
    const u = req.url.split("?")[0];
    if (u === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(page); }
    if (u === "/doc.pdf") { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(buf); }
    if (u === "/pdf.min.mjs" || u === "/pdf.worker.min.mjs") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(fs.readFileSync(path.join(PDFJS, u.slice(1)))); }
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const { findBrowser } = await import("../export/browser.js");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const files = [];
  try {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await p.waitForFunction(() => window.ready);
    const n = await p.evaluate(() => window.render(0));
    for (let k = 1; k <= n; k++) {
      if (pages && !pages.includes(k)) continue;
      const url = await p.evaluate(([k, w]) => window.render(k, w), [k, width]);
      const f = path.join(outDir, `${prefix}${String(k).padStart(2, "0")}.png`);
      fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64"));
      files.push(f);
    }
  } finally { await browser.close(); server.close(); }
  return files;
}
