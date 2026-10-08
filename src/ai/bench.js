// Bancada de qualidade da geração a partir de documento (paper → apresentação). Dá nota a um deck gerado com as
// mesmas ferramentas de autocrítica da geração (cobertura de figuras, números sem base, revisão de texto) e com as
// medidas que antes só se viam abrindo deck por deck: recorte com legenda dentro, equação numerada sem LaTeX, autor
// errado, votação em deck acadêmico, idioma. Notas de 0 a 1 por quesito; o relatório compara com a rodada anterior.
import fs from 'node:fs';
import path from 'node:path';
import { uncoveredVisuals, unsupportedNumbers, equationGroups, equationLabel, groupTextLines, captionLineStart, creditLineStart } from './document-visuals.js';
import { auditText, votingSlide } from './quality.js';
import { guessDeckLang } from './deck-ai.js';

export const BENCH_CHECKS = [
  ['figuras', 'Figuras e tabelas numeradas do documento com slide'],
  ['recortes', 'Recortes de figura sem legenda nem "Fonte:" dentro'],
  ['equacoes', 'Equações numeradas do texto transcritas em LaTeX'],
  ['numeros', 'Números na tela que estão no documento'],
  ['autor', 'Autor do documento (não o das Preferências)'],
  ['votacao', 'Sem votação/enquete em deck acadêmico'],
  ['frases', 'Sem slide de uma frase gigante'],
  ['idioma', 'Idioma pedido'],
];

const items = (materials) => (materials || []).flatMap((m) => (m?.inventory?.items || []).map((it) => ({ ...it, doc: m.name })));
const ratio = (ok, total) => (total ? ok / total : null);

// Linha de legenda/crédito que caiu dentro do recorte: o meio da linha está dentro da caixa e ela cruza a caixa por
// mais da metade da própria largura (a legenda ao lado, numa coluna vizinha, não conta).
export function captionInsideCrop(box, textBoxes = []) {
  const [x, y, w, h] = box;
  for (const L of groupTextLines(textBoxes).values()) {
    if (!(captionLineStart(L.joined) || captionLineStart(L.flat) || creditLineStart(L.joined))) continue;
    const mid = (L.top + L.bottom) / 2, width = Math.max(1e-6, L.right - L.left);
    const across = Math.max(0, Math.min(L.right, x + w) - Math.max(L.left, x));
    if (mid > y && mid < y + h && across >= 0.5 * width) return L.joined.trim();
  }
  return null;
}

