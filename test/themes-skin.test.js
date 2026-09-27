// Temas que mudam de verdade (como no PowerPoint): além de cor e fonte, cada tema tem a sua "pele": capa, seção e
// encerramento arrumados do seu jeito e ornamentos próprios (fita, moldura, faixa de aviso, janela de terminal...).
// E o tema pode ser só de um slide (theme: no slide), sem mexer no resto da apresentação.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHTML, renderSlide } from "../src/build.js";
import { THEMES } from "../src/themes.js";
import { browserOrSkip } from "./helpers.js";

const NAMES = Object.keys(THEMES);
const COVER = { layout: "cover", kicker: "Workshop", title: "Ideias que mudam o jogo", subtitle: "Um subtítulo de uma linha", author: "Seu nome" };
const SECTION = { layout: "section", number: "02", kicker: "Parte dois", title: "O caminho", subtitle: "Como chegamos aqui" };

test("todo slide diz qual tema ele usa (th-<tema>) e leva os ornamentos da pele", () => {
  const { html } = buildHTML({ theme: "jornal", slides: [COVER, { layout: "statement", text: "Uma ideia" }] });
  assert.equal((html.match(/<section class="slide[^"]* th-jornal/g) || []).length, 2);
  assert.match(html, /<div class="orn" aria-hidden="true">/);
  // cada pele vem num arquivo próprio e existe para todos os temas
  for (const n of NAMES) assert.match(buildHTML({ theme: n, slides: [COVER] }).html, new RegExp(`\\.th-${n}[ .:\\[]`), `falta a pele do tema ${n}`);
});

test("tema por slide: só aquele slide muda; o CSS do outro tema vem junto, restrito a ele", () => {
  const { html } = buildHTML({ theme: "sinal", slides: [COVER, { ...SECTION, theme: "oceano" }, { layout: "statement", text: "x" }] });
  const classes = [...html.matchAll(/<section class="slide([^"]*)"/g)].map((m) => m[1]);
  assert.match(classes[0], /th-sinal/);
  assert.match(classes[1], /th-oceano/);
  assert.match(classes[2], /th-sinal/);
  assert.match(html, /\.slide\.lk-oceano\.tone-accent\{--bg:/, "tons do oceano restritos ao slide");
  assert.match(html, /\.slide\.th-oceano \.f-display\{/, "e as fontes do oceano também");
  // no Studio (um slide por vez): o CSS devolvido já traz todos os temas do deck, para as miniaturas não piscarem
  const spec = { theme: "sinal", slides: [COVER, { ...SECTION, theme: "oceano" }] };
  const r = renderSlide(spec.slides[0], 0, spec);
  assert.match(r.themeCSS, /\.slide\.lk-oceano/);
  assert.match(renderSlide(spec.slides[1], 1, spec).html, /th-oceano/);
  assert.throws(() => buildHTML({ slides: [{ ...COVER, theme: "nao-existe" }] }), /Tema desconhecido/);
});

test("trocar o tema muda o arranjo, não só a cor: capa e seção têm geometria diferente em cada tema", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const assinatura = async (theme, slide) => {
      await p.setContent(buildHTML({ theme, slides: [slide] }).html);
      return p.evaluate(() => {
        const s = document.querySelector(".slide"), r = (e) => e && e.getBoundingClientRect(), q = (sel) => s.querySelector(sel);
        const ttl = r(q(".ttl")), k = q(".kicker"), cs = (e) => e && getComputedStyle(e);
        const orn = [...s.querySelectorAll(".orn i")].filter((i) => cs(i).display !== "none" && r(i).width * r(i).height > 0).length;
        const fora = [...s.querySelectorAll(".t")].filter((e) => { const b = r(e); return b.width && (b.left < -2 || b.top < -2 || b.right > 1922 || b.bottom > 1082); }).length;
        return { x: Math.round(ttl.left / 40), y: Math.round(ttl.top / 40), w: Math.round(ttl.width / 80), align: cs(q(".ttl")).textAlign,
          kicker: k ? [cs(k).backgroundColor !== "rgba(0, 0, 0, 0)", cs(k).borderTopStyle, cs(k).textTransform].join("/") : "-", orn, fora };
      });
    };
    for (const [nome, slide] of [["capa", COVER], ["seção", SECTION]]) {
      const vistas = new Map();
      for (const n of NAMES) {
        const a = await assinatura(n, slide);
        assert.equal(a.fora, 0, `${nome} no tema ${n}: texto saiu do slide`);
        vistas.set(n, JSON.stringify({ ...a, fora: undefined }));
      }
      const iguais = NAMES.filter((n, i) => NAMES.findIndex((m) => vistas.get(m) === vistas.get(n)) !== i);
      assert.deepEqual(iguais, [], `${nome}: temas com o mesmo arranjo: ${iguais.join(", ")}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("paletas: independentes do tema, no deck ou num slide; cada uma gera os quatro tons com contraste", async () => {
  const { PALETTES, resolveTheme } = await import("../src/themes.js");
  assert.ok(Object.keys(PALETTES).length >= 8);
  const lum = (h) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const [name] of Object.entries(PALETTES)) for (const theme of ["sinal", "bauhaus"]) {
    const t = resolveTheme(theme, name);
    assert.equal(t.name, theme, "a paleta não troca o tema (fontes e pele continuam)");
    for (const [tone, m] of Object.entries(t.tones)) {
      const c = (v) => t.colors[v] || v;
      assert.ok(ratio(c(m.bg), c(m.fg)) >= 3, `${name}/${tone}: texto sem contraste (${c(m.fg)} em ${c(m.bg)})`);
    }
  }
  // no deck: todos os slides; num slide: só ele
  const deck = buildHTML({ theme: "sinal", palette: "floresta", slides: [COVER, { ...SECTION, palette: "cereja" }, { ...COVER, palette: "tema" }] }).html;
  const cls = [...deck.matchAll(/<section class="slide([^"]*)"/g)].map((m) => m[1]);
  assert.match(cls[0], /lk-sinal--floresta/);
  assert.match(cls[1], /th-sinal lk-sinal--cereja/);
  assert.match(cls[2], /lk-sinal /, "palette: tema volta às cores do tema");
  assert.match(deck, /--c-accent:#2F7D4F/, "a paleta do deck vale no :root");
  assert.throws(() => buildHTML({ palette: "nao-existe", slides: [COVER] }), /Paleta desconhecida/);
});
