// Carrossel: um item por clique; arc (roda que gira) e rings (anéis que giram em sentidos opostos e travam).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { buildHTML, renderSlide } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { ROOT, browserOrSkip, newPage, startStudio, tempDeck, novoSlide } from "./helpers.js";

const FOTO = path.join(ROOT, "src", "studio", "assets", "imagens", "lavanda-cover.jpg");

test("carrossel: sem foto usa a de demonstração (desenhada, offline); com foto usa a da pessoa, embutida", () => {
  const dir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "sd-car-"));
  fs.mkdirSync(path.join(dir, "imagens"));
  fs.copyFileSync(FOTO, path.join(dir, "imagens", "minha.jpg"));
  const ctx = { theme: "sinal", slides: [], _dir: dir }; // a pasta do deck (imagens relativas a ela)
  const s = { layout: "carousel", title: "Lugares", items: [{ title: "Meu lugar", image: "imagens/minha.jpg" }, { title: "Mar", text: "Raso" }, { title: "Cidade" }] };
  const html = renderSlide(s, 0, ctx).html;
  assert.match(html, /data-lesson="carousel" data-lesson-count="3"/);
  assert.match(html, /class="car-item active" data-lesson-k="0"[\s\S]*?src="data:image\/jpeg;base64,/, "a foto da pessoa vai embutida");
  assert.match(html, /data-lesson-k="1"[\s\S]*?src="data:image\/svg\+xml;base64,/, "sem foto: demonstração em SVG");
  assert.doesNotMatch(html, /https?:\/\//, "nada pede coisa à internet");
  const rings = renderSlide({ ...s, style: "rings" }, 0, ctx).html;
  assert.match(rings, /car-ring-out[\s\S]*car-ring-in/);
  assert.equal((rings.match(/class="car-dot[ "]/g) || []).length, 3);
  // foto que não existe: aviso e cai para a de demonstração (o slide não quebra)
  const r = buildHTML({ ...ctx, title: "C", slides: [{ layout: "carousel", items: [{ title: "x", image: "imagens/nao.jpg" }] }] });
  assert.match(r.html, /image\/svg\+xml/);
  assert.match(r.warnings.join(" "), /não encontrada/);
});

test("carrossel na apresentação: o clique gira a roda até o item e troca o texto; nos anéis, os dois giram em sentidos opostos", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "car.html");
    fs.writeFileSync(file, buildHTML({ title: "C", theme: "sinal", slides: [LAYOUT_SAMPLES.carousel, { ...LAYOUT_SAMPLES.carousel, style: "rings" }] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    assert.equal(await p.evaluate(() => window.sagadeck.steps(0)), 4, "5 itens = 4 cliques");
    await p.keyboard.press("ArrowRight");
    const st = await p.evaluate(() => {
      const root = document.querySelector('section[data-idx="0"] .L-carousel');
      return { i: root.style.getPropertyValue("--lesson-i"), active: root.querySelector(".car-text.active")?.textContent, past: root.querySelectorAll(".car-text.past").length, wheel: getComputedStyle(root.querySelector(".car-wheel")).transitionProperty };
    });
    assert.equal(st.i, "1");
    assert.match(st.active, /Mar/);
    assert.equal(st.past, 1, "o item anterior saiu (past)");
    assert.match(st.wheel, /transform/, "a roda gira com transição, não pula");
    await p.evaluate(() => window.sagadeck.goto(1, 2));
    const anim = await p.evaluate(() => {
      const sl = document.querySelector('section[data-idx="1"] .car-slide.active');
      return [getComputedStyle(sl.querySelector(".car-ring-out")).animationName, getComputedStyle(sl.querySelector(".car-ring-in")).animationName];
    });
    assert.deepEqual(anim, ["car-ccw", "car-cw"], "anel de fora anti-horário, de dentro horário");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: carrossel na galeria; escolher a sua foto no item grava no deck", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await novoSlide(p, "carousel");
    const idx = saved().slides.findIndex((s) => s.layout === "carousel");
    await p.waitForSelector("#rendered-slide-container .L-carousel .car-wheel");
    // estilo em anéis
    await p.locator("#slide-fields-form .sf-field").filter({ hasText: "Estilo" }).locator("select").first().selectOption("rings");
    await p.waitForSelector("#rendered-slide-container .car-rings");
    // foto do primeiro item
    const pick = p.locator("#slide-fields-form [data-photo-pick]").first();
    if (!(await pick.isVisible())) await p.locator("#slide-fields-form .sf-item-toggle").first().click();
    const chooser = p.waitForEvent("filechooser");
    await pick.click();
    await (await chooser).setFiles(FOTO);
    for (let k = 0; k < 40 && !String(saved().slides[idx].items?.[0]?.image || "").startsWith("data:image/jpeg"); k++) await p.waitForTimeout(100);
    const s = saved().slides[idx];
    assert.equal(s.style, "rings");
    assert.match(s.items[0].image, /^data:image\/jpeg;base64,/);
    await p.waitForFunction(() => document.querySelector('#rendered-slide-container .car-slide[data-lesson-k="0"] img')?.src.startsWith("data:image/jpeg"));
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
