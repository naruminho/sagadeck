// Dinâmicas a dois (duel, terminals, turns): o simulador de Git calcula o que acontece, cada clique é um quadro.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { simulateGit } from "../src/dynamics/git-sim.js";
import { buildHTML, renderSlide } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip, newPage, startStudio, tempDeck, novoSlide } from "./helpers.js";

const BASE = "function soma(a, b) {\n  return a + b;\n}";

test("simulador de Git: push recusado, conflito calculado na linha certa, resolução com commit de dois pais, fast-forward", () => {
  const { frames } = simulateGit(LAYOUT_SAMPLES.duel);
  const ev = frames.map((f) => f.event);
  assert.deepEqual(ev, ["start", "commit", "commit", "push", "rejected", "conflict", "merge-commit", "push", "ff"]);
  const conflito = frames[5].people[1];
  assert.equal(conflito.status, "conflito");
  assert.deepEqual(conflito.file, ["function soma(a, b) {", "<<<<<<< Beto (seu)", "  return b + a;", "=======", "  return a + b + 0;", ">>>>>>> origin/main", "}"]);
  assert.deepEqual(conflito.conflict, [2, 3, 4, 5, 6], "só as linhas do conflito ficam marcadas (o } de baixo não)");
  assert.match(frames[4].out, /\[rejected\]/);
  assert.match(frames[4].text, /Primeiro pull/);
  const resolvido = frames[6];
  assert.equal(resolvido.commits.at(-1).parents.length, 2, "o commit da resolução tem dois pais");
  assert.equal(frames.at(-1).people[0].file[1], "  return a + b;", "no fim a Ana recebe a resolução (fast-forward)");
  assert.equal(frames.at(-1).people[0].status, "em dia");
  // mudanças em linhas diferentes: o Git junta sozinho, com commit de merge
  const auto = simulateGit({ base: BASE, turns: [{ who: 1, edit: { 1: "function soma(x, y) {" }, commit: "renomeia" }, { who: 2, edit: { 3: "} // fim" }, commit: "comenta" }, { who: 1, push: true }, { who: 2, pull: true }] });
  const m = auto.frames.at(-1);
  assert.equal(m.event, "merge");
  assert.deepEqual(m.people[1].file, ["function soma(x, y) {", "  return a + b;", "} // fim"]);
  // plural certo e status de quem está atrás
  assert.equal(auto.frames[1].people[0].status, "1 commit à frente");
  assert.equal(auto.frames[3].people[1].status, "1 commit à frente");
  // roteiro impossível: erro claro, em português
  assert.throws(() => simulateGit({ base: BASE, turns: [{ who: 1, edit: { 2: "x" } }, { who: 1, pull: true }] }), /mudanças sem commit/);
  assert.throws(() => simulateGit({ base: BASE, turns: [{ who: 2, resolve: "ours" }] }), /não tem conflito/);
});

test("slides das dinâmicas: aposta vira enquete antes do pull, terminais tiram a saída do simulador, turnos alternam", () => {
  const ctx = { theme: "sinal", slides: [] };
  const duel = renderSlide(LAYOUT_SAMPLES.duel, 0, ctx).html;
  assert.equal((duel.match(/data-lesson-panel=/g) || []).length, 10, "9 quadros do roteiro + 1 da aposta");
  assert.match(duel, /dyn-bet-frame[\s\S]*data-poll="duelo-aposta"/);
  assert.match(duel, /Deu conflito!/);
  assert.match(duel, /class="git-graph"/);
  const term = renderSlide({ ...LAYOUT_SAMPLES.duel, layout: "terminals", turns: [...LAYOUT_SAMPLES.duel.turns, { who: 1, log: true }] }, 0, ctx).html;
  assert.match(term, /git log --graph --oneline --all/);
  assert.match(term, /origin\/main\)/, "o log mostra onde está o origin/main");
  assert.doesNotMatch(term, /mudou a linha/, "terminal só tem o que o terminal mostraria");
  const turns = renderSlide(LAYOUT_SAMPLES.turns, 0, ctx).html;
  assert.equal((turns.match(/data-lesson-panel=/g) || []).length, 4);
  assert.match(turns, /tn-turn who-b tn-new/);
  assert.match(turns, /<b>POST<\/b> \/pix/);
  // erro no roteiro: o slide sai com o aviso (e o fiscal recebe)
  const warnings = [];
  const bad = renderSlide({ layout: "duel", base: BASE, turns: [{ who: 1, resolve: "ours" }] }, 0, { ...ctx, warnings });
  assert.match(bad.html, /Roteiro do duelo com erro/);
});

