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

// Pedido de Narumi ("isso não parece certo"): com uma camada por região, cada uma tinha a própria escala e a Bahia
// (2.900) saía tão forte quanto Minas (5.100). Camadas da mesma medida dividem a escala.
test("mapa: camadas da mesma medida dividem a escala; medida diferente fica com a sua", () => {
  const m = mapModel({ layers: [{ name: "Sudeste", areas: { SP: 4200, MG: 5100, ES: 600 }, legend: "MW" }, { name: "Nordeste", areas: { BA: 2900, PE: 1200 }, legend: "MW" },
    { name: "Gente", areas: { SP: 46, MG: 21 }, legend: "milhões" }] }, {});
  assert.deepEqual(m.layers.map((l) => l.style.scale), [{ min: 600, max: 5100 }, { min: 600, max: 5100 }, { min: 21, max: 46 }]);
});

// Os contornos embutidos têm de bater com o fundo do mapa. Simplificados a 4 km (malha mínima), o litoral e as divisas
// viravam poucos segmentos retos (o Distrito Federal era um octógono) e Rio e Vitória caíam na borda.
test("mapa: contornos dos estados detalhados (segmento médio de até 8 km) e com a área certa", async () => {
  const { geoContornos } = await import("../src/map.js");
  const g = geoContornos();
  const R = 6371.0088, rad = Math.PI / 180;
  const km = ([lo1, la1], [lo2, la2]) => 2 * R * Math.asin(Math.sqrt(Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2));
  const media = (uf) => { let soma = 0, n = 0; for (const poly of g.uf[uf]) for (const r of poly) for (let i = 1; i < r.length; i++) { soma += km(r[i - 1], r[i]); n++; } return soma / n; };
  // o litoral (no interior há divisas que são retas de verdade: Acre, Mato Grosso, o DF)
  const grosseiros = ["RJ", "ES", "SP", "PR", "SC", "RS", "BA", "SE", "AL", "PE", "PB", "RN", "CE"].map((uf) => [uf, Math.round(media(uf))]).filter(([, m]) => m > 8);
  assert.deepEqual(grosseiros, [], "estados com contorno grosseiro (km por segmento)");
  const anel = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) { const [lo1, la1] = r[i], [lo2, la2] = r[i + 1]; s += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad)); } return Math.abs((s * R * R) / 2); };
  const area = (uf) => g.uf[uf].reduce((a, p) => a + anel(p[0]) - p.slice(1).reduce((h, r) => h + anel(r), 0), 0);
  for (const [uf, oficial] of Object.entries({ RJ: 43750, ES: 46074, SP: 248219, DF: 5760 })) assert.ok(Math.abs(area(uf) - oficial) / oficial < 0.02, `${uf}: ${Math.round(area(uf))} km² (IBGE: ${oficial})`);
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
    // a área entrou depois, mas os pontos continuam por cima: clicar no ponto pega o ponto, não a área
    const onTop = await p.evaluate(() => {
      const inst = window.SagaMap.instance(document.querySelector(".slide.current .map-box"));
      return inst.layers[0].g.getLayers().filter((l) => inst.map.hasLayer(l)).map((l) => { const r = l._path.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === l._path ? "ok" : inst.layers[0].g.getLayers().some((o) => o._path === el) ? "ok" : "outra camada"; });
    });
    assert.deepEqual([...new Set(onTop)], ["ok"], "pontos ficam por cima das áreas (um ponto pode encostar no outro)");
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

test("mapa: geojson pode vir escrito no próprio slide (FeatureCollection, Feature ou só a geometria)", () => {
  const linha = { type: "LineString", coordinates: [[-46.66, -23.556], [-46.64, -23.57]] };
  const { m, warnings } = model({ layers: [
    { name: "Coleção", geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: { nome: "Avenida" }, geometry: linha }] } },
    { name: "Só a geometria", geojson: linha },
  ] }, tmp());
  assert.deepEqual(warnings, []);
  assert.equal(m.layers[0].data.features[0].properties.nome, "Avenida");
  assert.equal(m.layers[1].data.features[0].geometry.type, "LineString");
  assert.equal(m.layers[0].source, null, "escrito no slide não tem arquivo de origem");
});

// A faixa em volta de uma linha é uma pilha de pedaços sobrepostos (lineBuffer). Ao vivo, o contorno de cada pedaço
// aparecia e o preenchimento "par ou ímpar" abria buracos onde eles se cruzam: agora sai como uma mancha só.
test("mapa ao vivo: faixa em volta de uma linha sem contorno e preenchida como união (sem buracos)", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { lineBuffer } = await import("../src/map-analysis.js");
  const tiles = await tileServer({ value: "ok" });
  try {
    const linha = { type: "LineString", coordinates: [[-46.66, -23.56], [-46.655, -23.565], [-46.65, -23.56], [-46.645, -23.57]] };
    const { page: p, errors } = await openDeck(browser, [{ layout: "map", title: "Faixa", layers: [
      { name: "Faixa", geojson: { type: "Feature", properties: { nome: "200 m", _faixa: true }, geometry: lineBuffer(linha, 200) } },
      { name: "Área", geojson: { type: "Feature", properties: { nome: "Quadra" }, geometry: { type: "Polygon", coordinates: [[[-46.64, -23.55], [-46.63, -23.55], [-46.63, -23.56], [-46.64, -23.55]]] } } }] }], tiles.url);
    await p.waitForSelector('.map-box[data-map-mounted="ready"]');
    const paths = await p.evaluate(() => [...document.querySelectorAll(".slide.current path.leaflet-interactive")].map((x) => ({ w: x.getAttribute("stroke-width"), regra: x.getAttribute("fill-rule") })));
    assert.deepEqual(paths, [{ w: "0", regra: "nonzero" }, { w: "2", regra: "evenodd" }], "a faixa sem contorno e unida; a área comum como antes");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await tiles.close(); }
});

