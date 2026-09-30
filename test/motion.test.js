// Movimento: zoom lento e opcional no foco do spotlight; entradas e cliques suaves no modo padrão (subtle).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML, renderSlide } from "../src/build.js";
import { ROOT, browserOrSkip, newPage, tempDeck } from "./helpers.js";

const FOTO = path.join(ROOT, "src", "studio", "assets", "imagens", "lavanda-cover.jpg");
const spot = (extra = {}) => ({ layout: "spotlight", title: "Tela", image: "foto.jpg", zoom: true, hotspots: [
  { title: "Geral", x: 0, y: 0, width: 100, height: 100, zoom: false },
  { title: "Botão", x: 40, y: 40, width: 20, height: 20 },
  { title: "Canto", x: 80, y: 80, width: 15, height: 15, zoom: 2.5 },
], ...extra });

test("spotlight: zoom é opcional, vale para o slide e cada foco pode ter o seu (ou nenhum)", () => {
  const html = renderSlide(spot(), 0, { theme: "sinal", slides: [] }).html;
  const zooms = [...html.matchAll(/data-spotlight-region="(\d)"(?: data-zoom="([\d.]+)")?/g)].map((m) => m[2] || null);
  assert.deepEqual(zooms, [null, "1.8", "2.5"], "false = imagem inteira; true = 1,8; número = o escolhido");
  assert.doesNotMatch(renderSlide({ ...spot(), zoom: undefined, hotspots: [{ title: "a" }] }, 0, { theme: "sinal", slides: [] }).html, /data-zoom/, "sem zoom: nada muda");
});

test("zoom na apresentação: aproxima devagar e centraliza o foco; na exportação fica a imagem inteira; entradas suaves", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    fs.copyFileSync(FOTO, path.join(deck.dir, "foto.jpg"));
    const file = path.join(deck.dir, "zoom.html");
    fs.writeFileSync(file, buildHTML({ title: "Z", theme: "sinal", _dir: deck.dir, slides: [spot(), { layout: "list", title: "Itens", items: ["um", "dois"], build: true }] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    await p.waitForFunction(() => document.querySelector(".spotlight-image img")?.complete);
    const layer = () => p.evaluate(() => { const z = document.querySelector(".spotlight-zoom"); return { t: z.style.transform, dur: getComputedStyle(z).transitionDuration }; });
    assert.equal((await layer()).t, "", "primeiro foco com zoom: false = imagem inteira");
    assert.equal((await layer()).dur, "1.8s", "devagar, nada de pulo");
    await p.keyboard.press("ArrowRight");
    assert.match((await layer()).t, /scale\(1\.8\)/);
    await p.waitForTimeout(2100);
    const centro = await p.evaluate(() => {
      const c = document.querySelector(".spotlight-canvas").getBoundingClientRect(), r = document.querySelector(".spotlight-region.active").getBoundingClientRect();
      return [Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2), Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2)];
    });
    assert.ok(centro[0] < 4 && centro[1] < 4, `o foco fica no centro do quadro (${centro})`);
    // o canto não deixa aparecer borda vazia: o zoom encosta na margem em vez de centralizar
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(2100);
    const borda = await p.evaluate(() => {
      const c = document.querySelector(".spotlight-canvas").getBoundingClientRect(), z = document.querySelector(".spotlight-zoom").getBoundingClientRect(), r = document.querySelector(".spotlight-region.active").getBoundingClientRect();
      return { cobre: z.left <= c.left + 1 && z.top <= c.top + 1 && z.right >= c.right - 1 && z.bottom >= c.bottom - 1, foco: r.right <= c.right + 1 && r.bottom <= c.bottom + 1 };
    });
    assert.ok(borda.cobre, "a imagem aproximada cobre o quadro todo (sem sobrar fundo)");
    assert.ok(borda.foco, "o foco do canto aparece inteiro");
    // entradas e cliques do modo padrão: sobem de leve e o desfoque some, sem ser seco
    await p.evaluate(() => window.sagadeck.goto(1, 0));
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector(".slide.current .e")).animationName), "enter-soft");
    assert.match(await p.evaluate(() => getComputedStyle(document.querySelector(".slide.current [data-step]")).transitionDuration), /0\.6s, 0\.8s/);
    // exportação (PDF/fotos): imagem inteira
    await p.goto(pathToFileURL(file).href + "?export=1#1.2");
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    await p.evaluate(() => window.sagadeck.goto(0, 2));
    assert.equal(await p.evaluate(() => document.querySelector(".spotlight-zoom").style.transform), "");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});
