// Pesquisa para gerar material (src/research/research.js). Pedido do Naruminho: a IA sabe quando o que ela já sabe
// basta (hash table) e quando precisa pesquisar (ranking das IAs de fronteira, calendário dos próximos filmes, uma
// tecnologia que só existe em artigo); vai atrás do preprint quando o artigo está fechado; escolhe fontes confiáveis
// e descarta o blog que "delira"; sem internet (a rede do banco), avisa e não inventa.
// Aqui, o encaminhamento com o LLM falso e uma web falsa; a decisão de verdade está no teste ao vivo (SAGADECK_LIVE=1).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startMockLLM } from "./mock-llm.js";
test('anotação lenta tem prazo total, não repete a chamada e libera a geração',async()=>{
 const llm=await startMockLLM(async req=>{if(/Escolha até/.test(req.lastUser))return '{"fontes":[{"i":1}]}';await new Promise(r=>setTimeout(r,700));return '{"resumo":"Tarde","fatos":[]}'});
 process.env.SAGADECK_LLM_URL=llm.url;const {runResearch}=await import('../src/research/research.js');
 try{const start=Date.now(),steps=[];const result=await runResearch({buscas:['tema']},{annotationTimeoutMs:40,web:{search:async()=>[{title:'Fonte',url:'https://example.test/'}],fetch:async()=>({text:'conteúdo da fonte '.repeat(100)})},onProgress:s=>steps.push(s)});
 assert.ok(Date.now()-start<600,'não espera a resposta lenta');assert.equal(llm.requests.filter(r=>/Tire desta fonte/.test(r.lastUser)).length,1);assert.match(result.report.falhas.join(' '),/tempo|prazo/);assert.deepEqual(result.materials,[]);assert.ok(steps.some(s=>/seguindo sem/.test(s)));
 }finally{await llm.close()}
});

const deckYaml = (title) => "```yaml\ntitle: " + title + "\nslides:\n  - layout: cover\n    title: " + title + "\n  - layout: statement\n    text: \"Dados de hoje\"\n  - layout: references\n    title: Referências\n    items: [\"Fonte F1\"]\n```";
test('planejamento de pesquisa separa contexto interno de recursos públicos', async () => {
 const llm = await startMockLLM(() => '{"pesquisar":false,"buscas":[]}');
 process.env.SAGADECK_LLM_URL = llm.url;
 try {
  const {decideResearch} = await import('../src/research/research.js');
  await decideResearch('Divulgue nosso evento interno com a plataforma Bridge e logo oficial.');
  assert.match(llm.requests[0].lastUser,/não fatos públicos a confirmar/);
  assert.match(llm.requests[0].lastUser,/produtos homônimos/);
 } finally { await llm.close(); }
});
test('slide único no pedido prevalece sobre estimativa de duração no prompt',async()=>{
 const llm=await startMockLLM(()=> '```yaml\ntitle: Página única\nslides:\n  - layout: statement\n    text: Um infográfico\n```');process.env.SAGADECK_LLM_URL=llm.url;
 try{const {generateDeck}=await import('../src/ai/deck-ai.js');const result=await generateDeck('Quero um único slide, sem capa extra',{duration:1,research:false,images:false});assert.equal(result.spec.slides.length,1);assert.match(llm.requests.at(-1).lastUser,/pedido prevalece/);assert.match(llm.requests.at(-1).lastUser,/não adicione capa/);}finally{await llm.close()}
});

function fakeWeb() {
  const calls = { search: [], arxiv: [], fetch: [] };
  return {
    calls,
    search: async (q) => { calls.search.push(q); return [
      { title: "Ranking oficial de modelos — Laboratório X", url: "https://lab-x.example/ranking", snippet: "ranking de 2026" },
      { title: "10 IAs INCRÍVEIS que vão MUDAR SUA VIDA", url: "https://blog-qualquer.example/ias", snippet: "clique" },
      { title: "Attention-free transformers (journal)", url: "https://journal.example/paper/123", snippet: "paywall" },
    ]; },
    arxiv: async (q) => { calls.arxiv.push(q); return [{ title: "Attention-free transformers", url: "https://arxiv.org/abs/2601.00001", pdf: "https://arxiv.org/pdf/2601.00001", snippet: "we propose", date: "2026-01-02", arxiv: true }]; },
    fetch: async (url) => {
      calls.fetch.push(url);
      if (/journal\.example/.test(url)) return { text: "Abstract only. Subscribe to read the full article.", detail: "página" };
      if (/arxiv\.org\/pdf/.test(url)) return { text: "Attention-free transformers. ".repeat(40) + "We replace attention with a learned mixer and get 92.1% accuracy.", detail: "pdf linkado" };
      return { text: "Ranking de outubro de 2026: Modelo A em primeiro com 1412 pontos, Modelo B em segundo com 1398. ".repeat(10), detail: "página" };
    },
  };
}

