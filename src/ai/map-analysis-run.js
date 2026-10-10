// Análises do mapa pedidas pela IA no bloco `mapa:` (entrega 5): o código calcula, grava o resultado no projeto e
// devolve números para a IA narrar. mais_proximo, contar (em raio ou em área), faixa em volta de uma linha, sugerir
// onde instalar, rota com tempo, área alcançável e encaixar um rastro de GPS nas ruas. Lê as camadas do projeto (CSV
// de pontos, GeoJSON, GPX, KML). Quem chama é runMapData (src/ai/map-data.js), que já cuidou do serviço bloqueado.
import fs from "node:fs";
import * as Project from "../studio/project.js";
import { parseCSV } from "../csv.js";
import { pointsFromRows, fromGPX, fromKML } from "../map.js";
import { geocodeOne } from "../map-services.js";
import { nearest, withinRadius, inPolygon, pointLine, circle, lineBuffer, suggestSites, fmtMetros } from "../map-analysis.js";
import { route, isochrone, matchTrace, MODOS } from "../map-routing.js";

export const ANALYSES = new Set(["mais_proximo", "contar", "faixa", "sugerir", "rota", "alcance", "encaixar"]);

const okFile = (f, ext) => typeof f === "string" && /^contexto\/[\w\-. /]+$/.test(f) && f.toLowerCase().endsWith(ext) && !f.includes("..");
const nameOf = (props, i) => props?.nome || props?.name || props?.titulo || `item ${i + 1}`;
const fc = (features) => JSON.stringify({ type: "FeatureCollection", features });

async function readPoints(P, file) {
  const { rows } = parseCSV(fs.readFileSync(Project.resolveIn(P, file), "utf8"));
  const head = (rows[0] || []).map((h) => String(h).trim());
  return pointsFromRows(head, rows.slice(1)).features.map((f) => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], props: f.properties }));
}
function readShapes(P, file) {
  const text = fs.readFileSync(Project.resolveIn(P, file), "utf8");
  if (/\.gpx$/i.test(file)) return fromGPX(text);
  if (/\.kml$/i.test(file)) return fromKML(text);
  const j = JSON.parse(text);
  return j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : [{ type: "Feature", properties: {}, geometry: j }];
}
async function placeOf(x, cfg) {
  if (Array.isArray(x) && x.length === 2) return [Number(x[0]), Number(x[1])];
  const hit = await geocodeOne(String(x), { cfg });
  if (!hit) throw new Error(`não achei "${x}" no mapa`);
  return [hit.lat, hit.lon];
}

