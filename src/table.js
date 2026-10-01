// Tabela de verdade (não figura): cabeçalho na cor do tema, números alinhados à direita com algarismos de mesma
// largura, linha zebrada, destaque de linha/coluna/célula e linha de total. Serve ao layout `table` e ao elemento
// `table` em qualquer lugar (conteúdo, canvas, add). Estilos: faixa (padrão), zebra, linhas, colunas (cada coluna
// com uma cor da paleta) e cartão.
import { md, esc } from "./markup.js";
import { parseCSV } from "./csv.js";
import { col } from "./themes.js";

const STYLES = new Set(["faixa", "zebra", "linhas", "colunas", "cartao"]);
const ALIGN = new Set(["left", "center", "right"]);
// "1.234,5", "40%", "R$ 12", "-3,2", "10 mm", "2.218,0 m³/s": número (alinha à direita)
const NUMERIC = /^\s*[-+−]?\s*(R\$|US\$|€|\$)?\s*[-+−]?\d[\d.,\s]*(%|‰|[a-zA-Zµ°³²/]{0,6})?\s*$/;
const colorVar = (c) => {
  if (!c) return null;
  const v = String(c).trim();
  if (/^c[1-5]$/.test(v)) return `var(--c-${v})`;
  if (["hi", "em", "fg", "muted", "line", "surface"].includes(v)) return `var(--${v})`;
  if (/^#?[0-9a-f]{6}$/i.test(v)) return `#${v.replace("#", "")}`;
  if (/^(accent|alert|ink|paper)$/.test(v)) return `var(--c-${v})`;
  return null;
};

// a cor real (hex) no tom claro do tema e o texto que se lê em cima dela (branco ou a tinta do tema)
function hexOf(theme, c) {
  if (!theme) return null;
  const tone = theme.tones?.light || {};
  const v = !c ? tone.em : ["hi", "em"].includes(c) ? tone[c] : c;
  const h = String(col(theme, v) || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(h) ? h : null;
}
function onColor(theme, hex) {
  if (!hex) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? "#16181d" : "#ffffff";
}

// o que veio (head/cols/header + rows; rows de objetos; csv colado) → { head: [...] | null, rows: [[...]] }
export function tableModel(t = {}) {
  let head = Array.isArray(t.head) ? t.head : Array.isArray(t.cols) && t.cols.every((c) => typeof c !== "number") ? t.cols : null;
  let rows = Array.isArray(t.rows) ? t.rows : [];
  if (typeof t.csv === "string" && t.csv.trim()) {
    const parsed = parseCSV(t.csv).rows.filter((r) => r.some((c) => String(c).trim()));
    if (!head && t.header !== false) { head = parsed[0]; rows = parsed.slice(1); } else rows = parsed;
  }
  if (rows.length && rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    head = head || keys;
    rows = rows.map((r) => keys.map((k) => r[k] ?? ""));
  }
  if (!head && t.header === true && rows.length) { head = rows[0]; rows = rows.slice(1); }
  rows = rows.map((r) => (Array.isArray(r) ? r : [r]).map((c) => (c == null ? "" : c)));
  const n = Math.max(head?.length || 0, ...rows.map((r) => r.length), 0);
  rows = rows.map((r) => [...r, ...Array(Math.max(0, n - r.length)).fill("")]);
  if (head) head = [...head, ...Array(Math.max(0, n - head.length)).fill("")];
  return { head, rows, n };
}

export function tableHTML(t = {}, { size, cls = "", style = "", theme } = {}) {
  const { head, rows, n } = tableModel(t);
  if (!n) throw new Error("tabela vazia: dê `rows` (lista de linhas) e, se quiser, `head` (os títulos das colunas)");
  const kind = STYLES.has(t.style) ? t.style : "faixa";
  // alinhamento: o pedido, senão número à direita e texto à esquerda (pela maioria da coluna)
  const align = Array.from({ length: n }, (_, j) => {
    const want = Array.isArray(t.align) ? t.align[j] : typeof t.align === "string" ? t.align : null;
    if (ALIGN.has(want)) return want;
    const vals = rows.map((r) => String(r[j]).trim()).filter(Boolean);
    return vals.length && vals.filter((v) => NUMERIC.test(v)).length / vals.length >= 0.6 ? "right" : "left";
  });
  // letra pelo tamanho da tabela (o ajuste para caber ainda encolhe se faltar lugar)
  const cells = rows.length * n;
  const fs = Number(size || t.size) || (cells <= 12 ? 50 : cells <= 30 ? 44 : cells <= 60 ? 36 : cells <= 120 ? 28 : 22);
  const hl = t.highlight || {};
  const hlRows = new Set((Array.isArray(hl.rows) ? hl.rows : hl.row != null ? [hl.row] : Array.isArray(t.highlight) ? t.highlight : []).map(Number));
  const hlCols = new Set((Array.isArray(hl.cols) ? hl.cols : hl.col != null ? [hl.col] : []).map(Number));
  const hlCell = Array.isArray(hl.cell) ? hl.cell.map(Number) : null;
  const total = t.total === true;
  const color = colorVar(t.color);
  // texto do cabeçalho legível sobre a cor (amarelo e dourado pedem texto escuro)
  const on = onColor(theme, hexOf(theme, /^c[1-5]$|^#?[0-9a-f]{6}$|^(hi|em|accent|alert)$/i.test(String(t.color || "")) ? String(t.color) : null));
  const vars = `${color ? `--tb-c:${color};` : ""}${on ? `--on-tb:${on};` : ""}font-size:${fs}px;`;
  const kOn = (j) => (kind === "colunas" ? onColor(theme, hexOf(theme, `c${(j % 5) + 1}`)) : null);
  const cell = (v, j, tag, extra = "") => `<${tag} class="${align[j] === "right" ? "num" : align[j] === "center" ? "mid" : ""}${extra}">${md(String(v))}</${tag}>`;
  const wsum = Array.isArray(t.widths) ? t.widths.reduce((a, b) => a + (Number(b) || 1), 0) : 0;
  const colgroup = Array.isArray(t.widths) && t.widths.length === n ? `<colgroup>${t.widths.map((w) => `<col style="width:${((100 * (Number(w) || 1)) / wsum).toFixed(2)}%">`).join("")}</colgroup>` : "";
  const thead = head ? `<thead><tr>${head.map((h, j) => { const c = cell(h, j, "th", `${kind === "colunas" ? ` tb-k${(j % 5) + 1}` : ""}${hlCols.has(j + 1) ? " hl" : ""}`); return kOn(j) ? c.replace("<th ", `<th style="color:${kOn(j)}" `) : c; }).join("")}</tr></thead>` : "";
  const tbody = `<tbody>${rows.map((r, i) => `<tr class="${hlRows.has(i + 1) ? "hl" : ""}${total && i === rows.length - 1 ? " tot" : ""}">${r.map((v, j) => cell(v, j, j === 0 && t.rowHeader ? "th" : "td", `${hlCols.has(j + 1) ? " hl" : ""}${hlCell && hlCell[0] === i + 1 && hlCell[1] === j + 1 ? " hlc" : ""}`)).join("")}</tr>`).join("")}</tbody>`;
  // data-fit: não coube (colunas demais, conclusão ao lado), a letra encolhe até caber (src/runtime/fit.js)
  return `<div class="dtable-wrap tb-${kind}${cls ? ` ${cls}` : ""}" data-fit data-fit-self style="${vars}${style}"><table class="dtable f-body">${colgroup}${thead}${tbody}</table></div>`;
}

export const TABLE_STYLES = [...STYLES];
void esc;
