// Pedidos de 02/10 (brigadeiro em uma página, regressão logística para uma criança de 11 anos): o que o deck gerado
// mostrou de errado no motor vira teste aqui.
//  - compare com texto curto: os cartões tinham a altura do slide inteiro, vazios
//  - gráfico interativo (science): números do eixo em formato inglês (0.2)
//  - ilustração gerada sem fit: ia sempre "cover" (a ilustração 16:9 numa caixa em pé cortava a criança da capa)
//  - o prompt de geração pede o mecanismo inteiro quando é para ensinar como algo funciona
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { startMockLLM } from "./mock-llm.js";
import { browserOrSkip } from "./helpers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("ilustração gerada sem fit fica com o encaixe automático (não força cover)", async () => {
  const { materializeImages } = await import("../src/ai/deck-ai.js");
  const llm = await startMockLLM(() => ({ image: `data:image/png;base64,${PNG.toString("base64")}` }));
  process.env.SAGADECK_LLM_URL = llm.url;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-fit-"));
  try {
    const spec = { slides: [{ layout: "split", title: "x", figure: { image_prompt: "a kid and a robot" } }, { layout: "full", title: "y", figure: { image_prompt: "a city", fit: "cover" } }] };
    await materializeImages(spec, { baseDir: dir });
    assert.match(spec.slides[0].figure.image, /^imagens\/ia-/);
    assert.equal(spec.slides[0].figure.fit, undefined, "sem fit: o navegador decide (cabe inteira se o corte for grande)");
    assert.equal(spec.slides[1].figure.fit, "cover", "fit pedido continua");
  } finally { await llm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ilustração nova sai sem texto (o modelo escrevia rótulos sem sentido); o redesenho de uma figura mantém os rótulos", async () => {
  const { materializeImages } = await import("../src/ai/deck-ai.js");
  const asked = [];
  const llm = await startMockLLM((req) => { asked.push(req.lastUser); return { image: `data:image/png;base64,${PNG.toString("base64")}` }; });
  process.env.SAGADECK_LLM_URL = llm.url;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-txt-"));
  try {
    fs.mkdirSync(path.join(dir, "imagens"));
    fs.writeFileSync(path.join(dir, "imagens", "mapa.png"), PNG);
    await materializeImages({ slides: [{ layout: "split", title: "a", figure: { image_prompt: "a gourmet brigadeiro cut in half" } }, { layout: "split", title: "b", figure: { image_prompt: "Clean up and redraw THIS EXACT map", image_ref: "imagens/mapa.png" } }] }, { baseDir: dir });
    assert.match(asked[0], /a gourmet brigadeiro cut in half\. No text, letters, numbers or labels anywhere in the image\./);
    assert.doesNotMatch(asked[1], /No text/, "o redesenho copia os rótulos da figura");
    await materializeImages({ slides: [{ layout: "split", title: "c", figure: { image_prompt: 'a watershed cross-section with labels "Divisor de água" and "Rio"' } }] }, { baseDir: dir });
    assert.doesNotMatch(asked[2], /No text/, "rótulos pedidos em português, entre aspas, ficam");
  } finally { await llm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("prompt de geração: ensinar como funciona pede o mecanismo inteiro com um exemplo de números e uma simulação", async () => {
  const { systemPrompt } = await import("../src/ai/deck-ai.js");
  const sys = systemPrompt({ images: true });
  assert.match(sys, /Ensinar como algo FUNCIONA/);
  assert.match(sys, /simplifique as PALAVRAS[^\n]*nunca os PASSOS/);
});

test("no navegador: compare com texto curto não vira dois cartões vazios do tamanho do slide; eixo do science com vírgula", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-0210-"));
  try {
    const slides = [
      { layout: "compare", title: "A regra do meio", left: { label: "Mais de 50%", title: "SIM", text: "Ele acha que vai acontecer.", hl: true }, right: { label: "Menos de 50%", title: "NÃO", text: "Ele acha que não vai." }, vs: "ou" },
      { layout: "science", title: "A curva em S", plot: { functions: ["1/(1+e^(-x))"], x: [-6, 6], y: [0, 1] } },
      // rodada 02/10, slide 26: hietograma e hidrograma empilhados saíam minúsculos
      { layout: "blocks", kicker: "Representação gráfica", title: "Hietograma e hidrograma do mesmo evento", content: [
        { label: "Hietograma — chuva (mm) por tempo (min)" },
        { chart: "column", labels: ["0–100", "100–200", "200–300", "300–400", "400–500"], data: [{ label: "0–100", value: 10 }, { label: "100–200", value: 55 }, { label: "200–300", value: 40 }, { label: "300–400", value: 15 }, { label: "400–500", value: 5 }], suffix: " mm", xLabel: "Tempo (min)", yLabel: "Chuva (mm)" },
        { label: "Hidrograma — vazão (m³/s) por tempo (min)" },
        { chart: "line", labels: [0, 50, 100, 150, 200, 250, 300], series: [{ name: "Observado", values: [2, 3, 5, 9, 13, 11, 8] }, { name: "Previsão", values: [2, 2.8, 4.5, 8.5, 12, 10.5, 7.5] }], xLabel: "Tempo (min)", yLabel: "Vazão (m³/s)" }] },
    ];
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    const cmp = await page.evaluate(() => { const s = document.querySelector(".slide"), safe = s.querySelector(".safe").getBoundingClientRect().height; return [...s.querySelectorAll(".cp-col")].map((c) => c.getBoundingClientRect().height / safe); });
    assert.ok(cmp.length === 2 && cmp.every((h) => h < 0.6), `cartões com ${cmp.map((h) => Math.round(h * 100)).join("% e ")}% da altura`);
    assert.equal(Math.round(cmp[0] * 100), Math.round(cmp[1] * 100), "os dois da mesma altura");
    await page.evaluate(() => window.sagadeck.goto(1));
    const sep = await page.waitForFunction(() => document.querySelectorAll(".slide")[1].querySelector(".science-plot-target")?.layout?.separators, null, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
    assert.equal(sep, ",.", "Plotly com vírgula decimal");
    await page.evaluate(() => window.sagadeck.goto(2)); await page.waitForTimeout(400);
    const ch = await page.evaluate(() => { const s = document.querySelectorAll(".slide")[2], safe = s.querySelector(".safe").getBoundingClientRect().height; const sw = s.querySelector(".safe").getBoundingClientRect().width; return [...s.querySelectorAll(".bl-body .fig-chart > svg")].map((f) => [f.getBoundingClientRect().height / safe, f.getBoundingClientRect().width / sw]); });
    assert.ok(ch.length === 2 && ch.every(([h, w]) => h > 0.45 && w > 0.4), `gráficos empilhados: ${ch.map(([h, w]) => `${Math.round(h * 100)}% de altura e ${Math.round(w * 100)}% de largura`).join("; ")}`);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("exercício resolvido: unidade com % (umidade 60 %) desenha a fórmula, sem erro", async () => {
  const { renderSlide } = await import("../src/build.js");
  const h = renderSlide({ layout: "solution", title: "A conta do dia", problem: "Vai chover?", givens: [{ symbol: "u", value: 60, unit: "%", label: "umidade" }, { symbol: "n", value: 6, label: "nuvens" }], find: "pontos", steps: [{ text: "Some", latex: "6 + 6 - 11 = 1" }], answer: "1" }, 0, { title: "x", theme: "sinal", slides: [] }).html;
  assert.doesNotMatch(h, /tex-error/, "a unidade % não quebra a fórmula");
  assert.match(h, /class="katex"/);
});

test("no navegador: exercício resolvido com poucos passos não encolhe os anteriores; com muitos, encolhe", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-sol-"));
  try {
    const sol = (n) => ({ layout: "solution", title: "A conta do dia", problem: "O céu tem 6 nuvens. Vai chover?", givens: [{ symbol: "n", value: 6, label: "nuvens" }], find: "pontos",
      steps: Array.from({ length: n }, (_, i) => ({ text: `Passo ${i + 1}: some mais um ponto para cada pista que apareceu no céu hoje.`, latex: `${i} + 1 = ${i + 1}` })), answer: "1" });
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides: [sol(3), sol(12)] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}?export=1`); await page.waitForFunction(() => window.sagadeck);
    const at = async (i) => {
      await page.evaluate((k) => window.sagadeck.goto(k, window.sagadeck.steps(k)), i); await page.waitForTimeout(700);
      return page.evaluate((k) => { const sl = document.querySelectorAll(".slide")[k], st = sl.querySelector(".dyn-frame.active .sol-steps") || sl.querySelector(".sol-steps"); const w = st.querySelector(".sol-step:not(.now) .sol-why"); return { compact: st.classList.contains("sol-compact"), why: w ? parseFloat(getComputedStyle(w).fontSize) : [...st.children].map((c) => c.className).join("|") }; }, i);
    };
    const few = await at(0), many = await at(1);
    assert.deepEqual([few.compact, few.why], [false, 26], "3 passos: os de antes no tamanho normal");
    assert.equal(many.compact, true, "12 passos: os de antes menores");
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
