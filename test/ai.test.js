// IA com um LLM falso (test/mock-llm.js): o que o sagadeck manda para o modelo e como usa a resposta.
// Não testa a "inteligência" do modelo — testa o encanamento: prompt, visão, patch, perguntas, brainstorm.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { editDeck, textToSlide, parseOptions } from "../src/ai/deck-ai.js";

const base = () => ({
  title: "Deck", theme: "bauhaus",
  slides: [
    { layout: "cover", title: "Capa" },
    { layout: "statement", text: "Uma ideia" },
    { layout: "end", title: "Obrigado" },
  ],
});

let llm;
let reply = () => "ok";
before(async () => {
  llm = await startMockLLM((req) => reply(req));
  process.env.SAGADECK_LLM_URL = llm.url;
});
after(() => llm.close());

test("editDeck aplica o patch do modelo só no slide pedido", async () => {
  reply = () => "Mudei o texto do slide 2.\n```yaml\nslides:\n  2:\n    layout: statement\n    text: Uma ideia ==melhor==\n```";
  const r = await editDeck({ spec: base(), instruction: "melhore o slide 2", targetSlide: 1 });
  assert.equal(r.spec.slides[1].text, "Uma ideia ==melhor==");
  assert.equal(r.spec.slides[0].title, "Capa");
  assert.ok(r.actions.some((a) => /Slides alterados: 2/.test(a)), r.actions.join("; "));
});

test("conversa: resposta sem YAML não muda nada e traz as opções clicáveis", async () => {
  reply = () => "Gosto da abertura, mas falta um número forte.\n```opcoes\nSugira um número\nPode fazer isso\n```";
  const spec = base();
  const r = await editDeck({ spec, instruction: "o que você acha da capa?", targetSlide: 0 });
  assert.equal(r.talk, true);
  assert.equal(r.reply, "Gosto da abertura, mas falta um número forte.");
  assert.deepEqual(r.options, ["Sugira um número", "Pode fazer isso"]);
  assert.deepEqual(r.spec, spec);
});

test("o modelo decide o que fazer: regras de conversa, ação e versões estão no prompt", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  const sys = llm.requests[n].system;
  assert.match(sys, /CONVERSA/);
  assert.match(sys, /Na dúvida entre conversar e mexer, CONVERSE/);
  assert.match(sys, /VERSÕES/);
  assert.match(sys, /variants:/);
});

test("rodadas de refinamento: a conversa anterior vai junto", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  const history = Array.from({ length: 12 }, (_, k) => ({ role: k % 2 ? "assistant" : "user", text: `rodada ${k}` }));
  await editDeck({ spec: base(), instruction: "pode fazer", targetSlide: 0, history });
  const texts = llm.requests[n].messages.map((m) => typeof m.content === "string" ? m.content : "");
  assert.ok(texts.includes("rodada 0") && texts.includes("rodada 11"), "as 12 mensagens anteriores foram");
});

test("versões: o modelo devolve alternativas e nada muda até escolher", async () => {
  reply = () => "Duas versões do slide 2.\n```yaml\nvariants:\n  slide: 2\n  options:\n    - label: Número grande\n      slide: { layout: number, value: 42, suffix: \"%\", label: mais rápido }\n    - label: Pergunta\n      slide: { layout: question, question: Quanto você perde por dia?, options: [Pouco, Muito] }\n```";
  const spec = base();
  const r = await editDeck({ spec, instruction: "me mostra 2 versões do slide 2", targetSlide: 1 });
  assert.deepEqual(r.spec, spec, "deck intacto");
  assert.equal(r.variants.index, 1);
  assert.equal(r.variants.insert, false);
  assert.deepEqual(r.variants.options.map((o) => [o.label, o.slide.layout]), [["Número grande", "number"], ["Pergunta", "question"]]);
});

test("versões inválidas são devolvidas ao modelo para corrigir", async () => {
  let calls = 0;
  reply = () => (++calls === 1
    ? "```yaml\nvariants:\n  slide: 2\n  options:\n    - label: Só uma\n      slide: { layout: statement, text: x }\n```"
    : "```yaml\nvariants:\n  after: 3\n  options:\n    - label: A\n      slide: { layout: statement, text: a }\n    - label: B\n      slide: { layout: statement, text: b }\n```");
  const r = await editDeck({ spec: base(), instruction: "versões de um slide novo no fim", targetSlide: 2 });
  assert.equal(calls, 2);
  assert.equal(r.variants.insert, true);
  assert.equal(r.variants.index, 3);
});

test("editDeck manda as imagens do slide (visão) e explica os mecanismos automáticos", async () => {
  reply = () => "Vi o slide.";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "o que você vê?", targetSlide: 1,
    visuals: [{ label: "slide 2 renderizado", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }] });
  const req = llm.requests[n];
  assert.ok(req.hasImages, "a imagem do slide vai junto");
  assert.match(req.system, /Auto-correção/, "a IA sabe o que é automático");
});

test("textToSlide respeita o formato escolhido", async () => {
  reply = () => "Funil.\n```yaml\nlayout: funnel\ntitle: Vendas\nstages:\n  - { title: Visitas, value: 100 }\n  - { title: Clientes, value: 10 }\n```";
  const n = llm.requests.length;
  const r = await textToSlide("Visitas 100, clientes 10", { layout: "funnel" });
  assert.equal(r.slide.layout, "funnel");
  assert.match(llm.requests[n].lastUser, /OBRIGATORIAMENTE o layout funnel/);
});

test("parseOptions separa a resposta das opções clicáveis", () => {
  const r = parseOptions("Boa! Quem é o público?\n\n```opcoes\n- Time técnico\n- Diretoria\n3) Clientes\n```");
  assert.equal(r.text, "Boa! Quem é o público?");
  assert.deepEqual(r.options, ["Time técnico", "Diretoria", "Clientes"]);
  assert.deepEqual(parseOptions("Sem opções.").options, []);
});