test("dinâmicas na apresentação: cada clique troca o quadro; terminal digita; zero erros", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "din.html");
    fs.writeFileSync(file, buildHTML({ title: "Din", theme: "sinal", slides: [LAYOUT_SAMPLES.duel, LAYOUT_SAMPLES.terminals, LAYOUT_SAMPLES.turns] }).html);
    const { page: p, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    const active = (i) => p.evaluate((i) => +document.querySelector(`section[data-idx="${i}"] .dyn-frame.active`).dataset.lessonPanel, i);
    assert.equal(await p.evaluate(() => window.sagadeck.steps(0)), 9, "10 quadros = 9 cliques");
    await p.keyboard.press("ArrowRight");
    assert.equal(await active(0), 1);
    await p.evaluate(() => window.sagadeck.goto(0, 5));
    assert.ok(await p.locator('section[data-idx="0"] .dyn-frame.active [data-poll]').count(), "a aposta aparece antes do pull");
    await p.evaluate(() => window.sagadeck.goto(0, 6));
    assert.match(await p.locator('section[data-idx="0"] .dyn-frame.active').innerText(), /Deu conflito!/);
    assert.equal(await p.locator('section[data-idx="0"] .dyn-frame.active .dyn-code li.cf').count(), 5);
    // terminal: o comando novo é digitado (animação na largura), o antigo fica parado
    await p.evaluate(() => window.sagadeck.goto(1, 3));
    const typing = await p.evaluate(() => getComputedStyle(document.querySelector('section[data-idx="1"] .dyn-frame.active .tm-new .tm-cmd')).animationName);
    assert.match(typing, /tm-type/);
    assert.match(await p.locator('section[data-idx="1"] .dyn-frame.active').innerText(), /git log --graph/);
    // turnos: a fala nova entra, as antigas continuam à vista
    await p.evaluate(() => window.sagadeck.goto(2, 2));
    assert.equal(await p.locator('section[data-idx="2"] .dyn-frame.active .tn-turn').count(), 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: galeria com as dinâmicas a dois; o turno se edita no formulário e grava no deck", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.click('.ribbon-tab[data-tab="inicio"]'); await p.click("#btn-scenes");
    await p.click('#scene-modal [data-scene-filter="dinamicas"]');
    assert.deepEqual(await p.locator("#scene-grid .scene-card:not([hidden])").evaluateAll((els) => els.map((e) => e.dataset.scene)), ["duel", "terminals", "turns"]);
    await p.keyboard.press("Escape");
    await novoSlide(p, "duel");
    const idx = saved().slides.findIndex((s) => s.layout === "duel");
    await p.waitForSelector("#rendered-slide-container .L-duel .git-graph");
    // "Linhas que muda" do primeiro turno: "2: texto" vira {2: "texto"} no deck
    const edit = p.locator("#slide-fields-form textarea[placeholder='2: novo texto da linha 2']").first();
    if (!(await edit.isVisible())) await p.locator("#slide-fields-form .sf-item-toggle").first().click();
    await edit.fill("2:   return a * b;");
    await edit.blur();
    for (let k = 0; k < 30 && saved().slides[idx].turns[0].edit?.[2] !== "  return a * b;"; k++) await p.waitForTimeout(100);
    assert.deepEqual(saved().slides[idx].turns[0].edit, { 2: "  return a * b;" });
    // linha sem número: avisa e não grava lixo
    await edit.fill("return a * b;");
    assert.match(await p.locator("#slide-fields-form .sf-error").filter({ hasText: "número da linha" }).first().innerText(), /2: texto/);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
