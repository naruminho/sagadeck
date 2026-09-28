// IA com um LLM falso (test/mock-llm.js): o que o sagadeck manda para o modelo e como usa a resposta.
// Não testa a "inteligência" do modelo — testa o encanamento: prompt, visão, patch, perguntas, brainstorm.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { editDeck, textToSlide, parseOptions, generateDeck, applyPatch, sanitizeCheck, conversationFor, slidesForMinutes, styleFor } from "../src/ai/deck-ai.js";
import { COLLECTION_STYLE } from "../src/studio/template-collections.js";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.js";
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
  // escrita segura: edit (só os campos) é o preferido; slides só para trocar o slide inteiro
  assert.match(sys, /edit:\s+# PREFIRA ESTE/);
  assert.match(sys, /não reescreva o\s+slide inteiro/);
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

test("slidesForMinutes: ~1 slide a cada 1,5 min, entre 3 e 40", () => {
  assert.equal(slidesForMinutes(15), 10);
  assert.equal(slidesForMinutes(30), 20);
  assert.equal(slidesForMinutes(4), 3);
  assert.equal(slidesForMinutes(120), 40);
  assert.equal(slidesForMinutes(0), undefined);
  assert.equal(slidesForMinutes("x"), undefined);
});

test("styleFor: coleção vira tema+direção; desconhecido é null", () => {
  assert.deepEqual(styleFor("revista"), COLLECTION_STYLE.revista);
  assert.equal(styleFor("revista").theme, "editorial");
  assert.equal(styleFor("x"), null);
});

test("gerar deck: duration vira slides e style vira tema+direção no prompt", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { duration: 30, style: "revista" });
  const req = llm.requests[n].lastUser;
  assert.match(req, /Cerca de 20 slides/);
  assert.match(req, /Duração planejada: 30 minutos/);
  assert.match(req, /Use o tema "editorial"/);
  assert.match(req, /Revista editorial/);
});

test("gerar deck: slides explícitos e tema explícito vencem duration e style", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { duration: 30, style: "revista", slides: 5, theme: "noite" });
  const req = llm.requests[n].lastUser;
  assert.match(req, /Cerca de 5 slides/);
  assert.match(req, /Use o tema "noite"/);
  assert.match(req, /Revista editorial/);
});

test("editDeck com materiais: bloco rotulado no pedido", async () => {
  reply = () => "Entendi, não mudei nada.";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "use os números", targetSlide: 0,
    materials: [{ name: "relatorio.pdf", text: "Fraudes: 40% em 2025", detail: "pdf (1 página)" }] });
  const req = llm.requests[n].lastUser;
  assert.match(req, /MATERIAL ANEXADO/);
  assert.match(req, /relatorio\.pdf/);
  assert.match(req, /Fraudes: 40% em 2025/);
  assert.match(req, /Pedido: use os números/);
});

test("generateDeck com materiais: bloco antes do briefing", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { direction: "x", materials: [{ name: "dados.csv", text: "ano,valor\n2024,3\n2025,5", detail: "texto" }] });
  const req = llm.requests[n].lastUser;
  assert.match(req, /MATERIAL ANEXADO/);
  assert.match(req, /dados\.csv/);
  assert.match(req, /2025,5/);
});

test("o sagadeck se identifica para o modelrelay (modelos por app)", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  assert.equal(llm.requests[n].headers["x-modelrelay-app"], "sagadeck");
});

