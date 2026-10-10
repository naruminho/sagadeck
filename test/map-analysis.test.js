// Análises do mapa (entrega 5): as contas são do código (a IA só narra). Valores conhecidos nas funções puras e, nas
// análises pedidas pela IA, o que é gravado no projeto. Rota, área alcançável e encaixe de GPS usam serviços falsos.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { nearest, withinRadius, inPolygon, pointLine, lineBuffer, suggestSites, circle } from "../src/map-analysis.js";
import { distance } from "../src/map-routing.js";
import { runMapData } from "../src/ai/map-data.js";
import { resetService } from "../src/map-services.js";

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test("contas: distância, mais próximo, raio, ponto em polígono (com buraco), distância a uma linha", () => {
  near(distance([0, 0], [0, 1]), 111195, 50); // 1 grau de longitude no equador
  near(distance([-23.5489, -46.6388], [-23.5505, -46.6333]), 590, 20);
  const r = nearest([[0, 0], [0, 0.02]], [[0, 0.001], [0, 0.03]]);
  assert.deepEqual(r.map((x) => x.j), [0, 1]);
  near(r[0].metros, 111, 2);
  assert.deepEqual(withinRadius([[0, 0], [0, 0.005], [0, 0.02]], [0, 0], 1000), [0, 1]);
  const quadrado = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], [[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4], [0.4, 0.4]]] };
  assert.equal(inPolygon([0.2, 0.2], quadrado), true);
  assert.equal(inPolygon([0.5, 0.5], quadrado), false, "no buraco");
  assert.equal(inPolygon([2, 2], quadrado), false);
  near(pointLine([0.001, 0.5], { type: "LineString", coordinates: [[0, 0], [1, 0]] }), 111, 2);
  const b = lineBuffer({ type: "LineString", coordinates: [[0, 0], [0.01, 0]] }, 50);
  assert.equal(b.type, "MultiPolygon");
  assert.ok(inPolygon([0.0003, 0.005], b), "a faixa cobre 33 m ao lado da linha");
  assert.ok(!inPolygon([0.002, 0.005], b), "e não 220 m");
  assert.ok(inPolygon([0, 0.0004], circle([0, 0], 100)));
});

test("sugerir onde instalar: os lugares mais longe dos existentes, dentro da área", () => {
  const area = { type: "Polygon", coordinates: [[[0, 0], [0, 0.1], [0.1, 0.1], [0.1, 0], [0, 0]]] };
  const s = suggestSites([[0.01, 0.01]], { area, quantos: 2 });
  assert.equal(s.length, 2);
  assert.ok(s[0].lat > 0.08 && s[0].lon > 0.08, "o primeiro fica no canto oposto ao existente");
  assert.ok(s.every((p) => inPolygon([p.lat, p.lon], area)));
  assert.ok(distance([s[0].lat, s[0].lon], [s[1].lat, s[1].lon]) > 5000, "o segundo fica longe do primeiro também");
});

async function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-analise-"));
  fs.writeFileSync(path.join(dir, "deck.yaml"), "title: t\nslides: []\n");
  fs.mkdirSync(path.join(dir, "contexto"));
  const w = (f, t) => fs.writeFileSync(path.join(dir, "contexto", f), t);
  w("pedidos.csv", "nome;latitude;longitude\nP1;0;0\nP2;0;0.02\n");
  w("lojas.csv", "nome;latitude;longitude\nLoja A;0;0.001\nLoja B;0;0.03\n");
  w("rede.geojson", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { nome: "Adutora" }, geometry: { type: "LineString", coordinates: [[0, 0], [0.01, 0]] } }] }));
  w("imoveis.csv", "nome;latitude;longitude\nPerto;0.0003;0.005\nLonge;0.002;0.005\n");
  w("areas.geojson", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { nome: "Norte" }, geometry: { type: "Polygon", coordinates: [[[-0.01, -0.01], [-0.01, 0.01], [0.01, 0.01], [0.01, -0.01], [-0.01, -0.01]]] } }] }));
  w("percurso.gpx", '<gpx><trk><name>Ronda</name><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0.0001" lon="0.005"/><trkpt lat="0" lon="0.01"/></trkseg></trk></gpx>');
  return { P: { dir, file: path.join(dir, "deck.yaml"), main: "deck.yaml" }, dir };
}

