// Slide de mapa (layout: map). A planilha é a fonte, o mapa é a vista: cada camada lê um arquivo do projeto (CSV,
// GeoJSON, GPX, KML) ou valores por estado/país, e vira GeoJSON com o estilo já decidido (cor por categoria ou por
// valor, tamanho, rótulo, campos do cartão). Os dados vão dentro do HTML; o mapa ao vivo (src/runtime/map.js) desenha
// com o Leaflet, e uma prévia em SVG (sem fundo) serve às miniaturas e de reserva.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./csv.js";
import { toNum } from "./science.js";

const VENDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), "runtime", "vendor");
let contornos;
export const geoContornos = () => (contornos ||= JSON.parse(fs.readFileSync(path.join(VENDOR, "geo-contornos.json"), "utf8")));

// cores das categorias: a paleta do tema (o runtime resolve --s1…), na ordem
// cores das categorias: a paleta do tema (c1…c5, as mesmas da tabela e dos gráficos), depois destaque e alerta
export const MAP_COLORS = ["c1", "c2", "c3", "c4", "c5", "em", "hi", "alert"];
// token de cor -> CSS: hex, paleta do tema (--c-c1… com recuo no destaque), ou variável do tom (s1, em, hi, fg…)
export const mapColorCSS = (c) => (/^#?[0-9a-f]{6}$/i.test(c) ? `#${String(c).replace("#", "")}` : /^(c\d|accent|alert|ink|paper)$/.test(c) ? `var(--c-${c},var(--em))` : `var(--${c})`);
const BASEMAPS = ["ruas", "claro", "escuro", "satelite", "nenhum"];

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const LAT = ["lat", "latitude", "y"], LON = ["lon", "lng", "long", "longitude", "x"], COORD = ["coordenadas", "coordenada", "coords", "latlon", "latlong", "posicao", "localizacao"];
const findCol = (cols, want, names) => {
  if (want) { const i = cols.findIndex((c) => norm(c) === norm(want)); return i; }
  return cols.findIndex((c) => names.includes(norm(c)));
};

// ---------------------------------------------------------------------------------------------- leitura dos arquivos
function readText(file, ctx, what) {
  const full = path.resolve(ctx?.baseDir || process.cwd(), String(file).trim());
  try { return fs.readFileSync(full, "utf8"); }
  catch { ctx?.warnings?.push(`mapa: ${what} "${file}" não encontrado ao lado do deck`); return null; }
}

// coordenada não tem separador de milhar: "-46.702" é -46,702 (o leitor de números da planilha leria -46702) e
// "-23,55" é -23,55 (vírgula decimal)
export function coordNum(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\s/g, "");
  return /^[+-]?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
}
// "lat, lon" numa coluna só: "-23.55, -46.63", "-23,55; -46,63", "-23.55 -46.63"
export function splitCoords(v) {
  const s = String(v ?? "").trim();
  const parts = s.includes(";") ? s.split(";") : /,\s/.test(s) ? s.split(/,\s+/) : /\s/.test(s) ? s.split(/\s+/) : s.split(",");
  return parts.length === 2 ? parts.map(coordNum) : [NaN, NaN];
}

// planilha (CSV) -> pontos. Colunas de posição reconhecidas pelo nome (lat/latitude, lon/longitude) ou indicadas.
export function pointsFromRows(head, rows, layer = {}, warn = () => {}) {
  const iLat = findCol(head, layer.lat, LAT), iLon = findCol(head, layer.lon, LON);
  const iCoord = iLat < 0 || iLon < 0 ? findCol(head, layer.coords, COORD) : -1;
  if ((iLat < 0 || iLon < 0) && iCoord < 0) {
    warn(`mapa: a planilha não tem colunas de posição (latitude e longitude); colunas: ${head.join(", ")}`);
    return { features: [], missing: rows.length };
  }
  const features = [];
  let missing = 0;
  rows.forEach((r, n) => {
    let lat, lon;
    if (iCoord >= 0) [lat, lon] = splitCoords(r[iCoord]);
    else { lat = coordNum(r[iLat]); lon = coordNum(r[iLon]); }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { missing++; return; }
    // as colunas de posição não vão para o cartão (a posição já é o ponto no mapa)
    const props = Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]).filter(([h], i) => h !== "" && i !== iLat && i !== iLon && i !== iCoord));
    features.push({ type: "Feature", properties: { ...props, _linha: n + 2 }, geometry: { type: "Point", coordinates: [lon, lat] } });
  });
  if (missing) warn(`mapa: ${missing} linha${missing === 1 ? "" : "s"} da planilha sem posição válida ficaram de fora`);
  return { features, missing };
}