test("prompt do sistema: slide denso usa takeaway e aviso", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  assert.match(llm.requests[n].system, /elemento `aviso`/);
  assert.match(llm.requests[n].system, /takeaway/);
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

test("gerar deck: imagens liberadas por padrão; o briefing decide (todos, você decide onde, nenhum)", async () => {
  const deck = { title: "Fraudes", theme: "bauhaus", duration: 10, slides: [
    { layout: "cover", title: "Fraudes", figure: { image_prompt: "a bank vault at night" }, time: 1 },
    { layout: "headline", text: "Uau", time: 1 },
    { layout: "number", value: 42, label: "x", tone: "dark", time: 1 },
    { layout: "full", image_prompt: "a crowded subway station", title: "Todo dia", time: 1 },
    { layout: "question", question: "E aí?", options: ["a", "b"], time: 1 },
    { layout: "end", title: "Fim", time: 1 },
  ] };
  reply = (req) => (/^Generate an image/.test(req.lastUser) ? "sem imagem (mock)" : "```yaml\n" + YAML.stringify(deck) + "```");
  const n = llm.requests.length;
  await generateDeck("fraudes no pix. Ilustre onde fizer sentido.", { direction: "x" });
  const reqs = llm.requests.slice(n);
  assert.match(reqs[0].system, /Você PODE pedir ilustrações/, "imagens liberadas sem precisar de caixa marcada");
  assert.match(reqs[0].system, /pediu para VOCÊ decidir/);
  assert.match(reqs[0].system, /não falou de imagem → não gere/);
  const asked = reqs.filter((q) => /^Generate an image/.test(q.lastUser)).map((q) => q.lastUser.replace("Generate an image: ", ""));
  assert.deepEqual(asked.sort(), ["a bank vault at night", "a crowded subway station"], "só os slides que a IA escolheu ilustrar");
});

// Perguntas assistidas: o modelo decide QUANDO perguntar (não é um formulário fixo); o prompt diz o que importa
// saber (plateia, presencial/online, executivo/informal…) e que a resposta fica no deck (context:) para as próximas.
test("contexto da apresentação: regras de quando perguntar no prompt, e o que já se sabe vai junto", async () => {
  reply = () => "Para quantas pessoas vai ser?\n```opcoes\nAté 10\nDe 10 a 50\nMais de 50\n```";
  const n = llm.requests.length;
  const spec = { ...base(), context: { formato: "online", tom: "executivo" } };
  const r = await editDeck({ spec, instruction: "refaça a apresentação para a diretoria", targetSlide: 0 });
  const req = llm.requests[n], sys = req.system, all = JSON.stringify(req.messages || req);
  assert.match(sys, /CONTEXTO/);
  assert.match(sys, /online|gravad/i);
  assert.match(sys, /executivo/i);
  assert.match(sys, /context:/, "o modelo sabe onde guardar o que a pessoa respondeu");
  assert.match(all, /formato: online/, "o contexto já conhecido vai para o modelo");
  assert.equal(r.talk, true);
  assert.deepEqual(r.options, ["Até 10", "De 10 a 50", "Mais de 50"]);
});

test("o que a pessoa responde vira context: no deck", async () => {
  reply = () => "Anotei: presencial, para umas 30 pessoas.\n```yaml\ndeck:\n  context: { formato: presencial, pessoas: 30 }\n```";
  const r = await editDeck({ spec: base(), instruction: "presencial, umas 30 pessoas", targetSlide: 0 });
  assert.deepEqual(r.spec.context, { formato: "presencial", pessoas: 30 });
});

// ---------------------------------------------------------------------------------------------
// Escrita segura: a IA muda só o que precisa, sem reescrever (e estragar) o resto, e sem deixar lixo no deck.
// ---------------------------------------------------------------------------------------------

const rico = () => ({
  title: "Deck", theme: "bauhaus",
  slides: [
    { layout: "cover", title: "Capa", notes: "roteiro da capa", time: 2 },
    { layout: "cards", title: "Três pilares", kicker: "Pilares", notes: "falar devagar", time: 3, visualEdits: { "t-0": { dx: 10 } },
      items: [{ icon: "shield", title: "Seguro", text: "Criptografia" }, { icon: "zap", title: "Rápido", text: "Latência baixa" }] },
    { layout: "end", title: "Obrigado" },
  ],
});

test("edit: muda só os campos pedidos (merge patch); null remove; o resto do slide fica idêntico", () => {
  const base = rico();
  const { spec, changed } = applyPatch(base, { edit: { 2: { title: "Dois pilares", kicker: null } } });
  const s = spec.slides[1];
  assert.equal(s.title, "Dois pilares");
  assert.equal("kicker" in s, false);
  assert.deepEqual({ ...s, title: base.slides[1].title, kicker: base.slides[1].kicker }, base.slides[1], "nada mais mudou");
  assert.deepEqual(changed, [1]);
  assert.deepEqual(spec.slides[0], base.slides[0]);
  // objetos entram mesclando (arrays são trocados inteiros)
  const r = applyPatch(base, { edit: { 2: { visualEdits: { "t-1": { dy: 5 } } } } });
  assert.deepEqual(r.spec.slides[1].visualEdits, { "t-0": { dx: 10 }, "t-1": { dy: 5 } });
  assert.throws(() => applyPatch(base, { edit: { 9: { title: "x" } } }), /slide 9 não existe/);
  assert.throws(() => applyPatch(base, { edit: { 2: { title: "x" } }, slides: { 2: { layout: "statement", text: "y" } } }), /edit e slides/);
});

test("slides: (troca inteira) não perde notas, tempo e ajustes que a IA esqueceu de copiar", () => {
  const base = rico();
  const { spec } = applyPatch(base, { slides: { 2: { layout: "list", title: "Pilares", items: ["Seguro", "Rápido"] } } });
  const s = spec.slides[1];
  assert.equal(s.layout, "list");
  assert.equal(s.notes, "falar devagar");
  assert.equal(s.time, 3);
  // se a IA quis tirar as notas, ela diz (edit com null)
  const r = applyPatch(base, { edit: { 2: { notes: null } } });
  assert.equal("notes" in r.spec.slides[1], false);
});

test("trava contra lixo: cerca de código, pedaço do patch ou campo inventado dentro do slide voltam para a IA corrigir", () => {
  const ok = (s) => sanitizeCheck({ slides: [s] }, [0]);
  ok({ layout: "cover", title: "Capa normal", notes: "Use `code` e **negrito** à vontade" });
  assert.throws(() => ok({ layout: "cover", title: "```yaml\nslides:" }), /cerca|bloco/);
  assert.throws(() => ok({ layout: "cover", title: "Capa", subtitle: "Pronto!\nslides:\n  2:\n    layout: cover" }), /patch|resposta/);
  assert.throws(() => ok({ layout: "cover", titel: "Capa" }), /titel.*não existe/);
  assert.throws(() => ok({ layout: "cover", title: "Capa", slides: {} }), /slides.*não existe|patch/);
  // os decks que vêm com o sagadeck passam na trava (sem falso positivo)
  for (const f of ["exemplo.yaml", "exemplo-keynote.yaml", "exemplo-alegre.yaml", "ensaio-api.yaml", "cenario/Texto no cenário.yaml", "cenario-e-ciencia.yaml"]) {
    const spec = YAML.parse(fs.readFileSync(path.join(ROOT, "templates", f), "utf8"));
    sanitizeCheck(spec, spec.slides.map((_, i) => i));
  }
  const fx = YAML.parse(fs.readFileSync(path.join(ROOT, "test", "fixtures", "deck.yaml"), "utf8"));
  sanitizeCheck(fx, fx.slides.map((_, i) => i));
});

test("resposta com lixo no slide: o modelo recebe o erro e corrige; o deck só muda com a versão limpa", async () => {
  let n = 0;
  reply = () => (++n === 1
    ? "Mudei.\n```yaml\nedit:\n  2:\n    text: \"Uma ideia\n```yaml\nslides:\"\n```"
    : "Mudei.\n```yaml\nedit:\n  2:\n    text: Uma ideia limpa\n```");
  const r = await editDeck({ spec: base(), instruction: "melhore o slide 2", targetSlide: 1 });
  assert.equal(r.spec.slides[1].text, "Uma ideia limpa");
  assert.equal(n, 2);
});

test("memória do chat: o que a pessoa disse lá no começo continua chegando ao modelo depois de muitas trocas", async () => {
  const history = [{ role: "user", text: "Importante: o público é a DIRETORIA-DO-BANCO, nada de gírias." }];
  for (let i = 0; i < 40; i++) history.push({ role: i % 2 ? "user" : "assistant", text: `mensagem ${i} `.repeat(30) });
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "e agora?", targetSlide: 0, history });
  assert.match(JSON.stringify(llm.requests[n]), /DIRETORIA-DO-BANCO/);
  // e o tamanho fica sob controle (mensagens antigas da IA saem; as da pessoa ficam, compactadas)
  const conv = conversationFor(history);
  assert.ok(conv.memory.includes("DIRETORIA-DO-BANCO"));
  assert.ok(conv.recent.length <= 16);
  assert.ok(conv.memory.length < 12000);
});

