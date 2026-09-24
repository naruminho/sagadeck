// Marcação inline usada em qualquer texto do YAML.
//   **negrito**   *itálico*   ==marca-texto==   ^^cor de ênfase^^
//   ~~riscado~~   `código`    [link](https://...)   quebra de linha = \n

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function md(s) {
  if (s == null) return "";
  let h = esc(String(s).trim());
  const codes = [];
  h = h.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  h = h
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<i>$2</i>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/\^\^([^^]+)\^\^/g, '<span class="em">$1</span>')
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\n/g, "<br>");
  h = h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code class="f-mono">${codes[+i]}</code>`);
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
