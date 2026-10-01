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
import { factsOf, missingFacts, transformDeck, jobStatus, jsonLoose, nearImage } from "../src/ai/transform.js";
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
    if (/Fotos de slides/.test(req.lastUser)) { looks++; return broken ? "não consegui" : '```json\n{"slides":[{"n":2,"figuras":[{"tipo":"gráfico","generica":false,"o_que":"curva","dados":"pico 42"}]}]}\n```'; }
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
