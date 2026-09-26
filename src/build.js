// YAML -> HTML (arquivo único, abre com duplo clique, funciona offline)
import { barHTML } from "./chrome.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveTheme, themeCSS } from "./themes.js";
import { LAYOUTS } from "./layouts.js";
import { el } from "./elements.js";
import { esc, notesHTML, plain, md } from "./markup.js";
import { normalizeSpec } from "./fiscal/normalize.js";
import { readRecordings } from "./api-client.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, p), "utf8");

export function loadSpec(file) {
  const src = fs.readFileSync(file, "utf8");
  let raw;
  try { raw = YAML.parse(src); } catch (e) { throw new Error(`YAML inválido em ${file}:\n${e.message}`); }
  const spec = normalizeSpec(raw);
  if (!spec || !Array.isArray(spec.slides)) throw new Error(`${file}: o YAML precisa de uma lista "slides:"`);
  spec._file = path.resolve(file);
  spec._dir = path.dirname(spec._file);
  return spec;
}

const slug = (s) => String(s || "deck").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

export function inferLayout(s) {
  if (s.layout) return s.layout;
  if (s.elements) return "canvas";
  if (s.stats || s.kpis) return "stats";
  if (s.steps || s.process || s.flow) return "steps";
  if (s.quote) return "quote";
  if (s.value != null) return "number";
  if (s.question && s.options) return "question";
  if (s.events) return "timeline";
  if (s.chart) return "chart";
  if (s.cells) return "matrix";
  if (s.text || s.lines) return "statement";
  if (s.items && s.cards !== false && s.items.some?.((i) => typeof i === "object" && (i.icon || i.title))) return "cards";
  if (s.items) return "list";
  if (s.figure && (s.title || s.body || s.bullets)) return "split";
  return "blocks";
}

const DEFAULT_TONE = { section: "accent", cover: "light", end: "dark" };
const NO_FOOTER = new Set(["cover", "section", "end", "image", "canvas", "full", "headline"]);

