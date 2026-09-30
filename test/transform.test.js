// Transformar uma apresentação importada (src/ai/transform.js), com o LLM falso: ver → planejar → escrever → conferir
// (fatos por código, desenho por visão) → montar. O chat decide iniciar (transform:); o Studio executa e mostra.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import pptxgen from "pptxgenjs";
import { startMockLLM } from "./mock-llm.js";
import { openLibrary } from "../src/library.js";
import { mergeProgressive, isProgressive } from "../src/import/merge.js";
import { factsOf, missingFacts } from "../src/ai/transform.js";
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
