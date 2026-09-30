// Chat do Studio: a conversa é de cada apresentação e não se perde (fica ao lado do deck, volta ao reabrir, e o
// que a pessoa disse lá no começo continua chegando ao modelo); e o que a pessoa mexe enquanto a IA pensa não some.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { startMockLLM } from "./mock-llm.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("chat: conversa por deck que sobrevive a recarregar, memória longa e nada se perde durante a resposta", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  let reply = () => "ok";
  const llm = await startMockLLM((req) => reply(req));
  const deckFile = tempDeck();
  // uma conversa longa já guardada: a primeira mensagem tem um pedido que não pode ser esquecido
  // conversa antiga (ao lado do deck): ao abrir, passa para dentro do projeto (.sagadeck/conversa.json)
  const legacy = deckFile.file.replace(/\.ya?ml$/i, ".conversa.json");
  const convFile = path.join(deckFile.dir, ".sagadeck", "conversa.json");
  const antiga = [{ role: "user", text: "Regra: o público é a DIRETORIA-DO-BANCO." }];
  for (let i = 0; i < 30; i++) antiga.push({ role: i % 2 ? "user" : "assistant", text: `troca antiga ${i}` });
  fs.writeFileSync(legacy, JSON.stringify({ history: antiga }));
  const studio = await startStudio(deckFile.file, { llmUrl: llm.url });
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const conv = () => JSON.parse(fs.readFileSync(convFile, "utf8")).history;
    const chatText = () => p.evaluate(() => document.getElementById("chat-messages").textContent);
    const waitAI = () => p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 20000 });
    const send = async (text) => { await p.fill("#chat-input", text); await p.click("#chat-send"); await p.waitForTimeout(300); await waitAI(); };
    await p.waitForSelector('.thumb-card[data-idx="1"]');
    await p.click("#tab-btn-chat");

    await t.test("ao abrir, a conversa guardada do deck volta para a tela", async () => {
      await p.waitForFunction(() => /troca antiga 29/.test(document.getElementById("chat-messages").textContent), null, { timeout: 8000 });
      assert.ok(await p.locator("#chat-messages .user-msg").count() >= 15);
      assert.ok(fs.existsSync(convFile) && !fs.existsSync(legacy), "a conversa mudou para .sagadeck/ (nada solto ao lado do deck)");
    });

    await t.test("o que a pessoa disse lá no começo chega ao modelo; a conversa nova é gravada ao lado do deck", async () => {
      const n = llm.requests.length;
      reply = () => "Anotado.";
      await send("e o tom?");
      assert.match(JSON.stringify(llm.requests[n]), /DIRETORIA-DO-BANCO/);
      const h = conv();
      assert.equal(h.at(-2).text, "e o tom?");
      assert.ok(h.at(-1).text.startsWith("Anotado."));
    });

    await t.test("recarregar a página não apaga a conversa", async () => {
      await p.reload();
      await p.waitForSelector('.thumb-card[data-idx="1"]');
      await p.waitForFunction(() => /e o tom\?/.test(document.getElementById("chat-messages").textContent), null, { timeout: 8000 });
      assert.match(await chatText(), /Anotado\./);
      await p.click("#tab-btn-chat");
    });

    await t.test("editar o deck enquanto a IA pensa: a edição da pessoa e a da IA ficam as duas", async () => {
      reply = async () => { await new Promise((r) => setTimeout(r, 1500)); return "Mudei a capa.\n```yaml\nedit:\n  1:\n    title: Capa da IA\n```"; };
      await p.fill("#chat-input", "mude o título da capa");
      await p.click("#chat-send");
      await p.waitForTimeout(300);
      await p.fill("#deck-title-input", "Título que eu mudei agora");
      await p.press("#deck-title-input", "Tab");
      await waitAI();
      await p.waitForTimeout(1200);
      const s = saved();
      assert.equal(s.slides[0].title, "Capa da IA");
      assert.equal(s.title, "Título que eu mudei agora");
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    await llm.close();
    deckFile.cleanup();
  }
});
