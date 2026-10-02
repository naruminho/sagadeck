// Retorno da pessoa sobre a recriada da Aula 1 (rodada 02/10): cada ponto vira um teste do motor ou do navegador.
//  - gráfico com o tipo como chave ({ line: { labels, series } }) desenha; sem tipo, acusa (volta para a IA)
//  - statement com parágrafo inteiro não fica em letra de título; frase curta continua manchete
//  - layout definition (verbete): termo, origem em partes, definição, ícone
//  - gráficos lado a lado num row ocupam a largura (não os 300 px padrão do SVG)
//  - ícone sozinho como figura do split fica grande, num disco (pequeno e solto parecia sujeira)
//  - na apresentação, fora do slide com moldura até a borda (original importado) o fundo é escuro
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip } from "./helpers.js";

const R = (s) => renderSlide(s, 0, { title: "x", theme: "sinal", slides: [] }).html;

test("gráfico com o tipo como chave desenha (layout e elemento); sem tipo nenhum, acusa com o jeito certo", () => {
  const line = { line: { labels: [0, 0.5, 1], series: [{ name: "Jovem", values: [1, 0.8, 0] }, { name: "Velha", values: [1, 0.3, 0] }] } };
  const a = R({ layout: "chart", title: "Curvas hipsométricas", chart: line });
  assert.match(a, /fig-chart/); assert.match(a, /Jovem/);
  assert.match(R({ layout: "blocks", content: [{ chart: { bar: { data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] } } }] }), /fig-chart/);
  assert.match(R({ layout: "chart", title: "x", chart: { type: "bar", data: [{ label: "a", value: 1 }] } }), /fig-chart/, "o formato de sempre continua");
  assert.throws(() => R({ layout: "chart", title: "x", chart: { labels: [1], series: [{ values: [1] }] } }), /gráfico sem tipo: diga qual em chart/);
});

test("statement: frase curta é manchete; parágrafo inteiro vai para letra de leitura (não ocupa a tela em letra de título)", () => {
  const role = (text) => R({ layout: "statement", text }).match(/class="t ([^"]*?)st-line/)[1];
  assert.match(role("Uma frase que ==muda tudo=="), /r-title/);
  const long = "A lâmina total precipitada, ou a intensidade sem a duração, não significam nada: o resultado é totalmente diferente se o mesmo volume de água precipitar em um dia ou em um mês. A frequência está associada ao risco de ocorrência de determinada chuva. As precipitações máximas são caracterizadas por curvas IDF.";
  assert.match(role(long), /r-lead/);
  assert.match(R({ layout: "statement", text: long, as: "title" }), /r-title/, "pedido explícito vale");
});

test("layout definition: termo, origem da palavra em partes, definição e ícone (o exemplo da galeria)", () => {
  const h = R(LAYOUT_SAMPLES.definition);
  assert.match(h, /class="L-definition has-fig"/);
  assert.match(h, /df-term[^>]*>Hidrologia</);
  assert.match(h, /<i class="t f-heading df-word"[^>]*>hydor<\/i><span class="t f-body df-mean"[^>]*>água<\/span>/);
  assert.match(h, /df-plus/);
  assert.match(h, /<mark>a água sobre a Terra<\/mark>/);
  assert.match(h, /df-icon/);
  assert.doesNotMatch(R({ ...LAYOUT_SAMPLES.definition, icon: undefined }), /has-fig/);
});