export function wordCount(s) {
  const txt = [];
  const walk = (v, k) => {
    if (k === "notes" || k === "source" || k === "id" || k === "layout" || k === "tone" || k === "auto") return;
    if (typeof v === "string") { if (!/^(\.|https?:|#?[0-9a-f]{6}$)/i.test(v)) txt.push(plain(v)); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object" && !v.svg && !v.chart && !v.html) for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  walk(s);
  return txt.join(" ").split(/\s+/).filter((w) => w.length > 1).length;
}

export function buildHTML(rawSpec, opts = {}) {
  const spec = normalizeSpec(rawSpec);
  const theme = resolveTheme(spec.theme);
  const ctx = { baseDir: spec._dir || process.cwd(), theme, spec };
  const id = spec.id || slug(spec.title);
  const warnings = [];
  const slidesMeta = [];
  let html = "";

  spec.slides.forEach((raw, i) => {
    const s = { ...(spec.defaults || {}), ...raw };
    const layout = inferLayout(s);
    const fn = LAYOUTS[layout];
    if (!fn) throw new Error(`Slide ${i + 1}: layout "${layout}" não existe. Use: ${Object.keys(LAYOUTS).join(", ")}`);
    const tone = s.tone || DEFAULT_TONE[layout] || spec.tone || "light";
    let inner;
    try { inner = fn(s, ctx); } catch (e) { throw new Error(`Slide ${i + 1} (${layout}${s.title ? `: ${plain(s.title).slice(0, 40)}` : ""}): ${e.message}`); }
    html += slideShell({ s, i, spec, theme, ctx, layout, tone, inner }) + "\n";

    const words = wordCount({ ...raw, notes: undefined });
    const limit = s.maxWords || spec.maxWords || 40;
    if (words > limit) warnings.push(`slide ${i + 1}: ${words} palavras (limite ${limit}) — divida em dois ou use cliques`);
    const t = plain(s.title || s.text || s.question || s.quote || (s.lines && (s.lines[0].text || s.lines[0])) || s.kicker || layout);
    slidesMeta.push({ title: t.slice(0, 90), notes: notesHTML(s.notes), notesRaw: s.notes || "", time: s.time || 0, layout, words });
  });

  // CSS e widgets próprios ficam ao lado do YAML. Se faltar um (ex.: deck aberto pelo navegador no
  // Studio, sem a pasta original), a apresentação sai sem ele e com aviso — não quebra inteira.
  const readCompanion = (f, kind) => {
    const file = path.resolve(ctx.baseDir, f);
    try { return fs.readFileSync(file, "utf8"); }
    catch { warnings.push(`${kind} "${f}" não encontrado em ${ctx.baseDir} — a apresentação saiu sem ele`); return ""; }
  };
  let customCSS = "";
  for (const c of [].concat(spec.css || [])) customCSS += readCompanion(c, "CSS") + "\n";
  let widgets = "";
  for (const w of [].concat(spec.widgets || [])) widgets += `\n/* ${w} */\n` + readCompanion(w, "widget") + "\n";

  // Slide "api": o núcleo e a interface entram só se o deck tiver um; as respostas gravadas vão junto,
  // para o HTML exportado (sem Studio) ainda mostrar o resultado.
  const hasApi = slidesMeta.some((m) => m.layout === "api");
  const apiScripts = hasApi ? `<script type="application/json" id="sagadeck-api-rec">${JSON.stringify(readRecordings(spec._file)).replace(/</g, "\\u003c")}</script>
<script>${read("runtime/api-core.js")}</script>` : "";
  const data = { id, title: spec.title || "", author: spec.author || "", motion: ["none", "subtle", "expressive"].includes(spec.motion) ? spec.motion : "subtle", duration: spec.duration || null, slides: slidesMeta.map(({ notesRaw, ...m }) => m) };
  const planned = slidesMeta.reduce((a, s) => a + s.time, 0);

  const doc = `<!doctype html>
<html lang="${spec.lang || "pt-BR"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="sagadeck">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%227%22 fill=%22%23c43e1c%22/%3E%3Cpath d=%22M12 9l12 7-12 7z%22 fill=%22white%22/%3E%3C/svg%3E">
<title>${esc(plain(spec.title || "Apresentação"))}</title>
<style>${read("runtime/base.css")}
${themeCSS(theme)}
${customCSS}</style></head>
<body class="theme-${theme.name}">
<div id="viewport"><div id="stage">
${html}
<canvas id="draw-canvas" width="1920" height="1080"></canvas>
</div></div>
<div id="draw-toolbar" class="draw-toolbar" style="display:none">
  <button id="draw-btn-pen" class="draw-btn active" title="Caneta (D)">✏️</button>
  <button id="draw-btn-highlighter" class="draw-btn" title="Marca-texto (M)">🖍️</button>
  <div class="draw-separator"></div>
  <button class="draw-color active" data-color="#ef4444" style="background:#ef4444" title="Vermelho"></button>
  <button class="draw-color" data-color="#f59e0b" style="background:#f59e0b" title="Amarelo"></button>
  <button class="draw-color" data-color="#38bdf8" style="background:#38bdf8" title="Azul"></button>
  <button class="draw-color" data-color="#22c55e" style="background:#22c55e" title="Verde"></button>
  <button class="draw-color" data-color="#ffffff" style="background:#ffffff" title="Branco"></button>
  <div class="draw-separator"></div>
  <button id="draw-btn-undo" class="draw-btn" title="Desfazer (Ctrl+Z ou Z)">↩️</button>
  <button id="draw-btn-clear" class="draw-btn" title="Limpar anotações (C)">🗑️</button>
  <button id="draw-btn-close" class="draw-btn" title="Fechar modo desenho (Esc ou D)">✕</button>
</div>
<button id="draw-fab" class="draw-fab" title="Ativar Caneta de Anotações (D)">✏️</button>
<div id="hud"><div class="bar"></div></div><div id="laser"></div><div id="blank"></div><div id="overview"></div><div id="toast"></div>
<div id="help"><b>Atalhos</b><br><kbd>→</kbd><kbd>espaço</kbd> avança · <kbd>←</kbd> volta<br><kbd>D</kbd> caneta ao vivo · <kbd>M</kbd> marca-texto · <kbd>C</kbd> limpa tela<br><kbd>P</kbd> janela do apresentador (notas + cronômetro)<br><kbd>F</kbd> tela cheia · <kbd>G</kbd> visão geral<br><kbd>B</kbd> tela preta · <kbd>W</kbd> tela branca<br><kbd>L</kbd> apontador laser · <kbd>R</kbd> zera timer<br><kbd>5</kbd><kbd>Enter</kbd> vai ao slide 5 · <kbd>H</kbd> esta ajuda</div>
<script type="application/json" id="sagadeck-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>window.Sagadeck={_q:[],widget:function(n,d){this._q.push([n,d])}};</script>
<script>${widgets}</script>
<script>${read("runtime/fit.js")}</script>
<script>${read("runtime/runtime.js")}</script>
${hasApi ? `${apiScripts}\n<script>${read("runtime/api-ui.js")}</script>` : ""}
</body></html>`;
  return { html: doc, warnings, meta: data, planned, theme, slidesMeta };
}

export function buildFile(file, outFile) {
  const spec = loadSpec(file);
  const r = buildHTML(spec);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, r.html);
  return { ...r, spec, outFile };
}

// <section> de um slide: tom, textura, estilo do destaque, fundo, área, cabeçalho e rodapé.
// Única montagem para o Studio (renderSlide) e para a apresentação/exportação (buildHTML).
function slideShell({ s, i, spec, theme, ctx, layout, tone, inner, current = false }) {
  const deco = s.deco ?? theme.deco;
  const style = (s.bg ? `--bg:#${String(s.bg).replace("#", "")};` : "") + (s.fg ? `--fg:#${String(s.fg).replace("#", "")};` : "");
  const bars = s.footer !== false && (s.footer === true || !NO_FOOTER.has(layout));
  const area = layout === "canvas" || layout === "full" ? "free" : "safe";
  // estilo do ==destaque== (marca-texto | sublinhado | cor | negrito | nenhum), no deck ou por slide
  const markStyle = s.markStyle || spec.markStyle;
  const total = spec.slides?.length || i + 1;
  let html = `<section class="slide${current ? " current" : ""} tone-${tone} ${deco && deco !== "none" ? "deco-" + deco : ""} ${markStyle && markStyle !== "marca-texto" ? "ms-" + markStyle : ""} L-${layout}-slide" data-idx="${i}" data-layout="${layout}" data-tr="${s.transition || "fade"}"${!Array.isArray(s.steps) && Number.isFinite(Number(s.steps)) && Number(s.steps) > 0 ? ` data-steps="${Number(s.steps)}"` : ""}${style ? ` style="${style}"` : ""}>`;
  if (s.background) html += `<div class="bgfig" style="${s.backgroundStyle || ""}">${el(s.background, ctx, 1920, 1080)}</div>`;
  if (bars && s.header !== false) html += barHTML("header", spec, i, total);
  html += `<div class="${area}">${inner}</div>`;
  if (bars) html += barHTML("footer", spec, i, total);
  return html + `</section>`;
}

export function renderSlide(raw, i = 0, spec = {}) {
  const theme = resolveTheme(spec.theme);
  const ctx = { baseDir: spec._dir || process.cwd(), theme, spec };
  const s = { ...(spec.defaults || {}), ...raw };
  const layout = inferLayout(s);
  const fn = LAYOUTS[layout];
  if (!fn) throw new Error(`Slide ${i + 1}: layout "${layout}" não existe.`);
  const tone = s.tone || DEFAULT_TONE[layout] || spec.tone || "light";
  const inner = fn(s, ctx);
  const deco = s.deco ?? theme.deco;
  const html = slideShell({ s, i, spec, theme, ctx, layout, tone, inner, current: true });
  return { html, layout, tone, deco, theme, inner, baseCSS: read("runtime/base.css"), themeCSS: themeCSS(theme) };
}
