// Infográficos (layout infographic): as formas clássicas de slide de consultoria, desenhadas na hora para qualquer
// quantidade de itens. A geometria (arcos, trilhas, anéis, linhas de metrô) é SVG; os textos são HTML de verdade
// por cima, no mesmo sistema de coordenadas (viram caixas de texto editáveis no PowerPoint) e encolhem para caber
// (data-fit). Uma cor por item, tirada do tema: numa paleta de família, os parentes dela; senão, tons harmônicos
// ao destaque. Neutros (fundo, linhas, texto) são as variáveis do tom do slide, então funciona em claro e escuro.
//
//   shape: arco | ramos | lados | trilhas | metro | ciclo | pista
//   center: "Título" ou { title, text, icon }
//   items: [{ title, text, icon, steps: [...] (só trilhas) }]
import { md } from "./markup.js";
import { iconSVG } from "./figures/icons.js";

const W = 1680, H = 700;
export const INFOGRAPHIC_SHAPES = {
  arco: { max: 8, label: "Arco: centro com anel colorido e itens numerados em pílulas ao longo de um arco" },
  ramos: { max: 6, label: "Ramos: centro e cartões numerados com título e texto, ligados por um arco" },
  lados: { max: 8, label: "Lados: peça central e itens com ícone em anel, metade de cada lado" },
  trilhas: { max: 4, label: "Trilhas: um objetivo e linhas de etapas encadeadas (estratégia, tática…), uma cor por coluna" },
  metro: { max: 7, label: "Metrô: centro e linhas que se abrem até cada item, com ícone e legenda" },
  ciclo: { max: 8, label: "Ciclo: etapas em volta de um círculo, cada uma ligada à seguinte por uma seta curva (ciclo da água, PDCA, ciclo de vida)" },
  pista: { max: 8, label: "Pista: um circuito de corrida visto de cima (estilo Mario Kart), com os itens como marcos ao longo da volta (uma história, uma jornada, as fases de um projeto)" },
};

// ---- cores ----------------------------------------------------------------------------------------------------
const rgb = (h) => [0, 2, 4].map((i) => parseInt(String(h).replace("#", "").slice(i, i + 2), 16));
const toHex = (a) => a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, p) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function toHsl(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const hh = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hh * 60 + 360) % 360, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
}
function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return toHex([0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))));
}
const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const CANDIDATOS = [212, 272, 145, 28, 335, 175, 48, 300, 100, 195];

// n cores de item para o tema (hex sem #)
export function itemColors(theme, n) {
  const c = theme.colors || {}, paper = c.paper || "FFFFFF", ink = c.ink || "222222", accent = c.accent || "0F6CBD";
  // cor que aparece sobre o fundo e aceita letra clara por cima (contraste 3): clara demais escurece mantendo o matiz
  const visible = (x) => {
    if (contrast(x, paper) >= 3) return x;
    const { h, s, l } = toHsl(x);
    for (let L = l; L > 0.18; L -= 0.02) { const y = fromHsl(h, Math.max(s, 0.45), L); if (contrast(y, paper) >= 3) return y; }
    return mix(ink, x, 0.6);
  };
  const out = [visible(accent)];
  const differs = (x) => out.every((y) => contrast(x, y) > 1.25 || dist(toHsl(x).h, toHsl(y).h) > 14);
  const fam = Object.keys(c).filter((k) => /^f\d+$/.test(k)).sort((a, b) => a.slice(1) - b.slice(1)).map((k) => c[k]);
  if (fam.length >= 2) {
    for (const f of fam.map(visible)) if (differs(f)) out.push(f);
    const { h, s, l } = toHsl(out[0]);
    for (const [dh, dl] of [[16, 0], [-16, 0], [0, -0.12], [0, 0.1], [16, -0.1], [-16, 0.1]]) { if (out.length >= Math.max(n, 4)) break; const y = visible(fromHsl((h + dh + 360) % 360, Math.max(s, 0.4), Math.min(0.7, Math.max(0.25, l + dl)))); if (differs(y)) out.push(y); }
  } else {
    const { h, s, l } = toHsl(out[0]);
    const S = Math.min(0.7, Math.max(0.45, s)), L = Math.min(0.56, Math.max(0.42, l));
    for (const hh of CANDIDATOS) { if (out.length >= Math.max(n, 6)) break; if (dist(hh, h) > 30 && out.every((y) => dist(toHsl(y).h, hh) > 30)) out.push(visible(fromHsl(hh, S, L))); }
  }
  return Array.from({ length: n }, (_, i) => out[i % out.length]);
}
// letra sobre uma cor: a do papel (clara) se lê bem; senão, a tinta
const onColor = (theme, x) => { const p = theme.colors?.paper || "FFFFFF", k = theme.colors?.ink || "222222"; return contrast(x, p) >= 3 ? p : k; };

