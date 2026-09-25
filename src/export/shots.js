// PNG de cada slide, folha de contato, PDF e verificação automática de qualidade.
import fs from "node:fs";
import path from "node:path";
import { openDeck } from "./browser.js";

// Estado final de cada slide (todos os cliques revelados)
export async function shots(htmlFile, outDir, { steps = false, scale = 1, only, jpeg = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^slide-\d+.*\.(png|jpg)$|^folha-\d+\.png$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const { browser, page, errors } = await openDeck(htmlFile, { scale });
  const n = await page.evaluate(() => window.sagadeck.n);
  const files = [];
  for (let i = 0; i < n; i++) {
    if (only && !only.includes(i + 1)) continue;
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    const list = steps ? Array.from({ length: S + 1 }, (_, k) => k) : [S];
    for (const k of list) {
      await page.evaluate(([j, kk]) => window.sagadeck.goto(j, kk), [i, k]);
      await page.waitForTimeout(60);
      const f = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}${steps ? `-${k}` : ""}.${jpeg ? "jpg" : "png"}`);
      await page.screenshot(jpeg ? { path: f, type: "jpeg", quality: 82 } : { path: f });
      files.push(f);
    }
  }
  await browser.close();
  return { files, errors };
}

// Junta miniaturas em folhas (12 por folha) para revisão rápida
export async function contactSheet(files, outDir, { perSheet = 12, cols = 3 } = {}) {
  const { chromium } = await import("playwright-core");
  const { findBrowser } = await import("./browser.js");
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const out = [];
  for (let s = 0; s < files.length; s += perSheet) {
    const chunk = files.slice(s, s + perSheet);
    const cells = chunk.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${path.basename(f, ".png").replace("slide-", "")}</figcaption></figure>`).join("");
    await page.setContent(`<style>body{margin:0;background:#1a1a1a;font:600 22px system-ui;color:#ddd}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:18px;padding:18px}figure{margin:0;position:relative}img{width:100%;display:block;border-radius:6px}figcaption{position:absolute;left:8px;top:6px;background:#000c;padding:2px 8px;border-radius:5px}</style><main>${cells}</main>`);
    await page.waitForTimeout(100);
    const f = path.join(outDir, `folha-${Math.floor(s / perSheet) + 1}.png`);
    await page.screenshot({ path: f, fullPage: true });
    out.push(f);
  }
  await browser.close();
  return out;
}

export async function pdf(htmlFile, outFile) {
  const { browser, page } = await openDeck(htmlFile, { scale: 1 });
  const n = await page.evaluate(() => window.sagadeck.n);
  const imgs = [];
  for (let i = 0; i < n; i++) {
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    await page.evaluate(([j, k]) => window.sagadeck.goto(j, k), [i, S]);
    await page.waitForTimeout(50);
    imgs.push((await page.screenshot({ type: "jpeg", quality: 92 })).toString("base64"));
  }
  await page.setContent(`<style>@page{size:1920px 1080px;margin:0}body{margin:0}img{width:1920px;height:1080px;display:block;page-break-after:always}</style>${imgs.map((b) => `<img src="data:image/jpeg;base64,${b}">`).join("")}`);
  await page.pdf({ path: outFile, width: "1920px", height: "1080px", printBackground: true });
  await browser.close();
}

// ---------- verificação (roda dentro do navegador) ----------
function inPageCheck(i) {
  const slide = document.querySelectorAll("#stage > .slide")[i];
  const issues = [];
  const R = (e) => e.getBoundingClientRect();
  const lum = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map((v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (e) => {
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
    if (e.scrollWidth > e.clientWidth + 3) issues.push({ kind: "estouro-horizontal", text: label(e) });
    const fsz = parseFloat(getComputedStyle(e).fontSize);
    if (getComputedStyle(e).maxHeight !== "none" && e.scrollHeight > e.clientHeight + fsz * 0.3) issues.push({ kind: "estouro-vertical", text: label(e) });
    if (r.right > 1920 + 2 || r.bottom > 1080 + 2 || r.left < -2 || r.top < -2) issues.push({ kind: "fora-do-slide", text: label(e) });
    if (safe && !e.closest(".foot, .headbar") && r.bottom > R(safe).bottom + 24) issues.push({ kind: "passa-da-margem-inferior", text: label(e), px: Math.round(r.bottom - R(safe).bottom) });
    const fs = fsz;
    if (fs < 19 && !e.closest(".foot, .headbar")) issues.push({ kind: "fonte-pequena", text: label(e), px: Math.round(fs) });
    const c1 = lum(getComputedStyle(e).color), c2 = lum(bgOf(e));
    const ratio = (Math.max(c1, c2) + 0.05) / (Math.min(c1, c2) + 0.05);
    if (ratio < 3) issues.push({ kind: "baixo-contraste", text: label(e), ratio: +ratio.toFixed(2) });
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
  return issues;
}

export async function check(htmlFile) {
  const { browser, page, errors } = await openDeck(htmlFile);
  const n = await page.evaluate(() => window.sagadeck.n);
  const report = [];
  for (let i = 0; i < n; i++) {
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    await page.evaluate(([j, k]) => window.sagadeck.goto(j, k), [i, S]);
    const issues = await page.evaluate(inPageCheck, i);
    if (issues.length) report.push({ slide: i + 1, issues });
  }
  await browser.close();
  return { report, errors };
}
