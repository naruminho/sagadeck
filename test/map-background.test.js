// Fundos de dados: o litoral continua visível, sem a fronteira marítima parecer uma segunda costa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { ROOT, browserOrSkip, newPage, tempDeck, startStudio } from "./helpers.js";
import { buildHTML } from "../src/build.js";
import { loadMapConfig, tilesForDeck } from "../src/map-config.js";

test("fundos claro e escuro usam mapas vetoriais sem chave; configuração antiga de tiles continua valendo", () => {
  const cfg = loadMapConfig(path.join(process.env.SAGADECK_HOME, "sem-configuracao.json"));
  assert.equal(cfg.claro?.tipo, "vetorial");
  assert.equal(cfg.escuro?.tipo, "vetorial");
  assert.match(cfg.claro.url, /openfreemap\.org\/styles\/positron$/);
  assert.match(cfg.escuro.url, /openfreemap\.org\/styles\/dark$/);
  assert.equal(tilesForDeck(cfg).claro.tipo, "vetorial");
  const file = path.join(process.env.SAGADECK_HOME, "fundo-personalizado.json");
  fs.writeFileSync(file, JSON.stringify({ tiles: { url: "https://mapas.exemplo/{z}/{x}/{y}.png", attribution: "Mapa da organização" } }));
  const custom = loadMapConfig(file);
  assert.equal(custom.claro.url, custom.tiles.url, "o servidor de fundo escolhido pela pessoa vale também para o modo claro");
  assert.equal(custom.escuro.url, custom.tiles.url);
  assert.equal(custom.claro.tipo, "raster");
  fs.writeFileSync(file, JSON.stringify({ tiles: null }));
  assert.equal(loadMapConfig(file).claro, null, "desligar os tiles também desliga os fundos de dados");
});

test("fundo vetorial: recusa no estilo ou no primeiro tile faz uma tentativa e para; camadas e botão de retentar continuam", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-fundo-"));
  const origin = "https://mapa.exemplo";
  try {
    fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ claro: { url: `${origin}/styles/mapa.json` } }));
    const file = path.join(dir, "deck.html");
    fs.writeFileSync(file, buildHTML({ title: "Mapa", slides: [1, 2].map((i) => ({ layout: "map", basemap: "claro", title: `Mapa ${i}`, view: { center: [0, 0], zoom: 8 }, layers: [{ points: [{ latitude: 0, longitude: 0, nome: "Sensor" }] }] })) }).html);
    for (const where of ["estilo", "tile"]) await t.test(where, async () => {
      const { page, errors } = await newPage(browser);
      const hits = [];
      await page.route(`${origin}/**`, (route) => {
        const url = new URL(route.request().url()); hits.push(url.pathname);
        if (url.pathname === "/styles/mapa.json" && where === "tile") return route.fulfill({ json: { version: 8, sources: { data: { type: "vector", url: "../data/tiles.json" } }, layers: [{ id: "land", type: "fill", source: "data", "source-layer": "land" }] } });
        if (url.pathname === "/data/tiles.json") return route.fulfill({ json: { tilejson: "3.0.0", tiles: ["./{z}/{x}/{y}.pbf"] } });
        return route.fulfill({ status: 403, body: "recusado" });
      });
      try {
        await page.goto(pathToFileURL(file).href);
        await page.waitForSelector(".slide.current .map-notice button");
        assert.deepEqual(hits, where === "tile" ? ["/styles/mapa.json", "/data/tiles.json", "/data/7/64/64.pbf"] : ["/styles/mapa.json"], "recusa termina no primeiro pedido real");
        assert.equal(await page.locator(".slide.current path.leaflet-interactive").count(), 1, "dados continuam no mapa");
        const n = hits.length;
        await page.evaluate(() => window.sagadeck.goto(1, 0));
        await page.waitForSelector(".slide.current .map-notice button");
        assert.equal(hits.length, n, "outro mapa não repete o pedido recusado");
        await page.click(".slide.current .map-notice button");
        await page.waitForFunction(() => document.querySelector('.slide.current .map-box[data-map-mounted="ready"] .map-notice button'));
        assert.equal(hits.length, 2 * n, "botão libera uma nova tentativa");
        assert.deepEqual(errors.filter((e) => !/403|Failed to load resource/.test(e)).map((e) => e.split("\n")[0]), []);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Studio fornece o renderizador local do fundo; bibliotecas e worker não dependem de CDN", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  fs.writeFileSync(deck.file, "title: Mapa\nslides:\n  - layout: map\n    basemap: claro\n    title: Litoral\n    view: { center: [0, 0], zoom: 8 }\n    layers: []\n");
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ claro: { url: "https://mapa.exemplo/estilo.json" } }));
  const studio = await startStudio(deck.file);
  try {
    const { page, errors } = await newPage(browser);
    await page.route("https://mapa.exemplo/estilo.json", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "water", type: "background", paint: { "background-color": "#dce9f0" } }] } }));
    await page.addInitScript(() => localStorage.setItem("sagadeck.paneOnLoad", JSON.stringify("props")));
    await page.goto(studio.url);
    await page.waitForFunction(() => [...document.querySelectorAll(".map-box")].some((box) => window.SagaMap?.instance(box)?.background?.getMap()?.loaded()));
    assert.ok(await page.locator(".maplibregl-canvas").count() > 0);
    for (const file of ["map-background.js", "maplibre-gl.js", "maplibre-gl.css", "maplibre-worker.js", "maplibre-leaflet.js"]) {
      const response = await page.request.get(`${studio.url}/${file}`);
      assert.equal(response.status(), 200, file);
    }
    await page.locator("#slide-fields-form").getByRole("button", { name: "Configurar mapa", exact: true }).click();
    await page.fill('[data-k="claro"][data-f="url"]', "https://mapa.exemplo/outro-estilo.json");
    await page.fill('[data-k="escuro"][data-f="url"]', "https://mapa.exemplo/{z}/{x}/{y}.png");
    const save = () => Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/mapa") && r.request().method() === "POST"), page.click("#map-settings-dialog [data-save]")]);
    await save();
    await page.locator("#map-settings-dialog [data-status]", { hasText: "Salvo." }).waitFor();
    let saved = JSON.parse(fs.readFileSync(process.env.SAGADECK_MAPA, "utf8"));
    assert.equal(saved.claro.url, "https://mapa.exemplo/outro-estilo.json", "fundo claro gravado na configuração da máquina");
    assert.equal(loadMapConfig().escuro.tipo, "raster", "tiles escolhidos no formulário continuam aceitos");
    await page.fill('[data-k="claro"][data-f="url"]', "");
    await save();
    await page.waitForFunction(() => document.querySelector('#map-settings-dialog [data-status]').textContent.startsWith("Salvo."));
    saved = loadMapConfig();
    assert.match(saved.claro.url, /openfreemap\.org\/styles\/positron$/, "campo em branco restaura o fundo padrão");
    assert.deepEqual(errors.map((e) => e.split("\n")[0]), []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});

