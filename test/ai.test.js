// IA com um LLM falso (test/mock-llm.js): o que o sagadeck manda para o modelo e como usa a resposta.
// Não testa a "inteligência" do modelo — testa o encanamento: prompt, visão, patch, perguntas, brainstorm.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { editDeck, textToSlide, parseOptions, generateDeck } from "../src/ai/deck-ai.js";
import YAML from "yaml";

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

// ---------------------------------------------------------------- geração: direção criativa + revisão de ritmo
const deckYaml = (layouts) => "```yaml\n" + YAML.stringify({ title: "Fraudes", theme: "bauhaus", duration: 10,
  slides: layouts.map((l, k) => (l === "cards" ? { layout: "cards", title: `C${k}`, items: [{ title: "a" }, { title: "b" }], time: 1 }
    : l === "cover" ? { layout: "cover", title: "Fraudes", time: 1 } : l === "end" ? { layout: "end", title: "Fim", time: 1 }
    : l === "number" ? { layout: "number", value: 42, label: "x", tone: "dark", time: 1 } : l === "headline" ? { layout: "headline", text: "Uau", time: 1 }
    : l === "question" ? { layout: "question", question: "E aí?", options: ["a", "b"], time: 1 } : { layout: l, title: `T${k}`, time: 1 })) }) + "```";
const BORING = ["cover", "cards", "cards", "cards", "cards", "cards", "cards", "end"];
const VARIED = ["cover", "headline", "cards", "number", "question", "cards", "headline", "end"];

test("gerar deck: direção criativa no prompt e revisão quando sai repetitivo", async () => {
  const n = llm.requests.length;
  reply = (req) => (/Ficou repetitivo/.test(req.lastUser) ? deckYaml(VARIED) : deckYaml(BORING));
  const r = await generateDeck("fraudes no pix", { direction: "Keynote minimalista: teste." });
  const reqs = llm.requests.slice(n);
  assert.match(reqs[0].lastUser, /Direção criativa deste deck: Keynote minimalista: teste\./);
  assert.match(reqs[0].lastUser, /Nunca 3 slides seguidos com o mesmo layout/);
  const rev = reqs.find((q) => /Ficou repetitivo/.test(q.lastUser));
  assert.ok(rev, "pediu revisão de ritmo");
  assert.match(rev.lastUser, /slides seguidos no mesmo layout/);
  assert.deepEqual(r.spec.slides.map((s) => s.layout), VARIED);
  assert.equal(r.direction, "Keynote minimalista: teste.");
});

test("gerar deck: revisão que não melhora é descartada", async () => {
  reply = () => deckYaml(BORING); // a revisão devolve igual
  const r = await generateDeck("fraudes", { direction: "x" });
  assert.deepEqual(r.spec.slides.map((s) => s.layout), BORING);
  assert.equal(r.variety.ok, false);
});

test("gerar deck: deck já variado não gasta revisão", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { direction: "x" });
  assert.equal(llm.requests.slice(n).filter((q) => /Ficou repetitivo/.test(q.lastUser)).length, 0);
});

test("o sagadeck se identifica para o modelrelay (modelos por app)", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  assert.equal(llm.requests[n].headers["x-modelrelay-app"], "sagadeck");
});

test("modelo sem visão (ex.: DeepSeek V4 Flash): refaz sem imagens, avisa e não insiste", async () => {
  const NO_VISION = { status: 404, error: "HTTP 404: No endpoints found that support image input" };
  reply = (req) => (req.hasImages ? NO_VISION : "Vi pelo YAML: o título está ok.");
  const visuals = [{ label: "slide 2 renderizado", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }];
  const n = llm.requests.length;
  const r = await editDeck({ spec: base(), instruction: "o que você acha?", targetSlide: 1, visuals });
  assert.match(r.reply, /título está ok/);
  assert.ok(r.actions.some((a) => /não enxerga imagens/.test(a)), r.actions.join("; "));
  assert.deepEqual(llm.requests.slice(n).map((q) => q.hasImages), [true, false], "tentou com imagem, refez sem");
  // da próxima vez, nem tenta mandar imagem para esse modelo
  const m = llm.requests.length;
  const r2 = await editDeck({ spec: base(), instruction: "e agora?", targetSlide: 1, visuals });
  assert.deepEqual(llm.requests.slice(m).map((q) => q.hasImages), [false]);
  assert.ok(r2.actions.some((a) => /não enxerga imagens/.test(a)));
});

test("editar um slide não gera nem apaga imagens pendentes de outros slides", async () => {
  const spec = { ...base(), slides: [...base().slides, { layout: "full", image_prompt: "sala de controle à noite", title: "Pendente" }] };
  const imageReqs = () => llm.requests.filter((q) => /^Generate an image/.test(q.lastUser)).length;
  reply = () => ["Mudei o slide 2.", "```yaml", "slides:", "  2:", "    layout: statement", "    text: Outra ideia", "```"].join("\n");
  const n = imageReqs();
  const r = await editDeck({ spec, instruction: "muda o slide 2", targetSlide: 1, images: true });
  assert.equal(r.spec.slides[1].text, "Outra ideia");
  assert.equal(r.spec.slides[3].image_prompt, "sala de controle à noite", "o pedido de imagem do slide 4 continua lá");
  assert.equal(imageReqs(), n, "nenhuma imagem gerada para slide que ninguém mexeu");
});

test("imagem pedida num slide alterado: gera; se falhar, fica o placeholder e um aviso", async () => {
  reply = (req) => (/^Generate an image/.test(req.lastUser) ? "não consigo gerar agora"
    : ["Coloquei uma foto.", "```yaml", "slides:", "  2:", "    layout: full", "    image_prompt: foto de um cofre", "    title: Cofre", "```"].join("\n"));
  const n = llm.requests.length;
  const r = await editDeck({ spec: base(), instruction: "coloca uma foto de um cofre no slide 2", targetSlide: 1, images: true });
  assert.ok(llm.requests.slice(n).some((q) => /^Generate an image: foto de um cofre/.test(q.lastUser)), "tentou gerar");
  assert.equal(r.spec.slides[1].image_prompt, "foto de um cofre", "falhou: o pedido fica como placeholder");
  assert.ok(r.actions.some((a) => /Falhou ao gerar imagem/.test(a)), r.actions.join("; "));
});
