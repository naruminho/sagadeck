// Layouts: cada um recebe o objeto do slide (YAML) e devolve o HTML da área útil.
// Todos aceitam: kicker, title, source, add (elementos extras no fim), tone, notes, time.
import { tableHTML } from "./table.js";
import { decisionLabHTML } from "./decision-lab.js";
import { md, esc } from "./markup.js";
import { adaptiveHTML } from "./adaptive-layouts.js";
import { iconSVG, listIcons } from "./figures/icons.js";
let iconNames = null;
const diagramIconNames = () => (iconNames ||= new Set(listIcons()));
import { el, text, figureHTML, attrs, SIZES, list, cards, stats, steps, poll, timer, counter, code } from "./elements.js";
import { displayCodeLanguage, resolveCodeLanguage } from "./code-language.js";
import { mathHTML, plotHTML } from "./science.js";
import { infographicHTML } from "./infographic.js";
import { duelHTML, terminalsHTML, turnsHTML } from "./dynamics/layouts.js";
import { carouselHTML } from "./carousel.js";
import { slideSize } from "./aspect.js";
import { recreatedFrame } from "./master.js";
import { solutionHTML, calcHTML, algoHTML } from "./lessons.js";
import "./runtime/api-core.js"; // globalThis.SagadeckApiCore (o mesmo núcleo que roda na apresentação)

