// Desfazer / refazer único do Studio (src/studio/public/history.js): toda mudança do deck vira um passo, com a origem.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import "../src/studio/public/history.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const { createHistory } = globalThis.SagaHistory;

test("histórico: passos com rótulo, digitação seguida vira um passo, refazer some com mudança nova, outra apresentação recomeça", () => {
  let t = 0;
  const h = createHistory({ now: () => t, limit: 3 });
  const d = (title) => ({ title, slides: [] });
  h.note(d("a"), "Edição", "x.yaml");                  // abriu: ponto de partida, sem passo
  assert.equal(h.canUndo, false);
  h.note(d("ab"), "Edição", "x.yaml"); t += 100;
  h.note(d("abc"), "Edição", "x.yaml"); t += 100;       // digitando: junta com o anterior
  assert.equal(h.size, 1);
  // logo em seguida, mas em OUTRO lugar (arrastou e apagou o objeto): passo novo
  const g = createHistory({ now: () => 0 });
  const s0 = { slides: [{ visualEdits: { k: { dx: 5 } } }] };
  g.note({ slides: [{}] }, "Edição", "x.yaml");
  g.note(s0, "Edição", "x.yaml");
  g.note({ slides: [{ visualEdits: { k: { dx: 5, hidden: true } } }] }, "Edição", "x.yaml");
  assert.equal(g.size, 2, "arrastar e apagar: dois passos");
  assert.deepEqual(g.undo().deck, s0);
  t += 5000;
  h.note(d("abc!"), "Assistente de IA", "x.yaml");
  assert.equal(h.undoLabel, "Assistente de IA");
  assert.deepEqual(h.undo().deck, d("abc"));
  assert.deepEqual(h.undo().deck, d("a"));
  assert.equal(h.canUndo, false);
  assert.deepEqual(h.redo().deck, d("abc"));
  h.note(d("outro"), "YAML", "x.yaml");
  assert.equal(h.canRedo, false, "mudança nova depois de desfazer: o refazer some");
  h.rebase(d("outro+uid"));                              // o servidor completou: sem passo novo
  assert.equal(h.size, 2);
  for (const x of ["1", "2", "3", "4"]) { t += 5000; h.note(d(x), "YAML", "x.yaml"); }
  assert.equal(h.size, 3, "limite de passos");
  h.note(d("z"), "Apresentação aberta", "y.yaml");
  assert.equal(h.canUndo, false, "outra apresentação: histórico novo");
});

test("Studio: desfazer e refazer pelo botão e pelo teclado (duplicar slide, editar texto); no campo de texto, Ctrl+Z é do campo", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8"));
    const settle = () => p.waitForTimeout(900);
    const n = saved().slides.length;
    assert.ok(await p.isDisabled("#btn-undo"), "nada para desfazer ao abrir");
    await p.click('.thumb-card[data-idx="0"]');
    await p.click("#btn-dup-slide"); await settle();
    assert.equal(saved().slides.length, n + 1);
    assert.match(await p.getAttribute("#btn-undo", "title"), /Desfazer: Edição/);
    await p.click("#btn-undo"); await settle();
    assert.equal(saved().slides.length, n, "desfez no arquivo");
    await p.click("#btn-redo"); await settle();
    assert.equal(saved().slides.length, n + 1, "refez no arquivo");
    await p.locator("#canvas-area, body").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await p.keyboard.press("Control+z"); await settle();
    assert.equal(saved().slides.length, n, "Ctrl+Z desfaz");
    await p.keyboard.press("Control+y"); await settle();
    assert.equal(saved().slides.length, n + 1, "Ctrl+Y refaz");
    // Ctrl+Z com o cursor num campo de texto é do campo: o deck não muda
    await p.focus("#deck-title-input");
    await p.keyboard.press("Control+z"); await settle();
    assert.equal(saved().slides.length, n + 1, "Ctrl+Z no campo não desfez o deck");
    // digitar no título é um passo só
    const antes = saved().title;
    await p.fill("#deck-title-input", "Título novo");
    await p.locator("#deck-title-input").blur(); await settle();
    assert.equal(saved().title, "Título novo");
    await p.click("#btn-undo"); await settle();
    assert.equal(saved().title, antes, "o título voltou (a digitação inteira, num passo)");
    assert.equal(await p.inputValue("#deck-title-input"), antes, "o campo do título acompanha");
    assert.equal(saved().slides.length, n + 1, "e o slide duplicado continua");
    await p.click("#btn-undo"); await settle();
    assert.equal(saved().slides.length, n);
    assert.equal(saved().title, antes);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
