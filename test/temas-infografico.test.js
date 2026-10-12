// Temas de infográfico (wine, caderno, lousa, cartaz, infografico), o cartão que vira (flip:) e o botão + com balão
// (pop / more na linha do tempo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../src/build.js";
import { el } from "../src/elements.js";
import { THEMES } from "../src/themes.js";
import { browserOrSkip, newPage, tempDeck } from "./helpers.js";

const COVER = { layout: "cover", kicker: "Infográfico", title: "Visual ==Thinking==" };
const CARTOES = { layout: "cards", title: "Três movimentos", items: [
  { icon: "clock", title: "Visualizar ideias", flip: "Desenhe antes de escrever." },
  { icon: "lightbulb", title: "Integrar a IA", flip: { title: "Clique, descubra", text: "Os detalhes ficam para quem explora." } },
  { icon: "star", title: "Sem verso", text: "Cartão comum" },
] };
const LINHA = { layout: "timeline", title: "Passos", events: [
  { when: "1", title: "Planejar", more: { title: "Planejar", text: "Estruture antes." } },
  { when: "2", title: "Medir", more: "Meça os resultados." },
] };

test("temas novos: fontes embutidas e a pele de cada um; o wine usa a pele do musgo com o nome dele", () => {
  const fontes = { wine: ["Fraunces", "IBM Plex Mono"], caderno: ["Amatic SC", "Gelasio"], lousa: ["Cabin Sketch", "Itim"], cartaz: ["Bebas Neue"], infografico: ["Bebas Neue", "Montserrat"] };
  for (const [tema, fams] of Object.entries(fontes)) {
    assert.ok(THEMES[tema], tema);
    const { html } = buildHTML({ theme: tema, slides: [COVER, CARTOES] });
    for (const f of fams) assert.match(html, new RegExp(`@font-face\\{font-family:'${f}';[^}]*base64,`), `${tema} leva ${f}`);
    assert.match(html, new RegExp(`\\.th-${tema}[ .:\\[]`), `pele do ${tema}`);
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  }
  const wine = buildHTML({ theme: "wine", slides: [COVER, { layout: "section", title: "Um" }, { layout: "section", title: "Dois" }, { layout: "section", title: "Três" }] }).html;
  assert.match(wine, /\.th-wine \.kicker\{/, "a pele do musgo, com o seletor do wine");
  assert.doesNotMatch(wine, /\.th-musgo\b/, "sem sobra do nome do musgo");
  assert.match(wine, /<section[^>]*th-wine[^>]*data-ambient="rede"/, "rede na capa, como no musgo");
  assert.match(wine, /class="ticker"/, "faixa na capa, como no musgo");
});

test("cartão com flip vira (frente e verso no mesmo lugar); sem flip, continua o cartão de sempre; o verso não vira link", () => {
  const html = el({ cards: CARTOES.items });
  assert.equal((html.match(/data-flip/g) || []).length, 2);
  assert.match(html, /class="card flip-face flip-front"/);
  assert.match(html, /class="card flip-face flip-back" aria-hidden="true">[\s\S]*Clique, descubra[\s\S]*Os detalhes ficam/);
  assert.match(html, /<div class="cd card"[^>]*>[\s\S]*Cartão comum/, "o terceiro não vira");
  assert.match(el({ cards: [{ title: "x", flip: "y", hl: true }] }), /class="card card-hi flip-face flip-front"/, "destaque vale nas duas faces");
  // "back" é o Voltar da navegação: o verso tem outro nome, e o verificador de links não o confunde com destino
  assert.deepEqual(buildHTML({ slides: [CARTOES] }).warnings, []);
});

test("botão + : elemento pop e more no marco da linha do tempo, com balão fechado", () => {
  const pop = el({ pop: { title: "Ponto", text: "Detalhe", side: "right" }, x: 100, y: 200 });
  assert.match(pop, /class="pop-el"[^>]*left:100px;top:200px/);
  assert.match(pop, /class="pop pop-right" data-pop><button type="button" class="pop-btn" aria-expanded="false"/);
  assert.match(el({ pop: "Só o texto" }), /pop-above[\s\S]*Só o texto/);
  const linha = buildHTML({ slides: [LINHA] }).html;
  assert.equal((linha.match(/<span class="pop pop-above" data-pop>/g) || []).length, 2);
});

test("no navegador: o cartão vira no clique e no Enter, desvira ao sair; o balão abre, fecha fora e um de cada vez; nada encolhe o slide", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "interativo.html");
    fs.writeFileSync(file, buildHTML({ theme: "caderno", slides: [CARTOES, LINHA, { layout: "statement", text: "Fim" }] }).html);
    const { page, errors } = await newPage(browser);
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.sagadeck?.cur === 0);
    assert.equal(await page.evaluate(() => document.querySelector(".slide.current").dataset.shrink), undefined, "frente e verso no mesmo lugar não contam como texto encavalado");
    const card = page.locator(".slide.current [data-flip]").first();
    await card.click();
    assert.equal(await card.getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".slide.current [data-flip] .flip-in")).transform !== "none");
    assert.equal(await page.evaluate(() => window.sagadeck.cur), 0, "virar não troca de slide");
    const segundo = page.locator(".slide.current [data-flip]").nth(1);
    await segundo.focus();
    await page.keyboard.press("Enter");
    assert.equal(await segundo.getAttribute("aria-pressed"), "true", "Enter vira");
    assert.equal(await page.evaluate(() => window.sagadeck.cur), 0);
    await page.evaluate(() => window.sagadeck.goto(1));
    assert.equal(await page.locator(".slide").first().locator("[data-flip].flipped").count(), 0, "sair do slide desvira");
    const pops = page.locator(".slide.current [data-pop]");
    await pops.nth(0).locator(".pop-btn").click();
    assert.equal(await pops.nth(0).getAttribute("class"), "pop pop-above open");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".slide.current .pop.open .pop-card")).visibility === "visible");
    await pops.nth(1).locator(".pop-btn").click();
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".slide.current .pop")].map((p) => p.classList.contains("open"))), [false, true], "um de cada vez");
    await page.locator(".slide.current .pop.open .pop-card").click();
    assert.match(await pops.nth(1).getAttribute("class"), / open$/, "clicar no balão não fecha");
    await page.locator(".slide.current .hd .ttl").click();
    assert.equal(await page.locator(".slide.current .pop.open").count(), 0, "clicar fora fecha");
    await pops.nth(0).locator(".pop-btn").click();
    await page.evaluate(() => window.sagadeck.goto(2));
    assert.equal(await page.locator(".pop.open").count(), 0, "trocar de slide fecha");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});
