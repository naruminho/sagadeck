// sagadeck Studio · "olhos" da IA: fotografa um slide renderizado de verdade (runtime completo, com
// fontes e figuras) para mandar ao modelo junto com o pedido. Um Chrome headless fica aberto e é
// reusado entre pedidos (a primeira foto demora ~1-2 s; as seguintes, bem menos).
import { slideSize } from "../aspect.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../build.js";
import { findBrowser } from "../export/browser.js";

let browserPromise = null;

async function browser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-core");
      const b = await chromium.launch({ executablePath: findBrowser() });
      b.on("disconnected", () => { browserPromise = null; });
      return b;
    })().catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

/**
 * Fotos do slide `index` do deck `spec`.
 * @param {"final"|"steps"} mode  final = tudo revelado; steps = uma foto por clique (0..n, até maxFrames)
 * @returns {Promise<{ label: string, dataUrl: string }[]>}
 */
export async function slideSnapshots(spec, index, { mode = "final", maxFrames = 6, width = 960 } = {}) {
  const { html } = buildHTML(spec);
  const file = path.join(os.tmpdir(), `sagadeck-snap-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 1920, height: slideSize(spec).h }, deviceScaleFactor: width / 1920 }); // deck.aspect
  try {
    // ?export: sem animações de entrada e sem HUD — a foto mostra o estado final de cada clique
    await page.goto(`${pathToFileURL(file).href}?export#${index + 1}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.sagadeck && typeof window.sagadeck.goto === "function", null, { timeout: 10000 });
    await page.evaluate(() => window.SagaScienceReady);
    await page.evaluate(() => window.SagaDiagramsReady);
    await page.evaluate(() => document.fonts?.ready);
    const steps = await page.evaluate((i) => window.sagadeck.steps(i) || 0, index);
    const frames = [];
    const shot = async (label) => {
      await page.waitForTimeout(120);
      const buf = await page.screenshot({ type: "jpeg", quality: 80 });
      frames.push({ label, dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}` });
    };
    if (mode === "steps" && steps > 0) {
      const last = Math.min(steps, maxFrames - 1);
      for (let k = 0; k <= last; k++) {
        await page.evaluate(([i, kk]) => window.sagadeck.goto(i, kk), [index, k]);
        await shot(k === 0 ? "antes do 1º clique" : `depois do clique ${k}`);
      }
    } else {
      await page.evaluate(([i, n]) => window.sagadeck.goto(i, n, true), [index, steps]);
      await shot(steps ? `todos os ${steps} cliques revelados` : "slide completo");
    }
    return frames;
  } finally {
    await page.close().catch(() => {});
    fs.rm(file, { force: true }, () => {});
  }
}

/**
 * Diagramas (layout diagram) só se conferem desenhando: o Mermaid roda no navegador. Desenha os slides `indices`
 * do deck e devolve o que deu errado, com o número do slide no deck.
 * @returns {Promise<{ errors: {slide:number, error:string}[], warnings: {slide:number, warning:string}[] }>}
 */
export async function diagramCheck(spec, indices) {
  const only = { ...spec, slides: indices.map((i) => spec.slides[i]) };
  const { html } = buildHTML(only);
  const file = path.join(os.tmpdir(), `sagadeck-dg-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(`${pathToFileURL(file).href}?export`, { waitUntil: "load" });
    await page.waitForFunction(() => window.sagadeck && window.SagaDiagramsReady, null, { timeout: 10000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(() => window.SagaDiagramsReady);
    const r = await page.evaluate(() => ({ errors: window.sagadeckDiagramErrors || [], warnings: window.sagadeckDiagramWarnings || [] }));
    const real = (x) => ({ ...x, slide: indices[x.slide - 1] + 1 }); // número no deck de verdade
    return { errors: r.errors.map(real), warnings: r.warnings.map(real) };
  } finally {
    await page.close().catch(() => {});
    fs.rm(file, { force: true }, () => {});
  }
}

/**
 * O fiscal de layout (src/export/shots.js: inPageCheck) em todos os slides do deck, com tudo revelado: texto que vaza
 * ou é cortado, fora do slide, passando da margem, um por cima do outro, letra miúda, pouco contraste. Medido no
 * navegador, sem modelo: é exato e de graça.
 * @returns {Promise<{ slide:number, issues:{kind:string,text:string,px?:number}[] }[]>}
 */
export async function layoutCheck(spec) {
  const { inPageCheck } = await import("../export/shots.js");
  const { html } = buildHTML(spec);
  const file = path.join(os.tmpdir(), `sagadeck-lc-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.html`);
  fs.writeFileSync(file, html);
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 1920, height: slideSize(spec).h } });
  try {
    await page.goto(`${pathToFileURL(file).href}?export`, { waitUntil: "load" });
    await page.waitForFunction(() => window.sagadeck && typeof window.sagadeck.goto === "function", null, { timeout: 10000 });
    await page.evaluate(() => window.SagaScienceReady);
    await page.evaluate(() => window.SagaDiagramsReady);
    await page.evaluate(() => document.fonts?.ready);
    const n = await page.evaluate(() => window.sagadeck.n);
    const out = [];
    for (let i = 0; i < n; i++) {
      const steps = await page.evaluate((j) => window.sagadeck.steps(j) || 0, i);
      await page.evaluate(([j, k]) => window.sagadeck.goto(j, k, true), [i, steps]);
      await page.waitForTimeout(80);
      const issues = await page.evaluate(inPageCheck, i);
      if (issues.length) out.push({ slide: i + 1, issues });
    }
    return out;
  } finally {
    await page.close().catch(() => {});
    fs.rm(file, { force: true }, () => {});
  }
}

export async function closeSnapshots() {
  if (browserPromise) (await browserPromise).close().catch(() => {});
  browserPromise = null;
}
