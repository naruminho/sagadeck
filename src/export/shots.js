// PNG de cada slide, folha de contato, PDF e verificação automática de qualidade.
import fs from "node:fs";
import path from "node:path";
import { openDeck, waitForResources, settleSlide } from "./browser.js";

// Estado final de cada slide (todos os cliques revelados)
export async function shots(htmlFile, outDir, { steps = false, scale = 1, only, jpeg = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^slide-\d+.*\.(png|jpg)$|^folha-\d+\.png$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const { browser, page, errors } = await openDeck(htmlFile, { scale });
  try {
  const n = await page.evaluate(() => window.sagadeck.n);
  const files = [];
  for (let i = 0; i < n; i++) {
    if (only && !only.includes(i + 1)) continue;
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    const list = steps ? Array.from({ length: S + 1 }, (_, k) => k) : [S];
    for (const k of list) {
      await page.evaluate(([j, kk]) => window.sagadeck.goto(j, kk), [i, k]);
      await settleSlide(page);
      await page.waitForTimeout(60);
      const f = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}${steps ? `-${k}` : ""}.${jpeg ? "jpg" : "png"}`);
      await page.screenshot(jpeg ? { path: f, type: "jpeg", quality: 82 } : { path: f });
      files.push(f);
    }
  }
  return { files, errors };
  } finally { await browser.close(); }
}

// Junta miniaturas em folhas (12 por folha) para revisão rápida
export async function contactSheet(files, outDir, { perSheet = 12, cols = 3 } = {}) {
  const { chromium } = await import("playwright-core");
  const { findBrowser } = await import("./browser.js");
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const out = [];
  for (let s = 0; s < files.length; s += perSheet) {
    const chunk = files.slice(s, s + perSheet);
    const cells = chunk.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${path.basename(f, ".png").replace("slide-", "")}</figcaption></figure>`).join("");
    await page.setContent(`<style>body{margin:0;background:#1a1a1a;font:600 22px system-ui;color:#ddd}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:18px;padding:18px}figure{margin:0;position:relative}img{width:100%;display:block;border-radius:6px}figcaption{position:absolute;left:8px;top:6px;background:#000c;padding:2px 8px;border-radius:5px}</style><main>${cells}</main>`);
    await waitForResources(page);
    const f = path.join(outDir, `folha-${Math.floor(s / perSheet) + 1}.png`);
    await page.screenshot({ path: f, fullPage: true });
    out.push(f);
  }
  return out;
  } finally { await browser.close(); }
}

export async function pdf(htmlFile, outFile) {
  const { browser, page } = await openDeck(htmlFile, { scale: 1 });
  try {
  const n = await page.evaluate(() => window.sagadeck.n);
  const imgs = [], links = [];
  for (let i = 0; i < n; i++) {
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    await page.evaluate(([j, k]) => window.sagadeck.goto(j, k), [i, S]);
    await settleSlide(page);
    await page.waitForTimeout(50);
    imgs.push((await page.screenshot({ type: "jpeg", quality: 92 })).toString("base64"));
    links.push(await page.evaluate(gotoRects, i));
  }
  // cada página é a foto do slide; por cima, áreas clicáveis nos itens com goto (o PDF pula para a página do destino)
  const hit = (l) => `<a href="#p${l.to}" style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px"></a>`;
  const { w: W, h: H } = await page.evaluate(() => window.sagadeck.size || { w: 1920, h: 1080 }); // deck.aspect
  await page.setContent(`<style>@page{size:${W}px ${H}px;margin:0}body{margin:0}.pg{position:relative;width:${W}px;height:${H}px;page-break-after:always;overflow:hidden}img{width:${W}px;height:${H}px;display:block}</style>${imgs.map((b, i) => `<div class="pg" id="p${i}"><img src="data:image/jpeg;base64,${b}">${links[i].map(hit).join("")}</div>`).join("")}`);
  await waitForResources(page);
  await page.pdf({ path: outFile, width: `${W}px`, height: `${H}px`, printBackground: true });
  } finally { await browser.close(); }
}

