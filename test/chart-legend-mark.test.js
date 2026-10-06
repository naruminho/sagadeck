// Regressao: legenda de grafico agrupado com nomes longos em MAIUSCULAS encavalava
// (a largura estimada usava 0,62 por caractere, que vale para minusculas) e o fundo do
// ==destaque== vazava para a linha de cima em titulos grandes (cobria descendentes como o "g").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const caps = {
  layout: "chart",
  title: "Legenda longa em maiusculas",
  chart: {
    chart: "column",
    labels: ["2017", "2019"],
    series: [
      { name: "HEC-HMS PEV", values: [17.48, 19.89] },
      { name: "HYMOD PEV", values: [1.18, 21.46] },
    ],
  },
};

const cover = {
  layout: "cover",
  title: "Integrated Methodologies for ==Flood Susceptibility Mapping== and Urban Flood Prediction",
  titleSize: 96,
  subtitle: "repro",
  author: "repro",
};

async function shot(t, spec, url) {
  const browser = await browserOrSkip(t); if (!browser) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-legenda-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "prata", slides: [spec] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${url || `file://${file.replace(/\\/g, "/")}`}?export=1`);
    await page.waitForFunction(() => window.sagadeck && document.fonts.status === "loaded");
    return { browser, page, dir, errors };
  } catch (e) { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); throw e; }
}

test("no navegador: legenda com nomes longos em maiusculas nao se sobrepoe", { timeout: 120000 }, async (t) => {
  const s = await shot(t, caps); if (!s) return;
  try {
    const r = await s.page.evaluate(() => {
      const svg = document.querySelector("svg.chart-column");
      const items = [...svg.querySelectorAll("rect.ch-leg")].map((sw) => {
        const tx = sw.nextElementSibling, b = tx.getBBox();
        return { x0: +sw.getAttribute("x"), x1: b.x + b.width };
      }).sort((a, b) => a.x0 - b.x0);
      return { items, gaps: items.slice(1).map((it, i) => Math.round(it.x0 - items[i].x1)) };
    });
    assert.ok(r.items.length === 2, `duas series na legenda: ${JSON.stringify(r)}`);
    assert.ok(r.gaps.every((g) => g >= 0), `sem sobreposicao: ${JSON.stringify(r)}`);
    assert.deepEqual(s.errors, []);
    await s.page.close();
  } finally { await s.browser.close(); fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test("no navegador: marca-texto nao pinta a linha de cima", { timeout: 120000 }, async (t) => {
  const s = await shot(t, cover); if (!s) return;
  try {
    const m = await s.page.evaluate(() => {
      const ttl = document.querySelector(".cv-main .ttl") || document.querySelector(".ttl");
      const first = [...ttl.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const r1 = document.createRange(); r1.selectNodeContents(first);
      const L1 = r1.getClientRects()[0];
      const mark = ttl.querySelector("mark");
      const rm = document.createRange(); rm.selectNodeContents(mark.firstChild);
      const M1 = rm.getClientRects()[0];
      // faixa de 5 px colada no topo da linha do destaque: o fundo antigo (92% a 55%)
      // comecava ~5 px abaixo do topo e pintava aqui; o novo (84% a 58%) comeca ~11 px
      return {
        x0: L1.left + L1.width * 0.2, x1: L1.right - L1.width * 0.2,
        y0: M1.top + 2, y1: M1.top + 7,
      };
    });
    const shot = await s.page.screenshot();
    const r = await s.page.evaluate(async ({ b64, m }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
      const k = img.width / window.innerWidth;
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const x0 = Math.floor(m.x0 * k), x1 = Math.ceil(m.x1 * k);
      const y0 = Math.floor(m.y0 * k), y1 = Math.ceil(m.y1 * k);
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      let n = 0;
      // 232,232,237 e o --hi do prata (tema fixo deste teste); papel fica a 36 de distancia
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 232) + Math.abs(d[i + 1] - 232) + Math.abs(d[i + 2] - 237) <= 12) n++;
      }
      return { bad: n, total: d.length / 4 };
    }, { b64: shot.toString("base64"), m });
    // sem correcao a faixa vem com milhares de px de tinta; com correcao, zero ou
    // algum px isolado de antisserrilhamento
    assert.ok(r.bad <= 8, `tinta do destaque fora da linha: ${JSON.stringify(r)}`);
    assert.deepEqual(s.errors, []);
    await s.page.close();
  } finally { await s.browser.close(); fs.rmSync(s.dir, { recursive: true, force: true }); }
});
