// CSV como o Excel abre: descobre o separador (vírgula, ponto e vírgula, tab ou barra; a linha "sep=;" do Excel
// manda), respeita aspas (separador, aspas "" e quebra de linha dentro da célula), guarda BOM e fim de linha para
// gravar de volta igual. Serve ao motor (tabelas e pontos do deck) e ao Studio (planilha do projeto).

const CANDIDATES = [",", ";", "\t", "|"];

function splitRows(text, delim, limit = Infinity) {
  const rows = [];
  let row = [], cell = "", quoted = false, i = 0, wasQuoted = false;
  const n = text.length;
  while (i < n && rows.length < limit) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell.trim() === "" && !wasQuoted) { quoted = true; wasQuoted = true; cell = ""; i++; continue; }
    if (c === delim) { row.push(cell); cell = ""; wasQuoted = false; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; wasQuoted = false;
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1; continue;
    }
    cell += c; i++;
  }
  if (rows.length < limit && (cell !== "" || row.length || wasQuoted)) { row.push(cell); rows.push(row); }
  return rows;
}

export function detectDelimiter(text) {
  const t = String(text ?? "").replace(/^﻿/, "");
  const sep = t.match(/^sep=(.)\r?\n/i);
  if (sep) return sep[1];
  let best = { d: ",", score: -1, width: 0 };
  for (const d of CANDIDATES) {
    const rows = splitRows(t, d, 40).filter((r) => r.some((c) => c.trim() !== ""));
    if (!rows.length) continue;
    const counts = new Map();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) || 0) + 1);
    const [width, freq] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (width < 2) continue;
    const score = freq / rows.length;
    if (score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && width > best.width)) best = { d, score, width };
  }
  return best.d;
}

export function parseCSV(text, delimiter) {
  let t = String(text ?? "");
  const bom = t.startsWith("﻿");
  if (bom) t = t.slice(1);
  const eol = /\r\n/.test(t) ? "\r\n" : "\n";
  const d = delimiter || detectDelimiter(t);
  let sepLine = false;
  const m = t.match(/^sep=(.)\r?\n/i);
  if (m) { sepLine = true; t = t.slice(m[0].length); }
  let rows = splitRows(t, d);
  while (rows.length && rows.at(-1).every((c) => c === "")) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.length));
  rows = rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill("")] : r));
  return { rows, delimiter: d, eol, bom, sepLine };
}

export function toCSV(rows, { delimiter = ",", eol = "\n", bom = false, sepLine = false } = {}) {
  const needs = (c) => c.includes(delimiter) || c.includes('"') || c.includes("\n") || c.includes("\r") || /^\s|\s$/.test(c);
  const line = (r) => r.map((c) => { const s = String(c ?? ""); return needs(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(delimiter);
  let out = (sepLine ? `sep=${delimiter}${eol}` : "") + rows.map(line).join(eol) + (rows.length ? eol : "");
  if (bom) out = "﻿" + out;
  return out;
}

export const DELIMITER_NAMES = { ",": "vírgula", ";": "ponto e vírgula", "\t": "tab", "|": "barra" };

// no Studio (carregado como módulo): o mesmo leitor para o realce e para colar na planilha
if (typeof window !== "undefined") window.SagaCSV = { detect: detectDelimiter, parse: parseCSV, stringify: toCSV };
