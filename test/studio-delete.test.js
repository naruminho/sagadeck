// Excluir slide pelo teclado: com o foco na lista de slides (à esquerda), Delete/Backspace exclui o slide
// selecionado; o aviso oferece Desfazer, que devolve o slide no mesmo lugar. Digitando num campo, nada acontece.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("Delete na lista de slides exclui o selecionado, com Desfazer", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const layouts = () => saved().slides.map((s) => s.layout);
    const settle = () => p.waitForTimeout(900);
    await p.waitForSelector('.thumb-card[data-idx="1"]');
    const before = layouts();
    assert.ok(before.length >= 4);

    await t.test("clicar no slide 2 e apertar Delete: some exatamente ele, do arquivo salvo", async () => {
      await p.click('.thumb-card[data-idx="1"]');
      await p.keyboard.press("Delete");
      await settle();
      assert.deepEqual(layouts(), [before[0], ...before.slice(2)]);
      assert.equal(await p.locator(".thumb-card").count(), before.length - 1);
      assert.match(await p.innerText("#toast-notification"), /Slide 2 excluído/);
    });

    await t.test("Desfazer no aviso devolve o slide no mesmo lugar", async () => {
      await p.click("#toast-notification [data-toast-undo]");
      await settle();
      assert.deepEqual(layouts(), before);
      assert.equal(await p.locator('.thumb-card.active').getAttribute("data-idx"), "1", "o slide devolvido volta selecionado");
    });

    await t.test("Backspace na lista também exclui (como no PowerPoint)", async () => {
      await p.click('.thumb-card[data-idx="2"]');
      await p.keyboard.press("Backspace");
      await settle();
      assert.deepEqual(layouts(), [...before.slice(0, 2), ...before.slice(3)]);
      await p.click("#toast-notification [data-toast-undo]");
      await settle();
      assert.deepEqual(layouts(), before);
    });

    await t.test("digitando num campo, Delete/Backspace não mexem nos slides", async () => {
      await p.click('.thumb-card[data-idx="1"]');
      await p.click("#deck-title-input");
      await p.keyboard.press("End");
      await p.keyboard.press("Backspace");
      await p.keyboard.press("Delete");
      await settle();
      assert.equal(saved().slides.length, before.length);
    });

    await t.test("com um slide só, avisa e não exclui", async () => {
      for (let n = before.length; n > 1; n--) { await p.click('.thumb-card[data-idx="0"]'); await p.keyboard.press("Delete"); await p.waitForTimeout(250); }
      await settle();
      assert.equal(saved().slides.length, 1);
      await p.click('.thumb-card[data-idx="0"]');
      await p.keyboard.press("Delete");
      await settle();
      assert.equal(saved().slides.length, 1);
      assert.match(await p.innerText("#toast-notification"), /único slide/);
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});
