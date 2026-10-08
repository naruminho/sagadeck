// Leitura crítica no Studio (botão do chat) e a origem do conteúdo nas miniaturas, de ponta a ponta com o LLM falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";
import { startMockLLM } from "./mock-llm.js";

const PAPER = "Abstract: the study combines land use, slope, population density and social vulnerability indicators. " +
  "2.3 Susceptibility. The explanatory variables were derived from LiDAR: HAND, elevation, slope. " +
  "Table 1: PEPF below 2% for HEC-HMS in the four events, against 9 to 12.5% for HYMOD. ".repeat(3);

test("Studio: botão de leitura crítica lê o material, mostra os achados com o trecho, guarda e leva para o chat; miniatura mostra o que é do sagadeck", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deck.file, "utf8"));
  spec.context = { ...(spec.context || {}), autoria: "autor" };
  spec.slides[1] = { ...spec.slides[1], provenance: "proprio", provenanceNote: "analogia do sagadeck" };
  fs.writeFileSync(deck.file, YAML.stringify(spec));
  const store = path.join(deck.dir, "contexto", "documentos", "abc123");
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(store, "material.saga.json"), JSON.stringify({ name: "paper.pdf", text: PAPER, visualVersion: 6, inventory: { items: [], warnings: [], pages: [] } }));
  const chatAsks = [];
  const llm = await startMockLLM((req) => {
    if (/LEITURA CRÍTICA de um material/.test(req.system)) return JSON.stringify({ itens: [
      { tipo: "inconsistencia", titulo: "Resumo promete variáveis socioeconômicas", texto: "O resumo cita densidade populacional; a seção 2.3 só usa o LiDAR.", trecho: "population density and social vulnerability indicators", onde: "Resumo × 2.3" },
      { tipo: "pergunta", titulo: "Inventada", texto: "x", trecho: "a frase que não existe no artigo de jeito nenhum", onde: "?" },
    ] });
    if (/Decida se o que você JÁ SABE basta/.test(req.lastUser)) return '{"pesquisar": false, "motivo": "deck", "academico": false, "buscas": []}';
    chatAsks.push(req);
    return "Vi a leitura crítica junto do pedido.";
  });
  const studio = await startStudio(deck.file, { llmUrl: llm.url });
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    // miniatura: o slide marcado como inclusão do sagadeck leva o selo; os do material, não
    const prov = await p.$$eval(".thumb-prov", (els) => els.map((e) => [e.className, e.title]));
    assert.equal(prov.length, 1);
    assert.match(prov[0][0], /prov-proprio/);
    assert.match(prov[0][1], /analogia do sagadeck/);
    await p.click("#tab-btn-chat");
    await p.click("#chat-critique");
    await p.waitForFunction(() => [...document.querySelectorAll("#chat-messages .ai-msg")].some((m) => /Resumo promete/.test(m.innerText)), null, { timeout: 15000 });
    const text = await p.evaluate(() => [...document.querySelectorAll("#chat-messages .ai-msg")].pop().innerText);
    assert.match(text, /Leitura crítica — nada mudou nos slides/);
    assert.match(text, /population density and social vulnerability indicators/, "o trecho do material aparece");
    assert.doesNotMatch(text, /Inventada/, "o achado sem trecho no material não aparece");
    assert.match(text, /descartada/);
    assert.match(text, /notes/, "autor: crítica vai para as notes, não para os slides");
    const saved = JSON.parse(fs.readFileSync(path.join(deck.dir, ".sagadeck", "leitura-critica.json"), "utf8"));
    assert.equal(saved.itens.length, 1);
    // o próximo pedido ao chat leva a leitura crítica, rotulada como do sagadeck
    await p.fill("#chat-input", "o que a banca vai perguntar?");
    await p.click("#chat-send");
    await p.waitForFunction(() => /Vi a leitura crítica/.test([...document.querySelectorAll("#chat-messages .ai-msg")].pop()?.innerText || ""), null, { timeout: 15000 });
    assert.match(chatAsks.at(-1).lastUser, /LEITURA CRÍTICA DO MATERIAL — feita pelo sagadeck/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await llm.close(); deck.cleanup(); }
});
