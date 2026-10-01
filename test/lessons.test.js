// Slides de aula: exercício resolvido (solution), calculadora ao vivo (calc), algoritmo animado (algo) — e as demos
// de hidráulica e algoritmos que usam tudo isso.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { traceAlgorithm } from "../src/algo-trace.js";
import { calcModel, calcEvaluate } from "../src/lessons.js";
import { buildHTML, renderSlide } from "../src/build.js";
import { demoDeck, DEMO_NAMES } from "../src/studio/demo-decks.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip, newPage, startStudio, tempDeck, novoSlide } from "./helpers.js";

const ctx = { theme: "sinal", slides: [] };

test("algoritmos: o motor roda de verdade (ordena, conta comparações e trocas, acha o alvo) e recusa o que não dá", () => {
  const v = [5, 1, 4, 2, 8, 3];
  for (const al of ["bubble", "insertion", "selection", "merge", "quick"]) {
    const t = traceAlgorithm(al, v);
    assert.deepEqual(t.at(-1).arr, [1, 2, 3, 4, 5, 8], `${al} ordena`);
    assert.deepEqual(t.at(-1).sorted, [0, 1, 2, 3, 4, 5], `${al}: no fim, tudo marcado como ordenado`);
  }
  const bubble = traceAlgorithm("bubble", v).at(-1);
  assert.equal(bubble.comparisons, 14); assert.equal(bubble.swaps, 7);
  const swap = traceAlgorithm("bubble", v).find((s) => s.swap);
  assert.deepEqual(swap.swap, [0, 1]); assert.deepEqual(swap.arr.slice(0, 2), [1, 5], "o passo da troca já mostra o vetor trocado");
  const bin = traceAlgorithm("binary", [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], { target: 23 });
  assert.equal(bin.at(-1).found, 5);
  assert.ok(bin.at(-1).comparisons <= Math.ceil(Math.log2(10)), "binária: no máximo log2(n) comparações");
  assert.equal(traceAlgorithm("linear", [2, 5, 8, 23], { target: 23 }).at(-1).comparisons, 4);
  assert.match(traceAlgorithm("binary", [9, 3, 7], { target: 7 })[0].text, /ordenado/, "binária ordena antes (e diz)");
  assert.throws(() => traceAlgorithm("bogo", [1]), /não existe/);
  assert.throws(() => traceAlgorithm("bubble", Array(17).fill(1)), /até 16/);
});

