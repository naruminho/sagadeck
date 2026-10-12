// Ajuda › Sobre o SagaDeck (no editor) e o botão Sobre (na biblioteca): a versão que está rodando, à vista, com o
// essencial para pedir ajuda (commit, Node, a biblioteca, se a IA está configurada) e Copiar informações.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

// contraste (WCAG) do texto de cada parte do Sobre contra o fundo da janela; o pior caso é o que vale
async function worstContrast(p) {
  return p.evaluate(() => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const d = document.getElementById("about-dialog"), bg = getComputedStyle(d).backgroundColor;
    return Math.min(...[...d.querySelectorAll("h2, .ver, .ver b, dt, dd, .links a, button:not(.primary)")]
      .map((el) => ratio(getComputedStyle(el).color, bg)));
  });
}
async function openAbout(p, theme) {
  await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
  await p.click("#btn-about");
  await p.locator("#about-dialog [data-version]").waitFor();
}

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

// O tema escuro deixava a janela com fundo branco e texto claro (as cores do fundo vinham de variáveis que nenhuma
// página define): o texto tem de ser legível nos dois temas, no editor e na biblioteca
test("Sobre legível no tema claro e no escuro, no editor e na biblioteca", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    for (const pagina of ["/", "/biblioteca"]) {
      for (const tema of ["light", "dark"]) {
        await p.goto(studio.url + pagina);
        if (pagina === "/") await p.click('.ribbon-tab[data-tab="ajuda"]');
        await openAbout(p, tema);
        const c = await worstContrast(p);
        assert.ok(c >= 4.5, `${pagina} no tema ${tema}: contraste ${c.toFixed(2)} (mínimo 4,5)`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
