// sagadeck Studio · "olhos" da IA: fotografa um slide renderizado de verdade (runtime completo, com
// fontes e figuras) para mandar ao modelo junto com o pedido. Um Chrome headless fica aberto e é
// reusado entre pedidos (a primeira foto demora ~1-2 s; as seguintes, bem menos).
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
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: width / 1920 });
  try {
    // ?export: sem animações de entrada e sem HUD — a foto mostra o estado final de cada clique
    await page.goto(`${pathToFileURL(file).href}?export#${index + 1}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.sagadeck && typeof window.sagadeck.goto === "function", null, { timeout: 10000 });
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

export async function closeSnapshots() {
  if (browserPromise) (await browserPromise).close().catch(() => {});
  browserPromise = null;
}
