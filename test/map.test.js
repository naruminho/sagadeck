// Slide de mapa (layout: map): o motor lê as camadas (CSV, GeoJSON, GPX, KML, valores por estado/país) e a
// apresentação desenha ao vivo, preguiçosa (só no slide atual) e sem insistir em serviço que falha. Os tiles vêm de
// um servidor falso; nunca dos serviços de verdade.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../src/build.js";
import { mapModel, fromGPX, fromKML, coordNum, splitCoords } from "../src/map.js";
import { browserOrSkip, newPage } from "./helpers.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-mapa-"));
const model = (s, dir) => { const warnings = []; return { m: mapModel(s, { baseDir: dir, warnings }), warnings }; };

test("mapa: planilha CSV vira pontos; colunas de posição achadas pelo nome e fora do cartão; linha sem posição avisa", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "sensores.csv"), "Nome;Latitude;Longitude;Status;Vazão\nPonte;-23,5489;-46,6388;ativo;12,5\nPraça;-23.5614;-46.702;inativo;3\nSem lugar;;;ativo;1\n");
  const { m, warnings } = model({ layers: [{ name: "Sensores", points: "sensores.csv", color: "Status", size: "Vazão", label: "Nome" }] }, dir);
  const f = m.layers[0].data.features;
  assert.equal(f.length, 2);
  assert.deepEqual(f[1].geometry.coordinates, [-46.702, -23.5614], "-46.702 é coordenada, não milhar");
  assert.deepEqual(f[0].geometry.coordinates, [-46.6388, -23.5489], "vírgula decimal");
  assert.ok(!("Latitude" in f[0].properties) && !("Longitude" in f[0].properties), "posição não vai para o cartão");
  assert.deepEqual(m.layers[0].style.categories.map((c) => c.value), ["ativo", "inativo"]);
  assert.deepEqual(m.layers[0].style.sizeScale, { min: 3, max: 12.5 });
  assert.match(warnings.join("\n"), /1 linha .* sem posição/);
  assert.deepEqual(m.bounds, [[-23.5614, -46.702], [-23.5489, -46.6388]]);
});

test("mapa: coordenadas numa coluna só, número de planilha e avisos de coluna ou arquivo que não existe", () => {
  assert.equal(coordNum("-46.702"), -46.702);
  assert.equal(coordNum("-23,55"), -23.55);
  assert.ok(Number.isNaN(coordNum("abc")));
  assert.deepEqual(splitCoords("-23.55, -46.63"), [-23.55, -46.63]);
  assert.deepEqual(splitCoords("-23,55; -46,63"), [-23.55, -46.63]);
  assert.deepEqual(splitCoords("-23.55 -46.63"), [-23.55, -46.63]);
  const { m, warnings } = model({ layers: [{ points: [{ coordenadas: "-8.05, -34.9", nome: "Recife" }], color: "tipo" }, { points: "nao-existe.csv" }, { name: "Sem fonte" }] }, tmp());
  assert.equal(m.layers[0].data.features.length, 1);
  const w = warnings.join("\n");
  assert.match(w, /pinta pela coluna "tipo", que não existe/);
  assert.match(w, /"nao-existe.csv" não encontrado/);
  assert.match(w, /não diz de onde vêm os dados/);
});

test("mapa: GeoJSON, GPX (trilha e pontos) e KML (ponto, linha, polígono, dados) viram camadas", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "rede.geojson"), JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { material: "PVC" }, geometry: { type: "LineString", coordinates: [[-46.6, -23.5], [-46.61, -23.51]] } }] }));
  const gpx = `<gpx><wpt lat="-23.5" lon="-46.6"><name>Início</name></wpt><trk><name>Inspeção</name><trkseg><trkpt lat="-23.5" lon="-46.6"/><trkpt lat="-23.51" lon="-46.61"/></trkseg></trk></gpx>`;
  const g = fromGPX(gpx);
  assert.deepEqual(g.map((f) => f.geometry.type), ["LineString", "Point"]);
  assert.equal(g[0].properties.nome, "Inspeção");
  const kml = `<kml><Document>
    <Placemark><name>Medidor 1</name><ExtendedData><Data name="vazao"><value>4,2</value></Data></ExtendedData><Point><coordinates>-46.6,-23.5,0</coordinates></Point></Placemark>
    <Placemark><name>Obra</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-46.6,-23.5 -46.7,-23.5 -46.7,-23.6 -46.6,-23.5</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    <Placemark><name>Adutora</name><LineString><coordinates>-46.6,-23.5 -46.65,-23.55</coordinates></LineString></Placemark></Document></kml>`;
  const k = fromKML(kml);
  assert.deepEqual(k.map((f) => f.geometry.type), ["Point", "Polygon", "LineString"]);
  assert.equal(k[0].properties.vazao, "4,2");
  const { m } = model({ layers: [{ geojson: "rede.geojson", color: "material" }] }, dir);
  assert.equal(m.layers[0].data.features[0].geometry.type, "LineString");
});

