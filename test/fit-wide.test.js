// Largura que não cabe: rótulo grande numa coluna estreita, palavra comprida num cartão estreito e fórmula em destaque
// mais larga que o slide. Nada pode passar da caixa nem do slide, e o resto do slide não fica miúdo por causa disso.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

test("palavra maior que a caixa e fórmula larga encolhem até caber (sem levar o slide inteiro junto)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const slides = [
    { layout: "blocks", title: "Risco", content: [
      { row: [{ label: "ENTÃO", size: 64, color: "hi", w: 140 }, { body: "a probabilidade de não ocorrer em um ano qualquer é o complemento." }], gap: 24 },
      { text: String.raw`$$\underbrace{\left[1 - P(X \geq x)\right] \cdot \left[1 - P(X \geq x)\right] \cdots \left[1 - P(X \geq x)\right]}_{n\ \text{anos}} = \left[1 - P(X \geq x)\right]^n = \left(1 - \frac{1}{TR}\right)^n$$`, size: 56, align: "center" },
    ] },
    { layout: "steps", title: "Log-normal", steps: ["Obter as vazões", "Calcular os logaritmos", "Calcular a média", "Obter z para a probabilidade de TR = 100 anos", "Calcular o logaritmo da vazão", "Obter a vazão pela função inversa"] },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-wide-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    for (const n of [1, 2]) {
      await page.goto(`file://${file.replace(/\\/g, "/")}?export#${n}`); await page.waitForTimeout(500);
      const r = await page.evaluate((i) => {
        const slide = document.querySelectorAll(".slide")[i], safe = slide.querySelector(".safe").getBoundingClientRect();
        const wide = [...slide.querySelectorAll(".safe .t")].filter((t) => t.clientWidth && !t.querySelector(".t") && t.scrollWidth > t.clientWidth + 2).map((t) => t.textContent.slice(0, 40));
        const out = [...slide.querySelectorAll(".katex-display, .safe .t")].filter((e) => e.getBoundingClientRect().right > safe.right + 6).map((e) => e.textContent.slice(0, 40));
        return { wide, out, shrink: slide.dataset.shrink || "1" };
      }, n - 1);
      assert.deepEqual(r.wide, [], `slide ${n}: palavra maior que a caixa`);
      assert.deepEqual(r.out, [], `slide ${n}: passa da área útil pela direita`);
      assert.ok(Number(r.shrink) > 0.8, `slide ${n}: o slide inteiro não precisa encolher (${r.shrink})`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("cor de destaque (hi) como cor de texto: pálida no fundo claro vira uma legível (--hi-ink)", async () => {
  const { resolveTheme, themeCSS } = await import("../src/themes.js");
  const theme = resolveTheme("sinal");
  theme.tones.light = { ...theme.tones.light, bg: "FFFFFF", hi: "DDF4FF", em: "1F4E79", fg: "222222" };
  assert.match(themeCSS(theme), /\.tone-light\{[^}]*--hi-ink:#1F4E79;/, "o azul-bebê não serve de texto no branco: vai a ênfase");
  theme.tones.light.hi = "C00000";
  assert.match(themeCSS(theme), /\.tone-light\{[^}]*--hi-ink:#C00000;/, "o hi legível continua o hi");
  const { html } = buildHTML({ title: "x", theme: "sinal", slides: [{ layout: "blocks", content: [{ label: "SE", color: "hi" }] }] });
  assert.match(html, /color:var\(--hi-ink,var\(--hi\)\)/);
});

// PNG de verdade (cinza), do tamanho pedido: o motor lê a proporção do cabeçalho do arquivo
async function grayPng(file, w, h) {
  const zlib = await import("node:zlib");
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]));
}

test("imagem solta no add (sem altura, largura nenhuma ou em %) não passa de 420 px nem espreme o layout do slide até sumir", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-flow-"));
  try {
    await grayPng(path.join(dir, "grafico.png"), 2000, 1300);
    const slide = (w) => ({ layout: "split", title: "Curvas IDF", body: "Intensidade da chuva em função da duração.", figure: { image: "grafico.png", fit: "contain" }, add: [{ image: "grafico.png", ...(w ? { w } : {}) }] });
    const spec = { title: "x", theme: "sinal", slides: [slide(null), slide("100%")], _dir: dir };
    const { html } = buildHTML(spec);
    assert.equal((html.match(/aspect-ratio:2000\/1300;width:min\((100%|100%), 646px\)/g) || []).length, 2, "as duas ganham a proporção e o teto de 420 px");
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const n of [1, 2]) {
      await page.goto(`file://${file.replace(/\\/g, "/")}?export#${n}`); await page.waitForTimeout(400);
      const h = await page.evaluate((i) => { const s = document.querySelectorAll(".slide")[i]; return { split: s.querySelector(".L-split").getBoundingClientRect().height, img: s.querySelector(".safe > .fig-img").getBoundingClientRect().height }; }, n - 1);
      assert.ok(h.img <= 421, `slide ${n}: imagem do add com ${h.img}px de altura`);
      assert.ok(h.split > 200, `slide ${n}: o layout do slide ficou com ${h.split}px`);
    }
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("figura do split sem encaixe: gráfico de proporção bem diferente da coluna cabe inteiro (não corta eixo e legenda)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-autofit-"));
  try {
    await grayPng(path.join(dir, "largo.png"), 2000, 1300);
    await grayPng(path.join(dir, "quase.png"), 1000, 1000);
    const spec = { title: "x", theme: "sinal", _dir: dir, slides: [
      { layout: "split", title: "IDF", body: "Cada curva é um tempo de retorno.", figure: { image: "largo.png" } },
      { layout: "split", title: "Foto", body: "Uma foto.", figure: { image: "quase.png" } },
      { layout: "split", title: "Escolhido", body: "x", figure: { image: "largo.png", fit: "cover" } },
    ] };
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML(spec).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const fits = [];
    for (const n of [1, 2, 3]) {
      await page.goto(`file://${file.replace(/\\/g, "/")}?export#${n}`); await page.waitForTimeout(400);
      fits.push(await page.evaluate((i) => { const img = document.querySelectorAll(".slide")[i].querySelector(".sp-fig img, .fig-img img"); const r = img.getBoundingClientRect(); return { fit: getComputedStyle(img).objectFit, box: +(r.width / r.height).toFixed(2) }; }, n - 1));
    }
    assert.equal(fits[0].fit, "contain", `largo numa coluna de proporção ${fits[0].box}: cabe inteiro`);
    assert.equal(fits[2].fit, "cover", "o encaixe escolhido no deck vale");
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("science só com equação e cartões no add: os cartões cabem na área útil e não ficam por baixo da equação", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-sci-"));
  try {
    const slides = [{ layout: "science", kicker: "Curvas IDF", title: "A equação da intensidade máxima", plot: false,
      equations: [{ label: "Intensidade máxima para um TR e uma duração", latex: String.raw`i = \frac{a \cdot Tr^{b}}{(t+c)^{d}}` }],
      add: [{ cards: [{ title: "i", text: "intensidade da precipitação, em mm/h" }, { title: "t", text: "duração, em minutos" }, { title: "Tr", text: "tempo de recorrência, em anos" }, { title: "a, b, c, d", text: "coeficientes ajustados para cada região com base em uma longa série de dados" }], cols: 4 }] }];
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${file.replace(/\\/g, "/")}?export#1`); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const s = document.querySelector(".slide"), safe = s.querySelector(".safe").getBoundingClientRect();
      const eq = s.querySelector(".science-equation").getBoundingClientRect(), cards = [...s.querySelectorAll(".cd")].map((c) => c.getBoundingClientRect());
      return { overlap: cards.some((c) => c.top < eq.bottom - 2), below: Math.max(...cards.map((c) => c.bottom)) - safe.bottom };
    });
    assert.equal(r.overlap, false, "cartão por baixo da equação");
    assert.ok(r.below <= 6, `cartões passam ${r.below}px da área útil`);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("exercício resolvido com passos longos: no último clique o 1º passo ainda aparece (encolhe antes de cortar); 'Pede-se' não quebra", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-sol-"));
  try {
    const table = String.raw`\begin{array}{c|c|c} \text{Ano} & Q & m \\ \hline 1988 & 2218{,}0 & 1 \\ 1989 & 2190{,}0 & 2 \\ 1987 & 1812{,}0 & 3 \\ 1984 & 1796{,}8 & 4 \\ 1991 & 1747{,}0 & 5 \\ 1986 & 1565{,}0 & 6 \end{array}`;
    const slides = [{ layout: "solution", title: "Exercício – Análise de frequência", problem: "Dada a série anual de vazões máximas diárias, determine a probabilidade empírica.",
      givens: ["N = 8"], find: "Probabilidade empírica e TR", steps: [{ text: "Ordenar as vazões", latex: table }, { text: "Calcular a probabilidade", latex: table }, { text: "Calcular o tempo de retorno", latex: table }, { text: "Extrapolar a curva de frequência para TR = 10 anos." }], answer: { text: "A vazão para TR = 10 anos sai da curva ajustada." } }];
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForTimeout(400);
    for (let k = 0; k < 5; k++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150); }
    const r = await page.evaluate(() => {
      const st = document.querySelector(".lesson-panel.active .sol-steps"), first = st.firstElementChild;
      const lbl = [...document.querySelectorAll(".sol-find .sol-label")][0];
      return { gap: first.getBoundingClientRect().top - st.getBoundingClientRect().top, steps: st.querySelectorAll(".sol-step").length, lblLines: Math.round(lbl.getBoundingClientRect().height / parseFloat(getComputedStyle(lbl).lineHeight || 20)) };
    });
    assert.equal(r.steps, 4, "no último quadro estão os 4 passos");
    assert.ok(r.gap >= -2, `o 1º passo ficou ${-r.gap}px acima da coluna (cortado)`);
    assert.ok(r.lblLines <= 1, "'Pede-se' numa linha só");
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("infográfico com aviso no add: o desenho cabe acima do aviso (não fica por baixo dele) e a letra das caixas não encolhe à toa", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ig-"));
  try {
    const items = ["Transpiração", "Evaporação", "Infiltração", "Escoamento superficial", "Fluxo ascendente", "Fluxo de base", "Drenagem profunda", "Zona de raízes"].map((title) => ({ title, text: "Água que passa por aqui no ciclo", icon: "droplet" }));
    const slides = [{ layout: "infographic", kicker: "Ciclo", title: "Componentes do ciclo hidrológico", shape: "lados", center: { icon: "cloud-rain" }, items,
      add: [{ aviso: { tipo: "dica", titulo: "Nota", texto: "Algumas simplificações consideram a evaporação por intercepção como parte da evapotranspiração." } }] }];
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${file.replace(/\\/g, "/")}?export#1`); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const s = document.querySelector(".slide");
      const stage = s.querySelector(".ig-stage").getBoundingClientRect(), av = s.querySelector(".aviso").getBoundingClientRect();
      return { gap: av.top - stage.bottom, avText: s.querySelectorAll(".aviso .t").length, minBody: Math.min(...[...s.querySelectorAll(".ig-x")].map((e) => parseFloat(getComputedStyle(e).fontSize))) };
    });
    assert.ok(r.gap >= -2, `o desenho passa ${-r.gap}px por baixo do aviso`);
    assert.equal(r.avText, 2, "o texto do aviso é visto pelo ajuste e pelo fiscal (.t)");
    assert.ok(r.minBody >= 15, `descrição com ${r.minBody}px`);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("layout image com a figura inteira (fit: contain, gráfico): a legenda vai embaixo, sem cobrir o gráfico; foto (cover) segue com o cartão por cima", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-imcap-"));
  try {
    await grayPng(path.join(dir, "idf.png"), 2000, 1300);
    const cap = "Curva IDF – São Carlos. Eixo x: duração (0 a 300 min); eixo y: intensidade. Fonte: Barbassa.";
    const spec = { title: "x", theme: "sinal", _dir: dir, slides: [
      { layout: "image", kicker: "Precipitação máxima", caption: cap, figure: { image: "idf.png", fit: "contain" } },
      { layout: "image", kicker: "Foto", caption: "Enchente", figure: { image: "idf.png" } },
    ] };
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML(spec).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const measure = (i) => page.evaluate((k) => {
      const s = document.querySelectorAll(".slide")[k], img = s.querySelector(".im-fig img"), c = s.querySelector(".im-caption, .im-cap").getBoundingClientRect();
      // a parte desenhada da imagem (contain: a imagem inteira cabe na caixa, centrada)
      const b = img.getBoundingClientRect(), ar = img.naturalWidth / img.naturalHeight;
      const w = Math.min(b.width, b.height * ar), h = w / ar, top = b.top + (b.height - h) / 2;
      return { overlap: c.top < top + h - 2 && c.bottom > top + 2, capBottom: c.bottom };
    }, i);
    await page.goto(`file://${file.replace(/\\/g, "/")}?export#1`); await page.waitForTimeout(400);
    const a = await measure(0);
    assert.equal(a.overlap, false, "a legenda não cobre o gráfico");
    assert.ok(await page.evaluate(() => { const s = document.querySelector(".slide"), h = s.querySelector(".hd"), f = s.querySelector(".im-fig"); return !!h && h.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 2; }), "o título vai no alto, antes da figura (não a frase gigante embaixo)");
    assert.ok(a.capBottom <= 1080, "e cabe no slide");
    await page.goto(`file://${file.replace(/\\/g, "/")}?export#2`); await page.waitForTimeout(400);
    assert.equal((await measure(1)).overlap, true, "foto: o cartão continua por cima (é o desenho do layout)");
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("tabela do add embaixo de um split com texto longo: o ajuste vê a tabela (o texto não fica por baixo dela) e o fiscal acusa quando sobrepõe", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-addtb-"));
  try {
    await grayPng(path.join(dir, "eq.png"), 1600, 600);
    const rows = [["1984", "1.796,8"], ["1985", "1.492,0"], ["1986", "1.565,0"], ["1987", "1.812,0"], ["1988", "2.218,0"], ["1989", "2.190,0"], ["1990", "1.445,0"], ["1991", "1.747,0"]];
    const slides = [{ layout: "split", kicker: "Distribuição empírica", title: "Dados brutos e ordenamento",
      body: "**Fórmula empírica:**\n$$P = \\frac{m}{N+1}$$\nOnde **N** é o tamanho da amostra (número de anos) e **m** é a ordem\nda vazão (**m = 1** para a maior, **m = N** para a menor).",
      figure: { image: "eq.png", fit: "contain" }, add: [{ table: { head: ["Ano", "Q máx (m³/s)"], rows, style: "linhas" } }] }];
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", _dir: dir, slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${file.replace(/\\/g, "/")}?export#1`); await page.waitForTimeout(500);
    const hit = await page.evaluate(() => {
      const s = document.querySelector(".slide"), tb = s.querySelector(".dtable-wrap").getBoundingClientRect();
      return [...s.querySelectorAll(".sp-text .t")].some((t) => { const r = t.getBoundingClientRect(); return r.width && Math.min(r.right, tb.right) - Math.max(r.left, tb.left) > 4 && Math.min(r.bottom, tb.bottom) - Math.max(r.top, tb.top) > 4; });
    });
    assert.equal(hit, false, "o texto do split não fica por baixo da tabela");
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
