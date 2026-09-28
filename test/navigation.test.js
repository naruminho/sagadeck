// Navegação por caminhos (pedido do Naruminho: processo com várias rotas, tipo "experimento ou projeto? DEV, HOM,
// PROD?"): um mapa (layout hub) com opções que levam à seção de cada caminho (goto), "Voltar" (back) e o fim do
// caminho voltando ao mapa (next). Funciona na apresentação, no PDF (links entre páginas) e no PowerPoint.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { buildHTML, navWarnings } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const DECK = {
  title: "Caminhos",
  slides: [
    { layout: "cover", title: "Como pedir acesso" },
    { layout: "hub", id: "mapa", title: "Qual é o seu caso?", question: "Escolha o caminho",
      options: [
        { title: "Experimento", text: "30 dias, dados fictícios", icon: "flask-conical", meta: "30 dias", goto: "exp" },
        { title: "Projeto", text: "DEV, HOM e PROD", icon: "rocket", goto: "proj" },
      ] },
    { layout: "statement", id: "exp", text: "Experimento: renove a cada 30 dias. [Ver o projeto](#proj)", back: "mapa", next: "mapa" },
    { layout: "list", id: "proj", title: "Projeto", items: [{ text: "DEV: 30 dias" }, { text: "Volte ao começo", goto: 1 }], back: "mapa", next: "mapa" },
    { layout: "end", title: "Fim" },
  ],
};

test("motor: mapa com opções clicáveis, id/next no slide, Voltar com o nome do destino, [texto](#id) e avisos", () => {
  const { html, warnings } = buildHTML(DECK);
  assert.deepEqual(warnings.filter((w) => /link|id/.test(w)), []);
  assert.match(html, /<section[^>]*id="s-exp" data-id="exp" data-next="mapa"/);
  assert.equal((html.match(/class="[^"]*hub-card[^"]*goto[^"]*"[^>]*data-goto="(exp|proj)"/g) || []).length, 2, "as duas opções levam a algum lugar");
  assert.match(html, /<a class="nav-back[^"]*" href="#s-mapa" data-goto="mapa">[\s\S]*?Voltar: Qual é o seu caso\?/);
  assert.match(html, /<a class="goto-link" href="#s-proj" data-goto="proj">Ver o projeto<\/a>/);
  assert.match(html, /data-goto="1"/, "goto também aceita o número do slide");
  // destino que não existe e id repetido avisam
  const w = navWarnings([{ id: "a", goto: "b" }, { id: "a", text: "[x](#c)" }, { next: "99" }]);
  assert.equal(w.length, 4, w.join("\n"));
  assert.match(w.join("\n"), /"b" não leva a nenhum slide/);
  assert.match(w.join("\n"), /id "a" repetido/);
  assert.match(w.join("\n"), /"c" não leva/);
  assert.match(w.join("\n"), /"99" não leva/);
});

test("apresentação: clicar na opção vai ao caminho; o fim do caminho volta ao mapa; Voltar e [texto](#id) funcionam", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-nav-")), "d.html");
    fs.writeFileSync(file, buildHTML(DECK).html);
    await p.goto("file://" + file);
    await p.waitForFunction(() => window.sagadeck);
    const atual = () => p.evaluate(() => [...document.querySelectorAll("#stage > .slide")].findIndex((s) => s.classList.contains("current")));
    await p.evaluate(() => window.sagadeck.goto(1, 0));
    await p.click('.slide.current .hub-card[data-goto="proj"]');
    assert.equal(await atual(), 3, "a opção Projeto leva ao slide do projeto");
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(100);
    assert.equal(await atual(), 1, "o fim do caminho (next: mapa) volta ao mapa, não segue para o próximo da lista");
    await p.click('.slide.current .hub-card[data-goto="exp"]');
    assert.equal(await atual(), 2);
    await p.click(".slide.current .goto-link");
    assert.equal(await atual(), 3, "[Ver o projeto](#proj) no meio do texto");
    await p.click(".slide.current .nav-back");
    assert.equal(await atual(), 1, "Voltar leva ao mapa");
    await p.evaluate(() => window.sagadeck.goto(3, 0));
    await p.click('.slide.current .li[data-goto="1"]');
    assert.equal(await atual(), 0, "goto pelo número do slide");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("PDF e PowerPoint: os itens com goto viram links para a página/slide de destino", { timeout: 240000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-nav-exp-"));
  const r = buildHTML(DECK);
  const htmlFile = path.join(dir, "deck.html");
  fs.writeFileSync(htmlFile, r.html);
  const { pdf } = await import("../src/export/shots.js");
  await pdf(htmlFile, path.join(dir, "deck.pdf"));
  const buf = fs.readFileSync(path.join(dir, "deck.pdf")).toString("latin1");
  // mapa (2 opções) + exp (link no texto + Voltar) + proj (Voltar + item) = 6 áreas clicáveis, todas para dentro do PDF
  assert.ok((buf.match(/\/Subtype\s*\/Link/g) || []).length >= 6, "links no PDF");
  assert.doesNotMatch(buf, /\/URI\s*\(file:/, "nada de link para o arquivo HTML");
  const { exportPptx } = await import("../src/export/pptx.js");
  await exportPptx(htmlFile, path.join(dir, "deck.pptx"), { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, "deck.pptx")));
  const mapa = await zip.file("ppt/slides/slide2.xml").async("string");
  assert.match(mapa, /ppaction:\/\/hlinksldjump/, "no PowerPoint, clicar na opção pula para o slide");
  const rels = await zip.file("ppt/slides/_rels/slide2.xml.rels").async("string");
  assert.match(rels, /slide4\.xml/, "a opção Projeto aponta para o slide 4");
});
