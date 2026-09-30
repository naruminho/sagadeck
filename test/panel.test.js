// Painel lateral e ações rápidas: o chat é a aba padrão (com atalho flutuante quando não está à vista), menus de
// botão direito, o conteúdo do slide sempre à mão (carrossel, screenshot…), "Deixar assim" que dura, uso do material.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

function deckWith(slides) {
  const d = tempDeck();
  const spec = YAML.parse(fs.readFileSync(d.file, "utf8"));
  spec.slides = slides;
  fs.writeFileSync(d.file, YAML.stringify(spec));
  return d;
}

test("chat é a aba padrão do painel; fora dela, um atalho flutuante no meio da direita volta para ele", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url, undefined, { pane: null });
    await p.waitForSelector(".thumb-card");
    assert.ok(await p.locator("#tab-btn-chat.active").count(), "abre no chat");
    assert.ok(await p.locator("#chat-fab.hidden").count(), "com o chat à vista, sem atalho");
    await p.click("#tab-btn-props");
    await p.waitForSelector("#chat-fab:not(.hidden)");
    const box = await p.locator("#chat-fab").boundingBox(), vw = p.viewportSize();
    assert.ok(box.x + box.width >= vw.width - 1 && Math.abs(box.y + box.height / 2 - vw.height / 2) < 4, "encostado à direita, no meio da tela");
    await p.click("#chat-fab");
    assert.ok(await p.locator("#tab-btn-chat.active").count());
    await p.waitForSelector("#chat-fab.hidden", { state: "attached" });
    // painel fechado: o atalho reabre no chat
    await p.click("#btn-close-pane");
    await p.waitForSelector("#chat-fab:not(.hidden)");
    await p.click("#chat-fab");
    assert.ok(await p.locator("#tab-btn-chat.active").isVisible());
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("conteúdo do slide sempre à mão: trocar de slide com algo selecionado volta ao Formatar; duplo clique no carrossel abre; Propriedades leva ao conteúdo", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = deckWith([{ layout: "cover", title: "Capa" }, LAYOUT_SAMPLES.carousel, { layout: "spotlight", title: "Tela", hotspots: [{ title: "A" }] }]);
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector(".thumb-card");
    await p.click('.thumb-card[data-idx="1"]');
    await p.waitForSelector("#rendered-slide-container .L-carousel");
    // seleciona um texto (vai para Propriedades), troca de slide sem soltar e volta: o Formatar tem os itens
    await p.locator("#rendered-slide-container .car-text.active .car-title").click();
    await p.waitForSelector("#tab-btn-inspect.active");
    await p.click('.thumb-card[data-idx="2"]');
    await p.waitForSelector("#tab-btn-props.active");
    await p.waitForFunction(() => /Editar imagem e destaques/.test(document.getElementById("slide-fields-form").innerText), null, { timeout: 5000 }); // screenshot: os campos dele
    await p.click('.thumb-card[data-idx="1"]');
    assert.ok(await p.locator("#tab-btn-props.active").count());
    await p.waitForFunction(() => /Itens \(um por clique\)/.test(document.getElementById("slide-fields-form").innerText), null, { timeout: 5000 }); // carrossel: os itens
    // em Propriedades, um botão leva ao conteúdo
    await p.click("#tab-btn-inspect");
    await p.click("#inspector-body [data-open-content]");
    assert.ok(await p.locator("#tab-btn-props.active").count());
    // duplo clique na foto do carrossel (fora do texto) também
    await p.click("#tab-btn-chat");
    await p.locator("#rendered-slide-container .car-item.active .car-photo").dblclick();
    await p.waitForSelector("#tab-btn-props.active");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("botão direito: ações rápidas no slide, no objeto e na miniatura", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    const n0 = saved().slides.length;
    // miniatura: duplicar
    await p.click('.thumb-card[data-idx="1"]', { button: "right" });
    const itens = await p.locator(".ctx-menu .ctx-item span").allTextContents();
    assert.ok(itens.includes("Duplicar slide") && itens.includes("Excluir slide") && itens.includes("Mover para baixo"), itens.join(" | "));
    await p.locator(".ctx-menu .ctx-item", { hasText: "Duplicar slide" }).click();
    for (let k = 0; k < 30 && saved().slides.length === n0; k++) await p.waitForTimeout(100);
    assert.equal(saved().slides.length, n0 + 1);
    assert.equal(await p.locator(".ctx-menu").count(), 0, "o menu fecha depois da ação");
    // objeto: propriedades, frente/trás, excluir
    await p.locator("#rendered-slide-container .ttl").first().click({ button: "right" });
    const obj = await p.locator(".ctx-menu .ctx-item span").allTextContents();
    assert.deepEqual(obj.slice(0, 4), ["Propriedades do objeto", "Trazer para frente", "Enviar para trás", "Excluir objeto"]);
    // Esc fecha; no fundo do slide, as ações do slide (com a IA)
    await p.keyboard.press("Escape");
    assert.equal(await p.locator(".ctx-menu").count(), 0);
    const box = await p.locator("#rendered-slide-container").boundingBox();
    await p.mouse.click(box.x + box.width - 6, box.y + 6, { button: "right" });
    await p.locator(".ctx-menu .ctx-item", { hasText: "Pedir à IA para melhorar este slide" }).click();
    assert.ok(await p.locator("#tab-btn-chat.active").count());
    assert.match(await p.inputValue("#chat-input"), /^Melhore o slide 3: /, "o slide aberto é a cópia recém-duplicada");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("Deixar assim: o aviso e a marcação somem, ficam sumidos depois de recarregar e voltam quando o slide muda", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const code = Array.from({ length: 40 }, (_, i) => `git commit -m "passo ${i + 1}: mensagem comprida de commit para ocupar a linha toda do bloco"`).join("\n");
  const deckFile = deckWith([{ layout: "code", title: "Histórico", language: "bash", code }, { layout: "end", title: "Fim" }]);
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector("#fix-panel:not(.hidden)", { timeout: 15000 });
    await p.click('#fix-panel [data-fix="ignore"]');
    await p.waitForSelector("#fix-panel.hidden", { state: "attached" });
    for (let k = 0; k < 30 && !saved().slides[0].fiscalOk; k++) await p.waitForTimeout(100);
    assert.ok(saved().slides[0].fiscalOk, "a marca vai no deck");
    assert.equal(await p.locator("#fiscal-badge").innerText(), "0");
    await p.reload(); await p.waitForSelector(".thumb-card"); await p.waitForTimeout(1500);
    assert.ok(await p.locator("#fix-panel.hidden").count(), "depois de recarregar, continua aceito");
    // mudou o slide: o aviso volta
    await p.click("#tab-btn-props");
    await p.fill("#slide-fields-form input >> nth=0", "Histórico longo");
    await p.waitForSelector("#fix-panel:not(.hidden)", { timeout: 15000 });
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("uso do material: dois caminhos só (apresentar × estudar depois), e deck antigo mostra o que tem", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await p.click("#tab-btn-inspect");
    const sel = p.locator('#inspector-body select[data-k="purpose"]');
    assert.deepEqual(await sel.locator("option").allTextContents(), ["Para apresentar: letra grande, pouco texto", "Para estudar depois: conteúdo denso"]);
    await sel.selectOption("consulta");
    for (let k = 0; k < 30 && saved().purpose !== "consulta"; k++) await p.waitForTimeout(100);
    assert.equal(saved().purpose, "consulta");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