const plainTitle = (s) => String(s.title || s.kicker || s.layout || "").replace(/[*=^~`]/g, "").slice(0, 40);
const kicker = (s, d = 0) => (s.kicker ? `<div class="kicker t f-label e" style="--d:${d}">${md(s.kicker)}</div>` : "");
const title = (s, as = "h2", d = 1, extra = {}) => (s.title ? text(s.title, as, { class: "ttl e", style: `--d:${d};`, fit: s.fit, ...extra, ...(s.titleSize ? { size: s.titleSize } : {}) }) : "");
const head = (s, as = "h2") => (s.kicker || s.title ? `<header class="hd">${kicker(s)}${title(s, as)}</header>` : "");
const src = (s) => (s.source ? `<div class="src t f-body">${md(s.source)}</div>` : "");
const add = (s, ctx) => (s.add ? el(s.add, ctx) : "");
const fig = (f, ctx, w, h, cls = "") => (f ? `<div class="figbox ${cls}" style="${w ? `width:${w}px;` : ""}${h ? `height:${h}px;` : ""}">${typeof f === "object" ? el(f, ctx, w, h) : el({ image: f }, ctx)}</div>` : "");
const build = (s, i, base = 1) => (s.build ? base + i : undefined);
const codeEditor = (s, { source, highlight = s.highlight, footer = "CÓDIGO · LINHAS NUMERADAS" } = {}) => {
  const filename = s.filename || "código";
  const language = resolveCodeLanguage(s.language, filename);
  const languageLabel = displayCodeLanguage(s.language, filename) || "Código";
  return `<div class="codewalk-editor"><div class="codewalk-bar"><span class="codewalk-lights" aria-hidden="true"><i></i><i></i><i></i></span><span class="codewalk-file f-mono">${esc(filename)}</span><span class="codewalk-language f-label">${esc(languageLabel)}</span></div>${code({ code: source || s.code || "// Cole seu código aqui", language, filename, highlight, size: s.size || 30 })}<div class="codewalk-footer f-label">${footer}</div></div>`;
};
// As cenas de aula deixam todo o conteúdo no HTML: funcionam offline e têm resumo estático.
const lessonSteps = (items, fallback) => Array.isArray(items) && items.length ? items.map((p) => typeof p === "string" ? { title: p } : (p || {})) : [fallback];
const kineticPhrases = (value) => {
  const words = String(value || "").match(/==[^=]+==|\*\*.*?\*\*|\*[^*]+\*|~~.*?~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|\S+/g) || [];
  const connectors = new Set(["a", "as", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "o", "os"]);
  const phrases = [];
  while (words.length) {
    let take = Math.ceil(words.length / Math.ceil(words.length / 4));
    const last = words[take - 1]?.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "").toLowerCase();
    if (take > 1 && connectors.has(last)) take--;
    phrases.push(words.splice(0, take).join(" "));
  }
  return phrases;
};
const lessonControls = (items) => `<nav class="lesson-controls" aria-label="Etapas da explicação"><button type="button" data-lesson-prev aria-label="Etapa anterior" disabled>${iconSVG("arrow-left", { size: 26, stroke: 2 })}</button><div class="lesson-dots">${items.map((p, i) => `<button type="button" data-lesson-go="${i}" aria-label="Etapa ${i + 1}: ${esc(p.title || "Explicação")}" aria-current="${i === 0 ? "step" : "false"}">${String(i + 1).padStart(2, "0")}</button>`).join("")}</div><button type="button" data-lesson-next aria-label="Próxima etapa" ${items.length === 1 ? "disabled" : ""}>${iconSVG("arrow-right", { size: 26, stroke: 2 })}</button></nav>`;
const lessonPanels = (items, output = false) => `<div class="lesson-panels" aria-live="polite" aria-atomic="true">${items.map((p, i) => `<article class="lesson-panel${i === 0 ? " active" : ""}" data-lesson-panel="${i}" data-highlight="${esc(JSON.stringify([].concat(p.highlight || []).filter(Number.isFinite)))}"><div class="lesson-counter f-label">${String(i + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}</div>${text(p.title || `Etapa ${i + 1}`, "h3", { class: "lesson-title", size: 48 })}${p.text ? text(p.text, "body", { class: "lesson-text", size: 32 }) : ""}${output && p.output != null ? `<div class="lesson-output"><div class="lesson-output-label f-label">Saída esperada · simulação</div><pre class="f-mono">${esc(p.output)}</pre></div>` : ""}</article>`).join("")}</div>`;
const lessonSummary = (items) => `<div class="lesson-summary">${items.map((p, i) => `<article><div class="f-label lesson-summary-number">${String(i + 1).padStart(2, "0")}</div><div><strong class="f-heading">${md(p.title || `Etapa ${i + 1}`)}</strong>${p.text ? `<p class="f-body">${md(p.text)}</p>` : ""}${p.output != null ? `<pre class="f-mono">${esc(p.output)}</pre>` : ""}</div></article>`).join("")}</div>`;
const percent = (value, fallback, min = 0, max = 100) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

// Texto no cenário: as composições. label = nome no formulário; size = tamanho padrão do título (titleSize vence);
// props = cenografia extra (só texto e caixas; os desenhos são CSS em base.css, nada de símbolo unicode).
const candles = () => Array.from({ length: 30 }, (_, i) => {
  const y = 120 + Math.round(Math.sin(i * 0.55) * 90 + i * 11), h = 40 + ((i * 37) % 90), up = (i * 7) % 3 !== 0;
  return `<i class="candle ${up ? 'up' : 'down'}" style="--x:${i * 64}px;--y:${y}px;--h:${h}px"></i>`;
}).join('');
export const SCENES = {
  stage: { label: 'Palco e profundidade', size: 230, tone: 'dark' },
  floor: { label: 'Chão em perspectiva', size: 230 },
  signs: { label: 'Placas na cidade', size: 230, tone: 'dark' },
  terminal: { label: 'Terminal hacker', size: 150, tone: 'dark', props: () => `<pre class="scene-code">${Array.from({ length: 34 }, (_, i) => `${(0x7f3a00 + i * 16).toString(16)}  ${Array.from({ length: 12 }, (_, j) => ((i * 31 + j * 17) % 256).toString(16).padStart(2, '0')).join(' ')}  ${['ssh saga@deck','sudo apresentar --ao-vivo','git push origin ideia','cat segredo.txt | grep plano','nmap -sV palco.local','tail -f plateia.log'][i % 6]}`).join('\n')}</pre><div class="scene-scan"></div>` },
  cafe: { label: 'Lousa de café', size: 170, tone: 'dark', props: () => `<div class="scene-neon">aberto</div><ul class="scene-menu"><li><span>espresso</span><span>7</span></li><li><span>coado do dia</span><span>9</span></li><li><span>pão de queijo</span><span>6</span></li><li><span>ideia nova</span><span>grátis</span></li></ul>` },
  travel: { label: 'Cartão de embarque', size: 140, props: () => `<div class="scene-pass"><div class="scene-pass-top">CARTÃO DE EMBARQUE</div><dl><div><dt>DE</dt><dd>GRU</dd></div><div><dt>PARA</dt><dd>LIS</dd></div><div><dt>VOO</dt><dd>SG 2026</dd></div><div><dt>PORTÃO</dt><dd>12</dd></div><div><dt>ASSENTO</dt><dd>7A</dd></div><div><dt>EMBARQUE</dt><dd>09:40</dd></div></dl><div class="scene-barcode"></div></div>` },
  ticker: { label: 'Pregão financeiro', size: 190, tone: 'dark', props: () => `<div class="scene-tape"><span>IBOV 128.430 <b class="up">+1,24%</b></span><span>USD/BRL 5,02 <b class="down">-0,31%</b></span><span>SAGA3 42,10 <b class="up">+8,90%</b></span><span>IDEIA11 99,00 <b class="up">+12,5%</b></span><span>BTC 312.004 <b class="down">-2,05%</b></span><span>SELIC 10,50%</span><span>IBOV 128.430 <b class="up">+1,24%</b></span></div><div class="scene-candles">${candles()}</div>` },
  marquee: { label: 'Letreiro de cinema', size: 150, tone: 'dark', props: () => `<div class="scene-curtain left"></div><div class="scene-curtain right"></div><div class="scene-ticket">SESSÃO 20H</div>` },
  blueprint: { label: 'Planta técnica', size: 170, tone: 'accent', props: () => `<div class="scene-dim h"><span>1920</span></div><div class="scene-dim v"><span>1080</span></div><table class="scene-stamp"><tr><td>PROJETO</td><td>SAGADECK</td></tr><tr><td>FOLHA</td><td>01 / 13</td></tr><tr><td>ESCALA</td><td>1:1</td></tr><tr><td>REVISÃO</td><td>A</td></tr></table>` },
  magazine: { label: 'Capa de revista', size: 210, props: () => `<div class="scene-masthead">SAGA</div><div class="scene-issue">EDIÇÃO 13 <i></i> SETEMBRO 2026 <i></i> R$ 24,90</div><ul class="scene-lines"><li><b>+10</b> ideias que mudam o jogo</li><li><b>Exclusivo</b> os bastidores do palco</li><li><b>Guia</b> como contar uma história</li></ul><div class="scene-barcode"></div>` },
  orbit: { label: 'Órbita', size: 170, tone: 'dark', props: () => `<div class="scene-stars"></div><div class="scene-stars far"></div><div class="scene-hud"><span>LAT -23.55</span><span>LON -46.63</span><span>ALT 408 KM</span><span>V 7,66 KM/S</span></div>` },
  synthwave: { label: 'Neon anos 80', size: 190, tone: 'dark', props: () => `<div class="scene-sun"></div><div class="scene-grid"></div><div class="scene-mountains"></div>` },
  gallery: { label: 'Parede de galeria', size: 170, props: () => `<div class="scene-spot"></div><div class="scene-plaque"><b>Sem título</b><span>2026. Texto sobre parede.</span><span>Coleção particular</span></div><div class="scene-baseboard"></div>` },
};

export const LAYOUTS = {
  mosaic(s) { return `${head(s)}${adaptiveHTML(s,'mosaic')}${src(s)}`; },
  ribbon(s) { return `${head(s)}${adaptiveHTML(s,'ribbon')}${src(s)}`; },
  dossier(s) { return `${head(s)}${adaptiveHTML(s,'dossier')}${src(s)}`; },
  decisionlab(s) { return `${head(s)}${decisionLabHTML(s.lab)}${src(s)}`; },
  cover(s, ctx) {
    return `<div class="L-cover">
      <div class="cv-main">${kicker(s)}${text(s.title, "hero", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}
      ${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:2;" }) : ""}
      ${s.author ? `<div class="author e" style="--d:3">${text(s.author, "h3", { size: 40 })}${s.role ? text(s.role, "small", { class: "muted" }) : ""}</div>` : ""}</div>
      ${s.figure ? `<div class="cv-fig e" style="--d:2">${el(s.figure, ctx, 700, 760)}</div>` : ""}
    </div>${add(s, ctx)}`;
  },

  section(s, ctx) {
    return `<div class="L-section">
      ${s.number != null ? `<div class="sc-num t f-display e">${esc(s.number)}</div>` : ""}
      <div class="sc-text">${kicker(s, 1)}${text(s.title, "title", { class: "ttl e", style: "--d:2;", size: s.titleSize || 150, fit: true })}${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:3;" }) : ""}</div>
      ${s.figure ? `<div class="sc-fig e" style="--d:3">${el(s.figure, ctx, 560, 560)}</div>` : ""}
    </div>${add(s, ctx)}`;
  },

  statement(s, ctx) {
    const lines = s.lines
      ? s.lines.map((l, i) => {
          const o = typeof l === "string" ? { text: l } : l;
          return text(o.text, o.as || "title", { ...o, step: o.step ?? build(s, i, 0), class: `st-line ${o.class || ""}`, size: o.size || s.size });
        }).join("")
      : text(s.text, s.as || "title", { class: "st-line e", style: "--d:1;", fit: true, size: s.size });
    return `<div class="L-statement ${s.center ? "center" : ""}">${kicker(s)}<div class="st-body">${lines}</div>
      ${s.by ? text(s.by, "label", { class: "st-by e", style: "--d:3;", step: s.byStep }) : ""}${src(s)}</div>${add(s, ctx)}`;
  },

  // Status semanal: saúde, avanço e as seções que tiverem conteúdo (feito, em andamento, bloqueios, riscos, próximos
  // passos); screenshots ao lado quando houver. Semana sem nada "mostrável" = sem colunas vazias nem área de imagem.
  status(s, ctx) {
    const SEC = [["done", "Feito", "circle-check"], ["doing", "Em andamento", "loader-circle"], ["blocked", "Bloqueios", "octagon-alert"],
      ["risks", "Riscos e problemas", "triangle-alert"], ["upcoming", "Próximos passos", "circle-arrow-right"]];
    const HEALTH = { ok: "Em dia", risco: "Atenção", atrasado: "Atrasado" };
    if (s.health && !HEALTH[s.health]) ctx.warnings?.push(`slide "${plainTitle(s)}": health: use ok, risco ou atrasado (veio "${s.health}")`);
    const item = (o) => { const x = typeof o === "string" ? { text: o } : o || {}; const meta = [x.owner, x.due ? `até ${x.due}` : ""].filter(Boolean).join(" · ");
      return `<li class="stt-item"><span class="stt-dot" aria-hidden="true"></span><div class="stt-it"><div class="t f-body">${md(x.text)}</div>${meta ? `<div class="stt-meta t f-label">${esc(meta)}</div>` : ""}</div></li>`; };
    const secs = SEC.filter(([k]) => Array.isArray(s[k]) && s[k].length);
    const nShots = (s.shots || []).slice(0, 3).length;
    // grade de 6 trilhas: cada seção ocupa 6/colunas; a última linha, se incompleta, se reparte inteira (sem buraco)
    const n = secs.length, per = nShots ? Math.min(2, n) : n === 4 ? 2 : Math.min(3, n), rest = n % per;
    const span = (i) => (rest && i >= n - rest ? 6 / rest : 6 / per);
    const nItems = secs.reduce((a, [k]) => a + s[k].length, 0);
    const cols = secs.map(([k, label, icon], i) => `<div class="stt-col stt-${k} e" style="--d:${2 + i};grid-column:span ${span(i)};">
        <div class="stt-h"><span class="stt-ic">${iconSVG(icon, { size: 30, stroke: 2 })}</span><span class="t f-label">${esc(s[`${k}Label`] || label)}</span></div>
        <ul class="stt-list">${s[k].map(item).join("")}</ul></div>`);
    const shots = (s.shots || []).slice(0, 3).map((sh) => { const x = typeof sh === "string" ? { image: sh } : sh || {};
      return `<figure class="stt-shot">${el({ image: x.image, fit: "contain" }, ctx, 640, 360)}${x.caption ? `<figcaption class="t f-label">${md(x.caption)}</figcaption>` : ""}</figure>`; });
    const pct = s.progress != null && Number.isFinite(+s.progress) ? Math.max(0, Math.min(100, +s.progress)) : null;
    const health = HEALTH[s.health] ? `<span class="stt-health stt-${s.health}"><i aria-hidden="true"></i><span class="t f-label">${esc(s.healthLabel || HEALTH[s.health])}</span></span>` : "";
    const prog = pct != null ? `<div class="stt-prog"><div class="stt-track"><div class="stt-bar" style="width:${pct}%"></div></div><span class="t f-label">${pct}%</span></div>` : "";
    // semana magra (poucos itens, sem telas): letra maior e o bloco no meio, em vez de cartões pequenos no alto
    const roomy = !shots.length && nItems <= 6;
    return `<div class="L-status${shots.length ? " with-shots" : ""}${roomy ? " stt-roomy" : ""}">
      <div class="stt-top">${head(s)}<div class="stt-side e" style="--d:1;">${health}${prog}</div></div>
      ${s.highlight ? text(s.highlight, "lead", { class: "stt-highlight e", style: "--d:1;" }) : ""}
      <div class="stt-body"><div class="stt-cols">${cols.join("")}</div>${shots.length ? `<div class="stt-shots e" style="--d:3;">${shots.join("")}</div>` : ""}</div>
      ${src(s)}</div>${add(s, ctx)}`;
  },

  // One-page: tudo numa página só. Jornada (ícones e mini-frases), problema com números, solução e, quando houver,
  // um painel (números grandes em cima, gráficos e mapa por UF embaixo). Só entram as partes preenchidas; o painel
  // sozinho é um dashboard. Com problema/solução e painel juntos, os dois ficam lado a lado (cabe numa página).
  onepage(s, ctx) {
    // bloco vazio (o formulário cria {} ao abrir) não aparece
    const filled = (b) => b && (b.text || (b.items || []).length || (b.numbers || []).length);
    const sec = (v, dflt) => { const b = v == null ? null : typeof v === "string" ? { text: v } : Array.isArray(v) ? { items: v } : v;
      return filled(b) ? { ...b, title: b.title || dflt } : null; };
    const problem = sec(s.problem, "O problema"), solution = sec(s.solution, "A solução");
    const jSteps = (Array.isArray(s.journey) ? s.journey : s.journey?.steps || []).filter((x) => x != null && x !== "");
    const journey = { title: s.journeyTitle ?? s.journey?.title ?? "Jornada" };
    // painel: { numbers: [...], figures: [...] } (também aceita uma lista misturada)
    const D = s.dashboard || {}, mixed = Array.isArray(D) ? D : [];
    const isKpi = (x) => (x.value != null || x.stat != null) && !x.chart && !x.ufmap;
    const obj = (t) => (typeof t === "object" && t ? (t.chart && typeof t.chart === "object" ? { ...t.chart, title: t.title } : t) : { value: t });
    const kpis = [...(D.numbers || []), ...mixed].filter((x) => x != null).map(obj).filter(isKpi);
    const figAll = [...(D.figures || []), ...mixed].filter((x) => x != null).map(obj).filter((x) => !isKpi(x));
    const tiles = [...kpis, ...figAll];
    const maps = figAll.filter((x) => x.ufmap), figs = figAll.filter((x) => !x.ufmap);
    const mid = [problem, solution].filter(Boolean).length;
    const beside = mid && tiles.length;
    const roomy = !tiles.length;
    // tamanho de cada gráfico, para desenhar já na proporção certa (a letra do gráfico acompanha)
    const bodyH = 850 - (s.kicker ? 170 : 120) - (s.subtitle ? 60 : 0) - (jSteps.length ? 200 : 0);
    // o mapa por UF é alto: ganha uma coluna própria no painel, da altura toda
    const mapW = maps.length ? Math.round((bodyH - 90) * 0.75) + 44 : 0;
    const dashW = (beside ? 1680 * 0.58 - 12 : 1680) - (maps.length ? (mapW + 24) * maps.length : 0);
    const figH = bodyH - (kpis.length ? 170 : 0) - 70, figW = figs.length ? (dashW - 24 * (figs.length - 1)) / figs.length - 44 : 0;
    const nums = (arr) => (arr || []).length ? `<div class="op-nums">${arr.map((n) => { const x = typeof n === "object" ? n : { value: n };
      return `<div class="op-num"><div class="t f-display op-num-v">${esc(String(x.value ?? ""))}</div>${x.label ? `<div class="t f-label op-num-l">${md(x.label)}</div>` : ""}</div>`; }).join("")}</div>` : "";
    const bullets = (arr) => (arr || []).length ? `<ul class="op-items">${arr.map((x) => `<li class="t f-body">${md(typeof x === "object" ? x.text : x)}</li>`).join("")}</ul>` : "";
    const block = (b, cls, d) => b ? `<section class="op-block ${cls} e" style="--d:${d};"><div class="op-h t f-label">${md(b.title)}</div>
        ${b.text ? `<div class="t f-body op-text">${md(b.text)}</div>` : ""}${nums(b.numbers)}${bullets(b.items)}</section>` : "";
    const jHTML = jSteps.length ? `<section class="op-journey e" style="--d:2;">${journey.title ? `<div class="op-h t f-label">${md(journey.title)}</div>` : ""}<ol class="op-steps" style="--n:${jSteps.length}">${jSteps.map((st, i) => { const x0 = typeof st === "string" ? { text: st } : st, x = x0.title ? x0 : { ...x0, title: x0.text, text: "" }; // só texto = frase curta, em destaque
        return `<li class="op-step${x.goto ? " goto" : ""}"${x.goto ? ` data-goto="${esc(x.goto)}"` : ""}>${x.icon ? `<span class="op-ic">${iconSVG(x.icon, { size: 40, stroke: 1.8 })}</span>` : `<span class="op-ic op-ic-n t f-label">${i + 1}</span>`}
          <div class="op-st">${x.title ? `<div class="t f-heading op-st-t">${md(x.title)}</div>` : ""}${x.text ? `<div class="t f-body op-st-x">${md(x.text)}</div>` : ""}</div></li>`; }).join("")}</ol></section>` : "";
    const tHead = (x) => (x.title ? `<div class="op-h t f-label">${md(x.title)}</div>` : "");
    const kpi = (x) => { const up = x.trendUp !== false && !String(x.trend || "").startsWith("-");
      return `<div class="op-tile op-kpi">${tHead(x)}<div class="t f-display op-kpi-v">${esc(String(x.value ?? x.stat))}</div>${x.label ? `<div class="t f-body op-kpi-l">${md(x.label)}</div>` : ""}
        ${x.trend ? `<div class="st-trend ${up ? "trend-up" : "trend-down"}">${iconSVG(up ? "trending-up" : "trending-down", { size: 22, stroke: 2.2 })} ${esc(x.trend)}</div>` : ""}</div>`; };
    // gráfico desenhado 1,5x maior e reduzido: a letra fica proporcional ao quadro pequeno
    const fig = (x) => { const { title: _t, ...f } = x;
      return `<div class="op-tile op-fig${x.ufmap ? " op-map" : ""}">${tHead(x)}<div class="op-fig-in">${x.ufmap ? el(f, ctx, mapW - 44) : el(f, ctx, Math.round(figW * 1.5), Math.round(Math.max(180, figH) * 1.5))}</div></div>`; };
    const dMain = kpis.length || figs.length ? `<div class="op-dash-main">${kpis.length ? `<div class="op-kpis">${kpis.map(kpi).join("")}</div>` : ""}${figs.length ? `<div class="op-figs" style="--n:${figs.length}">${figs.map(fig).join("")}</div>` : ""}</div>` : "";
    const dHTML = tiles.length ? `<section class="op-dash e" style="--d:4;${maps.length ? `--op-mapw:${mapW}px;` : ""}">${dMain}${maps.map(fig).join("")}</section>` : "";
    const midHTML = mid ? `<div class="op-mid">${block(problem, "op-problem", 3)}${block(solution, "op-solution", 3)}</div>` : "";
    const cls = ["L-onepage", beside ? "op-beside" : "", roomy ? "op-roomy" : "", tiles.length && !jSteps.length && !mid ? "op-only-dash" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}">${head(s)}
      ${s.subtitle ? text(s.subtitle, "lead", { class: "op-sub e", style: "--d:1;" }) : ""}
      <div class="op-main">${jHTML}<div class="op-body">${midHTML}${dHTML}</div></div>
      ${src(s)}</div>${add(s, ctx)}`;
  },

  // Mapa de caminhos: uma pergunta e as opções; cada opção leva (goto) à seção dela. O fim de cada caminho volta
  // ao mapa com next:/back: no último slide da seção (ver "Navegação por caminhos" na REFERENCIA).
  hub(s, ctx) {
    const opts = (s.options || s.items || []).map((o) => (typeof o === "string" ? { title: o } : o || {}));
    const cols = s.cols || (opts.length <= 4 ? Math.max(1, opts.length) : opts.length <= 6 ? 3 : 4);
    const body = opts.map((c, i) => `<div${attrs({ ...c, step: s.build ? 1 + i : c.step }, "hub-card")}>
        ${c.icon ? `<div class="hub-ico">${iconSVG(c.icon, { size: 56, stroke: 1.8 })}</div>` : ""}
        ${c.title ? `<div class="hub-title t f-heading">${md(c.title)}</div>` : ""}
        ${c.text ? `<div class="hub-text t f-body">${md(c.text)}</div>` : ""}
        <div class="hub-foot">${c.meta ? `<span class="hub-meta t f-label">${md(c.meta)}</span>` : "<span></span>"}${c.goto != null && c.goto !== "" ? `<span class="hub-go" aria-hidden="true">${iconSVG("arrow-right", { size: 30, stroke: 2 })}</span>` : ""}</div>
      </div>`).join("");
    return `<div class="L-hub">${head(s)}${s.question ? text(s.question, "lead", { class: "hub-q e", style: "--d:1;" }) : ""}
      <div class="hub-grid e" style="--d:2;grid-template-columns:repeat(${cols},minmax(0,1fr))">${body}</div>${src(s)}</div>${add(s, ctx)}`;
  },

  quote(s, ctx) {
    return `<div class="L-quote">${kicker(s)}
      <div class="q-mark t f-quote e" aria-hidden="true">“</div>
      ${text(s.quote, "quote", { class: "q-text e", style: "--d:1;", fit: true, size: s.size })}
      ${s.by ? `<div class="q-by e" style="--d:2">${text(s.by, "h3", { size: 40 })}${s.role ? text(s.role, "small", { class: "muted" }) : ""}</div>` : ""}
      ${s.after ? text(s.after, "lead", { class: "q-after", step: s.afterStep ?? 1, color: "em" }) : ""}
    </div>${add(s, ctx)}`;
  },

  number(s, ctx) {
    const v = typeof s.value === "object" ? s.value : { counter: s.value, prefix: s.prefix, suffix: s.suffix, decimals: s.decimals, from: s.from };
    return `<div class="L-number">
      <div class="nb-main">${kicker(s)}
        <div class="nb-val e" style="--d:1;${s.valueColor ? `color:var(--${s.valueColor});` : ""}">${counter({ ...v, size: s.size || 300, fit: true })}</div>
        ${s.label ? text(s.label, "lead", { class: "nb-label e", style: "--d:2;", size: s.labelSize || 52 }) : ""}
        ${s.context ? text(s.context, "body", { class: "nb-ctx muted", step: s.contextStep }) : ""}
      </div>
      ${s.side ? `<div class="nb-side" ${s.sideStep ? `data-step="${s.sideStep}"` : ""}>${el(s.side, ctx, 640, 700)}</div>` : ""}
    </div>${src(s)}${add(s, ctx)}`;
  },

  split(s, ctx) {
    const ratio = String(s.ratio || "1:1").split(":").map(Number);
    const left = `${s.body ? text(s.body, s.bodyAs || "lead", { class: "sp-body e", style: "--d:2;" }) : ""}
      ${s.bullets ? list({ list: s.bullets, build: s.build, size: s.bulletSize }) : ""}
      ${s.content ? el(s.content, ctx) : ""}`;
    const W = Math.round(1680 * ratio[1] / (ratio[0] + ratio[1]));
    const right = s.figure ? `<div class="sp-fig e" style="--d:2;flex:${ratio[1]}" ${s.figureStep ? `data-step="${s.figureStep}"` : ""}>${el(s.figure, ctx, W - 40, 740)}</div>` : "";
    return `<div class="L-split ${s.reverse ? "rev" : ""}">
      <div class="sp-text" style="flex:${ratio[0]}">${head(s, s.titleAs || "h2")}${left}</div>${right}
    </div>${src(s)}${add(s, ctx)}`;
  },

  // tabela de verdade: título, a tabela (cores do tema) e, se houver, a conclusão ao lado (side) e a fonte
  table(s, ctx) {
    const t = { head: s.head || s.columns, rows: s.rows, csv: s.csv, style: s.style, color: s.color, align: s.align, highlight: s.highlight, total: s.total, widths: s.widths, rowHeader: s.rowHeader, size: s.size };
    const tb = `<div class="tb-main e" style="--d:2;">${tableHTML(t, { theme: ctx?.theme })}</div>`;
    const side = s.side ? `<div class="tb-side e" style="--d:3;">${text(s.side, "lead", { class: "tb-side-t" })}</div>` : "";
    return `<div class="L-table${side ? " with-side" : ""}">${head(s)}<div class="tb-row">${tb}${side}</div>${s.caption ? text(s.caption, "small", { class: "tb-cap" }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  cards(s, ctx) {
    return `<div class="L-cards">${head(s)}${cards({ cards: s.items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  stats(s, ctx) {
    const items = s.stats || s.kpis || s.items || [];
    return `<div class="L-stats">${head(s)}${stats({ stats: items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  steps(s, ctx) {
    const items = s.steps || s.process || s.flow || s.items || [];
    return `<div class="L-steps">${head(s)}${steps({ steps: items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  list(s, ctx) {
    return `<div class="L-list">${head(s)}${list({ list: s.items, numbered: s.numbered !== false, build: s.build, size: s.size })}</div>${src(s)}${add(s, ctx)}`;
  },

  timeline(s, ctx) {
    const ev = s.events || [];
    const hl = new Set([].concat(s.highlight ?? []));
    const body = ev.map((e, i) => `<div${attrs({ step: e.step ?? build(s, i) }, `tl-ev ${hl.has(i) ? "hl" : ""}`)}>
        <div class="tl-dot"></div><div class="tl-when t f-display">${md(e.when)}</div>
        <div class="tl-title t f-heading">${md(e.title || "")}</div>${e.text ? `<div class="tl-text t f-body">${md(e.text)}</div>` : ""}
        ${e.tag ? `<div class="tl-tag t f-label">${md(e.tag)}</div>` : ""}</div>`).join("");
    return `<div class="L-timeline">${head(s)}<div class="tl" style="--n:${ev.length}"><div class="tl-line"></div>${body}</div>${s.after ? text(s.after, "h3", { class: "tl-after", step: s.afterStep ?? (s.build ? ev.length + 1 : 1), face: "quote", size: 48 }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  chart(s, ctx) {
    const side = s.side || s.note;
    const w = side ? 1120 : 1680, h = s.chartHeight || (s.title ? 600 : 720);
    const ch = { ...s.chart, chart: s.chart.chart || s.chart.type };
    return `<div class="L-chart">${head(s)}<div class="ch-row">
      <div class="ch-fig e" style="--d:2" ${s.chartStep ? `data-step="${s.chartStep}"` : ""}>${figureHTML(ch, ctx, w, h)}</div>
      ${side ? `<div class="ch-side" ${s.sideStep ? `data-step="${s.sideStep}"` : ""}>${typeof side === "string" ? text(side, "lead") : el(side, ctx)}</div>` : ""}
    </div></div>${src(s)}${add(s, ctx)}`;
  },

  compare(s, ctx) {
    const col = (c, k, i) => `<div${attrs({ step: c.step ?? build(s, i) }, `cp-col cp-${k} ${c.hl ? "hl" : ""}`)}>
      ${c.label ? text(c.label, "label", { class: "cp-label" }) : ""}
      ${c.figure ? `<div class="cp-fig">${el(c.figure, ctx, 520, 320)}</div>` : ""}
      ${c.value != null ? text(String(c.value), "h2", { class: "cp-value", size: c.valueSize || 150 }) : ""}
      ${c.title ? text(c.title, "h3", { class: "cp-title" }) : ""}
      ${c.text ? text(c.text, "body", { class: "cp-text" }) : ""}
      ${c.items ? list({ list: c.items, size: 32 }) : ""}</div>`;
    return `<div class="L-compare">${head(s)}<div class="cp-row">${col(s.left, "l", 0)}<div${attrs({ step: s.right?.step ?? build(s, 1) }, "cp-vs t f-display")}>${esc(s.vs ?? "×")}</div>${col(s.right, "r", 1)}</div>
      ${s.after ? text(s.after, "h3", { class: "cp-after", step: s.afterStep ?? (s.build ? 3 : 1), face: "quote", size: 50 }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  matrix(s, ctx) {
    const cells = s.cells || [];
    const body = cells.map((c, i) => `<div${attrs({ step: c.step ?? build(s, i) }, `mx-cell ${c.hl ? "hl" : ""}`)}>
      ${c.icon || c.picto ? `<div class="mx-ico">${el(c.icon ? { icon: c.icon, size: 60 } : c, ctx)}</div>` : ""}
      ${text(c.title, "h3", { class: "mx-title" })}${c.text ? text(c.text, "body", { class: "mx-text" }) : ""}${c.example ? text(c.example, "small", { class: "mx-ex" }) : ""}</div>`).join("");
    const [xl, xr] = s.x || ["", ""], [yt, yb] = s.y || ["", ""];
    return `<div class="L-matrix">${head(s)}<div class="mx">
      <div class="mx-y"><span class="t f-label">${md(yt)}</span><span class="t f-label">${md(yb)}</span></div>
      <div class="mx-grid">${body}</div>
      <div class="mx-x"><span class="t f-label">${md(xl)}</span><span class="t f-label">${md(xr)}</span></div></div></div>${src(s)}${add(s, ctx)}`;
  },

  question(s, ctx) {
    const letters = "ABCDEFGH";
    const opts = (s.options || []).map((o, i) => {
      const obj = typeof o === "string" ? { text: o } : o;
      return `<div${attrs({ step: obj.step ?? build(s, i) }, "qs-opt")}><span class="qs-key t f-display">${esc(obj.key || (s.keys || letters)[i])}</span>${text(obj.text, "lead", { class: "qs-text", size: s.optionSize })}${obj.sub ? text(obj.sub, "small", { class: "qs-sub muted" }) : ""}</div>`;
    }).join("");
    return `<div class="L-question">
      <div class="qs-top">${kicker(s)}${text(s.question || s.title, "h2", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}${s.context ? text(s.context, "lead", { class: "muted e", style: "--d:2;" }) : ""}</div>
      <div class="qs-row"><div class="qs-opts" style="grid-template-columns:repeat(${s.cols || Math.min(3, (s.options || []).length || 1)},1fr)">${opts}</div>
      ${s.timer ? `<div class="qs-timer">${timer({ timer: s.timer, size: 230, label: s.timerLabel })}</div>` : ""}</div>
      ${s.hint ? text(s.hint, "h3", { class: "qs-hint e", style: "--d:3;", size: 42 }) : ""}
    </div>${add(s, ctx)}`;
  },

  poll(s, ctx) {
    return `<div class="L-poll">${kicker(s)}${text(s.question || s.title, "h2", { class: "ttl e", style: "--d:1;", size: s.titleSize })}
      ${s.context ? text(s.context, "lead", { class: "muted" }) : ""}
      ${poll({ poll: s.id || s.poll, options: s.options, compare: s.compare, hint: s.hint, class: "e", style: "--d:2;" }, ctx)}</div>${add(s, ctx)}`;
  },

  image(s, ctx) {
    // figura inteira à vista (fit: contain: gráfico, tabela, esquema): a legenda vai embaixo, sem cobrir; foto (cover)
    // segue sangrando, com o cartão por cima
    const contain = (s.figure?.fit || s.fit) === "contain";
    return `<div class="L-image${contain ? " im-contain" : ""}"><div class="im-fig">${el(s.figure || { image: s.image, fit: s.fit || "cover" }, ctx, 1920, slideSize(ctx.spec).h)}</div>
      ${s.title || s.caption ? `<div class="im-cap">${kicker(s)}${s.title ? text(s.title, "h2", { class: "ttl" }) : ""}${s.caption ? text(s.caption, "body") : ""}</div>` : ""}</div>${add(s, ctx)}`;
  },

  code(s, ctx) {
    return `<div class="L-code">${head(s)}<div class="cd-row">${codeEditor(s)}
      ${s.note ? `<div class="cd-note" ${s.noteStep ? `data-step="${s.noteStep}"` : ""}>${typeof s.note === "string" ? text(s.note, "lead") : el(s.note, ctx)}</div>` : ""}</div></div>${src(s)}${add(s, ctx)}`;
  },

  codewalk(s, ctx) {
    const frames = lessonSteps(s.steps, { title: "Acompanhe o código", text: "Adicione etapas com linhas destacadas e a saída esperada.", highlight: s.highlight });
    return `<div class="L-codewalk" data-lesson="codewalk" data-lesson-count="${frames.length}">${head(s)}<div class="lesson-row">${codeEditor(s, { highlight: frames[0].highlight ?? s.highlight, footer: "LEIA · PREVEJA · REVELE" })}<aside class="lesson-aside">${lessonPanels(frames, true)}${lessonSummary(frames)}${lessonControls(frames)}</aside></div></div>${src(s)}${add(s, ctx)}`;
  },

  spotlight(s, ctx) {
    const spots = lessonSteps(s.hotspots, { title: "Olhe mais de perto", text: "Adicione regiões para guiar o olhar da audiência.", x: 20, y: 20, width: 60, height: 60 });
    const regions = spots.map((p, i) => {
      const point = p.kind === "point";
      const x = percent(p.x, 10, 0, point ? 100 : 96), y = percent(p.y, 10, 0, point ? 100 : 96);
      const w = percent(p.width, 28, 4, 100 - x), h = percent(p.height, 24, 4, 100 - y);
      // zoom lento no foco (opcional): o do foco vence o do slide; false = imagem inteira neste foco
      const zoomOf = (z) => (z === true ? 1.8 : Number.isFinite(Number(z)) && Number(z) > 1 ? Math.min(4, Number(z)) : z === false ? 1 : null);
      const zoom = zoomOf(p.zoom) ?? zoomOf(s.zoom) ?? 1;
      return `<button type="button" class="spotlight-region${point ? " spotlight-point" : ""}${i === 0 ? " active" : ""}" data-lesson-go="${i}" data-spotlight-region="${i}"${zoom > 1 ? ` data-zoom="${zoom}"` : ""} aria-label="Detalhe ${i + 1}: ${esc(p.title || "Explicação")}" aria-current="${i === 0 ? "step" : "false"}" style="left:${x}%;top:${y}%;${point ? "" : `width:${w}%;height:${h}%`}"><span>${i + 1}</span></button>`;
    }).join("");
    const visual = s.figure || (s.image ? { image: s.image, alt: s.caption || s.title || "Imagem em análise", fit: "contain" } : { diagram: "flow", steps: ["Entrada", "Processamento", "Resultado"] });
    return `<div class="L-spotlight" data-lesson="spotlight" data-lesson-count="${spots.length}">${head(s)}<div class="lesson-row"><div class="spotlight-visual"><div class="spotlight-canvas"><div class="spotlight-zoom"><div class="spotlight-image">${el(visual, ctx, 1100, 660)}</div><div class="spotlight-regions">${regions}</div></div></div>${s.caption ? text(s.caption, "small", { class: "spotlight-caption", size: 24 }) : ""}</div><aside class="lesson-aside">${lessonPanels(spots)}${lessonSummary(spots)}${lessonControls(spots)}</aside></div></div>${src(s)}${add(s, ctx)}`;
  },

  kinetic(s, ctx) {
    const beats = Array.isArray(s.beats) && s.beats.length
      ? s.beats.map((beat) => typeof beat === "string" ? { text: beat } : beat || {})
      : [
          ...kineticPhrases(s.title || s.text),
          ...kineticPhrases(s.subtitle),
        ].map((text, i) => ({
          text, style: "clean", position: "left", size: "medium",
          ...(i === 0 && s.kicker ? { tag: s.kicker } : {}),
        }));
    if (!beats.length) beats.push({ text: "Uma ideia em movimento", style: "clean", position: "left", color: "white", size: "large" });
    const frames = beats.map((beat, i) => {
      const style = ["clean", "poster", "editorial", "outline", "marker"].includes(beat.style) ? beat.style : "clean";
      const position = ["left", "center", "right", "top", "bottom"].includes(beat.position) ? beat.position : "left";
      const color = ["white", "gold", "pink", "cyan"].includes(beat.color) ? beat.color : "white";
      const size = ["small", "medium", "large"].includes(beat.size) ? beat.size : "medium";
      return `<article class="kinetic-frame${i === 0 ? " active" : ""}" data-lesson-panel="${i}" data-position="${position}" data-style="${style}" data-color="${color}" data-size="${size}" aria-hidden="${i !== 0}">
        <div class="kinetic-word" data-fit>${md(beat.text || "")}</div>
        ${beat.tag ? `<div class="kinetic-tag">${md(beat.tag)}</div>` : ""}
      </article>`;
    }).join("");
    const scene = s.figure ? el(s.figure, ctx, 1920, slideSize(ctx.spec).h) : "";
    const interval = Math.max(450, Math.min(5000, Number(s.interval) || 1000));
    const autoplay = s.autoplay !== false && beats.length > 1;
    const summary = `<div class="kinetic-summary" aria-label="Frases da sequência">${beats.map((beat) => `<span>${md(beat.text || "")}</span>`).join("")}</div>`;
    return `<div class="L-kinetic" data-lesson="kinetic" data-lesson-count="${beats.length}" data-kinetic-interval="${interval}" data-kinetic-autoplay="${autoplay}">
      <div class="kinetic-scene" aria-hidden="true">${scene}</div><div class="kinetic-shade" aria-hidden="true"></div>
      <div class="kinetic-grain" aria-hidden="true"></div>
      <div class="kinetic-sequence" aria-live="polite" aria-atomic="true">${frames}</div>
      <div class="kinetic-controls"><button type="button" class="kinetic-toggle" data-kinetic-toggle aria-pressed="${autoplay}" aria-label="${autoplay ? "Pausar" : "Reproduzir"} sequência"${beats.length < 2 ? " disabled" : ""}>${autoplay ? "Pausar" : "Reproduzir"}</button>
        <nav class="kinetic-dots" aria-label="Frases da sequência">${beats.map((beat, i) => `<button type="button" data-lesson-go="${i}" aria-label="Frase ${i + 1}: ${esc(beat.text || "")}" aria-current="${i === 0 ? "step" : "false"}">${String(i + 1).padStart(2, "0")}</button>`).join("")}</nav>
        <button type="button" class="kinetic-next" data-lesson-next aria-label="Próxima frase">${iconSVG("arrow-right", { size: 26, stroke: 2 })}</button>
      </div>${summary}
    </div>${add(s, ctx)}`;
  },

  blocks(s, ctx) {
    return `<div class="L-blocks">${head(s, s.titleAs || "h2")}<div class="bl-body">${el(s.content || [], ctx)}</div></div>${src(s)}${add(s, ctx)}`;
  },

  end(s, ctx) {
    return `<div class="L-end"><div class="en-main">${kicker(s)}${text(s.title || "Obrigado.", "hero", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}
      ${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:2;" }) : ""}
      ${s.contacts ? `<div class="en-contacts e" style="--d:3">${s.contacts.map((c) => text(c, "h3", { size: 38 })).join("")}</div>` : ""}</div>
      ${s.figure ? `<div class="en-fig e" style="--d:2">${el(s.figure, ctx, 640, 700)}</div>` : ""}
      ${s.qr ? `<div class="en-fig e" style="--d:3">${el(typeof s.qr === "object" ? { size: 420, ...s.qr } : { qr: s.qr, size: 420, label: s.qrLabel }, ctx)}</div>` : ""}</div>${add(s, ctx)}`;
  },

  references(s, ctx) {
    const items = s.items || [];
    return `<div class="L-refs">${head(s, "h3")}<div class="rf-cols">${items.map((r) => `<div class="rf t f-body">${md(r)}</div>`).join("")}</div></div>${add(s, ctx)}`;
  },

  video(s, ctx) {
    return `<div class="L-video">${head(s)}<div class="vd-row">${el({ video: s.url, label: s.label, class: "e", style: "--d:2;" }, ctx)}${s.figure ? `<div class="vd-fig">${el(s.figure, ctx, 600, 560)}</div>` : ""}</div>${s.caption ? text(s.caption, "body", { class: "muted" }) : ""}</div>${add(s, ctx)}`;
  },

  // Página inteira: uma figura (imagem, imagem gerada pela IA, SVG, HTML, gráfico…) ocupa o slide todo;
  // texto opcional por cima, com um véu para garantir leitura. overlay: bottom | left | center | none
  full(s, ctx) {
    const f = s.figure ?? (s.image || s.image_prompt ? { image: s.image, image_prompt: s.image_prompt } : null);
    const fig = f == null ? "" : typeof f === "object" ? { fit: s.fit || "cover", ...f } : { image: f, fit: s.fit || "cover" };
    const hasText = s.title || s.caption || s.kicker;
    const pos = s.overlay || (hasText ? "bottom" : "none");
    // figura desenhada (gráfico, ícone, diagrama) com texto à esquerda: vai para a direita em vez de ficar por baixo do texto
    const drawn = fig && !(fig.image || fig.image_prompt || fig.video);
    return `<div class="L-full${drawn && pos === "left" ? " fl-shift" : ""}">${fig ? `<div class="fl-fig">${el(fig, ctx, 1920, slideSize(ctx.spec).h)}</div>` : ""}
      ${hasText && pos !== "none" ? `<div class="fl-over fl-${pos}"><div class="fl-txt">${kicker(s)}${s.title ? text(s.title, "h2", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize }) : ""}${s.caption ? text(s.caption, "lead", { class: "e", style: "--d:2;" }) : ""}</div></div>` : ""}</div>`;
  },

  // Manchete: uma frase enorme que ocupa o slide (encolhe para caber)
  headline(s, ctx) {
    return `<div class="L-headline">${kicker(s)}${text(s.text || s.title, s.as || "hero", { class: "hl-text e", style: "--d:1;", fit: true, size: s.size || 300 })}
      ${s.caption ? text(s.caption, "lead", { class: "hl-cap muted e", style: "--d:2;" }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  // Funil: etapas que afunilam (largura decrescente), com valor e texto ao lado
  funnel(s, ctx) {
    const st = s.stages || s.items || [];
    const n = Math.max(1, st.length);
    const rows = st.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const w = 100 - i * (48 / Math.max(1, n - 1));
      const mix = 100 - i * (40 / Math.max(1, n - 1));
      return `<div${attrs({ step: o.step ?? build(s, i) }, `fn-row ${o.hl ? "hl" : ""}`)}>
        <div class="fn-barwrap"><div class="fn-bar" style="width:${w.toFixed(1)}%;--mix:${mix.toFixed(0)}%">${o.value != null ? `<span class="fn-val t f-display">${md(String(o.value))}</span>` : ""}<span class="fn-title t f-heading">${md(o.title || "")}</span></div></div>
        ${o.text ? `<div class="fn-text t f-body">${md(o.text)}</div>` : "<div></div>"}</div>`;
    }).join("");
    return `<div class="L-funnel">${head(s)}<div class="fn">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Pirâmide: níveis do topo (estreito) para a base (larga)
  pyramid(s, ctx) {
    const lv = s.levels || s.items || [];
    const n = Math.max(1, lv.length);
    const rows = lv.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const w = 34 + i * (66 / Math.max(1, n - 1));
      return `<div${attrs({ step: o.step ?? build(s, i) }, `py-row ${o.hl ? "hl" : ""}`)}>
        <div class="py-barwrap"><div class="py-bar" style="width:${w.toFixed(1)}%"><span class="t f-heading">${md(o.title || "")}</span></div></div>
        ${o.text ? `<div class="py-text t f-body">${md(o.text)}</div>` : "<div></div>"}</div>`;
    }).join("");
    return `<div class="L-pyramid">${head(s)}<div class="py">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Agenda: seções numeradas; current = número da seção em que estamos (as anteriores ficam "feitas")
  agenda(s, ctx) {
    const it = s.items || [];
    const cur = Number(s.current) || 0;
    const rows = it.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const state = cur ? (i + 1 === cur ? "cur" : i + 1 < cur ? "done" : "") : "";
      return `<div${attrs({ step: o.step ?? build(s, i) }, `ag-row ${state}`)}><span class="ag-n t f-display">${String(i + 1).padStart(2, "0")}</span>
        <div class="ag-txt">${text(o.title || "", "h3", { class: "ag-title" })}${o.text ? text(o.text, "body", { class: "ag-sub muted" }) : ""}</div>${o.time ? `<span class="ag-time t f-label">${md(o.time)}</span>` : ""}</div>`;
    }).join("");
    return `<div class="L-agenda">${head(s)}<div class="ag">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Mosaico (bento): blocos de tamanhos diferentes. size: big (2×2) | wide (2×1) | tall (1×2) | normal
  bento(s, ctx) {
    const tiles = s.tiles || s.items || [];
    const anySize = tiles.some((t) => t && typeof t === "object" && t.size);
    const body = tiles.map((x, i) => {
      const t = typeof x === "string" ? { title: x } : x;
      const size = t.size || (!anySize && i === 0 ? "big" : "");
      const fig = t.figure ? el(t.figure, ctx, 700, 500) : t.icon ? el({ icon: t.icon, size: size === "big" ? 180 : 96 }, ctx) : "";
      return `<div${attrs({ step: t.step ?? build(s, i) }, `bt-tile ${size ? "bt-" + size : ""} ${t.hl ? "hl" : ""}`)}>
        ${fig ? `<div class="bt-fig">${fig}</div>` : ""}${t.value != null ? `<div class="bt-val t f-display">${md(String(t.value))}</div>` : ""}
        ${t.title ? text(t.title, size === "big" ? "h2" : "h3", { class: "bt-title" }) : ""}${t.text ? text(t.text, "body", { class: "bt-text" }) : ""}</div>`;
    }).join("");
    return `<div class="L-bento">${head(s)}<div class="bt" style="--cols:${s.cols || 4}">${body}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Requisição ao vivo (tipo Postman): URL, corpo e código (curl/Python) editáveis; "Executar" roda o
  // pedido pelo Studio (síncrono, polling ou streaming) e mostra a resposta. Sem o Studio (HTML exportado,
  // servidor multiusuário), mostra a última resposta gravada. Ver src/runtime/api-ui.js e src/api-client.js.
  api(s, ctx) {
    const A = globalThis.SagadeckApiCore;
    const a = A.normalize(s);
    const cfg = { ...a, key: A.key(s), title: s.title || "" };
    const MODE = { sync: "Síncrono", polling: "Polling", stream: "Streaming", realtime: "Tempo real · WebSocket" };
    const rt = a.realtime;
    const bodyTxt = rt ? JSON.stringify(rt.open, null, 2) : a.request.form ? Object.entries(a.request.form).map(([k, v]) => `${k}: ${v === "@file" ? "@" + (a.file ? String(a.file).split(/[\\/]/).pop() : "arquivo") : v}`).join("\n")
      : a.request.body == null ? "" : typeof a.request.body === "string" ? a.request.body : JSON.stringify(a.request.body, null, 2);
    const hdrTxt = Object.entries(a.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
    const LBL = (c) => (rt && c === "curl" ? "wscat" : A.LANGS[c]);
    const tabs = rt ? [["body", "Ao conectar"], ["log", "Mensagens"], ...a.code.filter((c) => A.LANGS[c]).map((c) => [c, LBL(c)])] : [...(a.similarity ? [["texts", "Frases"]] : []), ["body", "Corpo"], ...(a.fields ? [["fields", "Parâmetros"]] : []), ["headers", "Cabeçalhos"], ...a.code.filter((c) => A.LANGS[c]).map((c) => [c, A.LANGS[c]])];
    const first = tabs.some(([k]) => k === s.tab) ? s.tab : a.similarity ? "texts" : "body";
    const fieldsPane = a.fields ? `<div class="api-fields" data-pane="fields"${first === "fields" ? "" : " hidden"}><table><thead><tr><th>Campo</th><th>Valor</th><th>O que faz</th></tr></thead><tbody>${Object.entries(a.fields).map(([k, why]) => { const v = A.get(a.request.body, k); return `<tr data-field="${esc(k)}"><td class="f-mono">${esc(k.replace(/^\$\.?/, ""))}</td><td class="f-mono api-fv">${v === undefined ? "—" : esc(JSON.stringify(v))}</td><td>${esc(why)}</td></tr>`; }).join("")}</tbody></table></div>` : "";
    const textsPane = a.similarity ? `<div class="api-texts" data-pane="texts"${first === "texts" ? "" : " hidden"}><label class="f-label">Frase de referência</label><input class="api-edit-line" data-api-ref value="${esc(a.similarity.reference)}" spellcheck="false"><label class="f-label">Compare com (uma por linha)</label><textarea class="api-edit f-mono" data-api-texts spellcheck="false">${esc(a.similarity.texts.join("\n"))}</textarea></div>` : "";
    const codePane = (lang) => {
      const { code: txt, comments } = A.code(a, lang, {});
      const cm = new Set(comments);
      return `<div class="api-code f-mono" data-pane="${lang}"${first === lang ? "" : " hidden"}>${txt.split("\n").map((l, i) => `<div class="cl${cm.has(i + 1) ? " cm" : ""}" data-ln="${i + 1}"><span class="cn">${i + 1}</span><span class="cc">${esc(l) || " "}</span></div>`).join("")}</div>`;
    };
    const ICON = {
      vars: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      run: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
      out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      pip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12" y="11" width="7" height="6" rx="1"/></svg>',
      clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    const fileZone = A.usesFile(a) ? `<div class="api-file" data-api-file>${ICON.clip}<span class="api-file-name">${esc(a.file ? String(a.file).split(/[\\/]/).pop() : "nenhum arquivo")}</span><span class="api-file-hint">arraste um arquivo aqui</span>${a.mic ? '<button type="button" class="api-mic" data-api-mic><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Gravar</span></button><canvas class="api-level" width="160" height="36" hidden></canvas>' : ""}<button type="button" data-api-pick>Trocar arquivo</button><input type="file" hidden data-api-input></div>` : "";
    return `<div class="L-api" data-api="${esc(JSON.stringify(cfg))}">${head(s)}
      <div class="api-bar">
        <button type="button" class="api-env" data-api-env title="Ambiente (clique para trocar)"><span class="api-env-dot"></span><span class="api-env-name">sem Studio</span></button>
        <button type="button" class="api-vars" data-api-vars title="Variáveis: o que está valendo agora (ambiente, token e o que os slides guardaram)">${ICON.vars}<span>Variáveis</span></button>
        <span class="api-mode f-label">${MODE[a.mode]}</span>
        ${s.text ? text(s.text, "small", { class: "api-text", size: 26 }) : ""}
        <span class="api-spacer"></span>
        <button type="button" class="api-pip" data-api-pip title="Controle flutuante: fica por cima de qualquer janela (ex.: o portal em tela cheia)">${ICON.pip}<span>Controle flutuante</span></button>
        ${a.portal ? `<a class="api-portal" href="${esc(a.portal)}" target="_blank" rel="noopener">Abrir no portal${ICON.out}</a>` : ""}
        <button type="button" class="api-run" data-api-run>${ICON.run}<span>${rt ? "Conectar" : "Executar"}</span></button>
      </div>
      <div class="api-row">
        <section class="api-req" aria-label="Requisição">
          <div class="api-line"><span class="api-method m-${rt ? "WS" : esc(a.request.method)}">${rt ? "WS" : esc(a.request.method)}</span><input class="api-url f-mono" data-api-url value="${esc(rt ? rt.url : a.request.url)}" spellcheck="false" aria-label="Endereço"></div>
          <div class="api-resolved f-mono" data-api-resolved></div>
          <div class="api-tabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === first}">${esc(label)}</button>`).join("")}</div>
          <div class="api-panes">
            ${textsPane}${fieldsPane}${rt ? `<div class="api-log f-mono" data-pane="log" hidden></div>` : ""}
            <textarea class="api-edit f-mono" data-pane="body" data-api-body spellcheck="false" aria-label="Corpo"${a.request.form ? " readonly title=\"Formulário (multipart): campo: valor\"" : ""}${first === "body" ? "" : " hidden"}>${esc(bodyTxt)}</textarea>
            <textarea class="api-edit f-mono" data-pane="headers" data-api-headers spellcheck="false" aria-label="Cabeçalhos" placeholder="Nome: valor"${first === "headers" ? "" : " hidden"}>${esc(hdrTxt)}</textarea>
            ${a.code.filter((c) => A.LANGS[c]).map(codePane).join("")}
          </div>
          ${fileZone}
          ${a.request.auth ? `<div class="api-auth f-label">Authorization: Bearer ••••  <span>token do ambiente, automático</span></div>` : ""}
        </section>
        <section class="api-res" aria-label="Resposta" aria-live="polite">
          <div class="api-status"><span class="api-hint">Clique em <b>${rt ? "Conectar" : "Executar"}</b></span></div>
          <div class="api-out"></div>
          ${rt ? `<div class="api-rt-ctl"><button type="button" class="api-mic" data-rt-mic disabled><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Falar</span></button><canvas class="api-level" width="160" height="36" hidden></canvas><input class="api-rt-text" data-rt-text placeholder="ou digite e aperte Enter" disabled><button type="button" data-rt-send disabled>Enviar</button></div>` : ""}
        </section>
      </div>
    </div>${src(s)}${add(s, ctx)}`;
  },

  // Posicionamento livre (x, y, w, h em px numa tela de 1920 × 1080)
  canvas(s, ctx) {
    // apresentação recriada (tema novo): o slide original que ficou nela não traz a moldura antiga do PowerPoint (faixas,
    // logos, número: o que se repete na mesma posição, src/master.js: recreatedFrame), que destoaria; o conteúdo fica
    const frame = s.original ? recreatedFrame(ctx?.spec) : null;
    return (s.elements || []).filter((e) => !(frame && frame(e))).map((e) => el({ ...e, x: e.x ?? 0, y: e.y ?? 0 }, ctx, e.w, e.h)).join("");
  },
  // Diagrama (Mermaid): fluxograma, sequência, estados, classes/UML, ER, jornada, mapa mental, linha do tempo, blocos.
  // Quem desenha é o navegador (runtime/diagram.js), com a paleta do slide. Ícones: ":nome-do-icone:" nos rótulos.
  diagram(s, ctx) {
    const icons = {};
    const known = diagramIconNames();
    // %%{init}%% no código trocaria o tema do Mermaid e fugiria da paleta: sai
    const code = String(s.mermaid || s.code || "").replace(/%%\{[\s\S]*?\}%%\s*/g, "").replace(/:([a-z][a-z0-9-]*[a-z0-9]):/g, (m, name) => {
      if (!known.has(name)) return m;
      try { icons[name] = iconSVG(name, { size: 40, stroke: 2 }); } catch { return m; }
      return `<i class=dgi-${name}></i>`; // sem aspas: não briga com as aspas do Mermaid
    });
    return `<div class="L-diagram${s.caption ? " has-caption" : ""}">${head(s)}<div class="dg-box e" style="--d:2;"${s.autoDirection === false ? " data-dg-auto=\"0\"" : ""} data-dg-icons="${esc(JSON.stringify(icons))}"><pre class="dg-src" hidden>${esc(code)}</pre></div>${s.caption ? text(s.caption, "small", { class: "dg-caption muted" }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  // Infográfico: arco, ramos, lados, trilhas ou metrô, para qualquer quantidade de itens (src/infographic.js)
  infographic(s, ctx) {
    return `<div class="L-infographic">${head(s)}${infographicHTML(s, ctx)}${s.caption ? text(s.caption, "small", { class: "ig-caption muted" }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  // dinâmicas ao vivo entre duas pessoas (src/dynamics): um quadro por clique
  duel(s, ctx) { return `${duelHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  terminals(s, ctx) { return `${terminalsHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  turns(s, ctx) { return `${turnsHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  carousel(s, ctx) { return `${carouselHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  // aula: exercício resolvido passo a passo, calculadora ao vivo, algoritmo animado (src/lessons.js)
  solution(s, ctx) { return `${solutionHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  calc(s, ctx) { return `${calcHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },
  algo(s, ctx) { return `${algoHTML(s, ctx, head)}${src(s)}${add(s, ctx)}`; },

  science(s, ctx) {
    return `<div class="L-science">${head(s)}<div class="science-body${s.plot === false ? ' equations-only' : !(s.equations || []).length ? ' plot-only' : ''}"><div class="science-equations">${mathHTML(s.equations || [])}</div>${s.plot === false ? '' : plotHTML(s.plot || {}, ctx)}</div>${s.caption ? text(s.caption,'small') : ''}</div>${add(s,ctx)}`;
  },
  scenography(s, ctx) {
    const scene = Object.hasOwn(SCENES, s.scene) ? s.scene : 'stage';
    const op = s.imageOpacity == null || s.imageOpacity === '' ? 0.85 : Math.max(0, Math.min(1, Number(s.imageOpacity) || 0));
    const props = SCENES[scene].props?.() || '';
    return `<div class="L-scenography raster scene-${scene}"><div class="scene-atmosphere"></div>${s.image ? `<div class="scene-image" style="opacity:${op}">${el({image:s.image},ctx,1920,slideSize(ctx.spec).h)}</div>` : ''}${props ? `<div class="scene-props" aria-hidden="true">${props}</div>` : ''}<div class="scene-architecture" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="scene-type"><div class="scene-eyebrow t f-label">${md(s.kicker || 'IDEIAS QUE OCUPAM ESPAÇO')}</div>${text(s.title || 'ALÉM DO\nÓBVIO','hero',{class:'scene-title',size:s.titleSize || SCENES[scene].size})}${s.subtitle ? text(s.subtitle,'lead',{class:'scene-subtitle'}) : ''}</div>${s.foreground ? `<div class="scene-foreground">${el({image:s.foreground,fit:'contain'},ctx,1920,1080)}</div>` : '<div class="scene-sculpture" aria-hidden="true"><i></i><b></b></div>'}<div class="scene-caption f-label">${esc(s.caption || 'SAGA / NOVAS PERSPECTIVAS')}</div></div>${add(s,ctx)}`;
  },
};
