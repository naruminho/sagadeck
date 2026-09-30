// Proporção do slide (deck.aspect): 16:9 (padrão), 4:3, 16:10, 1:1, 9:16 (retrato) ou qualquer L:A.
// A largura lógica é sempre 1920 px; a altura acompanha a proporção (4:3 → 1920 × 1440). Os layouts crescem na vertical
// sozinhos; o que tem posição livre (layout canvas, ajustes do Studio) é reescalado por convertAspect.
export const SLIDE_W = 1920;
export const ASPECTS = { "16:9": [16, 9], "4:3": [4, 3], "16:10": [16, 10], "1:1": [1, 1], "9:16": [9, 16], "3:2": [3, 2], "21:9": [21, 9], "a4": [297, 210] };

// "4:3" | "4/3" | "4x3" | 1.333 | { w, h } | { width, height } → [w, h] (ou null se não entender)
export function parseAspect(a) {
  if (a == null || a === "") return [16, 9];
  if (typeof a === "object") { const w = Number(a.w ?? a.width), h = Number(a.h ?? a.height); return w > 0 && h > 0 ? [w, h] : null; }
  if (typeof a === "number") return a > 0 ? [a, 1] : null;
  const s = String(a).trim().toLowerCase().replace(",", ".");
  if (ASPECTS[s]) return ASPECTS[s];
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/);
  if (m && +m[1] > 0 && +m[2] > 0) return [+m[1], +m[2]];
  if (/^\d+(\.\d+)?$/.test(s) && +s > 0) return [+s, 1];
  return null;
}

// tamanho lógico do slide do deck: { w: 1920, h, ratio: "4 / 3", label: "4:3" }
export function slideSize(spec = {}) {
  const [w, h] = parseAspect(spec.aspect) || [16, 9];
  const H = Math.round(Math.min(3600, Math.max(540, (SLIDE_W * h) / w))); // entre 32:9 e retrato alto
  return { w: SLIDE_W, h: H, ratio: `${SLIDE_W} / ${H}`, label: `${w}:${h}` };
}

// Trocar a proporção sem refazer à mão: posições livres (layout canvas em px de 1920 × altura) e deslocamentos
// verticais do Studio (visualEdits.dy) acompanham a nova altura. Devolve um deck novo (o original não muda).
export function convertAspect(spec, aspect) {
  const from = slideSize(spec).h, to = slideSize({ aspect }).h, k = to / from;
  const out = JSON.parse(JSON.stringify(spec));
  out.aspect = aspect;
  if (k === 1) return out;
  const scaleY = (o) => { if (!o || typeof o !== "object") return; for (const key of ["y", "h", "height"]) if (typeof o[key] === "number") o[key] = Math.round(o[key] * k); };
  for (const s of out.slides || []) {
    if (s.layout === "canvas") [].concat(s.elements || s.items || []).forEach(scaleY);
    for (const e of Object.values(s.visualEdits || {})) if (typeof e?.dy === "number") e.dy = Math.round(e.dy * k);
  }
  return out;
}