// layouts: { [nome do material]: pdfLayout(bytes) } (texto da página em 0..1000) para recortes e equações; sem ele,
// esses dois quesitos ficam sem nota (null) em vez de falsamente bons.
export function scoreDeck(spec, { materials = [], layouts = {}, briefing = '', expect = {} } = {}) {
  const slides = spec?.slides || [];
  const out = {};

  const numbered = uncoveredVisuals({ slides: [] }, materials);
  const missing = uncoveredVisuals(spec, materials);
  out.figuras = { score: ratio(numbered.length - missing.length, numbered.length), detail: `${numbered.length - missing.length}/${numbered.length}`, faltam: missing.map((m) => m.caption.slice(0, 80)) };

  const crops = items(materials).filter((it) => ['figure', 'chart'].includes(it.kind) && Array.isArray(it.box) && it.page && layouts[it.doc]);
  const leaked = crops.map((it) => ({ it, line: captionInsideCrop(it.box, layouts[it.doc][it.page - 1]?.text) })).filter((x) => x.line);
  out.recortes = { score: ratio(crops.length - leaked.length, crops.length), detail: `${crops.length - leaked.length}/${crops.length}`, comLegenda: leaked.map((x) => `p${x.it.page} ${String(x.it.caption).slice(0, 50)}: "${x.line.slice(0, 60)}"`) };

  let eqTotal = 0; const eqMissing = [];
  for (const m of materials || []) for (const [i, page] of (layouts[m.name] || []).entries()) {
    const done = new Set((m.inventory?.items || []).filter((it) => it.kind === 'equation' && it.page === i + 1 && String(it.latex || '').trim()).map(equationLabel).filter(Boolean));
    for (const g of equationGroups(page.text).filter((g) => g.num)) { eqTotal++; if (!done.has(g.num)) eqMissing.push(`p${i + 1} (${g.num})`); }
  }
  out.equacoes = { score: ratio(eqTotal - eqMissing.length, eqTotal), detail: `${eqTotal - eqMissing.length}/${eqTotal}`, faltam: eqMissing };

  const bad = unsupportedNumbers(spec, materials);
  out.numeros = { score: Math.max(0, 1 - bad.length / 5), detail: `${bad.length} sem base`, semBase: bad.map((b) => `slide ${b.slide}: ${b.number}`) };

  const author = String(spec?.author || '');
  const wrong = expect.notAuthor && author.toLowerCase().includes(String(expect.notAuthor).toLowerCase());
  const right = expect.author ? new RegExp(expect.author, 'i').test(author) : !!author.trim();
  out.autor = { score: !wrong && right ? 1 : 0, detail: author || '(sem autor)' };

  const votes = slides.map((s, i) => (votingSlide(s) ? i + 1 : 0)).filter(Boolean);
  out.votacao = { score: votes.length ? 0 : 1, detail: votes.length ? `slides ${votes.join(', ')}` : 'nenhuma' };

  const giant = auditText(spec, slides.map((_, i) => i), { briefing }).filter((x) => /frase única/.test(x.text));
  out.frases = { score: Math.max(0, 1 - giant.length / 3), detail: giant.length ? `slides ${giant.map((x) => x.slide).join(', ')}` : 'nenhum' };

  if (expect.lang) {
    const text = guessDeckLang(spec) || spec?.lang || 'pt';
    const field = String(spec?.lang || 'pt');
    const ok = text.startsWith(expect.lang) && field.startsWith(expect.lang);
    out.idioma = { score: ok ? 1 : 0, detail: `texto ${text}, lang ${spec?.lang || '(padrão pt)'}` };
  } else out.idioma = { score: null, detail: 'não pedido' };

  const scored = Object.values(out).map((c) => c.score).filter((v) => v != null);
  return { checks: out, total: scored.length ? Math.round(100 * scored.reduce((a, b) => a + b, 0) / scored.length) : null, slides: slides.length };
}

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}`);
const delta = (a, b) => (a == null || b == null ? '' : a === b ? ' (=)' : ` (${a > b ? '+' : ''}${a - b})`);

// Relatório em Markdown: um quadro com a nota de cada caso por quesito, a nota total e a diferença para a rodada
// anterior; depois, por caso, o que puxou a nota para baixo (para saber onde mexer).
export function benchMarkdown(report, previous = null) {
  const prev = Object.fromEntries((previous?.cases || []).map((c) => [c.id, c]));
  const lines = [
    `# Bancada de qualidade: ${report.date}`, '',
    `sagadeck ${report.version}${report.commit ? ` (${report.commit})` : ''} · modelo ${report.model}${previous ? ` · comparado com ${previous.date} (${previous.version}${previous.commit ? `, ${previous.commit}` : ''})` : ''}`, '',
    `| caso | ${BENCH_CHECKS.map(([k]) => k).join(' | ')} | total |`,
    `|---|${BENCH_CHECKS.map(() => '---:').join('|')}|---:|`,
  ];
  for (const c of report.cases) {
    if (c.error) { lines.push(`| ${c.id} | ${BENCH_CHECKS.map(() => '').join(' | ')} | erro |`); continue; }
    const p = prev[c.id];
    lines.push(`| ${c.id} | ${BENCH_CHECKS.map(([k]) => pct(c.checks[k]?.score) + (p?.checks?.[k] ? delta(c.checks[k]?.score == null ? null : Math.round(c.checks[k].score * 100), p.checks[k].score == null ? null : Math.round(p.checks[k].score * 100)) : '')).join(' | ')} | **${c.total ?? '—'}**${delta(c.total, p?.total)} |`);
  }
  const totals = report.cases.map((c) => c.total).filter((v) => v != null);
  // média de outros casos não é comparável: só compara quando a rodada anterior rodou os mesmos casos
  const ids = (r) => (r?.cases || []).map((c) => c.id).sort().join(',');
  const media = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  if (media != null) lines.push('', `Média: **${media}**${previous?.media != null && ids(previous) === ids(report) ? delta(media, previous.media) : ''}`);
  for (const c of report.cases) {
    lines.push('', `## ${c.id}`, '', `${c.file} · ${c.slides ?? 0} slides · ${c.seconds ?? '?'} s`);
    if (c.error) { lines.push('', `Erro: ${c.error}`); continue; }
    for (const [k, label] of BENCH_CHECKS) {
      const x = c.checks[k]; if (!x) continue;
      const notes = [...(x.faltam || []), ...(x.comLegenda || []), ...(x.semBase || [])];
      lines.push(`- ${label}: ${pct(x.score)} (${x.detail})${notes.length ? `: ${notes.slice(0, 8).join('; ')}${notes.length > 8 ? '…' : ''}` : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}

// Grava <data>-<versão>.json e .md na pasta dos relatórios e devolve o anterior (o .json mais novo que já estava lá).
export function saveBenchReport(dir, report) {
  fs.mkdirSync(dir, { recursive: true });
  const older = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  let previous = null;
  try { if (older.length) previous = JSON.parse(fs.readFileSync(path.join(dir, older.at(-1)), 'utf8')); } catch { /* relatório quebrado não impede o novo */ }
  const totals = report.cases.map((c) => c.total).filter((v) => v != null);
  const full = { ...report, media: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null };
  const base = `${report.date.replace(/[:]/g, '-').replace(/\..*$/, '')}-${report.version}`;
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(full, null, 1));
  const md = benchMarkdown(full, previous);
  fs.writeFileSync(path.join(dir, `${base}.md`), md);
  return { json: path.join(dir, `${base}.json`), md: path.join(dir, `${base}.md`), markdown: md, previous };
}
