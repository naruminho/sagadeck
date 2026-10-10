// Embute o que o slide de mapa usa (só entra no HTML de deck que tem mapa: src/build.js):
//  - Leaflet (BSD-2), o mapa ao vivo: src/runtime/vendor/leaflet.js, leaflet.css e LEAFLET-LICENSE.txt
//  - contornos leves dos estados do Brasil (IBGE, malha mínima, dado público) e dos países (Natural Earth 1:110m,
//    domínio público), simplificados e com 3 casas decimais (~100 m): src/runtime/vendor/geo-contornos.json.
//    Servem para pintar estado/país por valor (camada `areas`) e de fundo quando os tiles não carregam.
// Uso: node scripts/vendor-map.mjs   (os contornos se baixam da internet; o Leaflet vem do node_modules)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "runtime", "vendor");
const require = createRequire(import.meta.url);

const leaflet = path.dirname(require.resolve("leaflet/package.json"));
fs.copyFileSync(path.join(leaflet, "dist", "leaflet.js"), path.join(OUT, "leaflet.js"));
fs.copyFileSync(path.join(leaflet, "dist", "leaflet.css"), path.join(OUT, "leaflet.css"));
fs.copyFileSync(path.join(leaflet, "LICENSE"), path.join(OUT, "LEAFLET-LICENSE.txt"));

const UA = { "User-Agent": "sagadeck (scripts/vendor-map.mjs; https://github.com/naruminho/sagadeck)" };
const get = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); };

// código IBGE da UF -> sigla
const UF = { 11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF" };

// Douglas-Peucker em graus (contorno de fundo, não de medida) + 3 casas decimais
function simplify(ring, tol) {
  if (ring.length < 5) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = ring[a], [x2, y2] = ring[b];
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i];
      const dx = x2 - x1, dy = y2 - y1;
      const d = dx || dy ? Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy) : Math.hypot(x - x1, y - y1);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}
const round = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
const polys = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : []);
const slim = (geom, tol) => polys(geom)
  .map((poly) => poly.map((ring) => simplify(ring, tol).map(round)).filter((r) => r.length >= 4))
  .filter((poly) => poly.length);

const br = await get("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF");
const ufs = {};
for (const f of br.features) {
  const sigla = UF[Number(f.properties.codarea)];
  if (sigla) ufs[sigla] = slim(f.geometry, 0.04);
}
const ne = await get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson");
const paises = {};
for (const f of ne.features) {
  const p = f.properties;
  const code = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((c) => c && /^[A-Z]{2}$/.test(c));
  if (code) paises[code] = { nome: p.NAME_PT || p.NAME, poly: slim(f.geometry, 0.12) };
}
const out = { fonte: { uf: "IBGE, malha municipal (mínima), dado público", paises: "Natural Earth 1:110m, domínio público" }, uf: ufs, paises };
fs.writeFileSync(path.join(OUT, "geo-contornos.json"), JSON.stringify(out));
console.log(`✓ Leaflet ${require("leaflet/package.json").version}; ${Object.keys(ufs).length} UFs e ${Object.keys(paises).length} países em geo-contornos.json (${Math.round(fs.statSync(path.join(OUT, "geo-contornos.json")).size / 1024)} KB)`);