test("fundo vetorial no HTML de arquivo único: litoral visível, fronteira marítima oculta e mapa retomado sem perder a câmera", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-fundo-"));
  const styleURL = "https://mapa.exemplo/estilo.json";
  const feature = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
  const style = { version: 8, sources: { coast: { type: "geojson", data: { type: "FeatureCollection", features: [
    feature({ type: "Polygon", coordinates: [[[-4, -4], [0, -4], [0, 4], [-4, 4], [-4, -4]]] }),
    feature({ type: "LineString", coordinates: [[1, -4], [1, 4]] }, { maritime: 1 }),
    feature({ type: "LineString", coordinates: [[-1, -4], [-1, 4]] }, { maritime: 0 }),
  ] } } }, layers: [
    { id: "water", type: "background", paint: { "background-color": "#dce9f0" } },
    { id: "land", type: "fill", source: "coast", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#eeeeee" } },
    { id: "boundary_country", type: "line", source: "coast", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ff0000", "line-width": 6 } },
  ] };
  try {
    fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ claro: { url: styleURL }, escuro: { url: styleURL } }));
    const file = path.join(dir, "deck.html");
    fs.writeFileSync(file, buildHTML({ title: "Litoral", slides: [
      { layout: "statement", text: "Antes do mapa" },
      ...["claro", "escuro"].map((basemap) => ({ layout: "map", basemap, title: basemap, view: { center: [0, 0], zoom: 8 }, layers: [] })),
    ] }).html);
    const { page, errors } = await newPage(browser);
    // Exercita o limite de 8 s da exportação sem gastar 8 s reais. Os outros timers continuam normais.
    await page.addInitScript(() => { const timer = window.setTimeout; window.setTimeout = (fn, delay, ...args) => timer(fn, delay === 8000 ? 40 : delay, ...args); });
    let requests = 0, held;
    await page.route(styleURL, (route) => { requests++; if (requests === 4) { held = route; return; } return route.fulfill({ json: style }); });
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.evaluate(() => !!window.maplibregl), false, "renderizador só entra no primeiro mapa");
    assert.equal(requests, 0);
    await page.evaluate(() => window.sagadeck.goto(1, 0));
    await page.waitForFunction(() => window.SagaMap?.instance(document.querySelector(".slide.current .map-box"))?.tilesDone);
    assert.equal(await page.locator(".slide.current .map-notice").count(), 0, `worker embutido funciona também em file://: ${await page.evaluate(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).background?.getError())}`);
    const coast = await page.evaluate(() => {
      const st = window.SagaMap.instance(document.querySelector(".slide.current .map-box")), gl = st.background.getMap();
      const hit = (lng) => gl.queryRenderedFeatures(gl.project([lng, 0]), { layers: ["boundary_country"] }).length;
      const paint = (lng) => {
        const p = gl.project([lng, 0]), canvas = gl.getCanvas(), ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
        const pixel = new Uint8Array(4), ratio = canvas.width / canvas.clientWidth;
        ctx.readPixels(Math.floor(p.x * ratio), Math.floor(canvas.height - p.y * ratio - 1), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        return [...pixel].slice(0, 3);
      };
      return { seaBoundary: hit(1), inlandBoundary: hit(-1), land: paint(-0.5), sea: paint(0.5) };
    });
    assert.equal(coast.seaBoundary, 0, "linha no mar não aparece");
    assert.ok(coast.inlandBoundary > 0, "divisa terrestre continua");
    assert.deepEqual(coast.land, [238, 238, 238]);
    assert.deepEqual(coast.sea, [220, 233, 240], "mar azul distingue o litoral verdadeiro");
    await page.evaluate(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).map.panTo([0.2, 0.2], { animate: false }));
    const before = await page.evaluate(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).map.getCenter());
    await page.evaluate(() => window.sagadeck.goto(2, 0));
    await page.waitForFunction(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box"))?.tilesDone);
    assert.equal(await page.locator(".maplibregl-canvas").count(), 1, "só o slide atual mantém um contexto gráfico");
    await page.evaluate(() => window.sagadeck.goto(1, 0));
    await page.waitForFunction(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box"))?.tilesDone);
    assert.equal(await page.locator(".maplibregl-canvas").count(), 1);
    const center = await page.evaluate(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).map.getCenter());
    assert.deepEqual(center, before, "voltar preserva a câmera");
    await page.evaluate(() => window.sagadeck.goto(0, 0));
    await page.waitForFunction(() => !document.querySelector(".maplibregl-canvas"));
    // O próximo estilo não responde: voltar ao mapa também deve respeitar o limite da exportação.
    await page.evaluate(() => window.sagadeck.goto(1, 0));
    await page.evaluate(() => { window.exportReady = false; window.SagaMap.settled().then(() => { window.exportReady = true; }); });
    await page.waitForFunction(() => window.exportReady, null, { timeout: 1000 });
    assert.equal(await page.evaluate(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).tilesDone), false, "a exportação não espera um serviço indefinidamente");
    assert.ok(held, "o pedido de fundo estava pendente");
    await held.fulfill({ json: style });
    await page.waitForFunction(() => window.SagaMap.instance(document.querySelector(".slide.current .map-box")).tilesDone);
    assert.deepEqual(errors.map((e) => e.split("\n")[0]), []);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("estilo do fundo esconde só a fronteira marítima e preserva o litoral e as divisas em terra", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "src/runtime/map-background.js"), "utf8"), context);
  const original = { version: 8, sources: {}, layers: [
    { id: "water", type: "fill", "source-layer": "water", paint: { "fill-color": "#dce9f0" } },
    { id: "boundary_country", type: "line", "source-layer": "boundary", filter: ["==", ["get", "admin_level"], 2] },
    { id: "boundary_state", type: "line", "source-layer": "boundary", filter: ["==", "admin_level", 4] },
  ] };
  const style = JSON.parse(JSON.stringify(context.window.SagaMapBackground.styleForMap(original)));
  assert.deepEqual(style.layers[0], original.layers[0], "água e litoral mantêm o desenho");
  for (const layer of style.layers.slice(1)) {
    assert.match(JSON.stringify(layer.filter), /maritime/);
    assert.match(JSON.stringify(layer.filter), /admin_level/);
    assert.notDeepEqual(layer.filter, original.layers.find((x) => x.id === layer.id).filter);
  }
  assert.ok(!JSON.stringify(original).includes("maritime"), "o estilo recebido não foi alterado");
});
