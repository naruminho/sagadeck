// Ajuda › Sobre o SagaDeck (no editor) e o botão Sobre (na biblioteca): a versão que está rodando, à vista, com o
// essencial para pedir ajuda (commit, Node, a biblioteca, se a IA está configurada) e Copiar informações.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

test("Ajuda › Sobre mostra a versão no editor; o botão Sobre da biblioteca, também", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const inst = await (await fetch(`${studio.url}/api/instance`)).json();
    assert.equal(inst.version, VERSION);
    assert.match(inst.node, /^v\d+\./, "a versão do Node vai junto, para suporte");
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click('.ribbon-tab[data-tab="ajuda"]');
    await p.click("#btn-about");
    const dlg = p.locator("#about-dialog");
    await dlg.locator("[data-version]").waitFor();
    assert.equal(await dlg.locator("[data-version]").innerText(), VERSION);
    const texto = await dlg.innerText();
    assert.match(texto, /Commit/);
    assert.ok(texto.includes(inst.node), `Node ${inst.node} na janela`);
    assert.match(texto, /IA\s+(configurada|não configurada)/);
    assert.ok(await dlg.locator("[data-copy]").isVisible(), "Copiar informações");
    await dlg.locator("button.primary[data-close]").click();
    assert.equal(await dlg.evaluate((d) => d.open), false);
    // na biblioteca, o mesmo Sobre
    await p.goto(studio.url + "/biblioteca");
    await p.click("#btn-about");
    await p.locator("#about-dialog [data-version]").waitFor();
    assert.equal(await p.locator("#about-dialog [data-version]").innerText(), VERSION);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