test('anexos exclusivos bloqueiam pesquisa sem autorização; complemento explícito libera', async () => {
  let allowed = false;
  const llm = await startMockLLM(() => JSON.stringify({pesquisar:true,externalAuthorized:allowed,buscas:['tema']}));
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const {decideResearch} = await import('../src/research/research.js');
    const options = {materials:[{name:'paper.pdf',text:'Fonte primária'}]};
    assert.equal((await decideResearch('Apresente o paper',options)).pesquisar,false);
    allowed = true;
    assert.equal((await decideResearch('Complemente com fontes externas',options)).pesquisar,true);
    assert.match(llm.requests[0].lastUser,/fonte exclusiva/);
  } finally {await llm.close();}
});

test("o que a IA já sabe (hash table): não pesquisa, não abre a web", async () => {
  const llm = await startMockLLM((req) => (/Decida se o que você JÁ SABE basta/.test(req.lastUser) ? '{"pesquisar": false, "motivo": "conceito clássico", "academico": false, "buscas": []}' : deckYaml("Hash table")));
  process.env.SAGADECK_LLM_URL = llm.url;
  const { generateDeck } = await import("../src/ai/deck-ai.js");
  const web = fakeWeb();
  try {
    const r = await generateDeck("explique hash table", { images: false, web });
    assert.equal(r.research?.pesquisou, false);
    assert.deepEqual([web.calls.search.length, web.calls.fetch.length], [0, 0]);
    const ask = llm.requests.find((q) => /Decida se o que você JÁ SABE basta/.test(q.lastUser)).lastUser;
    assert.match(ask, new RegExp(`Hoje é ${new Date().toISOString().slice(0, 10)}`), "a IA sabe a data de hoje");
  } finally { await llm.close(); }
});

