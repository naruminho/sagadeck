// Análises do mapa (entrega 5): contas que o CÓDIGO faz e a IA só narra. Sem rede (as que precisam de serviço,
// como rota com tempo e área alcançável, ficam em src/map-routing.js). Coordenadas em [lat, lon]; GeoJSON em
// [lon, lat]. Distâncias na esfera (haversine), boas para cidade e região.
import { distance } from "./map-routing.js";

const R = 6371008.8, rad = Math.PI / 180;

// ponto mais próximo de cada ponto de A, entre os pontos de B: [{ i, j, metros }]
export function nearest(A, B) {
  return A.map((a, i) => {
    let best = -1, d = Infinity;
    B.forEach((b, j) => { const x = distance(a, b); if (x < d) { d = x; best = j; } });
    return { i, j: best, metros: Number.isFinite(d) ? d : null };
  });
}

// quantos pontos ficam a até `metros` de um centro
export const withinRadius = (points, center, metros) => points.map((p, i) => [i, distance(p, center)]).filter(([, d]) => d <= metros).map(([i]) => i);

// ponto dentro de polígono (anéis GeoJSON [lon, lat]; o primeiro é o contorno, os outros são buracos)
function inRing([lat, lon], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inPolygon(p, geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polys.some((rings) => inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h)));
}

// distância de um ponto a um segmento (metros), numa projeção local equiretangular (boa até dezenas de km)
function toXY([lat, lon], lat0) { return [lon * rad * R * Math.cos(lat0 * rad), lat * rad * R]; }
export function pointSegment(p, a, b) {
  const lat0 = p[0], [px, py] = toXY(p, lat0), [ax, ay] = toXY(a, lat0), [bx, by] = toXY(b, lat0);
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// distância de um ponto a uma linha GeoJSON (LineString ou MultiLineString)
export function pointLine(p, geometry) {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  let d = Infinity;
  for (const l of lines) for (let k = 1; k < l.length; k++) d = Math.min(d, pointSegment(p, [l[k - 1][1], l[k - 1][0]], [l[k][1], l[k][0]]));
  return d;
}

// círculo como polígono (para raio e para a faixa): n vértices
export function circle([lat, lon], metros, n = 32) {
  const ring = [];
  for (let k = 0; k <= n; k++) {
    const a = (2 * Math.PI * k) / n;
    ring.push([lon + (metros * Math.sin(a)) / (R * Math.cos(lat * rad)) / rad, lat + (metros * Math.cos(a)) / R / rad]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// faixa de `metros` em volta de uma linha, para DESENHAR: retângulos dos trechos e círculos nos vértices (MultiPolygon).
// Para CONTAR o que está dentro, use pointLine (exato).
export function lineBuffer(geometry, metros) {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  const polys = [];
  for (const l of lines) {
    for (let k = 0; k < l.length; k++) {
      polys.push(circle([l[k][1], l[k][0]], metros, 16).coordinates);
      if (!k) continue;
      const [lon1, lat1] = l[k - 1], [lon2, lat2] = l[k];
      const lat0 = (lat1 + lat2) / 2, kx = 1 / (R * Math.cos(lat0 * rad)) / rad, ky = 1 / R / rad;
      const dx = (lon2 - lon1) / kx, dy = (lat2 - lat1) / ky, len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * metros * kx, oy = (dx / len) * metros * ky;
      polys.push([[[lon1 + ox, lat1 + oy], [lon2 + ox, lat2 + oy], [lon2 - ox, lat2 - oy], [lon1 - ox, lat1 - oy], [lon1 + ox, lat1 + oy]]]);
    }
  }
  return { type: "MultiPolygon", coordinates: polys };
}

// "onde instalar o próximo": os `quantos` lugares mais longe de todos os existentes (e uns dos outros), dentro da área
// (polígono) ou do retângulo que cobre os existentes. Grade + escolha gulosa; devolve [{ lat, lon, metros }] com a
// distância até o existente (ou sugerido) mais próximo.
export function suggestSites(existing, { area = null, quantos = 3, grade = 40 } = {}) {
  let s = 90, w = 180, n = -90, e = -180;
  const add = ([lat, lon]) => { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); };
  if (area) { const walk = (c) => (typeof c[0] === "number" ? add([c[1], c[0]]) : c.forEach(walk)); walk(area.coordinates); } else existing.forEach(add);
  if (s > n) return [];
  // pontos alinhados (todos na mesma latitude ou longitude): o retângulo ganha a metade do outro lado de folga
  if (!area) { const padLat = n - s < 1e-9 ? Math.max((e - w) / 2, 0.005) : 0, padLon = e - w < 1e-9 ? Math.max((n - s) / 2, 0.005) : 0; s -= padLat; n += padLat; w -= padLon; e += padLon; }
  if (!(n > s) || !(e > w)) return [];
  const cand = [];
  for (let i = 0; i < grade; i++) for (let j = 0; j < grade; j++) {
    const p = [s + ((n - s) * (i + 0.5)) / grade, w + ((e - w) * (j + 0.5)) / grade];
    if (!area || inPolygon(p, area)) cand.push(p);
  }
  const chosen = [], base = [...existing];
  for (let k = 0; k < quantos && cand.length; k++) {
    let best = null, bd = -1;
    for (const c of cand) { const d = base.length ? Math.min(...base.map((b) => distance(c, b))) : Infinity; if (d > bd) { bd = d; best = c; } }
    if (!best) break;
    chosen.push({ lat: best[0], lon: best[1], metros: Number.isFinite(bd) ? bd : null });
    base.push(best);
  }
  return chosen;
}

export const fmtMetros = (m) => (m == null ? "?" : m >= 1000 ? `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