// Pedido de Narumi: "os pontos estão com círculos meio grandes e feios de tão simples". Ponto: pequeno, na cor, com
// anel branco e sombra; bolha (tamanho pela coluna): translúcida com o contorno da mesma cor.
test("mapa ao vivo: rótulos sem caixa opaca preservam o desenho e a leitura em temas claros e escuros", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const dir = tmp();
  try {
    for (const theme of ["editorial", "noite"]) {
      const file = path.join(dir, `${theme}.html`);
      fs.writeFileSync(file, buildHTML({ title: "Rótulos", theme, slides: [{ layout: "map", basemap: "nenhum", layers: [
        { name: "Lugares", points: PONTOS, label: "nome" },
        { name: "Caminho", geojson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-46.6388, -23.5489], [-46.702, -23.5614]] } } },
      ] }] }).html);
      const { page: p, errors } = await newPage(browser, pathToFileURL(file).href);
      await p.waitForSelector('.map-box[data-map-mounted="ready"]');
      const labels = await p.locator('.map-label').evaluateAll(elements => elements.map(el => {
        const css = getComputedStyle(el);
        return { name: el.textContent, background: css.backgroundColor, boxShadow: css.boxShadow, textShadow: css.textShadow, border: css.borderTopWidth, pointerEvents: css.pointerEvents };
      }));
      assert.deepEqual(labels.map(x => x.name), PONTOS.map(x => x.nome));
      for (const label of labels) {
        assert.equal(label.background, "rgba(0, 0, 0, 0)", `${theme}: o fundo do rótulo não cobre o mapa`);
        assert.equal(label.boxShadow, "none", "sem sombra de uma caixa retangular");
        assert.equal(label.border, "0px");
        assert.notEqual(label.textShadow, "none", "contorno no texto mantém a leitura sobre o desenho");
        assert.equal(label.pointerEvents, "none", "rótulo não bloqueia os cliques no mapa");
      }
      await p.locator('.map-pt').nth(2).click();
      await p.locator('.map-card', { hasText: "Mooca" }).waitFor();
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("mapa ao vivo: ponto pequeno com anel branco e sombra; bolha translúcida com contorno da mesma cor", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const tiles = await tileServer({ value: "ok" });
  try {
    const { page: p, errors } = await openDeck(browser, [{ layout: "map", title: "Pontos", layers: [
      { name: "Pontos", points: [{ nome: "A", lat: -23.55, lon: -46.63 }], color: "em" },
      { name: "Bolhas", points: [{ nome: "B", lat: -23.56, lon: -46.64, n: 10 }, { nome: "C", lat: -23.57, lon: -46.62, n: 40 }], size: "n", color: "hi" }] }], tiles.url);
    await p.waitForSelector('.map-box[data-map-mounted="ready"]');
    const r = await p.evaluate(() => [...document.querySelectorAll(".slide.current path.leaflet-interactive")].map((x) => ({ cls: x.getAttribute("class").match(/map-(pt|bubble)/)?.[0], stroke: x.getAttribute("stroke"), fill: x.getAttribute("fill"), op: x.getAttribute("fill-opacity"), filtro: getComputedStyle(x).filter })));
    const pt = r.find((x) => x.cls === "map-pt"), bolhas = r.filter((x) => x.cls === "map-bubble");
    assert.equal(pt.stroke, "#fff"); assert.equal(pt.op, "1"); assert.match(pt.filtro, /drop-shadow/);
    assert.equal(bolhas.length, 2);
    for (const b of bolhas) { assert.equal(b.stroke, b.fill, "contorno da mesma cor"); assert.equal(b.op, "0.5"); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await tiles.close(); }
});

// Pedido de Narumi ("a área ainda não está em cima dos estados"): no fundo claro, o filtro cinza deixava terra e mar
// iguais, e a fronteira marítima do OpenStreetMap (12 milhas mar adentro) parecia o litoral. O mar guarda um azul leve.
test("fundo claro: o filtro não apaga a diferença entre terra e mar", () => {
  const css = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "src", "runtime", "base.css"), "utf8");
  const claro = css.match(/\.map-box\[data-basemap="claro"\] \.leaflet-tile-pane\{filter:([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(claro, /grayscale\(1\)/);
  assert.match(claro, /saturate\(0?\.\d+\)/);
});
