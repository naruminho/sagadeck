// Mestre do deck (como o slide mestre do PowerPoint): o que se desenha em todo slide (logos, faixas, linha do título,
// número da página) e onde o conteúdo e o título ficam. Com o tema (cores e fontes), é o "estilo" que um professor
// usa para deixar os slides no padrão da universidade.
//
//   master:
//     elements: [ … ]              # elementos do canvas (x, y, w, h) em todo slide de conteúdo
//     cover: [ … ]                 # capa, seção e encerramento (sem isso, usam `elements`)
//     area: { top, left, right, bottom }       # onde o conteúdo fica (px), fora da moldura
//     coverArea: { top, left, right, bottom }
//     title: { font, size, color, bold, italic, upper, align }    # a cara do título
//   slide: master: false            # este slide sem a moldura
// No texto do mestre, o trecho com field: slidenum mostra o número do slide.
import { esc } from "./markup.js";

const COVER = new Set(["cover", "section", "end"]);
export const isCoverLayout = (layout) => COVER.has(layout);

export function masterApplies(spec, s, layout) {
  const m = spec?.master;
  if (!m || s?.master === false) return false;
  if (layout === "canvas" && s?.master !== true) return false; // slide livre (e o original importado) já tem a sua moldura
  return !!(m.elements?.length || m.cover?.length || m.area || m.title);
}