// Diagramas: o Mermaid só se confere desenhando (navegador). O código que não desenha volta para a IA corrigir;
// desenho que encolheu demais volta uma vez, como objeção (o fato vai junto do pedido, sem a resposta rejeitada).
test("diagrama com código errado: o erro do desenho volta para o modelo e só a versão que desenha entra", { timeout: 60000 }, async (t) => {
  const { findBrowser } = await import("../src/export/browser.js");
  try { findBrowser(); } catch { t.skip("sem Chrome/Edge — defina SAGADECK_BROWSER"); return; }
  const { diagramCheck, closeSnapshots } = await import("../src/studio/snapshot.js");
  let n = 0;
  reply = () => (++n === 1
    ? "Fiz o fluxo.\n```yaml\nslides:\n  2:\n    layout: diagram\n    title: Fluxo\n    mermaid: |\n      flowchart LR\n        A[Pedido --> \n```"
    : "Fiz o fluxo.\n```yaml\nslides:\n  2:\n    layout: diagram\n    title: Fluxo\n    mermaid: |\n      flowchart LR\n        A[Pedido] --> B[Entrega]\n```");
  const k = llm.requests.length;
  try {
    const r = await editDeck({ spec: base(), instruction: "transforme o slide 2 num fluxo", targetSlide: 1, drawCheck: diagramCheck });
    assert.equal(n, 2);
    assert.match(llm.requests[k + 1].lastUser, /Mermaid não conseguiu desenhar[\s\S]*slide 2/);
    assert.match(r.spec.slides[1].mermaid, /B\[Entrega\]/);
  } finally { await closeSnapshots(); }
});

