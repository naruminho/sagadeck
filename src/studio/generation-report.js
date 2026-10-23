import fs from 'node:fs';
import path from 'node:path';
import { mathWarning } from '../ai/math-check.js';
import { renameRetry } from '../fs-retry.js';

// Relatório da criação com IA (.sagadeck/avaliacao-geracao.json): revisão visual, variedade, números sem base no
// material, contas e figuras de fora. `avisado` diz se a pessoa já viu os avisos no chat (generationNotice).
const reportFile = (dir) => path.join(dir, '.sagadeck', 'avaliacao-geracao.json');

export function loadGenReport(dir) {
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(reportFile(dir), 'utf8')); } catch { return null; }
}

// grava inteiro (tmp + rename): o painel Conferência e o chat mexem no mesmo arquivo
export function writeGenReport(dir, report) {
  const file = reportFile(dir), tmp = `${file}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8');
  renameRetry(tmp, file);
}

// impressão digital de um slide (o que ele mostra, sem uid nem marcas do Studio): o aviso da revisão visual vale para
// o slide como ele era; mudou, o painel avisa que o aviso pode estar velho
export function slideMark(slide) {
  const s = JSON.stringify({ ...slide, uid: undefined, auto: undefined, review: undefined });
  let h = 5381; for (const c of s) h = ((h << 5) + h + c.codePointAt(0)) >>> 0;
  return h.toString(36);
}
// marcas por slide: pelo uid (sobrevive a inserir e apagar slides) e, sem uid, pela posição
export const slideMarks = (spec) => Object.fromEntries((spec?.slides || []).map((s, i) => [s?.uid || `#${i + 1}`, slideMark(s)]));

export function saveGenReport(dir, generation) {
  const reportDir = path.join(dir, '.sagadeck');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportFile(dir), JSON.stringify({
    createdAt: new Date().toISOString(), quality: generation.quality, variety: generation.variety,
    ...(generation.spec ? { slideMarks: slideMarks(generation.spec) } : {}),
    ...(generation.facts ? { facts: generation.facts } : {}), ...(generation.math ? { math: generation.math } : {}),
    ...(generation.coverage ? { coverage: generation.coverage } : {}), avisado: false,
  }, null, 2), 'utf8');
}

// Os avisos que a conferência automática deixou sem resolver, como texto para a pessoa
export function generationWarnings(report) {
  const out = [];
  const m = mathWarning(report?.math);
  if (m) out.push(m);
  const facts = report?.facts?.unsupported || [];
  if (facts.length) out.push(`Números sem base no material: ${facts.map((b) => `${b.number} (slide ${b.slide})`).join(', ')}`);
  const missing = report?.coverage?.missing || [];
  if (missing.length) out.push(`Figuras e tabelas do material sem slide: ${missing.join('; ')}`);
  const issues = report?.quality?.issues || [];
  for (const i of issues.slice(0, 12)) out.push(`Slide ${i.slide}: ${String(i.text).slice(0, 240)}`);
  if (issues.length > 12) out.push(`… e mais ${issues.length - 12} aviso(s) da revisão visual.`);
  return out;
}

// Na primeira vez que a apresentação abre depois da criação, os avisos viram uma mensagem do chat (uma vez só):
// antes eles ficavam só no arquivo, e ninguém via que a revisão tinha reclamado.
export function generationNotice(dir) {
  if (!dir) return null;
  let report;
  try { report = JSON.parse(fs.readFileSync(reportFile(dir), 'utf8')); } catch { return null; }
  if (report.avisado) return null;
  const warnings = generationWarnings(report);
  try { fs.writeFileSync(reportFile(dir), JSON.stringify({ ...report, avisado: true }, null, 2), 'utf8'); } catch { return null; }
  if (!warnings.length) return null;
  return `A conferência automática da criação desta apresentação deixou estes avisos sem resolver:\n${warnings.map((w) => `- ${w}`).join('\n')}\nPeça "corrija os avisos da criação" para eu tentar de novo, ou ajuste à mão.`;
}