test("mapa: valores por estado e por país usam os contornos embutidos e pintam pela escala", () => {
  const { m, warnings } = model({ layers: [{ areas: { SP: 320, rj: 140, BR: 1, XX: 3 } }] }, tmp());
  const names = m.layers[0].data.features.map((f) => f.properties.nome);
  assert.deepEqual(names.slice(0, 2), ["SP", "RJ"]);
  assert.equal(names.length, 3, "SP, RJ e o país BR");
  assert.deepEqual(m.layers[0].style.scale, { min: 1, max: 320 });
  assert.match(warnings.join(), /"XX" não é uma UF/);
});

test("mapa no HTML: o Leaflet só entra em deck com mapa; o fundo vem da configuração; chave de rotas nunca vai para o deck", () => {
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: { url: "http://127.0.0.1:9/{z}/{x}/{y}.png" }, rotas: { url: "https://rotas.exemplo", key: "chave-secreta-123" } }));
  const sem = buildHTML({ title: "t", slides: [{ layout: "statement", text: "oi" }] }).html;
  assert.ok(!sem.includes("Leaflet 1.9"), "deck sem mapa não traz o Leaflet");
  const com = buildHTML({ title: "t", slides: [{ layout: "map", build: true, layers: [{ points: [{ lat: -23.5, lon: -46.6 }] }, { areas: { SP: 1 } }] }] });
  assert.ok(com.html.includes("Leaflet 1.9"));
  assert.ok(com.html.includes("127.0.0.1:9/{z}/{x}/{y}.png"), "o fundo configurado vai junto");
  assert.ok(!com.html.includes("chave-secreta-123"), "a chave de rotas fica na máquina");
  assert.equal((com.html.match(/class="map-step"/g) || []).length, 2, "uma camada por clique");
  assert.deepEqual(com.warnings, []);
});

// ---------------------------------------------------------------------------------------------- no navegador
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
async function tileServer(mode) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (mode.value === "403") { res.writeHead(403); return res.end("proibido"); }
    res.writeHead(200, { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*" }); res.end(PNG);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const PONTOS = [
  { nome: "Centro", lat: -23.5489, lon: -46.6388, status: "Boa" }, { nome: "Pinheiros", lat: -23.5614, lon: -46.702, status: "Moderada" },
  { nome: "Mooca", lat: -23.5596, lon: -46.5996, status: "Ruim" },
];

async function openDeck(browser, slides, tilesUrl) {
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: { url: `${tilesUrl}/{z}/{x}/{y}.png`, attribution: "© colaboradores do OpenStreetMap" } }));
  const dir = tmp(), file = path.join(dir, "deck.html");
  fs.writeFileSync(file, buildHTML({ title: "Mapa", slides }).html);
  const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
  return { page, errors };
}

