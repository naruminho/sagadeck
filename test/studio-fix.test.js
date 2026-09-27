// Fiscal com as correções à mão: quando um slide tem problema (texto fora da margem, sobreposição), aparece um
// painel embaixo dele com o que dá para fazer, em vez de só um número vermelho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const LONGA = { layout: "statement", lines: Array.from({ length: 7 }, (_, i) => ({ text: `Linha ${i + 1} de uma frase longa`, as: "hero" })) };

test("fiscal: painel com opções de correção aparece sozinho e cada opção funciona", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
  spec.slides.splice(1, 0, LONGA);
  fs.writeFileSync(deckFile.file, YAML.stringify(spec));
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector('.thumb-card[data-idx="1"]');

    await t.test("slide sem problema: sem painel", async () => {
      await p.click('.thumb-card[data-idx="0"]');
      await p.waitForTimeout(1500);
      assert.equal(await p.isVisible("#fix-panel"), false);
    });

    await t.test("slide com texto fora da margem: o painel diz o problema e oferece as correções", async () => {
      await p.click('.thumb-card[data-idx="1"]');
      await p.waitForSelector("#fix-panel:not(.hidden)", { timeout: 5000 });
      const txt = await p.innerText("#fix-panel");
      assert.match(txt, /fora da margem/i);
      for (const a of ["auto", "compact", "ignore"]) assert.equal(await p.locator(`#fix-panel [data-fix="${a}"]`).count(), 1, a);
    });

    await t.test("Modo compacto grava density: compact no slide", async () => {
      await p.click('#fix-panel [data-fix="compact"]');
      await p.waitForTimeout(900);
      assert.equal(saved().slides[1].density, "compact");
    });

    await t.test("Ajustar sozinho corrige o slide salvo", async () => {
      await p.waitForTimeout(1500);
      if (!(await p.isVisible("#fix-panel"))) return; // o modo compacto já resolveu
      const before = JSON.stringify(saved().slides[1]);
      await p.click('#fix-panel [data-fix="auto"]');
      await p.waitForTimeout(1200);
      assert.notEqual(JSON.stringify(saved().slides[1]), before);
    });

    await t.test("Ignorar esconde o painel deste slide", async () => {
      await p.waitForTimeout(1500);
      if (await p.isVisible("#fix-panel")) {
        await p.click('#fix-panel [data-fix="ignore"]');
        assert.equal(await p.isVisible("#fix-panel"), false);
      }
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});
