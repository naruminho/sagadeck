import { MEDIA_FINISH } from '../src/ai/art-direction.js';
// IA com um LLM falso (test/mock-llm.js): o que o sagadeck manda para o modelo e como usa a resposta.
// Não testa a "inteligência" do modelo — testa o encanamento: prompt, visão, patch, perguntas, brainstorm.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { editDeck, textToSlide, parseOptions, generateDeck, applyPatch, sanitizeCheck, conversationFor, slidesForMinutes, styleFor } from "../src/ai/deck-ai.js";
import { COLLECTION_STYLE } from "../src/studio/template-collections.js";
import fs from "node:fs";
import os from "node:os";
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
// a geração começa decidindo se pesquisa (src/research): as contas de chamada olham só as da geração em si
const genReqs = (from = 0) => llm.requests.slice(from).filter((q) => !/Decida se o que você JÁ SABE basta/.test(q.lastUser));
let reply = () => "ok";
before(async () => {
  llm = await startMockLLM((req) => reply(req));
  process.env.SAGADECK_LLM_URL = llm.url;
});
after(() => llm.close());

test('chat recebe direção por conteúdo, variedade e ferramenta de vídeo retomável sem prometer 3D em SVG',async()=>{
 reply=()=> 'Vamos preparar o briefing antes de gerar.';
 const at=llm.requests.length;
 await editDeck({spec:base(),instruction:'Planeje a variedade e um filme, sem gerar ainda',runCommand:async()=>({exitCode:0,stdout:'ok'})});
 const system=llm.requests.slice(at).map(r=>JSON.stringify(r.body||r)).join('\n');
 assert.match(system,/função narrativa/);assert.match(system,/Não transforme tudo em cards/);
 assert.match(system,/language: video/);assert.match(system,/aguarde a aprovação/);
 assert.match(system,/figura SVG 2D/);
});

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
  assert.match(genReqs(n)[0].lastUser, /OBRIGATORIAMENTE o layout funnel/);
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

test("Criar com IA usa o MESMO caminho do chat: uma chamada, regras de edição e conversa, sem direção sorteada nem reescritas", async () => {
  const n = llm.requests.length;
  reply = () => deckYaml(BORING); // mesmo repetitivo: não há rodada de "variedade" por cima (o chat não tem)
  const r = await generateDeck("apresentação bem humorada de como fritar um ovo como um chef");
  const reqs = genReqs(n);
  assert.equal(reqs.length, 1, "uma chamada só, como no chat");
  assert.match(reqs[0].system, /Regras de edição:/, "o sistema do chat (editDeck)");
  assert.match(reqs[0].system, /Como responder \(você decide/);
  assert.match(reqs[0].lastUser, /Deck atual \(1 slides\)/, "parte de um deck em branco");
  assert.match(reqs[0].lastUser, /fritar um ovo como um chef/);
  assert.doesNotMatch(reqs[0].lastUser, /Direção criativa deste deck|Nunca 3 slides seguidos/);
  assert.deepEqual(r.spec.slides.map((s) => s.layout), BORING);
  assert.equal(r.spec.title, "Fraudes");
});

test("Criar com IA: se a IA preferir perguntar (como no chat), a pergunta volta com as opções e nada é gerado", async () => {
  reply = () => "É para apresentar ao vivo ou para o pessoal ler depois?\n```opcoes\nAo vivo\nPara ler depois\n```";
  const r = await generateDeck("um material de git");
  assert.deepEqual(r.question, { question: "É para apresentar ao vivo ou para o pessoal ler depois?", options: ["Ao vivo", "Para ler depois"] });
  assert.equal(r.spec, undefined);
});

test("Criar com IA: patch sobre o deck em branco também vale (troca o slide 1 e insere o resto)", async () => {
  reply = () => "Pronto.\n```yaml\ndeck:\n  title: Ovo de chef\n  theme: bauhaus\nslides:\n  1:\n    layout: cover\n    title: Ovo de chef\ninsert:\n  - after: 1\n    slide: { layout: statement, text: Frigideira quente }\n  - after: 1\n    slide: { layout: end, title: Bom apetite }\n```";
  const r = await generateDeck("ovo frito de chef", { images: false });
  assert.equal(r.spec.title, "Ovo de chef");
  assert.equal(r.spec.theme, "bauhaus");
  assert.deepEqual(r.spec.slides.map((s) => s.layout), ["cover", "statement", "end"]);
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
  const req = genReqs(n)[0].lastUser;
  assert.match(req, /Cerca de 20 slides/);
  assert.match(req, /Duração planejada: 30 minutos/);
  assert.match(req, /Use o tema "editorial"/);
  assert.match(req, /Revista editorial/);
});

test("gerar deck: slides explícitos e tema explícito vencem duration e style", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { duration: 30, style: "revista", slides: 5, theme: "noite" });
  const req = genReqs(n)[0].lastUser;
  assert.match(req, /Cerca de 5 slides/);
  assert.match(req, /Use o tema "noite"/);
  assert.match(req, /Revista editorial/);
});

test("editDeck com materiais: bloco rotulado no pedido", async () => {
  reply = () => "Entendi, não mudei nada.";
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "use os números", targetSlide: 0,
    materials: [{ name: "relatorio.pdf", text: "Fraudes: 40% em 2025", detail: "pdf (1 página)" }] });
  const req = genReqs(n)[0].lastUser;
  assert.match(req, /MATERIAL ANEXADO/);
  assert.match(req, /relatorio\.pdf/);
  assert.match(req, /Fraudes: 40% em 2025/);
  assert.match(req, /Pedido: use os números/);
});

