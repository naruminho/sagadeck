// Editor do mapa no Studio, usado como a pessoa usaria. Pedido de Narumi ("não consigo clicar pra editar, não sei como
// edita, não sei se tem uma tela diferente"): "Editar mapa" abre uma tela própria, com as camadas à esquerda, o mapa
// grande com as ferramentas e as propriedades do que está selecionado à direita. Endereço e rotas vêm de servidores
// falsos; nada pede tile (SAGADECK_MAPA sem fundo).
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck, listenSafe } from "./helpers.js";

async function services() {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    res.writeHead(200, { "Content-Type": "application/json" });
    if (u.pathname === "/reverse") return res.end(JSON.stringify({ display_name: "Rua Nova, 1" }));
    const m = u.pathname.match(/^\/route\/v1\/\w+\/(.+)$/);
    if (m) {
      const pts = m[1].split(";").map((p) => p.split(",").map(Number));
      const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2 + 0.0005];
      return res.end(JSON.stringify({ routes: [{ distance: 500, duration: 360, geometry: { coordinates: [pts[0], mid, pts[1]] } }] }));
    }
    res.end("[]");
  });
  await listenSafe(server);
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
const until = async (p, fn, what, ms = 8000) => { for (let t = 0; t < ms / 100; t++) { if (await fn()) return; await p.waitForTimeout(100); } assert.fail(`não aconteceu: ${what}`); };
// posição na tela de um item do mapa do editor (camada li, item k), para clicar ou arrastar como a pessoa
const itemAt = (p, li, k = 0) => p.evaluate(([li, k]) => {
  const inst = window.SagaMap.instance(document.querySelector(".mpe .mpe-box"));
  const e = inst.layers.find((x) => x.layer.index === li), lyr = e.g.getLayers()[k];
  const ll = lyr.getLatLng ? lyr.getLatLng() : lyr.getLatLngs().flat(2)[0];
  const pt = inst.map.latLngToContainerPoint(ll), r = inst.map.getContainer().getBoundingClientRect();
  return [r.left + pt.x, r.top + pt.y];
}, [li, k]);
const ready = (p) => p.waitForSelector('.mpe .mpe-box[data-mpe-ready="1"]', { timeout: 15000 });