const attr = (xml, name) => xml.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1];
const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${name}>)`, "g"))].map((m) => m[0]);

// GPX: trilhas e rotas viram linhas; pontos marcados (wpt) viram pontos
export function fromGPX(xml) {
  const pt = (s) => [Number(attr(s, "lon")), Number(attr(s, "lat"))];
  const features = [];
  for (const t of [...tags(xml, "trk"), ...tags(xml, "rte")]) {
    const segs = tags(t, "trkseg").length ? tags(t, "trkseg").map((s) => tags(s, "trkpt").map(pt)) : [tags(t, "rtept").map(pt)];
    const lines = segs.filter((l) => l.length > 1);
    if (!lines.length) continue;
    features.push({ type: "Feature", properties: { nome: tag(t, "name") || "" }, geometry: lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines } });
  }
  for (const w of tags(xml, "wpt")) features.push({ type: "Feature", properties: { nome: tag(w, "name") || "" }, geometry: { type: "Point", coordinates: pt(w) } });
  return features;
}

// KML: cada Placemark com nome, descrição e dados (ExtendedData); ponto, linha ou polígono (inclusive MultiGeometry)
export function fromKML(xml) {
  const coords = (s) => String(s || "").trim().split(/\s+/).map((c) => c.split(",").slice(0, 2).map(Number)).filter((c) => c.length === 2 && c.every(Number.isFinite));
  const features = [];
  for (const pm of tags(xml, "Placemark")) {
    const props = { nome: tag(pm, "name") || "" };
    const desc = tag(pm, "description"); if (desc) props.descricao = desc.replace(/<[^>]+>/g, " ").trim();
    for (const d of tags(pm, "Data")) props[attr(d, "name") || "campo"] = tag(d, "value") || "";
    for (const d of tags(pm, "SimpleData")) props[attr(d, "name") || "campo"] = d.replace(/<[^>]+>/g, "").trim();
    const geoms = [
      ...tags(pm, "Point").map((p) => ({ type: "Point", coordinates: coords(tag(p, "coordinates"))[0] })),
      ...tags(pm, "LineString").map((l) => ({ type: "LineString", coordinates: coords(tag(l, "coordinates")) })),
      ...tags(pm, "Polygon").map((p) => ({ type: "Polygon", coordinates: [coords(tag(tag(p, "outerBoundaryIs") || p, "coordinates")), ...tags(p, "innerBoundaryIs").map((b) => coords(tag(b, "coordinates")))] })),
    ].filter((g) => g.coordinates && (g.type !== "Point" || g.coordinates.length === 2));
    for (const g of geoms) features.push({ type: "Feature", properties: props, geometry: g });
  }
  return features;
}

function fromGeoJSON(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (obj.type === "FeatureCollection") return (obj.features || []).filter((f) => f && f.geometry);
  if (obj.type === "Feature") return obj.geometry ? [obj] : [];
  if (obj.type && obj.coordinates) return [{ type: "Feature", properties: {}, geometry: obj }];
  return [];
}

// valores por estado (sigla) ou país (código de 2 letras): o contorno embutido, pintado pelo valor
function fromAreas(values, warn) {
  const g = geoContornos();
  const features = [];
  for (const [k, v] of Object.entries(values || {})) {
    const code = String(k).trim().toUpperCase();
    const uf = g.uf[code], pais = g.paises[code];
    if (!uf && !pais) { warn(`mapa: "${k}" não é uma UF (SP, RJ…) nem um país (BR, PT…)`); continue; }
    const poly = uf || pais.poly;
    features.push({ type: "Feature", properties: { nome: uf ? code : pais.nome, valor: v }, geometry: { type: "MultiPolygon", coordinates: poly } });
  }
  return features;
}

// ---------------------------------------------------------------------------------------------- estilo das camadas
// cor: uma coluna (categoria -> cores da paleta; número -> escala da cor de destaque), uma cor fixa, ou nada
function styleOf(features, layer, warn) {
  const style = { color: null, colorBy: null, categories: null, scale: null, sizeBy: null, sizeScale: null, label: layer.label || null, popup: null, icon: layer.icon || null };
  const props = features.map((f) => f.properties || {});
  const has = (col) => col && props.some((p) => Object.hasOwn(p, col));
  const by = layer.color ?? (layer.areas ? "valor" : null);
  if (by && !has(by)) {
    if (/^(#?[0-9a-f]{6}|s[1-5]|c\d|em|hi|alert|accent|fg|muted)$/i.test(String(by))) style.color = String(by);
    else warn(`mapa: a camada "${layer.name || ""}" pinta pela coluna "${by}", que não existe`);
  } else if (by) {
    style.colorBy = by;
    const vals = props.map((p) => p[by]);
    const nums = vals.map(toNum).filter((n) => n != null);
    if (nums.length === vals.filter((v) => String(v ?? "").trim() !== "").length && nums.length && !layer.colors) {
      style.scale = { min: Math.min(...nums), max: Math.max(...nums) };
    } else {
      const order = [...new Set(vals.map((v) => String(v ?? "").trim()).filter(Boolean))];
      const given = layer.colors && typeof layer.colors === "object" ? layer.colors : {};
      if (order.length > MAP_COLORS.length && !Object.keys(given).length) warn(`mapa: "${by}" tem ${order.length} categorias; as cores se repetem a partir da ${MAP_COLORS.length + 1}ª (agrupe ou dê colors:)`);
      style.categories = order.map((v, i) => ({ value: v, color: String(given[v] ?? MAP_COLORS[i % MAP_COLORS.length]) }));
    }
  }
  if (layer.size) {
    if (!has(layer.size)) warn(`mapa: a camada "${layer.name || ""}" usa a coluna "${layer.size}" para o tamanho, que não existe`);
    else {
      const nums = props.map((p) => toNum(p[layer.size])).filter((n) => n != null);
      if (nums.length) { style.sizeBy = layer.size; style.sizeScale = { min: Math.min(...nums), max: Math.max(...nums) }; }
    }
  }
  if (style.label && !has(style.label)) { warn(`mapa: a coluna "${style.label}" do rótulo não existe`); style.label = null; }
  const cols = [...new Set(props.flatMap((p) => Object.keys(p)))].filter((c) => !c.startsWith("_"));
  style.popup = Array.isArray(layer.popup) ? layer.popup.filter((c) => cols.includes(c)) : layer.popup === false ? [] : cols.slice(0, 8);
  return style;
}

// ---------------------------------------------------------------------------------------------- o slide inteiro
function bboxOf(layers) {
  let s = 90, w = 180, n = -90, e = -180, any = false;
  const visit = (c) => {
    if (typeof c[0] === "number") { const [lon, lat] = c; if (Number.isFinite(lat) && Number.isFinite(lon)) { any = true; s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); } return; }
    c.forEach(visit);
  };
  for (const l of layers) for (const f of l.data.features) if (f.geometry?.coordinates) visit(f.geometry.coordinates);
  return any ? [[s, w], [n, e]] : null;
}

const viewOf = (v) => {
  if (v === "fit" || v === true) return "fit";
  if (v && Array.isArray(v.center) && v.center.length === 2 && v.center.every(Number.isFinite)) return { center: v.center, zoom: Number.isFinite(v.zoom) ? v.zoom : 13 };
  return null;
};

export function mapModel(s, ctx) {
  const warn = (m) => ctx?.warnings?.push(m);
  const list = Array.isArray(s.layers) ? s.layers : s.layers ? [s.layers] : [];
  const layers = [];
  list.forEach((layer, i) => {
    if (!layer || typeof layer !== "object") return;
    let features = [], kind = "shapes";
    if (layer.points != null) {
      kind = "points";
      if (typeof layer.points === "string") {
        const text = readText(layer.points, ctx, "planilha");
        if (text != null) {
          const { rows } = parseCSV(text);
          const [head = [], ...body] = rows.filter((r) => r.some((c) => String(c).trim()));
          features = pointsFromRows(head.map((h) => String(h).trim()), body, layer, warn).features;
        }
      } else if (Array.isArray(layer.points)) {
        const rows = layer.points.filter((p) => p && typeof p === "object");
        const head = [...new Set(rows.flatMap((p) => Object.keys(p)))];
        features = pointsFromRows(head, rows.map((p) => head.map((h) => p[h] ?? "")), layer, warn).features;
      }
    } else if (layer.geojson) {
      const text = readText(layer.geojson, ctx, "GeoJSON");
      try { features = text == null ? [] : fromGeoJSON(JSON.parse(text)); } catch { warn(`mapa: "${layer.geojson}" não é um GeoJSON válido`); }
    } else if (layer.gpx) {
      const text = readText(layer.gpx, ctx, "GPX"); features = text == null ? [] : fromGPX(text);
    } else if (layer.kml) {
      const text = readText(layer.kml, ctx, "KML"); features = text == null ? [] : fromKML(text);
    } else if (layer.areas) {
      kind = "areas"; features = fromAreas(layer.areas, warn);
    } else { warn(`mapa: a camada ${i + 1} não diz de onde vêm os dados (points, geojson, gpx, kml ou areas)`); return; }
    if (!features.length && layer.areas == null) warn(`mapa: a camada "${layer.name || i + 1}" ficou vazia`);
    const step = layer.step ?? (s.build ? i + 1 : undefined);
    layers.push({
      name: layer.name || layer.title || `Camada ${i + 1}`, kind, step: Number.isFinite(Number(step)) ? Number(step) : undefined,
      view: viewOf(layer.view), legend: layer.legend || null, prefix: layer.prefix || "", suffix: layer.suffix || "",
      style: styleOf(features, layer, warn), data: { type: "FeatureCollection", features },
    });
  });
  const basemap = BASEMAPS.includes(s.basemap) ? s.basemap : "ruas";
  if (s.basemap && !BASEMAPS.includes(s.basemap)) warn(`mapa: fundo "${s.basemap}" não existe (use ${BASEMAPS.join(", ")})`);
  return { basemap, view: viewOf(s.view), bounds: bboxOf(layers), layers, tiles: ctx?.mapTiles || null };
}

// ---------------------------------------------------------------------------------------------- prévia sem fundo
// SVG das camadas em Web Mercator, enquadradas: miniaturas do Studio (sem pedir tile nenhum) e reserva se o mapa ao
// vivo não montar
const merc = ([lon, lat]) => { const y = Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)); return [lon / 360, -y / (2 * Math.PI)]; };
export function mapPreviewSVG(model, w = 1600, h = 760) {
  if (!model.bounds) return `<svg class="map-preview" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const [[s, wst], [n, e]] = model.bounds;
  const [x0, y1] = merc([wst, s]), [x1, y0] = merc([e, n]);
  const pad = 0.08, bw = Math.max(x1 - x0, 1e-6), bh = Math.max(y1 - y0, 1e-6);
  const k = Math.min(w / (bw * (1 + 2 * pad)), h / (bh * (1 + 2 * pad)));
  const ox = w / 2 - ((x0 + x1) / 2) * k, oy = h / 2 - ((y0 + y1) / 2) * k;
  const P = (c) => { const [x, y] = merc(c); return `${(x * k + ox).toFixed(1)},${(y * k + oy).toFixed(1)}`; };
  const out = [];
  const color = (layer, f) => {
    const st = layer.style, v = st.colorBy ? f.properties?.[st.colorBy] : null;
    const cat = st.categories?.find((c) => c.value === String(v ?? "").trim());
    return mapColorCSS(cat?.color || st.color || "c1");
  };
  for (const layer of model.layers) for (const f of layer.data.features) {
    const g = f.geometry, col = color(layer, f);
    const lines = (cs) => cs.map((l) => `M${l.map(P).join("L")}`).join("");
    if (g.type === "Point") { const [x, y] = P(g.coordinates).split(","); out.push(`<circle cx="${x}" cy="${y}" r="9" fill="${col}" stroke="var(--bg)" stroke-width="3"/>`); }
    else if (g.type === "LineString") out.push(`<path d="${lines([g.coordinates])}" fill="none" stroke="${col}" stroke-width="5"/>`);
    else if (g.type === "MultiLineString") out.push(`<path d="${lines(g.coordinates)}" fill="none" stroke="${col}" stroke-width="5"/>`);
    else if (g.type === "Polygon") out.push(`<path d="${lines(g.coordinates)}Z" fill="${col}" fill-opacity=".35" stroke="${col}" stroke-width="2"/>`);
    else if (g.type === "MultiPolygon") out.push(`<path d="${g.coordinates.map((p) => lines(p) + "Z").join("")}" fill="${col}" fill-opacity=".35" stroke="${col}" stroke-width="2"/>`);
  }
  return `<svg class="map-preview" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out.join("")}</svg>`;
}

export const mapSummary = (model) => model.layers.map((l) => `${l.name}: ${l.data.features.length}`).join(" · ");