test("slides de aula: exercício um passo por clique até a resposta; calculadora com faixas e fórmula por faixa; algoritmo com código e Tocar", () => {
  const sol = renderSlide({ layout: "solution", title: "Ex", problem: "Quanto é?", givens: [{ symbol: "D", value: "0,05", unit: "m", label: "diâmetro" }], find: "x", steps: [{ text: "a", latex: "1+1" }, { text: "b", latex: "2+2" }], answer: { latex: "4" } }, 0, ctx).html;
  assert.match(sol, /data-lesson-count="4"/, "enunciado + 2 passos + resposta");
  assert.match(sol, /Por onde você começaria\?/);
  assert.equal((sol.match(/class="sol-answer"/g) || []).length, 1, "a resposta só no último quadro");
  assert.match(sol, /0\{,\}05|0<span class="mpunct">,<\/span>05|0,05/, "vírgula decimal nos dados");
  const nums = renderSlide({ layout: "solution", givens: [{ symbol: "a", value: 0.000001 }, { symbol: "b", value: 1500 }, { symbol: "c", value: 1.5 }], steps: [] }, 0, ctx).html;
  const texs = [...nums.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((m) => m[1]);
  assert.deepEqual(texs, [String.raw`a = 1\times10^{-6}`, String.raw`b = 1\,500`, "c = 1{,}5"], "dado numérico: notação científica, milhar e vírgula decimal");
  // calculadora: nomes longos (nu, eps) valem como variável; faixa escolhe texto e fórmula
  const m = calcModel(LAYOUT_SAMPLES.calc);
  const r = calcEvaluate(m);
  assert.equal(Math.round(r.Re.value), 75000);
  assert.equal(r.regime.text, "Turbulento");
  assert.equal(calcEvaluate(m, { V: 0.02 }).regime.text, "Laminar");
  const hid = demoDeck("hidraulica").slides.find((s) => s.layout === "calc");
  const hm = calcModel(hid);
  assert.equal(calcEvaluate(hm, { V: 0.02 }).f.value.toFixed(4), (64 / (0.02 * 0.05 / 0.000001004)).toFixed(4), "laminar: f = 64/Re");
  assert.equal(calcEvaluate(hm).f.value.toFixed(3), "0.023", "turbulento: Swamee–Jain");
  const calc = renderSlide(LAYOUT_SAMPLES.calc, 0, ctx).html;
  assert.match(calc, /data-calc-in="V"/); assert.match(calc, /class="calc-pointer"/); assert.match(calc, />Turbulento</);
  assert.equal(globalThis.SagaCalc.format(0.0000012), "1,20 × 10⁻⁶");
  const algo = renderSlide({ layout: "algo", algorithm: "quick", array: [3, 1, 2] }, 0, ctx).html;
  assert.match(algo, /data-autoplay/); assert.match(algo, /algo-code/); assert.match(algo, /class="now"/);
  const bad = renderSlide({ layout: "algo", algorithm: "bubble", array: ["x"] }, 0, ctx).html;
  assert.match(bad, /lista de números/, "vetor inválido: o slide diz o que falta, sem quebrar");
});

test("demos de aula e capas: hidráulica e algoritmos sem avisos; cada demo da vitrine com capa própria", () => {
  for (const k of ["hidraulica", "algoritmos"]) assert.deepEqual(buildHTML(demoDeck(k)).warnings, [], k);
  const layouts = demoDeck("hidraulica").slides.map((s) => s.layout);
  for (const l of ["solution", "calc", "science"]) assert.ok(layouts.includes(l));
  assert.ok(demoDeck("algoritmos").slides.filter((s) => s.layout === "algo").length >= 4);
  // as capas não podem parecer a mesma: tema + tom + figura diferentes
  const looks = Object.keys(DEMO_NAMES).filter((k) => !/^(perspectiva|essencial|revista|cromatico|tracos)$/.test(k)).map((k) => { const d = demoDeck(k); return JSON.stringify([d.theme, d.slides[0].tone, d.slides[0].figure?.icon || d.slides[0].figure?.image || ""]); });
  assert.equal(new Set(looks).size, looks.length, `capas repetidas: ${looks.join(" ")}`);
});

test("aula na apresentação: exercício avança por clique, calculadora recalcula ao arrastar, Tocar anda sozinho", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "aula.html");
    fs.writeFileSync(file, buildHTML({ title: "A", theme: "sinal", slides: [LAYOUT_SAMPLES.solution, LAYOUT_SAMPLES.calc, { ...LAYOUT_SAMPLES.algo, speed: 250 }] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    const frame = (i) => p.evaluate((i) => +document.querySelector(`section[data-idx="${i}"] .dyn-frame.active`).dataset.lessonPanel, i);
    await p.keyboard.press("ArrowRight");
    assert.equal(await frame(0), 1);
    assert.equal(await p.locator('section[data-idx="0"] .dyn-frame.active .sol-step').count(), 1);
    // calculadora: arrastar a velocidade para baixo vira laminar
    await p.evaluate(() => window.sagadeck.goto(1, 0));
    await p.locator('section[data-idx="1"] [data-calc-in="V"]').evaluate((el) => { el.value = "0.02"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.equal(await p.locator('section[data-idx="1"] [data-calc-badge="regime"]').innerText(), "Laminar");
    assert.equal(await p.locator('section[data-idx="1"] [data-calc-out="Re"]').innerText(), "1.000");
    // Tocar: os passos andam sozinhos até o fim
    await p.evaluate(() => window.sagadeck.goto(2, 0));
    await p.click('section[data-idx="2"] [data-autoplay]');
    await p.waitForTimeout(900);
    const k = await frame(2);
    assert.ok(k >= 2, `andou sozinho (${k})`);
    await p.click('section[data-idx="2"] [data-autoplay]'); // pausa
    const k2 = await frame(2); await p.waitForTimeout(600);
    assert.equal(await frame(2), k2, "pausado não anda");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: categoria de aula na galeria; algoritmo e números pelo formulário; calculadora funciona no editor; barra da esquerda abre nos slides", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    assert.ok(await p.locator("#rail-tab-slides.active").count() && await p.locator("#thumbnails-list:not(.hidden)").count(), "abre nos slides");
    await p.click('.ribbon-tab[data-tab="inicio"]'); await p.click("#btn-scenes");
    await p.click('#scene-modal [data-scene-filter="aula"]');
    const cards = await p.locator("#scene-grid .scene-card:not([hidden])").evaluateAll((els) => els.map((e) => e.dataset.scene));
    for (const k of ["solution", "calc", "algo"]) assert.ok(cards.includes(k), `${k} na categoria de aula`);
    await p.keyboard.press("Escape");
    await novoSlide(p, "algo");
    const idx = saved().slides.findIndex((s) => s.layout === "algo");
    await p.locator("#slide-fields-form .sf-field").filter({ hasText: "Algoritmo" }).locator("select").first().selectOption("quick");
    await p.waitForSelector("#rendered-slide-container .L-algo");
    for (let k = 0; k < 30 && saved().slides[idx].algorithm !== "quick"; k++) await p.waitForTimeout(100);
    assert.equal(saved().slides[idx].algorithm, "quick");
    await novoSlide(p, "calc");
    await p.waitForSelector('#rendered-slide-container [data-calc-in="V"]');
    await p.locator('#rendered-slide-container [data-calc-in="V"]').evaluate((el) => { el.value = "0.02"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.equal(await p.locator('#rendered-slide-container [data-calc-badge="regime"]').innerText(), "Laminar", "no editor, a calculadora também responde");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("prever → rodar → explicar: o algo abre com a aposta, roda os passos e fecha com o porquê", async (t) => {
  const s = { layout: "algo", algorithm: "bubble", array: [3, 1, 2], predict: { question: "Quantas trocas?", options: ["1", "2", "3"], answer: "2 trocas" }, explain: "O 3 sobe trocando com o 1 e depois com o 2." };
  const plain = { ...s }; delete plain.predict; delete plain.explain;
  const count = (h) => +h.match(/data-lesson-count="(\d+)"/)[1];
  const h = renderSlide(s, 0, { slides: [s] }).html, h0 = renderSlide(plain, 0, { slides: [plain] }).html;
  assert.equal(count(h), count(h0) + 2, "um quadro antes e um depois");
  assert.deepEqual([...h.matchAll(/data-lesson-panel="(\d+)"/g)].map((m) => +m[1]), Array.from({ length: count(h) }, (_, i) => i));
  assert.equal((h.match(/ active"/g) || []).length, 1);
  // o mesmo vale para o programa rastreado (program:)
  const tr = { layout: "algo", program: "def f(v):\n    v.append(1)\n    return v", call: "f([2])", predict: "O que sai?" };
  assert.match(renderSlide(tr, 0, { slides: [tr] }).html, /algo-predict/);
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "prever.html");
    fs.writeFileSync(file, buildHTML({ title: "A", theme: "sinal", slides: [s] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    const active = () => p.evaluate(() => document.querySelector("section .dyn-frame.active").className);
    assert.match(await active(), /algo-predict/, "abre na aposta");
    assert.match(await p.innerText("section .dyn-frame.active"), /Quantas trocas\?[\s\S]*A[\s\S]*1/);
    await p.keyboard.press("ArrowRight");
    assert.doesNotMatch(await active(), /algo-predict|algo-explain/, "o clique começa a rodar");
    for (let k = 0; k < count(h); k++) await p.keyboard.press("ArrowRight");
    await p.evaluate(() => window.sagadeck.goto(0, 999));
    assert.match(await active(), /algo-explain/, "fecha no porquê");
    assert.match(await p.innerText("section .dyn-frame.active"), /2 trocas[\s\S]*sobe trocando/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});
