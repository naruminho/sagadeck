// YAML -> HTML (arquivo único, abre com duplo clique, funciona offline)
import {meetingSpec} from './meeting.js';
import { slideSize } from "./aspect.js";
import { wordLimit } from "./purpose.js";
import { barHTML } from "./chrome.js";
import { masterApplies, masterElements, masterCSS, isCoverLayout, titleBand } from "./master.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveTheme, themeCSS, scopedThemeCSS } from "./themes.js";
import { identityFor, identitiesFile } from "./identity.js";
import { LAYOUTS, SCENES } from "./layouts.js";
import { applyVisualEdits } from "./visual-edits.js";
import { el, imageSrc } from "./elements.js";
import { iconSVG } from "./figures/icons.js";
import { esc, notesHTML, plain, md, INLINE_MATH } from "./markup.js";
import { normalizeSpec } from "./fiscal/normalize.js";
import { readRecordings } from "./api-client.js";
import { explorationStates } from './exploration.js';
import { calcModel } from './lessons.js';

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

const drawIcon = (name, size = 20) => iconSVG(name, { size, stroke: 2 }).replace(/\s+/g, " ");
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
const NO_FOOTER = new Set(["cover", "section", "end", "image", "canvas", "full", "headline", "kinetic", "scenography"]);

export function wordCount(s) {
  const txt = [];
  const walk = (v, k) => {
    if (k === "notes" || k === "consulta" || k === "source" || k === "id" || k === "layout" || k === "tone" || k === "auto") return;
    // o que veio de um PowerPoint importado: desenho, fontes, cores, estilos e a origem não são palavras
    if (k === "drawing" || k === "font" || k === "color" || k === "sym" || k === "style" || k === "image" || k === "link" || k === "original" || k === "tableData" || k === "fill" || k === "border" || k === "borders" || k === "review") return;
    if (typeof v === "string") { if (!/^(\.|https?:|#?[0-9a-f]{6}$)/i.test(v)) txt.push(plain(v)); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object" && !v.svg && !v.chart && !v.html) for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  walk(s);
  return txt.join(" ").split(/\s+/).filter((w) => w.length > 1).length;
}

// Tema e paleta de cada slide: os do deck, ou os do próprio slide (theme:/palette: no slide). Tema e paleta são
// independentes, como no PowerPoint: o tema cuida de fonte, arranjo e ornamentos (a pele em runtime/skins/<tema>.css
// rearruma capa, seção e encerramento); a paleta, só das cores.
// identidade do deck (fontes da empresa, do arquivo local; ver src/identity.js)
const identityOf = (spec) => (spec.identity ? identityFor(spec.identity) : null);
const slideTheme = (s, deckTheme, spec) => (s.theme || s.palette ? resolveTheme(s.theme || spec.theme, s.palette ?? spec.palette, identityOf(spec)) : deckTheme);
const skinCSS = (name) => { try { return read(`runtime/skins/${name}.css`); } catch { return ""; } };
export function deckThemeCSS(spec, deckTheme) {
  const looks = new Map(), names = new Set([deckTheme.name]);
  for (const raw of spec.slides || []) {
    const t = slideTheme({ ...(spec.defaults || {}), ...raw }, deckTheme, spec);
    if (t.key !== deckTheme.key) looks.set(t.key, t);
  }
  let css = themeCSS(deckTheme);
  for (const t of looks.values()) { css += "\n" + scopedThemeCSS(t, { faces: !names.has(t.name) }); names.add(t.name); }
  return css + "\n" + [...names].map(skinCSS).join("\n") + "\n" + masterCSS(spec);
}

// Fontes dos temas (OFL) embutidas: só as famílias que o CSS da apresentação cita (runtime/fonts, scripts/vendor-fonts.mjs)
let FONT_INDEX = null;
export function fontsCSSFor(css) {
  FONT_INDEX ||= JSON.parse(read("runtime/fonts/index.json"));
  return Object.entries(FONT_INDEX).filter(([family]) => css.includes(`'${family}'`) || css.includes(`"${family}"`))
    .map(([, file]) => read(`runtime/fonts/${file}`)).join("\n");
}

// Destinos de navegação de um slide: goto (em qualquer item), back, next e os [texto](#id) do texto
function navTargets(slide) {
  const out = [];
  const walk = (v, k) => {
    if (typeof v === "string") {
      if (k === "goto" || k === "back" || (k === "next" && v)) out.push(v);
      for (const m of v.matchAll(/\]\(#([\w-]+)\)/g)) out.push(m[1]);
    } else if (typeof v === "number" && (k === "goto" || k === "back" || k === "next")) out.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) if (kk !== "notes") walk(vv, kk);
  };
  walk(slide, "");
  return out;
}
export function navWarnings(slides = []) {
  const ids = new Map(), warns = [];
  slides.forEach((s, i) => { if (s && s.id != null && s.id !== "") { const id = String(s.id); if (ids.has(id)) warns.push(`slide ${i + 1}: id "${id}" repetido (o slide ${ids.get(id) + 1} já usa)`); else ids.set(id, i); } });
  slides.forEach((s, i) => {
    for (const t of navTargets(s)) {
      const n = /^\d+$/.test(t) ? +t : 0;
      if (!ids.has(t) && !(n >= 1 && n <= slides.length)) warns.push(`slide ${i + 1}: o link para "${t}" não leva a nenhum slide (dê id: ${t} ao slide de destino)`);
    }
  });
  return warns;
}

export function buildHTML(rawSpec, opts = {}) {
  const spec = normalizeSpec(meetingSpec(rawSpec,opts.audience));
  const theme = resolveTheme(spec.theme, spec.palette, identityOf(spec));
  const warnings = [];
  if (spec.identity && !theme.identity) warnings.push(`identidade "${spec.identity}" não está em ${identitiesFile()} nesta máquina: a apresentação saiu com as fontes do tema`);
  const ctx = { baseDir: spec._dir || process.cwd(), theme, spec, warnings };
  const id = spec.id || slug(spec.title);
  const slidesMeta = [];
  let html = "";

  spec.slides.forEach((raw, i) => {
    const s = { ...(spec.defaults || {}), ...raw };
    const layout = inferLayout(s);
    const fn = LAYOUTS[layout];
    if (!fn) throw new Error(`Slide ${i + 1}: layout "${layout}" não existe. Use: ${Object.keys(LAYOUTS).join(", ")}`);
    const tone = s.tone || (layout === "scenography" && SCENES[s.scene || "stage"]?.tone) || DEFAULT_TONE[layout] || spec.tone || "light";
    let inner;
    const th = slideTheme(s, theme, spec), sctx = th === theme ? ctx : { ...ctx, theme: th };
    try { inner = fn(s, sctx); } catch (e) { throw new Error(`Slide ${i + 1} (${layout}${s.title ? `: ${plain(s.title).slice(0, 40)}` : ""}): ${e.message}`); }
    html += slideShell({ s, i, spec, theme: th, ctx: sctx, layout, tone, inner }) + "\n";

    const words = wordCount({ ...raw, notes: undefined });
    // limite pelo propósito do material (purpose: consulta/aula aceitam texto corrido) e pelo layout (one-page, status)
    const limit = wordLimit(s, spec, layout);
    if (words > limit) warnings.push(`slide ${i + 1}: ${words} palavras (limite ${limit}) — divida em dois ou use cliques`);
    const t = plain(s.title || s.text || s.question || s.quote || (s.lines && (s.lines[0].text || s.lines[0])) || s.kicker || layout);
    slidesMeta.push({ title: t.slice(0, 90), notes: notesHTML(s.notes), notesRaw: s.notes || "", consulta: s.consulta ? notesHTML(s.consulta) : "", ...(s.layout === 'calc' ? { exploration: explorationStates(s), explorationModel: calcModel(s), illustrative: !!s.illustrative, prediction: s.prediction || '', outputLabels: Object.fromEntries((s.outputs || []).map(o => [o.name, [o.label || o.name, o.unit || ''].join(' ').trim()])) } : {}), time: s.time || 0, layout, words });
  });

  for(const [i,s]of spec.slides.entries())if(['graphlab','codelab','playground','portal'].includes(s.layout))slidesMeta[i].interactiveModel={theme:spec.theme||'manual',slide:s};
  // navegação por caminhos: todo goto/back/next e [texto](#id) tem de levar a um slide (id ou número)
  warnings.push(...navWarnings(spec.slides));

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
  const size = slideSize(spec);
  const data = { size: { w: size.w, h: size.h }, id, title: spec.title || "", author: spec.author || "", motion: ["none", "subtle", "expressive"].includes(spec.motion) ? spec.motion : "subtle", duration: spec.duration || null, slides: slidesMeta.map(({ notesRaw, consulta, ...m }) => m) };
  const planned = slidesMeta.reduce((a, s) => a + s.time, 0);

  const doc = `<!doctype html>
<html lang="${spec.lang || "pt-BR"}" style="--sh:${size.h}px;--aspect:${size.ratio}"${size.h > size.w ? ' data-orient="portrait"' : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="sagadeck">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%227%22 fill=%22%23c43e1c%22/%3E%3Cpath d=%22M12 9l12 7-12 7z%22 fill=%22white%22/%3E%3C/svg%3E">
<title>${esc(plain(spec.title || "Apresentação"))}</title>
<style>${fontsCSSFor(read("runtime/base.css") + deckThemeCSS(spec, theme) + customCSS)}
${read("runtime/base.css")}
${read("runtime/portal-scene.css")}
${read("runtime/meeting.css")}
${spec.slides.some(s => ["science", "solution", "calc"].includes(s.layout) || (s.layout === "canvas" && JSON.stringify(s.elements || []).includes('"latex"')) || new RegExp(INLINE_MATH.source).test(JSON.stringify(s))) ? read("runtime/vendor/katex.css") : ""}
${deckThemeCSS(spec, theme)}
${customCSS}</style></head>
<body class="theme-${theme.name}">
<div id="viewport"><div id="stage">
${html}
<canvas id="draw-canvas" width="1920" height="${size.h}"></canvas>
</div></div>
<div id="draw-toolbar" class="draw-toolbar" style="display:none">
  <button id="draw-btn-pen" class="draw-btn active" title="Caneta (D)">${drawIcon("pencil")}</button>
  <button id="draw-btn-highlighter" class="draw-btn" title="Marca-texto (M)">${drawIcon("highlighter")}</button>
  <div class="draw-separator"></div>
  <button class="draw-color active" data-color="#ef4444" style="background:#ef4444" title="Vermelho"></button>
  <button class="draw-color" data-color="#f59e0b" style="background:#f59e0b" title="Amarelo"></button>
  <button class="draw-color" data-color="#38bdf8" style="background:#38bdf8" title="Azul"></button>
  <button class="draw-color" data-color="#22c55e" style="background:#22c55e" title="Verde"></button>
  <button class="draw-color" data-color="#ffffff" style="background:#ffffff" title="Branco"></button>
  <div class="draw-separator"></div>
  <button id="draw-btn-undo" class="draw-btn" title="Desfazer (Ctrl+Z ou Z)">${drawIcon("undo-2")}</button>
  <button id="draw-btn-clear" class="draw-btn" title="Limpar anotações (C)">${drawIcon("trash-2")}</button>
  <button id="draw-btn-close" class="draw-btn" title="Fechar modo desenho (Esc ou D)">${drawIcon("x")}</button>
</div>
<button id="draw-fab" class="draw-fab" title="Ativar Caneta de Anotações (D)">${drawIcon("pencil", 24)}</button>
<div id="hud"><div class="bar"></div></div><div id="laser"></div><div id="blank"></div><div id="overview"></div><div id="toast"></div>
<div id="help"><b>Atalhos</b><br><kbd>→</kbd><kbd>espaço</kbd> avança · <kbd>←</kbd> volta<br><kbd>D</kbd> caneta ao vivo · <kbd>M</kbd> marca-texto · <kbd>C</kbd> limpa tela<br><kbd>P</kbd> janela do apresentador (notas + cronômetro)<br><kbd>F</kbd> tela cheia · <kbd>G</kbd> visão geral<br><kbd>B</kbd> tela preta · <kbd>W</kbd> tela branca<br><kbd>L</kbd> apontador laser · <kbd>R</kbd> zera timer<br><kbd>5</kbd><kbd>Enter</kbd> vai ao slide 5 · <kbd>H</kbd> esta ajuda</div>
<script type="application/json" id="sagadeck-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>window.Sagadeck={_q:[],widget:function(n,d){this._q.push([n,d])}};</script>
<script>${widgets.replace(/<\/script/gi, "<\\/script")}</script>
<script>${read("runtime/fit.js")}</script>
<script>${read("runtime/runtime.js")}</script>
<script>${read("runtime/motion.js")}</script>
<script>${read("runtime/video-player.js")}</script>
${spec.slides.some(s=>s.layout==='poll'&&s.manual)?`<script>${read('runtime/meeting.js')}</script>`:''}
${spec.slides.some(s => s.layout === "decisionlab") ? `<script>${read("runtime/decision-lab.js")}</script>` : ""}
${spec.slides.some(s => s.layout === "graphlab") ? `<script>${read("runtime/graph-lab.js")}</script>` : ""}
${spec.slides.some(s => s.layout === "codelab") ? `<script>${read("runtime/code-lab.js").replace(/<\/script/gi,'<\\/script')}</script>` : ""}
${spec.slides.some((s) => s.layout === "diagram") ? `<script>${read("runtime/vendor/mermaid.min.js").replace(/<\/script/gi, "<\\/script")}</script><script>${read("runtime/diagram.js")}</script>` : ""}
${spec.slides.some(s => s.layout === "science") ? `<script>${read("runtime/vendor/plotly.min.js").replace(/<\/script/gi,"<\\/script")}</script><script>${read("runtime/formula.js")}</script><script>${read("runtime/science.js")}</script>` : ""}
${spec.slides.some(s => s.layout === "calc") ? `${spec.slides.some(s => s.layout === "science") ? "" : `<script>${read("runtime/formula.js")}</script>`}<script>${read("runtime/calc.js")}</script>` : ""}
${spec.slides.some(s=>s.layout==="portal") ? `<script>${read("runtime/portal-scene.js")}</script>` : ""}
${JSON.stringify(spec.slides || []).includes('"points"') ? `<script>${read("runtime/points.js")}</script>` : ""}
${spec.slides.some(s=>s.layout==="playground") ? `<script>${read("runtime/playground.js")}</script>` : ""}
${hasApi ? `${apiScripts}\n<script>${read("runtime/api-ui.js")}</script><script>${read("runtime/api-collection-ui.js")}</script>` : ""}
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

// Padrões do ajuste para caber; o Studio troca pelos das Preferências (setFitDefaults). O deck (fit:) vence os dois.
const FIT_DEFAULTS = { minCodePt: 10, minTextPt: 6, wrapCode: true };
export function setFitDefaults(d = {}) {
  for (const k of Object.keys(FIT_DEFAULTS)) if (d[k] !== undefined && d[k] !== null && d[k] !== "") FIT_DEFAULTS[k] = k === "wrapCode" ? d[k] !== false : Number(d[k]) || FIT_DEFAULTS[k];
}
export const fitDefaults = () => ({ ...FIT_DEFAULTS });

// eco ambiente: camada viva discreta atrás do conteúdo (só no HTML; PPTX/PDF usam o quadro parado)
const AMBIENT = ["pontos", "grade"];
function ambientOf(s, i, ctx) {
  if (s.ambient == null || s.ambient === "") return "";
  if (!AMBIENT.includes(s.ambient)) { ctx.warnings?.push(`slide ${i + 1}: ambiente "${s.ambient}" desconhecido (vale: ${AMBIENT.join(", ")})`); return ""; }
  return s.ambient;
}
// <section> de um slide: tom, textura, estilo do destaque, fundo, área, cabeçalho e rodapé.
// Única montagem para o Studio (renderSlide) e para a apresentação/exportação (buildHTML).
function slideShell({ s, i, spec, theme, ctx, layout, tone, inner: innerIn, current = false }) {
  let inner = innerIn;
  const ambient = ambientOf(s, i, ctx);
  const deco = s.deco ?? theme.deco;
  const style = (s.bg ? `--bg:#${String(s.bg).replace("#", "")};` : "") + (s.fg ? `--fg:#${String(s.fg).replace("#", "")};` : "");
  const bars = s.footer !== false && (s.footer === true || !NO_FOOTER.has(layout));
  const area = layout === "canvas" || layout === "full" || layout === "kinetic" || layout === "scenography" ? "free" : "safe";
  // estilo do ==destaque== (marca-texto | sublinhado | cor | negrito | nenhum), no deck ou por slide
  const markStyle = s.markStyle || spec.markStyle;
  const total = spec.slides?.length || i + 1;
  // navegação por caminhos: id (destino de goto/back/next), next (aonde o avanço leva no fim do slide), back (botão Voltar)
  const nav = (s.id != null && s.id !== "" ? ` id="s-${esc(s.id)}" data-id="${esc(s.id)}"` : "") + (s.next != null && s.next !== "" ? ` data-next="${esc(s.next)}"` : "");
  // mínimos do ajuste para caber (em pt, como no PowerPoint; 1 pt = 2 px no slide de 1920): deck > Preferências > padrão
  const fit = { ...FIT_DEFAULTS, ...(spec.fit || {}) };
  const fitAttrs = ` data-min-code="${Math.round(Number(fit.minCodePt) * 2) || 20}" data-min-text="${Math.round(Number(fit.minTextPt) * 2) || 0}"${fit.wrapCode === false ? ' data-code-wrap="0"' : ""}`;
  const withMaster = masterApplies(spec, s, layout);
  // faixa do título do mestre: o cabeçalho do layout sai do fluxo e vai para cima do fio (src/master.js: titleBand)
  const band = withMaster && !isCoverLayout(layout) && area === "safe" ? titleBand(spec) : null;
  // (fora da área útil: o ajuste para caber de lá não pode achar que o título "vaza"; ele encolhe só pelo próprio tamanho,
  // data-fit-self, e não pelo que vaza no resto do slide; os ajustes visuais valem nele)
  let bandTitle = "";
  if (band) {
    const hd = inner.match(/<header class="hd">[\s\S]*?<\/header>/);
    if (hd) { bandTitle = `<div class="master-title">${hd[0].replace(/<[a-z0-9]+ [^>]*class="[^"]*\bttl\b[^"]*"[^>]*/, (tag) => `${tag}${/\sdata-fit[\s=>]|\sdata-fit$/.test(tag) ? "" : " data-fit"} data-fit-self`)}</div>`; inner = inner.replace(hd[0], ""); }
  }
  let html = `<section class="slide${current ? " current" : ""}${withMaster ? ` has-master${isCoverLayout(layout) ? " master-cover" : ""}${band ? " master-band" : ""}` : ""} th-${theme.name} lk-${theme.key} tone-${tone} ${deco && deco !== "none" ? "deco-" + deco : ""} ${markStyle && markStyle !== "marca-texto" ? "ms-" + markStyle : ""} L-${layout}-slide${["compact", "dense"].includes(s.density) ? " density-" + s.density : ""}" data-idx="${i}"${s.uid ? ` data-uid="${esc(String(s.uid))}"` : ""} data-layout="${layout}" data-tr="${s.transition || "fade"}"${ambient ? ` data-ambient="${ambient}"` : ""}${nav}${fitAttrs}${!Array.isArray(s.steps) && Number.isFinite(Number(s.steps)) && Number(s.steps) > 0 ? ` data-steps="${Number(s.steps)}"` : ""}${style ? ` style="${style}"` : ""}>`;
  if (ambient) html += `<div class="ambient" aria-hidden="true"></div>`;
  if (s.background) html += `<div class="bgfig" style="${s.backgroundStyle || ""}">${el(s.background, ctx, 1920, slideSize(spec).h)}</div>`;
  // mestre do deck (logos, faixas, número da página: src/master.js), atrás do conteúdo
  if (withMaster) html += `<div class="master" aria-hidden="true">${masterElements(spec, layout, i).map((e) => el(e, ctx)).join("")}</div>`;
  // ornamentos da pele do tema (fitas, molduras, faixas...): desenhados em CSS, atrás do conteúdo
  if (area === "safe") html += `<div class="orn" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
  if (bars && s.header !== false) html += barHTML("header", spec, i, total);
  if (bandTitle) html += applyVisualEdits(bandTitle, s.visualEdits, { src: (p) => imageSrc(p, ctx) || p });
  html += `<div class="${area}">${applyVisualEdits(inner, s.visualEdits, { src: (p) => imageSrc(p, ctx) || p })}</div>`;
  if (bars) html += barHTML("footer", spec, i, total);
  if (s.back != null && s.back !== "") {
    const alvo = (spec.slides || []).find((x) => x && String(x.id) === String(s.back));
    const nome = s.backLabel || (alvo ? plain(alvo.title || alvo.kicker || alvo.question || "") : "") || "o mapa";
    html += `<a class="nav-back t f-label" href="#s-${esc(s.back)}" data-goto="${esc(s.back)}">${iconSVG("arrow-left", { size: 26, stroke: 2 })}<span>Voltar: ${esc(nome)}</span></a>`;
  }
  return html + `</section>`;
}

export function renderSlide(raw, i = 0, spec = {}) {
  const deckTheme = resolveTheme(spec.theme, spec.palette, identityOf(spec));
  const s = { ...(spec.defaults || {}), ...raw };
  const theme = slideTheme(s, deckTheme, spec);
  const ctx = { baseDir: spec._dir || process.cwd(), theme, spec, warnings: [] };
  const layout = inferLayout(s);
  const fn = LAYOUTS[layout];
  if (!fn) throw new Error(`Slide ${i + 1}: layout "${layout}" não existe.`);
  const tone = s.tone || (layout === "scenography" && SCENES[s.scene || "stage"]?.tone) || DEFAULT_TONE[layout] || spec.tone || "light";
  const inner = fn(s, ctx);
  const deco = s.deco ?? theme.deco;
  const html = slideShell({ s, i, spec, theme, ctx, layout, tone, inner, current: true });
  // o CSS de todos os temas do deck (e do próprio slide), igual para qualquer slide: as miniaturas não piscam
  const all = deckThemeCSS({ ...spec, slides: [...(spec.slides || []), s] }, deckTheme);
  return { html, layout, tone, deco, theme, inner, baseCSS: read("runtime/base.css") + read("runtime/portal-scene.css") + read('runtime/meeting.css'), themeCSS: all };
}
