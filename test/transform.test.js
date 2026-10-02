// Transformar uma apresentação importada (src/ai/transform.js), com o LLM falso: ver → planejar → escrever → conferir
// (fatos por código, desenho por visão) → montar. O chat decide iniciar (transform:); o Studio executa e mostra.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import pptxgen from "pptxgenjs";
import { startMockLLM } from "./mock-llm.js";
import { openLibrary } from "../src/library.js";
import { mergeProgressive, isProgressive } from "../src/import/merge.js";
import { factsOf, missingFacts, transformDeck, jobStatus, jsonLoose, nearImage, vocabularyOf, typosOf } from "../src/ai/transform.js";
import { browserOrSkip, startStudio } from "./helpers.js";

process.env.SAGADECK_NO_OFFICE = "1";

async function lessonPptx() {
  const p = new pptxgen();
  p.layout = "LAYOUT_WIDE";
  p.addSlide().addText("Hidrologia urbana", { x: 1, y: 2.5, w: 10, h: 1.2, fontSize: 40, bold: true });
  const s2 = p.addSlide();
  s2.addText("Tempo de concentração", { x: 0.8, y: 0.3, w: 10, h: 0.8, fontSize: 30, bold: true });
  s2.addText("A equação de Kirpich vale para bacias menores que 0,5 km². O coeficiente é 57 e o expoente 0,385.", { x: 0.8, y: 1.5, w: 11, h: 1.5, fontSize: 22 });
  // desenho que cresce em 2 slides (a pessoa copiou e acrescentou)
  const s3 = p.addSlide();
  s3.addText("Ciclo", { x: 0.8, y: 0.3, w: 6, h: 0.8, fontSize: 30, bold: true });
  s3.addShape(p.ShapeType.rect, { x: 1, y: 3, w: 8, h: 2, fill: { color: "D9C3A0" } });
  const s4 = p.addSlide();
  s4.addText("Ciclo", { x: 0.8, y: 0.3, w: 6, h: 0.8, fontSize: 30, bold: true });
  s4.addShape(p.ShapeType.rect, { x: 1, y: 3, w: 8, h: 2, fill: { color: "D9C3A0" } });
  s4.addShape(p.ShapeType.ellipse, { x: 5, y: 1.3, w: 1.5, h: 1.2, fill: { color: "5B9BD5" } });
  const s5 = p.addSlide();
  s5.addText("Referências", { x: 0.8, y: 0.3, w: 10, h: 0.8, fontSize: 30, bold: true });
  s5.addText("TUCCI, C. E. M. Hidrologia. 1993.", { x: 0.8, y: 1.5, w: 11, h: 1, fontSize: 20 });
  return p.write({ outputType: "nodebuffer" });
}
const tmp = (p) => fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || process.env.TMPDIR || "/tmp"), p));

// roteiro do LLM falso por etapa (o que o sagadeck manda em cada uma)
function script() {
  const seen = { plan: 0, write: 0, fix: 0, vision: 0 };
  const handler = (req) => {
    const u = req.lastUser;
    if (/Confira slides NOVOS/.test(u)) { seen.vision++; return '```json\n{"slides":[{"i":1,"ok":true}]}\n```'; }
    if (/Fotos de slides/.test(u)) return '```json\n{"slides":[]}\n```';
    if (/Faça o PLANO/.test(u)) {
      seen.plan++;
      return "```json\n" + JSON.stringify({ tema: "oceano", titulo: "Hidrologia urbana", alertas: ["slide 2: conferir a unidade"], slides: [
        { acao: "manter", de: [1], ideia: "capa" },
        { acao: "escrever", de: [2], ideia: "calc de Kirpich" },
        { acao: "novo", de: [2], ideia: "pergunta para a turma" },
        { acao: "juntar", de: [3, 4], ideia: "o ciclo montado por cliques" },
        // o slide 5 foi esquecido de propósito: a cobertura põe de volta
      ] }) + "\n```";
    }
    // escritor: os itens 2 (Kirpich) e 3 (pergunta) do plano; os outros, o texto do original num statement
    const writer = (text, full) => {
      const items = [...text.matchAll(/## ITEM (\d+)/g)].map((m) => +m[1]);
      const out = ["```yaml", "slides:"];
      for (const k of items) {
        if (k === 2) out.push("  - layout: statement", "    origem: 2", '    mudou: "virou uma frase de destaque"', `    text: "Kirpich: bacias menores que 0,5 km²; coeficiente 57${full ? ", expoente 0,385" : ""}."`);
        else if (k === 3) out.push("  - layout: question", "    origem: 3", '    question: "Qual o tempo de concentração de uma bacia com L = 2 km?"', "    options: [A, B]");
        else {
          const sec = text.split(/## ITEM /).find((x) => x.startsWith(`${k} `)) || "";
          const lines = sec.split("\n").filter((l) => /^  \S/.test(l)).map((l) => l.trim()).join(" · ").replace(/"/g, "'");
          out.push("  - layout: statement", `    origem: ${k}`, `    text: "${lines || "slide"}"`);
        }
      }
      out.push("```");
      return out.join("\n");
    };
    if (/Conferi estes slides/.test(u)) {
      seen.fix++;
      const asked = req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : ""));
      return writer(asked.content, true);
    }
    if (/Escreva os slides destes itens/.test(u)) {
      seen.write++;
      return writer(u, false); // esquece o 0,385 de propósito: a conferência de fatos acha e pede para corrigir
    }
    // chat: a IA decide transformar
    if (/recrie|recriar/i.test(u)) return 'Vou recriar do zero.\n```yaml\ntransform:\n  mode: recriar\n  pedido: "recriar a aula do zero"\n```';
    return 'Vou melhorar mantendo o estilo.\n```yaml\ntransform:\n  mode: melhorar\n  pedido: "melhorar a aula inteira"\n```';
  };
  return { handler, seen };
}

test("juntar slides progressivos: cada parte aparece no clique em que surgiu, e a que saiu some", () => {
  const a = { layout: "canvas", title: "c", original: { slide: 6 }, elements: [{ drawing: "<svg>solo</svg>", x: 0, y: 0 }, { drawing: "<svg>lupa1</svg>", x: 1, y: 1 }] };
  const b = { layout: "canvas", title: "c", original: { slide: 7 }, elements: [{ drawing: "<svg>solo</svg>", x: 0, y: 0 }, { drawing: "<svg>lupa2</svg>", x: 2, y: 2 }] };
  const c = { layout: "canvas", title: "c", original: { slide: 8 }, elements: [{ drawing: "<svg>solo</svg>", x: 0, y: 0 }, { drawing: "<svg>lupa2</svg>", x: 2, y: 2 }, { drawing: "<svg>rio</svg>", x: 3, y: 3 }] };
  assert.ok(isProgressive([a, b, c]));
  const m = mergeProgressive([a, b, c]);
  assert.deepEqual(m.elements.map((e) => [e.drawing, e.step ?? 0, e.exit ?? null]), [["<svg>solo</svg>", 0, null], ["<svg>lupa1</svg>", 0, 1], ["<svg>lupa2</svg>", 1, null], ["<svg>rio</svg>", 2, null]]);
  assert.deepEqual(m.original.merged, [6, 7, 8]);
});

test("fatos: palavra que começa linha ou é rótulo (\"Como…\", \"Estabelecido…\", \"Obs:\") não é nome próprio; nome no meio da frase é", () => {
  const box = (t) => ({ textbox: { paragraphs: t.split("\n").map((l) => ({ runs: [{ t: l }] })) } });
  const f = factsOf({ elements: [box("A drenagem urbana tradicional\nComo definir a área de contribuição\nEstabelecido pela lei federal\nvazão de pico, Obs: depende da chuva\nO posto fica em São Carlos e foi medido por Barbassa")] });
  for (const w of ["Como", "Estabelecido", "Obs"]) assert.ok(!f.terms.has(w), `${w} não é nome`);
  assert.ok(f.terms.has("São Carlos"), [...f.terms].join(", "));
  assert.ok(f.terms.has("Barbassa"));
});

test("fatos do original: números (0,385 = 0.385; 10.000), siglas e nomes; o que falta no novo é apontado", () => {
  const slide = { elements: [{ textbox: { paragraphs: [{ runs: [{ t: "Kirpich: coeficiente 57, expoente 0,385; vale até 10.000 hab. Fonte: SAE de São Carlos." }] }] } }, { tableData: [["Ano", "Q"], ["1988", "2218,0"]] }] };
  const f = factsOf(slide);
  for (const n of ["57", "0.385", "10000", "1988", "2218"]) assert.ok(f.numbers.has(n), n);
  assert.ok(f.terms.has("SAE"));
  const miss = missingFacts(f, [{ layout: "statement", text: "Kirpich: 57 e 0.385 até 10.000 hab (SAE, São Carlos). 1988: 2218" }]);
  assert.deepEqual(miss.numbers, []);
  assert.ok(!miss.terms.includes("SAE"));
  assert.deepEqual(missingFacts(f, [{ text: "só 57" }]).numbers.sort(), ["0.385", "10000", "1988", "2218"].sort());
});

test("melhorar pelo chat: planeja, escreve, confere os fatos (e corrige o que faltou), junta o progressivo, marca a revisão e guarda o original", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return; // a conferência visual fotografa os slides novos
  await browser.close();
  const { handler, seen } = script();
  const llm = await startMockLLM(handler);
  const home = tmp("sgd-tr-");
  const lib = openLibrary(home);
  const imp = await lib.importOffice(await lessonPptx(), "Aulas", "Hidrologia.pptx");
  const studio = await startStudio(imp.file, { llmUrl: llm.url, library: home });
  try {
    const spec = YAML.parse(fs.readFileSync(imp.file, "utf8"));
    const res = await (await fetch(`${studio.url}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "melhore a aula inteira mantendo o estilo", spec }) })).json();
    assert.match(res.reply, /Revisar › Mudanças/);
    const saved = YAML.parse(fs.readFileSync(imp.file, "utf8"));
    const kinds = saved.slides.map((s) => [s.layout, s.review?.status || "-"]);
    assert.deepEqual(kinds, [["canvas", "-"], ["statement", "alterado"], ["question", "novo"], ["canvas", "alterado"], ["canvas", "-"]], JSON.stringify(kinds));
    assert.match(saved.slides[1].text, /0,385/, "o que faltou foi corrigido");
    assert.equal(seen.fix, 1, "uma rodada de correção pelos fatos");
    assert.ok(seen.vision >= 1, "conferiu o desenho");
    assert.ok(saved.slides[3].elements.some((e) => e.step === 1), "o ciclo se monta por cliques");
    assert.equal(saved.slides[1].review.original, 2);
    assert.equal(saved.slides[4].original.slide, 5, "o slide esquecido pelo plano voltou, mantido");
    assert.ok(saved.master?.elements, "estilo do original no mestre");
    assert.ok(fs.existsSync(path.join(path.dirname(imp.file), "original", "original.yaml")), "o original fica para o Desfazer");
    assert.match(res.reply, /conferir a unidade/, "o alerta do plano chega à pessoa");
    // recriar: nasce uma apresentação nova no tópico
    const again = YAML.parse(fs.readFileSync(path.join(path.dirname(imp.file), "original", "original.yaml"), "utf8"));
    const r2 = await (await fetch(`${studio.url}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "agora recrie do zero", spec: again }) })).json();
    assert.ok(r2.createdDeck?.id, JSON.stringify(r2).slice(0, 300));
    const created = YAML.parse(fs.readFileSync(lib.resolveId(r2.createdDeck.id), "utf8"));
    assert.equal(created.theme, "oceano");
    assert.ok(!created.slides.some((s) => s.review), "recriada não tem marcas de revisão");
    assert.ok(created.slides.some((s) => s.layout === "statement"));
  } finally { await studio.close(); await llm.close(); fs.rmSync(home, { recursive: true, force: true }); }
});