// elementos do mestre para o slide i (número da página preenchido)
export function masterElements(spec, layout, i) {
  const m = spec.master;
  const list = isCoverLayout(layout) && Array.isArray(m.cover) ? m.cover : m.elements || [];
  const fill = (e) => {
    if (!e?.textbox) return e;
    const c = structuredClone(e);
    for (const p of c.textbox.paragraphs || []) for (const r of p.runs || []) if (r.field === "slidenum") r.t = String(i + 1);
    return c;
  };
  return list.map(fill);
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const px = (v) => `${Math.round(num(v, 0) * 10) / 10}px`;
const areaCSS = (a) => (a ? `top:${px(a.top)};left:${px(a.left)};right:${px(a.right)};bottom:${px(a.bottom)};` : "");
const fontStack = (f) => (f ? `'${String(f).replace(/'/g, "")}', Calibri, Carlito, 'Segoe UI', Arial, sans-serif` : "");

// Faixa do título, como no PowerPoint: do topo da área até a linha (fio) do título que a moldura desenha. O título do
// slide fica nela (encolhe para caber) e o conteúdo começa abaixo da linha: nada atravessa o fio. Sem fio na moldura,
// não há faixa (o título segue no fluxo do layout, como antes). Calculada da moldura: vale para deck já gerado.
export function titleBand(spec) {
  const m = spec?.master;
  if (!m?.area || !Array.isArray(m.elements)) return null;
  const H = spec.aspect === "4:3" ? 1440 : 1080;
  const size = m.title?.size || 64;
  const rule = m.elements
    .filter((e) => e.drawing && Number(e.h) <= 8 && Number(e.w) >= 700 && e.y > m.area.top + size * 0.5 && e.y < H * 0.35)
    .sort((a, b) => a.y - b.y)[0];
  if (!rule) return null;
  const top = m.area.top, bottom = Math.round(rule.y - 6);
  const contentTop = Math.round(Math.max(rule.y + 24, top + size * 1.12 + (m.title?.gap ?? 40)));
  return { top, bottom, contentTop };
}

export function masterCSS(spec) {
  const m = spec?.master;
  if (!m) return "";
  let css = "";
  if (m.area) css += `.slide.has-master:not(.master-cover) .safe{${areaCSS(m.area)}}\n`;
  const band = titleBand(spec);
  if (band) {
    css += `.slide.has-master.master-band:not(.master-cover) .safe{top:${band.contentTop}px}\n`;
    const a = m.area, h = band.bottom - band.top - 10;
    css += `.slide.has-master.master-band>.master-title{position:absolute;z-index:2;left:${a.left}px;right:${a.right}px;top:${band.top}px;height:${band.bottom - band.top}px;padding-bottom:10px;box-sizing:border-box;display:flex;align-items:flex-end}\n`;
    // sem o espaçamento do cabeçalho do layout (o padding e o gap dele roubavam altura da faixa e o título encolhia à toa)
    css += `.slide.has-master.master-band .master-title>.hd{margin:0!important;width:100%;max-height:100%;gap:0!important;padding:0!important}.slide.has-master.master-band .master-title>.hd>.kicker{margin-bottom:8px}.slide.has-master.master-band .master-title .ttl{max-height:${h}px;overflow:hidden;box-sizing:border-box;padding-bottom:.1em}\n`;
  }
  if (m.coverArea) css += `.slide.has-master.master-cover .safe{${areaCSS(m.coverArea)}}\n`;
  const t = m.title;
  if (t) {
    const st = [
      t.font && `font-family:${fontStack(t.font)}!important`,
      t.size && `font-size:${px(t.size)}!important`,
      t.color && `color:${/^#/.test(t.color) ? t.color : `#${t.color}`}!important`,
      `font-weight:${t.bold ? 700 : 400}!important`,
      `font-style:${t.italic ? "italic" : "normal"}!important`,
      `text-transform:${t.upper ? "uppercase" : "none"}!important`,
      "letter-spacing:0!important", "line-height:1.12!important", "font-stretch:100%!important",
      t.align && `text-align:${t.align}`,
    ].filter(Boolean).join(";");
    css += `.slide.has-master:not(.master-cover) .hd .ttl{${st}}\n`;
    if (t.gap != null) css += `.slide.has-master:not(.master-cover) .hd{margin-bottom:${px(t.gap)}}\n`;
    css += `.slide.has-master:not(.master-cover) .hd .kicker{display:none}\n`;
    // a linha/fita do título do tema some: a moldura do estilo tem a sua
    css += `.slide.has-master .hd{border:0!important;box-shadow:none!important;background:none!important}.slide.has-master .hd::before,.slide.has-master .hd::after,.slide.has-master .orn{display:none!important}\n`;
  }
  if (m.text?.font) css += `.slide.has-master .safe .t.f-body{font-family:${fontStack(m.text.font)}}\n`;
  return css;
}

// ------------------------------------------------------------------------------------------------ estilo do original
// A partir de um deck importado (src/import): o layout mais usado vira a moldura de conteúdo; o do 1º slide, a capa.
// Título e corpo: posição, fonte, tamanho e cor dos placeholders do original. Tema: cores e fontes do arquivo.
export function styleFromImport(spec, { name } = {}) {
  const slides = (spec.slides || []).filter((s) => s.layout === "canvas" && Array.isArray(s.elements));
  if (!slides.length) throw new Error("Este deck não veio de uma importação (não há slides do original para copiar o estilo).");
  const H = spec.aspect === "4:3" ? 1440 : 1080;
  const fonts = spec.import?.fonts || {};
  const realFont = (f) => { const t = String(f || "").replace(/\s*\((Body|Headings|Corpo|Títulos|Titulos)\)\s*$/i, "").trim(); return /\((Body|Corpo)\)/i.test(f || "") ? fonts.minor || t : /\((Headings|Títulos|Titulos)\)/i.test(f || "") ? fonts.major || t : t; };
  const plainText = (e) => (e.textbox?.paragraphs || []).map((p) => (p.runs || []).map((r) => r.t || "").join("")).join("\n").trim();
  const clean = (e) => { const c = structuredClone(e); delete c.deco; delete c.ph; if (c.textbox) for (const p of c.textbox.paragraphs || []) for (const r of p.runs || []) if (r.font) r.font = realFont(r.font); return c; };
  // moldura = o que se repete na mesma posição (do mestre ou copiado slide a slide, como muita gente faz)
  // "é o mesmo elemento": imagem/texto iguais, ou desenho com o mesmo tipo de traço e a mesma cor, na mesma região
  // (arredondada: a linha do título muda alguns pixels de um slide para outro)
  const drawKey = (d) => `${(String(d).match(/<path d="[A-Za-z]/g) || []).join("")}|${(String(d).match(/(fill|stroke)="(#[0-9A-Fa-f]{6}|rgba\([^)]*\))"/g) || []).join(",")}`;
  const keyOf = (e) => `${e.image ? `I:${e.image}` : e.drawing ? `S:${drawKey(e.drawing)}` : e.textbox ? `T:${plainText(e)}` : "?"}@${Math.round(e.x / 16)},${Math.round(e.y / 16)},${Math.round(e.w / 48)},${Math.round(e.h / 16)}`;
  const content = slides.slice(1).filter((s) => s.elements.some((e) => e.ph === "title" || e.ph === "body"));
  const pool = slides.length > 1 ? slides.slice(1) : slides; // todos menos a capa (há slides sem placeholder, só com desenho)
  const freq = new Map();
  for (const s of pool) for (const k of new Set(s.elements.filter((e) => e.deco || (!e.ph && !e.textbox) || (!e.ph && e.textbox && plainText(e).length < 60)).map(keyOf))) freq.set(k, (freq.get(k) || 0) + 1);
  // 20%: aulas costumam misturar slides de fontes diferentes; o estilo é o do primeiro bloco coerente
  const repeated = new Set([...freq].filter(([, n]) => n >= Math.max(2, pool.length * 0.2)).map(([k]) => k));
  const ref = pool.find((s) => s.elements.some((e) => e.ph === "title") && s.elements.some((e) => e.ph === "body") && s.elements.some((e) => repeated.has(keyOf(e)))) || pool[0];
  const frame = ref.elements.filter((e) => repeated.has(keyOf(e)) || (e.deco && !e.ph)).map(clean);
  const pageNum = ref.elements.find((e) => e.ph === "sldNum" && e.textbox) || ref.elements.find((e) => e.textbox && e.textbox.paragraphs.some((p) => p.runs.some((r) => r.field === "slidenum")));
  if (pageNum && !frame.some((e) => e.textbox?.paragraphs.some((p) => p.runs.some((r) => r.field === "slidenum")))) {
    const c = clean(pageNum);
    for (const p of c.textbox.paragraphs) for (const r of p.runs) r.field = "slidenum";
    frame.push(c);
  }
  // capa: o que não é texto do título/subtítulo (faixa, logos) + o texto institucional que se repete no fim
  const cover = slides[0], last = slides[slides.length - 1];
  const lastTexts = new Set(last.elements.filter((e) => e.textbox).map(plainText));
  const coverFrame = cover.elements.filter((e) => !["title", "ctrTitle", "subTitle"].includes(e.ph) && (!e.textbox || lastTexts.has(plainText(e)) || e.deco)).map(clean);
  const run0 = (e) => e?.textbox?.paragraphs?.flatMap((p) => p.runs || []).find((r) => r.t && r.t.trim()) || {};
  // título e corpo: os placeholders; sem eles (caixas de texto comuns), a maior fonte no terço de cima e a maior
  // caixa abaixo dela
  const loose = ref.elements.filter((e) => e.textbox && !repeated.has(keyOf(e)) && plainText(e));
  const title = ref.elements.find((e) => e.ph === "title") || loose.filter((e) => e.y < H * 0.33).sort((a, b) => (run0(b).size || 0) - (run0(a).size || 0))[0];
  const body = ref.elements.find((e) => e.ph === "body") || loose.filter((e) => e !== title && (!title || e.y >= title.y + title.h * 0.5)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const tr = run0(title), br = run0(body);
  const tSize = tr.size || 64;
  const pad = (e, k) => (e?.textbox?.pad ? e.textbox.pad[k] : 0);
  // topo visual do título (a caixa do original pode estar ancorada no meio ou embaixo)
  const titleTop = title ? (() => {
    const lines = Math.max(1, (title.textbox.paragraphs || []).length);
    const textH = tSize * 1.2 * lines, a = title.textbox.anchor, inner = title.h - pad(title, 1) - pad(title, 3);
    return title.y + pad(title, 1) + (a === "bottom" ? Math.max(0, inner - textH) : a === "middle" ? Math.max(0, (inner - textH) / 2) : 0);
  })() : 92;
  const bottoms = frame.filter((e) => e.y > H * 0.7).map((e) => e.y);
  const footerTop = bottoms.length ? Math.min(...bottoms) : H - 72;
  const area = {
    top: Math.max(16, Math.round(titleTop)),
    left: Math.max(24, Math.round(Math.min(title ? title.x + pad(title, 0) : 120, body ? body.x + pad(body, 0) : 1e9))),
    right: Math.max(24, Math.round(1920 - Math.max(title ? title.x + title.w - pad(title, 2) : 1800, body ? body.x + body.w - pad(body, 2) : 0))),
    bottom: Math.max(24, Math.round(H - footerTop + 16)),
  };
  // vão entre o título e o conteúdo: até onde o corpo começa no original (a linha do título fica no meio)
  const bodyTop = body ? body.y + pad(body, 1) : area.top + tSize * 1.2 + 56;
  const gap = Math.max(16, Math.round(bodyTop - (area.top + tSize * 1.12)));
  const coverTexts = cover.elements.filter((e) => ["title", "ctrTitle", "subTitle"].includes(e.ph));
  const coverArea = coverTexts.length ? {
    top: Math.max(16, Math.round(Math.min(...coverTexts.map((e) => e.y)))),
    left: Math.max(24, Math.round(Math.min(...coverTexts.map((e) => e.x)))),
    right: Math.max(24, Math.round(1920 - Math.max(...coverTexts.map((e) => e.x + e.w)))),
    bottom: Math.max(24, Math.round(H - Math.max(...coverTexts.map((e) => e.y + e.h)))),
  } : null;
  const c = spec.import?.colors || {};
  const hex = (v, d) => String(v || d).replace("#", "").toUpperCase();
  const tFont = realFont(tr.font) || fonts.major || "Calibri", bFont = realFont(br.font) || fonts.minor || "Calibri";
  const theme = {
    extends: "manual",
    colors: { paper: hex(c.lt1, "FFFFFF"), ink: hex(c.dk1, "000000"), accent: hex(c.accent1, "4472C4"), alert: hex(c.accent2, "ED7D31"), c1: hex(c.accent1, "4472C4"), c2: hex(c.accent2, "ED7D31"), c3: hex(c.accent3, "A5A5A5"), c4: hex(c.accent4, "FFC000"), c5: hex(c.accent5, "5B9BD5"), line: hex(c.lt2, "D9D9D9") },
    faces: {
      display: { css: `font-family: ${fontStack(tFont)}; font-weight: ${tr.b ? 700 : 400}; line-height: 1.1;`, pptx: { face: tFont, bold: !!tr.b } },
      heading: { css: `font-family: ${fontStack(tFont)}; font-weight: 700; line-height: 1.15;`, pptx: { face: tFont, bold: true } },
      body: { css: `font-family: ${fontStack(bFont)}; font-weight: 400; line-height: 1.35;`, pptx: { face: bFont }, pptxBold: { face: bFont, bold: true } },
      label: { css: `font-family: ${fontStack(bFont)}; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.2;`, pptx: { face: bFont, bold: true } },
    },
  };
  const master = {
    elements: frame,
    cover: coverFrame,
    area,
    ...(coverArea ? { coverArea } : {}),
    title: { font: tFont, size: Math.round(Math.min(tSize, 80)), color: tr.color || `#${theme.colors.ink}`, bold: !!tr.b, align: title?.textbox?.paragraphs?.[0]?.align || "left", gap },
    text: { font: bFont },
  };
  return { name: name || spec.import?.from?.replace(/\.[a-z]+$/i, "") || spec.title || "Estilo importado", theme, master, from: spec.import?.from || null, body: { size: br.size || 40, color: br.color || null } };
}

// imagens que o mestre usa (para copiar junto com o estilo)
export function masterImages(master) {
  const out = new Set();
  const walk = (list) => (list || []).forEach((e) => { if (e?.image) out.add(e.image); if (e?.drawing) for (const m of String(e.drawing).matchAll(/href="media:([^"]+)"/g)) out.add(m[1]); });
  walk(master?.elements); walk(master?.cover);
  return [...out];
}
void esc;
