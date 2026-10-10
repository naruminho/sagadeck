// Rotas pelas ruas e endereço de um ponto, para o editor do mapa (entrega 3) e as análises (entrega 5). Passam por
// callService (src/map-services.js): identificação do sagadeck e "uma tentativa e para".
//  - rota: OpenRouteService quando configurado com chave (a pé, de carro, de bicicleta; também isócronas) ou OSRM
//    (padrão público; o servidor de demonstração só tem carro de forma garantida);
//  - endereço de um ponto: Nominatim /reverse (ou compatível).
import { loadMapConfig, mapaFile } from "./map-config.js";
import { callService } from "./map-services.js";

export const MODOS = { pe: "a pé", carro: "de carro", bicicleta: "de bicicleta" };
const ORS_PROFILE = { pe: "foot-walking", carro: "driving-car", bicicleta: "cycling-regular" };
const OSRM_PROFILE = { pe: "foot", carro: "driving", bicicleta: "bike" };

const isORS = (r) => r && (r.provedor === "openrouteservice" || /openrouteservice/i.test(r.url || ""));

// pontos: [[lat, lon], …] (2 ou mais). Devolve { coords: [[lon, lat], …], distancia (m), duracao (s), modo }
export async function route(pontos, { modo = "pe", cfg = loadMapConfig(mapaFile()) } = {}) {
  if (!Array.isArray(pontos) || pontos.length < 2) throw new Error("Rota: preciso de pelo menos dois pontos.");
  const pts = pontos.map(([lat, lon]) => [Number(lat), Number(lon)]);
  if (pts.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b))) throw new Error("Rota: ponto sem coordenada.");
  const r = cfg.rotas;
  const m = MODOS[modo] ? modo : "pe";
  if (isORS(r) && r.key) {
    const base = (r.url || "https://api.openrouteservice.org").replace(/\/+$/, "");
    const res = await callService("rotas", `${base}/v2/directions/${ORS_PROFILE[m]}/geojson`, {
      method: "POST", cfg, headers: { Authorization: r.key, "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
      body: JSON.stringify({ coordinates: pts.map(([lat, lon]) => [lon, lat]) }),
    });
    const j = await res.json();
    const f = j.features?.[0];
    if (!f) throw new Error("Rota: o serviço não achou caminho entre os pontos.");
    return { coords: f.geometry.coordinates, distancia: f.properties?.summary?.distance ?? 0, duracao: f.properties?.summary?.duration ?? 0, modo: m };
  }
  const base = (r?.url || "https://router.project-osrm.org").replace(/\/+$/, "");
  const res = await callService("rotas", `${base}/route/v1/${OSRM_PROFILE[m]}/${pts.map(([lat, lon]) => `${lon},${lat}`).join(";")}?overview=full&geometries=geojson`, { cfg });
  const j = await res.json();
  const rt = j.routes?.[0];
  if (!rt) throw new Error("Rota: o serviço não achou caminho entre os pontos.");
  return { coords: rt.geometry.coordinates, distancia: rt.distance, duracao: rt.duration, modo: m };
}

// área alcançável em X minutos a partir de um ponto (só OpenRouteService): GeoJSON Polygon
export async function isochrone([lat, lon], minutos, { modo = "pe", cfg = loadMapConfig(mapaFile()) } = {}) {
  const r = cfg.rotas;
  if (!isORS(r) || !r.key) throw new Error("Área alcançável precisa do OpenRouteService com chave (Configurar mapa).");
  const base = (r.url || "https://api.openrouteservice.org").replace(/\/+$/, "");
  const res = await callService("rotas", `${base}/v2/isochrones/${ORS_PROFILE[MODOS[modo] ? modo : "pe"]}`, {
    method: "POST", cfg, headers: { Authorization: r.key, "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
    body: JSON.stringify({ locations: [[Number(lon), Number(lat)]], range: [Math.round(Number(minutos) * 60)], range_type: "time" }),
  });
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) throw new Error("Área alcançável: o serviço não devolveu a área.");
  return f.geometry;
}

// endereço de um ponto (para preencher a coluna de endereço de um ponto novo)
export async function reverseGeocode(lat, lon, { cfg = loadMapConfig(mapaFile()) } = {}) {
  const g = cfg.geocoder;
  const res = await callService("geocoder", `${g.url.replace(/\/+$/, "")}/reverse?format=jsonv2&lat=${Number(lat)}&lon=${Number(lon)}${g.key ? `&key=${encodeURIComponent(g.key)}` : ""}`, { cfg });
  const j = await res.json();
  return j?.display_name || "";
}

// distância em metros entre dois pontos [lat, lon] (haversine): a régua e o "mais próximo" (entrega 5)
export function distance([lat1, lon1], [lat2, lon2]) {
  const R = 6371008.8, rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
