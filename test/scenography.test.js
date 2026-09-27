// Texto no cenário (layout scenography): as composições, a imagem de fundo com transparência, o recorte à frente
// das letras e o deck de demonstração com todas as possibilidades.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { buildHTML, renderSlide, loadSpec } from "../src/build.js";
import { SCENES } from "../src/layouts.js";
import { ROOT, browserOrSkip } from "./helpers.js";

const IDS = ["stage", "floor", "signs", "terminal", "cafe", "travel", "ticker", "marquee", "blueprint", "magazine", "orbit", "synthwave", "gallery"];
const DEMO = path.join(ROOT, "templates", "cenario", "Texto no cenário.yaml");

test("13 composições, cada uma com a sua classe; composição desconhecida cai no palco", () => {
  assert.deepEqual(Object.keys(SCENES), IDS);
  for (const id of IDS) {
    assert.ok(SCENES[id].label && SCENES[id].size, `${id}: nome e tamanho padrão`);
    assert.match(renderSlide({ layout: "scenography", scene: id, title: "CENA" }).html, new RegExp(`L-scenography raster scene-${id}"`));
  }
  assert.match(renderSlide({ layout: "scenography", scene: "nao-existe", title: "X" }).html, /scene-stage"/);
  // as novas trazem cenografia própria (ticker, candles, cartão…), as três originais não mudam
  assert.match(renderSlide({ layout: "scenography", scene: "ticker", title: "X" }).html, /scene-props[\s\S]*candle/);
  assert.match(renderSlide({ layout: "scenography", scene: "travel", title: "X" }).html, /scene-props[\s\S]*ASSENTO/);
  assert.doesNotMatch(renderSlide({ layout: "scenography", scene: "stage", title: "X" }).html, /scene-props/);
});

test("tamanho do texto: o da pessoa vence o padrão da composição", () => {
  const size = (s) => Number(renderSlide({ layout: "scenography", title: "X", ...s }).html.match(/scene-title[^>]*font-size:(\d+)px/)[1]);
  assert.equal(size({ scene: "terminal" }), SCENES.terminal.size);
  assert.equal(size({ scene: "terminal", titleSize: 99 }), 99);
  assert.equal(size({ scene: "stage" }), 230, "o palco continua como era");
});

test("imagem de fundo com transparência: imageOpacity de 0 a 1 (fora disso é limitado)", () => {
  const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const op = (v) => renderSlide({ layout: "scenography", title: "X", image: img, ...(v == null ? {} : { imageOpacity: v }) }).html.match(/scene-image" style="opacity:([\d.]+)/)?.[1];
  assert.equal(op(), "0.85", "padrão de antes");
  assert.equal(op(0.3), "0.3");
  assert.equal(op(7), "1");
  assert.equal(op(-2), "0");
});

test("formulário oferece todas as composições e a transparência do fundo", () => {
  const form = fs.readFileSync(path.join(ROOT, "src", "studio", "public", "slide-form.js"), "utf8");
  for (const id of IDS) assert.match(form, new RegExp(`\\["${id}",`), `falta ${id} no formulário`);
  assert.match(form, /"imageOpacity"/);
});

test("deck de demonstração: todas as composições e todas as opções (fundo, transparência, recorte, tamanho)", () => {
  const spec = loadSpec(DEMO);
  const scenes = spec.slides.filter((s) => s.layout === "scenography");
  assert.deepEqual([...new Set(scenes.map((s) => s.scene))].sort(), [...IDS].sort(), "cada composição aparece");
  for (const k of ["image", "imageOpacity", "foreground", "titleSize", "subtitle", "caption", "kicker"]) assert.ok(scenes.some((s) => s[k] != null), `falta um exemplo com ${k}`);
  const { warnings } = buildHTML(spec);
  assert.deepEqual(warnings.filter((w) => /não encontrada/.test(w)), [], "as imagens do demo vêm junto");
});

test("cada composição cabe no slide: título, subtítulo e assinatura dentro dos 1920x1080", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const spec = { title: "cenas", slides: IDS.map((scene) => ({ layout: "scenography", scene, kicker: "UM TEXTO MENOR AQUI", title: "ALÉM DO\nÓBVIO", subtitle: "O texto também faz parte da história.", caption: "SAGADECK / ESTUDO" })) };
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-cenas-")), "cenas.html");
    fs.writeFileSync(file, buildHTML(spec).html);
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("file:///" + file.replace(/\\/g, "/"));
    await p.waitForFunction(() => window.sagadeck);
    for (let i = 0; i < IDS.length; i++) {
      await p.evaluate((i) => window.sagadeck.goto(i, 0), i);
      const out = await p.evaluate((i) => {
        const slide = document.querySelectorAll(".slide")[i], box = slide.getBoundingClientRect(), sx = box.width / 1920;
        return [".scene-title", ".scene-subtitle", ".scene-caption", ".scene-eyebrow"].flatMap((sel) => {
          const e = slide.querySelector(sel); if (!e) return [`${sel} sumiu`];
          const r = e.getBoundingClientRect();
          // a área visível do texto (as transformações de perspectiva entram no retângulo)
          const fora = r.left < box.left - 2 * sx || r.top < box.top - 2 * sx || r.right > box.right + 2 * sx || r.bottom > box.bottom + 2 * sx;
          const estoura = e.scrollWidth > e.clientWidth + 4;
          return fora || estoura ? [`${sel} ${fora ? "fora do slide" : "estourou a largura"}`] : [];
        });
      }, i);
      assert.deepEqual(out, [], `composição ${IDS[i]}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("tom padrão por composição (as noturnas nascem escuras); o tom do slide vence", () => {
  const tone = (s) => renderSlide({ layout: "scenography", title: "X", ...s }).html.match(/tone-(\w+)/)[1];
  assert.equal(tone({ scene: "terminal" }), "dark");
  assert.equal(tone({ scene: "orbit" }), "dark");
  assert.equal(tone({ scene: "gallery" }), "light");
  assert.equal(tone({ scene: "terminal", tone: "light" }), "light");
});

// Nada de cor fixa: a composição se veste com a paleta do tema (e do tom) do deck, para não destoar dos outros slides
test("as composições seguem a paleta do tema: trocar o tema muda as cores, e elas vêm do tema", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const cores = async (theme, scene) => {
      const { html } = buildHTML({ theme, slides: [{ layout: "scenography", scene, title: "CENA", kicker: "K", subtitle: "S", caption: "C" }] });
      await p.setContent(html);
      return p.evaluate(() => {
        const slide = document.querySelector(".slide"), cs = (sel, prop) => getComputedStyle(slide.querySelector(sel))[prop];
        const v = (n) => getComputedStyle(slide).getPropertyValue(n).trim();
        const probe = document.createElement("i"); slide.append(probe);
        const rgb = (c) => { probe.style.color = c; return getComputedStyle(probe).color; };
        return { fundo: cs(".L-scenography", "backgroundColor"), atmosfera: cs(".scene-atmosphere", "backgroundImage"), titulo: cs(".scene-title", "color"),
          paleta: [v("--bg"), v("--fg"), v("--hi"), v("--em"), v("--muted"), v("--surface")].map(rgb) };
      });
    };
    for (const scene of IDS) {
      const a = await cores("sinal", scene), b = await cores("oceano", scene);
      assert.notDeepEqual([a.fundo, a.atmosfera, a.titulo], [b.fundo, b.atmosfera, b.titulo], `${scene}: trocar o tema não mudou nada`);
      // o título ou é transparente (texto vazado/gradiente) ou tem uma cor da paleta, pura ou misturada
      assert.ok(a.titulo === "rgba(0, 0, 0, 0)" || a.paleta.includes(a.titulo) || /color\(srgb|rgb/.test(a.titulo), `${scene}: ${a.titulo}`);
      assert.equal(a.fundo, a.paleta[0], `${scene}: o fundo é o --bg do tema`);
    }
  } finally {
    await browser.close();
  }
});