test("diagrama que encolheu demais: o modelo recebe o fato (uma vez) e a resposta nova vale", async () => {
  let n = 0;
  const drawCheck = async (spec, idx) => ({ errors: [], warnings: idx.filter((i) => /LR/.test(spec.slides[i].mermaid)).map((i) => ({ slide: i + 1, warning: "o diagrama precisou encolher para 40% para caber" })) });
  reply = () => (++n === 1
    ? "Pronto.\n```yaml\nedit:\n  2:\n    layout: diagram\n    mermaid: \"flowchart LR\\n  A --> B\"\n```"
    : n === 2 ? "Reorganizei.\n```yaml\nedit:\n  2:\n    layout: diagram\n    mermaid: \"flowchart TB\\n  A --> B\"\n```"
    : "não devia chegar aqui");
  const k = llm.requests.length;
  const r = await editDeck({ spec: base(), instruction: "vire um fluxo", targetSlide: 1, drawCheck });
  assert.equal(n, 2);
  assert.match(llm.requests[k + 1].lastUser, /FATO DO DESENHO[\s\S]*40%/);
  assert.ok(!llm.requests[k + 1].messages.some((m) => m.role === "assistant" && /Pronto\./.test(m.content)), "a resposta rejeitada não fica na conversa");
  assert.match(r.spec.slides[1].mermaid, /TB/);
  // insistiu no mesmo desenho: a 2ª resposta vale (a objeção é uma vez só)
  n = 0;
  reply = () => (++n, "Mantive.\n```yaml\nedit:\n  2:\n    layout: diagram\n    mermaid: \"flowchart LR\\n  A --> B\"\n```");
  const r2 = await editDeck({ spec: base(), instruction: "vire um fluxo", targetSlide: 1, drawCheck });
  assert.equal(n, 2);
  assert.match(r2.spec.slides[1].mermaid, /LR/);
});

test("o prompt não se contradiz: diagram e infographic são layouts (e os diagramas simples continuam como elementos)", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  const sys = llm.requests[n].system;
  assert.doesNotMatch(sys, /Diagramas e gráficos são ELEMENTOS[^.\n]*não layouts/, "dizia que diagrama não é layout, mas o layout diagram existe");
  assert.match(sys, /layout `?diagram`?/);
  assert.match(sys, /layout `?infographic`?/);
});