test("análises pela IA (sem rede): mais próximo, contar em área, faixa com pontos e sugerir gravam no projeto e devolvem os números", async () => {
  const { P, dir } = await project();
  const r = await runMapData([
    { tipo: "mais_proximo", de: "contexto/pedidos.csv", ate: "contexto/lojas.csv" },
    { tipo: "contar", pontos: "contexto/imoveis.csv", area: "contexto/areas.geojson" },
    { tipo: "faixa", linha: "contexto/rede.geojson", metros: 50, pontos: "contexto/imoveis.csv" },
    { tipo: "sugerir", existentes: "contexto/pedidos.csv", quantos: 2 },
  ], { P });
  assert.deepEqual(r.falhas, []);
  const [prox, contar, faixa, sug] = r.feitos;
  assert.match(prox.oque, /maior 1,1 km \(P2 até Loja B\)/);
  const csv = fs.readFileSync(path.join(dir, prox.arquivo), "utf8").trim().split(/\r?\n/);
  assert.equal(csv[0], "nome,latitude,longitude,mais_proximo,distancia_m");
  assert.match(csv[1], /^P1,0,0,Loja A,111$/);
  assert.match(contar.oque, /Norte: 2/);
  assert.match(faixa.oque, /1 de 2 pontos .* \(Perto\)/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, faixa.arquivo), "utf8")).features[0].geometry.type, "MultiPolygon");
  assert.equal(sug.linhas, 2);
  assert.match(fs.readFileSync(path.join(dir, "contexto", "sugestoes.csv"), "utf8"), /^nome,latitude,longitude,distancia_m/);
});

test("análises com serviço (falso): rota com distância e tempo, área alcançável e rastro de GPS encaixado nas ruas", async () => {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    hits.push(req.url);
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url.startsWith("/route/")) return res.end(JSON.stringify({ routes: [{ distance: 1234, duration: 900, geometry: { coordinates: [[0, 0], [0.005, 0.0001], [0.01, 0]] } }] }));
    if (req.url.startsWith("/match/")) return res.end(JSON.stringify({ matchings: [{ geometry: { coordinates: [[0, 0], [0.005, 0], [0.01, 0]] } }] }));
    if (req.url.startsWith("/v2/isochrones/")) return res.end(JSON.stringify({ features: [{ geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 0.01], [0.01, 0.01], [0, 0]]] } }] }));
    res.end("{}");
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  resetService();
  try {
    const { P, dir } = await project();
    const osrm = { tiles: null, geocoder: { url }, rotas: { provedor: "osrm", url } };
    let r = await runMapData([{ tipo: "rota", de: [0, 0], para: [0, 0.01], modo: "pe" }, { tipo: "encaixar", trilha: "contexto/percurso.gpx", modo: "carro" }], { P, cfg: osrm });
    assert.deepEqual(r.falhas, []);
    assert.match(r.feitos[0].oque, /rota a pé: 1,2 km, cerca de 15 min/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "contexto", "rota.geojson"), "utf8")).features[0].properties.minutos, 15);
    assert.ok(hits.some((h) => h.startsWith("/match/v1/driving/")), "encaixe pelo OSRM, de carro");
    assert.ok(fs.existsSync(path.join(dir, "contexto", "percurso-nas-ruas.geojson")));
    // área alcançável só com o OpenRouteService com chave; sem ela, a IA fica sabendo por quê
    r = await runMapData([{ tipo: "alcance", de: [0, 0], minutos: 10 }], { P, cfg: osrm });
    assert.match(r.falhas[0], /precisa do OpenRouteService com chave/);
    r = await runMapData([{ tipo: "alcance", de: "contexto/lojas.csv", minutos: 10 }], { P, cfg: { ...osrm, rotas: { provedor: "openrouteservice", url, key: "k" } } });
    assert.deepEqual(r.falhas, []);
    assert.equal(r.feitos[0].linhas, 2, "uma área por loja");
    assert.match(r.feitos[0].oque, /10 min a pé a partir de 2 pontos/);
  } finally { server.close(); resetService(); }
});