test("mapa ao vivo: só monta no slide atual; pontos, cartão ao clicar, legenda que esconde categoria, camada por clique e arrastar", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const mode = { value: "ok" };
  const tiles = await tileServer(mode);
  try {
    const { page: p, errors } = await openDeck(browser, [
      { layout: "statement", text: "Antes do mapa" },
      { layout: "map", title: "Estações", build: true, layers: [{ name: "Estações", points: PONTOS, color: "status", label: "nome" }, { name: "Área", areas: { SP: 1 }, view: "fit" }] },
    ], tiles.url);
    await p.waitForTimeout(800);
    assert.equal(tiles.hits.length, 0, "no slide 1 nenhum tile é pedido");
    assert.equal(await p.locator(".leaflet-container").count(), 0, "e o mapa nem monta");
    await p.evaluate(() => window.sagadeck.goto(1, 0));
    await p.waitForSelector('.map-box[data-map-mounted="ready"]');
    await p.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0);
    assert.ok(tiles.hits.length > 0, "no slide do mapa os tiles chegam");
    assert.match(await p.textContent(".leaflet-control-attribution"), /OpenStreetMap/, "atribuição visível");
    // passo 0: nenhuma camada (as duas têm passo); passo 1: os pontos
    assert.equal(await p.locator(".slide.current path.leaflet-interactive").count(), 0);
    await p.evaluate(() => window.sagadeck.goto(1, 1));
    await p.waitForFunction(() => document.querySelectorAll(".slide.current path.leaflet-interactive").length === 3);
    // cartão ao clicar num ponto
    await p.locator(".map-label", { hasText: "Mooca" }).waitFor();
    await p.evaluate(() => { const box = document.querySelector(".slide.current .map-box"); const paths = box.querySelectorAll("path.leaflet-interactive"); paths[2].dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await p.locator(".map-card", { hasText: "Ruim" }).waitFor();
    // legenda: clicar em "Moderada" esconde os pontos dessa categoria
    await p.click('.map-leg-cat[data-cat="Moderada"]');
    await p.waitForFunction(() => document.querySelectorAll(".slide.current path.leaflet-interactive").length === 2);
    assert.equal(await p.evaluate(() => window.sagadeck.cur), 1, "clicar no mapa não troca de slide");
    // passo 2: a área entra
    await p.evaluate(() => window.sagadeck.goto(1, 2));
    await p.waitForFunction(() => document.querySelectorAll(".slide.current path.leaflet-interactive").length === 3);
    // arrastar move o mapa (o slide está escalado; o Leaflet compensa)
    const box = await p.locator(".slide.current .map-live").boundingBox();
    const before = await p.evaluate(() => document.querySelector(".slide.current .leaflet-map-pane").style.transform);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 }); await p.mouse.up();
    assert.notEqual(await p.evaluate(() => document.querySelector(".slide.current .leaflet-map-pane").style.transform), before, "arrastar moveu o mapa");
    assert.equal(await p.evaluate(() => window.sagadeck.cur), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await tiles.close(); }
});

test("mapa ao vivo: serviço de tiles que recusa (403) recebe poucos pedidos e para; aviso aparece, camadas ficam, outro mapa nem tenta", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const mode = { value: "403" };
  const tiles = await tileServer(mode);
  try {
    const { page: p, errors } = await openDeck(browser, [
      { layout: "map", title: "Um", layers: [{ points: PONTOS }] },
      { layout: "map", title: "Dois", layers: [{ points: PONTOS }] },
    ], tiles.url);
    await p.waitForSelector(".slide.current .map-notice");
    assert.match(await p.textContent(".slide.current .map-notice"), /indisponível nesta rede/);
    const n = tiles.hits.length;
    assert.equal(n, 1, `pedidos de tile: ${n} (uma tentativa e para)`);
    assert.equal(await p.locator(".slide.current path.leaflet-interactive").count(), 3, "as camadas continuam");
    await p.waitForTimeout(600);
    await p.evaluate(() => window.sagadeck.goto(1, 0));
    await p.waitForSelector('.slide.current .map-box[data-map-mounted="ready"]');
    await p.waitForTimeout(600);
    assert.equal(tiles.hits.length, n, "o segundo mapa não tenta de novo");
    assert.match(await p.textContent(".slide.current .map-notice"), /Tentar de novo/);
    assert.deepEqual(errors.filter((e) => !/403|Failed to load resource/.test(e)), []);
  } finally { await browser.close(); await tiles.close(); }
});

test("exportação: deck com mapa abre por endereço local e a foto do slide espera o mapa (tiles carregados)", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const tiles = await tileServer({ value: "ok" });
  const { openDeck: abrir, settleSlide } = await import("../src/export/browser.js");
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: { url: `${tiles.url}/{z}/{x}/{y}.png` } }));
  const dir = tmp(), file = path.join(dir, "deck.html");
  fs.writeFileSync(file, buildHTML({ title: "Mapa", slides: [{ layout: "statement", text: "a" }, { layout: "map", title: "Estações", layers: [{ points: PONTOS }] }] }).html);
  const { browser: b, page } = await abrir(file);
  try {
    assert.match(page.url(), /^http:\/\/127\.0\.0\.1:\d+\/deck\.html\?export=1$/, "abre por endereço local, não como arquivo");
    await page.evaluate(() => window.sagadeck.goto(1, 0));
    await settleSlide(page);
    assert.equal(await page.evaluate(() => document.querySelector(".slide.current .map-box").dataset.mapMounted), "ready");
    assert.ok(await page.evaluate(() => document.querySelectorAll(".slide.current .leaflet-tile-loaded").length) > 0, "a foto sai com o fundo");
    assert.equal(await page.locator(".slide.current .leaflet-control-zoom").isVisible(), false, "sem botões de zoom na imagem");
  } finally { await b.close(); await tiles.close(); }
});
