// Multisseleção de slides na lista: botão direito copia/cola, Ctrl+click e Ctrl+setas
// selecionam vários, Delete exclui o bloco com Desfazer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("botão direito no slide copia e cola (menu Copiar/Colar)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const settle = () => p.waitForTimeout(900);
    await p.waitForSelector('.thumb-card[data-idx="1"]');
    const before = saved().slides.length;
    await p.click('.thumb-card[data-idx="0"]', { button: "right" });
    await p.getByRole("menuitem", { name: "Copiar slide" }).click();
    await settle();
    await p.click('.thumb-card[data-idx="1"]', { button: "right" });
    await p.getByRole("menuitem", { name: "Colar slide" }).click();
    await settle();
    const after = saved();
    assert.equal(after.slides.length, before + 1, "colou uma cópia depois do slide 2");
    const semUid = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "uid" ? undefined : v)));
    assert.deepEqual(semUid(after.slides[2]), semUid(after.slides[0]), "a cópia tem o conteúdo do slide 1 (com identificadores novos)");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});

test("Ctrl+click seleciona vários; Delete exclui o bloco com Desfazer", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const settle = () => p.waitForTimeout(900);
    await p.waitForSelector('.thumb-card[data-idx="2"]');
    const sel = () => p.locator(".thumb-card.selected").evaluateAll((els) => els.map((e) => e.dataset.idx));
    await p.click('.thumb-card[data-idx="0"]');
    await p.click('.thumb-card[data-idx="2"]', { modifiers: ["Control"] });
    assert.deepEqual(await sel(), ["0", "2"], "os dois marcados");
    const before = saved().slides.map((s) => s.title || s.text);
    await p.keyboard.press("Delete");
    await settle();
    assert.match(await p.innerText("#toast-notification"), /2 slides excluídos/);
    assert.equal(saved().slides.length, before.length - 2);
    await p.click("#toast-notification [data-toast-undo]");
    await settle();
    assert.deepEqual(saved().slides.map((s) => s.title || s.text), before, "Desfazer devolve os dois no lugar");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});

test("Ctrl+seta estende a seleção sem trocar o foco sozinho", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const settle = () => p.waitForTimeout(600);
    await p.waitForSelector('.thumb-card[data-idx="2"]');
    const sel = () => p.locator(".thumb-card.selected").evaluateAll((els) => els.map((e) => e.dataset.idx));
    const active = () => p.locator(".thumb-card.active").getAttribute("data-idx");
    await p.click('.thumb-card[data-idx="1"]');
    await settle();
    await p.keyboard.down("Control");
    await p.keyboard.press("ArrowDown");
    await p.keyboard.up("Control");
    await settle();
    assert.equal(await active(), "2", "o foco andou");
    assert.deepEqual(await sel(), ["1", "2"], "a seleção estendeu");
    await p.keyboard.press("ArrowDown");
    await settle();
    assert.deepEqual(await sel(), ["3"], "seta pura volta a selecionar só um");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});
