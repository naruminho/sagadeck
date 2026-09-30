// Proporção do slide (deck.aspect): 16:9, 4:3, retrato e qualquer L:A — do YAML à apresentação, ao PDF, ao PPTX e ao Studio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import JSZip from "jszip";
import { parseAspect, slideSize, convertAspect } from "../src/aspect.js";
import { buildHTML } from "../src/build.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("proporção: entende 16:9, 4:3, 4/3, 5x4, 1.5, A4 e {w,h}; a altura acompanha; trocar reescala o que tem posição livre", () => {
  assert.deepEqual(parseAspect("4:3"), [4, 3]);
  assert.deepEqual(parseAspect("4/3"), [4, 3]);
  assert.deepEqual(parseAspect("5x4"), [5, 4]);
  assert.deepEqual(parseAspect("1,5"), [1.5, 1]);
  assert.deepEqual(parseAspect({ w: 1200, h: 900 }), [1200, 900]);
  assert.deepEqual(parseAspect("A4"), [297, 210]);
  assert.equal(parseAspect("banana"), null);
  assert.deepEqual([slideSize({}).h, slideSize({ aspect: "4:3" }).h, slideSize({ aspect: "9:16" }).h], [1080, 1440, 3413]);
  assert.equal(slideSize({ aspect: "4:3" }).label, "4:3");
  const spec = { slides: [{ layout: "canvas", elements: [{ x: 100, y: 540, w: 400, h: 200 }] }, { layout: "cover", title: "x", visualEdits: { a: { dx: 10, dy: 100 } } }] };
  const to = convertAspect(spec, "4:3");
  assert.deepEqual(to.slides[0].elements[0], { x: 100, y: 720, w: 400, h: 267 }, "y e h acompanham a nova altura; x e w ficam");
  assert.deepEqual(to.slides[1].visualEdits.a, { dx: 10, dy: 133 });
  assert.equal(spec.slides[0].elements[0].y, 540, "o deck original não muda");
  // o HTML sai com o tamanho do slide
  const html = buildHTML({ title: "t", aspect: "4:3", slides: [{ layout: "cover", title: "Capa" }] }).html;
  assert.match(html, /style="--sh:1440px;--aspect:1920 \/ 1440"/);
  assert.match(html, /<canvas id="draw-canvas" width="1920" height="1440">/);
  assert.match(buildHTML({ title: "t", aspect: "9:16", slides: [{ layout: "cover", title: "Capa" }] }).html, /data-orient="portrait"/);
});

test("proporção na apresentação, no PDF e no PPTX: 4:3 sai 4:3, sem faixa nem corte", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "q.html");
    const built = buildHTML({ title: "Q", aspect: "4:3", slides: [{ layout: "cover", title: "Capa" }, { layout: "list", title: "Lista", items: ["um", "dois"] }] });
    fs.writeFileSync(file, built.html);
    const { page: p, errors } = await newPage(browser, null, { width: 1200, height: 900 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    const st = await p.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { w: r.width, h: r.height, size: window.sagadeck.size }; });
    assert.deepEqual(st.size, { w: 1920, h: 1440 });
    assert.ok(Math.abs(st.w / st.h - 4 / 3) < 0.01, `o palco é 4:3 (${st.w}×${st.h})`);
    assert.ok(st.w <= 1200.5 && st.h <= 900.5, "cabe na janela");
    assert.deepEqual(errors, []);
    const { pdf } = await import("../src/export/shots.js");
    const out = path.join(deck.dir, "q.pdf");
    await pdf(file, out);
    const box = fs.readFileSync(out, "latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(box && Math.abs(+box[1] / +box[2] - 4 / 3) < 0.01, `página do PDF 4:3 (${box?.slice(1)})`);
    const { exportPptx } = await import("../src/export/pptx.js");
    const pp = path.join(deck.dir, "q.pptx");
    await exportPptx(file, pp, { theme: built.theme, meta: { ...built.meta, slides: built.slidesMeta } });
    const pres = await (await JSZip.loadAsync(fs.readFileSync(pp))).file("ppt/presentation.xml").async("string");
    const sz = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
    assert.ok(sz && Math.abs(+sz[1] / +sz[2] - 4 / 3) < 0.01, `slide do PPTX 4:3 (${sz?.slice(1)})`);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: trocar a proporção em Propriedades › Apresentação grava no deck, reescala o livre e o quadro acompanha", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
  spec.slides.push({ layout: "canvas", elements: [{ x: 100, y: 540, w: 400, h: 200, body: "Livre" }] });
  fs.writeFileSync(deckFile.file, YAML.stringify(spec));
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await p.click("#tab-btn-inspect");
    await p.locator('#inspector-body select[data-k="aspect"]').selectOption("4:3");
    for (let k = 0; k < 40 && saved().aspect !== "4:3"; k++) await p.waitForTimeout(100);
    assert.equal(saved().aspect, "4:3");
    assert.equal(saved().slides.at(-1).elements[0].y, 720, "o elemento livre foi reescalado");
    await p.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--sh").trim() === "1440px");
    const r = await p.evaluate(() => { const b = document.querySelector(".thumb-screen").getBoundingClientRect(); const s = document.getElementById("slide-stage").getBoundingClientRect(); return [b.width / b.height, s.width / s.height]; });
    assert.ok(r.every((x) => Math.abs(x - 4 / 3) < 0.02), `miniatura e quadro em 4:3 (${r})`);
    // personalizada
    p.once("dialog", (d) => d.accept("5:4"));
    await p.locator('#inspector-body select[data-k="aspect"]').selectOption("__custom");
    for (let k = 0; k < 40 && saved().aspect !== "5:4"; k++) await p.waitForTimeout(100);
    assert.equal(saved().aspect, "5:4");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