export async function runAnalysis(a, { P, cfg, onProgress = () => {} }) {
  if (a.tipo === "mais_proximo") {
    const A = await readPoints(P, a.de), B = await readPoints(P, a.ate);
    if (!A.length || !B.length) throw new Error("as planilhas precisam de pontos com posição");
    const res = nearest(A.map((p) => [p.lat, p.lon]), B.map((p) => [p.lat, p.lon]));
    const arquivo = okFile(a.arquivo, ".csv") ? a.arquivo : `${a.de.replace(/\.csv$/i, "")}-mais-proximo.csv`;
    const cols = Object.keys(A[0].props).filter((c) => !c.startsWith("_"));
    const rows = [[...cols, "latitude", "longitude", "mais_proximo", "distancia_m"],
      ...A.map((p, i) => [...cols.map((c) => p.props[c] ?? ""), String(p.lat), String(p.lon), nameOf(B[res[i].j]?.props, res[i].j), String(Math.round(res[i].metros))])];
    Project.writeSheet(P, arquivo, rows);
    const media = res.reduce((s, r) => s + r.metros, 0) / res.length, far = res.reduce((m, r) => (r.metros > m.metros ? r : m), res[0]);
    return { tipo: a.tipo, arquivo, linhas: A.length, oque: `distância de cada item de ${a.de} até o mais próximo de ${a.ate}: média ${fmtMetros(media)}, maior ${fmtMetros(far.metros)} (${nameOf(A[far.i].props, far.i)} até ${nameOf(B[far.j].props, far.j)})` };
  }
  if (a.tipo === "contar") {
    const pts = await readPoints(P, a.pontos);
    if (a.area) {
      const areas = readShapes(P, a.area).filter((f) => /Polygon/.test(f.geometry?.type || ""));
      const counts = areas.map((f, k) => ({ nome: nameOf(f.properties, k), n: pts.filter((p) => inPolygon([p.lat, p.lon], f.geometry)).length }));
      return { tipo: a.tipo, arquivo: a.area, linhas: counts.length, oque: `pontos de ${a.pontos} dentro de cada área: ${counts.map((c) => `${c.nome}: ${c.n}`).join("; ")}` };
    }
    const centro = await placeOf(a.centro, cfg), metros = Number(a.metros) || 1000;
    const dentro = withinRadius(pts.map((p) => [p.lat, p.lon]), centro, metros);
    const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : `contexto/raio-${Math.round(metros)}m.geojson`;
    Project.writeText(P, arquivo, fc([{ type: "Feature", properties: { nome: `raio de ${fmtMetros(metros)}`, dentro: dentro.length }, geometry: circle(centro, metros) }]));
    const nomes = dentro.slice(0, 8).map((i) => nameOf(pts[i].props, i)).join(", ");
    return { tipo: a.tipo, arquivo, linhas: dentro.length, oque: `${dentro.length} de ${pts.length} pontos de ${a.pontos} ficam a até ${fmtMetros(metros)}${nomes ? ` (${nomes}${dentro.length > 8 ? "…" : ""})` : ""}; o círculo foi gravado` };
  }
  if (a.tipo === "faixa") {
    const metros = Number(a.metros) || 50;
    const lines = readShapes(P, a.linha).filter((f) => /LineString/.test(f.geometry?.type || ""));
    if (!lines.length) throw new Error(`${a.linha} não tem linhas`);
    const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : `${a.linha.replace(/\.[^.]+$/, "")}-faixa-${Math.round(metros)}m.geojson`;
    Project.writeText(P, arquivo, fc(lines.map((f, k) => ({ type: "Feature", properties: { nome: `${nameOf(f.properties, k)} (faixa de ${fmtMetros(metros)})` }, geometry: lineBuffer(f.geometry, metros) }))));
    let extra = "";
    if (a.pontos) {
      const pts = await readPoints(P, a.pontos);
      const perto = pts.filter((p) => lines.some((f) => pointLine([p.lat, p.lon], f.geometry) <= metros));
      extra = `; ${perto.length} de ${pts.length} pontos de ${a.pontos} ficam a até ${fmtMetros(metros)} da linha${perto.length ? ` (${perto.slice(0, 8).map((p, i) => nameOf(p.props, i)).join(", ")}${perto.length > 8 ? "…" : ""})` : ""}`;
    }
    return { tipo: a.tipo, arquivo, linhas: lines.length, oque: `faixa de ${fmtMetros(metros)} em volta de ${a.linha}${extra}` };
  }
  if (a.tipo === "sugerir") {
    const pts = await readPoints(P, a.existentes);
    const area = a.area ? readShapes(P, a.area).find((f) => /Polygon/.test(f.geometry?.type || ""))?.geometry : null;
    const sug = suggestSites(pts.map((p) => [p.lat, p.lon]), { area, quantos: Math.min(Number(a.quantos) || 3, 10) });
    const arquivo = okFile(a.arquivo, ".csv") ? a.arquivo : "contexto/sugestoes.csv";
    Project.writeSheet(P, arquivo, [["nome", "latitude", "longitude", "distancia_m"], ...sug.map((s, k) => [`Sugestão ${k + 1}`, s.lat.toFixed(6), s.lon.toFixed(6), String(Math.round(s.metros ?? 0))])]);
    return { tipo: a.tipo, arquivo, linhas: sug.length, oque: `lugares mais longe dos existentes em ${a.existentes}${a.area ? ` dentro de ${a.area}` : ""}: ${sug.map((s, k) => `Sugestão ${k + 1} a ${fmtMetros(s.metros)} do mais próximo`).join("; ")} (sugestão geométrica: confira acesso, terreno e regras antes)` };
  }
  if (a.tipo === "rota") {
    onProgress("calculando a rota…");
    const de = await placeOf(a.de, cfg), para = await placeOf(a.para, cfg);
    const r = await route([de, para], { modo: a.modo, cfg });
    const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : "contexto/rota.geojson";
    Project.writeText(P, arquivo, fc([{ type: "Feature", properties: { nome: `${typeof a.de === "string" ? a.de : "origem"} até ${typeof a.para === "string" ? a.para : "destino"}`, distancia_m: Math.round(r.distancia), minutos: Math.round(r.duracao / 60), modo: MODOS[r.modo] }, geometry: { type: "LineString", coordinates: r.coords } }]));
    return { tipo: a.tipo, arquivo, linhas: 1, oque: `rota ${MODOS[r.modo]}: ${fmtMetros(r.distancia)}, cerca de ${Math.round(r.duracao / 60)} min` };
  }
  if (a.tipo === "alcance") {
    onProgress("calculando a área alcançável…");
    const minutos = Math.min(Math.max(Number(a.minutos) || 10, 1), 60);
    const origens = typeof a.de === "string" && /\.csv$/i.test(a.de)
      ? (await readPoints(P, a.de)).slice(0, 8).map((p, i) => ({ at: [p.lat, p.lon], nome: nameOf(p.props, i) }))
      : [{ at: await placeOf(a.de, cfg), nome: String(a.de) }];
    const feats = [];
    for (const o of origens) feats.push({ type: "Feature", properties: { nome: `${o.nome}: ${minutos} min ${MODOS[a.modo] || "a pé"}` }, geometry: await isochrone(o.at, minutos, { modo: a.modo, cfg }) });
    const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : `contexto/alcance-${minutos}min.geojson`;
    Project.writeText(P, arquivo, fc(feats));
    return { tipo: a.tipo, arquivo, linhas: feats.length, oque: `área alcançável em ${minutos} min ${MODOS[a.modo] || "a pé"} a partir de ${origens.length} ${origens.length === 1 ? "ponto" : "pontos"}` };
  }
  if (a.tipo === "encaixar") {
    onProgress("encaixando o rastro nas ruas…");
    const f = readShapes(P, a.trilha).find((x) => /LineString/.test(x.geometry?.type || ""));
    if (!f) throw new Error(`${a.trilha} não tem um rastro (linha)`);
    const coords = f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const step = Math.max(1, Math.ceil(coords.length / 100)); // o serviço aceita até 100 pontos: amostra o rastro
    const out = await matchTrace(coords.filter((_, i) => i % step === 0).map(([lon, lat]) => [lat, lon]), { modo: a.modo, cfg });
    const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : `${a.trilha.replace(/\.[^.]+$/, "")}-nas-ruas.geojson`;
    Project.writeText(P, arquivo, fc([{ type: "Feature", properties: { nome: `${nameOf(f.properties, 0)} (nas ruas)` }, geometry: { type: "LineString", coordinates: out } }]));
    return { tipo: a.tipo, arquivo, linhas: 1, oque: `rastro de ${a.trilha} encaixado nas ruas (${out.length} pontos)` };
  }
  throw new Error(`análise desconhecida: ${a.tipo}`);
}
