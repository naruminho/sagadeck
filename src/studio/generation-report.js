import fs from 'node:fs';
import path from 'node:path';
import { mathWarning } from '../ai/math-check.js';

// Relatório da criação com IA (.sagadeck/avaliacao-geracao.json): revisão visual, variedade, números sem base no
// material, contas e figuras de fora. `avisado` diz se a pessoa já viu os avisos no chat (generationNotice).
const reportFile = (dir) => path.join(dir, '.sagadeck', 'avaliacao-geracao.json');

export function saveGenReport(dir, generation) {
  const reportDir = path.join(dir, '.sagadeck');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportFile(dir), JSON.stringify({
    createdAt: new Date().toISOString(), quality: generation.quality, variety: generation.variety,
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
