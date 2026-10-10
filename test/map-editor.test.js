// Editor do mapa no Studio (entrega 3), usado como a pessoa usaria: "Editar no mapa", clicar para criar um ponto (o
// endereço vem preenchido e vai para a planilha), desenhar uma linha "seguindo as ruas" (vai para o GeoJSON), arrastar
// um ponto (a planilha acompanha) e "Usar esta vista" (vai para o slide). Endereço e rotas vêm de servidores falsos.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

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
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { hits, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test("Editar no mapa: ponto novo com endereço vai para a planilha; linha seguindo as ruas vai para o GeoJSON; arrastar e enquadrar gravam", { timeout: 120000 }, async (t) => {
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
    await p.waitForSelector("#canvas-viewport > .me-bar");
    const box = await p.locator("#rendered-slide-container .map-live").boundingBox();
    const at = (dx, dy) => [box.x + box.width / 2 + dx, box.y + box.height / 2 + dy];
    // ponto novo: o endereço vem do serviço, o nome a pessoa digita
    await p.click('.me-bar [data-mode="ponto"]');
    await p.mouse.click(...at(120, 40));
    await p.waitForSelector(".md-dialog[open] [data-f=nome]");
    assert.equal(await p.inputValue('.md-dialog [data-f="endereco"]'), "Rua Nova, 1");
    await p.fill('.md-dialog [data-f="nome"]', "M2");
    await p.click(".md-dialog [data-yes]");
    for (let k = 0; k < 50 && !/M2/.test(fs.readFileSync(csv, "utf8")); k++) await p.waitForTimeout(100);
    const linhas = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/);
    assert.equal(linhas.length, 3);
    assert.match(linhas[2], /^M2;Rua Nova, 1;-23\.5\d+;-46\.6\d+$/, "ponto com endereço e posição do clique");
    await p.waitForFunction(() => document.querySelectorAll("#rendered-slide-container path.leaflet-interactive").length === 2, null, { timeout: 15000 });
    await p.waitForSelector("#canvas-viewport > .me-bar"); // o editor continua aberto depois de gravar
    // linha seguindo as ruas: dois cliques e Concluir
    await p.click('.me-bar [data-mode="linha"]');
    await p.mouse.click(...at(-150, -60));
    await p.mouse.click(...at(-40, -100));
    for (let k = 0; k < 40 && !svc.hits.some((h) => h.startsWith("/route/")); k++) await p.waitForTimeout(100);
    await p.waitForTimeout(300);
    await p.click(".me-bar [data-fim]");
    await p.waitForSelector(".md-dialog[open] .me-input");
    await p.fill(".md-dialog .me-input", "Trecho 1");
    await p.click(".md-dialog [data-yes]");
    for (let k = 0; k < 50 && !JSON.parse(fs.readFileSync(geo, "utf8")).features.length; k++) await p.waitForTimeout(100);
    const f = JSON.parse(fs.readFileSync(geo, "utf8")).features[0];
    assert.equal(f.properties.nome, "Trecho 1");
    assert.equal(f.geometry.type, "LineString");
    assert.equal(f.geometry.coordinates.length, 3, "o trecho veio do serviço de rotas (com o ponto do meio)");
    // usar esta vista: o enquadramento vai para o slide
    await p.waitForSelector("#canvas-viewport > .me-bar");
    const v0 = JSON.stringify(saved().slides[0].view);
    await p.mouse.move(...at(0, 0)); await p.mouse.wheel(0, -400); await p.waitForTimeout(600);
    await p.click(".me-bar [data-vista]");
    for (let k = 0; k < 40 && JSON.stringify(saved().slides[0].view) === v0; k++) await p.waitForTimeout(100);
    assert.notEqual(JSON.stringify(saved().slides[0].view), v0, "a vista nova foi gravada");
    // arrastar o primeiro ponto: a planilha acompanha
    await p.waitForSelector("#canvas-viewport > .me-bar");
    await p.click('.me-bar [data-mode="mover"]');
    const before = fs.readFileSync(csv, "utf8").split(/\r?\n/)[1];
    const pt = await p.locator("#rendered-slide-container path.leaflet-interactive").first().boundingBox();
    await p.mouse.move(pt.x + pt.width / 2, pt.y + pt.height / 2); await p.mouse.down();
    await p.mouse.move(pt.x + pt.width / 2 + 60, pt.y + pt.height / 2 + 30, { steps: 6 }); await p.mouse.up();
    for (let k = 0; k < 40 && fs.readFileSync(csv, "utf8").split(/\r?\n/)[1] === before; k++) await p.waitForTimeout(100);
    assert.notEqual(fs.readFileSync(csv, "utf8").split(/\r?\n/)[1], before, "a posição mudou na planilha");
    assert.match(fs.readFileSync(csv, "utf8").split(/\r?\n/)[1], /^M1;Rua A;/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await svc.close(); }
});
