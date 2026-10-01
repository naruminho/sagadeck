import katex from "katex";
import { tableHTML } from "./table.js";

// Marcação inline usada em qualquer texto do YAML.
//   **negrito**   *itálico*   ==marca-texto==   ^^cor de ênfase^^
//   ~~riscado~~   `código`    [link](https://...)   [outro slide](#id)   quebra de linha = \n
//   $fórmula$ (LaTeX no meio do texto) e $$fórmula$$ (em destaque). Dinheiro não vira fórmula: "R$ 10", "$5 e $6".
//   | a | b | (uma linha por linha da tabela, com ou sem |---|) vira tabela de verdade
export const INLINE_MATH = /\$\$([^$]+?)\$\$|(?<![\w$\\])\$(?![\s\d])([^$\n]+?)(?<!\s)\$(?![\w])/g;

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// tabela em markdown no meio do texto (uma linha "| a | b |" por linha, com ou sem a linha "|---|---|" depois do
// cabeçalho): vira tabela de verdade (src/table.js), não texto com barras
const PIPE_TABLE = /(^|\n)((?:[ \t]*\|[^\n]*\|[ \t]*(?:\n|$)){2,})/g;
const PIPE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
function pipeTable(block) {
  const lines = block.trim().split("\n").map((l) => l.trim());
  const cells = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const sep = lines.findIndex((l) => PIPE_SEP.test(l));
  const head = sep === 1 ? cells(lines[0]) : null;
  const rows = lines.filter((l, i) => !PIPE_SEP.test(l) && !(head && i === 0)).map(cells);
  return tableHTML({ head, rows }, { cls: "md-table", style: "font-size:.85em;" });
}

export function md(s) {
  if (s == null) return "";
  const tables = [];
  const maths = [];
  const src = String(s).trim().replace(PIPE_TABLE, (m, lead, block) => {
    try { tables.push(pipeTable(block)); } catch { return m; }
    return `${lead}\u0002${tables.length - 1}\u0002${block.endsWith("\n") ? "\n" : ""}`;
  });
  const raw = src.replace(INLINE_MATH, (_, block, inline) => {
    const tex = (block ?? inline).trim();
    // fórmula que não compila (chave a mais, comando errado): aparece o texto dela, marcado, para corrigir; nunca "undefined"
    try { maths.push(katex.renderToString(tex, { displayMode: block != null, throwOnError: true, strict: "ignore", trust: false, maxExpand: 1000, maxSize: 20 })); }
    catch (e) { maths.push(`<code class="f-mono tex-error" title="${esc(String(e.message || e).slice(0, 200))}">${esc(tex)}</code>`); }
    return `\u0001${maths.length - 1}\u0001`;
  });
  let h = esc(raw);
  const codes = [];
  h = h.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  h = h
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // [texto](#id): link para outro slide da apresentação (navegação por caminhos; ver goto no build)
    .replace(/\[([^\]]+)\]\(#([\w-]+)\)/g, '<a class="goto-link" href="#s-$2" data-goto="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<i>$2</i>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/\^\^([^^]+)\^\^/g, '<span class="em">$1</span>')
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\n/g, "<br>");
  h = h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code class="f-mono">${codes[+i]}</code>`);
  h = h.replace(/\u0001(\d+)\u0001/g, (_, i) => maths[+i]);
  h = h.replace(/(?:<br>)?\u0002(\d+)\u0002(?:<br>)?/g, (_, i) => tables[+i]);
  return h;
}

// texto puro (para notas do PowerPoint e contagem de palavras)
export function plain(s) {
  return String(s ?? "")
    .replace(/\*\*|==|\^\^|~~|`/g, "")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Markdown simples para notas/roteiro: parágrafos, "- " listas, "> " falas, "## " títulos
export function notesHTML(s) {
  if (!s) return "";
  const lines = String(s).replace(/\r/g, "").split("\n");
  let out = "", list = false;
  const close = () => { if (list) { out += "</ul>"; list = false; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) { close(); continue; }
    if (/^\s*- /.test(l)) { if (!list) { out += "<ul>"; list = true; } out += `<li>${md(l.replace(/^\s*- /, ""))}</li>`; continue; }
    close();
    if (/^## /.test(l)) out += `<h4>${md(l.slice(3))}</h4>`;
    else if (/^> /.test(l)) out += `<p class="say">${md(l.slice(2))}</p>`;
    else if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}[^:]{0,28}:/.test(l)) out += `<p><span class="tag">${esc(l.match(/^([^:]+):/)[1])}</span>${md(l.replace(/^[^:]+:/, ""))}</p>`;
    else out += `<p>${md(l)}</p>`;
  }
  close();
  return out;
}

export function notesPlain(s) {
  return plain(String(s ?? "").replace(/^> /gm, "“").replace(/^## /gm, ""));
}
