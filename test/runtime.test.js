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
  fs.writeFileSync(file, buildHTML(loadSpec(deck.file)).html);
  const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
  await page.goto(pathToFileURL(file).href + "?export=1");
  await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
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

  await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));

  await browser.close();
  deck.cleanup();
});
