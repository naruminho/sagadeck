// Roteiro do apresentador em PDF: miniatura de cada slide + notas + relógio planejado.
import fs from "node:fs";
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.js";
import { esc } from "../markup.js";

export async function roteiroPDF({ meta, slidesMeta, shotFiles, outFile, title, author, duration }) {
  let acc = 0;
  const fmt = (m) => `${String(Math.floor(m)).padStart(2, "0")}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
  const rows = slidesMeta.map((s, i) => {
    const start = acc; acc += s.time || 0;
    const img = shotFiles[i] ? `<img src="data:image/${shotFiles[i].endsWith(".jpg") ? "jpeg" : "png"};base64,${fs.readFileSync(shotFiles[i]).toString("base64")}">` : "";
    return `<section><div class="l"><div class="n">${String(i + 1).padStart(2, "0")}</div>${img}<div class="tm">${s.time ? `${fmt(start)} → ${fmt(acc)} · ${s.time} min` : ""}</div></div>
      <div class="r"><h3>${esc(s.title)}</h3>${s.notes || "<p class='muted'>—</p>"}</div></section>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:14mm 14mm 16mm}
  body{font:11pt/1.5 'Segoe UI',Arial,sans-serif;color:#1a1a1a;margin:0}
  header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
  header h1{font:700 22pt/1.1 'Segoe UI';margin:0}
  header p{margin:4px 0 0;color:#666}
  section{display:grid;grid-template-columns:62mm 1fr;gap:6mm;padding:5mm 0;border-bottom:1px solid #ddd;break-inside:avoid}
  .l img{width:100%;border-radius:3px;border:1px solid #ccc;display:block}
  .n{font:700 10pt 'Segoe UI';color:#999;margin-bottom:2px}
  .tm{font:600 9pt 'Segoe UI';color:#b3261e;margin-top:4px}
  h3{font:700 12.5pt/1.25 'Segoe UI';margin:0 0 6px}
  p{margin:0 0 6px}
  .say{border-left:3px solid #f2b705;padding-left:8px;font-size:11.5pt}
  .tag{display:inline-block;font:700 7.5pt 'Segoe UI';letter-spacing:.1em;background:#111;color:#ffc20e;padding:1px 6px;border-radius:3px;margin-right:6px;vertical-align:1px}
  ul{margin:0 0 6px;padding-left:16px}
  h4{font:700 8.5pt 'Segoe UI';letter-spacing:.12em;text-transform:uppercase;color:#777;margin:8px 0 3px}
  mark{background:#ffe07a}
  .muted{color:#999}
  </style></head><body><header><h1>Roteiro · ${esc(title || "")}</h1><p>${esc(author || "")}${duration ? ` · ${duration} min` : ""} · tempo planejado: ${Math.round(acc)} min · ${slidesMeta.length} slides</p></header>${rows}</body></html>`;
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({ path: outFile, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: `<div style="font:8pt Segoe UI;color:#999;width:100%;text-align:center"><span class="pageNumber"></span>/<span class="totalPages"></span></div>`, margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  await browser.close();
}