test("generateDeck com materiais: bloco antes do briefing", async () => {
  reply = () => deckYaml(VARIED);
  const n = llm.requests.length;
  await generateDeck("fraudes", { direction: "x", materials: [{ name: "dados.csv", text: "ano,valor\n2024,3\n2025,5", detail: "texto" }] });
  const req = genReqs(n)[0].lastUser;
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

test("modelo de texto sem visão (ex.: DeepSeek Pro): a chamada com imagem vai para o modelo de visão do relay", async () => {
  const NO_VISION = { status: 404, error: "HTTP 404: No endpoints found that support image input" };
  process.env.SAGADECK_VISION_MODEL = "vision-ok";
  try {
    reply = (req) => (req.body.model === "vision-ok" ? "Vi a foto: o título está cortado." : req.hasImages ? NO_VISION : "sem imagem");
    const visuals = [{ label: "slide 2 renderizado", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }];
    const n = llm.requests.length;
    const r = await editDeck({ spec: base(), instruction: "o que você acha?", targetSlide: 1, visuals });
    assert.match(r.reply, /Vi a foto/);
    assert.deepEqual(genReqs(n).map((q) => [q.body.model, q.hasImages]), [["text", true], ["vision-ok", true]], "texto recusou, visão viu");
    assert.ok(r.actions.some((a) => /modelo de visão \(vision-ok\)/.test(a)), r.actions.join("; "));
  } finally { delete process.env.SAGADECK_VISION_MODEL; }
});

test("modelo sem visão (ex.: DeepSeek V4 Flash) e sem modelo de visão no relay: refaz sem imagens, avisa e não insiste", async (t) => {
  const NO_VISION = { status: 404, error: "HTTP 404: No endpoints found that support image input" };
  process.env.SAGADECK_TEXT_MODEL = "texto-sem-visao"; process.env.SAGADECK_VISION_MODEL = "visao-inexistente";
  t.after(() => { delete process.env.SAGADECK_TEXT_MODEL; delete process.env.SAGADECK_VISION_MODEL; });
  reply = (req) => (req.hasImages ? NO_VISION : "Vi pelo YAML: o título está ok.");
  const visuals = [{ label: "slide 2 renderizado", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }];
  const n = llm.requests.length;
  const r = await editDeck({ spec: base(), instruction: "o que você acha?", targetSlide: 1, visuals });
  assert.match(r.reply, /título está ok/);
  assert.ok(r.actions.some((a) => /não enxerga imagens/.test(a)), r.actions.join("; "));
  assert.deepEqual(genReqs(n).map((q) => q.hasImages), [true, true, false], "tentou com imagem, tentou o modelo de visão, refez sem");
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
  assert.ok(genReqs(n).some((q) => /^Generate an image: foto de um cofre/.test(q.lastUser)), "tentou gerar");
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
  const reqs = genReqs(n);
  assert.match(reqs[0].system, /Você PODE pedir ilustrações/, "imagens liberadas sem precisar de caixa marcada");
  assert.match(reqs[0].system, /pediu para VOCÊ decidir/);
  assert.match(reqs[0].system, /não falou de imagem → VOCÊ decide/, "sem falar de imagem, a IA decide onde ilustrar (antes: nunca gerava)");
  assert.match(reqs[0].system, /pediu sem imagens \(ou só ícones\) → não gere/);
  const asked = reqs.filter((q) => /^Generate an image/.test(q.lastUser)).map((q) => q.lastUser.replace("Generate an image: ", "").replace(`\n\n${MEDIA_FINISH}`, "").replace(/\.? No text, letters, numbers or labels anywhere in the image\.$/, ""));
  assert.ok(reqs.filter(q => /^Generate an image/.test(q.lastUser)).every(q => q.lastUser.includes(MEDIA_FINISH)), "acabamento acompanha todas as imagens");
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

// Para que serve o material (purpose): quem decide é o modelo; aqui só o encanamento em volta da decisão.
test("generateDeck: com 'perguntar' ligado, uma chamada curta decide o propósito e pode devolver a pergunta antes de gerar", async () => {
  reply = () => '{"purpose": null, "texto": null, "why": "não diz se fica com o pessoal", "pergunta": "O pessoal vai guardar o material?", "opcoes": ["Sim, é para consulta", "Não, é só para a sessão"]}';
  const n0 = llm.requests.length;
  const r = await generateDeck("workshop de git", { direction: "x", ask: true });
  assert.deepEqual(r.question, { question: "O pessoal vai guardar o material?", options: ["Sim, é para consulta", "Não, é só para a sessão"] });
  assert.equal(r.spec, undefined, "não gera deck quando pergunta");
  assert.equal(llm.requests.length - n0, 1, "só a chamada curta de decisão");
  assert.match(llm.requests.at(-1).system, /PARA QUE SERVE/, "a chamada de decisão explica os tipos de material");
  assert.match(llm.requests.at(-1).system, /quanto texto quer/, "o que a pessoa disser sobre a quantidade de texto resolve");
  // decidido (sem pergunta): a decisão entra no pedido de geração, e o sistema traz as regras de purpose
  let call = 0;
  reply = () => (++call === 1 ? '{"purpose": "workshop", "texto": "muito", "why": "o pessoal vai estudar depois", "pergunta": null}'
    : "```yaml\ntitle: Docker\npurpose: workshop\nslides:\n  - layout: cover\n    title: Docker\n  - layout: statement\n    text: Containers\n  - layout: end\n    title: Fim\n```");
  const d = await generateDeck("workshop de docker com bastante texto", { direction: "x", ask: true });
  const gen = llm.requests.at(-1);
  assert.match(gen.system, /purpose:/, "o sistema explica para que serve o material");
  assert.match(gen.system, /Nunca invente fatos/);
  assert.match(gen.lastUser, /purpose: workshop/, "a decisão vai no pedido");
  assert.equal(d.spec.maxWords, 200, "pediu muito texto: o limite do deck acompanha");
  // com a resposta, gera direto (sem a regra de perguntar) e a resposta vai no pedido
  reply = () => "```yaml\ntitle: Git\npurpose: consulta\nslides:\n  - layout: cover\n    title: Git\n  - layout: dossier\n    title: Consulta\n    items:\n      - title: A\n        text: B\n```";
  const g = await generateDeck("workshop de git", { direction: "x", ask: false, answer: "Sim, é para consulta", author: "Ana Dev" });
  const req2 = llm.requests.at(-1);
  assert.match(req2.lastUser, /Resposta da pessoa à sua pergunta sobre o material: Sim, é para consulta/);
  assert.doesNotMatch(req2.lastUser, /```pergunta/);
  assert.equal(g.spec.purpose, "consulta");
  assert.equal(g.spec.author, "Ana Dev", "autor das Preferências quando o deck não diz");
  assert.equal(g.spec.date, new Date().toISOString().slice(0, 10), "a data é a de criação, nunca inventada");
});

test("estilo Documentação técnica (Criar com IA): o par claro/escuro do tema manual", () => {
  assert.equal(styleFor("manual").theme, "manual");
  assert.equal(styleFor("manual-noite").theme, "manual-noite");
  assert.match(styleFor("manual").direction, /Documentação técnica/);
});

test("deck novo devolvido como slides: {1: …, 2: …, 3: …} sobre o começo de 1 slide: é o deck inteiro, na ordem (antes: \"slide 2 não existe\")", async () => {
  const { applyPatch } = await import("../src/ai/deck-ai.js");
  const base = { title: "Nova", slides: [{ layout: "cover", title: "Nova" }] };
  const { spec, changed } = applyPatch(base, { slides: { 1: { layout: "cover", title: "Titans" }, 2: { layout: "statement", text: "A memória" }, 3: { layout: "end", title: "Fim" } } });
  assert.deepEqual(spec.slides.map((x) => x.title || x.text), ["Titans", "A memória", "Fim"]);
  assert.deepEqual(changed, [0, 1, 2]);
  assert.throws(() => applyPatch(base, { slides: { 3: { layout: "end", title: "Fim" } } }), /slide 3 não existe/, "sem o começo da numeração continua erro");
});

test("deck novo com título, tema e paleta dentro de deck: (o jeito do patch) vale como o deck (saía \"Nova apresentação\", no tema padrão)", async () => {
  reply = () => "Pronto.\n```yaml\ndeck:\n  title: Brigadeiro Gourmet\n  theme: editorial\n  palette: entardecer\nslides:\n  - layout: poster\n    title: Como fazer um brigadeiro\n    panels:\n      - { title: Ponto, icon: flame, text: Desgruda do fundo }\n```";
  const r = await generateDeck("brigadeiro numa página", { images: false });
  assert.equal(r.spec.title, "Brigadeiro Gourmet");
  assert.equal(r.spec.theme, "editorial");
  assert.equal(r.spec.palette, "entardecer");
  assert.equal(r.spec.deck, undefined, "o deck: não sobra no arquivo");
});

test("vírgula dentro de texto em { } não vira campo novo (o modelo escreve assim e o texto se partia)", async () => {
  reply = () => "Pronto.\n```yaml\ntitle: Ovo\nslides:\n  - layout: cover\n    title: Ovo\n  - layout: steps\n    title: Ritual\n    steps:\n      - { title: Aqueça, text: Manteiga derretida, mas sem fumaça saindo }\n      - { title: Quebre, text: Na borda, com coragem, sem medo }\n  - layout: end\n    title: Fim\n```";
  const r = await generateDeck("ovo", { images: false });
  const st = r.spec.slides[1].steps;
  assert.deepEqual(st[0], { title: "Aqueça", text: "Manteiga derretida, mas sem fumaça saindo" });
  // lista de uma palavra por vírgula ({ text: nuvens, vento, umidade }): "vento" e "umidade" não são campos
  const { parseYaml } = await import("../src/ai/deck-ai.js");
  assert.deepEqual(parseYaml("steps:\n  - { title: Olha as pistas, text: nuvens, vento, umidade }").steps[0], { title: "Olha as pistas", text: "nuvens, vento, umidade" });
  assert.deepEqual(parseYaml("a: { title: X, image: }").a, { title: "X", image: null }, "campo de verdade vazio continua campo");
  assert.deepEqual(st[1], { title: "Quebre", text: "Na borda, com coragem, sem medo" });
});

test("carrossel pelo chat: cada item com image_prompt vira foto gerada (a referência ensina a IA)", async () => {
  const { reference } = await import("../src/ai/deck-ai.js");
  assert.match(reference(), /cada item aceita `image_prompt: "descrição fotográfica realista/);
  reply = (req) => (/^Generate an image/.test(req.lastUser) ? "sem imagem (mock)"
    : "Montei o carrossel.\n```yaml\nedit:\n  1:\n    layout: carousel\n    items:\n      - { title: Montanha, image_prompt: \"a misty mountain at sunrise, realistic photo\" }\n      - { title: Mar, image_prompt: \"calm ocean at noon, realistic photo\" }\n```");
  const n = llm.requests.length;
  await editDeck({ spec: base(), instruction: "faça um carrossel com fotos realistas", targetSlide: 0, images: true, imageOptions: { baseDir: process.cwd(), assetsDir: "imagens-teste-nao-cria" } });
  const asked = genReqs(n).filter((q) => /^Generate an image/.test(q.lastUser)).map((q) => q.lastUser.replace("Generate an image: ", "").replace(`\n\n${MEDIA_FINISH}`, "").replace(/\.? No text, letters, numbers or labels anywhere in the image\.$/, ""));
  assert.deepEqual(asked.sort(), ["a misty mountain at sunrise, realistic photo", "calm ocean at noon, realistic photo"]);
});

test("YAML da IA: texto com ': ' sem aspas e LaTeX entre aspas duplas são consertados sem corromper a fórmula", async () => {
  const { parseYaml } = await import("../src/ai/deck-ai.js");
  const y = [
    "slides:",
    "  - layout: statement",
    "    mudou: Lista completa de rótulos restaurada, imagem com fit: contain e legenda",
    String.raw`    text: "**Segurança:** $S = \left(1 - \frac{1}{TR}\right)^n$, com \beta e \times"`,
  ].join("\n");
  const s = parseYaml(y).slides[0];
  assert.equal(s.mudou, "Lista completa de rótulos restaurada, imagem com fit: contain e legenda");
  assert.equal(s.text, String.raw`**Segurança:** $S = \left(1 - \frac{1}{TR}\right)^n$, com \beta e \times`);
  // já escapado certo (\\frac) ou escapado demais (\\\frac): uma barra de LaTeX, como a IA quis
  for (const y2 of [String.raw`t: "$$i = \frac{a \cdot Tr^{b}}{(t+c)^{d}}$$"`, String.raw`t: "$$i = \\frac{a \\cdot Tr^{b}}{(t+c)^{d}}$$"`, String.raw`t: "$$i = \\\frac{a \\\cdot Tr^{b}}{(t+c)^{d}}$$"`])
    assert.equal(parseYaml(y2).t, String.raw`$$i = \frac{a \cdot Tr^{b}}{(t+c)^{d}}$$`, y2);
  // valor que começa com "Palavra: " (Fonte: …) e tem outros ": " no meio
  assert.equal(parseYaml("a:\n  source: Fonte: Macedo (2020). Equação: I = K·TR^m").a.source, "Fonte: Macedo (2020). Equação: I = K·TR^m");
  // casos da rodada 02/10: texto que começa entre aspas e continua depois delas; texto com ": " que segue na linha de baixo
  const y3 = [
    "slides:",
    "  - title: A",
    '    mudou: "Ajute" corrigido para "Ajuste"; número do posto mantido como',
    "      no original",
    "    text: x",
    "  - title: B",
    "    mudou: Adicionados os rótulos faltantes: Maior precipitação, Maior Evaporação e",
    "      Variações no nível",
    "    text: y",
  ].join("\n");
  const [a3, b3] = parseYaml(y3).slides;
  assert.equal(a3.mudou, '"Ajute" corrigido para "Ajuste"; número do posto mantido como no original');
  assert.equal(b3.mudou, "Adicionados os rótulos faltantes: Maior precipitação, Maior Evaporação e Variações no nível");
  assert.deepEqual([a3.text, b3.text], ["x", "y"]);
  // o que já era válido continua igual (quebra de linha escapada, aspas escapadas)
  assert.equal(parseYaml(String.raw`a: "linha 1\nlinha 2 \"x\""`).a, 'linha 1\nlinha 2 "x"');
});

test("Criar com IA confere a cobertura do paper: figura numerada sem slide volta para a IA encaixar", async () => {
  const doc = { name: "paper.pdf", text: "Resultados do artigo.", detail: "pdf", inventory: { items: [
    { id: "f1", kind: "figure", page: 3, caption: "Figura 1 – Mapa da área", image: "contexto/visuais/x/f1.png", width: 1200, height: 800 },
    { id: "f2", kind: "figure", page: 9, caption: "Figura 8 – Correlação da linha 1", image: "contexto/visuais/x/f8.png", width: 1500, height: 420 },
    { id: "e1", kind: "equation", page: 5, caption: "Eq. 1", latex: "d = c/\pi" },
  ] } };
  const n = llm.requests.length;
  reply = (req) => /Conferência de cobertura/.test(req.lastUser)
    ? "Encaixei a figura 8.\n```yaml\ninsert:\n  - after: 2\n    slide: { layout: split, arrangement: stacked, title: A linha 1 acompanha a cubagem, figure: { image: contexto/visuais/x/f8.png, fit: contain }, body: Correlação forte entre os métodos. }\n```"
    : "Pronto.\n```yaml\ndeck:\n  title: Paper\nslides:\n  - { layout: cover, title: Paper }\n  - { layout: split, title: Área de estudo, figure: { image: contexto/visuais/x/f1.png, fit: contain }, body: Talhão em Monte Carmelo. }\n  - { layout: end, title: Obrigado }\n```";
  const r = await generateDeck("Apresentação de congresso do paper anexado", { images: false, materials: [doc] });
  const reqs = genReqs(n);
  const check = reqs.find((q) => /Conferência de cobertura/.test(q.lastUser));
  assert.ok(check, "pediu a conferência de cobertura");
  assert.match(check.lastUser, /Figura 8 – Correlação da linha 1/);
  assert.match(check.lastUser, /1500×420 px/, "a IA recebe a proporção do recorte");
  const asked = check.lastUser.split("Conferência de cobertura")[1].split("Pedido original")[0];
  assert.doesNotMatch(asked, /Figura 1 – Mapa/, "a figura já usada não volta");
  assert.doesNotMatch(asked, /Eq\. 1/, "equação não é cobrança de cobertura");
  assert.ok(JSON.stringify(r.spec.slides).includes("contexto/visuais/x/f8.png"));
  assert.deepEqual(r.coverage, { total: 1, missing: [] });
});

test("Criar com IA sem material: nenhuma chamada extra de cobertura", async () => {
  const n = llm.requests.length;
  reply = () => "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Ovo }\n  - { layout: end, title: Fim }\n```";
  const r = await generateDeck("ovo frito", { images: false });
  assert.equal(genReqs(n).length, 1);
  assert.equal(r.coverage, undefined);
});

test("revisão de texto sem visão: frase longa em slide de impacto e excesso de telas de frase única viram achados", async () => {
  const { auditText, reviewExperience } = await import("../src/ai/quality.js");
  const spec = { slides: [
    { layout: "cover", title: "Capa" },
    { layout: "headline", text: "Caracterizar a fisiografia da bacia do Rio Beberibe e sua influência nos padrões hídricos da região metropolitana" },
    { layout: "statement", text: "Água é limitada." },
    { layout: "split", title: "Método", body: "Texto." },
    { layout: "quote", quote: "Curta." },
    { layout: "statement", text: "Outra frase." },
    { layout: "end", title: "Fim" },
  ] };
  const issues = auditText(spec, spec.slides.map((_, i) => i));
  assert.ok(issues.some((x) => x.slide === 2 && /16|palavras/.test(x.text)), JSON.stringify(issues));
  assert.ok(issues.some((x) => x.slide === 6 && /frase única/.test(x.text)), "a 4ª tela de frase solta passa do limite");
  assert.ok(!issues.some((x) => x.slide === 3), "frase curta de impacto é legítima");
  // título encolhido à mão para "dar espaço à figura" (titleSize 40) desiguala o deck
  const shrunk = auditText({ slides: [{ layout: "image", title: "Área", titleSize: 40, figure: { image: "a.png" } }, { layout: "split", title: "Método", titleSize: 72, body: "x" }] }, [0, 1]);
  assert.ok(shrunk.some((x) => x.slide === 1 && /titleSize 40/.test(x.text)));
  assert.ok(!shrunk.some((x) => x.slide === 2), "titleSize razoável não é achado");
  // entra no relatório da revisão mesmo sem visão (e não aprova o deck)
  const q = await reviewExperience(spec, [1], {});
  assert.ok(q.issues.some((x) => x.slide === 2));
  assert.equal(q.verified, false);
});

test("redesenho de figura do paper guarda o original no elemento; o chat volta para ele (o caminho está no deck e na referência)", async () => {
  const { materializeImages, reference, sanitizeCheck } = await import("../src/ai/deck-ai.js");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const fsx = await import("node:fs"), os = await import("node:os");
  const dir = fsx.mkdtempSync(path.join(os.tmpdir(), "sgd-orig-"));
  const before = reply;
  reply = () => ({ image: `data:image/png;base64,${PNG.toString("base64")}` });
  try {
    fsx.mkdirSync(path.join(dir, "contexto", "visuais", "x"), { recursive: true });
    fsx.writeFileSync(path.join(dir, "contexto", "visuais", "x", "fig2.png"), PNG);
    const spec = { slides: [{ layout: "split", title: "Fluxo do estudo", figure: { image_prompt: "Clean up and redraw THIS EXACT figure", image_ref: "contexto/visuais/x/fig2.png", fit: "contain" } }] };
    await materializeImages(spec, { baseDir: dir });
    const fig = spec.slides[0].figure;
    assert.match(fig.image, /^imagens\/ia-/);
    assert.equal(fig.original, "contexto/visuais/x/fig2.png", "o caminho de volta fica no deck");
    // reconstrução nativa: sourceFigure é campo válido e a referência ensina a voltar
    sanitizeCheck({ slides: [{ layout: "chart", title: "RMSE por linha", sourceFigure: "contexto/visuais/x/fig8.png", chart: { chart: "bar", data: [{ label: "Linha 1", value: 37.7 }] } }] }, [0]);
    assert.match(reference(), /Voltar ao original/);
    // o deck com a figura redesenhada conta como coberto (o original está ligado ao slide)
    const { uncoveredVisuals } = await import("../src/ai/document-visuals.js");
    assert.deepEqual(uncoveredVisuals(spec, [{ inventory: { items: [{ id: "f2", kind: "figure", caption: "Figura 2 – Fluxograma", image: "contexto/visuais/x/fig2.png" }] } }]), []);
  } finally { reply = before; fsx.rmSync(dir, { recursive: true, force: true }); }
});

test("prompt: gráfico pode ser redesenhado, a reconstrução guarda sourceFigure e a IA cria gráfico dos números do texto", async () => {
  const { systemPrompt } = await import("../src/ai/deck-ai.js");
  const p = systemPrompt();
  assert.match(p, /GRÁFICO cujos valores estão no paper/);
  assert.match(p, /sourceFigure/);
  assert.match(p, /Iniciativa com os números/);
  assert.match(p, /Não invente pontos/);
});

test("vírgula decimal em lista entre colchetes não parte a célula da tabela (NSE 0,93 virava 0 | 93)", async () => {
  const { quoteFlowDecimals, parseYaml, sanitizeCheck } = await import("../src/ai/deck-ai.js");
  const y = parseYaml("slides:\n  - layout: table\n    head: [Evento, Modelo, NSE, R²]\n    rows:\n      - [07/04/2017, HEC-HMS, 0,93, 0,97]\n      - [16/02/2019, HYMOD, 0,94, 0,05]\n    chart: { values: [10,20,30] }");
  assert.deepEqual(y.slides[0].rows[0], ["07/04/2017", "HEC-HMS", "0,93", "0,97"]);
  assert.deepEqual(y.slides[0].rows[1][3], "0,05", "o zero à esquerda não some");
  assert.deepEqual(y.slides[0].chart.values, [10, 20, 30], "lista de números sem espaço continua números");
  assert.equal(quoteFlowDecimals('  text: "0,93, entre aspas"'), '  text: "0,93, entre aspas"');
  // linha de tabela com mais células que o cabeçalho volta para a IA corrigir
  assert.throws(() => sanitizeCheck({ slides: [{ layout: "table", title: "x", head: ["A", "B"], rows: [["1", "2", "3"]] }] }, [0]), /número de células diferente do cabeçalho/);
  assert.throws(() => sanitizeCheck({ slides: [{ layout: "split", title: "x", content: [{ table: { headers: ["A", "B"], rows: [["1"]] } }] }] }, [0]), /número de células diferente/);
  sanitizeCheck({ slides: [{ layout: "table", title: "x", head: ["A", "B"], rows: [["1", "2"]] }] }, [0]);
});

test("checagem de números: o que não está no material volta para a IA (arredondamento e contagem pequena valem)", async () => {
  const { unsupportedNumbers } = await import("../src/ai/document-visuals.js");
  const material = [{ name: "paper.pdf", text: "O teste de ANOVA deu p inferior a 0,05. RMSE% de 37,6692% na linha 1; 1403 pontos; r = 0,761.", inventory: { items: [{ kind: "table", caption: "Tabela 1", rows: [["Linha", "RMSE"], ["L2", "0,0201"]] }] } }];
  const spec = { slides: [
    { layout: "split", title: "Correlação", body: "r = 0,761; ANOVA: p = 0,109 no diâmetro", notes: "nas notas 9,99 não conta" },
    { layout: "stats", title: "x", stats: [{ value: "37,67%", label: "linha 1" }, { value: "1.403", label: "pontos" }, { value: "3", label: "métricas" }] },
    { layout: "chart", title: "y", chart: { chart: "bar", data: [{ label: "L2", value: 0.0201 }, { label: "L3", value: 0.0999 }] } },
  ] };
  assert.deepEqual(unsupportedNumbers(spec, material).map((b) => `${b.slide}:${b.number}`), ["1:0,109", "3:0.0999"]);
  // sem material, nada a conferir
  assert.deepEqual(unsupportedNumbers(spec, []), []);
});

test("Criar com IA confere os números contra o material e pede a correção do que não tem base", async () => {
  const doc = { name: "paper.pdf", text: "O teste de ANOVA deu p inferior a 0,05 para as duas linhas.", detail: "pdf", inventory: { items: [] } };
  const n = llm.requests.length;
  reply = (req) => /Checagem de números/.test(req.lastUser)
    ? "Corrigi.\n```yaml\nedit:\n  2:\n    body: ANOVA com p inferior a 0,05 nas duas linhas.\n```"
    : "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Paper }\n  - { layout: split, title: Correlação, body: \"ANOVA: p = 0,109 no diâmetro\" }\n  - { layout: end, title: Obrigado }\n```";
  const r = await generateDeck("Apresentação de congresso do paper", { images: false, materials: [doc] });
  const ask = genReqs(n).find((q) => /Checagem de números/.test(q.lastUser));
  assert.ok(ask, "pediu a checagem");
  assert.match(ask.lastUser, /slide 2: 0,109/);
  assert.match(r.spec.slides[1].body, /inferior a 0,05/);
  assert.deepEqual(r.facts, { checked: 1, unsupported: [] });
});

test("deck feito de documento não assina com o autor das Preferências (é de quem usa o sagadeck, não de quem escreveu o artigo)", async () => {
  const doc = { name: "paper.pdf", text: "Maria Clara Fava, UFSCar. Resultados.", detail: "pdf", inventory: { items: [] } };
  const n = llm.requests.length;
  reply = (req) => /LEITURA CRÍTICA de um material/.test(req.system) ? '{"itens":[]}'
    : "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Paper }\n  - { layout: end, title: Obrigada }\n```";
  const r = await generateDeck("Apresentação do artigo no congresso", { images: false, author: "Narumi Abe", materials: [doc] });
  const ask = genReqs(n).find((q) => /Crie a apresentação inteira/.test(q.lastUser));
  assert.match(ask.lastUser, /NÃO é o autor do documento anexado/);
  assert.doesNotMatch(ask.lastUser, /Autor padrão das preferências: Narumi/);
  assert.equal(r.spec.author, undefined, "o autor das Preferências não é colado no deck do artigo");
  assert.match((await import("../src/ai/deck-ai.js")).systemPrompt(), /QUEM ASSINA o deck feito de um documento/);
  // sem documento, o padrão continua valendo
  reply = () => "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Ovo }\n  - { layout: end, title: Fim }\n```";
  assert.equal((await generateDeck("ovo frito", { images: false, author: "Narumi Abe" })).spec.author, "Narumi Abe");
});

test("revisão de texto: votação em apresentação acadêmica sem pedido e marcação crua na tela viram achados", async () => {
  const { auditText } = await import("../src/ai/quality.js");
  const { renderSlide } = await import("../src/build.js");
  const spec = { context: { autoria: "livre" }, slides: [
    { layout: "question", question: "O que o ML acrescenta ao HAND?", options: ["Nada", "Algo"], timer: 45 },
    { layout: "question", question: "Pergunta para discussão" },
    { layout: "stats", title: "x", stats: [{ value: "1", label: "a", trend: "^^+5%^^" }] },
    { layout: "code", title: "py", code: "f(**kwargs)" },
  ] };
  const render = (s, i) => renderSlide(s, i, spec).html;
  const issues = auditText(spec, [0, 1, 2, 3], { briefing: "journal club da disciplina", render });
  assert.ok(issues.some((x) => x.slide === 1 && /Votação/.test(x.text)));
  assert.ok(!issues.some((x) => x.slide === 2), "pergunta sem options é discussão, não votação");
  assert.ok(issues.some((x) => x.slide === 3 && /Marcação aparecendo crua/.test(x.text)));
  assert.ok(!issues.some((x) => x.slide === 4), "código pode ter ** (kwargs)");
  // pediu interação: votação vale
  assert.ok(!auditText(spec, [0], { briefing: "journal club com enquete para a turma votar", render }).some((x) => /Votação/.test(x.text)));
});

test("prompt: opinião sem foco cobre conteúdo primeiro e forma depois (a foto do slide puxava só para o visual)", async () => {
  const { editDeck } = await import("../src/ai/deck-ai.js");
  reply = () => "Conteúdo: bom.\n```opcoes\nAprofundar o conteúdo\nAprofundar o visual\n```";
  const at = llm.requests.length;
  await editDeck({ spec: base(), instruction: "o que você acha desse slide?", targetSlide: 1 });
  const sys = llm.requests.slice(at).map((q) => q.system).join("\n");
  assert.match(sys, /OPINIÃO SEM FOCO/);
  assert.match(sys, /CONTEÚDO PRIMEIRO/);
});

test("slide idêntico sai do deck gerado (duas capas iguais); repetido com mesmo título vira achado da revisão", async () => {
  const { dropDuplicateSlides } = await import("../src/ai/deck-ai.js");
  const { auditText } = await import("../src/ai/quality.js");
  const cover = { layout: "cover", title: "Metodologias integradas", author: "Maria Clara Fava et al.", notes: "Bom dia." };
  const d = dropDuplicateSlides({ slides: [{ ...cover, uid: "a" }, { ...cover, uid: "b" }, { layout: "end", title: "Obrigada" }] });
  assert.deepEqual(d.removed, [2]);
  assert.equal(d.spec.slides.length, 2);
  reply = () => "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Paper, author: Maria }\n  - { layout: cover, title: Paper, author: Maria }\n  - { layout: end, title: Fim }\n```";
  const r = await generateDeck("ovo", { images: false });
  assert.deepEqual(r.spec.slides.map((s) => s.layout), ["cover", "end"]);
  const issues = auditText({ slides: [{ layout: "split", title: "Resultados", body: "a" }, { layout: "split", title: "==Resultados==", body: "b" }] }, [0, 1]);
  assert.ok(issues.some((x) => x.slide === 2 && /Slide repetido/.test(x.text)));
});

test("YAML da IA: número de tabela com zero no fim fica como foi escrito (0.90 não vira 0.9); deck em inglês ganha lang", async () => {
  const { parseYaml, guessDeckLang } = await import("../src/ai/deck-ai.js");
  const y = parseYaml("slides:\n  - layout: table\n    head: [Index, Event]\n    rows:\n      - [NSE, 0.90]\n      - [PEV, 7.80]\n  - layout: chart\n    chart: { chart: bar, data: [{ label: a, value: 0.90 }] }\n  - { layout: number, value: 0.90, label: NSE }");
  assert.deepEqual(y.slides[0].rows, [["NSE", "0.90"], ["PEV", "7.80"]]);
  assert.equal(y.slides[1].chart.data[0].value, 0.9, "dado de gráfico continua número");
  assert.equal(y.slides[2].value, "0.90");
  assert.equal(guessDeckLang({ slides: [{ title: "Flood susceptibility in the basin", body: "The models were calibrated with the data from four events and validated on one of them." }] }), "en");
  assert.notEqual(guessDeckLang({ slides: [{ title: "Suscetibilidade a inundações", body: "Os modelos foram calibrados com os dados de quatro eventos e validados em um deles." }] }), "en", "português nunca vira inglês (o padrão já é pt-BR)");
  reply = () => "Done.\n```yaml\nslides:\n  - { layout: cover, title: Flood susceptibility in the basin }\n  - { layout: split, title: Results, body: The models were calibrated with the data from four events and validated on one of them, and the results are in the table of the paper. }\n  - { layout: end, title: Thank you }\n```";
  assert.equal((await generateDeck("presentation in English", { images: false })).spec.lang, "en");
});

// ---------------------------------------------------------------- etapas da geração (src/ai/progress.js)
test("quadro de etapas: cada aviso diz a etapa; duas etapas juntas aparecem as duas", async () => {
  const { stageBoard } = await import("../src/ai/progress.js");
  const evs = [];
  const board = stageBoard((ev) => evs.push(ev));
  let release;
  const gate = new Promise((r) => { release = r; });
  const a = board.run("Lendo o documento", async (emit) => { emit({ phase: "document", text: "página 1 de 3…" }); await gate; return "inventário"; });
  const b = board.run("Leitura crítica", async (emit) => { emit("lendo com olho crítico…"); release(); return "crítica"; });
  assert.deepEqual(await Promise.all([a, b]), ["inventário", "crítica"]);
  assert.ok(evs.some((e) => e.text === "Lendo o documento: página 1 de 3… · Leitura crítica: lendo com olho crítico…" && e.stages.length === 2), evs.map((e) => e.text).join(" | "));
  assert.equal(evs.find((e) => e.phase === "document").text, "Lendo o documento: página 1 de 3…");
  assert.deepEqual(evs.at(-1).done, ["Leitura crítica"]);
});

test("Criar com IA: a leitura crítica começa enquanto o documento ainda é inventariado; a escrita espera o inventário; o aviso diz a etapa", { timeout: 60000 }, async () => {
  const { generateForStudio } = await import("../src/studio/generate.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-gen-etapas-"));
  let release, criticaComecou = false;
  const inventario = new Promise((r) => { release = r; });
  const PAPER = "Resultados do artigo. ".repeat(50);
  try {
    reply = (req) => {
      if (/LEITURA CRÍTICA de um material/.test(req.system)) { criticaComecou = true; release(); return JSON.stringify({ itens: [] }); }
      if (/"issues"/.test(req.system)) return '{"issues":[]}';
      return "Pronto.\n```yaml\nslides:\n  - { layout: cover, title: Artigo }\n  - { layout: statement, text: Achado principal }\n  - { layout: end, title: Obrigado }\n```";
    };
    const evs = [];
    const at = llm.requests.length;
    const prepare = async (mats, d, { onProgress }) => {
      onProgress({ phase: "document", text: "Conferindo figuras, tabelas e equações: página 1 de 2…" });
      await inventario; // só termina depois que a crítica começou: se a geração esperasse o inventário antes, travaria aqui
      return mats.map(({ bytes, ...m }) => ({ ...m, inventory: { items: [] } }));
    };
    const gen = await generateForStudio({ briefing: "Apresentação oral deste artigo num congresso" }, {
      dir, prepare, emit: (ev) => evs.push(ev),
      materials: [{ name: "artigo.pdf", text: PAPER, detail: "pdf", bytes: Buffer.from("%PDF") }],
      prefs: { autor: "Pessoa das Preferências", perguntar: false, pesquisa: false, imagens: false },
    });
    assert.ok(criticaComecou && gen.spec.slides.length === 3);
    assert.ok(evs.some((e) => e.stages?.includes("Lendo o documento") && e.stages?.includes("Leitura crítica")), "as duas etapas correram juntas");
    assert.ok(evs.some((e) => /^Escrevendo a apresentação: /.test(e.text || "")), evs.map((e) => e.text).join(" | "));
    assert.ok(!evs.some((e) => e.text === "Pensando…"), "nenhum aviso solto sem etapa");
    // a escrita recebeu o material já inventariado (documento anexado: o autor das Preferências não assina)
    const writing = llm.requests.slice(at).find((q) => /Crie a apresentação inteira/.test(q.lastUser));
    assert.match(writing.lastUser, /NÃO é o autor do documento anexado/);
  } finally {
    reply = () => "ok"; fs.rmSync(dir, { recursive: true, force: true });
    await (await import("../src/studio/snapshot.js")).closeSnapshots(); // a revisão abriu o navegador
  }
});

test("Criar com IA: a IA pergunta antes de escrever e o inventário do documento é cancelado (não fica rodando)", { timeout: 60000 }, async () => {
  const { generateForStudio } = await import("../src/studio/generate.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-gen-etapas-"));
  let cancelado = false;
  try {
    reply = (req) => /Você decide PARA QUE SERVE/.test(req.system)
      ? '{"purpose": null, "pergunta": "Vai ser apresentado ou enviado para estudar?", "opcoes": ["Apresentar", "Estudar"]}' : "ok";
    const prepare = (mats, d, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => { cancelado = true; reject(new Error("cancelado")); }));
    const gen = await generateForStudio({ briefing: "Um workshop sobre o artigo" }, {
      dir, prepare, materials: [{ name: "artigo.pdf", text: "Texto do artigo.", detail: "pdf", bytes: Buffer.from("%PDF") }],
      prefs: { perguntar: true, pesquisa: false, imagens: false },
    });
    assert.match(gen.question.question, /apresentado ou enviado/);
    assert.ok(cancelado, "o inventário foi cancelado");
  } finally { reply = () => "ok"; fs.rmSync(dir, { recursive: true, force: true }); }
});
