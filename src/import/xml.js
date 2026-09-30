// XML mínimo para ler Office Open XML (pptx/docx/xlsx): vira árvore { name, attrs, children, text }.
// Sem DTD, sem entidades externas, sem nada que execute: só elementos, atributos, texto e CDATA.
const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));

export function parseXML(src) {
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) { top.children.push({ name: "#text", text: m[1] }); continue; }
    if (m[6] != null) { if (top !== root) top.children.push({ name: "#text", text: decode(m[6]) }); continue; }
    if (!m[3]) continue;
    if (m[2]) { // fecha
      while (stack.length > 1 && stack.pop().name !== m[3]);
      continue;
    }
    const attrs = {};
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const node = { name: m[3], attrs, children: [] };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root.children.find((c) => c.name !== "#text") || root;
}

// consultas simples: filhos por nome (com ou sem prefixo), primeiro, texto
export const kids = (n, name) => (n?.children || []).filter((c) => c.name !== "#text" && (name == null || c.name === name || (!name.includes(":") && c.name.split(":").pop() === name)));
export const kid = (n, name) => kids(n, name)[0] || null;
export const path = (n, ...names) => names.reduce((a, nm) => (a ? kid(a, nm) : null), n);
export function all(n, name, out = []) {
  for (const c of n?.children || []) {
    if (c.name === "#text") continue;
    if (c.name === name || (!name.includes(":") && c.name.split(":").pop() === name)) out.push(c);
    all(c, name, out);
  }
  return out;
}
export const textOf = (n) => (n ? (n.children || []).map((c) => (c.name === "#text" ? c.text : textOf(c))).join("") : "");
export const num = (v, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