test("o que muda com o tempo: pesquisa, escolhe a fonte confiável, descarta o blog, vai ao preprint, cita e guarda", async () => {
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/Decida se o que você JÁ SABE basta/.test(u)) return '{"pesquisar": true, "motivo": "ranking muda todo mês", "academico": true, "buscas": ["frontier AI ranking 2026"]}';
    if (/Escolha até \d+ fontes CONFIÁVEIS/.test(u)) return '{"fontes": [{"i": 1, "tipo": "oficial", "porque": "ranking do laboratório"}, {"i": 3, "tipo": "academico", "porque": "o artigo"}]}';
    if (/Tire desta fonte o que serve/.test(u)) return /arxiv/.test(u) ? '{"resumo": "Troca a atenção por um misturador.", "fatos": [{"fato": "92,1% de acurácia", "trecho": "92.1% accuracy"}]}' : '{"resumo": "Ranking de outubro.", "data": "2026-10", "fatos": [{"fato": "Modelo A em primeiro, com 1412 pontos", "trecho": "Modelo A em primeiro com 1412 pontos"}]}';
    return deckYaml("Ranking das IAs");
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const { generateDeck } = await import("../src/ai/deck-ai.js");
  const web = fakeWeb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-pesq-"));
  try {
    const steps = [];
    const r = await generateDeck("um ranking das IAs de fronteira", { images: false, web, researchDir: dir, onEvent: (e) => steps.push(e.text) });
    assert.equal(r.research.pesquisou, true);
    assert.deepEqual(r.research.fontes.map((f) => f.site), ["lab-x.example", "arxiv.org"], "a oficial e o preprint; o blog ficou de fora");
    assert.ok(!web.calls.fetch.some((u) => /blog-qualquer/.test(u)), "o blog nem foi aberto");
    assert.ok(web.calls.fetch.some((u) => /arxiv\.org\/pdf\/2601\.00001/.test(u)), "o artigo fechado foi lido pelo preprint");
    assert.equal(r.research.fontes[1].preprint, true);
    const gen = llm.requests.find((q) => /Crie a apresentação inteira/.test(q.lastUser));
    const all = gen.system + "\n" + gen.lastUser;
    assert.match(all, /FONTES DA PESQUISA/);
    assert.match(all, /\[F1\][^\n]*lab-x\.example/);
    assert.match(all, /Modelo A em primeiro, com 1412 pontos/);
    assert.match(all, /PESQUISA: as fontes \[F1\]/);
    assert.match(all, /slide references com cada fonte/);
    assert.match(all, /Superinteressante/, "fonte densa vira reportagem de divulgação");
    const notas = fs.readFileSync(path.join(dir, "contexto", "pesquisa", "notas.md"), "utf8");
    assert.match(notas, /\[F1\]/); assert.match(notas, /1412 pontos/);
    assert.ok(fs.existsSync(path.join(dir, "contexto", "pesquisa", "F2.txt")));
    assert.ok(steps.some((t) => /Pesquisando/.test(t || "")) && steps.some((t) => /Lendo/.test(t || "")), "a pessoa acompanha");
  } finally { await llm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("sem internet (a rede do banco): avisa, não inventa dado recente e pede links ou anexos", async () => {
  const llm = await startMockLLM((req) => (/Decida se o que você JÁ SABE basta/.test(req.lastUser) ? '{"pesquisar": true, "motivo": "calendário futuro", "academico": false, "buscas": ["marvel próximos filmes"]}' : deckYaml("Marvel")));
  process.env.SAGADECK_LLM_URL = llm.url;
  const { generateDeck } = await import("../src/ai/deck-ai.js");
  const web = { search: async () => { throw new Error("fetch failed"); }, fetch: async () => { throw new Error("fetch failed"); } };
  try {
    const steps = [];
    const r = await generateDeck("um infográfico em forma de calendário dos próximos filmes da Marvel", { images: false, web, onEvent: (e) => steps.push(e.text) });
    assert.equal(r.research.offline, true);
    const gen = llm.requests.find((q) => /Crie a apresentação inteira/.test(q.lastUser)).lastUser;
    assert.match(gen, /pesquisa na web não foi possível \(sem acesso à internet daqui\)/);
    assert.match(gen, /Não invente dado recente/);
    assert.ok(steps.some((t) => /Sem acesso à internet/.test(t || "")), "a pessoa fica sabendo");
  } finally { await llm.close(); }
});

test("pesquisa desligada (Preferências ou SAGADECK_WEB=0): nem pergunta ao modelo", async () => {
  const llm = await startMockLLM(() => deckYaml("X"));
  process.env.SAGADECK_LLM_URL = llm.url;
  const { generateDeck } = await import("../src/ai/deck-ai.js");
  try {
    const r = await generateDeck("ranking das IAs", { images: false, research: false });
    assert.equal(r.research, undefined);
    assert.ok(!llm.requests.some((q) => /Decida se o que você JÁ SABE basta/.test(q.lastUser)));
  } finally { await llm.close(); }
});

const live = process.env.SAGADECK_LIVE === "1";
test("ao vivo: a IA decide quando pesquisar (hash table não; ranking, calendário e paper novo sim)", { skip: !live && "só com SAGADECK_LIVE=1", timeout: 300000 }, async () => {
  const { decideResearch } = await import("../src/research/research.js");
  const casos = [
    ["Faça uma aula explicando hash table", false],
    ["Quero um ranking das IAs de fronteira", true],
    ["Me faça um infográfico em forma de calendário dos próximos filmes da Marvel", true],
    ["Explique a tecnologia do artigo 'Titans: Learning to Memorize at Test Time' como uma reportagem", true],
  ];
  const got = await Promise.all(casos.map(([p]) => decideResearch(p)));
  got.forEach((g, i) => assert.equal(g.pesquisar, casos[i][1], `${casos[i][0]}: ${JSON.stringify(g)}`));
  assert.ok(got[3].academico, "paper: acadêmico (vai ao arXiv)");
});

test("resposta da IA cortada no meio (ela gasta tokens pensando): os itens completos da lista valem", async () => {
  const { jsonOf } = await import("../src/research/research.js");
  const r = jsonOf('```json\n{"resumo": "Ranking de outubro.", "fatos": [{"fato": "Modelo A em primeiro", "trecho": "A first"}, {"fato": "Modelo B", "trec');
  assert.equal(r.resumo, "Ranking de outubro.");
  assert.deepEqual(r.fatos, [{ fato: "Modelo A em primeiro", trecho: "A first" }]);
  assert.throws(() => jsonOf("não sei"));
});
