// Material de estudo: a outra visão do mesmo deck. O palco mostra pouco texto e deixa o detalhe para quem fala; o
// aluno recebe cada slide inteiro (tudo revelado) com o texto de consulta (`consulta:` do slide) logo depois.
// As notas do apresentador não entram. Sai como HTML (um arquivo, imagens embutidas) e como PDF (A4).
import fs from "node:fs";
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.js";
import { esc } from "../markup.js";

export function estudoHTML({ title, author, date, slidesMeta, shotFiles }) {
  const img = (f) => (f ? `<img src="data:image/${f.endsWith(".jpg") ? "jpeg" : "png"};base64,${fs.readFileSync(f).toString("base64")}" alt="">` : "");
  const rows = slidesMeta.map((s, i) => `<section class="sl"><div class="shot">${img(shotFiles[i])}</div>${s.consulta ? `<div class="txt">${s.consulta}</div>` : ""}</section>`).join("\n");
  const withText = slidesMeta.filter((s) => s.consulta).length;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || "Material de estudo")}</title><style>
  :root{--fg:#1b1d22;--muted:#6b7080;--line:#e2e4ea;--bg:#fff}
  @media (prefers-color-scheme:dark){:root{--fg:#e8e9ee;--muted:#9aa0ad;--line:#2d3038;--bg:#16181d}}
  @page{size:A4;margin:14mm 14mm 16mm}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 'Segoe UI',Arial,sans-serif}
  main{max-width:920px;margin:0 auto;padding:32px 16px 64px}
  header{border-bottom:2px solid var(--fg);padding-bottom:10px;margin-bottom:28px}
  header h1{margin:0;font:700 30px/1.15 'Segoe UI',Arial,sans-serif}
  header p{margin:6px 0 0;color:var(--muted);font-size:14px}
  .sl{margin:0 0 34px;break-inside:avoid}
  .shot img{width:100%;display:block;border:1px solid var(--line);border-radius:6px}
  .txt{margin-top:14px;font-size:15.5px}
  .txt p{margin:0 0 10px}.txt ul,.txt ol{margin:0 0 10px;padding-left:22px}
  .txt h4{margin:14px 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .txt code{font:13.5px Consolas,monospace;background:#8881;padding:1px 4px;border-radius:3px}
  .txt mark{background:#ffe07a;color:#1b1d22}
  @media print{body{font-size:11pt}main{max-width:none;padding:0}.sl{margin-bottom:8mm}.shot img{border-radius:3px}.txt{font-size:10.5pt}}
  </style></head><body><main><header><h1>${esc(title || "")}</h1><p>${[author, date].filter(Boolean).map(esc).join(" · ")}${author || date ? " · " : ""}${slidesMeta.length} slides${withText ? ` · ${withText} com texto de consulta` : ""}</p></header>
${rows}
</main></body></html>`;
}

export async function estudoPDF(html, outFile) {
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: outFile, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: `<div style="font:8pt Segoe UI;color:#999;width:100%;text-align:center"><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  } finally { await browser.close(); }
}
