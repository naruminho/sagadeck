// Tema musgo (o visual do "segundo cérebro"): fontes embutidas, seção escura como separador, faixa que corre na capa
// (ticker) e o terminal em cenas (motion console), que digita o comando e revela a saída linha a linha.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../src/build.js";
import { motionOptions, motionHTML } from "../src/motion.js";
import { THEMES } from "../src/themes.js";
import { browserOrSkip, newPage, tempDeck, motionDiag } from "./helpers.js";

const COVER = { layout: "cover", kicker: "blueprint", title: "Um ==segundo cérebro==", subtitle: "Memória para modelos" };
const SECOES = [
  { layout: "section", number: "01", kicker: "a literatura diz", title: "Pesquisa" },
  { layout: "statement", text: "Uma ideia" },
  { layout: "section", number: "02", title: "Arquitetura" },
  { layout: "section", number: "03", title: "Plano" },
];
const CURL = { type: "console", caption: "contrato do agente", typing: 0.02, hold: 0.6, scenes: [
  { cmd: "curl -X POST /api/memorias", out: ["201 Created", '{ "id": "9f3a" }'] },
  { cmd: "curl /api/memorias?q=pnpm", out: ["200 OK"] },
] };

test("musgo: as três fontes vêm embutidas e a seção fica escura (o separador não vira página chapada de âmbar)", () => {
  const { html } = buildHTML({ theme: "musgo", slides: [COVER, ...SECOES] });
  for (const f of ["Fraunces", "Space Grotesk", "IBM Plex Mono"]) assert.match(html, new RegExp(`@font-face\\{font-family:'${f}';[^}]*src:url\\(data:font/woff2;base64,`), f);
  assert.match(html, /@font-face\{font-family:'Fraunces';font-style:italic;/, "o destaque do título usa o itálico de verdade");
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  assert.equal(THEMES.musgo.tones.accent.bg, "12160F", "tom da seção escuro, com o detalhe em âmbar");
  assert.equal(THEMES.musgo.tones.accent.hi, "accent");
});

test("faixa que corre: no musgo vem sozinha na capa com os títulos das seções; ticker: false tira; lista própria em qualquer tema", () => {
  const faixa = (html) => [...(html.match(/<div class="ticker"[\s\S]*?<\/div><\/div>/)?.[0] || "").matchAll(/<span class="tk-it[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
  const musgo = buildHTML({ theme: "musgo", slides: [COVER, ...SECOES] }).html;
  assert.deepEqual(faixa(musgo), ["Pesquisa", "Arquitetura", "Plano", "Pesquisa", "Arquitetura", "Plano"], "duas cópias para emendar sem salto");
  assert.equal((musgo.match(/class="ticker"/g) || []).length, 1, "só na capa");
  assert.equal(faixa(buildHTML({ theme: "musgo", slides: [{ ...COVER, ticker: false }, ...SECOES] }).html).length, 0);
  // sem seções suficientes, os títulos dos slides
  assert.deepEqual(faixa(buildHTML({ theme: "musgo", slides: [COVER, { layout: "statement", title: "A", text: "x" }, { layout: "list", title: "B", items: ["y"] }] }).html), ["A", "B", "A", "B"]);
  // outro tema: só quando o slide pede; a marcação do item vira texto puro
  assert.equal(faixa(buildHTML({ theme: "sinal", slides: [COVER, ...SECOES] }).html).length, 0);
  assert.deepEqual(faixa(buildHTML({ theme: "sinal", slides: [{ ...COVER, ticker: ["**Um**", "Dois"] }] }).html), ["Um", "Dois", "Um", "Dois"]);
});

test("motion console: valida as cenas, usa as cores do tema e desenha prompt, cursor e seta sem caractere de ícone", () => {
  assert.throws(() => motionOptions({ type: "console" }), /scenes/);
  const o = motionOptions(CURL, THEMES.musgo.colors);
  assert.deepEqual(o.scenes.map((s) => s.out.length), [2, 1]);
  assert.equal(o.accent, "#F0B24A", "prompt e cursor no âmbar do tema");
  assert.equal(o.secondary, "#A9C79B", "primeira linha da saída em sálvia");
  const html = motionHTML(CURL, THEMES.musgo.colors);
  assert.match(html, /data-motion="console"/);
  assert.match(html, /con-bar/);
  assert.doesNotMatch(html, /[←-⇿❯▍✦]/u);
});

test("motion console no navegador: digita o comando, revela a saída linha a linha, passa de cena e para fora do slide", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "console.html");
    fs.writeFileSync(file, buildHTML({ theme: "musgo", slides: [{ layout: "canvas", elements: [{ motion: CURL, x: 100, y: 100, w: 900, h: 420 }] }, { layout: "section", title: "Próximo" }] }).html);
    const { page, errors } = await newPage(browser);
    await page.goto(pathToFileURL(file).href);
    const f = page.frameLocator("iframe[data-motion=console]");
    const cmd = f.locator(".cmd");
    await cmd.filter({ hasText: "curl -X" }).waitFor();
    assert.equal(await f.locator(".out").count(), 0, "a saída só vem depois do comando inteiro " + (await motionDiag(page, "console")));
    await f.locator(".out.first").filter({ hasText: "201 Created" }).waitFor();
    await f.locator(".out").nth(1).filter({ hasText: "9f3a" }).waitFor();
    await f.locator(".con-n").filter({ hasText: "02/02" }).waitFor();
    await cmd.filter({ hasText: "q=pnpm" }).waitFor();
    await page.evaluate(() => window.sagadeck.goto(1));
    const read = () => f.locator(".con-body").innerText();
    let a = await read(), parou = false;
    for (let i = 0; i < 12 && !parou; i++) { await new Promise((r) => setTimeout(r, 250)); const b = await read(); parou = a === b; a = b; }
    assert.ok(parou, "fora do slide, o console para");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("parado (motion: none): o console mostra a primeira cena completa e a faixa não anda", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "parado.html");
    fs.writeFileSync(file, buildHTML({ theme: "musgo", motion: "none", slides: [{ ...COVER, figure: { motion: CURL } }, ...SECOES] }).html);
    const { page, errors } = await newPage(browser);
    await page.goto(pathToFileURL(file).href);
    const f = page.frameLocator("iframe[data-motion=console]");
    await f.locator(".cmd").filter({ hasText: "curl -X POST /api/memorias" }).waitFor();
    assert.equal(await f.locator(".out").count(), 2, "no instante em que aparece, a cena já está completa");
    assert.equal(await f.locator(".cur").count(), 0, "sem cursor de digitação");
    assert.equal(await page.locator(".tk-track").evaluate((e) => getComputedStyle(e).animationName), "none");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("rede (eco ambiente): vem sozinha atrás da capa do musgo, anda só no slide atual; ambient: false tira", { timeout: 120000 }, async (t) => {
  const capa = buildHTML({ theme: "musgo", slides: [COVER, ...SECOES] }).html;
  assert.match(capa, /data-ambient="rede"[^>]*>\s*<div class="ambient" aria-hidden="true"><canvas><\/canvas><\/div>/);
  assert.equal((capa.match(/<section[^>]*data-ambient="rede"/g) || []).length, 1, "só na capa");
  assert.doesNotMatch(buildHTML({ theme: "musgo", slides: [{ ...COVER, ambient: false }] }).html, /<section[^>]*data-ambient=/);
  assert.match(buildHTML({ theme: "sinal", slides: [{ layout: "statement", text: "x", ambient: "rede" }] }).html, /<section[^>]*data-ambient="rede"/, "qualquer tema pode pedir");
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "rede.html");
    fs.writeFileSync(file, capa);
    const { page, errors } = await newPage(browser);
    await page.goto(pathToFileURL(file).href);
    const quadro = () => page.locator(".slide[data-ambient=rede] .ambient canvas").evaluate((c) => c.toDataURL());
    await page.waitForFunction(() => window.sagadeck?.cur === 0);
    const a = await quadro();
    let mudou = false;
    for (let i = 0; i < 20 && !mudou; i++) { await new Promise((r) => setTimeout(r, 100)); mudou = (await quadro()) !== a; }
    assert.ok(mudou, "a rede anda na capa");
    await page.evaluate(() => window.sagadeck.goto(1));
    await new Promise((r) => setTimeout(r, 150));
    const b = await quadro();
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(await quadro(), b, "fora da capa, para");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});
