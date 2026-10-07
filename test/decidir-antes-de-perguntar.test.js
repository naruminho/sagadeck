// Decidir antes de perguntar + pensamento crítico na ilustração: o encanamento (não a inteligência do modelo).
// - decidePurpose extrai do pedido primeiro e só pergunta o que faltar (uso; idioma em ocasião internacional);
// - generateDeck transforma idioma extraído/respondido em instrução de geração;
// - ilustração genérica é erro em qualquer slide (regra de geração + critério de revisão).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { decidePurpose, generateDeck } from "../src/ai/deck-ai.js";

let llm;
let reply = () => "ok";
before(async () => {
  llm = await startMockLLM((req) => reply(req));
  process.env.SAGADECK_LLM_URL = llm.url;
});
after(() => llm.close());

const DECK_YAML = "Aqui está.\n```yaml\nslides:\n  - layout: cover\n    title: Flood Study\n  - layout: end\n    title: Thanks\n```";

test("decidePurpose: pedido que já diz o uso não gera pergunta", async () => {
  reply = () => JSON.stringify({ purpose: "palestra", texto: null, idioma: null, extraido: "congresso ICFM10, apresentar", why: "evento", pergunta: null, opcoes: [], perguntaIdioma: null });
  const at = llm.requests.length;
  const d = await decidePurpose("Apresentação do paper no congresso ICFM10 sobre enchentes no Aricanduva");
  assert.deepEqual(d, { purpose: "palestra", texto: null, why: "evento" });
  const sys = llm.requests.slice(at).map((r) => r.system).join("\n");
  assert.match(sys, /EXTRAIA do pedido/);
  assert.match(sys, /Nunca pergunte o que já foi extraído/);
});

test("decidePurpose: ocasião internacional sem idioma propõe confirmar o idioma", async () => {
  reply = () => JSON.stringify({ purpose: "palestra", texto: null, idioma: null, extraido: "ICFM10 international", why: "congresso", pergunta: null, opcoes: [], perguntaIdioma: "O evento é internacional: gero em português ou English?" });
  const d = await decidePurpose("Apresentação do paper no congresso internacional ICFM10");
  assert.equal(d.purpose, "palestra");
  assert.deepEqual(d.languageQuestion, { question: "O evento é internacional: gero em português ou English?", options: ["Português", "English"] });
});

test("decidePurpose: uso ambíguo ainda pergunta (só o que falta)", async () => {
  reply = () => JSON.stringify({ purpose: null, texto: null, idioma: null, extraido: "nada sobre uso", why: "", pergunta: "É para apresentar ou para estudar depois?", opcoes: ["Apresentar", "Estudar depois"], perguntaIdioma: null });
  const d = await decidePurpose("Uma apresentação sobre enchentes urbanas");
  assert.deepEqual(d, { question: { question: "É para apresentar ou para estudar depois?", options: ["Apresentar", "Estudar depois"] } });
});

test("generateDeck: confirmação de idioma vira pergunta; resposta vira instrução em inglês", async () => {
  // 1ª chamada (sem resposta): o decididor propõe confirmar o idioma → generateDeck devolve a pergunta
  reply = (req) => /perguntaIdioma/.test(req.system)
    ? JSON.stringify({ purpose: "palestra", texto: null, idioma: null, extraido: "ICFM10", why: "congresso", pergunta: null, opcoes: [], perguntaIdioma: "Gero em português ou English?" })
    : DECK_YAML;
  const q = await generateDeck("Apresentação do paper no ICFM10", { ask: true, research: false, images: false });
  assert.deepEqual(q, { question: { question: "Gero em português ou English?", options: ["Português", "English"] } });
  // 2ª chamada (com a resposta): a instrução de geração manda inglês
  const at = llm.requests.length;
  reply = () => DECK_YAML;
  const g = await generateDeck("Apresentação do paper no ICFM10", { ask: true, answer: "English", research: false, images: false });
  assert.ok(g.spec.slides.length >= 2);
  const genReq = llm.requests.slice(at).find((r) => /Crie a apresentação inteira/.test(r.lastUser));
  assert.match(genReq.lastUser, /Escreva todo o conteúdo em inglês\./);
});

test("generateDeck: idioma explícito no pedido vira instrução sem perguntar", async () => {
  const at = llm.requests.length;
  reply = (req) => /perguntaIdioma/.test(req.system)
    ? JSON.stringify({ purpose: "palestra", texto: null, idioma: "en", extraido: "in English", why: "pedido", pergunta: null, opcoes: [], perguntaIdioma: null })
    : DECK_YAML;
  const g = await generateDeck("Presentation of the paper, in English", { ask: true, research: false, images: false });
  assert.ok(g.spec.slides.length >= 2);
  assert.ok(!g.question, "com idioma explícito não há pergunta");
  const genReq = llm.requests.slice(at).find((r) => /Crie a apresentação inteira/.test(r.lastUser));
  assert.match(genReq.lastUser, /Escreva todo o conteúdo em inglês\./);
});

test("acadêmico: tudo que é figura leva número, inclusive diagrama criado pela IA", async () => {
  const at = llm.requests.length;
  reply = () => DECK_YAML;
  await generateDeck("Apresentação do paper no ICFM10", { ask: false, research: false, images: true });
  const genReq = llm.requests.slice(at).find((r) => /Crie a apresentação inteira/.test(r.lastUser));
  assert.match(genReq.system, /NUMERAÇÃO ACADÊMICA/);
  assert.match(genReq.system, /seu diagrama é Figure 6/);
  assert.match(genReq.system, /Fora do acadêmico, sem numeração forçada/);
});

test("ilustração: regra crítica na geração e critério na revisão (vale pro deck todo)", async () => {  const at = llm.requests.length;
  reply = () => DECK_YAML;
  await generateDeck("Estudo da bacia do Aricanduva", { ask: false, research: false, images: true });
  const genReq = llm.requests.slice(at).find((r) => /Crie a apresentação inteira/.test(r.lastUser));
  assert.match(genReq.system, /PENSAMENTO CRÍTICO NA ILUSTRAÇÃO/);
  assert.match(genReq.system, /Genérico bonito é ERRO/);
  const { ART_DIRECTION } = await import("../src/ai/art-direction.js");
  assert.match(ART_DIRECTION || "", /./); // só garante o módulo íntegro
  const qualitySrc = (await import("node:fs")).readFileSync(new URL("../src/ai/quality.js", import.meta.url), "utf8");
  assert.match(qualitySrc, /Ilustração genérica que não retrata o conteúdo específico.*é defeito de pertinência em qualquer slide/);
});
