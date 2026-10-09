// Leitura crítica do material (src/ai/critique.js): o que a IA aponta só vale com trecho literal conferido no texto;
// a geração faz a leitura antes de escrever e o uso (slide × notes) segue a autoria.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { quoteFound, critiqueMaterials, critiqueMarkdown, worthCritique, saveCritique, loadCritique, critiqueMaterial } from "../src/ai/critique.js";
import { materialsBlock } from "../src/ai/context.js";
import { startMockLLM } from "./mock-llm.js";

// texto como sai do PDF: espaços duplos, hífen solto, "Fig ure"
const PAPER = "Abstract: the study combines land use, slope, population density and social vulnerability indicators. " +
  "2.3   Susceptibility  The explanatory variables were derived from LiDAR: HAND, elevation, slope, high - resolution DEM. " +
  "Table 1 shows PEPF below 2% for HEC - HMS in the four events, against 9 to 12.5% for HYMOD.";
const letters = (s) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

test("trecho citado só confere se está no material (tolera os espaços e hifens do PDF, não aceita paráfrase)", () => {
  const src = letters(PAPER);
  assert.ok(quoteFound("derived from LiDAR: HAND, elevation, slope, high-resolution DEM", src));
  assert.ok(quoteFound("population density and social vulnerability … PEPF below 2% for HEC-HMS", src), "reticências: cada pedaço confere");
  assert.ok(!quoteFound("the model ignored socioeconomic variables entirely", src), "paráfrase/invenção não confere");
  assert.ok(!quoteFound("HAND", src), "trecho curto demais não prova nada");
});

test("leitura crítica: item com trecho do material fica; item sem trecho no material vai para naoConfirmados", async () => {
  const complete = async () => ({ text: JSON.stringify({ itens: [
    { tipo: "inconsistencia", titulo: "Resumo promete variáveis socioeconômicas", texto: "O resumo cita densidade populacional; a seção 2.3 só usa variáveis do LiDAR.", trecho: "population density and social vulnerability indicators", onde: "Resumo × 2.3" },
    { tipo: "destaque", titulo: "Trade-off pico × volume", texto: "HEC-HMS erra menos no pico (PEPF < 2%).", trecho: "PEPF below 2% for HEC-HMS in the four events", onde: "Tabela 1" },
    { tipo: "pergunta", titulo: "Inventada", texto: "Por que não usaram radar?", trecho: "radar data was not available for this basin", onde: "?" },
    { tipo: "qualquer", titulo: "tipo inválido", texto: "x", trecho: "population density" },
  ] }) });
  const c = await critiqueMaterials([{ name: "paper.pdf", text: PAPER, inventory: { items: [] } }], { complete, briefing: "congresso" });
  assert.deepEqual(c.itens.map((i) => i.tipo), ["inconsistencia", "destaque"]);
  assert.deepEqual(c.naoConfirmados.map((i) => i.titulo), ["Inventada"]);
  const md = critiqueMarkdown(c);
  assert.match(md, /Achado que merece destaque/);
  assert.match(md, /Inconsistência/);
  assert.match(md, /1 observação\(ões\) descartada/);
  // vai para o prompt rotulada como do sagadeck, separada do material da pessoa
  const block = materialsBlock([{ name: "paper.pdf", text: PAPER }, critiqueMaterial(c)]);
  assert.match(block, /LEITURA CRÍTICA DO MATERIAL — feita pelo sagadeck, NÃO pelo autor/);
  assert.doesNotMatch(block.split("LEITURA CRÍTICA")[0], /Trade-off pico/, "a crítica não entra no bloco do material da pessoa");
  assert.doesNotMatch(block, /Inventada/, "o que não conferiu não vai para a IA");
  // guarda e relê na pasta da apresentação
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-crit-"));
  try { saveCritique(dir, c); assert.equal(loadCritique(dir).itens.length, 2); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(worthCritique([{ name: "paper.pdf", text: "x", inventory: { items: [] } }]));
  assert.ok(!worthCritique([{ name: "link", text: "curto" }]));
});

let llm, reply = () => "ok";
before(async () => { llm = await startMockLLM((req) => reply(req)); process.env.SAGADECK_LLM_URL = llm.url; });
after(() => llm.close());

test("Criar com IA lê o paper com olho crítico antes de escrever, guarda a leitura e a manda junto do pedido", async () => {
  const { generateDeck, systemPrompt } = await import("../src/ai/deck-ai.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-crit-gen-"));
  try {
    reply = (req) => /LEITURA CRÍTICA de um material/.test(req.system)
      ? JSON.stringify({ itens: [{ tipo: "destaque", titulo: "Trade-off pico × volume", texto: "HEC-HMS erra menos no pico.", trecho: "PEPF below 2% for HEC-HMS in the four events", onde: "Tabela 1" }] })
      : /Decida se o que você JÁ SABE basta/.test(req.lastUser) ? '{"pesquisar": false, "motivo": "anexo", "academico": false, "buscas": []}'
      : "Pronto.\n```yaml\ncontext: { autoria: autor }\nslides:\n  - { layout: cover, title: Paper }\n  - { layout: split, title: Pico × volume, body: \"HEC-HMS acerta o pico.\", provenance: material }\n  - { layout: end, title: Obrigado }\n```";
    const at = llm.requests.length;
    const r = await generateDeck("Apresentação oral do meu artigo no congresso", { images: false, researchDir: dir, materials: [{ name: "paper.pdf", text: PAPER, detail: "pdf", inventory: { items: [] } }] });
    const writing = llm.requests.slice(at).find((q) => /Crie a apresentação inteira/.test(q.lastUser));
    assert.match(writing.lastUser, /LEITURA CRÍTICA DO MATERIAL — feita pelo sagadeck/);
    assert.match(writing.lastUser, /Trade-off pico/);
    assert.deepEqual(r.critique, { itens: 1, naoConfirmados: 0 });
    assert.equal(loadCritique(dir).itens[0].titulo, "Trade-off pico × volume");
    // as regras: autoria decide liberdade; origem de cada slide
    const sys = systemPrompt();
    assert.match(sys, /AUTORIA E LIBERDADE/);
    assert.match(sys, /`livre`/);
    assert.match(sys, /provenance: material/);
  } finally { reply = () => "ok"; fs.rmSync(dir, { recursive: true, force: true }); }
});
