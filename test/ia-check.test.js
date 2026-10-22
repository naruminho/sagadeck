// `sagadeck ia-check`: cada recurso de IA (texto, visão, imagem, pesquisa, vídeo) testado com uma chamada de verdade,
// todos ao mesmo tempo, sem tela. Aqui contra o LLM falso e um provedor de vídeo simulado: o que passa, o que falha e
// por quê (sem chave, modelo que não enxerga, cor errada, sem imagem, sem catálogo de vídeo), e que roda em paralelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { iaCheck, twoColorPNG, colorsFor, CHECKS } from "../src/ai/ia-check.js";
import { startMockLLM } from "./mock-llm.js";
import { ROOT } from "./helpers.js";

const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const PNG = `data:image/png;base64,${twoColorPNG("vermelho", "azul").toString("base64")}`;
const cfgOf = (llm, extra = {}) => ({ url: llm.url, key: "", headers: {}, adaptador: "", problem: "", source: "variável", textModel: "texto-m", visionModel: "visao-m", imageModel: "imagem-m", searchModel: "busca-m:online", timeoutMs: 30000, firstTimeoutMs: 30000, ...extra });
// o provedor de mentira que acerta tudo: diz as cores certas da imagem, a data de hoje e devolve uma imagem
const certo = (seed) => (r) => {
  if (r.hasImages) { const [a, b] = colorsFor(seed); return `${a}, ${b}`; }
  if (/Generate an image/.test(r.lastUser)) return { image: PNG };
  if (/data de hoje/.test(r.lastUser)) return hoje;
  return "pronto";
};
const status = (rep) => Object.fromEntries(rep.resultados.map((r) => [r.id, r.status]));

test("tudo certo: cada recurso com o seu modelo, o resultado avisado assim que chega e a imagem gravada", async () => {
  const llm = await startMockLLM(certo(5));
  try {
    const avisos = [];
    const rep = await iaCheck({ cfg: cfgOf(llm), env: {}, seed: 5, onResult: (r) => avisos.push(r.id) });
    assert.deepEqual(status(rep), { texto: "ok", visao: "ok", imagem: "ok", pesquisa: "ok", video: "nao_configurado", conferencia: "nao_configurado" });
    assert.equal(rep.ok, true, "sem configuração não é falha");
    assert.equal(avisos.length, 6);
    const modelos = Object.fromEntries(llm.requests.map((r) => [r.body.model, true]));
    for (const m of ["texto-m", "visao-m", "imagem-m", "busca-m:online"]) assert.ok(modelos[m], `chamou ${m}`);
    const img = rep.resultados.find((r) => r.id === "imagem");
    assert.ok(fs.existsSync(img.arquivo) && fs.readFileSync(img.arquivo).subarray(1, 4).toString() === "PNG");
    assert.match(rep.resultados.find((r) => r.id === "video").detalhe, /modelo de vídeo em Configurar IA.*SAGADECK_VIDEO_KEY \/ OPENROUTER_API_KEY/);
    // perguntas curtas e sem raciocínio: rápidas
    for (const r of llm.requests.filter((x) => x.body.model !== "imagem-m")) { assert.equal(r.body.temperature, 0); assert.ok(r.body.max_tokens <= 100); }
  } finally { await llm.close(); }
});

test("em paralelo: cinco chamadas lentas terminam juntas, não uma depois da outra", async () => {
  const llm = await startMockLLM(async (r) => { await new Promise((ok) => setTimeout(ok, 700)); return certo(1)(r); });
  try {
    const rep = await iaCheck({ cfg: cfgOf(llm), env: {}, seed: 1 });
    assert.equal(rep.resultados.filter((r) => r.status === "ok").length, 4);
    assert.ok(rep.ms < 2000, `levou ${rep.ms} ms (em série seriam 2,8 s)`);
  } finally { await llm.close(); }
});

