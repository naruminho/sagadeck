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
        document.getAnimations().forEach((an) => an.finish()); // mede o arranjo final, não a entrada animada no meio
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
      // o par claro/escuro (manual ↔ manual-noite) tem o mesmo arranjo de propósito
      const iguais = NAMES.filter((n, i) => NAMES.findIndex((m) => vistas.get(m) === vistas.get(n) && THEMES[n].pair !== m) !== i);
      assert.deepEqual(iguais, [], `${nome}: temas com o mesmo arranjo: ${iguais.join(", ")}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Pedido do Naruminho (papel do "preguiçoso"): trocar o tema tem que mudar o slide de verdade, não só cor e fonte —
// também nos slides do meio (título, cartões, lista, citação, número grande, KPIs), não só capa/seção/fim.
// A assinatura ignora cor, fonte e raio (isso toda troca já muda) e olha só o arranjo: alinhamento, fios, barras,
// fundo ou não, sombra, formato do marcador.
const CONTEUDO = [
  ["cartões", { layout: "cards", kicker: "Visão geral", title: "Três pilares do projeto", items: [{ icon: "shield", title: "Seguro", text: "Dados protegidos de ponta a ponta." }, { icon: "zap", title: "Rápido", text: "Resposta em menos de um segundo." }, { icon: "smile", title: "Simples", text: "Nada de manual para começar." }] }],
  ["lista", { layout: "list", kicker: "Agenda", title: "O que vamos ver", items: ["Contexto e problema", "O que já testamos", "Proposta e próximos passos"] }],
  ["citação", { layout: "quote", quote: "A simplicidade é o último grau de sofisticação.", by: "Leonardo da Vinci", role: "atribuída" }],
  ["número", { layout: "number", kicker: "Resultado", value: 42, suffix: "%", label: "menos tempo por atendimento", context: "Comparado ao trimestre anterior." }],
  ["KPIs", { layout: "stats", title: "Indicadores do trimestre", stats: [{ value: "98%", label: "Disponibilidade" }, { value: "1,2 s", label: "Tempo de resposta" }, { value: "4,8", label: "Satisfação" }] }],
  ["frase", { layout: "statement", kicker: "A ideia", text: "Menos cliques, mais ==conteúdo==." }],
];

test("trocar o tema muda o arranjo também nos slides de conteúdo (título, cartões, lista, citação, número, KPIs)", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const assinatura = async (theme, slide) => {
      await p.setContent(buildHTML({ theme, slides: [slide] }).html);
      await p.evaluate(() => document.fonts.ready);
      return p.evaluate(() => {
        const s = document.querySelector(".slide"), q = (sel) => s.querySelector(sel), cs = (e) => e && getComputedStyle(e);
        const lados = (e) => e ? ["Top", "Right", "Bottom", "Left"].filter((d) => parseFloat(cs(e)[`border${d}Width`]) > 0 && cs(e)[`border${d}Style`] !== "none").join("") : "";
        const fundo = (e) => e ? (cs(e).backgroundColor !== "rgba(0, 0, 0, 0)" || cs(e).backgroundImage !== "none" ? "fundo" : "vazio") : "";
        const forma = (e) => { if (!e) return ""; const r = parseFloat(cs(e).borderTopLeftRadius), h = e.getBoundingClientRect().height; return r >= h * 0.4 ? "círculo" : r > 0 ? "arredondado" : "reto"; };
        const pedaco = (e) => e ? [lados(e), fundo(e), forma(e), cs(e).boxShadow !== "none" ? "sombra" : "", cs(e).transform !== "none" ? "girado" : "", cs(e).textAlign].join(",") : "-";
        const hd = q(".hd"), ttl = q(".hd .ttl") || q(".ttl");
        const arranjo = {
          titulo: [pedaco(hd), pedaco(ttl), hd && cs(hd).alignItems].join("|"),
          cartao: pedaco(q(".card, .stat-card")),
          marcador: pedaco(q(".li-n, .li-b")),
          citacao: [pedaco(q(".L-quote")), pedaco(q(".q-text")), pedaco(q(".q-mark")), q(".L-quote") && cs(q(".L-quote")).alignItems].join("|"),
          numero: [pedaco(q(".nb-val")), pedaco(q(".nb-main"))].join("|"),
          frase: [pedaco(q(".L-statement")), pedaco(q(".st-body"))].join("|"),
        };
        const r = (e) => e.getBoundingClientRect();
        const fora = [...s.querySelectorAll(".t")].filter((e) => { const b = r(e); return b.width && (b.left < -2 || b.top < -2 || b.right > 1922 || b.bottom > 1082); }).length;
        const vaza = [...s.querySelectorAll("[data-fit]")].filter((e) => e.scrollHeight > e.clientHeight + parseFloat(cs(e).fontSize) * 0.3).length;
        // texto curto não tem motivo para encolher (pegou o ajuste contando um elemento escondido como "fora do slide")
        const encolheu = [...s.querySelectorAll("[data-fit]")].filter((e) => e.dataset.fs0 && parseFloat(e.style.fontSize) < +e.dataset.fs0 * 0.6).length;
        return { arranjo: JSON.stringify(arranjo), fora, vaza, encolheu };
      });
    };
    for (const [nome, slide] of CONTEUDO) {
      const vistas = new Map();
      for (const n of NAMES) {
        const a = await assinatura(n, slide);
        assert.equal(a.fora, 0, `${nome} no tema ${n}: texto saiu do slide`);
        assert.equal(a.vaza, 0, `${nome} no tema ${n}: texto não coube`);
        assert.equal(a.encolheu, 0, `${nome} no tema ${n}: texto curto encolheu sem motivo`);
        vistas.set(n, a.arranjo);
      }
      const distintos = new Set(vistas.values()).size;
      const grupos = [...new Set(vistas.values())].map((v) => NAMES.filter((n) => vistas.get(n) === v)).filter((g) => g.length > 1).map((g) => g.join("=")).join("; ");
      assert.ok(distintos >= 8, `${nome}: só ${distintos} arranjos diferentes em ${NAMES.length} temas (o resto só troca cor e fonte): ${grupos}`);
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
