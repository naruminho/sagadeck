// Mapa do Brasil por UF em grade (cartograma de ladrilhos): cada estado é um quadrado na posição aproximada dele.
// Sem geodados de fora (nada pede coisa à internet) e legível em slide: a cor diz o valor, o rótulo diz a UF.
import { esc } from "../markup.js";
import { formatNumber } from "../locale.js";

// [coluna, linha] de cada UF, do norte ao sul, do oeste ao leste
export const UF_GRID = {
  RR: [1, 0], AP: [3, 0],
  AM: [1, 1], PA: [2, 1], MA: [3, 1], CE: [4, 1], RN: [5, 1],
  AC: [0, 2], RO: [1, 2], TO: [2, 2], PI: [3, 2], PE: [4, 2], PB: [5, 2],
  MT: [1, 3], GO: [2, 3], BA: [3, 3], SE: [4, 3], AL: [5, 3],
  MS: [1, 4], DF: [2, 4], MG: [3, 4], ES: [4, 4],
  PR: [1, 5], SP: [2, 5], RJ: [3, 5],
  SC: [1, 6],
  RS: [1, 7],
};

const fmt = (v) => (Number.isFinite(v) ? formatNumber(v, { maximumFractionDigits: 1 }) : "");

// o: { ufmap: { SP: 120, RJ: 80, … }, suffix, prefix, highlight: [SP], legend: "texto", showValues }
export function ufmap(o, warnings) {
  const raw = o.ufmap && typeof o.ufmap === "object" ? o.ufmap : {};
  const vals = {};
  for (const [k, v] of Object.entries(raw)) {
    const uf = String(k).trim().toUpperCase();
    if (!UF_GRID[uf]) { warnings?.push(`ufmap: "${k}" não é uma UF (use a sigla: SP, RJ, MG…)`); continue; }
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) vals[uf] = n;
  }
  const nums = Object.values(vals);
  const min = nums.length ? Math.min(...nums) : 0, max = nums.length ? Math.max(...nums) : 1;
  const hl = new Set([].concat(o.highlight ?? []).map((x) => String(x).toUpperCase()));
  // mapa pequeno (quadro estreito): só as siglas, os valores ficam ilegíveis
  const S = 100, G = 8, showVal = o.showValues ?? !(o.cw && o.cw < 420);
  const cells = Object.entries(UF_GRID).map(([uf, [c, r]]) => {
    const x = c * (S + G), y = r * (S + G), has = uf in vals;
    // escala de 18% a 100% da cor de destaque: o menor valor ainda aparece
    const k = has ? (max === min ? 100 : Math.round(18 + ((vals[uf] - min) / (max - min)) * 82)) : 0;
    const fill = has ? `color-mix(in srgb,var(--em) ${k}%,var(--surface))` : "color-mix(in srgb,var(--fg) 7%,var(--surface))";
    const ink = has && k > 55 ? "var(--bg)" : "var(--fg)";
    const val = has && showVal ? `<text x="${x + S / 2}" y="${y + 74}" text-anchor="middle" font-size="22" style="fill:${ink}" class="uf-v f-body">${esc(`${o.prefix || ""}${fmt(vals[uf])}${o.suffix || ""}`)}</text>` : "";
    return `<g class="uf-cell${has ? "" : " uf-empty"}${hl.has(uf) ? " uf-hl" : ""}" data-uf="${uf}">
      <rect x="${x}" y="${y}" width="${S}" height="${S}" rx="12" style="fill:${fill}${hl.has(uf) ? ";stroke:var(--fg);stroke-width:6" : ""}"/>
      <text x="${x + S / 2}" y="${y + (val ? 44 : 60)}" text-anchor="middle" font-size="30" font-weight="700" style="fill:${ink}" class="uf-n f-heading">${uf}</text>${val}</g>`;
  });
  const W = 6 * (S + G) - G, H = 8 * (S + G) - G;
  const legend = nums.length ? `<div class="uf-legend f-label"><span>${esc(`${o.prefix || ""}${fmt(min)}${o.suffix || ""}`)}</span><i></i><span>${esc(`${o.prefix || ""}${fmt(max)}${o.suffix || ""}`)}</span>${o.legend ? `<b>${esc(o.legend)}</b>` : ""}</div>` : "";
  return `<div class="ufmap"><svg class="ufmap-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa do Brasil por UF">${cells.join("")}</svg>${legend}</div>`;
}