test("visão: modelo que não aceita imagem falha (não vale responder sem ver); cor errada também", async () => {
  const cego = await startMockLLM((r) => (r.hasImages ? { status: 404, error: "No endpoints found that support image input" } : "não sei"));
  try {
    const [v] = (await iaCheck({ only: ["visao"], cfg: cfgOf(cego, { visionModel: "cego-m", textModel: "cego-m" }), env: {}, seed: 2 })).resultados;
    assert.equal(v.status, "falhou");
    assert.match(v.detalhe, /não aceitou a imagem/);
  } finally { await cego.close(); }
  const chute = await startMockLLM((r) => (r.hasImages ? "verde, verde" : "pronto"));
  try {
    const [esq, dir] = colorsFor(0);
    const rep = await iaCheck({ only: ["visao"], cfg: cfgOf(chute), env: {}, seed: 0 });
    assert.equal(rep.ok, false);
    assert.match(rep.resultados[0].detalhe, new RegExp(`a imagem era ${esq}, ${dir}`));
  } finally { await chute.close(); }
});

test("imagem, texto e pesquisa: o motivo de cada falha; sem IA configurada, sem chamada nenhuma", async () => {
  const ruim = await startMockLLM((r) => (/Generate an image/.test(r.lastUser) ? "não sei desenhar" : /data de hoje/.test(r.lastUser) ? "2019-03-01" : "ok"));
  try {
    const rep = await iaCheck({ only: ["texto", "imagem", "pesquisa"], cfg: cfgOf(ruim), env: {} });
    const by = Object.fromEntries(rep.resultados.map((r) => [r.id, r]));
    assert.match(by.texto.detalhe, /esperado: pronto/);
    assert.match(by.imagem.detalhe, /não devolveu imagem/);
    assert.match(by.pesquisa.detalhe, /não parece ter pesquisado/);
    assert.equal(rep.ok, false);
  } finally { await ruim.close(); }
  const rep = await iaCheck({ only: ["texto", "pesquisa"], cfg: { url: "", adaptador: "", problem: "" }, env: {} });
  assert.deepEqual(status(rep), { texto: "nao_configurado", pesquisa: "nao_configurado" });
  const sem = await startMockLLM(() => "x");
  try { assert.equal((await iaCheck({ only: ["pesquisa"], cfg: cfgOf(sem, { searchModel: "" }), env: {} })).resultados[0].status, "nao_configurado"); assert.equal(sem.requests.length, 0); }
  finally { await sem.close(); }
  // --rapido: sem os lentos e cobrados
  assert.deepEqual((await iaCheck({ rapido: true, cfg: { url: "" }, env: {} })).resultados.map((r) => r.id), ["texto", "visao", "pesquisa", "conferencia"]);
});

test("conferência: o modelo para conferir, quando é outro que o de texto, faz uma conta com resposta conhecida", async () => {
  const llm = await startMockLLM((r) => (/17 × 23/.test(r.lastUser) ? (r.body.model === "conferente-m" ? "391" : "17 vezes 23 dá 401") : "pronto"));
  try {
    const [ok] = (await iaCheck({ only: ["conferencia"], cfg: cfgOf(llm, { checkModel: "conferente-m" }), env: {} })).resultados;
    assert.deepEqual([ok.status, ok.modelo], ["ok", "conferente-m"]);
    const q = llm.requests.at(-1);
    assert.equal(q.body.model, "conferente-m");
    assert.ok(q.body.max_tokens >= 2000 && !q.body.reasoning, "com raciocínio e espaço para ele, como na conferência de verdade");
    const [ruim] = (await iaCheck({ only: ["conferencia"], cfg: cfgOf(llm, { checkModel: "outro-m" }), env: {} })).resultados;
    assert.equal(ruim.status, "falhou");
    assert.match(ruim.detalhe, /esperado: 391/);
    // sem modelo próprio (o mesmo do texto): nada a testar além do texto, sem chamada
    const n = llm.requests.length;
    const [sem] = (await iaCheck({ only: ["conferencia"], cfg: cfgOf(llm, { checkModel: "texto-m" }), env: {} })).resultados;
    assert.equal(sem.status, "nao_configurado");
    assert.match(sem.detalhe, /usam o de texto/);
    assert.equal(llm.requests.length, n);
  } finally { await llm.close(); }
});

