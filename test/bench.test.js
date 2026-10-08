// Bancada de qualidade (src/ai/bench.js): a nota de cada quesito sai certa num deck e num material montados à mão.
// A geração de verdade, a partir dos PDFs, fica em test/bench-live.test.js (só com SAGADECK_LIVE=1).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scoreDeck, captionInsideCrop, saveBenchReport, BENCH_CHECKS } from "../src/ai/bench.js";

const f = (text, left, top, right, bottom) => ({ text, left, top, right, bottom });
// página 1: Figura 1 com a legenda DENTRO do recorte; Figura 2 com a legenda logo abaixo (fora); duas equações
// numeradas, só a (1) transcrita
const page1 = [
  f("Figura 1 – Mapa da bacia", 120, 380, 600, 395),
  f("Figura 2 – Série de vazões", 520, 720, 900, 735),
  f("𝑄 = 𝐶𝑖𝐴", 400, 820, 480, 833), f("(1)", 892, 820, 912, 833),
  f("𝑅𝑀𝑆𝐸 = √ ∑ 𝑒²", 380, 900, 520, 913), f("(2)", 892, 900, 912, 913),
];
const material = {
  name: "paper.pdf", text: "O pico foi de 37,67 m³/s em 2017, com NSE de 0,93.",
  inventory: { items: [
    { id: "a", kind: "figure", page: 1, caption: "Figura 1 – Mapa da bacia", image: "contexto/a.png", box: [100, 100, 600, 300] },
    { id: "b", kind: "figure", page: 1, caption: "Figura 2 – Série de vazões", image: "contexto/b.png", box: [500, 450, 420, 260] },
    { id: "t", kind: "table", page: 2, caption: "Tabela 1 – Métricas", image: "contexto/t.png", box: [100, 100, 800, 200], rows: [["Modelo", "NSE"], ["HYMOD", "0,93"], ["HEC-HMS", "0,97"]] },
    { id: "e", kind: "equation", page: 1, caption: "Eq. (1)", latex: "Q = CiA", box: [390, 815, 100, 25] },
  ] },
};
const layouts = { "paper.pdf": [{ text: page1, images: [] }, { text: [], images: [] }] };

const deck = (over = {}) => ({
  title: "Bacia", author: "Maria Clara Fava et al.", context: { autoria: "autor" },
  slides: [
    { layout: "cover", title: "Bacia do Aricanduva" },
    { layout: "split", title: "Área de estudo", figure: { image: "contexto/a.png" } },
    { layout: "stats", title: "Resultado", items: [{ value: "37,67", label: "pico (m³/s)" }, { value: "12,5", label: "inventado" }] },
    { layout: "statement", text: "Uma frase enorme que não acaba nunca e vira um slide de uma frase gigante na tela do congresso inteiro" },
    { layout: "poll", title: "Qual modelo?", options: ["HYMOD", "HEC-HMS"] },
  ],
  ...over,
});

test("bancada: cada quesito dá a nota pelo que o deck e o material mostram", () => {
  const r = scoreDeck(deck(), { materials: [material], layouts, briefing: "apresentação no congresso ICFM10", expect: { lang: "pt", author: "Fava", notAuthor: "Pessoa Preferida" } });
  const c = r.checks;
  assert.deepEqual(Object.keys(c).sort(), BENCH_CHECKS.map(([k]) => k).sort());
  assert.equal(c.figuras.detail, "1/3");
  assert.ok(c.figuras.faltam.some((x) => /Figura 2/.test(x)) && c.figuras.faltam.some((x) => /Tabela 1/.test(x)));
  assert.equal(c.recortes.detail, "1/2");
  assert.match(c.recortes.comLegenda[0], /Figura 1/);
  assert.equal(c.equacoes.detail, "1/2");
  assert.deepEqual(c.equacoes.faltam, ["p1 (2)"]);
  assert.deepEqual(c.numeros.semBase, ["slide 3: 12,5"]);
  assert.equal(c.autor.score, 1);
  assert.equal(c.votacao.score, 0);
  assert.equal(c.frases.detail, "slides 4");
  assert.ok(r.total > 0 && r.total < 100);
});

test("bancada: autor das Preferências, idioma errado e deck limpo", () => {
  const prefs = scoreDeck(deck({ author: "Pessoa Preferida" }), { materials: [material], expect: { author: "Fava", notAuthor: "Pessoa Preferida" } });
  assert.equal(prefs.checks.autor.score, 0);
  // sem o texto das páginas, recorte e equação ficam sem nota (não contam como bons)
  assert.equal(prefs.checks.recortes.score, null);
  assert.equal(prefs.checks.equacoes.score, null);
  const en = scoreDeck(deck(), { materials: [material], expect: { lang: "en" } });
  assert.equal(en.checks.idioma.score, 0, en.checks.idioma.detail);
  const clean = deck({ slides: [
    { layout: "cover", title: "Bacia" },
    { layout: "split", title: "Área", figure: { image: "contexto/a.png" } },
    { layout: "split", title: "Vazões", figure: { image: "contexto/b.png" } },
    { layout: "table", title: "Métricas", head: ["Modelo", "NSE"], rows: [["HYMOD", "0,93"], ["HEC-HMS", "0,97"]] },
  ] });
  const ok = scoreDeck(clean, { materials: [material], expect: { author: "Fava" } });
  for (const k of ["figuras", "numeros", "autor", "votacao", "frases"]) assert.equal(ok.checks[k].score, 1, `${k}: ${ok.checks[k].detail}`);
});

test("legenda ao lado (coluna vizinha) não conta como legenda dentro do recorte", () => {
  assert.equal(captionInsideCrop([100, 100, 300, 300], [f("Figura 3 – Outra coisa", 380, 200, 800, 215)]), null);
  assert.match(captionInsideCrop([100, 100, 300, 300], [f("Fonte: Os autores (2024).", 120, 380, 350, 392)]), /Fonte/);
});

test("relatório: grava json e md e compara com a rodada anterior", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-bancada-"));
  const caso = (total, figuras) => ({ id: "icfm10-en", file: "ICFM10.pdf", slides: 18, seconds: 600, total, checks: { figuras: { score: figuras, detail: "x" } } });
  const first = saveBenchReport(dir, { date: "2026-10-08T10:00:00.000Z", version: "1.4.0", commit: "aaa", model: "text", cases: [caso(70, 0.5)] });
  assert.equal(first.previous, null);
  const second = saveBenchReport(dir, { date: "2026-10-09T10:00:00.000Z", version: "1.4.1", commit: "bbb", model: "text", cases: [caso(85, 1), { id: "quebrado", file: "x.pdf", error: "LLM fora do ar" }] });
  assert.equal(second.previous.version, "1.4.0");
  assert.match(second.markdown, /\| icfm10-en \| 100 \(\+50\)/);
  assert.match(second.markdown, /\*\*85\*\* \(\+15\)/);
  assert.match(second.markdown, /Erro: LLM fora do ar/);
  assert.equal(fs.readdirSync(dir).length, 4);
});
