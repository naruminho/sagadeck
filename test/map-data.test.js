// Planilha × mapa (entrega 2): "Achar coordenadas pelo endereço" (consentimento antes de mandar os endereços, cache
// no projeto, uma tentativa e para), a tela Configurar mapa (chave nunca volta inteira) e, no Studio, "Pôr no mapa",
// "Achar coordenadas" e a seleção ligada entre a linha da planilha e o ponto. O geocodificador é falso.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const LUGARES = { "Rua A, 10, Recife": [-8.05, -34.88], "Rua B, 20, Recife": [-8.06, -34.9] };
async function geocoder(mode) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const q = new URL(req.url, "http://x").searchParams.get("q");
    hits.push({ q, ua: req.headers["user-agent"] });
    if (mode.value === "403") { res.writeHead(403); return res.end(); }
    const hit = LUGARES[q];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(hit ? [{ lat: String(hit[0]), lon: String(hit[1]), display_name: q }] : []));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const setGeocoder = (url) => fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, geocoder: { url, porSegundo: 200 } }));
const CSV = "nome;endereco;cidade;tipo\nUBS Centro;Rua A, 10;Recife;saúde\nEscola X;Rua B, 20;Recife;educação\nNada;Rua Inexistente;Recife;saúde\n";

async function ndjson(res) {
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { lines, fim: lines.find((l) => l.type === "fim") };
}