// provedor de vídeo simulado: catálogo opcional, job, consulta e download
function videoProvider({ catalog = true, status = ["queued", "in_progress", "completed"], pollingUrl = "/api/v1/videos/job1" } = {}) {
  const calls = [], auth = [];
  let n = 0;
  const fetcher = async (url, opts = {}) => {
    const u = new URL(url), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path: u.pathname, method: opts.method || "GET", body });
    if (!u.pathname.endsWith("/content")) auth.push(opts.headers || {});
    const res = (code, data, headers = {}) => ({ ok: code < 400, status: code, headers: { get: (k) => headers[k.toLowerCase()] || "" }, json: async () => data, body: data });
    if (u.pathname.endsWith("/videos/models")) return catalog ? res(200, { data: [{ id: "google/veo-3.1-lite", supported_durations: [8, 4, 6], supported_resolutions: ["1080p", "480p", "720p"] }] }) : res(404, {});
    if (u.pathname.endsWith("/videos") && opts.method === "POST") return res(200, { id: "job1", status: "queued", polling_url: pollingUrl });
    if (u.pathname.endsWith("/videos/job1")) return res(200, { id: "job1", status: status[Math.min(n++, status.length - 1)], usage: { cost: 0.4 } });
    if (u.pathname.endsWith("/content")) {
      const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(400)]);
      return { ok: true, status: 200, headers: { get: () => "video/mp4" }, body: (async function* () { yield mp4; })() };
    }
    return res(404, {});
  };
  return { fetcher, calls, auth };
}

test("vídeo sem --video-real: só catálogo, de graça, e não conta como prova; sem catálogo, diz para gerar", async () => {
  const env = { OPENROUTER_API_KEY: "k" };
  const p = videoProvider();
  const [v] = (await iaCheck({ only: ["video"], env, fetcher: p.fetcher, cfg: { url: "" } })).resultados;
  assert.equal(v.status, "sem_prova");
  assert.match(v.detalhe, /--video-real/);
  assert.ok(p.calls.every((c) => c.method === "GET"), "nada gerado, nada cobrado");
  const [s] = (await iaCheck({ only: ["video"], env, fetcher: videoProvider({ catalog: false }).fetcher, cfg: { url: "" } })).resultados;
  assert.equal(s.status, "sem_prova");
  assert.match(s.detalhe, /não tem catálogo de vídeo.*--video-real/);
  const [x] = (await iaCheck({ only: ["video"], env: { ...env, SAGADECK_VIDEO_MODEL: "outro/modelo" }, fetcher: p.fetcher, cfg: { url: "" } })).resultados;
  assert.equal(x.status, "falhou", "modelo fora do catálogo");
});