// ---- peças ------------------------------------------------------------------------------------------------------
const F = (n) => +n.toFixed(1);
const FG = "color-mix(in srgb,var(--fg) 86%,var(--bg))"; // texto: grafite, nunca a cor cheia do tema
const LINE = "color-mix(in srgb,var(--fg) 45%,var(--bg))";
const icon = (name, size, color) => {
  if (!name) return "";
  try { return `<span class="ig-ic" style="color:${color};width:${size}px;height:${size}px">${iconSVG(name, { size, stroke: 1.9 })}</span>`; } catch { return ""; }
};
// Caixa de texto posicionada. Quem encolhe para caber é a caixa (data-fit, altura fixa): título e texto dentro
// dela têm o tamanho em em (base 20px), então encolhem juntos, na mesma proporção. Só pelo próprio tamanho
// (data-fit-self): é posicionada, encolher não abre espaço para o que vaza noutro canto do slide.
// Alinhamento "safe": se não couber, alinha pelo topo e o excesso vai para baixo, onde a medida (scrollHeight) o vê;
// centralizado ou no pé, o excesso subiria por cima da caixa sem ninguém perceber (e o título sairia cortado).
function box(x, y, w, h, inner, { align = "left", valign = "center", cls = "" } = {}) {
  return `<div class="ig-box ${cls}" data-fit data-fit-self style="font-size:20px;left:${F(x)}px;top:${F(y)}px;width:${F(w)}px;height:${F(h)}px;text-align:${align};justify-content:${valign === "top" ? "flex-start" : valign === "bottom" ? "safe flex-end" : "safe center"};align-items:${align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"}">${inner}</div>`;
}
const em = (px) => `${F(px / 20)}em`;
const title = (t, size, color, extra = "") => (t ? `<div class="t f-heading ig-t" style="font-size:${em(size)};color:${color};${extra}">${md(String(t))}</div>` : "");
const body = (t, size, color) => (t ? `<div class="t f-body ig-x" style="font-size:${em(size)};color:${color}">${md(String(t))}</div>` : "");
const svg = (inner) => `<svg class="ig-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${inner}</svg>`;
const arcPath = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${F(x0)} ${F(y0)} A${F(r)} ${F(r)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${F(x1)} ${F(y1)}`;
};
// Sombra e ponta de seta com nome próprio por slide: com o mesmo nome em todos, o navegador usaria a definição do
// primeiro slide, que fica invisível enquanto outro está na tela (e a seta sumiria junto).
let ID = "ig";
const shadow = () => `<defs><filter id="${ID}s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity=".16"/></filter><marker id="${ID}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:${LINE}"/></marker></defs>`;
const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36); };
// cada item numa camada: com build, aparece no seu clique
const layer = (inner, step) => `<div class="ig-layer"${step ? ` data-step="${step}"` : ""}>${inner}</div>`;
const norm = (x) => (typeof x === "string" ? { title: x } : x && typeof x === "object" ? x : {});
const centerOf = (s) => norm(s.center ?? s.hub ?? "");