test("no navegador: gráficos lado a lado ocupam a largura, ícone do split num disco, definição cabe, fundo de fora escuro no slide com moldura", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const bars = (title, v) => ({ chart: "bar", title, data: v.map((value, i) => ({ label: String((i + 1) * 20), value })) });
  const slides = [
    { layout: "blocks", title: "Método dos blocos alternados", content: [{ row: [bars("Incremento de precipitação", [34.1, 10.8, 6.1]), bars("Altura total", [34.1, 44.9, 51])] }], caption: "À esquerda, o incremento; à direita, a altura total." },
    { layout: "split", title: "Declividades", body: "S1 e S2", figure: { icon: "trending-down", size: 140, color: "em" } },
    LAYOUT_SAMPLES.definition,
    { layout: "canvas", original: { slide: 1 }, elements: [{ drawing: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#9DC3E6"/></svg>', x: 0, y: 0, w: 258, h: 1080 }, { text: "Capa original", x: 400, y: 400, w: 800 }] },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ret-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    const at = async (n, fn) => { await page.evaluate((k) => window.sagadeck.goto(k), n - 1); await page.waitForTimeout(500); return page.evaluate(fn, n - 1); };
    const charts = await at(1, (i) => { const s = document.querySelectorAll(".slide")[i]; return { w: [...s.querySelectorAll(".row > .fig-chart")].map((f) => f.getBoundingClientRect().width), titles: [...s.querySelectorAll(".fc-title")].map((e) => e.textContent), cap: !!s.querySelector(".bl-caption") }; });
    assert.ok(charts.w.every((w) => w > 600), `gráficos com ${charts.w.join(" e ")} px de largura`);
    assert.deepEqual(charts.titles, ["Incremento de precipitação", "Altura total"]);
    assert.ok(charts.cap, "a legenda do blocks aparece");
    const icon = await at(2, (i) => { const f = document.querySelectorAll(".slide")[i].querySelector(".sp-fig > .fig-icon"), cs = getComputedStyle(f); return { w: f.getBoundingClientRect().width, round: cs.borderRadius, bg: cs.backgroundColor }; });
    assert.ok(icon.w > 250 && icon.round === "50%" && !/rgba\(0, 0, 0, 0\)/.test(icon.bg), JSON.stringify(icon));
    const def = await at(3, (i) => { const s = document.querySelectorAll(".slide")[i], safe = s.querySelector(".safe").getBoundingClientRect(); return [...s.querySelectorAll(".safe .t")].every((t) => t.getBoundingClientRect().bottom <= safe.bottom + 6) && !s.dataset.shrink; });
    assert.ok(def, "a definição cabe sem encolher");
    const outside = await at(4, () => getComputedStyle(document.body).backgroundColor);
    assert.equal(outside, "rgb(11, 11, 11)", "fora da capa original (faixa até a borda), fundo escuro");
    const themed = await at(3, () => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(themed, "rgb(11, 11, 11)", "slide do tema: a cor dele, emendando");
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("no navegador: cartões da mesma grade com o mesmo tamanho de letra (um só com palavra comprida) e ênfase no kicker em pílula visível", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const slides = [
    { layout: "cards", kicker: "^^Conceitos Básicos^^", title: "Características", items: [
      { icon: "mountain", title: "Topografia", text: "Relevo e altitude" }, { icon: "leaf", title: "Geologia", text: "Tipo de rocha" },
      { icon: "building-2", title: "Uso", text: "Áreas urbanas e impermeabilização" }, { icon: "leaf", title: "Cobertura", text: "Vegetação" },
      { icon: "leaf", title: "Solo", text: "Textura" }, { icon: "leaf", title: "Clima", text: "Chuva" } ] },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ret2-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "Aula 1 — recriada pelo sagadeck (Flash · rodada 02-10 · colorido · 7381869) com um nome bem comprido", theme: "oceano", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck); await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const s = document.querySelector(".slide"), fs = (sel) => [...s.querySelectorAll(sel)].map((e) => getComputedStyle(e).fontSize);
      const k = s.querySelector(".kicker"), em = k.querySelector(".em");
      return { text: fs(".cd-text"), title: fs(".cd-title"), shrunk: !!s.querySelector(".cd-text[data-fw0]"), kicker: getComputedStyle(k).color, em: getComputedStyle(em).color };
    });
    assert.ok(r.shrunk, "a palavra comprida encolheu o seu cartão");
    assert.equal(new Set(r.text).size, 1, `textos: ${r.text.join(", ")}`);
    assert.equal(new Set(r.title).size, 1, `títulos: ${r.title.join(", ")}`);
    assert.equal(r.em, r.kicker, "a ênfase no kicker em pílula tem a cor do texto da pílula, não a da pílula");
    const foot = await page.evaluate(() => [...document.querySelectorAll(".slide .foot > *")].map((e) => e.getBoundingClientRect().height));
    assert.ok(foot.length && foot.every((h) => h <= 30), `rodapé numa linha só: ${foot.join(", ")} px`);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("gráfico de linhas: eixo com marcações redondas (0 a 1 não fica só com 0 e 1); linhas que terminam juntas ganham legenda em cima", async () => {
  const { niceTicks } = await import("../src/figures/charts.js");
  assert.deepEqual(niceTicks(0, 1.1), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(niceTicks(0, 1100), [0, 250, 500, 750, 1000]);
  const texts = (h) => [...h.matchAll(/>([^<>]*)<\/text>/g)].map((m) => m[1]);
  const hyp = { layout: "chart", title: "Curvas hipsométricas", chart: { type: "line", labels: [0, 0.5, 1], series: [{ name: "Jovem", values: [0, 0.2, 1] }, { name: "Velha", values: [0, 0.8, 1] }] } };
  const h = R(hyp);
  assert.deepEqual(texts(h).filter((x) => /^\d/.test(x)), ["0,00", "0,25", "0,50", "0,75", "1,00", "0", "0,5", "1"]);
  // ano no eixo: sem ponto de milhar (saía "1.984")
  const anos = R({ layout: "chart", title: "Vazões", chart: { type: "line", labels: [1984, 1985, 1986], series: [{ name: "Q", values: [1796, 1492, 1565] }] } });
  assert.ok(texts(anos).includes("1984") && !texts(anos).includes("1.984"), texts(anos).join(" "));
  assert.equal((h.match(/<rect [^>]*width="24" height="24"/g) || []).length, 2, "legenda com as duas séries");
  // linhas que terminam longe: o nome fica no fim da linha (sem legenda)
  const far = R({ ...hyp, chart: { ...hyp.chart, series: [{ name: "A", values: [0, 0.2, 0.3] }, { name: "B", values: [0, 0.8, 1] }] } });
  assert.equal((far.match(/<rect [^>]*width="24" height="24"/g) || []).length, 0);
  assert.ok(texts(far).includes("A") && texts(far).includes("B"));
});

test("escalafobética (02/10): linhas longas marcadas h2 não viram letra de título; tabela com texto ao lado em lista não sai \"[object Object]\"", () => {
  const l = "As intensidades das chuvas diminuem conforme a duração aumenta e as maiores vazões vêm das chuvas cuja duração é igual ao tempo de concentração da bacia.";
  const h = R({ layout: "statement", lines: [{ text: l, as: "h2" }, { text: l, as: "h2" }, { text: "Por isso a chuva de projeto dura o tempo de concentração.", as: "h2" }] });
  assert.ok(!/r-h2|r-title/.test(h), "texto todo longo: as linhas vão para letra de leitura");
  assert.match(R({ layout: "statement", lines: [{ text: "Curta", as: "h2" }, { text: "Outra curta" }] }), /r-h2/, "linha curta pode ser h2");
  const t = R({ layout: "table", title: "IDF", head: ["a", "b"], rows: [["1", "2"]], side: [{ text: "$i = K/T$", as: "lead" }, { text: "K — coeficiente" }] });
  assert.doesNotMatch(t, /object Object/);
  assert.match(t, /K — coeficiente/);
});