test("vídeo com --video-real: gera o clipe mais curto e leve, acompanha, baixa e confere o MP4; sem catálogo também gera", async () => {
  const env = { OPENROUTER_API_KEY: "k" };
  const p = videoProvider();
  const [v] = (await iaCheck({ only: ["video"], videoReal: true, videoPollMs: 10, env, fetcher: p.fetcher, cfg: { url: "" } })).resultados;
  assert.equal(v.status, "ok", v.detalhe);
  assert.match(v.detalhe, /MP4 de \d+ KB, custou \$0\.40/);
  assert.equal(fs.readFileSync(v.arquivo).toString("ascii", 4, 8), "ftyp");
  const pedido = p.calls.find((c) => c.method === "POST").body;
  assert.equal(pedido.duration, 4, "a duração mais curta que o modelo aceita");
  assert.equal(pedido.resolution, "480p", "a resolução mais leve");
  // nem todo provedor tem catálogo: gera assim mesmo, com o padrão
  const q = videoProvider({ catalog: false });
  const [w] = (await iaCheck({ only: ["video"], videoReal: true, videoPollMs: 10, env, fetcher: q.fetcher, cfg: { url: "" } })).resultados;
  assert.equal(w.status, "ok", w.detalhe);
  assert.equal(q.calls.find((c) => c.method === "POST").body.duration, 4);
  // o provedor recusou o job
  const [f] = (await iaCheck({ only: ["video"], videoReal: true, videoPollMs: 10, env, fetcher: videoProvider({ status: ["queued", "failed"] }).fetcher, cfg: { url: "" } })).resultados;
  assert.equal(f.status, "falhou");
  assert.match(f.detalhe, /encerrou com failed/);
});

test("vídeo pela camada da IA: com modelo de vídeo no Configurar IA, usa o endereço e a chave de lá (não o OpenRouter)", async () => {
  const p = videoProvider({ pollingUrl: "/v1/videos/job1" });
  const cfg = { url: "https://ia.empresa.example/v1", key: "chave-da-config", headers: { "X-Equipe": "slides" }, adaptador: "", videoModel: "google/veo-3.1-lite" };
  const [v] = (await iaCheck({ only: ["video"], videoReal: true, videoPollMs: 10, cfg, env: { OPENROUTER_API_KEY: "outra" }, fetcher: p.fetcher })).resultados;
  assert.equal(v.status, "ok", v.detalhe);
  assert.match(v.detalhe, /via configuração da IA/);
  assert.ok(p.calls.length >= 4);
  for (const c of p.calls) assert.ok(c.path.startsWith("/v1/videos"), c.path);
  assert.ok(p.auth.every((h) => h.Authorization === "Bearer chave-da-config" && h["X-Equipe"] === "slides"), "a chave e os cabeçalhos do Configurar IA, nunca a do OpenRouter");
});

test("a imagem do teste de visão é um PNG válido, com duas cores sempre diferentes", () => {
  const png = twoColorPNG("verde", "amarelo", 10, 4);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 10);
  for (let s = 0; s < 12; s++) { const [a, b] = colorsFor(s); assert.notEqual(a, b); }
  assert.equal(new Set(Array.from({ length: 12 }, (_, s) => colorsFor(s).join())).size, 12, "12 combinações");
  assert.deepEqual(Object.keys(CHECKS), ["texto", "visao", "imagem", "pesquisa", "video", "conferencia"]);
});

test("linha de comando: --json para máquina e código de saída 1 quando algo falha", async () => {
  const llm = await startMockLLM(() => "não");
  try {
    // assíncrono: o LLM falso roda neste processo e precisa responder enquanto o comando espera
    const run = (...a) => new Promise((ok) => execFile(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "ia-check", ...a],
      { encoding: "utf8", env: { ...process.env, SAGADECK_LLM_URL: llm.url, SAGADECK_TEXT_MODEL: "t" } }, (err, stdout, stderr) => ok({ status: err ? err.code : 0, stdout, stderr })));
    const t0 = Date.now();
    const r = await run("--so=texto", "--json");
    assert.equal(r.status, 1, r.stderr);
    const rep = JSON.parse(r.stdout);
    assert.equal(rep.resultados[0].status, "falhou");
    assert.match(rep.resultados[0].detalhe, /respondeu "não" \(esperado: pronto\)/, "falhou pela resposta, não por prazo");
    assert.ok(Date.now() - t0 < 10000, "e sai logo");
    assert.match(r.stderr, /FALHOU/, "o andamento vai para o stderr, o JSON fica limpo no stdout");
    assert.equal((await run("--so=desenho")).status, 2, "recurso desconhecido");
  } finally { await llm.close(); }
});