test("Editar mapa: tela própria; ponto novo com endereço vai para a planilha e o nome se digita nas propriedades; linha pelas ruas vai para o GeoJSON; arrastar, rótulo e vista gravam", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const svc = await services();
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, geocoder: { url: svc.url, porSegundo: 200 }, rotas: { provedor: "osrm", url: svc.url } }));
  const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-mapa-src-")), "deck.yaml");
  fs.writeFileSync(src, YAML.stringify({ title: "Rede de água", slides: [{ layout: "map", title: "Rede", view: { center: [-23.55, -46.63], zoom: 15 }, layers: [
    { name: "Medidores", points: "contexto/medidores.csv", label: "nome" }, { name: "Rede", geojson: "contexto/rede.geojson" }] }] }));
  const deck = tempDeck(src);
  fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
  const csv = path.join(deck.dir, "contexto", "medidores.csv"), geo = path.join(deck.dir, "contexto", "rede.geojson");
  fs.writeFileSync(csv, "nome;endereco;latitude;longitude\nM1;Rua A;-23.55;-46.63\n");
  fs.writeFileSync(geo, JSON.stringify({ type: "FeatureCollection", features: [] }));
  const studio = await startStudio(deck.file);
  try {
    await fetch(studio.url + "/api/mapa/tentar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8"));
    await p.waitForSelector('#rendered-slide-container .map-box[data-map-mounted="ready"]', { timeout: 15000 });
    await p.click("#canvas-viewport > .me-open");
    await ready(p);
    // a tela: camadas à esquerda (com o tipo e quantos itens), ferramentas, dica e as propriedades da camada
    assert.match(await p.textContent(".mpe [data-layers]"), /Medidores[\s\S]*1 ponto[\s\S]*Rede[\s\S]*0 formas/);
    assert.match(await p.textContent(".mpe [data-tip]"), /Clique num ponto, linha, área ou região/);
    assert.match(await p.textContent(".mpe [data-props]"), /Nome na legenda[\s\S]*Planilha contexto\/medidores\.csv[\s\S]*Cor[\s\S]*Rótulo escrito no mapa/);
    const box = await p.locator(".mpe .map-live").boundingBox();
    const at = (dx, dy) => [box.x + box.width / 2 + dx, box.y + box.height / 2 + dy];
    // ponto novo: o endereço vem do serviço; o ponto fica selecionado e o nome se digita nas propriedades
    await p.click('.mpe [data-mode="ponto"]');
    assert.match(await p.textContent(".mpe [data-tip]"), /Ele entra em "Medidores"/);
    await p.mouse.click(...at(120, 40));
    await until(p, () => /Rua Nova/.test(fs.readFileSync(csv, "utf8")), "o ponto na planilha");
    assert.match(fs.readFileSync(csv, "utf8").trim().split(/\r?\n/)[2], /^;Rua Nova, 1;-23\.5\d+;-46\.6\d+$/, "ponto com endereço e posição do clique");
    await p.waitForSelector('.mpe [data-props] input[data-fp="nome"]');
    assert.match(await p.textContent(".mpe [data-props]"), /Ponto · em "Medidores"[\s\S]*linha 3/);
    assert.match(await p.textContent('.mpe [data-props] label:has([data-fp="nome"])'), /Aparece escrito ao lado, no mapa/, "o campo diz o que faz no mapa");
    assert.match(await p.textContent('.mpe [data-props] label:has([data-fp="endereco"])'), /Veio do lugar clicado/);
    await until(p, () => p.evaluate(() => document.activeElement?.dataset?.fp === "nome"), "o foco no nome");
    await p.keyboard.type("M2"); await p.keyboard.press("Tab");
    await until(p, () => /^M2;Rua Nova/m.test(fs.readFileSync(csv, "utf8")), "o nome gravado");
    await until(p, async () => /2 pontos/.test(await p.textContent(".mpe [data-layers]")), "a contagem da camada");
    // linha seguindo as ruas: dois cliques e Enter; vai para o GeoJSON e o nome se digita do mesmo jeito
    await p.click('.mpe [data-mode="linha"]');
    assert.equal(await p.isVisible(".mpe [data-route]"), true, "Seguir as ruas aparece com a Linha");
    await p.mouse.click(...at(-150, -60));
    await p.mouse.click(...at(-40, -100));
    await until(p, () => svc.hits.some((h) => h.startsWith("/route/")), "a rota pedida ao serviço");
    await p.waitForTimeout(300);
    await p.keyboard.press("Enter");
    await until(p, () => JSON.parse(fs.readFileSync(geo, "utf8")).features.length === 1, "a linha no GeoJSON");
    const f = JSON.parse(fs.readFileSync(geo, "utf8")).features[0];
    assert.equal(f.geometry.type, "LineString");
    assert.equal(f.geometry.coordinates.length, 3, "o trecho veio do serviço de rotas (com o ponto do meio)");
    await p.waitForSelector('.mpe [data-props] input[data-fp="nome"]');
    assert.match(await p.textContent(".mpe [data-props]"), /Linha · em "Rede"[\s\S]*Comprimento/);
    await p.fill('.mpe [data-props] input[data-fp="nome"]', "Trecho 1"); await p.keyboard.press("Tab");
    await until(p, () => JSON.parse(fs.readFileSync(geo, "utf8")).features[0].properties.nome === "Trecho 1", "o nome da linha");
    // arrastar o primeiro ponto (modo Selecionar): a planilha acompanha
    await p.keyboard.press("Escape");
    await p.click('.mpe [data-mode="selecionar"]');
    await ready(p);
    const before = fs.readFileSync(csv, "utf8").split(/\r?\n/)[1];
    const [x, y] = await itemAt(p, 0, 0);
    await p.mouse.move(x, y); await p.mouse.down();
    await p.mouse.move(x + 60, y + 30, { steps: 6 }); await p.mouse.up();
    await until(p, () => fs.readFileSync(csv, "utf8").split(/\r?\n/)[1] !== before, "a posição nova na planilha");
    assert.match(fs.readFileSync(csv, "utf8").split(/\r?\n/)[1], /^M1;Rua A;/);
    // propriedades da camada: o rótulo passa a ser o endereço (no deck salvo)
    await ready(p);
    await p.click('.mpe [data-pick="0"]');
    await p.selectOption('.mpe [data-props] select[data-lp="label"]', "endereco");
    await until(p, () => saved().slides[0].layers[0].label === "endereco", "o rótulo no deck");
    // vista de agora: o enquadramento vai para o slide
    await ready(p);
    const v0 = JSON.stringify(saved().slides[0].view);
    await p.mouse.move(...at(0, 0)); await p.mouse.wheel(0, -400); await p.waitForTimeout(600);
    await p.click(".mpe [data-vista]");
    await until(p, () => JSON.stringify(saved().slides[0].view) !== v0, "a vista nova no deck");
    // Concluir fecha a tela e volta o botão
    await p.click(".mpe [data-fim]");
    assert.equal(await p.locator(".mpe").count(), 0);
    assert.equal(await p.isVisible("#canvas-viewport > .me-open"), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await svc.close(); }
});