test("chat: transform só para apresentação importada; noutra, a IA é avisada e usa o patch normal", async () => {
  const { editDeck } = await import("../src/ai/deck-ai.js");
  let n = 0;
  const llm = await startMockLLM(() => (n++ === 0 ? '```yaml\ntransform:\n  mode: melhorar\n  pedido: "x"\n```' : "Tudo bem, posso mexer slide a slide. Quer que eu comece pelo título?"));
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const r = await editDeck({ spec: { title: "t", slides: [{ layout: "cover", title: "A" }] }, instruction: "melhore tudo" });
    assert.ok(!r.transform);
    assert.match(llm.requests.at(-1).lastUser, /não veio de um PowerPoint importado/);
  } finally { await llm.close(); }
});

// ---- tarefa blindada: limites, retomada, parar, cache das figuras, omissão pendente, mapa de cobertura
// (a conferência visual fotografa aqui mesmo, num navegador que fica aberto: fecha no fim)
after(async () => { const { closeSnapshots } = await import("../src/studio/snapshot.js"); await closeSnapshots(); });
async function imported() {
  const home = tmp("sgd-tr-");
  const lib = openLibrary(home);
  const imp = await lib.importOffice(await lessonPptx(), "Aulas", "Hidrologia.pptx");
  const dir = path.dirname(imp.file);
  return { home, lib, file: imp.file, dir, spec: { ...YAML.parse(fs.readFileSync(imp.file, "utf8")), _dir: dir } };
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("tarefa: o limite para com resultado parcial (o que não saiu fica como no original); pedir de novo retoma sem replanejar; mapa de cobertura", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler, seen } = script();
  const llm = await startMockLLM(handler);
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const a = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", limits: { calls: 1 } });
    assert.equal(a.report.status, "parcial");
    assert.match(a.report.parou, /Limite de 1 chamadas/);
    assert.deepEqual([seen.plan, seen.write], [1, 0]);
    assert.equal(a.spec.slides[1].layout, "canvas", "o item que não chegou a ser escrito fica como no original");
    assert.equal(a.spec.slides[1].original.slide, 2);
    assert.ok(a.report.pendentes.some((x) => /não chegou a ser escrito/.test(x)));
    assert.equal(jobStatus(d.dir, "melhorar").status, "parcial");
    const b = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar" });
    assert.ok(b.report.retomada);
    assert.equal(seen.plan, 1, "retomou do plano guardado");
    assert.equal(b.report.status, "concluido");
    assert.equal(b.spec.slides[1].layout, "statement");
    assert.ok(b.spec.slides.every((s) => s.uid), "todo slide com identidade");
    // onde foi parar cada trecho do original
    const cov = JSON.parse(fs.readFileSync(path.join(d.dir, "original", "cobertura-melhorar.json"), "utf8"));
    assert.deepEqual(cov.find((c) => c.original === 2 && /Kirpich/.test(c.trecho)).onde, [2]);
    assert.deepEqual(cov.find((c) => c.original === 5 && /TUCCI/.test(c.trecho)).onde, [5]);
    assert.match(fs.readFileSync(path.join(d.dir, "original", "cobertura-melhorar.md"), "utf8"), /## Slide 2 do original/);
    assert.equal(b.report.cobertura.arquivo, "original/cobertura-melhorar.md");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: parar corta a chamada ao modelo na hora; o que ficou pronto fica guardado", async () => {
  const { handler } = script();
  const llm = await startMockLLM(async (req) => {
    if (/Escreva os slides destes itens/.test(req.lastUser)) await new Promise((r) => setTimeout(r, 6000));
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  const ctl = new AbortController();
  try {
    const t0 = Date.now();
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", signal: ctl.signal,
      onProgress: (ev) => { if (ev.phase === "transform-escrever") setTimeout(() => ctl.abort(), 200); } });
    assert.ok(Date.now() - t0 < 4000, `parou em ${Date.now() - t0} ms (a resposta do modelo levaria 6 s)`);
    assert.equal(r.report.status, "parcial");
    assert.match(r.report.parou, /Parado a pedido/);
    const st = jobStatus(d.dir, "melhorar");
    assert.equal(st.status, "parcial");
    assert.ok(st.feitos >= 3, "manter e juntar já ficaram guardados");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: figuras vistas ficam em cache pelo conteúdo da foto; falha da visão não conta como vista", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  let looks = 0, broken = true;
  const llm = await startMockLLM((req) => {
    if (/Fotos de slides/.test(req.lastUser)) { looks++; return broken ? "não consegui" : '```json\n{"slides":[{"n":2,"figuras":[{"arquivo":"","tipo":"gráfico","generica":false,"aparencia":"digital","o_que":"curva","dados":"pico 42"}]}]}\n```'; }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "imagens", "curva.png"), PNG);
    d.spec.slides[1].original.image = "original/foto-2.png";
    d.spec.slides[1].elements.push({ image: "imagens/curva.png", x: 0, y: 0, w: 100, h: 100 });
    const run = () => transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false, limits: { calls: 2 } });
    const a = await run();
    assert.equal(looks, 1);
    assert.ok(a.report.problemas.some((p) => /não consegui ver as figuras/.test(p)));
    broken = false;
    await run();
    assert.equal(looks, 2, "a falha não ficou no cache: olhou de novo");
    await run();
    assert.equal(looks, 2, "a mesma foto não é olhada de novo");
    const plan = llm.requests.filter((r) => /Faça o PLANO/.test(r.lastUser)).at(-1).lastUser;
    assert.match(plan, /ESPECÍFICA\] gráfico: curva — dados: pico 42/, "o que a visão viu vai para o plano");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: faltou algo do original mesmo depois da correção: o original fica e a proposta vem pendente; aceitar e desfazer no Studio", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM((req) => {
    if (/Conferi estes slides/.test(req.lastUser)) {
      const asked = req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : ""));
      return handler({ ...req, lastUser: asked.content }); // "corrige" esquecendo de novo
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  let studio;
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar" });
    assert.equal(r.report.status, "revisar");
    assert.equal(r.report.pendentes.length, 1);
    assert.match(r.report.pendentes[0], /0\.385/);
    const kinds = r.spec.slides.map((s) => [s.layout, s.review?.status || "-"]);
    assert.deepEqual(kinds.slice(0, 4), [["canvas", "-"], ["canvas", "-"], ["statement", "pendente"], ["question", "novo"]], JSON.stringify(kinds));
    const [orig, prop] = [r.spec.slides[1], r.spec.slides[2]];
    assert.deepEqual(prop.review.pair, [orig.uid]);
    // no Studio: aceitar a proposta tira o original do par; desfazer tira a proposta
    fs.writeFileSync(d.file, YAML.stringify({ ...r.spec }));
    studio = await startStudio(d.file, { llmUrl: llm.url, library: d.home });
    const post = async (body) => (await fetch(`${studio.url}/api/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    const acc = await post({ action: "accept", idx: 2 });
    assert.deepEqual(acc.spec.slides.slice(0, 3).map((s) => s.layout), ["canvas", "statement", "question"]);
    assert.ok(!acc.spec.slides[1].review);
    assert.ok(!acc.spec.slides.some((s) => s.uid === orig.uid), "o original do par saiu");
    await fetch(`${studio.url}/api/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: r.spec }) });
    const rej = await post({ action: "reject", idx: 2 });
    assert.deepEqual(rej.spec.slides.slice(0, 3).map((s) => [s.layout, s.review?.status || "-"]), [["canvas", "-"], ["canvas", "-"], ["question", "novo"]]);
    const saved = YAML.parse(fs.readFileSync(d.file, "utf8"));
    assert.equal(saved.slides[1].original.slide, 2, "o deck salvo ficou com o original");
  } finally { await studio?.close(); await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("Studio: Parar a transformação pelo chat; reabrir a página no meio acompanha até o fim e mostra o resultado", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const { handler } = script();
  const llm = await startMockLLM(async (req) => {
    if (/Escreva os slides destes itens/.test(req.lastUser)) await new Promise((r) => setTimeout(r, 3000));
    return handler(req);
  });
  const d = await imported();
  const studio = await startStudio(d.file, { llmUrl: llm.url, library: d.home });
  try {
    const { newPage } = await import("./helpers.js");
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(d.file, "utf8"));
    const lastAI = () => p.evaluate(() => [...document.querySelectorAll("#chat-messages .ai-msg")].pop()?.innerText || "");
    await p.click("#tab-btn-chat");
    await p.fill("#chat-input", "melhore a aula inteira mantendo o estilo");
    await p.click("#chat-send");
    await p.click(".work-stop", { timeout: 20000 });
    await p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 30000 });
    assert.match(await lastAI(), /Parei a pedido/);
    assert.equal(saved().slides[1].layout, "canvas", "parar não mexe no deck");
    // de novo; no meio, a página recarrega (fechou o navegador): o servidor segue e a página reaberta acompanha
    await p.fill("#chat-input", "melhore a aula inteira mantendo o estilo");
    await p.click("#chat-send");
    await p.waitForSelector(".work-stop", { timeout: 20000 });
    await p.reload({ waitUntil: "networkidle" });
    await p.click("#tab-btn-chat").catch(() => {});
    await p.waitForFunction(() => /A transformação terminou/.test(document.querySelector("#chat-messages")?.innerText || ""), null, { timeout: 60000 });
    assert.equal(saved().slides[1].layout, "statement");
    assert.equal(await p.evaluate(() => document.querySelectorAll(".thumb-review").length) > 0, true, "o deck recarregado mostra as marcas");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: erro passageiro do modelo tenta de novo; bloco que não sai não derruba a tarefa, e pedir de novo faz só ele", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  let fail = 1, writes = 0;
  const llm = await startMockLLM((req) => {
    if (/Escreva os slides destes itens/.test(req.lastUser)) { writes++; if (fail-- > 0) return { status: 502, error: "upstream caiu" }; }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const a = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.equal(writes, 2, "tentou de novo uma vez");
    assert.equal(a.report.status, "concluido");
    // agora o modelo falha sempre na escrita: o resto sai, o bloco fica como o original, a tarefa fica parcial
    fail = 99;
    const b = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.equal(b.report.status, "parcial");
    assert.match(b.report.parou, /não saíram/);
    assert.ok(b.report.problemas.some((p) => /itens 2, 3: .*upstream caiu/.test(p)), JSON.stringify(b.report.problemas));
    assert.equal(b.spec.slides[1].original.slide, 2, "o item que não saiu fica como no original");
    assert.ok(b.spec.slides.some((s) => s.original?.merged), "o que é código (juntar) saiu");
    // o modelo voltou: pedir de novo retoma e faz só o que faltou
    fail = 0; writes = 0;
    const c = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar" });
    assert.ok(c.report.retomada);
    assert.equal(c.report.status, "concluido");
    assert.equal(c.spec.slides[1].layout, "statement");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("fatos: sigla respeita acento (MÁXIMA não vira XIMA) e palavra comum com maiúscula não é nome próprio", () => {
  const f = factsOf({ elements: [{ textbox: { paragraphs: [{ runs: [{ t: "VAZÃO MÁXIMA no SAE. Eixos: maiores e menores; ver Maiores, Menores e a represa do Lobo." }] }] } }] });
  assert.ok(!f.terms.has("XIMA") && !f.terms.has("ZÃO"), [...f.terms].join(","));
  assert.ok(f.terms.has("SAE"));
  assert.ok(!f.terms.has("Maiores") && !f.terms.has("Menores"), "aparecem minúsculas no slide: são palavras comuns");
  assert.ok(f.terms.has("Lobo"), "nome de verdade continua");
  // título em caixa alta (dentro da figura: "DELIMITAÇÃO DE ÁREAS ... DRENAGEM URBANA") não é uma fileira de siglas
  const g = factsOf({ elements: [{ textbox: { paragraphs: [{ runs: [{ t: "DELIMITAÇÃO DE ÁREAS DE CONTRIBUIÇÃO EM DRENAGEM URBANA. A BOCA DE LOBO 1 (BL1) e o IDF." }] }] } }] });
  for (const w of ["URBANA", "DRENAGEM", "BOCA", "LOBO", "CONTRIBUIÇÃO"]) assert.ok(!g.terms.has(w), `${w}: ${[...g.terms].join(",")}`);
  assert.ok(g.terms.has("BL1") && g.terms.has("IDF"), "sigla solta continua");
});

test("JSON cortado no meio: os itens completos valem", () => {
  const r = jsonLoose('```json\n{"slides":[{"n":1,"figuras":[{"tipo":"mapa","o_que":"bacia"}]},{"n":2,"figuras":[{"tipo":"gráf');
  assert.equal(r.partial, true);
  assert.deepEqual(r.slides.map((s) => s.n), [1]);
  assert.deepEqual(jsonLoose('{"slides":[{"n":3}]}').slides, [{ n: 3 }]);
  assert.throws(() => jsonLoose("nada aqui"));
});

test("caminho de imagem com erro de digitação: um arquivo parecido só, é ele", () => {
  const dir = tmp("sgd-img-");
  fs.mkdirSync(path.join(dir, "imagens", "original"), { recursive: true });
  fs.writeFileSync(path.join(dir, "imagens", "original", "image16.jpeg"), "x");
  fs.writeFileSync(path.join(dir, "imagens", "original", "image17.png"), "x");
  try {
    assert.equal(nearImage("imagens/orignal/image16.jpeg", dir), "imagens/original/image16.jpeg");
    assert.equal(nearImage("image17.png", dir), "imagens/original/image17.png", "mesmo nome em outra pasta");
    assert.equal(nearImage("imagens/outra/zzz.png", dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("visão com resposta cortada: os slides que ficaram de fora são olhados de novo, um por vez", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const looks = [];
  const llm = await startMockLLM((req) => {
    if (/Fotos de slides/.test(req.lastUser)) {
      const ns = [...req.lastUser.matchAll(/Slide (\d+):/g)].map((m) => +m[1]);
      looks.push(ns);
      const item = (n) => `{"n":${n},"figuras":[{"tipo":"esquema","generica":false,"o_que":"figura ${n}","dados":"d${n}"}]}`;
      return ns.length > 1 ? '```json\n{"slides":[' + item(ns[0]) + ',{"n":' + ns[1] + ',"figu' : '```json\n{"slides":[' + item(ns[0]) + "]}\n```";
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    for (const n of [2, 5]) {
      fs.writeFileSync(path.join(d.dir, "original", `foto-${n}.png`), PNG);
      const s = d.spec.slides[n - 1];
      s.original.image = `original/foto-${n}.png`;
      fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
      fs.writeFileSync(path.join(d.dir, "imagens", `f${n}.png`), PNG);
      s.elements.push({ image: `imagens/f${n}.png`, x: 0, y: 0, w: 100, h: 100 });
    }
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false, limits: { calls: 4 } });
    assert.deepEqual(looks, [[2, 5], [5]], "o lote cortado: o 5 foi de novo, sozinho");
    assert.ok(!r.report.problemas.some((p) => /não consegui ver/.test(p)), JSON.stringify(r.report.problemas));
    const plan = llm.requests.find((q) => /Faça o PLANO/.test(q.lastUser)).lastUser;
    assert.match(plan, /figura 2/); assert.match(plan, /figura 5/);
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("Studio: depois de melhorar no estilo do original, a resposta oferece salvar esse estilo (e salva na biblioteca)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const { handler } = script();
  const llm = await startMockLLM(handler);
  const d = await imported();
  const studio = await startStudio(d.file, { llmUrl: llm.url, library: d.home });
  try {
    const { newPage } = await import("./helpers.js");
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#tab-btn-chat");
    await p.fill("#chat-input", "melhore a aula inteira mantendo o estilo");
    await p.click("#chat-send");
    const btn = p.locator(".chat-save-style");
    await btn.waitFor({ timeout: 60000 });
    p.once("dialog", (dlg) => dlg.accept("Padrão da Aula 1"));
    await btn.click();
    for (let k = 0; k < 40 && !d.lib.listStyles().length; k++) await p.waitForTimeout(100);
    assert.deepEqual(d.lib.listStyles().map((s) => s.name), ["Padrão da Aula 1"]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("slide a mais sem item (origem: extra) entra junto com o item de antes, sem derrubar o bloco", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM((req) => {
    const out = handler(req);
    if (/Escreva os slides destes itens/.test(req.lastUser) || /Conferi estes slides/.test(req.lastUser)) return out.replace(/```\s*$/, '  - layout: statement\n    origem: extra\n    text: "Exercício: calcule o tc de uma bacia de 2 km"\n```');
    return out;
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!r.report.problemas.some((p) => /origem/.test(p)), JSON.stringify(r.report.problemas));
    assert.ok(r.spec.slides.some((s) => /Exercício: calcule/.test(s.text || "")), "o slide a mais entrou");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("recriar: o original que fica no deck novo (pendente ou que não saiu) vem sem a moldura antiga; o melhorar mantém", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM(handler);
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    // moldura antiga no slide 2 (como o professor copiou slide a slide)
    d.spec.slides[1].elements.push({ drawing: '<svg viewBox="0 0 10 1"><rect width="10" height="1" fill="#4472C4"/></svg>', x: 0, y: 1000, w: 1920, h: 80, deco: true });
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false, limits: { calls: 1 } }); // o item 2 não chega a ser escrito
    const back = r.spec.slides.find((s) => s.original?.slide === 2);
    assert.ok(back && back.elements.length && !back.elements.some((e) => e.deco), "sem a moldura, com o conteúdo");
    const m = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false, limits: { calls: 1 } });
    assert.ok(m.spec.slides.find((s) => s.original?.slide === 2).elements.some((e) => e.deco), "no melhorar a moldura fica (é o estilo)");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("correção que volta só com o item corrigido: vale; os outros itens do bloco ficam como estavam", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler, seen } = script();
  const llm = await startMockLLM((req) => {
    if (/Conferi estes slides/.test(req.lastUser)) { seen.fix++; return '```yaml\nslides:\n  - layout: statement\n    origem: 2\n    text: "Kirpich: bacias menores que 0,5 km²; coeficiente 57, expoente 0,385."\n```'; } // só o item 2
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!r.report.problemas.some((p) => /correção/.test(p)), JSON.stringify(r.report.problemas));
    assert.match(r.spec.slides[1].text, /0,385/, "a correção entrou");
    assert.ok(r.spec.slides.some((s) => s.layout === "question"), "o item que não voltou na correção ficou como estava");
    assert.equal(r.report.status, "concluido");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

// Rodada 02/10: 4 lotes perderam a correção porque o YAML veio quebrado (e desistia), e 4 ficaram sem a conferência
// visual porque a visão não devolveu JSON nem na 2ª vez; erros de digitação ("Ajute") ficaram no deck.
// Rodada com redesenho (02/10): 3 correções "falharam" porque o modelo respondeu sem bloco nenhum (nada a corrigir) e
// um lote de 5 perdeu 4 itens porque a resposta parava no meio. A resposta que não serve fica guardada em falhas/.
test("lote que escreve só parte dos itens: os que faltaram vão de novo, um por vez; correção sem bloco fica como está", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const writes = [];
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/Conferi estes slides/.test(u)) return "Conferi de novo: os slides já estão certos, não há o que corrigir.";
    if (/Escreva os slides destes itens|Não deu para usar/.test(u)) {
      const asked = /Escreva os slides/.test(u) ? u : req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : "")).content;
      const items = [...asked.matchAll(/## ITEM (\d+)/g)].map((m) => +m[1]);
      writes.push(items);
      const out = handler({ ...req, lastUser: asked });
      // com mais de um item, só sai o primeiro (a resposta "parou no meio")
      return items.length > 1 ? out.split(/\n(?=  - layout:)/).slice(0, 2).join("\n").replace(/\s*$/, "\n```") : out;
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!r.report.problemas.some((p) => /não saíram|correção/.test(p)), JSON.stringify(r.report.problemas));
    const singles = writes.filter((w) => w.length === 1).map((w) => w[0]);
    assert.ok(singles.length >= 2, `itens refeitos sozinhos: ${JSON.stringify(writes)}`);
    assert.ok(r.spec.slides.some((s) => s.layout === "question"), "o item que faltou no lote saiu sozinho");
    const falhas = fs.readdirSync(path.join(d.dir, ".sagadeck", "transform", "falhas"));
    assert.ok(falhas.some((f) => /escrita-/.test(f)), "a resposta incompleta ficou guardada");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("correção com YAML quebrado tenta de novo com o erro; a visão confere um slide por vez e a resposta sem JSON vai de novo; grafia vai como dica", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const looks = [], fixes = [];
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/Confira slides NOVOS/.test(u)) {
      const n = (u.match(/NOVO \d+ \(do item/g) || []).length;
      looks.push(n);
      return looks.length === 1 ? "Vou olhar slide por slide, com calma..." : '```json\n{"ok":true,"problemas":[]}\n```';
    }
    if (/Escreva os slides destes itens/.test(u)) return handler(req).replace("coeficiente 57", "coeficinte 57");
    if (/Conferi estes slides|Não deu para usar/.test(u)) {
      fixes.push(u);
      if (fixes.length === 1) return "```yaml\nslides:\n  - layout: statement\n      origem: 2\n    text: quebrado\n```";
      const asked = req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : ""));
      return handler({ ...req, lastUser: asked.content }).replace(/0,5 km²; coeficiente 57\./, "0,5 km²; coeficiente 57, expoente 0,385.");
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!r.report.problemas.some((p) => /correção|conferência visual/.test(p)), JSON.stringify(r.report.problemas));
    assert.match(fixes[0], /"coeficinte" \(no original: "coeficiente"\)/, "a grafia vai como dica na correção");
    assert.match(fixes[1], /Não deu para usar/, "o YAML quebrado volta com o erro");
    assert.match(r.spec.slides.find((s) => /Kirpich/.test(s.text || "")).text, /0,385/, "a correção entrou na 2ª tentativa");
    // um slide novo por chamada (com o lote inteiro numa chamada, o modelo pensava até estourar e não respondia)
    assert.ok(looks.length >= 2 && looks.every((n) => n === 1), `fotos por conferência: ${looks.join(", ")}`);
    assert.ok(llm.requests.some((q) => /Confira slides NOVOS/.test(q.lastUser) && /SÓ o bloco JSON/.test(q.lastUser)), "a resposta sem JSON foi pedida de novo");
    assert.ok(fs.readdirSync(path.join(d.dir, ".sagadeck", "transform", "falhas")).some((f) => /conferencia-/.test(f)), "a resposta sem JSON ficou guardada");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

// A pessoa: figura de xerox de apostila velha tem de voltar como ilustração bem feita (o modelo de imagem redesenha a
// partir dela), não ficar feia nem virar diagrama. A visão diz a qualidade; o escritor pede image_prompt + image_ref;
// o lote gera antes de conferir; a imagem gerada fica em imagens/ia.
test("figura ESCANEADA do original (xerox) é redesenhada pelo modelo de imagem com ela como base, antes da conferência", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const gen = [];
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/^Generate an image/.test(u)) { gen.push(req); return { image: `data:image/png;base64,${PNG.toString("base64")}` }; }
    if (/Fotos de slides/.test(u)) return '```json\n{"slides":[{"n":2,"figuras":[{"tipo":"mapa","generica":false,"aparencia":"escaneada","o_que":"mapa da bacia escaneado","dados":"rio, exutório"}]}]}\n```';
    if (/Escreva os slides destes itens|Conferi estes slides/.test(u)) {
      const out = handler(req);
      return out.replace(/  - layout: statement\n    origem: 2\n    mudou: "virou uma frase de destaque"\n    text: ("[^"]*")/, (_, txt) =>
        `  - layout: split\n    origem: 2\n    title: Kirpich\n    body: ${txt.replace(/\.?"$/, ', expoente 0,385."')}\n    figure:\n      image_prompt: "Clean up and redraw THIS EXACT figure: the basin map with the river"\n      image_ref: imagens/f2.png\n      fit: contain`);
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
    fs.writeFileSync(path.join(d.dir, "imagens", "f2.png"), PNG);
    d.spec.slides[1].original.image = "original/foto-2.png";
    d.spec.slides[1].elements.push({ image: "imagens/f2.png", x: 0, y: 0, w: 100, h: 100 });
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
    const write = llm.requests.find((q) => /Escreva os slides destes itens/.test(q.lastUser) && /ITEM 2/.test(q.lastUser)).lastUser;
    assert.match(write, /ESPECÍFICA, imagem ESCANEADA\] mapa/, "o escritor sabe que a figura é de xerox");
    assert.match(llm.requests.find((q) => /Escreva os slides destes itens/.test(q.lastUser)).system, /ILUSTRAÇÃO[^\n]*genérica ou específica[^\n]*não vire diagrama de caixas/, "ilustração volta como ilustração");
    assert.equal(gen.length, 1, "um redesenho");
    assert.ok(gen[0].hasImages, "a figura original foi junto, como base");
    const fig = r.spec.slides.find((s) => s.layout === "split")?.figure;
    assert.match(fig?.image || "", /^imagens\/ia\/ia-[0-9a-f]{8}\.png$/, JSON.stringify(fig));
    assert.ok(fs.existsSync(path.join(d.dir, fig.image)));
    assert.equal(fig.image_prompt, undefined); assert.equal(fig.image_ref, undefined);
    const shot = llm.requests.find((q) => /Confira slides NOVOS/.test(q.lastUser) && /do item 2/.test(q.lastUser));
    assert.ok(shot, "a conferência olhou o slide já com o redesenho");
    assert.ok(llm.requests.indexOf(gen[0]) < llm.requests.indexOf(shot), "gerou antes de conferir");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("gráfico, tabela ou equação escaneados NÃO vão para o modelo de imagem (saíam com número trocado e a fórmula como foto): fica o original", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const gen = [];
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/^Generate an image/.test(u)) { gen.push(req); return { image: `data:image/png;base64,${PNG.toString("base64")}` }; }
    if (/Fotos de slides/.test(u)) return '```json\n{"slides":[{"n":2,"figuras":[{"tipo":"gráfico","generica":false,"aparencia":"escaneada","o_que":"hidrograma escaneado","dados":"picos 2303, 2291"}]}]}\n```';
    if (/Escreva os slides destes itens|Conferi estes slides/.test(u)) {
      const out = handler(req);
      return out.replace(/  - layout: statement\n    origem: 2\n    mudou: "virou uma frase de destaque"\n    text: ("[^"]*")/, (_, txt) =>
        `  - layout: split\n    origem: 2\n    title: Kirpich\n    body: ${txt.replace(/\.?"$/, ', expoente 0,385."')}\n    figure:\n      image_prompt: "Clean up and redraw THIS EXACT figure: the basin map with the river"\n      image_ref: imagens/f2.png\n      fit: contain`);
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
    fs.writeFileSync(path.join(d.dir, "imagens", "f2.png"), PNG);
    d.spec.slides[1].original.image = "original/foto-2.png";
    d.spec.slides[1].elements.push({ image: "imagens/f2.png", x: 0, y: 0, w: 100, h: 100 });
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
    assert.equal(gen.length, 0, "o modelo de imagem não foi chamado");
    const fig = r.spec.slides.find((s) => s.layout === "split")?.figure;
    assert.equal(fig?.image, "imagens/f2.png", "ficou a figura original (a IA deve refazer com chart)");
    assert.equal(fig.image_prompt, undefined);
    assert.ok(r.report.problemas.some((p) => /redesenho recusado/.test(p)), JSON.stringify(r.report.problemas));
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("redesenho que não sai: a figura de base volta (não vira ícone)", async () => {
  const { materializeImages } = await import("../src/ai/deck-ai.js");
  const llm = await startMockLLM(() => "não consigo gerar agora");
  process.env.SAGADECK_LLM_URL = llm.url;
  const dir = tmp("sgd-ref-");
  try {
    fs.mkdirSync(path.join(dir, "imagens"));
    fs.writeFileSync(path.join(dir, "imagens", "mapa.png"), PNG);
    const spec = { slides: [{ layout: "split", title: "Mapa", figure: { image_prompt: "redraw this map", image_ref: "imagens/mapa.png", fit: "contain" } }] };
    const r = await materializeImages(spec, { baseDir: dir });
    assert.equal(r.failed.length, 1);
    assert.deepEqual(spec.slides[0].figure, { image: "imagens/mapa.png", fit: "contain" });
  } finally { await llm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("grafia: palavra do original com uma letra a menos (no meio) ou sem acento; plural e o novo acentuado não contam", () => {
  const orig = [{ elements: [{ textbox: { paragraphs: [{ runs: [{ t: "AJUSTE DE DISTRIBUIÇÃO; Método; Referências; período; chuvas; barras" }] }] } }] }];
  const v = vocabularyOf(orig);
  assert.deepEqual(typosOf([{ title: "Ajute de Distribuião", text: "Méodo, Refrências, Periodo, arras, chuva, $Ajute$" }], v),
    ['"Ajute" (no original: "AJUSTE")', '"Distribuião" (no original: "DISTRIBUIÇÃO")', '"Méodo" (no original: "Método")', '"Refrências" (no original: "Referências")', '"Periodo" (no original: "período")', '"arras" (no original: "barras")']);
  assert.deepEqual(typosOf([{ text: "Período e método, as chuvas" }], v), []);
});

// O que a visão leu numa figura (eixos, coordenadas) é aproximado e, numa figura redesenhada, nem precisa estar no
// texto: nunca vira pendência (o original ao lado da proposta, a "duplicata" que o professor reclamou). Sem a figura,
// vai como DICA na correção; a imagem do original também não é cobrada (a IA decide se redesenha ou mantém).
test("números lidos numa figura (eixos) não ficam pendentes; sem a figura, vão como dica na correção; a imagem não é cobrada", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  let keep = true;
  const llm = await startMockLLM((req) => {
    if (/Fotos de slides/.test(req.lastUser)) return '```json\n{"slides":[{"n":2,"figuras":[{"tipo":"gráfico","generica":false,"o_que":"curva","dados":"eixo x: 200, 300, 400, 500"}]}]}\n```';
    const out = handler(req);
    if (keep && /Escreva os slides destes itens|Conferi estes slides/.test(req.lastUser)) {
      return out.replace(/  - layout: statement\n    origem: 2\n    mudou: [^\n]*\n    text: [^\n]*/, '  - layout: split\n    origem: 2\n    title: "Kirpich"\n    body: "Kirpich: bacias menores que 0,5 km²; coeficiente 57, expoente 0,385."\n    figure: { image: imagens/f2.png }');
    }
    return out;
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "imagens", "f2.png"), PNG);
    d.spec.slides[1].original.image = "original/foto-2.png";
    d.spec.slides[1].elements.push({ image: "imagens/f2.png", x: 0, y: 0, w: 100, h: 100 });
    const a = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!a.report.pendentes.some((p) => /\b200\b/.test(p)), `figura mantida: ${JSON.stringify(a.report.pendentes)}`);
    keep = false;
    const b = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!b.report.pendentes.some((p) => /\b200\b|imagens\/f2\.png/.test(p)), `figura tirada: nem os números do eixo nem a imagem viram pendência (${JSON.stringify(b.report.pendentes)})`);
    const fix = llm.requests.filter((r) => /Conferi estes slides/.test(r.lastUser)).at(-1)?.lastUser || "";
    assert.match(fix, /Dicas \(não são erro\):[\s\S]*a figura do original mostrava os números 200, 300, 400, 500/, "vão como dica na correção");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("primeiro slide do bloco sem origem: é do primeiro item (a IA escreve na ordem)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM((req) => {
    const out = handler(req);
    return /Escreva os slides destes itens|Conferi estes slides/.test(req.lastUser) ? out.replace("    origem: 2\n", "") : out;
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(!r.report.problemas.some((p) => /origem/.test(p)), JSON.stringify(r.report.problemas));
    assert.equal(r.spec.slides[1].layout, "statement");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("Studio: abrir outra apresentação durante a transformação não leva o resultado para o deck errado", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM(async (req) => {
    if (/Escreva os slides destes itens/.test(req.lastUser)) await new Promise((r) => setTimeout(r, 2500));
    return handler(req);
  });
  const d = await imported();
  const outro = d.lib.resolveId(d.lib.createDeck("Aulas", { title: "Outra aula", slides: [{ layout: "statement", text: "Não mexa aqui" }] }));
  const studio = await startStudio(d.file, { llmUrl: llm.url, library: d.home });
  try {
    const post = (url, body) => fetch(`${studio.url}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const pedido = post("/api/ai/chat", { message: "melhore a aula inteira mantendo o estilo", spec: d.spec }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 1200));
    await post("/api/library/open", { id: d.lib.idOf(outro) }); // a pessoa foi para outra apresentação
    const res = await pedido;
    assert.match(res.reply, /outra apresentação/);
    const melhorada = YAML.parse(fs.readFileSync(d.file, "utf8"));
    assert.ok(melhorada.slides.some((s) => s.layout === "statement" && s.review), "o resultado foi para o deck da tarefa");
    assert.deepEqual(YAML.parse(fs.readFileSync(outro, "utf8")).slides.map((s) => s.text), ["Não mexa aqui"], "o outro ficou como estava");
  } finally { await studio.close(); await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

// plano com muitos itens novos (3 blocos de 5) e um par de itens irmãos (do mesmo slide original) em blocos diferentes
function bigPlan({ fiscal = false } = {}) {
  const inflight = { now: 0, max: 0 }, fixes = [];
  const items = [{ acao: "manter", de: [1], ideia: "capa" }, { acao: "escrever", de: [2], ideia: "Kirpich, a regra" },
    ...Array.from({ length: 9 }, (_, j) => ({ acao: "novo", de: [], ideia: `pergunta ${j + 1}` })),
    { acao: "escrever", de: [2], ideia: "Kirpich, os números" }, { acao: "manter", de: [3] }, { acao: "manter", de: [4] }, { acao: "manter", de: [5] }];
  const write = (text) => {
    const ks = [...text.matchAll(/## ITEM (\d+)/g)].map((m) => +m[1]);
    const out = ["```yaml", "slides:"];
    for (const k of ks) {
      if (k === 2) out.push("  - layout: statement", "    origem: 2", '    text: "Kirpich vale para bacias menores que 0,5 km²."');
      else if (k === 12) out.push("  - layout: statement", "    origem: 12", '    text: "Coeficiente 57 e expoente 0,385."');
      else if (fiscal && k === 3) out.push("  - layout: canvas", "    origem: 3", "    elements:", '      - { text: "Fora do slide", x: 2300, y: 300, w: 500 }');
      else out.push("  - layout: statement", `    origem: ${k}`, `    text: "Pergunta ${k}?"`);
    }
    return [...out, "```"].join("\n");
  };
  const handler = async (req) => {
    const u = req.lastUser;
    if (/Confira slides NOVOS/.test(u)) return '```json\n{"slides":[]}\n```';
    if (/Fotos de slides/.test(u)) return '```json\n{"slides":[]}\n```';
    if (/Faça o PLANO/.test(u)) return "```json\n" + JSON.stringify({ titulo: "Hidrologia", slides: items }) + "\n```";
    if (/Conferi estes slides/.test(u)) {
      fixes.push(u);
      const asked = req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : ""));
      return write(asked.content).replace(/x: 2300/, "x: 300");
    }
    if (/Escreva os slides destes itens/.test(u)) {
      inflight.now++; inflight.max = Math.max(inflight.max, inflight.now);
      await new Promise((r) => setTimeout(r, 400));
      inflight.now--;
      return write(u);
    }
    return "ok";
  };
  return { handler, inflight, fixes };
}

test("tarefa: blocos em paralelo; o fato que um item irmão de outro bloco levou não deixa o primeiro pendente", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler, inflight } = bigPlan();
  const llm = await startMockLLM(handler);
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    assert.ok(inflight.max >= 2, `os blocos rodaram ao mesmo tempo (no máximo ${inflight.max})`);
    assert.deepEqual(r.report.pendentes, [], "o 0,385 e o 57 estão no item 12, irmão do 2");
    assert.ok(r.spec.slides.some((s) => /expoente 0,385/.test(s.text || "")));
    assert.equal(r.spec.slides.filter((s) => /^Pergunta \d+\?$/.test(s.text || "")).length, 9, "todos os itens novos saíram, na ordem do plano");
    assert.deepEqual(r.spec.slides.filter((s) => /^Pergunta/.test(s.text || "")).map((s) => s.text), Array.from({ length: 9 }, (_, j) => `Pergunta ${j + 3}?`));
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: a conferência usa o fiscal de layout (medido no navegador): o que sai do slide volta para a IA corrigir", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler, fixes } = bigPlan({ fiscal: true });
  const llm = await startMockLLM(handler);
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false });
    const asked = fixes.find((u) => /medido:/.test(u));
    assert.ok(asked, "o fiscal mandou corrigir");
    assert.match(asked, /item 3\), medido: sai do slide: "Fora do slide"/);
    const fixed = r.spec.slides.find((s) => s.layout === "canvas" && s.elements?.some((e) => e.text === "Fora do slide"));
    assert.equal(fixed.elements[0].x, 300, "a correção voltou para dentro do slide");
    assert.ok(!r.report.revisar.some((x) => /sai do slide/.test(x)), "corrigido, não fica para revisar");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("tarefa: as figuras do original são olhadas em lotes paralelos", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const inflight = { now: 0, max: 0 };
  const llm = await startMockLLM(async (req) => {
    if (/Fotos de slides/.test(req.lastUser)) {
      inflight.now++; inflight.max = Math.max(inflight.max, inflight.now);
      await new Promise((r) => setTimeout(r, 400));
      inflight.now--;
      const ns = [...req.lastUser.matchAll(/Slide (\d+):/g)].map((m) => +m[1]);
      return "```json\n" + JSON.stringify({ slides: ns.map((n) => ({ n, figuras: [{ tipo: "gráfico", generica: false, o_que: `curva ${n}` }] })) }) + "\n```";
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto.png"), PNG);
    // 12 slides com figura de conteúdo: 3 lotes de 4
    const base = d.spec.slides[1];
    d.spec.slides = Array.from({ length: 12 }, (_, j) => {
      fs.writeFileSync(path.join(d.dir, "imagens", `curva-${j + 1}.png`), PNG);
      return { ...structuredClone(base), original: { ...base.original, slide: j + 1, image: "original/foto.png" }, elements: [...base.elements, { image: `imagens/curva-${j + 1}.png`, x: 0, y: 0, w: 100, h: 100 }] };
    });
    await transformDeck({ spec: d.spec, dir: d.dir, mode: "melhorar", resume: false, limits: { calls: 4 } });
    assert.ok(inflight.max >= 2, `os lotes de figuras rodaram ao mesmo tempo (no máximo ${inflight.max})`);
    const cache = JSON.parse(fs.readFileSync(path.join(d.dir, ".sagadeck", "transform", "figuras.json"), "utf8"));
    assert.ok(Object.keys(cache).length >= 1, "o que foi visto ficou no cache");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("recriar: a paleta e o propósito que o plano escolheu pelo pedido valem no deck novo (antes: sem paleta e sempre palestra)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const run = async (extra) => {
    const llm = await startMockLLM((req) => {
      if (/Faça o PLANO/.test(req.lastUser)) {
        const plan = JSON.parse(handler(req).replace(/^```json\n|\n```$/g, ""));
        return "```json\n" + JSON.stringify({ ...plan, ...extra }) + "\n```";
      }
      return handler(req);
    });
    process.env.SAGADECK_LLM_URL = llm.url;
    const d = await imported();
    try {
      const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
      const writer = llm.requests.find((q) => /Escreva os slides destes itens/.test(q.lastUser));
      return { spec: r.spec, system: writer.messages.find((m) => m.role === "system").content, plan: llm.requests.find((q) => /Faça o PLANO/.test(q.lastUser)).lastUser };
    } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
  };
  const a = await run({ tema: "manual", paleta: "mar", proposito: "consulta" });
  assert.match(a.plan, /"paleta":/, "o plano pergunta a paleta");
  assert.match(a.plan, /"proposito":/, "e o propósito");
  assert.equal(a.spec.theme, "manual");
  assert.equal(a.spec.palette, "mar");
  assert.equal(a.spec.purpose, "consulta");
  assert.match(a.system, /material para ESTUDAR depois \(consulta\)/, "quem escreve recebe a regra da consulta");
  assert.match(a.system, /REDESENHE bonito[\s\S]*NUNCA as duas/, "critério de designer para as figuras: reconstruir quando dá, nunca a imagem e a transcrição juntas");
  assert.match(a.system, /O tema e a paleta: os que o pedido disser[\s\S]*sem nada no pedido, o que você achar melhor/, "recriar: o tema segue o pedido; sem pedido, a IA escolhe");
  assert.doesNotMatch(a.system, /É para APRESENTAR \(palestra\)/);
  // rodada 4 da escalafobética: "sóbrio, sem neon" virou a paleta grafite, que deixou o relevo (escuro, de ficção
  // científica) claro e os destaques em tarja cinza; e as quebras de linha da caixa do PowerPoint picavam as frases
  assert.match(a.system, /tema com fundo e identidade próprios[^\n]*paleta só se o pedido falar de cores/i, "paleta não desmancha o tema");
  assert.match(a.system, /quebra de linha do original no meio da frase[^\n]*junte/i, "frase picada pelo PowerPoint é juntada");
  const b = await run({ paleta: "nao-existe" });
  assert.equal(b.spec.palette, undefined, "paleta que não existe fica no padrão do tema");
  assert.equal(b.spec.purpose, "palestra", "sem pedido de consulta: palestra");
  assert.match(b.system, /É para APRESENTAR \(palestra\)/);
  // regras que vieram do retorno sobre a recriada: ciclo no infográfico; exercício novo prefere os dados do material
  // (sem obrigar "dados fictícios": criar dados e exemplos continua livre); nada de tema imposto
  assert.match(a.system, /shape: ciclo[\s\S]*nunca `?diagram/, "ciclo vai para o infográfico ciclo");
  assert.match(a.system, /Exercício novo: quando o material já tem os dados[\s\S]*prefira usá-los/);
  assert.doesNotMatch(a.system, /escrito no enunciado|fuja deles|MARCANTE/, "nada de rótulo obrigatório nem tema imposto");
});

test("imagem do original que a visão viu como gráfico (não foto) sai inteira (fit: contain), mesmo se a IA pediu cover ou nada", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  let kind = "gráfico";
  const llm = await startMockLLM((req) => {
    if (/Fotos de slides/.test(req.lastUser)) return "```json\n" + JSON.stringify({ slides: [{ n: 2, figuras: [{ tipo: kind, generica: false, o_que: "curva IDF" }] }] }) + "\n```";
    const out = handler(req);
    if (/Escreva os slides destes itens|Conferi estes slides/.test(req.lastUser)) {
      return out.replace(/  - layout: statement\n    origem: 2\n    mudou: [^\n]*\n    text: [^\n]*/, '  - layout: image\n    origem: 2\n    caption: "Curva IDF – São Carlos. Kirpich: bacias menores que 0,5 km²; coeficiente 57, expoente 0,385."\n    figure: { image: imagens/f2.png }');
    }
    return out;
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
    fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(d.dir, "imagens", "f2.png"), PNG);
    d.spec.slides[1].original.image = "original/foto-2.png";
    d.spec.slides[1].elements.push({ image: "imagens/f2.png", x: 0, y: 0, w: 100, h: 100 });
    const a = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
    const slide = a.spec.slides.find((s) => s.layout === "image");
    assert.equal(slide.figure.fit, "contain", "gráfico: inteiro (e a legenda do layout image vai embaixo)");
    kind = "foto";
    fs.rmSync(path.join(d.dir, ".sagadeck", "transform"), { recursive: true, force: true });
    const b = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
    assert.equal(b.spec.slides.find((s) => s.layout === "image").figure.fit, undefined, "foto: fica como a IA pediu");
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

test("recriar: progressivos são redesenhados (juntar vira escrever); faltou algo: a proposta fica marcada e o original NÃO volta ao lado", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { handler } = script();
  const llm = await startMockLLM((req) => {
    if (/Conferi estes slides/.test(req.lastUser)) {
      const asked = req.messages.find((m) => m.role === "user" && /Escreva os slides destes itens/.test(typeof m.content === "string" ? m.content : ""));
      return handler({ ...req, lastUser: asked.content }); // "corrige" esquecendo o 0,385 de novo
    }
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  try {
    const r = await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false });
    assert.equal(r.plan.slides.find((it) => (it.de || []).includes(3)).acao, "escrever", "o ciclo (slides 3 e 4) é redesenhado, não juntado com os desenhos velhos");
    const canvas = r.spec.slides.filter((s) => s.layout === "canvas");
    assert.deepEqual(canvas.map((s) => s.original?.slide), [], `nenhum original volta ao deck novo (${JSON.stringify(canvas.map((s) => s.original?.slide))})`);
    const kir = r.spec.slides.find((s) => /Kirpich/.test(s.text || ""));
    assert.equal(kir.review?.status, "revisar");
    assert.match(kir.review.note, /Faltou do original \(slide 2\): .*0\.385/);
    assert.deepEqual(r.report.pendentes, [], "não fica pendente com o original ao lado");
    const writer = llm.requests.find((q) => /Escreva os slides destes itens/.test(q.lastUser)).messages.find((m) => m.role === "system").content;
    assert.match(writer, /Confira a ortografia/);
    assert.match(writer, /um ícone sozinho só quando não houver nada melhor/);
    const vision = llm.requests.find((q) => /Confira slides NOVOS/.test(q.lastUser))?.lastUser || "";
    assert.match(vision, /erro de digitação ou de ortografia/);
  } finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
});

// Retorno da versão escalafobética (02/10): a visão descrevia o slide e não cada arquivo (a fórmula P = m/(N+1) foi
// parar no lugar do hidrograma); o xerox ficou xerox; a equação ficou imagem; o foco guiado tinha caixas chutadas.
async function figureRound(fig, writeSlide, { locate, check, limits } = {}) {
  const { handler } = script();
  const reqs = { gen: [], fix: [], look: [], locate: [], check: [] };
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/^Generate an image/.test(u)) { reqs.gen.push(req); return { image: `data:image/png;base64,${PNG.toString("base64")}` }; }
    if (/Fotos de slides/.test(u)) { reqs.look.push(req); return '```json\n{"slides":[{"n":2,"figuras":[' + JSON.stringify(fig) + ']}]}\n```'; }
    if (/localize cada item abaixo/.test(u)) { reqs.locate.push(req); return locate || '{"itens": []}'; }
    if (check && /Confira slides NOVOS/.test(u)) { reqs.check.push(req); return reqs.check.length === 1 ? check : '{"problemas": []}'; }
    if (/Conferi estes slides/.test(u)) { reqs.fix.push(u); }
    if (/Escreva os slides destes itens|Conferi estes slides/.test(u)) return handler(req).replace(/  - layout: statement\n    origem: 2\n[\s\S]*?(?=\n  - layout|\n```)/, writeSlide);
    return handler(req);
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const d = await imported();
  fs.mkdirSync(path.join(d.dir, "original"), { recursive: true });
  fs.mkdirSync(path.join(d.dir, "imagens"), { recursive: true });
  fs.writeFileSync(path.join(d.dir, "original", "foto-2.png"), PNG);
  for (const f of ["f2.png", "f3.png"]) fs.writeFileSync(path.join(d.dir, "imagens", f), PNG);
  d.spec.slides[1].original.image = "original/foto-2.png";
  d.spec.slides[1].elements.push({ image: "imagens/f2.png", x: 0, y: 0, w: 100, h: 100 }, { image: "imagens/f3.png", x: 200, y: 0, w: 100, h: 100 });
  try { return { r: await transformDeck({ spec: d.spec, dir: d.dir, mode: "recriar", resume: false, limits }), reqs, requests: llm.requests }; }
  finally { await llm.close(); fs.rmSync(d.home, { recursive: true, force: true }); }
}
const kirpich = '    title: Kirpich\n    body: "Kirpich: bacias menores que 0,5 km²; coeficiente 57, expoente 0,385."';

test("a visão vê cada arquivo do slide separado e diz qual figura é qual; ilustração de xerox que a escritora deixou vira redesenho", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { r, reqs } = await figureRound({ arquivo: "imagens/f2.png", tipo: "mapa", generica: false, aparencia: "escaneada", o_que: "mapa do trecho do rio com o posto", dados: "POSTO, ARTEMIS" },
    `  - layout: split\n    origem: 2\n${kirpich}\n    figure:\n      image: imagens/f2.png`);
  const look = reqs.look[0].lastUser;
  assert.match(look, /Arquivo imagens\/f2\.png/); assert.match(look, /Arquivo imagens\/f3\.png/);
  assert.equal(reqs.gen.length, 1, "o redesenho foi pedido pelo código");
  assert.ok(reqs.gen[0].hasImages, "com a figura de xerox como base");
  assert.match(reqs.gen[0].lastUser, /mapa do trecho do rio com o posto[\s\S]*POSTO, ARTEMIS/);
  assert.match(r.spec.slides.find((s) => s.layout === "split").figure.image, /^imagens\/ia\//);
  // print de tela (janela do leitor de PDF, barra de ferramentas): o redesenho é só da figura, sem a moldura
  assert.match(reqs.gen[0].lastUser, /screenshot[^.]*leave (them|it) out/i);
  // o texto alternativo diz o que a figura mostra, não o pedido ao modelo de imagem
  assert.equal(r.spec.slides.find((s) => s.layout === "split").figure.alt, "mapa do trecho do rio com o posto");
});

test("imagem do original que é uma equação num slide novo: volta para a correção pedir a fórmula em LaTeX", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { reqs } = await figureRound({ arquivo: "imagens/f2.png", tipo: "equação em imagem", generica: false, aparencia: "digital", o_que: "fórmula", dados: "P = m/(N+1)" },
    `  - layout: split\n    origem: 2\n${kirpich}\n    figure:\n      image: imagens/f2.png`);
  assert.ok(reqs.fix.some((u) => /imagens\/f2\.png é uma EQUAÇÃO \(P = m\/\(N\+1\)\)[^\n]*LaTeX/.test(u)), "a correção recebeu o pedido");
  assert.equal(reqs.gen.length, 0, "equação não vai para o modelo de imagem");
});

// A conferência visual (a autocrítica): um slide por chamada, sem raciocínio (pensando, o modelo estourava o limite e
// não respondia), e o problema apontado vale mesmo que o modelo diga "ok": true junto (o achado se perdia)
test("conferência visual: um slide por vez, sem raciocínio; o problema apontado vai para a correção mesmo com ok: true", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { reqs } = await figureRound({ arquivo: "imagens/f2.png", tipo: "esquema", generica: false, aparencia: "digital", o_que: "delimitação", dados: "" },
    `  - layout: split\n    origem: 2\n${kirpich}\n    figure:\n      image: imagens/f2.png`, { check: '{"ok": true, "problemas": ["título repetido: Kirpich aparece duas vezes"]}' });
  assert.ok(reqs.check.length >= 1);
  assert.ok(reqs.check.every((q) => q.body.reasoning?.enabled === false), "sem raciocínio");
  assert.ok(reqs.check.every((q) => (q.lastUser.match(/NOVO \d+ \(do item/g) || []).length === 1), "um slide novo por chamada");
  assert.ok(reqs.fix.some((u) => /título repetido: Kirpich aparece duas vezes/.test(u)), "o achado chegou à correção");
});

// Rodada 3 da escalafobética parou no "Limite de 300 chamadas": a conferência por slide multiplicou as chamadas,
// que são curtas (sem raciocínio, ~1 mil tokens). O limite de chamadas é das que escrevem e pensam; as de olhar têm
// um limite próprio, bem maior.
test("limite de chamadas: as de olhar (conferência, localização) não gastam o limite das que escrevem", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const fig = { arquivo: "imagens/f2.png", tipo: "esquema", generica: false, aparencia: "digital", o_que: "delimitação", dados: "" };
  const slide = `  - layout: spotlight\n    origem: 2\n    title: "Kirpich: 0,385 e 57"\n    figure:\n      image: imagens/f2.png\n    hotspots:\n      - { x: 52, y: 58, width: 22, height: 16, title: Exutório, text: A única saída }`;
  const first = await figureRound(fig, slide, { check: '{"problemas": ["título repetido"]}' });
  const thinking = first.requests.filter((q) => !q.body.reasoning).length;
  assert.ok(first.requests.length > thinking, "houve chamadas de olhar");
  const again = await figureRound(fig, slide, { check: '{"problemas": ["título repetido"]}', limits: { calls: thinking } });
  assert.ok(!/Limite/.test(again.r.report.parou || ""), again.r.report.parou);
});

test("foco guiado (spotlight): a visão olha a figura e põe cada destaque no lugar; o que ela não acha fica como estava", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { r, reqs } = await figureRound({ arquivo: "imagens/f2.png", tipo: "esquema", generica: false, aparencia: "digital", o_que: "delimitação", dados: "" },
    `  - layout: spotlight\n    origem: 2\n    title: "Kirpich: 0,385 e 57"\n    caption: "bacias menores que 0,5 km²"\n    figure:\n      image: imagens/f2.png\n    hotspots:\n      - { x: 52, y: 58, width: 22, height: 16, title: Exutório, text: A única saída }\n      - { x: 10, y: 10, width: 20, height: 20, title: Legenda }`,
    { locate: '{"itens": [{"i": 1, "achou": true, "x": 47.8, "y": 50.2, "width": 3.4, "height": 3.5}, {"i": 2, "achou": false}]}' });
  assert.equal(reqs.locate.length >= 1, true);
  assert.ok(reqs.locate[0].hasImages, "a visão recebeu a figura");
  assert.match(reqs.locate[0].lastUser, /1\. Exutório: A única saída/);
  const hs = r.spec.slides.find((s) => s.layout === "spotlight").hotspots;
  assert.deepEqual([hs[0].x, hs[0].y, hs[0].width, hs[0].height], [47.8, 50.2, 3.4, 3.5]);
  assert.deepEqual([hs[1].x, hs[1].y], [10, 10], "o que ela não achou ficou");
});
