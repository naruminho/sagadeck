// Leitura de .docx (só para ver: o Word é o dono do formato). O docx é um zip de XML; aqui vira HTML simples:
// títulos, parágrafos com negrito/itálico/sublinhado/cor, listas, links, tabelas e imagens embutidas. Sem biblioteca
// extra além do jszip, e sem nada que rode do documento.
import JSZip from "jszip";

const unxml = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (xml, name) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" };

// elementos de primeiro nível do corpo, na ordem (parágrafo ou tabela), sem confundir tabela dentro de tabela
function topLevel(xml, tags) {
  const out = [];
  const re = new RegExp(`<(/?)(${tags.join("|")})\\b[^>]*?(/?)>`, "g");
  let depth = 0, start = -1, tag = null, m;
  while ((m = re.exec(xml))) {
    const [full, close, name, self] = m;
    if (!close && !self) { if (depth === 0) { start = m.index; tag = name; } depth++; }
    else if (!close && self) { if (depth === 0) out.push({ tag: name, xml: full }); }
    else { depth--; if (depth === 0 && start >= 0) { out.push({ tag, xml: xml.slice(start, m.index + full.length) }); start = -1; } }
  }
  return out;
}

export async function docxToHtml(buf, { maxImage = 4 * 1024 * 1024 } = {}) {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("Não parece um .docx (falta word/document.xml).");
  const rels = new Map([...((await zip.file("word/_rels/document.xml.rels")?.async("string")) || "").matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], "Id"), { target: attr(m[1], "Target"), mode: attr(m[1], "TargetMode") }]));
  const stylesXml = (await zip.file("word/styles.xml")?.async("string")) || "";
  const styleName = new Map([...stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)].map((m) => [m[1], (m[2].match(/<w:name w:val="([^"]+)"/)?.[1] || m[1]).toLowerCase()]));
  const numXml = (await zip.file("word/numbering.xml")?.async("string")) || "";
  const absFmt = new Map([...numXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)].map((m) => [m[1], m[2].match(/<w:lvl w:ilvl="0"[\s\S]*?<w:numFmt w:val="([^"]+)"/)?.[1] || "bullet"]));
  const numFmt = new Map([...numXml.matchAll(/<w:num w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)].map((m) => [m[1], absFmt.get(m[2]) || "bullet"]));
  const images = new Map();
  const image = async (rid) => {
    if (images.has(rid)) return images.get(rid);
    const t = rels.get(rid)?.target; let src = "";
    if (t) {
      const f = zip.file("word/" + t.replace(/^\.?\//, "")) || zip.file(t.replace(/^\//, ""));
      const ext = (t.split(".").pop() || "").toLowerCase();
      if (f && MIME[ext]) { const b = await f.async("uint8array"); if (b.length <= maxImage) src = `data:${MIME[ext]};base64,${Buffer.from(b).toString("base64")}`; }
    }
    images.set(rid, src);
    return src;
  };

  async function runs(pxml) {
    let html = "";
    for (const part of topLevel(pxml, ["w:r", "w:hyperlink"])) {
      if (part.tag === "w:hyperlink") {
        const rid = attr(part.xml, "r:id"), href = rid && rels.get(rid)?.mode === "External" ? rels.get(rid).target : "";
        const inner = await runs(part.xml.replace(/^<w:hyperlink[^>]*>/, "").replace(/<\/w:hyperlink>$/, ""));
        html += /^https?:|^mailto:/i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>` : inner;
        continue;
      }
      const r = part.xml;
      const pr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || "";
      let text = "";
      for (const t of r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:drawing>[\s\S]*?<\/w:drawing>|<w:t\/>/g)) {
        if (t[0] === "<w:tab/>") text += "&emsp;";
        else if (t[0] === "<w:br/>") text += "<br>";
        else if (t[0].startsWith("<w:drawing")) { const rid = t[0].match(/r:embed="([^"]+)"/)?.[1]; const src = rid ? await image(rid) : ""; if (src) text += `<img src="${src}" alt="">`; }
        else if (t[1] != null) text += esc(unxml(t[1]));
      }
      if (!text) continue;
      const on = (tag) => new RegExp(`<w:${tag}(?: w:val="(?!0|false|none)[^"]*")?\\s*/>`).test(pr);
      const color = pr.match(/<w:color w:val="([0-9A-Fa-f]{6})"/)?.[1];
      const hl = pr.match(/<w:highlight w:val="([a-z]+)"/)?.[1];
      if (on("b")) text = `<b>${text}</b>`;
      if (on("i")) text = `<i>${text}</i>`;
      if (/<w:u w:val="(?!none)/.test(pr)) text = `<u>${text}</u>`;
      if (on("strike")) text = `<s>${text}</s>`;
      const va = pr.match(/<w:vertAlign w:val="(superscript|subscript)"/)?.[1];
      if (va) text = va === "superscript" ? `<sup>${text}</sup>` : `<sub>${text}</sub>`;
      if ((color && color.toLowerCase() !== "000000") || hl) text = `<span style="${color ? `color:#${color};` : ""}${hl ? `background:${hl === "yellow" ? "#fff59d" : hl};` : ""}">${text}</span>`;
      html += text;
    }
    return html;
  }

  async function paragraph(pxml) {
    const ppr = pxml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] || "";
    const style = styleName.get(ppr.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || "") || "";
    const inner = await runs(pxml);
    const align = ppr.match(/<w:jc w:val="(center|right|both)"/)?.[1];
    const st = align ? ` style="text-align:${align === "both" ? "justify" : align}"` : "";
    const h = style.match(/^(?:heading|título|titulo|cabeçalho)\s*(\d)/)?.[1] || (style === "title" || style === "título" ? "1" : null);
    const numId = ppr.match(/<w:numId w:val="(\d+)"/)?.[1], lvl = Number(ppr.match(/<w:ilvl w:val="(\d+)"/)?.[1] || 0);
    if (numId && numId !== "0") return { list: numFmt.get(numId) === "bullet" ? "ul" : "ol", lvl, html: `<li>${inner}</li>` };
    if (!inner.replace(/<br>|&emsp;/g, "").trim()) return { html: "" };
    if (h) return { html: `<h${Math.min(6, Number(h))}${st}>${inner}</h${Math.min(6, Number(h))}>` };
    return { html: `<p${st}>${inner}</p>` };
  }

  async function table(txml) {
    const rows = [];
    for (const tr of topLevel(txml.replace(/^<w:tbl[^>]*>/, "").replace(/<\/w:tbl>$/, ""), ["w:tr"])) {
      const cells = [];
      for (const tc of topLevel(tr.xml.replace(/^<w:tr[^>]*>/, "").replace(/<\/w:tr>$/, ""), ["w:tc"])) {
        if (/<w:vMerge\s*\/>/.test(tc.xml) || /<w:vMerge w:val="continue"/.test(tc.xml)) continue;
        const span = Number(tc.xml.match(/<w:gridSpan w:val="(\d+)"/)?.[1] || 1);
        const body = await blocks(tc.xml.replace(/^<w:tc[^>]*>/, "").replace(/<\/w:tc>$/, ""));
        cells.push(`<td${span > 1 ? ` colspan="${span}"` : ""}>${body}</td>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    return `<table>${rows.join("")}</table>`;
  }

  async function blocks(xml) {
    let out = "", list = null;
    const flush = () => { if (list) { out += `<${list.tag}>${list.items.join("")}</${list.tag}>`; list = null; } };
    for (const b of topLevel(xml, ["w:p", "w:tbl"])) {
      if (b.tag === "w:tbl") { flush(); out += await table(b.xml); continue; }
      const p = await paragraph(b.xml);
      if (p.list) {
        if (!list || list.tag !== p.list) { flush(); list = { tag: p.list, items: [] }; }
        list.items.push(p.lvl ? p.html.replace("<li>", `<li style="margin-left:${p.lvl * 1.5}em">`) : p.html);
      } else { flush(); out += p.html; }
    }
    flush();
    return out;
  }

  const body = doc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] || "";
  return await blocks(body.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, ""));
}