test("Editar mapa na demo oficial (prévia): camadas escritas no slide se editam; a primeira mudança cria a cópia e grava nela", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null }));
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor?model=conheca&topic=Modelos`);
    const copies = () => { const d = path.join(studio.library, "Modelos"); return fs.existsSync(d) ? fs.readdirSync(d) : []; };
    const idx = await p.evaluate(async () => { for (let k = 0; k < 50; k++) { const d = await (await fetch("api/deck")).json(); const i = d.spec?.slides?.findIndex((s) => s.layout === "map" && /1 km/.test(s.title)); if (i >= 0) return i; await new Promise((r) => setTimeout(r, 100)); } return -1; });
    assert.ok(idx > 0, "o tour tem o mapa da cobertura");
    await p.waitForSelector("#thumbnails-list > *");
    await p.evaluate((i) => document.querySelectorAll("#thumbnails-list > *")[i].click(), idx);
    await p.waitForSelector('#rendered-slide-container .map-box[data-map-mounted="ready"]', { timeout: 15000 });
    await p.dblclick("#rendered-slide-container .map-box"); // dois cliques no mapa também abrem a tela
    await ready(p);
    assert.deepEqual(copies(), [], "abrir a tela não cria nada");
    assert.match(await p.textContent(".mpe [data-layers]"), /Estações[\s\S]*5 pontos/);
    // clicar numa estação: as propriedades dela, editáveis (ela está escrita no slide)
    await p.mouse.click(...(await itemAt(p, 0, 0)));
    await p.waitForSelector('.mpe [data-props] input[data-fp="nome"]');
    assert.match(await p.textContent(".mpe [data-props]"), /Ponto · em "Estações"[\s\S]*Escritos no próprio slide/);
    const nome0 = await p.inputValue('.mpe [data-props] input[data-fp="nome"]');
    await p.fill('.mpe [data-props] input[data-fp="nome"]', `${nome0} Norte`); await p.keyboard.press("Tab");
    await until(p, () => copies().length === 1, "a cópia na biblioteca");
    const file = () => path.join(studio.library, "Modelos", copies()[0], `${copies()[0]}.yaml`);
    const mapa = () => YAML.parse(fs.readFileSync(file(), "utf8")).slides.find((s) => s.layout === "map" && /1 km/.test(s.title));
    await until(p, () => fs.existsSync(file()) && mapa().layers[0].points.some((x) => x.nome === `${nome0} Norte`), "o nome novo na cópia");
    await until(p, async () => /Cópia criada/.test(await p.textContent("body")), "o aviso da cópia");
    // ponto novo vai para a lista do slide (a camada escolhida)
    await ready(p);
    await p.click('.mpe [data-mode="ponto"]');
    const b = await p.locator(".mpe .map-live").boundingBox();
    await p.mouse.click(b.x + b.width * 0.15, b.y + b.height * 0.2);
    await until(p, () => mapa().layers[0].points.length === 6, "o ponto novo na lista do slide");
    assert.equal(copies().length, 1, "continua uma cópia só");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
