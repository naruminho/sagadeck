// Assistente do Studio de ponta a ponta com o LLM falso: editar, ver o slide, imagem colada e conversa
// (brainstorm) detectada sozinha — sem a pessoa escolher modo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";
import { startMockLLM } from "./mock-llm.js";

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const INSERT = "Criei 2 slides.\n```yaml\ninsert:\n  - after: 1\n    slide: { layout: question, question: Quem aqui já caiu num golpe?, options: [Sim, Não] }\n  - after: 1\n    slide: { layout: number, value: 3, suffix: \" mi\", label: de prejuízo em fraudes }\n```";

// o "modelo": aqui ele "decide" pelo pedido (o de verdade decide lendo a mensagem e a conversa)
const pedido = (req) => (req.lastUser.match(/Pedido: ([^\n]*)/) || [])[1] || "";
function script(req) {
  const p = pedido(req);
  if (/sem visão/.test(p) && req.hasImages) return { status: 404, error: "No endpoints found that support image input" };
  if (/sem visão/.test(p)) return ["Respondi sem ver o slide.", "```opcoes", "Ok", "Outra coisa", "```"].join("\n");
  if (/o que você acha/.test(p)) return "Gosto do tema. Quem é o público?\n```opcoes\nO público é a diretoria\nO público é técnico\n```";
  if (/diretoria/.test(p)) return "Para a diretoria, abra com o prejuízo em R$ e uma pergunta.\n```opcoes\nPode fazer isso\nMais uma ideia\n```";
  if (/Pode fazer/.test(p)) {
    assert.ok(req.messages.some((m) => /abra com o prejuízo/.test(typeof m.content === "string" ? m.content : "")), "a conversa foi junto");
    return INSERT;
  }
  if (/versões/.test(p)) return "Duas versões da capa.\n```yaml\nvariants:\n  slide: 1\n  options:\n    - label: Manchete\n      slide: { layout: headline, text: \"Fraude custa ==3 mi==\" }\n    - label: Número\n      slide: { layout: number, value: 3, suffix: \" mi\", label: em fraudes }\n```";
  if (/kicker novo/.test(p)) {
    return "Troquei o chapéu da capa.\n```yaml\nslides:\n  1:\n    layout: cover\n    kicker: Chapéu da IA\n    title: Título da ==capa==\n    subtitle: Subtítulo\n    author: Equipe\n    figure: { icon: rocket, size: 320 }\n```";
  }
  return "Entendi, não mudei nada.";
}

test("studio + IA (LLM falso)", async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const llm = await startMockLLM(script);
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file, { llmUrl: llm.url });
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const deck = () => p.evaluate(async () => (await (await fetch("/api/deck")).json()).spec);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const lastAI = () => p.evaluate(() => [...document.querySelectorAll("#chat-messages .ai-msg")].pop()?.innerText || "");
    const waitAI = () => p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 60000 });
    const send = async (text) => { await p.fill("#chat-input", text); await p.click("#chat-send"); await p.waitForTimeout(300); await waitAI(); };
    const lastReq = (re) => llm.requests.findLast((r) => re.test(r.lastUser) || re.test(r.system));

    await p.click('.thumb-card[data-idx="0"]');
    await p.click("#tab-btn-chat");

    await t.test("'Pode fazer' não aparece antes de conversar", async () => {
      assert.ok(await p.isHidden("#btn-brainstorm-apply"));
    });

    await t.test("pedido de mudança: edita o slide e salva", async () => {
      await send("coloque um kicker novo na capa");
      assert.match(await lastAI(), /Troquei o chapéu/);
      assert.equal((await deck()).slides[0].kicker, "Chapéu da IA");
      assert.equal(saved().slides[0].kicker, "Chapéu da IA");
      assert.match(await p.innerText("#rendered-slide-container"), /CHAPÉU DA IA/i);
    });

    await t.test("a IA recebe a imagem do slide renderizado (ela enxerga)", () => {
      assert.ok(lastReq(/kicker novo/).hasImages);
    });

    await t.test("imagem colada no chat chega ao modelo", async () => {
      await p.setInputFiles("#chat-attach-input", { name: "ref.png", mimeType: "image/png", buffer: PNG_1PX });
      await p.waitForSelector("#chat-attachments .chat-att img");
      await send("recrie este slide");
      const labels = lastReq(/recrie este slide/).messages.flatMap((m) => Array.isArray(m.content) ? m.content.map((c) => c.text || "") : []).join(" ");
      assert.match(labels, /imagem colada pelo usuário/);
    });

    await t.test("conversa: a IA responde, sugere e não mexe em nada", async () => {
      const before = JSON.stringify((await deck()).slides);
      await send("o que você acha de eu falar de fraudes para a empresa?");
      assert.match(await lastAI(), /Conversa — nada mudou nos slides/);
      assert.match(await lastAI(), /Quem é o público/);
      assert.equal(await p.locator(".bs-options .bs-option").count(), 2);
      assert.equal(JSON.stringify((await deck()).slides), before);
      assert.ok(await p.isVisible("#btn-brainstorm-apply"));
    });

    await t.test("rodada de refinamento: clicar numa opção continua a conversa", async () => {
      await p.click('.bs-option:has-text("O público é a diretoria")');
      await p.waitForTimeout(300); await waitAI();
      assert.match(await lastAI(), /abra com o prejuízo/);
    });

    await t.test("'Pode fazer' aplica o que foi combinado (com a conversa junto)", async () => {
      const n0 = (await deck()).slides.length;
      await p.click("#btn-brainstorm-apply");
      await p.waitForTimeout(300); await waitAI();
      const d = await deck();
      assert.equal(d.slides.length, n0 + 2);
      assert.deepEqual(d.slides.slice(1, 3).map((s) => s.layout), ["question", "number"]);
      assert.equal(saved().slides.length, n0 + 2);
    });

    await t.test("versões: prévias lado a lado, nada muda até escolher", async () => {
      await p.click('.thumb-card[data-idx="0"]');
      const before = JSON.stringify((await deck()).slides);
      await send("me mostra 2 versões desta capa");
      await p.waitForFunction(() => document.querySelectorAll(".variant .thumb-render .slide").length === 2);
      assert.equal(JSON.stringify((await deck()).slides), before, "deck intacto");
      await p.click('.variant button[data-variant="1"]'); await p.waitForTimeout(900);
      const d = await deck();
      assert.equal(d.slides[0].layout, "number");
      assert.equal(saved().slides[0].layout, "number");
      assert.ok(await p.locator('.variant.chosen').count() === 1);
    });

    await t.test("modelo sem visão: a conversa funciona e o aviso aparece", async () => {
      await send("teste sem visão: o que acha?");
      const txt = await lastAI();
      assert.match(txt, /Respondi sem ver o slide/);
      assert.match(txt, /não enxerga imagens/);
    });

    await t.test("sem erros de JavaScript na página", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    await llm.close();
    deckFile.cleanup();
  }
});
