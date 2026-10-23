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

test("exercício resolvido: unidades com moeda e percentagem já escapadas não vazam LaTeX", () => {
  for (const unit of ["R$", String.raw`R\$`, "%", String.raw`\%`, "°C"]) {
    const { html } = renderSlide({ layout: "solution", givens: [{ symbol: "C", value: 1000, unit }] }, 0, ctx);
    assert.doesNotMatch(html, /class="katex-error"/, `unidade ${unit} compila como fórmula`);
    assert.match(html, /class="katex"/);
  }
  assert.doesNotMatch(renderSlide(LAYOUT_SAMPLES.solution, 0, ctx).html, /class="katex-error"/, "o modelo da demo mostra o capital em reais");
});

test("calculadora: fórmula de Reynolds não se sobrepõe ao resultado e as faixas ficam legíveis", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "calc.html");
    fs.writeFileSync(file, buildHTML({ title: "Calculadora", theme: "sinal", slides: [demoDeck('conheca').slides.find(s => s.layout === 'calc')] }).html);
    const { page: p, errors } = await newPage(browser, pathToFileURL(file).href, { width: 1920, height: 1080 });
    const geometry = await p.evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const parts = [...document.querySelectorAll('.calc-formula .katex-html span')].map(el => el.getBoundingClientRect());
      return { formula: { top: Math.min(...parts.map(r => r.top)), bottom: Math.max(...parts.map(r => r.bottom)) }, value: bounds('[data-calc-out="Re"]'), bands: [...document.querySelectorAll('.calc-band em')].map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, x: r.left, y: r.top, visible: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.calc-band') === el.parentElement }; }) };
    });
    assert.ok(geometry.formula.bottom <= geometry.value.top, `fórmula e resultado separados: ${JSON.stringify(geometry)}`);
    for (const band of geometry.bands) assert.ok(band.visible, `faixa ${band.text} aparece sem corte`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
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
    // A pessoa pode escolher a categoria enquanto as prévias ainda estão carregando.
    let previews = 0;
    await p.route("**/api/layout-previews", async (route) => {
      if (++previews === 1) await new Promise((r) => setTimeout(r, 500));
      if (!p.isClosed()) await route.continue();
    });
    await p.waitForSelector(".thumb-card");
    assert.ok(await p.locator("#rail-tab-slides.active").count() && await p.locator("#thumbnails-list:not(.hidden)").count(), "abre nos slides");
    await p.click('.ribbon-tab[data-tab="inicio"]'); await p.click("#btn-scenes");
    await p.click('#scene-modal [data-scene-filter="aula"]');
    await p.locator('#scene-grid .scene-card[data-scene="calc"]:not([hidden])').waitFor();
    const cards = await p.locator("#scene-grid .scene-card:not([hidden])").evaluateAll((els) => els.map((e) => e.dataset.scene));
    for (const k of ["solution", "calc", "algo"]) assert.ok(cards.includes(k), `${k} na categoria de aula`);
    assert.ok(await p.locator("#scene-grid .scene-card:not([hidden])").evaluateAll((els) => els.every((e) => e.dataset.category === "aula")), "a categoria escolhida durante o carregamento continua valendo");
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

test("exercício resolvido: dado e 'pede-se' em frase saem como texto (não 'vertabela' em itálico); fórmula continua fórmula", () => {
  const { html } = renderSlide({ layout: "solution", title: "Ex", problem: "Dada a série", givens: ["N = 8", "Q = ver tabela", { symbol: "Q", value: "ver tabela", label: "vazões" }],
    find: "Probabilidade empírica, TR e vazão para TR = 10 anos.", steps: [String.raw`P = \frac{m}{N+1}`] }, 0, { title: "x", slides: [] });
  assert.match(html, /<span class="sol-txt t f-body"[^>]*>Q = ver tabela<\/span>/);
  assert.match(html, /<span class="sol-txt t f-body"[^>]*>Probabilidade empírica, TR e vazão para TR = 10 anos\.<\/span>/);
  assert.match(html, /<mfrac>/, "o passo em LaTeX continua fórmula");
  assert.match(html, /<mtext>ver.tabela<\/mtext>/u, "valor em frase de um dado com símbolo: o símbolo é fórmula, o valor é texto");
  assert.match(html, /<mi>N<\/mi><mo>=<\/mo><mn>8<\/mn>/, "N = 8 continua fórmula");
});

// Um deck de aula saiu com "L₁ ≈ 55 m" ao lado da fórmula certa (que dava 273 m): a IA errou a aritmética. Com `fn`,
// o número do passo nasce da conta (o compilador do calc, sem eval), não do texto.
const juros = (extra = {}) => ({ layout: "solution", title: "Juros", givens: [{ symbol: "C", value: "1000", unit: String.raw`R\$` }, { symbol: "i", value: "0,01" }, { symbol: "n", value: 36 }],
  steps: [{ text: "Fórmula", latex: String.raw`M = C\,(1 + i)^n` }, { text: "Fator", latex: "(1 + i)^n = 1{,}01^{36}", fn: "(1+i)^n", name: "fator", decimals: 4 },
    { text: "Montante", latex: String.raw`M = {{C}} \cdot {{fator}}`, fn: "C*fator", name: "M", decimals: 2 }, { text: "Dobro", fn: "2*C", name: "D2", unit: String.raw`R\$` }],
  answer: { latex: String.raw`M \approx R\$\,{{M}}`, text: "Rende cerca de {{(M/C - 1)*100:0}}% em {{n}} meses; o montante é R$ {{M}}." }, ...extra });
// passo escrito à mão, com o número no texto: esse a conferência das contas ainda refaz
const aMao = () => juros({ steps: [{ text: "À mão", latex: String.raw`1{,}01^{36} \approx 1{,}43` }, ...juros().steps.slice(1)] });
const texOf = (html) => [...html.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

test("exercício resolvido com fn: o motor calcula cada passo, escreve o valor no LaTeX e na resposta, com vírgula e arredondamento", () => {
  const { html } = renderSlide(juros(), 0, ctx);
  assert.deepEqual(buildHTML({ title: "A", slides: [juros()] }).warnings, []);
  const texs = texOf(html);
  assert.ok(texs.includes(String.raw`(1 + i)^n = 1{,}01^{36} \approx 1{,}4308`), `valor anexado ao passo com o sinal de aproximado: ${texs.join(" | ")}`);
  assert.ok(texs.includes(String.raw`M = 1\,000 \cdot 1{,}4308 \approx 1\,430{,}77`), `{{nome}} vira o valor (dado ou passo anterior) e o resultado do passo entra no fim: ${texs.join(" | ")}`);
  const own = texOf(renderSlide(juros({ steps: [{ latex: String.raw`M = {{M}}\ \text{reais}`, fn: "C*2", name: "M" }] }), 0, ctx).html);
  assert.ok(own.includes(String.raw`M = 2\,000\ \text{reais}`), `com o próprio nome no LaTeX, o valor fica onde a pessoa pôs: ${own.join(" | ")}`);
  assert.ok(texs.includes(String.raw`D_{2} = 2\,000\ \mathrm{R\$}`), "passo só com fn: símbolo = valor exato (sinal de igual) e unidade");
  assert.ok(texs.includes(String.raw`M \approx R\$\,1\,430{,}77`), "resposta com o valor calculado, 2 casas");
  assert.match(html, /Rende cerca de 43% em 36 meses; o montante é R\$ 1\.430,77\./, "no texto: expressão com casas próprias e milhar com ponto");
  assert.doesNotMatch(html, /\{\{|katex-error/);
  // passo sem fn continua como antes
  assert.ok(texs.includes(String.raw`M = C\,(1 + i)^n`));
});

test("exercício resolvido com fn: fórmula inválida ou letra sem valor vira erro claro no slide e aviso, sem quebrar", () => {
  const slide = { layout: "solution", givens: [{ symbol: "C", value: 1000 }], steps: [{ text: "a", fn: "C*(1+" }, { text: "b", fn: "C*k", name: "x" }], answer: { latex: "x = {{x}}" } };
  const { html } = renderSlide(slide, 0, ctx);
  const w = buildHTML({ title: "A", slides: [slide] }).warnings;
  assert.equal(w.length, 2, w.join(" | "));
  assert.match(w[0], /exercício.*passo 1.*(terminou no meio|parêntese)/i);
  assert.match(w[1], /passo 2.*"k"/);
  assert.match(html, /class="sol-error[^"]*"[^>]*>[^<]*passo 2[^<]*&quot;k&quot;/i, "o slide diz o que falta");
  assert.doesNotMatch(html, /\{\{|katex-error/, "valor que não fechou aparece como traço, sem LaTeX quebrado");
});

test("exercício resolvido com fn: a conferência das contas não refaz o que o motor já calcula", async () => {
  const { hasMath, auditMath } = await import("../src/ai/math-check.js");
  assert.ok(!hasMath(juros({ steps: juros().steps.slice(1) })), "todos os passos com fn e a resposta pelo valor: nada para a IA conferir");
  assert.ok(!hasMath(juros()), "passo sem fn que só mostra a fórmula, sem número: nada a conferir");
  assert.ok(hasMath(aMao()), "passo sem fn, com conta escrita à mão, ainda é conferido");
  assert.ok(hasMath({ layout: "solution", title: "x" }), "exercício sem fn: como antes");
  let sent = null;
  const complete = async (messages) => { sent = JSON.parse(messages.at(-1).content.split("deck):\n")[1]); return { text: '{"contas":[]}' }; };
  await auditMath({ slides: [aMao()] }, [0], { complete });
  const steps = sent[0].steps;
  assert.equal(steps.length, 1, "só o passo escrito à mão vai para a conferência");
  assert.equal(steps[0].text, "À mão");
  assert.doesNotMatch(JSON.stringify(sent[0].answer || {}), /\{\{/, "a resposta que só cita o valor calculado não vai");
});

test("exercício resolvido interativo: mudar um dado na apresentação recalcula passos e resposta", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "exercicio.html");
    fs.writeFileSync(file, buildHTML({ title: "A", theme: "sinal", slides: [juros({ interactive: true })] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    await p.evaluate(() => window.sagadeck.goto(0, 999));
    const answer = () => p.innerText("section .dyn-frame.active .sol-answer");
    assert.match((await answer()).replace(/\s/g, ""), /1430,77/);
    const slider = p.locator('section [data-solv-in="C"]');
    assert.equal(await slider.count(), 1, "o dado vira controle");
    await slider.evaluate((el) => { el.value = "2000"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.match((await answer()).replace(/\s/g, ""), /2861,54/, "resposta recalculada");
    assert.match(await answer(), /montante é R\$ 2\.861,54/);
    assert.match((await p.innerText("section .sol-givens")).replace(/\s/g, ""), /C=2000/, "o dado mostra o valor novo");
    assert.match((await p.innerText("section .dyn-frame.active .sol-steps")).replace(/[\s​]/g, ""), /D2=4000/, "passo que depende do dado também");
    assert.equal(await p.evaluate(() => window.sagadeck.cur), 0, "mexer no controle não troca de slide");
    await p.click("section [data-solv-reset]");
    assert.match((await answer()).replace(/\s/g, ""), /1430,77/, "Restaurar volta aos dados do slide");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: fórmula do passo pelo formulário vai para o deck salvo e o valor calculado aparece", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await novoSlide(p, "solution");
    const idx = saved().slides.findIndex((s) => s.layout === "solution");
    assert.ok(saved().slides[idx].steps.some((s) => s.fn), "o exemplo já calcula com fn");
    const last = p.locator('#slide-fields-form .sf-list:has(> .sf-list-head .sf-label:text-matches("^Passos")) .sf-item').last();
    if (!(await last.locator('.sf-field:has(> .sf-label:text-is("Fórmula que calcula"))').first().isVisible())) await last.locator(".sf-item-toggle").first().click();
    const fn = last.locator('.sf-field:has(> .sf-label:text-is("Fórmula que calcula")) input').first();
    await fn.fill("C*fator*2");
    await fn.blur();
    for (let k = 0; k < 40 && saved().slides[idx].steps.at(-1).fn !== "C*fator*2"; k++) await p.waitForTimeout(100);
    assert.equal(saved().slides[idx].steps.at(-1).fn, "C*fator*2");
    await p.waitForFunction(() => /2\D?861,54/.test(document.querySelector("#rendered-slide-container .L-solution")?.textContent || ""));
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
