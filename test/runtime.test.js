// Runtime da apresentação num Chrome headless: cliques revelam na ordem certa, nada quebra.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import jsQR from "jsqr";
import { buildHTML, loadSpec } from "../src/build.js";
import { browserOrSkip, newPage, tempDeck } from "./helpers.js";

test("runtime", async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  const file = path.join(deck.dir, "deck.html");
  const loaded = loadSpec(deck.file);
  const cmpIdx = loaded.slides.length;
  loaded.slides.push({ layout: "compare", title: "A × B", build: true, left: { label: "Antes", value: "Herói" }, right: { label: "Depois", value: "Ré", hl: true } });
  const LONG = "um rótulo bem comprido que não cabe fácil";
  const side = "Numa meta-análise de **136 estudos**, previsões mecânicas foram, em média, **~10% mais precisas**.";
  const CHARTS = [
    { chart: "waffle", total: 100, cols: 20, groups: [{ count: 11, label: "especialista venceu (6% a 16% dos estudos)" }, { count: 89, label: "fórmula empatou ou venceu" }] },
    { chart: "bar", data: [{ label: LONG, value: 30 }, { label: LONG + " de novo", value: 70 }] },
    { chart: "column", data: [{ label: LONG, value: 30 }, { label: "curto", value: 70 }, { label: LONG, value: 50 }] },
    { chart: "donut", value: 72, center: "72%", label: LONG },
    { chart: "stacked", parts: [{ label: LONG, value: 60 }, { label: LONG, value: 40 }] },
    { chart: "isotype", total: 10, highlight: 3, label: LONG },
    { chart: "line", labels: ["janeiro de 2024", "fevereiro de 2024", "março de 2024", "abril de 2024"], series: [{ name: LONG, values: [1, 3, 2, 5] }] },
  ];
  const firstChart = loaded.slides.length;
  CHARTS.forEach((c) => loaded.slides.push({ layout: "chart", title: `Gráfico ${c.chart}`, chart: c, side }));
  fs.writeFileSync(file, buildHTML(loaded).html);
  const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
  await page.goto(pathToFileURL(file).href + "?export=1");
  await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
  await page.evaluate((n) => { window.__cmpIdx = n; }, cmpIdx);
  const slides = loadSpec(deck.file).slides;
  const idx = (layout) => slides.findIndex((s) => s.layout === layout);
  const shown = (i) => page.evaluate((i) => document.querySelectorAll(`section[data-idx="${i}"] [data-step].in`).length, i);

  await t.test("build: cada clique revela exatamente um item a mais (regressão: tudo, 1º, tudo, último)", async () => {
    const i = idx("timeline");
    const seq = [];
    for (let k = 0; k <= 3; k++) {
      await page.evaluate(([i, k]) => window.sagadeck.goto(i, k), [i, k]);
      seq.push(await shown(i));
    }
    assert.deepEqual(seq, [0, 1, 2, 3]);
  });

  await t.test("voltar um clique esconde de novo", async () => {
    const i = idx("timeline");
    await page.evaluate((i) => window.sagadeck.goto(i, 3), i);
    await page.evaluate((i) => window.sagadeck.goto(i, 1), i);
    assert.equal(await shown(i), 1);
  });

  await t.test("colunas com step aparecem uma por clique", async () => {
    const i = idx("blocks");
    const seq = [];
    for (let k = 0; k <= 3; k++) {
      await page.evaluate(([i, k]) => window.sagadeck.goto(i, k), [i, k]);
      seq.push(await shown(i));
    }
    assert.deepEqual(seq, [0, 1, 2, 3]);
  });

  await t.test("modo 'tudo' mostra todos os passos", async () => {
    const i = idx("timeline");
    await page.evaluate((i) => window.sagadeck.goto(i, 0, true), i);
    assert.equal(await shown(i), 3);
  });

  await t.test("QR code é lido por um leitor de verdade (mesmo em slide escuro)", async () => {
    const i = idx("end");
    await page.evaluate((i) => window.sagadeck.goto(i, 0, true), i);
    const png = (await page.locator(`section[data-idx="${i}"] .qr-box`).screenshot()).toString("base64");
    const img = await page.evaluate(async (b64) => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const cx = c.getContext("2d"); cx.drawImage(im, 0, 0);
      return { w: c.width, h: c.height, data: Array.from(cx.getImageData(0, 0, c.width, c.height).data) };
    }, png);
    const code = jsQR(Uint8ClampedArray.from(img.data), img.w, img.h);
    assert.equal(code?.data, "https://www.linkedin.com/in/exemplo-sagadeck");
  });

  await t.test("comparação com build: o '×' entra junto com o segundo lado (não sozinho no começo)", async () => {
    const i = await page.evaluate(() => window.__cmpIdx);
    const vis = async (k) => {
      await page.evaluate(([i, k]) => window.sagadeck.goto(i, k), [i, k]);
      await page.waitForTimeout(450); // transição de entrada
      return page.evaluate((i) => {
        const s = document.querySelector(`section[data-idx="${i}"]`);
        const op = (sel) => +getComputedStyle(s.querySelector(sel)).opacity;
        return [op(".cp-l"), op(".cp-vs"), op(".cp-r")].map((o) => (o > 0.5 ? 1 : 0)).join("");
      }, i);
    };
    assert.deepEqual([await vis(0), await vis(1), await vis(2)], ["000", "100", "111"]);
  });

  await t.test("rodapé: número da página na direita, título na esquerda", async () => {
    const i = await page.evaluate(() => window.__cmpIdx);
    await page.evaluate((i) => window.sagadeck.goto(i, 0, true), i);
    const r = await page.evaluate((i) => {
      const f = document.querySelector(`section[data-idx="${i}"] .foot`);
      const box = (e) => e.getBoundingClientRect();
      return { foot: box(f).right, left: box(f).left, num: box(f.querySelector(".bar-right")).right, title: box(f.querySelector(".bar-left")).left };
    }, i);
    assert.ok(Math.abs(r.num - r.foot) < 2, `número em ${r.num}, borda direita em ${r.foot}`);
    assert.ok(Math.abs(r.title - r.left) < 2);
  });

  await t.test("conteúdo que não cabe é reduzido até caber (nada fica por cima do vizinho)", async () => {
    const i = slides.findIndex((x) => x.title === "Conteúdo que não cabe");
    await page.evaluate((i) => window.sagadeck.goto(i, 0, true), i);
    const r = await page.evaluate((i) => {
      const s = document.querySelector(`section[data-idx="${i}"]`);
      const row = s.querySelector(".row"), next = row.nextElementSibling, safe = s.querySelector(".safe");
      const lastBottom = Math.max(...[...row.querySelectorAll(".t")].map((t) => t.getBoundingClientRect().bottom));
      return { lastBottom, nextTop: next.getBoundingClientRect().top, nextBottom: next.getBoundingClientRect().bottom,
        safeBottom: safe.getBoundingClientRect().bottom, shrink: s.dataset.shrink };
    }, i);
    assert.ok(r.lastBottom <= r.nextTop + 1, `texto termina em ${r.lastBottom}, a linha seguinte começa em ${r.nextTop}`);
    assert.ok(r.nextBottom <= r.safeBottom + 1, "cabe na área útil");
    assert.ok(+r.shrink > 0.6 && +r.shrink < 1, `reduzido para ${r.shrink}`);
  });

  await t.test("slide que já cabe não é reduzido", async () => {
    const i = slides.findIndex((x) => x.layout === "blocks");
    await page.evaluate((i) => window.sagadeck.goto(i, 0, true), i);
    assert.equal(await page.evaluate((i) => document.querySelector(`section[data-idx="${i}"]`).dataset.shrink || "", i), "");
  });

  await t.test("nenhum texto de gráfico sai do gráfico nem invade o texto ao lado (todos os tipos, rótulos longos)", async () => {
    const bad = await page.evaluate(([from, n]) => {
      const out = [];
      for (let i = from; i < from + n; i++) {
        const s = document.querySelector(`section[data-idx="${i}"]`);
        const svg = s.querySelector("svg.chart"), side = s.querySelector(".ch-side");
        const box = svg.getBoundingClientRect(), sideLeft = side ? side.getBoundingClientRect().left : Infinity;
        const texts = [...svg.querySelectorAll("text")].filter((t) => t.getBoundingClientRect().width);
        const scale = box.width / svg.viewBox.baseVal.width;
        texts.forEach((t, k) => {
          const r = t.getBoundingClientRect();
          if (r.right > box.right + 2 || r.left < box.left - 2 || r.right > sideLeft + 2) out.push(`${svg.classList[1]}: "${t.textContent.slice(0, 30)}" vai até ${Math.round(r.right)} (gráfico até ${Math.round(box.right)}, texto ao lado em ${Math.round(sideLeft)})`);
          for (const u of texts.slice(k + 1)) {
            const q = u.getBoundingClientRect();
            if (r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1) out.push(`${svg.classList[1]}: "${t.textContent.slice(0, 20)}" por cima de "${u.textContent.slice(0, 20)}"`);
          }
          // legível: nenhum rótulo abaixo de 15 px na tela de 1920 (o equivalente num slide projetado)
          const px = parseFloat(getComputedStyle(t).fontSize) * scale / (document.querySelector("#stage > .slide").getBoundingClientRect().width / 1920);
          if (px < 15) out.push(`${svg.classList[1]}: "${t.textContent.slice(0, 30)}" ficou com ${px.toFixed(1)} px`);
        });
      }
      return out;
    }, [firstChart, CHARTS.length]);
    assert.deepEqual(bad, []);
  });

  await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));

  await browser.close();
  deck.cleanup();
});
