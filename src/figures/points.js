// Figura de pontos: ícones desenhados com luzinhas (estilo show de drones), com morph de uma
// forma para outra. Uso: { points: fone } ou { points: { de: fone, para: mic, legenda, legendaPara } }.
// Só no HTML a troca é animada (clique na figura); PPTX/PDF usam a forma inicial.
const W = 20, H = 20;

const distSeg = (x, y, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
};
const P = {
  disc: (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r,
  ring: (cx, cy, r, th) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= th / 2,
  // arco: ângulos em graus, 0 = direita, anti-horário positivo (como na tela, y para baixo: use a0>a1 para o topo)
  arc: (cx, cy, r, th, a0, a1) => (x, y) => {
    if (Math.abs(Math.hypot(x - cx, y - cy) - r) > th / 2) return false;
    let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    if (a < 0) a += 360;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    return a >= lo && a <= hi;
  },
  rect: (x0, y0, w, h) => (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h,
  line: (x0, y0, x1, y1, th) => (x, y) => distSeg(x, y, x0, y0, x1, y1) <= th / 2,
  tri: (x0, y0, x1, y1, x2, y2) => (x, y) => {
    const s = (ax, ay, bx, by, cx, cy) => (cx - bx) * (ay - by) - (ax - bx) * (cy - by);
    const d1 = s(x, y, x0, y0, x1, y1), d2 = s(x, y, x1, y1, x2, y2), d3 = s(x, y, x2, y2, x0, y0);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  },
};
const any = (...fs) => (x, y) => fs.some((f) => f(x, y));

// Biblioteca de formas em grade 20×20 (tracejado grosso: cada forma tem 60–160 pontos).
const SHAPES = {
  // fone de ouvido: arco no topo + duas conchas
  fone: any(P.arc(10, 10.5, 7, 1.8, 180, 360), P.rect(1.6, 9.5, 3, 6.5), P.rect(15.4, 9.5, 3, 6.5)),
  // microfone: cabeça redonda + haste + base
  mic: any(P.disc(10, 5.6, 3.2), P.line(10, 8.8, 10, 15, 1.7), P.arc(10, 15.5, 3.4, 1.5, 15, 165), P.line(6.6, 17.6, 13.4, 17.6, 1.6)),
  // documento: folha + dobra + linhas de texto
  doc: any(
    P.rect(6, 2, 8, 16),
    P.tri(14, 2, 14, 6, 10, 2),
    P.rect(7.6, 8, 4.8, 1.1), P.rect(7.6, 10.2, 4.8, 1.1), P.rect(7.6, 12.4, 3.2, 1.1),
  ),
  // planilha: moldura + cabeçalho + grade
  planilha: any(
    P.rect(3.5, 3.5, 13, 13),
    P.rect(3.5, 3.5, 13, 3),
    P.line(10, 3.5, 10, 16.5, 0.9), P.line(3.5, 9, 16.5, 9, 0.9), P.line(3.5, 13, 16.5, 13, 0.9),
  ),
  // busca: lupa
  busca: any(P.ring(8.4, 8.4, 5, 2), P.line(12, 12, 17, 17, 2.2)),
  // conversa: balão + linhas de texto
  chat: any(
    P.rect(2.5, 4, 15, 9),
    P.tri(6, 13, 9, 13, 6.5, 17),
    P.rect(4.5, 6.2, 8, 1.1), P.rect(4.5, 8.6, 11, 1.1), P.rect(4.5, 11, 6, 1.1),
  ),
};
export const POINT_SHAPES = Object.keys(SHAPES);

function sample(shape) {
  const f = SHAPES[shape];
  if (!f) throw new Error(`points: forma desconhecida "${shape}" (vale: ${POINT_SHAPES.join(", ")})`);
  const pts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f(x + 0.5, y + 0.5)) pts.push({ x: x + 0.5, y: y + 0.5 });
  return pts;
}

// ordena pelo ângulo em torno do centroide: pontos vizinhos viajam juntos no morph
function order(pts) {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

export function pointsSVG(spec, { id = "pts" } = {}) {
  const single = typeof spec === "string" ? spec : spec.de;
  const target = typeof spec === "string" ? null : spec.para;
  const A = order(sample(single));
  const B = target ? order(sample(target)) : null;
  // equaliza: a menor repete os próprios pontos até empatar (o morph só translada)
  const N = Math.max(A.length, B ? B.length : 0);
  const pad = (v) => Array.from({ length: N }, (_, i) => v[i % v.length]);
  const a = pad(A), b = B ? pad(B) : null;
  const dots = a.map((p) => `<circle class="pts-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="0.62"/>`).join("");
  const model = b ? `<script class="pts-model" type="application/json">${JSON.stringify({ a, b }).replace(/</g, "\\u003c")}</script>` : "";
  const label = typeof spec === "object" && (spec.legenda || spec.legendaPara)
    ? `<div class="pts-legend f-label" data-legenda-a="${escAttr(spec.legenda || "")}" data-legenda-b="${escAttr(spec.legendaPara || spec.legenda || "")}" aria-live="polite">${escAttr(spec.legenda || "")}</div>`
    : "";
  const wrap = b ? ` data-points-morph="${id}" role="button" tabindex="0" aria-label="Transformar a figura (clique)"` : "";
  return `<div class="fig fig-points pts"${wrap}><svg class="pts-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Figura de pontos: ${escAttr(String(target ? `${single} virando ${target}` : single))}">${dots}</svg>${model}${label}</div>`;
}

const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