// ---- formas -----------------------------------------------------------------------------------------------------
function arco(s, items, cols, theme) {
  const n = items.length, cx = 400, cy = H / 2, R = 205;
  const ph = Math.min(104, (H - 16) / n - 14);
  // pílulas em alturas iguais (sem encavalar nas pontas); o ponto de cada uma no arco sai da altura
  const span = n > 1 ? Math.min(H - ph - 12, (ph + 16) * (n - 1) * 1.25) : 0, ys = items.map((_, i) => (n > 1 ? cy - span / 2 + (i * span) / (n - 1) : cy));
  const R2 = Math.max(R + 130, span / 2 / Math.sin((62 * Math.PI) / 180));
  const thm = n > 1 ? Math.asin(Math.min(1, span / 2 / R2)) : 0;
  const c = centerOf(s);
  const seg = (2 * Math.PI) / n, gap = 0.06;
  let base = svg(`${shadow()}<path d="${arcPath(cx, cy, R2, -thm - 0.26, thm + 0.26)}" style="fill:none;stroke:${LINE}" stroke-width="5" stroke-linecap="round"/>
    ${[-thm - 0.26, thm + 0.26].map((a) => `<circle cx="${F(cx + R2 * Math.cos(a))}" cy="${F(cy + R2 * Math.sin(a))}" r="8" style="fill:${LINE}"/>`).join("")}
    ${cols.map((col, i) => `<path d="${arcPath(cx, cy, R + 26, -Math.PI / 2 + i * seg + gap / 2, -Math.PI / 2 + (i + 1) * seg - gap / 2)}" style="fill:none;stroke:#${col}" stroke-width="22"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="${R}" style="fill:var(--bg);stroke:${LINE}" stroke-width="1.5" filter="url(#${ID}s)"/>`);
  base += box(cx - R * 0.74, cy - R * 0.66, R * 1.48, R * 1.32, `${icon(c.icon, 64, FG)}${title(c.title, 50, FG, "font-weight:800;line-height:1.05")}${body(c.text, 22, FG)}`, { align: "center", cls: "ig-center" });
  const layers = items.map((it, i) => {
    const dy = ys[i], dx = cx + Math.sqrt(R2 * R2 - (dy - cy) ** 2), col = cols[i], on = onColor(theme, col);
    const bx = dx + 92, br = ph / 2 + 4;
    const g = svg(`<line x1="${F(dx)}" y1="${F(dy)}" x2="${F(bx - br)}" y2="${F(dy)}" style="stroke:${LINE}" stroke-width="3"/>
      <circle cx="${F(dx)}" cy="${F(dy)}" r="17" style="fill:#${col};stroke:var(--bg)" stroke-width="6" filter="url(#${ID}s)"/>
      <rect x="${F(bx)}" y="${F(dy - ph / 2)}" width="${F(W - 6 - bx)}" height="${F(ph)}" rx="${F(ph / 2)}" style="fill:#${col}" filter="url(#${ID}s)"/>
      <circle cx="${F(bx)}" cy="${F(dy)}" r="${F(br)}" style="fill:var(--bg)" filter="url(#${ID}s)"/>`);
    const num = box(bx - br, dy - br, br * 2, br * 2, it.icon ? icon(it.icon, br * 0.95, `#${col}`) : title(String(i + 1).padStart(2, "0"), Math.min(40, br * 0.9), `#${col}`, "font-weight:800"), { align: "center" });
    const tx = bx + br + 22;
    return layer(g + num + box(tx, dy - ph / 2 + 6, W - 34 - tx, ph - 12, `${title(it.title, Math.min(30, ph * 0.34), `#${on}`, "font-weight:700")}${body(it.text, Math.min(21, ph * 0.24), `#${on}`)}`), s.build ? i + 1 : 0);
  });
  return base + layers.join("");
}

function ramos(s, items, cols, theme) {
  const n = items.length, cx = 300, cy = H / 2, R = 172, Rs = R + 105;
  const c = centerOf(s), dark = "color-mix(in srgb,var(--fg) 88%,var(--bg))";
  let base = svg(`${shadow()}<circle cx="${cx}" cy="${cy}" r="${R + 62}" style="fill:none;stroke:${LINE}" stroke-width="5" stroke-dasharray="14 16"/>
    <circle cx="${cx}" cy="${cy}" r="${R + 24}" style="fill:var(--bg);stroke:color-mix(in srgb,var(--fg) 12%,var(--bg))" stroke-width="3" filter="url(#${ID}s)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" style="fill:${dark}"/>
    <path d="${arcPath(cx, cy, Rs, -1.2, 1.2)}" style="fill:none;stroke:${LINE}" stroke-width="4"/>`);
  base += box(cx - R * 0.78, cy - R * 0.7, R * 1.56, R * 1.4, `${icon(c.icon, 56, "var(--bg)")}${title(c.title, 40, "var(--bg)", "font-weight:700;line-height:1.1")}${body(c.text, 21, "var(--bg)")}`, { align: "center", cls: "ig-center" });
  const x0 = 820, cw = W - 8 - x0, gap = 26, ch = Math.min(188, (H - gap * (n - 1)) / n), y0 = (H - (n * ch + (n - 1) * gap)) / 2;
  const layers = items.map((it, i) => {
    const yc = y0 + i * (ch + gap) + ch / 2, col = cols[i];
    const dyc = Math.max(-Rs * 0.9, Math.min(Rs * 0.9, yc - cy)), dx = cx + Math.sqrt(Rs * Rs - dyc * dyc);
    const br = Math.min(ch * 0.3, 48), bxc = x0 + ch / 2 + 4;
    const g = svg(`<path d="M${F(dx)} ${F(cy + dyc)} H 730 V ${F(yc)} H ${x0}" style="fill:none;stroke:${LINE}" stroke-width="3.5"/>
      <circle cx="${F(dx)}" cy="${F(cy + dyc)}" r="13" style="fill:#${col};stroke:var(--bg)" stroke-width="4"/>
      <rect x="${x0}" y="${F(yc - ch / 2)}" width="${F(cw)}" height="${F(ch)}" rx="${F(ch / 2)}" style="fill:var(--bg);stroke:#${col}" stroke-width="6"/>
      <circle cx="${F(bxc)}" cy="${F(yc)}" r="${F(br)}" style="fill:#${col}"/>`);
    const num = box(bxc - br, yc - br, br * 2, br * 2, it.icon ? icon(it.icon, br, `#${onColor(theme, col)}`) : title(String(i + 1), br * 0.9, `#${onColor(theme, col)}`, "font-weight:700"), { align: "center" });
    const tx = bxc + br + 24;
    return layer(g + num + box(tx, yc - ch / 2 + 12, x0 + cw - ch / 3 - tx, ch - 24, `${title(it.title, Math.min(34, ch * 0.22), FG, "font-weight:700")}${body(it.text, Math.min(22, ch * 0.15), "color-mix(in srgb,var(--fg) 72%,var(--bg))")}`), s.build ? i + 1 : 0);
  });
  return base + layers.join("");
}

function lados(s, items, cols, theme) {
  const n = items.length, cy = H / 2, c = centerOf(s);
  const pw = 290, ph = 150, px0 = W / 2 - pw / 2;
  const nl = Math.ceil(n / 2), nr = n - nl;
  let base = svg(`${shadow()}<rect x="${px0}" y="${cy - ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}" style="fill:var(--bg);stroke:${LINE}" stroke-width="10" filter="url(#${ID}s)"/>`);
  base += box(px0 + 20, cy - ph / 2 + 12, pw - 40, ph - 24, c.icon ? `${icon(c.icon, 76, FG)}` : title(c.title, 36, FG, "font-weight:800"), { align: "center", cls: "ig-center" });
  const side = (list, off, left) => {
    const k = list.length; if (!k) return "";
    const sp = H / k, r = Math.min(72, sp * 0.36), ccx = left ? 520 : W - 520, spine = left ? 640 : W - 640, edge = left ? px0 : px0 + pw;
    const ys = list.map((_, j) => sp * (j + 0.5));
    let out = svg(`<path d="M${edge} ${cy} H ${spine} M${spine} ${F(Math.min(cy, ys[0]))} V ${F(Math.max(cy, ys[k - 1]))}" style="fill:none;stroke:${LINE}" stroke-width="2.5"/>`);
    list.forEach((it, j) => {
      const i = off + j, y = ys[j], col = cols[i], bw = left ? ccx - r - 44 : W - (ccx + r + 44), bh = Math.min(sp - 14, 180);
      const g = svg(`<path d="M${spine} ${F(y)} H ${F(left ? ccx + r + 10 : ccx - r - 10)}" style="fill:none;stroke:${LINE}" stroke-width="2.5" marker-end="url(#${ID}a)"/>
        <circle cx="${ccx}" cy="${F(y)}" r="${F(r)}" style="fill:var(--bg);stroke:#${col}" stroke-width="${F(r * 0.2)}" filter="url(#${ID}s)"/>`);
      const ic = box(ccx - r, y - r, r * 2, r * 2, it.icon ? icon(it.icon, r * 0.85, FG) : title(String(i + 1), r * 0.8, `#${col}`, "font-weight:800"), { align: "center" });
      const tx = left ? 10 : ccx + r + 34;
      out += layer(g + ic + box(tx, y - bh / 2, bw, bh, `${title(it.title, Math.min(32, sp * 0.18), `#${col}`, "font-weight:700")}${body(it.text, Math.min(22, sp * 0.12), FG)}`, { align: left ? "right" : "left" }), s.build ? i + 1 : 0);
    });
    return out;
  };
  return base + side(items.slice(0, nl), 0, true) + side(items.slice(nl), nl, false);
}

function trilhas(s, items, cols, theme) {
  const rows = items.map((it) => [it, ...(Array.isArray(it.steps) ? it.steps.map(norm) : [])].slice(0, 4));
  const n = rows.length, m = Math.max(...rows.map((r) => r.length)), c = centerOf(s), cy = H / 2;
  const goalCol = (theme.colors?.alert || "D33A2C"), onGoal = onColor(theme, goalCol);
  const R = Math.min(150, H * 0.22), gx = R + 20, spine = gx + R + 50, x0 = spine + 44;
  const g = 90, bw = (W - x0 - (m - 1) * g) / m, gy = 46, bh = Math.min(290, (H - (n - 1) * gy) / n), y0 = (H - (n * bh + (n - 1) * gy)) / 2;
  const ys = rows.map((_, i) => y0 + i * (bh + gy) + bh / 2);
  const colColors = itemColors(theme, m);
  let base = svg(`${shadow()}<circle cx="${F(gx)}" cy="${cy}" r="${F(R)}" style="fill:#${goalCol}" filter="url(#${ID}s)"/>
    <path d="M${F(gx + R)} ${cy} H ${F(spine)} M${F(spine)} ${F(Math.min(cy, ys[0]))} V ${F(Math.max(cy, ys[n - 1]))}" style="fill:none;stroke:${LINE}" stroke-width="2.5"/>`);
  base += box(gx - R * 0.75, cy - R * 0.7, R * 1.5, R * 1.4, `${icon(c.icon, 64, `#${onGoal}`)}${title(c.title, 40, `#${onGoal}`, "font-weight:800")}${body(c.text, 20, `#${onGoal}`)}`, { align: "center", cls: "ig-center" });
  let step = 0;
  const layers = rows.map((row, i) => {
    const y = ys[i];
    let lines = `<path d="M${F(spine)} ${F(y)} H ${F(x0 - 8)}" style="fill:none;stroke:${LINE}" stroke-width="2.5" marker-end="url(#${ID}a)"/>`;
    let texts = "";
    row.forEach((b, j) => {
      const x = x0 + j * (bw + g), col = colColors[j], on = `#${onColor(theme, col)}`;
      lines += `<rect x="${F(x)}" y="${F(y - bh / 2)}" width="${F(bw)}" height="${F(bh)}" rx="28" style="fill:#${col}" filter="url(#${ID}s)"/>`;
      if (j < row.length - 1) lines += `<path d="M${F(x + bw + 6)} ${F(y)} H ${F(x + bw + g - 8)}" style="fill:none;stroke:${LINE}" stroke-width="2.5" marker-end="url(#${ID}a)"/>`;
      texts += box(x + 18, y - bh / 2 + 14, bw - 36, bh - 28, `${icon(b.icon, Math.min(56, bh * 0.22), on)}${title(b.title, Math.min(30, bh * 0.13), on, "font-weight:700")}${body(b.text, Math.min(21, bh * 0.09), on)}`, { align: "center" });
    });
    return layer(svg(lines) + texts, s.build ? ++step : 0);
  });
  return base + layers.join("");
}

function metro(s, items, cols, theme) {
  const n = items.length, cy = H / 2, c = centerOf(s);
  const R = Math.min(180, H * 0.27), hx = R + 30, hi = theme.colors?.accent || "0F6CBD", onHi = `#${onColor(theme, hi)}`;
  const x0 = hx + R + 40, sp = H / n, mid = (n - 1) / 2, r = Math.min(64, sp * 0.4), end = W - 26;
  let base = svg(`${shadow()}<circle cx="${F(hx)}" cy="${cy}" r="${F(R + 16)}" style="fill:none;stroke:#${hi}" stroke-width="2" opacity=".6"/>
    <circle cx="${F(hx)}" cy="${cy}" r="${F(R)}" style="fill:#${hi}" filter="url(#${ID}s)"/>`);
  base += box(hx - R * 0.74, cy - R * 0.62, R * 1.48, R * 1.24, `${icon(c.icon, 56, onHi)}${title(c.title, 44, onHi, "font-weight:800")}${body(c.text, 21, onHi)}`, { align: "center", cls: "ig-center" });
  const layers = items.map((it, i) => {
    const col = cols[i], t = mid ? Math.abs(i - mid) / mid : 0, y0 = cy + (i - mid) * 24, y = sp * (i + 0.5);
    const xb = x0 + 60 + 50 * (1 - t), xe = xb + Math.abs(y - y0) * 0.55, cxi = 1160 + 200 * (1 - t);
    const up = y < cy - 1 || (n === 1);
    const g = svg(`<path d="M${F(x0)} ${F(y0)} H ${F(xb)} L ${F(xe)} ${F(y)} H ${F(end)}" style="fill:none;stroke:#${col}" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="${F(x0)}" cy="${F(y0)}" r="9" style="fill:var(--bg);stroke:#${col}" stroke-width="4"/>
      <circle cx="${F(end)}" cy="${F(y)}" r="11" style="fill:var(--bg);stroke:#${col}" stroke-width="4"/>
      ${[0, 1, 2].map((k) => `<circle cx="${F(cxi - r - 56 + k * 16)}" cy="${F(y)}" r="5" style="fill:#${col}"/>`).join("")}
      <circle cx="${F(cxi)}" cy="${F(y)}" r="${F(r + 10)}" style="fill:none;stroke:#${col}" stroke-width="2" opacity=".55"/>
      <circle cx="${F(cxi)}" cy="${F(y)}" r="${F(r)}" style="fill:#${col}" filter="url(#${ID}s)"/>`);
    const ic = box(cxi - r, y - r, r * 2, r * 2, it.icon ? icon(it.icon, r * 0.9, `#${onColor(theme, col)}`) : title(String(i + 1), r * 0.8, `#${onColor(theme, col)}`, "font-weight:800"), { align: "center" });
    // legenda dentro da faixa do próprio item (acima da linha na metade de cima, abaixo na de baixo): nunca sai do
    // palco nem invade a faixa do vizinho
    const bx = xe + 24, bw = cxi - r - 70 - bx, bh = Math.min(sp / 2 - 6, 150);
    const cap = box(bx, up ? y - 6 - bh : y + 8, bw, bh, `${title(it.title, Math.min(28, sp * 0.2), `#${col}`, "font-weight:700")}${body(it.text, Math.min(20, sp * 0.13), FG)}`, { align: "right", valign: up ? "bottom" : "top" });
    return layer(g + ic + cap, s.build ? i + 1 : 0);
  });
  return base + layers.join("");
}

// Ciclo: as etapas numa elipse, em sentido horário a partir de cima, cada uma ligada à seguinte por uma seta curva na
// cor dela (a última volta para a primeira); o nome do ciclo no centro. O texto de cada etapa fica do lado de fora,
// afastado da seta: acima/abaixo nas etapas do alto e de baixo, ao lado nas outras (subindo ou descendo para longe do
// arco).
function ciclo(s, items, cols, theme) {
  const n = items.length, cx = W / 2, cy = H / 2, c = centerOf(s);
  const Rx = 440, Ry = 172, r = 46;
  const ang = items.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);
  const pt = (a) => [cx + Rx * Math.cos(a), cy + Ry * Math.sin(a)];
  const gap = (r + 16) / ((Rx + Ry) / 2); // o arco começa e termina fora do círculo da etapa
  const markers = cols.map((col, i) => `<marker id="${ID}c${i}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:#${col}"/></marker>`).join("");
  let base = svg(`${shadow()}<defs>${markers}</defs><ellipse cx="${cx}" cy="${cy}" rx="${Rx}" ry="${Ry}" style="fill:none;stroke:${LINE}" stroke-width="1.5" stroke-dasharray="3 9" opacity=".6"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${Rx * 0.42}" ry="${Ry * 0.62}" style="fill:var(--bg);stroke:color-mix(in srgb,var(--fg) 12%,var(--bg))" stroke-width="3" filter="url(#${ID}s)"/>`);
  base += box(cx - Rx * 0.36, cy - Ry * 0.52, Rx * 0.72, Ry * 1.04, `${icon(c.icon, 52, FG)}${title(c.title, 36, FG, "font-weight:800;line-height:1.1")}${body(c.text, 19, FG)}`, { align: "center", cls: "ig-center" });
  const layers = items.map((it, i) => {
    const a = ang[i], [x, y] = pt(a), col = cols[i], on = `#${onColor(theme, col)}`;
    let arrow = "";
    if (n > 1) {
      const [x1, y1] = pt(a + gap), [x2, y2] = pt(a + (2 * Math.PI) / n - gap);
      arrow = `<path d="M${F(x1)} ${F(y1)} A${Rx} ${Ry} 0 0 1 ${F(x2)} ${F(y2)}" style="fill:none;stroke:#${col}" stroke-width="7" stroke-linecap="round" marker-end="url(#${ID}c${i})"/>`;
    }
    const g = svg(`${arrow}<circle cx="${F(x)}" cy="${F(y)}" r="${r + 9}" style="fill:var(--bg)" filter="url(#${ID}s)"/><circle cx="${F(x)}" cy="${F(y)}" r="${r}" style="fill:#${col}"/>`);
    const ic = box(x - r, y - r, r * 2, r * 2, it.icon ? icon(it.icon, r * 0.95, on) : title(String(i + 1), r * 0.8, on, "font-weight:800"), { align: "center" });
    const ux = Math.cos(a), uy = Math.sin(a), inner = `${title(it.title, 27, `#${col}`, "font-weight:700")}${body(it.text, 19, FG)}`;
    let cap;
    if (Math.abs(uy) > 0.9) { // no alto ou embaixo: acima/abaixo da etapa, centrado
      const bw = 420, bh = Math.min(116, uy < 0 ? y - r - 18 : H - 4 - (y + r + 12));
      cap = box(x - bw / 2, uy < 0 ? y - r - 14 - bh : y + r + 12, bw, bh, inner, { align: "center", valign: uy < 0 ? "bottom" : "top" });
    } else { // ao lado, para fora, subindo (metade de cima) ou descendo (de baixo) para longe do arco
      const bw = ux > 0 ? Math.min(380, W - 6 - (x + r + 18)) : Math.min(380, x - r - 18 - 6), bh = 130;
      const bx = ux > 0 ? x + r + 18 : x - r - 18 - bw, by = uy < -0.15 ? y - bh + r * 0.6 : uy > 0.15 ? y - r * 0.6 : y - bh / 2;
      cap = box(bx, Math.max(4, Math.min(H - 4 - bh, by)), bw, bh, inner, { align: ux > 0 ? "left" : "right", valign: uy < -0.15 ? "bottom" : uy > 0.15 ? "top" : "center" });
    }
    return layer(g + ic + cap, s.build ? i + 1 : 0);
  });
  return base + layers.join("");
}

// Pista: um circuito de corrida visto de cima (estilo Mario Kart), com grama, zebra, asfalto, faixa do meio, largada
// quadriculada e caixas de item; os itens são os marcos da volta, a distâncias iguais a partir da largada, cada um com
// a sua placa (o cartão vai para fora da pista, ou para dentro quando a borda do palco não deixa); o centro é a placa
// do meio do circuito. As cores da cena (grama, asfalto, zebra) são as de uma pista; os marcos, as do tema.
// achatada no meio do palco: em cima e embaixo sobra uma faixa para as placas
const TRACK = [[190, 470], [200, 210], [400, 105], [610, 235], [820, 120], [1110, 105], [1430, 150], [1535, 360], [1390, 575], [1010, 600], [700, 520], [430, 610]]
  .map(([x, y]) => [Math.round(140 + (x - 190) * 1.04), Math.round(350 + (y - 357) * 0.5)]);
function trackModel() {
  const n = TRACK.length, P = (i) => TRACK[(i + n) % n];
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    segs.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  const d = `M${F(segs[0][0][0])} ${F(segs[0][0][1])}` + segs.map(([, a, b, c]) => ` C${F(a[0])} ${F(a[1])} ${F(b[0])} ${F(b[1])} ${F(c[0])} ${F(c[1])}`).join("") + " Z";
  const pts = [];
  for (const [a, b, c, e] of segs) for (let k = 0; k < 40; k++) {
    const t = k / 40, u = 1 - t;
    pts.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * e[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * e[1]]);
  }
  const len = [0];
  for (let i = 1; i <= pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i % pts.length][0] - pts[i - 1][0], pts[i % pts.length][1] - pts[i - 1][1]));
  const total = len[len.length - 1];
  // ponto e direção a uma fração da volta
  const at = (f) => {
    const L = ((f % 1) + 1) % 1 * total;
    let i = len.findIndex((v) => v > L) - 1; if (i < 0) i = 0;
    const p = pts[i % pts.length], q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy) || 1;
    return { x: p[0], y: p[1], tx: dx / m, ty: dy / m };
  };
  const cx = TRACK.reduce((a, p) => a + p[0], 0) / n, cy = TRACK.reduce((a, p) => a + p[1], 0) / n;
  return { d, at, cx, cy };
}
function pista(s, items, cols, theme) {
  const n = items.length, c = centerOf(s), T = trackModel(), RW = 86;
  const grass = "#5DAE4F", grass2 = "#4E9A43", asphalt = "#5B6068";
  // árvores e arbustos fixos (a mesma pista em toda exportação)
  const trees = [[90, 90], [130, 640], [700, 60], [980, 260], [1250, 300], [1600, 90], [1610, 640], [560, 400], [1180, 420], [300, 330], [850, 660], [1560, 520]];
  const start = T.at(0), ang = (Math.atan2(start.ty, start.tx) * 180) / Math.PI;
  const boxes = [0.18, 0.47, 0.79].map((f) => T.at(f));
  let base = svg(`${shadow()}<defs><pattern id="${ID}k" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#fff"/><rect width="10" height="10" fill="#111"/><rect x="10" y="10" width="10" height="10" fill="#111"/></pattern>
      <linearGradient id="${ID}q" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD54A"/><stop offset=".5" stop-color="#FF6FB5"/><stop offset="1" stop-color="#5BC0FF"/></linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="${H}" rx="36" fill="${grass}"/>
    ${trees.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${18 + (i % 3) * 6}" fill="${grass2}"/><circle cx="${x - 6}" cy="${y - 6}" r="${8 + (i % 3) * 3}" fill="#6BC25C"/>`).join("")}
    <path d="${T.d}" fill="none" stroke="#fff" stroke-width="${RW + 22}" stroke-linejoin="round"/>
    <path d="${T.d}" fill="none" stroke="#E53935" stroke-width="${RW + 22}" stroke-dasharray="26 26" stroke-linejoin="round"/>
    <path d="${T.d}" fill="none" stroke="${asphalt}" stroke-width="${RW}" stroke-linejoin="round"/>
    <path d="${T.d}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="26 30" opacity=".85"/>
    <rect x="${F(start.x - 12)}" y="${F(start.y - RW / 2)}" width="24" height="${RW}" fill="url(#${ID}k)" transform="rotate(${F(ang)} ${F(start.x)} ${F(start.y)})"/>
    ${boxes.map((b, i) => `<rect x="${F(b.x - 15)}" y="${F(b.y - 15)}" width="30" height="30" rx="6" fill="url(#${ID}q)" stroke="#fff" stroke-width="3" opacity=".95" transform="rotate(${20 + i * 25} ${F(b.x)} ${F(b.y)})"/>`).join("")}
    ${c.title || c.text ? `<rect x="${F(T.cx - 170)}" y="${F(T.cy - 36)}" width="340" height="72" rx="16" style="fill:var(--bg);stroke:color-mix(in srgb,var(--fg) 20%,var(--bg))" stroke-width="3" filter="url(#${ID}s)"/>` : ""}`);
  if (c.title || c.text) base += box(T.cx - 158, T.cy - 31, 316, 62, `${title(c.title, 26, FG, "font-weight:800;line-height:1.05")}${body(c.text, 15, FG)}`, { align: "center", cls: "ig-center" });
  // cada marco vai para a faixa de cima ou de baixo (a mais perto); na faixa, as placas em fila, na ordem de x, sem
  // encavalar; um tracejado liga o marco à placa
  const marks = items.map((it, i) => ({ it, i, p: T.at((i + 0.5) / n) }));
  const bands = [marks.filter((m) => m.p.y < T.cy), marks.filter((m) => m.p.y >= T.cy)];
  const bh = 104, layers = [];
  bands.forEach((band, up) => {
    const k = band.length; if (!k) return;
    band.sort((a, b) => a.p.x - b.p.x);
    const gap = 14, bw = Math.min(330, (W - 12 - gap * (k - 1)) / k);
    // a placa fica embaixo do x do marco quando dá; senão, empurra para os lados
    let xs = band.map((m) => Math.max(6, Math.min(W - 6 - bw, m.p.x - bw / 2)));
    for (let r = 0; r < 4; r++) for (let j = 1; j < k; j++) if (xs[j] < xs[j - 1] + bw + gap) xs[j] = xs[j - 1] + bw + gap;
    const over = xs[k - 1] + bw - (W - 6); if (over > 0) xs = xs.map((x) => x - over);
    for (let j = k - 2; j >= 0; j--) if (xs[j] + bw + gap > xs[j + 1]) xs[j] = xs[j + 1] - bw - gap;
    const by = up ? H - 6 - bh : 6;
    band.forEach((m, j) => {
      const { it, i, p } = m, col = cols[i], on = `#${onColor(theme, col)}`, bx = xs[j];
      const g = svg(`<path d="M${F(p.x)} ${F(p.y)} L${F(bx + bw / 2)} ${F(up ? by : by + bh)}" stroke="#fff" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>
        <rect x="${F(bx)}" y="${F(by)}" width="${F(bw)}" height="${bh}" rx="18" style="fill:var(--bg)" filter="url(#${ID}s)"/><rect x="${F(bx)}" y="${F(by)}" width="10" height="${bh}" rx="5" style="fill:#${col}"/>
        <circle cx="${F(p.x)}" cy="${F(p.y)}" r="31" fill="#fff" filter="url(#${ID}s)"/><circle cx="${F(p.x)}" cy="${F(p.y)}" r="25" style="fill:#${col}"/>`);
      const num = box(p.x - 25, p.y - 25, 50, 50, it.icon ? icon(it.icon, 26, on) : title(String(i + 1), 24, on, "font-weight:800"), { align: "center" });
      layers[i] = layer(g + num + box(bx + 22, by + 8, bw - 32, bh - 16, `${title(it.title, 24, `#${col}`, "font-weight:800")}${body(it.text, 17, FG)}`), s.build ? i + 1 : 0);
    });
  });
  return base + layers.join("");
}

const SHAPES = { arco, ramos, lados, trilhas, metro, ciclo, pista };

export function infographicHTML(s, ctx) {
  const shape = SHAPES[s.shape] ? s.shape : "arco";
  if (s.shape && !SHAPES[s.shape]) ctx?.warnings?.push(`infográfico: forma "${s.shape}" não existe (use ${Object.keys(SHAPES).join(", ")}); saiu como arco`);
  let items = (Array.isArray(s.items) ? s.items : []).map(norm);
  const max = INFOGRAPHIC_SHAPES[shape].max;
  if (items.length > max) { ctx?.warnings?.push(`infográfico ${shape}: ${items.length} itens, cabem até ${max}; os demais ficaram de fora (divida em dois slides)`); items = items.slice(0, max); }
  if (!items.length) items = [{ title: "Item" }];
  const theme = ctx?.theme || { colors: {} };
  ID = "ig" + hash(JSON.stringify([s.shape, s.center, s.items, s.title]));
  const cols = itemColors(theme, items.length);
  return `<div class="ig-stage ig-${shape} e" style="--d:2;">${SHAPES[shape](s, items, cols, theme)}</div>`;
}