test("Achar coordenadas: pede consentimento antes de mandar endereços; grava latitude e longitude; o cache evita pedir de novo", async () => {
  const mode = { value: "ok" };
  const geo = await geocoder(mode);
  setGeocoder(geo.url);
  const deck = tempDeck();
  fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
  fs.writeFileSync(path.join(deck.dir, "contexto", "unidades.csv"), CSV);
  const studio = await startStudio(deck.file);
  const post = (p, body) => fetch(studio.url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await post("/api/mapa/tentar", {});
    let r = await post("/api/mapa/geocode", { path: "contexto/unidades.csv" });
    assert.equal(r.status, 409, "sem consentimento, nada sai");
    const plan = await r.json();
    assert.equal(plan.enviar, 3); assert.equal(plan.coluna, "endereco"); assert.match(plan.servico, /127\.0\.0\.1/);
    assert.equal(geo.hits.length, 0, "nenhum endereço foi enviado antes do sim");
    const { fim } = await ndjson(await post("/api/mapa/geocode", { path: "contexto/unidades.csv", confirmo: true }));
    assert.equal(fim.ok, 2);
    assert.deepEqual(fim.falhas.map((f) => f.linha), [4]);
    assert.deepEqual(geo.hits.map((h) => h.q), ["Rua A, 10, Recife", "Rua B, 20, Recife", "Rua Inexistente, Recife"], "endereço com a cidade junto");
    assert.match(geo.hits[0].ua, /^sagadeck\//, "o pedido se identifica");
    const linhas = fs.readFileSync(path.join(deck.dir, "contexto", "unidades.csv"), "utf8").trim().split(/\r?\n/);
    assert.equal(linhas[0], "nome;endereco;cidade;tipo;latitude;longitude");
    assert.equal(linhas[1], "UBS Centro;Rua A, 10;Recife;saúde;-8.05;-34.88");
    // de novo: o consentimento ficou e o cache responde (inclusive o que não achou); nenhum pedido novo
    const again = await ndjson(await post("/api/mapa/geocode", { path: "contexto/unidades.csv" }));
    assert.equal(again.fim.ok, 0, "as que já tinham coordenada não entram");
    assert.equal(geo.hits.length, 3, "nada foi enviado de novo");
    const st = await (await fetch(studio.url + "/api/mapa")).json();
    assert.equal(st.services.geocoder.status, "ok");
  } finally { await studio.close(); await geo.close(); }
});

test("serviço de endereços que recusa (403): exatamente um pedido, e nada mais até Tentar de novo", async () => {
  const mode = { value: "403" };
  const geo = await geocoder(mode);
  setGeocoder(geo.url);
  const deck = tempDeck();
  fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
  fs.writeFileSync(path.join(deck.dir, "contexto", "unidades.csv"), CSV);
  const studio = await startStudio(deck.file);
  const post = (p, body) => fetch(studio.url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await post("/api/mapa/tentar", {});
    const a = await ndjson(await post("/api/mapa/geocode", { path: "contexto/unidades.csv", confirmo: true }));
    assert.match(a.fim.bloqueado, /403/);
    assert.equal(geo.hits.length, 1, "uma tentativa e para");
    const b = await ndjson(await post("/api/mapa/geocode", { path: "contexto/unidades.csv", confirmo: true }));
    assert.match(b.fim.bloqueado, /não tentei de novo/);
    assert.equal(geo.hits.length, 1, "bloqueado: nem tenta");
    const st = await (await fetch(studio.url + "/api/mapa")).json();
    assert.equal(st.services.geocoder.status, "bloqueado");
    await post("/api/mapa/tentar", { service: "geocoder" });
    await ndjson(await post("/api/mapa/geocode", { path: "contexto/unidades.csv", confirmo: true }));
    assert.equal(geo.hits.length, 2, "Tentar de novo libera um pedido");
  } finally { await studio.close(); await geo.close(); }
});

test("Configurar mapa: grava no arquivo desta máquina; a chave nunca volta inteira e em branco mantém a gravada", async () => {
  const studio = await startStudio(null);
  const post = (p, body) => fetch(studio.url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    let r = await (await post("/api/mapa", { rotas: { provedor: "openrouteservice", url: "https://rotas.exemplo", key: "chave-1234" } })).json();
    assert.equal(r.config.rotas.keyHint, "••••1234");
    assert.ok(!JSON.stringify(r).includes("chave-1234"));
    assert.equal(JSON.parse(fs.readFileSync(process.env.SAGADECK_MAPA, "utf8")).rotas.key, "chave-1234");
    r = await (await post("/api/mapa", { rotas: { url: "https://rotas2.exemplo", key: "" } })).json();
    assert.equal(JSON.parse(fs.readFileSync(process.env.SAGADECK_MAPA, "utf8")).rotas.key, "chave-1234", "em branco mantém");
    const info = await (await fetch(studio.url + "/api/mapa")).json();
    assert.equal(info.config.rotas.url, "https://rotas2.exemplo");
    assert.ok(!JSON.stringify(info).includes("chave-1234"));
  } finally { await studio.close(); }
  const multi = await startStudio(null, { multiuser: true });
  try {
    const r = await fetch(multi.url + "/api/mapa", { method: "POST", headers: { "Content-Type": "application/json", "X-Sagadeck-User": "ana" }, body: "{}" });
    assert.equal(r.status, 403);
    const info = await (await fetch(multi.url + "/api/mapa", { headers: { "X-Sagadeck-User": "ana" } })).json();
    assert.equal(info.editable, false);
    assert.ok(!("config" in info), "no servidor, quem usa não vê a configuração");
  } finally { await multi.close(); }
});

test("Studio: planilha com endereço → Achar coordenadas (confirma) → Pôr no mapa; clicar no ponto seleciona a linha", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const geo = await geocoder({ value: "ok" });
  setGeocoder(geo.url);
  const deck = tempDeck();
  fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
  const csvFile = path.join(deck.dir, "contexto", "unidades.csv");
  fs.writeFileSync(csvFile, CSV);
  const studio = await startStudio(deck.file);
  try {
    await fetch(studio.url + "/api/mapa/tentar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await p.click("#rail-tab-files");
    await p.waitForSelector('.ex-row[data-path="contexto"]');
    if (!(await p.locator('.ex-row[data-path="contexto/unidades.csv"]').count())) await p.click('.ex-row[data-path="contexto"]'); // abre a pasta se estiver fechada
    await p.click('.ex-row[data-path="contexto/unidades.csv"]');
    await p.waitForSelector(".md-tools [data-geocode]");
    assert.equal(await p.locator(".md-tools [data-to-map]").count(), 0, "sem posição ainda: só achar coordenadas");
    await p.click(".md-tools [data-geocode]");
    await p.waitForSelector(".md-dialog[open]");
    assert.match(await p.textContent(".md-dialog"), /Vou enviar 3 endereços .*coluna endereco/s);
    assert.equal(geo.hits.length, 0);
    await p.click(".md-dialog [data-yes]");
    await p.waitForSelector(".md-dialog[open]", { timeout: 15000 }); // resultado: uma sem resultado
    assert.match(await p.textContent(".md-dialog"), /2 achados, 1 sem resultado/);
    assert.match(await p.textContent(".md-dialog"), /linha 4: Rua Inexistente/);
    await p.click(".md-dialog [data-ok]");
    assert.match(fs.readFileSync(csvFile, "utf8"), /latitude;longitude/);
    // com posição: Pôr no mapa
    await p.waitForSelector(".md-tools [data-to-map]");
    const n = saved().slides.length;
    await p.click(".md-tools [data-to-map]");
    for (let k = 0; k < 40 && saved().slides.length === n; k++) await p.waitForTimeout(100);
    const m = saved().slides.find((s) => s.layout === "map");
    assert.ok(m, "o mapa entrou no deck");
    assert.deepEqual(m.layers[0], { name: "unidades", points: "contexto/unidades.csv", color: "tipo", label: "nome" });
    await p.waitForSelector('#rendered-slide-container .map-box[data-map-mounted="ready"]', { timeout: 15000 });
    assert.equal(await p.locator("#canvas-stage-wrapper.doc-side").count(), 1, "planilha e mapa ficam lado a lado");
    assert.equal(await p.locator("#doc-view .sh-body.no-suggest").count(), 1, "a grade tem espaço ao lado do mapa");
    await p.click("[data-toggle-suggest]");
    assert.equal(await p.locator("#doc-view .sh-body.no-suggest").count(), 0, "Gráficos abre as sugestões quando solicitado");
    await p.click("[data-toggle-suggest]");
    assert.equal(await p.locator("#rendered-slide-container path.leaflet-interactive").count(), 2, "os dois que têm posição");
    // clicar no ponto da Escola X seleciona a linha 3 da planilha
    // A planilha já está aberta: clicar na mesma aba mantém a grade e a seleção, mesmo com rede lenta.
    let releituras = 0;
    await p.route("**/api/project/sheet?*", async (route) => {
      releituras++;
      await new Promise((r) => setTimeout(r, 250));
      await route.continue();
    });
    await p.click('.doc-tab:has-text("unidades.csv")');
    await p.waitForSelector("#sh-grid td");
    await p.locator("#rendered-slide-container path.leaflet-interactive").nth(1).click();
    await p.waitForTimeout(500); // uma releitura tardia não pode apagar a seleção feita pelo mapa
    assert.equal(releituras, 0, "clicar na aba já ativa não relê e substitui a planilha");
    await p.waitForFunction(() => document.querySelector("#sh-grid td.cur")?.dataset.r === "2");
    // No sentido contrário, selecionar a linha abre o cartão no mapa que está ao lado.
    await p.click('#sh-grid td[data-r="1"][data-c="0"]');
    await p.waitForFunction(() => document.querySelector("#rendered-slide-container .map-card")?.textContent.includes("UBS Centro"));
    await p.click("#rail-tab-slides");
    await p.click('.thumb-card[data-idx="0"]');
    await p.waitForSelector("#canvas-stage-wrapper.doc-full");
    assert.equal(await p.locator("#sh-grid td.cur").getAttribute("data-r"), "1", "trocar de slide preserva a seleção da planilha");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await geo.close(); }
});

test("chave do mapa como a da IA: por variável de ambiente (keyEnv), Testar faz uma rota, e a biblioteca tem Configurar mapa com Usar o OpenRouteService", { timeout: 90000 }, async (t) => {
  const auth = [];
  const ors = http.createServer((req, res) => {
    auth.push(req.headers.authorization);
    res.writeHead(200, { "Content-Type": "application/geo+json" });
    res.end(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { summary: { distance: 817, duration: 588 } }, geometry: { type: "LineString", coordinates: [[-46.6388, -23.5489], [-46.6333, -23.5505]] } }] }));
  });
  await new Promise((r) => ors.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${ors.address().port}`;
  process.env.ORS_DE_TESTE = "chave-ors-9999";
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, rotas: { provedor: "openrouteservice", url, keyEnv: "ORS_DE_TESTE" } }));
  const studio = await startStudio(null);
  try {
    const info = await (await fetch(studio.url + "/api/mapa")).json();
    assert.equal(info.config.rotas.keyHint, "••••9999");
    assert.equal(info.config.rotas.keyFrom, "variável");
    assert.ok(!JSON.stringify(info).includes("chave-ors-9999"));
    const r = await (await fetch(studio.url + "/api/mapa/testar", { method: "POST" })).json();
    assert.equal(r.ok, true); assert.equal(r.distancia, 817); assert.equal(r.minutos, 10);
    assert.deepEqual(auth, ["chave-ors-9999"], "a chave da variável foi usada, uma vez");
    const browser = await browserOrSkip(t);
    if (!browser) return;
    try {
      const { page: p, errors } = await newPage(browser, studio.url);
      await p.waitForSelector("#btn-map:not([hidden])");
      await p.click("#btn-map");
      await p.waitForSelector("#map-settings-dialog[open]");
      assert.match(await p.textContent("#map-settings-dialog"), /OpenRouteService/);
      assert.match(await p.getAttribute('[data-k="rotas"][data-f="key"]', "placeholder"), /••••9999, da variável ORS_DE_TESTE/);
      await p.fill('[data-k="rotas"][data-f="url"]', "");
      await p.click("#map-settings-dialog [data-ors]");
      assert.equal(await p.inputValue('[data-k="rotas"][data-f="url"]'), "https://api.openrouteservice.org");
      assert.equal(await p.inputValue('[data-k="rotas"][data-f="provedor"]'), "openrouteservice");
      await p.click("#map-settings-dialog [data-close]");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  } finally { delete process.env.ORS_DE_TESTE; await studio.close(); await new Promise((r) => ors.close(r)); }
});
