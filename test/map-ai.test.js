// A IA buscando dados para o mapa (entrega 4), com o LLM falso e serviços falsos: o encanamento. O prompt leva as
// regras e o estado dos serviços; o bloco `mapa:` vira busca no OpenStreetMap gravada com a fonte e a IA é chamada de
// novo com o que foi gravado; serviço bloqueado não recebe pedido; endereços da pessoa não saem sem o sim dela.
// (Se o modelo de verdade decide bem fica para test/ai-live.test.js, com SAGADECK_LIVE=1.)
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import { startStudio, tempDeck } from "./helpers.js";
import { startMockLLM } from "./mock-llm.js";

async function geoServices(mode = { value: "ok" }) {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const u = new URL(req.url, "http://x");
    hits.push({ path: u.pathname, q: u.searchParams.get("q"), body });
    if (mode.value === "403") { res.writeHead(403); return res.end(); }
    res.writeHead(200, { "Content-Type": "application/json" });
    if (u.pathname === "/search") return res.end(JSON.stringify([{ lat: "-22.9056", lon: "-47.0608", display_name: "Centro, Campinas" }]));
    if (u.pathname === "/interpreter") return res.end(JSON.stringify({ elements: [
      { type: "node", id: 11, lat: -22.903, lon: -47.06, tags: { name: "Cine Centro", "addr:street": "Rua X", "addr:housenumber": "10" } },
      { type: "way", id: 22, center: { lat: -22.91, lon: -47.07 }, tags: { name: "Cine Shopping" } }] }));
    res.end("[]");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const NO_RESEARCH = (req) => (/JÁ SABE/.test(req.lastUser) ? '{"pesquisar": false, "motivo": "não precisa"}' : null);
const chatCall = async (studio, message, history = []) => {
  const spec = (await (await fetch(studio.url + "/api/deck")).json()).spec;
  const r = await fetch(studio.url + "/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, spec, history, targetSlide: null, requestId: `t-${Date.now()}` }) });
  return r.json();
};

test("IA e mapa: o bloco mapa: vira busca no OpenStreetMap, gravada com a fonte; a IA é chamada de novo com o que foi gravado e monta o slide", async () => {
  const geo = await geoServices();
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, geocoder: { url: geo.url, porSegundo: 200 }, busca: { url: `${geo.url}/interpreter` } }));
  let call = 0;
  const llm = await startMockLLM((req) => {
    const nr = NO_RESEARCH(req); if (nr) return nr;
    call++;
    if (call === 1) return 'Vou buscar os cinemas.\n```yaml\nmapa:\n  - { tipo: lugares, oque: cinemas, filtro_osm: \'["amenity"="cinema"]\', perto_de: "Centro, Campinas, SP, Brasil", raio_km: 2, arquivo: contexto/cinemas.csv }\n```';
    return 'Pronto: os cinemas no mapa.\n```yaml\ninsert:\n  - after: 0\n    slide: { layout: map, title: Cinemas do centro, layers: [{ name: Cinemas, points: contexto/cinemas.csv, label: nome }], source: "Fonte: OpenStreetMap" }\n```';
  });
  const deck = tempDeck();
  const studio = await startStudio(deck.file, { llmUrl: llm.url });
  try {
    await fetch(studio.url + "/api/mapa/tentar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const out = await chatCall(studio, "Mostre no mapa os cinemas perto do centro de Campinas");
    const edits = llm.requests.filter((r) => !/JÁ SABE/.test(r.lastUser));
    assert.match(edits[0].system, /DADOS PARA O MAPA/);
    assert.match(edits[0].system, /Busca de lugares: ainda não usado/);
    const csv = fs.readFileSync(path.join(deck.dir, "contexto", "cinemas.csv"), "utf8");
    assert.match(csv, /^nome,endereco,latitude,longitude,fonte/);
    assert.match(csv, /Cine Centro,"Rua X, 10",-22\.903,-47\.06,https:\/\/www\.openstreetmap\.org\/node\/11/);
    assert.match(csv, /Cine Shopping,,-22\.91,-47\.07,https:\/\/www\.openstreetmap\.org\/way\/22/);
    assert.ok(geo.hits.some((h) => h.path === "/interpreter" && /amenity.*cinema.*around:2000,-22\.9056,-47\.0608/.test(decodeURIComponent(h.body))), "a busca usa o filtro e o centro achado");
    assert.match(edits[1].lastUser + edits[1].system, /\[Dados geográficos buscados pelo sagadeck agora\][\s\S]*contexto\/cinemas\.csv: 2/);
    assert.ok(out.actions.some((a) => /Mapa: gravei contexto\/cinemas\.csv \(2 itens/.test(a)), JSON.stringify(out.actions));
    const saved = YAML.parse(fs.readFileSync(deck.file, "utf8"));
    assert.ok(saved.slides.some((s) => s.layout === "map" && s.layers[0].points === "contexto/cinemas.csv"));
  } finally { await studio.close(); await llm.close(); await geo.close(); }
});

test("IA e mapa: serviço bloqueado não recebe pedido e a IA fica sabendo; endereços da pessoa não saem sem o sim (a resposta pergunta)", async () => {
  const mode = { value: "403" };
  const geo = await geoServices(mode);
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, geocoder: { url: geo.url, porSegundo: 200 }, busca: { url: `${geo.url}/interpreter` } }));
  const deck = tempDeck();
  fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
  fs.writeFileSync(path.join(deck.dir, "contexto", "unidades.csv"), "nome;endereco;cidade\nUBS;Rua A, 10;Recife\nEscola;Rua B, 20;Recife\n");
  let call = 0;
  const llm = await startMockLLM((req) => {
    const nr = NO_RESEARCH(req); if (nr) return nr;
    call++;
    if (/coordenadas das unidades/.test(req.lastUser) && call >= 3) return 'Vou achar as coordenadas.\n```yaml\nmapa:\n  - { tipo: coordenadas, planilha: contexto/unidades.csv, confirmado: false }\n```';
    if (call === 1) return 'Vou buscar.\n```yaml\nmapa:\n  - { tipo: lugares, oque: escolas, filtro_osm: \'["amenity"="school"]\', perto_de: "Recife", raio_km: 2 }\n```';
    return "Não consegui buscar: o serviço está bloqueado nesta rede. Se tiver uma planilha com as coordenadas, eu ponho no mapa.";
  });
  const studio = await startStudio(deck.file, { llmUrl: llm.url });
  const post = (p, body) => fetch(studio.url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await post("/api/mapa/tentar", {});
    // bloqueia o serviço de endereços com um uso de verdade (403)
    await (await post("/api/mapa/geocode", { path: "contexto/unidades.csv", confirmo: true })).text();
    const n = geo.hits.length;
    assert.equal(n, 1);
    const out = await chatCall(studio, "Mostre as escolas perto do centro do Recife");
    const edits = llm.requests.filter((r) => !/JÁ SABE/.test(r.lastUser));
    assert.match(edits[0].system, /Endereço e coordenada: BLOQUEADO nesta rede/);
    assert.equal(geo.hits.length, n, "o serviço bloqueado não recebeu nenhum pedido");
    assert.match(edits[1].lastUser + edits[1].system, /Não deu: lugares \(escolas\): serviço bloqueado nesta rede/);
    assert.ok(out.actions.some((a) => /Mapa: não deu/.test(a)));
    // consentimento: com o serviço liberado, mandar endereços da planilha sem o sim vira pergunta, sem pedido
    mode.value = "ok";
    await post("/api/mapa/tentar", {});
    const before = geo.hits.length;
    const ask = await chatCall(studio, "Ache as coordenadas das unidades e ponha no mapa");
    assert.equal(ask.talk, true);
    assert.match(ask.reply, /2 endereços da planilha contexto\/unidades\.csv .*Posso enviar\?/s);
    assert.deepEqual(ask.options, ["Pode enviar", "Não, deixa"]);
    assert.equal(geo.hits.length, before, "nada foi enviado sem o sim");
  } finally { await studio.close(); await llm.close(); await geo.close(); }
});
