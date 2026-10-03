// Material de estudo: a outra visão do mesmo deck. O palco mostra pouco texto e deixa o detalhe para quem fala; o
// aluno recebe cada slide inteiro (tudo revelado) com o texto de consulta (`consulta:` do slide) logo depois.
// As notas do apresentador não entram. Sai como HTML (um arquivo, imagens embutidas) e como PDF (A4).
import fs from "node:fs";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.js";
import { esc } from "../markup.js";
import { buildHTML } from '../build.js';

function interactiveStudy(s){if(!s.interactiveModel)return '';const m=s.interactiveModel,html=buildHTML({theme:m.theme,slides:[m.slide]}).html;return `<details class="study-experience"><summary>Experimentar ${s.layout==='graphlab'?'esta rede':'este código'}</summary><iframe title="${esc(s.title||'Laboratório interativo')}" sandbox="allow-scripts" srcdoc="${esc(html)}" style="border:0;width:100%;height:540px"></iframe></details>`;}

function liveStudy(s) {
  const m = s.explorationModel;
  if (!m) return '';
  return `<details class="study-live"><summary>Experimentar estes valores</summary><div data-calc>
    <div>${m.inputs.filter(i => !i.fixed).map(i => `<label>${esc(i.label)} <input type="range" data-calc-in="${esc(i.name)}" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.value}"><output data-calc-show="${esc(i.name)}"></output> ${esc(i.unit)}</label>`).join('')}</div>
    <div>${m.scenarios.map((c, i) => `<button data-calc-scenario="${i}">${esc(c.label)}</button>`).join('')}<button data-calc-freeze>Comparar com este</button><button data-calc-reset>Restaurar</button></div>
    <div class="calc-outputs">${m.outputs.map(o => `<p>${esc(o.label)}: <strong data-calc-out="${esc(o.name)}"></strong> ${esc(o.unit)} <span data-calc-badge="${esc(o.name)}"></span><small data-calc-compare="${esc(o.name)}" hidden></small></p>`).join('')}</div><p data-calc-explanation aria-live="polite"></p>
    <script type="application/json" class="calc-model">${JSON.stringify({ ...m, prediction: '' }).replace(/</g, '\\u003c')}</script></div></details>`;
}
function studyRuntime() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = [path.join(here, '../runtime'), path.join(here, 'runtime')].find(p => fs.existsSync(path.join(p, 'calc.js')));
  return ['formula.js', 'calc.js'].map(f => `<script>${fs.readFileSync(path.join(dir, f), 'utf8')}</script>`).join('');
}

export function estudoHTML({ title, author, date, slidesMeta, shotFiles }) {
  const img = (f) => (f ? `<img src="data:image/${f.endsWith(".jpg") ? "jpeg" : "png"};base64,${fs.readFileSync(f).toString("base64")}" alt="">` : "");
  const exploration = s => !s.exploration ? '' : `<div class="txt"><h3>Explore e compare</h3>${s.illustrative ? '<p>Simulação ilustrativa.</p>' : ''}${s.prediction ? `<p>${esc(s.prediction)}</p>` : ''}${s.exploration.map(state => `<article><h4>${esc(state.label)}</h4><p>Entradas: ${Object.entries(state.values).map(([k, v]) => `${esc(k)} = ${esc(v)}`).join('; ')}</p><ul>${Object.entries(state.results).map(([k, r]) => `<li>${esc(s.outputLabels?.[k] || k)}: ${r.error ? esc(r.error) : r.value != null ? esc(Number(r.value).toLocaleString('pt-BR', { maximumSignificantDigits: 6 })) : ''} ${esc(r.text)}</li>`).join('')}</ul>${state.explanation ? `<p>${esc(state.explanation)}</p>` : ''}</article>`).join('')}</div>`;
  const rows = slidesMeta.map((s, i) => `<section class="sl"><div class="shot">${img(shotFiles[i])}</div>${liveStudy(s)}${interactiveStudy(s)}${exploration(s)}${s.consulta ? `<div class="txt">${s.consulta}</div>` : ""}</section>`).join("\n");
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
  .study-live{border:1px solid var(--line);padding:16px;margin-top:16px;border-radius:8px}.study-live summary{cursor:pointer;font-weight:600}.study-live label{display:block;margin:12px 0}.study-live input{vertical-align:middle;width:45%}.study-live button{font:inherit;margin:6px;padding:6px;cursor:pointer}.study-live small{display:block}.study-live [hidden]{display:none}.calc-changed{color:#065dc3}@media print{.study-live{display:none}}
  @media print{body{font-size:11pt}main{max-width:none;padding:0}.sl{margin-bottom:8mm}.shot img{border-radius:3px}.txt{font-size:10.5pt}}
  </style></head><body><main><header><h1>${esc(title || "")}</h1><p>${[author, date].filter(Boolean).map(esc).join(" · ")}${author || date ? " · " : ""}${slidesMeta.length} slides${withText ? ` · ${withText} com texto de consulta` : ""}</p></header>
${rows}
</main>${slidesMeta.some(s => s.explorationModel) ? studyRuntime() : ''}</body></html>`;
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