// Itens com goto do slide i (dentro do navegador): retângulo em pixels do slide e o índice do slide de destino
function gotoRects(i) {
  const all = [...document.querySelectorAll("#stage > .slide")], s = all[i], sr = s.getBoundingClientRect(), k = sr.width / 1920 || 1;
  const idx = (t) => { t = String(t); const j = all.findIndex((x) => x.dataset.id === t); return j >= 0 ? j : /^\d+$/.test(t) ? +t - 1 : -1; };
  return [...s.querySelectorAll("[data-goto]")].map((a) => { const r = a.getBoundingClientRect(); return { x: Math.round((r.left - sr.left) / k), y: Math.round((r.top - sr.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k), to: idx(a.dataset.goto) }; })
    .filter((l) => l.to >= 0 && l.w > 0 && l.h > 0);
}

// ---------- verificação (roda dentro do navegador) ----------
// (exportado: a transformação usa o mesmo fiscal para conferir os slides que a IA escreveu, src/studio/snapshot.js)
export function inPageCheck(i) {
  const slide = document.querySelectorAll("#stage > .slide")[i];
  const issues = [];
  const R = (e) => e.getBoundingClientRect();
  const lum = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return 1;
    const unit = /^color\(srgb/.test(c) ? 1 : 255; // color-mix() devolve color(srgb 0.95 0.95 0.96), de 0 a 1
    const [r, g, b] = m.slice(0, 3).map((v) => { v = v / unit; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const opaque = (c) => c && c !== "transparent" && c !== "none" && /^(rgb|color\(srgb)/.test(c) && !/rgba\(.*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  // o que está de fato embaixo do texto: o desenho (pílula do infográfico em SVG) ou a caixa com fundo; gradiente ou
  // imagem: não dá para medir (null, sem aviso). Sem nada embaixo, o fundo dos pais.
  // (durante a medição, texto e desenho respondem ao ponteiro: muitos vêm com pointer-events: none e sumiriam da pilha)
  let pe = document.getElementById("sd-check-pe");
  if (!pe) { pe = document.createElement("style"); pe.id = "sd-check-pe"; pe.textContent = ".slide .t, .slide svg, .slide svg *{pointer-events:visiblePainted!important}"; document.head.appendChild(pe); }
  const underOf = (e) => {
    const r = R(e);
    let below = false; // só o que vem DEPOIS do próprio texto na pilha (o que está por cima dele não é fundo)
    for (const el of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
      if (el === e || e.contains(el)) { below = true; continue; }
      if (!below) continue;
      const cs = getComputedStyle(el);
      if (el instanceof SVGGeometryElement) { if (opaque(cs.fill)) return cs.fill; if (/url\(/.test(cs.fill)) return null; continue; }
      if (el instanceof SVGElement) continue;
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      if (opaque(cs.backgroundColor)) return cs.backgroundColor;
    }
    return undefined;
  };
  const bgOf = (e) => {
    const u = underOf(e);
    if (u !== undefined) return u;
    for (let p = e; p; p = p.parentElement) {
      const cs = getComputedStyle(p); const bg = cs.backgroundColor;
      if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== "transparent") return bg;
    }
    return "rgb(255,255,255)";
  };
  const visible = (e) => { const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05 && R(e).width > 0; };
  const label = (e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const texts = Array.from(slide.querySelectorAll(".t")).filter((e) => visible(e) && !e.closest("svg") && e.textContent.trim());
  const safe = slide.querySelector(".safe");
  for (const e of texts) {
    const r = R(e);
    const fsz = parseFloat(getComputedStyle(e).fontSize);
    // tolerância pela letra: o enchimento do marca-texto (==x==) passa uns px da caixa sem cortar nada
    if (e.scrollWidth > e.clientWidth + Math.max(3, fsz * 0.12)) issues.push({ kind: "estouro-horizontal", text: label(e) });
    if (getComputedStyle(e).maxHeight !== "none" && e.scrollHeight > e.clientHeight + fsz * 0.3) issues.push({ kind: "estouro-vertical", text: label(e) });
    if (r.right > 1920 + 2 || r.bottom > (window.sagadeck?.size?.h || 1080) + 2 || r.left < -2 || r.top < -2) issues.push({ kind: "fora-do-slide", text: label(e) });
    if (safe && !e.closest(".foot, .headbar") && r.bottom > R(safe).bottom + 24) issues.push({ kind: "passa-da-margem-inferior", text: label(e), px: Math.round(r.bottom - R(safe).bottom) });
    const fs = fsz;
    if (fs < 19 && !e.closest(".foot, .headbar")) issues.push({ kind: "fonte-pequena", text: label(e), px: Math.round(fs) });
    const bg = bgOf(e);
    if (bg) {
      const c1 = lum(getComputedStyle(e).color), c2 = lum(bg);
      const ratio = (Math.max(c1, c2) + 0.05) / (Math.min(c1, c2) + 0.05);
      if (ratio < 3) issues.push({ kind: "baixo-contraste", text: label(e), ratio: +ratio.toFixed(2) });
    }
  }
  // texto por cima de uma tabela (as células não são .t)
  for (const tb of slide.querySelectorAll(".dtable-wrap")) {
    const rb = R(tb);
    if (!rb.width) continue;
    for (const A of texts) {
      if (tb.contains(A) || A.contains(tb) || A.closest("[data-exit]")) continue;
      const ra = R(A), ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 8 && iy > 8) issues.push({ kind: "sobreposicao", text: `${label(A)} ⟂ tabela` });
    }
  }
  // sobreposição entre blocos de texto que não são pai/filho
  for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
    const A = texts[a], B = texts[b];
    if (A.contains(B) || B.contains(A)) continue;
    const ra = R(A), rb = R(B);
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 8 && iy > 8) {
      const exA = A.closest("[data-exit]"), exB = B.closest("[data-exit]");
      if (exA || exB) continue; // trocas por clique são intencionais
      issues.push({ kind: "sobreposicao", text: `${label(A)} ⟂ ${label(B)}` });
    }
  }
  pe.remove();
  return issues;
}

export async function check(htmlFile) {
  const { browser, page, errors } = await openDeck(htmlFile);
  try {
  const n = await page.evaluate(() => window.sagadeck.n);
  const report = [];
  for (let i = 0; i < n; i++) {
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    await page.evaluate(([j, k]) => window.sagadeck.goto(j, k), [i, S]);
    const issues = await page.evaluate(inPageCheck, i);
    if (issues.length) report.push({ slide: i + 1, issues });
  }
  return { report, errors };
  } finally { await browser.close(); }
}
