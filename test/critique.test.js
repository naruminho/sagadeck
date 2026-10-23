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

test("leitura crítica confere as contas do material: gabarito que não fecha com os dados vira inconsistência com o trecho", async () => {
  // uma lista de aula trazia "hf = 2,57 m" quando os próprios dados (f, L, D, v) davam 1,29 m
  const LISTA = "Exercício 3. Calcular o diâmetro de um tubo de aço para 19 L/s de querosene a 600 m, com perda de carga de 3 m. [R: f = 0,023; D = 0,2; v = 0,605 m/s; hf = 2,57 m] ".repeat(3);
  const calls = [];
  const complete = async (messages) => {
    const system = messages[0].content;
    calls.push(system.slice(0, 40));
    if (/CONTAS de um material/.test(system)) return { text: JSON.stringify({ contas: [
      { o_que: "perda de carga do exercício 3", afirmado: "2,57", unidade: "m", trecho: "R: f = 0,023; D = 0,2; v = 0,605 m/s; hf = 2,57 m", onde: "Exercício 3", vars: { f: 0.023, L: 600, D: 0.2, v: 0.605, g: 9.81 }, unidades: { f: "", L: "m", D: "m", v: "m/s", g: "m/s²" }, fn: "f*L/D*v^2/(2*g)" },
      { o_que: "velocidade", afirmado: "0,605", unidade: "m/s", trecho: "v = 0,605 m/s", onde: "Exercício 3", vars: { Q: 19, D: 0.2 }, unidades: { Q: "L/s", D: "m" }, fn: "4*Q/(pi*D^2)" },
      { o_que: "inventada", afirmado: "9,99", unidade: "m", trecho: "isto não está no material", vars: { a: 1 }, unidades: { a: "m" }, fn: "a" },
    ] }) };
    return { text: JSON.stringify({ itens: [] }) };
  };
  const c = await critiqueMaterials([{ name: "aula.pptx", text: LISTA, inventory: { items: [] } }], { complete });
  assert.equal(calls.length, 3, "a leitura e duas conferências das contas, independentes");
  assert.equal(c.itens.length, 1, "a velocidade confere; só a perda de carga não fecha");
  const it = c.itens[0];
  assert.equal(it.tipo, "inconsistencia");
  assert.match(it.titulo, /Conta do material não fecha/);
  assert.match(it.texto, /O material diz 2,57 m; refazendo com os dados do próprio material, a conta dá 1,287 m/);
  assert.equal(it.trecho, "R: f = 0,023; D = 0,2; v = 0,605 m/s; hf = 2,57 m");
  assert.deepEqual(c.naoConfirmados.map((i) => i.trecho), ["isto não está no material"], "trecho que não está no material não vira fato");
  // as duas conferências precisam concordar: a que errou a conversão numa rodada não vira aviso
  let round = 0;
  const flaky = async (messages) => {
    if (!/CONTAS de um material/.test(messages[0].content)) return { text: JSON.stringify({ itens: [] }) };
    round++;
    return { text: JSON.stringify({ contas: [{ o_que: "velocidade", afirmado: "0,605", unidade: "m/s", trecho: "R: f = 0,023; D = 0,2; v = 0,605 m/s; hf = 2,57 m", vars: { Q: 19, D: 0.2 }, unidades: { Q: round === 1 ? "m³/s" : "L/s", D: "m" }, fn: "4*Q/(pi*D^2)" }] }) };
  };
  assert.equal((await critiqueMaterials([{ name: "aula.pptx", text: LISTA, inventory: { items: [] } }], { complete: flaky })).itens.length, 0);
  // material sem resultado escrito: nem pergunta
  calls.length = 0;
  await critiqueMaterials([{ name: "texto.pdf", text: "Um texto corrido sem conta nenhuma. ".repeat(200), inventory: { items: [] } }], { complete });
  assert.equal(calls.length, 1);
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