// Comandos da IA (Studio local): ela pede run:, quem chama mostra à pessoa e só roda com aprovação; o resultado (ou a
// recusa) volta ao modelo, que segue até devolver o patch. Aqui o "Studio" é um stub; o executor real é testado abaixo.
const RUN = (code, why = "testar") => "Vou testar primeiro.\n```yaml\nrun:\n  language: javascript\n  why: " + why + "\n  code: |\n    " + code + "\n```";
test("comando aprovado: o resultado real volta ao modelo e o patch vem depois", async () => {
  const pedidos = [];
  reply = ({ lastUser }) => (/Resultado do comando 1/.test(lastUser) ? "Funcionou.\n```yaml\nedit:\n  2:\n    text: Resposta 42\n```" : RUN("console.log(6 * 7)", "conferir a conta"));
  const n = llm.requests.length;
  const r = await editDeck({ spec: base(), instruction: "teste a conta e ponha no slide 2", targetSlide: 1,
    runCommand: async (c) => { pedidos.push(c); return { exitCode: 0, stdout: "42\n", stderr: "", timedOut: false }; } });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].language, "javascript");
  assert.equal(pedidos[0].why, "conferir a conta");
  assert.match(llm.requests[n].system, /COMANDOS \(Studio local\)/);
  assert.match(llm.requests[n + 1].lastUser, /Resultado do comando 1[\s\S]*42/);
  assert.equal(r.spec.slides[1].text, "Resposta 42");
  assert.ok(r.actions.some((a) => /Comando 1 \(javascript\): conferir a conta \(ok\)/.test(a)), r.actions.join("; "));
});

test("comando recusado: nada roda, o modelo sabe que a pessoa não autorizou e segue sem ele", async () => {
  reply = ({ lastUser }) => (/NÃO autorizou/.test(lastUser) ? "Sem problema: não testei, montei com o que a documentação diz." : RUN("console.log(1)"));
  const r = await editDeck({ spec: base(), instruction: "teste", targetSlide: 1, runCommand: async () => ({ denied: true }) });
  assert.equal(r.talk, true);
  assert.match(r.reply, /não testei/);
  assert.ok(r.actions.some((a) => /Comando 1 não autorizado/.test(a)));
});

test("sem Studio local (runCommand ausente): o prompt diz que não há comandos", async () => {
  reply = () => "ok";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "oi", targetSlide: 0 });
  assert.match(llm.requests[n].system, /Comandos: indisponíveis aqui/);
  assert.doesNotMatch(llm.requests[n].system, /COMANDOS \(Studio local\)/);
});

test("limite de comandos por pedido: passou dele, o modelo é avisado para responder sem comandos", async () => {
  let rodou = 0;
  reply = ({ lastUser }) => (/Limite de \d+ comandos/.test(lastUser) ? "Parei de testar: o endpoint não responde." : RUN("console.log(1)"));
  const r = await editDeck({ spec: base(), instruction: "teste", targetSlide: 1, runCommand: async () => { rodou++; return { exitCode: 0, stdout: "1" }; } });
  const { MAX_COMMANDS } = await import("../src/ai/commands.js");
  assert.equal(rodou, MAX_COMMANDS);
  assert.match(r.reply, /Parei de testar/);
});

test("executor: variáveis e segredos do ambiente chegam ao comando; a saída volta mascarada; tempo esgotado e comando inválido", async () => {
  const { runCommand, commandRequest } = await import("../src/ai/commands.js");
  const cwd = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "saga-cmd-"));
  try {
    const r = await runCommand({ language: "javascript", code: "console.log(process.env.SAGA_VAR_BASE_URL, process.env.SAGA_SECRET_CHAVE)" },
      { cwd, env: { SAGA_VAR_BASE_URL: "http://x", SAGA_SECRET_CHAVE: "segredo-muito-secreto" }, mask: (s) => s.split("segredo-muito-secreto").join("se***to") });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.match(r.stdout, /http:\/\/x se\*\*\*to/);
    assert.doesNotMatch(r.stdout, /segredo-muito-secreto/);
    const lento = await runCommand({ language: "javascript", code: "setInterval(() => {}, 1000)" }, { cwd, timeoutMs: 150 });
    assert.equal(lento.timedOut, true);
    const erro = await runCommand({ language: "js", code: "throw new Error('falhou')" }, { cwd });
    assert.notEqual(erro.exitCode, 0);
    assert.match(erro.stderr, /falhou/);
    assert.throws(() => commandRequest({ language: "cobol", code: "x" }), /language/);
    assert.throws(() => commandRequest({ language: "javascript", code: "  " }), /código/);
    await assert.rejects(runCommand({ language: "javascript", code: "1" }, { cwd: path.join(cwd, "nao-existe") }), /Abra uma apresentação/);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
